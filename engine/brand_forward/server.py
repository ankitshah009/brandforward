"""Local HTTP API. Binds to 127.0.0.1:8787. Raw media is served to loopback only."""

from __future__ import annotations

import json
import logging
import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, ConfigDict

from brand_forward import NODE_ID, __version__, llm, pipeline
from brand_forward.catalog import repo_root
from brand_forward.errors import (
    JobNotFound,
    MediaError,
    NotFound,
    ProposalNotFound,
    ProxyLeakage,
    ReceiptNotFound,
    RenderBlocked,
    UnknownFixture,
)
from brand_forward.nodes import list_nodes
from brand_forward.receipt import Signer
from brand_forward.store import JobStore, public_view

log = logging.getLogger("brand_forward.server")


class CreateJob(BaseModel):
    title: Optional[str] = None
    fixture_id: Optional[str] = None
    model_config = ConfigDict(extra="ignore")


class ResearchBody(BaseModel):
    link: Optional[Literal["up", "down"]] = None
    offline: bool = False
    provider: Literal["scripted", "live"] = "scripted"
    revise: Optional[str] = None
    model_config = ConfigDict(extra="ignore")

    @property
    def link_up(self) -> bool:
        if self.link is not None:
            return self.link == "up"
        return not self.offline


class ProposalBody(BaseModel):
    proposal_id: str
    model_config = ConfigDict(extra="ignore")


@dataclass
class Engine:
    store: JobStore
    signer: Signer
    infra_path: Path


def default_data_dir() -> Path:
    override = os.environ.get("BRAND_FORWARD_DATA")
    if override:
        return Path(override)
    return Path(__file__).resolve().parents[1] / "data"


def load_env_file() -> None:
    """Read KEY=VALUE lines from the repo's .env.local without overriding the environment."""
    path = repo_root() / ".env.local"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip().removeprefix("export ").strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _run(fn):
    try:
        return fn()
    except JobNotFound as exc:
        raise HTTPException(status_code=404, detail="job not found") from exc
    except UnknownFixture as exc:
        raise HTTPException(status_code=404, detail="unknown fixture") from exc
    except ProposalNotFound as exc:
        raise HTTPException(status_code=404, detail="proposal not found") from exc
    except ReceiptNotFound as exc:
        raise HTTPException(status_code=404, detail="no receipt") from exc
    except NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RenderBlocked as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ProxyLeakage as exc:
        log.error("proxy export blocked: %s", exc.problems)
        raise HTTPException(
            status_code=500,
            detail="proxy export blocked by the leakage guard: {0}".format(", ".join(exc.problems[:8])),
        ) from exc
    except MediaError as exc:
        raise HTTPException(status_code=500, detail="local media step failed: {0}".format(exc)) from exc


def _json(payload: object, headers: Optional[dict] = None) -> Response:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return Response(content=body, media_type="application/json", headers=headers or {})


def create_app(data_dir: Optional[Path] = None, infra_path: Optional[Path] = None) -> FastAPI:
    if not os.environ.get("BRAND_FORWARD_NO_DOTENV"):
        load_env_file()
    root = Path(data_dir) if data_dir is not None else default_data_dir()
    root.mkdir(parents=True, exist_ok=True)
    app = FastAPI(
        title="BrandForward Engine",
        version=__version__,
        description="Local pre-publishability pipeline. Raw frames stay on the workstation; the proxy is the only document that may leave.",
    )
    app.state.engine = Engine(
        store=JobStore(root),
        signer=Signer.load(root),
        infra_path=Path(infra_path) if infra_path is not None else repo_root() / "infra" / "nodes.json",
    )

    def engine(request: Request) -> Engine:
        return request.app.state.engine

    @app.get("/health")
    def health(request: Request) -> dict:
        return {"ok": True, "node": NODE_ID, "version": __version__, "public_key": engine(request).signer.public_b64}

    @app.get("/nodes")
    def nodes(request: Request) -> dict:
        return list_nodes(engine(request).infra_path)

    @app.post("/jobs", status_code=201)
    def post_job(payload: CreateJob, request: Request) -> dict:
        store = engine(request).store
        return _run(lambda: public_view(pipeline.create_job(store, title=payload.title, fixture_id=payload.fixture_id)))

    @app.get("/jobs")
    def get_jobs(request: Request) -> dict:
        jobs = engine(request).store.list_jobs()
        return {
            "jobs": [
                {
                    "id": job["id"],
                    "title": job.get("title"),
                    "fixture_id": job.get("fixture_id"),
                    "status": job.get("status"),
                    "created_at": job.get("created_at"),
                }
                for job in jobs
            ]
        }

    @app.get("/jobs/{job_id}")
    def get_job(job_id: str, request: Request) -> dict:
        store = engine(request).store
        return _run(lambda: public_view(store.load(job_id)))

    @app.get("/jobs/{job_id}/events")
    def get_events(job_id: str, request: Request) -> dict:
        store = engine(request).store
        return _run(lambda: {"job_id": job_id, "events": public_view(store.load(job_id)["events"])})

    @app.get("/jobs/{job_id}/proxy")
    def get_proxy(job_id: str, request: Request):
        store = engine(request).store
        return _run(lambda: _json(store.load(job_id)["proxy"], {"X-BrandForward-Export": "metadata-proxy"}))

    @app.post("/jobs/{job_id}/research")
    def post_research(job_id: str, payload: ResearchBody, request: Request) -> dict:
        store = engine(request).store
        return _run(
            lambda: public_view(pipeline.research(
                    store, job_id, link_up=payload.link_up, provider=payload.provider, revise=payload.revise
                ))
        )

    @app.get("/jobs/{job_id}/egress/{seq}")
    def get_egress(job_id: str, seq: int, request: Request):
        store = engine(request).store
        return _run(
            lambda: Response(
                content=pipeline.egress_payload(store, job_id, seq),
                media_type="application/json",
                headers={"X-BrandForward-Export": "egress-payload"},
            )
        )

    @app.post("/jobs/{job_id}/verify")
    def post_verify(job_id: str, payload: ProposalBody, request: Request) -> dict:
        store = engine(request).store
        return _run(lambda: pipeline.verify(store, job_id, payload.proposal_id))

    @app.post("/jobs/{job_id}/receipt")
    def post_receipt(job_id: str, payload: ProposalBody, request: Request) -> dict:
        e = engine(request)
        return _run(lambda: pipeline.issue_receipt(e.store, e.signer, job_id, payload.proposal_id))

    @app.get("/jobs/{job_id}/receipt/verify")
    def get_receipt_verify(job_id: str, request: Request) -> dict:
        e = engine(request)
        return _run(lambda: pipeline.verify_stored_receipts(e.store, e.signer, job_id))

    @app.post("/receipts/verify")
    async def post_receipts_verify(request: Request) -> dict:
        try:
            document = await request.json()
        except ValueError:
            document = None
        return pipeline.check_receipt(engine(request).signer, document)

    @app.post("/jobs/{job_id}/render")
    def post_render(job_id: str, payload: ProposalBody, request: Request) -> dict:
        e = engine(request)
        return _run(lambda: pipeline.render(e.store, e.signer, job_id, payload.proposal_id))

    @app.get("/jobs/{job_id}/frames/{index}.jpg")
    def get_frame(job_id: str, index: int, request: Request, w: int = 640):
        store = engine(request).store
        path = _run(lambda: pipeline.frame_jpeg(store, job_id, index, w))
        return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=86400"})

    @app.get("/jobs/{job_id}/media/{name}")
    def get_media(job_id: str, name: str, request: Request):
        store = engine(request).store
        path = _run(lambda: pipeline.media_file(store, job_id, name))
        return FileResponse(path, media_type="video/mp4", headers={"Cache-Control": "no-store"})

    return app


def main() -> None:
    load_env_file()
    model = None if os.environ.get("BRAND_FORWARD_LOCAL") == "rule" else llm.local_model()
    if model:
        threading.Thread(target=llm.warm, args=(model,), daemon=True).start()
    host = os.environ.get("BRAND_FORWARD_HOST", "127.0.0.1")
    port = int(os.environ.get("BRAND_FORWARD_PORT", "8787"))
    uvicorn.run(create_app(), host=host, port=port)


if __name__ == "__main__":
    main()
