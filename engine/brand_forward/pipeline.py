"""Job pipeline. HTTP routes and MCP tools call these functions for stage work."""

from __future__ import annotations

import os
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import NoReturn, Optional

from brand_forward import DEFAULT_FIXTURE_ID, NODE_ID, cloud, llm, scene, tools
from brand_forward.canonical import canonicalize, sha256_canonical
from brand_forward.catalog import load_fixture
from brand_forward.errors import (
    MediaError,
    NotFound,
    PlanInvalid,
    ProposalNotFound,
    ReceiptNotFound,
    RenderBlocked,
)
from brand_forward.media import extract_jpeg, ffmpeg_version, generate_master, render_plan, sha256_file
from brand_forward.planner import feedback, messages, normalize_plan, rule_plan, seal
from brand_forward.receipt import Signer, build_body, verify_receipt
from brand_forward.store import JobStore
from brand_forward.timecode import tc_ms

_PROPOSAL_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,80}$")
PROVIDERS = ("scripted", "live")


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _emit(job: dict, stage: str, status: str, mode: str, message: str, **extra) -> dict:
    event = {
        "seq": len(job["events"]) + 1,
        "stage": stage,
        "status": status,
        "mode": mode,
        "at": utc_now(),
        "message": message,
    }
    event.update({key: value for key, value in extra.items() if value is not None})
    job["events"].append(event)
    return event


def _upsert(items: list, item: dict, key: str) -> list:
    return [existing for existing in items if existing.get(key) != item.get(key)] + [item]


def _find_proposal(job: dict, proposal_id: str) -> dict:
    if not _PROPOSAL_ID.fullmatch(proposal_id or ""):
        raise ProposalNotFound("proposal not found")
    for proposal in job.get("proposals") or []:
        if proposal.get("id") == proposal_id:
            return proposal
    raise ProposalNotFound("proposal not found")


def _find_receipt(job: dict, proposal_id: str) -> Optional[dict]:
    for receipt in job.get("receipts") or []:
        body = receipt.get("body") if isinstance(receipt, dict) else None
        if isinstance(body, dict) and (body.get("opinion") or {}).get("proposal_id") == proposal_id:
            return receipt
    return None


def _allocate(store: JobStore) -> str:
    for _ in range(3):
        job_id = "job_{0}".format(uuid.uuid4().hex[:16])
        try:
            store.reserve(job_id)
        except FileExistsError:
            continue
        return job_id
    raise MediaError("could not allocate a job id")


def _kb(size: int) -> str:
    return "{0:.1f} KB".format(size / 1024.0)


# ---------------------------------------------------------------- ingest


def create_job(store: JobStore, *, title: Optional[str], fixture_id: Optional[str]) -> dict:
    """Generate the master, measure it, transcribe, and seal the proxy."""
    chosen_id = (fixture_id or "").strip() or DEFAULT_FIXTURE_ID
    fixture = load_fixture(chosen_id)
    job_id = _allocate(store)
    job_dir = store.job_dir(job_id)
    try:
        job = _run_ingest(job_id, job_dir, fixture, title)
        store.save(job)
    except Exception:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    return job


def _run_ingest(job_id: str, job_dir: Path, fixture: dict, title: Optional[str]) -> dict:
    fixture_id = str(fixture["id"])
    job = {
        "id": job_id,
        "title": (title or "").strip() or str(fixture["title"]),
        "fixture_id": fixture_id,
        "synopsis": str(fixture.get("synopsis") or ""),
        "status": "ready",
        "node_id": NODE_ID,
        "created_at": utc_now(),
        "events": [],
        "proposals": [],
        "verifications": [],
        "receipts": [],
        "renders": [],
        "egress": [],
    }
    master_path = job_dir / "master.mp4"
    command = generate_master(master_path)
    asset_sha = sha256_file(master_path)
    job["asset"] = {
        "asset_id": fixture_id,
        "sha256": asset_sha,
        "byte_length": master_path.stat().st_size,
        "duration_ms": scene.DURATION_MS,
        "width": scene.WIDTH,
        "height": scene.HEIGHT,
        "fps": scene.FPS,
        "container": "mp4",
        "origin": "generated-on-device",
        "ffmpeg": ffmpeg_version(),
        "command": command,
        "local_path": str(master_path),
    }
    _emit(
        job,
        "ingest",
        "completed",
        "ffmpeg",
        "Drew the {0}x{1} master on this machine with ffmpeg and hashed it. {2}. The camera original is not on this Mac.".format(
            scene.WIDTH, scene.HEIGHT, _kb(job["asset"]["byte_length"])
        ),
    )

    vision = tools.track_frames(master_path, job_dir / "work")
    job["vision"] = vision
    wordmark = next(track for track in vision["tracks"] if track["track_id"] == "wordmark")
    occluded = [span for span in wordmark["spans"] if not span["visible"]]
    if occluded:
        detail = "Wordmark covered {0}-{1}, peak {2:.1f}% of its pixels.".format(
            occluded[0]["start"], occluded[0]["end"], occluded[0]["peak_coverage_bp"] / 100.0
        )
    else:
        detail = "Wordmark visible in every frame."
    _emit(
        job,
        "vision",
        "completed",
        "measured",
        "Decoded and hashed {0} frames. Measured wordmark coverage per frame against the brand template. {1} "
        "Face and hull boxes come from the scene layout; SAM 3.1 replaces them on the P8.".format(
            vision["frame_count"], detail
        ),
    )

    speech = tools.transcribe(fixture_id)
    job["transcript"] = speech["transcript"]
    _emit(
        job,
        "transcribe",
        "completed",
        "fixture",
        "Transcript from the fixture ({0}). Whisper is not installed on this Mac.".format(", ".join(speech["languages"])),
    )

    proxy = tools.export_proxy(
        asset_id=fixture_id,
        asset_sha256=asset_sha,
        duration_ms=scene.DURATION_MS,
        vision=vision,
        transcript=speech["transcript"],
    )
    job["proxy"] = proxy
    size = len(canonicalize(proxy))
    job["proxy_bytes"] = size
    _emit(
        job,
        "proxy",
        "completed",
        "sealed",
        "Sealed the anonymized proxy: {0} against a {1} master. Track ids, spans, redaction flags, transcript, keyframe hashes. Leakage guard passed.".format(
            _kb(size), _kb(job["asset"]["byte_length"])
        ),
        bytes=size,
    )
    return job


# ---------------------------------------------------------------- planning


def _local_plan(proxy: dict, duration_ms: int, revision: Optional[dict] = None) -> tuple:
    """On-device planning: open weights when available, rule planner as last resort.

    Returns (normalized plan, provider, model, mode, note).
    """
    note = None
    if os.environ.get("BRAND_FORWARD_LOCAL", "auto") != "rule":
        model = llm.local_model()
        if model:
            try:
                content, latency = llm.ollama_plan(model, messages(proxy, revision))
                normalized = normalize_plan(content, duration_ms=duration_ms)
                return normalized, "ollama", model, "live", "{0} planned on device in {1:.1f} s.".format(
                    _short_model(model), latency / 1000.0
                )
            except (llm.LlmError, PlanInvalid) as exc:
                note = "{0} failed ({1}); the rule planner took over.".format(_short_model(model), exc)
        else:
            note = "No local open-weight model is loaded; the rule planner ran."
    normalized = normalize_plan(rule_plan(proxy), duration_ms=duration_ms)
    return normalized, "rule", "rule-planner.v1", "deterministic", note


def _short_model(name: str) -> str:
    lowered = name.lower()
    if "gemma-4-31b" in lowered:
        return "Gemma 4 31B"
    if "gemma-4-e4b" in lowered:
        return "Gemma 4 E4B"
    return name.split(":")[0]


def _next_id(job: dict, prefix: str) -> str:
    taken = {proposal["id"] for proposal in job.get("proposals") or []}
    index = 1
    while "{0}-{1}".format(prefix, index) in taken:
        index += 1
    return "{0}-{1}".format(prefix, index)


def research(
    store: JobStore,
    job_id: str,
    *,
    link_up: bool,
    provider: str = "scripted",
    revise: Optional[str] = None,
) -> dict:
    """Ask the cloud for an edit plan through the egress seam, failing over on device.

    With `revise`, the planner also receives the failed checks of that proposal
    (ids, intervals, numbers, reasons; never pixels) and returns a revision.
    """
    if provider not in PROVIDERS:
        provider = "scripted"
    job = store.load(job_id)
    proxy = job["proxy"]
    duration = int(proxy["duration_ms"])
    fixture = load_fixture(job["fixture_id"])

    revision = None
    if revise:
        previous = _find_proposal(job, revise)
        failed = feedback(tools.verify_proposal(previous, job["vision"]))
        if not failed:
            raise RenderBlocked("Nothing to revise: every check on that proposal already passes.")
        revision = {"previous": previous, "feedback": failed}

    want_cloud = revision is None or revision["previous"].get("source") == "cloud"
    record = None
    proposal = None
    failover_reason = None
    if want_cloud:
        seq = len(job.get("egress") or []) + 1
        egress = cloud.send(
            proxy,
            seq=seq,
            link_up=link_up,
            provider=provider,
            fixture=fixture,
            ledger_dir=store.job_dir(job_id) / "egress",
            revision=revision,
        )
        record = egress.record
        record["at"] = utc_now()
        record["kind"] = "revision" if revision else "plan"
        job["egress"] = (job.get("egress") or []) + [record]
        if egress.answer is not None:
            try:
                normalized = normalize_plan(egress.answer, duration_ms=duration)
                proposal = seal(
                    proposal_id=_next_id(job, "cloud"),
                    source="cloud",
                    provider=record["provider"],
                    model=record["model"],
                    mode="scripted" if record["provider"] == "scripted" else "live",
                    normalized=normalized,
                    proxy=proxy,
                )
            except PlanInvalid as exc:
                failover_reason = "Cloud answer broke the plan schema ({0}).".format(exc)
                record["status"] = "rejected"
                record["reason"] = str(exc)
        else:
            failover_reason = record.get("reason") or "Cloud unavailable."

    cloud_called = bool(record and record["transmitted"])
    if proposal is not None:
        route = "cloud"
        if proposal["mode"] == "scripted":
            verb = "Scripted cloud {0}".format("revision" if revision else "plan")
        else:
            verb = "{0} {1}".format(proposal["model"], "revised the plan" if revision else "answered")
        message = "{0}. The planner saw the proxy{1} only. This is an opinion, not a receipt.".format(
            verb, " and the failed checks" if revision else ""
        )
    else:
        route = "local" if not want_cloud else "local-failover"
        normalized, local_provider, model, mode, note = _local_plan(proxy, duration, revision)
        proposal = seal(
            proposal_id=_next_id(job, "local"),
            source="local" if not want_cloud else "local-failover",
            provider=local_provider,
            model=model,
            mode=mode,
            normalized=normalized,
            proxy=proxy,
        )
        if want_cloud:
            message = "{0} Failed over to on-device planning.".format(failover_reason)
        else:
            message = "Revised on device with the failed checks."
        if note:
            message = "{0} {1}".format(message, note)
    if revision:
        proposal["revises"] = revision["previous"]["id"]
    proposal["created_at"] = utc_now()
    _emit(
        job,
        "research",
        "completed",
        route,
        message,
        cloud_called=cloud_called,
        egress_seq=record["seq"] if record else None,
        proposal_id=proposal["id"],
    )
    job["proposals"] = _upsert(job["proposals"], proposal, "id")
    store.save(job)
    return {
        "job_id": job_id,
        "link_up": link_up,
        "offline": not link_up,
        "provider": provider,
        "cloud_called": cloud_called,
        "route": route,
        "egress": record,
        "proposal": proposal,
    }


def egress_payload(store: JobStore, job_id: str, seq: int) -> bytes:
    job = store.load(job_id)
    if not any(item.get("seq") == seq for item in job.get("egress") or []):
        raise NotFound("no such egress record")
    path = store.job_dir(job_id) / "egress" / "{0:03d}.json".format(seq)
    if not path.is_file():
        raise NotFound("no such egress record")
    return path.read_bytes()


# ---------------------------------------------------------------- verify and sign


def _proposal_for_hash(proposal: dict) -> dict:
    return {key: value for key, value in proposal.items() if key not in ("created_at", "revises")}


def verify(store: JobStore, job_id: str, proposal_id: str) -> dict:
    job = store.load(job_id)
    proposal = _find_proposal(job, proposal_id)
    report = tools.verify_proposal(proposal, job["vision"])
    stored = {"job_id": job_id, **report}
    job["verifications"] = _upsert(job.get("verifications") or [], stored, "proposal_id")
    failed = sum(1 for check in report["checks"] if not check["passed"])
    _emit(
        job,
        "verify",
        "completed",
        "measured",
        "{0}: {1} of {2} checks passed. {3}".format(
            report["verdict"].upper(), len(report["checks"]) - failed, len(report["checks"]), report["summary"]
        ),
        proposal_id=proposal_id,
        verdict=report["verdict"],
    )
    store.save(job)
    return stored


def issue_receipt(store: JobStore, signer: Signer, job_id: str, proposal_id: str) -> dict:
    job = store.load(job_id)
    proposal = _find_proposal(job, proposal_id)
    report = tools.verify_proposal(proposal, job["vision"])
    body = build_body(job=job, proposal=_proposal_for_hash(proposal), report=report)
    receipt = tools.sign_receipt(body, signer)
    job["verifications"] = _upsert(job.get("verifications") or [], {"job_id": job_id, **report}, "proposal_id")
    job["receipts"] = [
        item for item in job.get("receipts") or []
        if ((item.get("body") or {}).get("opinion") or {}).get("proposal_id") != proposal_id
    ] + [receipt]
    _emit(
        job,
        "receipt",
        "completed",
        "ed25519",
        "Signed receipt {0}: {1}.".format(receipt["receipt_id"], body["verdict"].upper()),
        proposal_id=proposal_id,
        verdict=body["verdict"],
    )
    store.save(job)
    return receipt


def verify_stored_receipts(store: JobStore, signer: Signer, job_id: str) -> dict:
    job = store.load(job_id)
    receipts = job.get("receipts") or []
    if not receipts:
        raise ReceiptNotFound("no receipt")
    results = []
    for item in receipts:
        body = item.get("body") if isinstance(item, dict) else {}
        body = body if isinstance(body, dict) else {}
        results.append(
            {
                "receipt_id": item.get("receipt_id") if isinstance(item, dict) else None,
                "proposal_id": (body.get("opinion") or {}).get("proposal_id"),
                "valid": verify_receipt(item, pinned_public_b64=signer.public_b64),
                "verdict": body.get("verdict"),
            }
        )
    valid = all(item["valid"] for item in results)
    return {"ok": valid, "valid": valid, "public_key": signer.public_b64, "receipts": results}


def check_receipt(signer: Signer, receipt: object) -> dict:
    """Verify any receipt document against this workstation's pinned key."""
    valid = isinstance(receipt, dict) and verify_receipt(receipt, pinned_public_b64=signer.public_b64)
    reason = "Signature verifies against the pinned workstation key."
    if not valid:
        reason = "Signature does not verify. The body, digest, or key was changed after signing."
    return {"valid": valid, "reason": reason, "public_key": signer.public_b64}


# ---------------------------------------------------------------- render


def _block(store: JobStore, job: dict, message: str) -> NoReturn:
    _emit(job, "render", "blocked", "gate", message)
    store.save(job)
    raise RenderBlocked(message)


def _plan_ms(plan: dict) -> dict:
    out = {"face_blur": bool(plan.get("face_blur"))}
    for key in ("wordmark_hold", "lower_third"):
        item = plan.get(key)
        if item:
            converted = {"start_ms": tc_ms(item["start"]), "end_ms": tc_ms(item["end"])}
            if "text" in item:
                converted["text"] = item["text"]
            out[key] = converted
    return out


def render(store: JobStore, signer: Signer, job_id: str, proposal_id: str) -> dict:
    """Render only after a verifiable clear receipt for this exact proposal and asset."""
    job = store.load(job_id)
    proposal = _find_proposal(job, proposal_id)
    receipt = _find_receipt(job, proposal_id)
    if receipt is None:
        _block(store, job, "Render blocked: no signed receipt covers this proposal.")
    if not verify_receipt(receipt, pinned_public_b64=signer.public_b64):
        _block(store, job, "Render blocked: the receipt signature does not verify.")
    body = receipt["body"]
    if body.get("verdict") != "clear":
        _block(store, job, "Render blocked: the receipt verdict is HOLD.")
    if body["opinion"].get("proposal_sha256") != sha256_canonical(_proposal_for_hash(proposal)):
        _block(store, job, "Render blocked: the proposal changed after it was signed.")
    master = Path(job["asset"]["local_path"])
    if sha256_file(master) != body["measured"].get("asset_sha256"):
        _block(store, job, "Render blocked: the master on disk does not match the signed hash.")
    report = tools.verify_proposal(proposal, job["vision"])
    if report["verdict"] != "clear":
        _block(store, job, "Render blocked: the frame cross-check no longer agrees with the receipt.")
    output, command = render_plan(master, store.job_dir(job_id) / "renders", plan=_plan_ms(proposal["plan"]))
    record = {
        "proposal_id": proposal_id,
        "receipt_id": receipt["receipt_id"],
        "renderer": "ffmpeg",
        "sha256": sha256_file(output),
        "bytes": output.stat().st_size,
        "output_name": output.name,
        "command": command,
        "at": utc_now(),
    }
    job["renders"] = _upsert(job.get("renders") or [], record, "proposal_id")
    job["status"] = "rendered"
    _emit(
        job,
        "render",
        "completed",
        "ffmpeg",
        "Rendered the cleared plan on device: face blur, lower third, logo hold. {0}, sha256 {1}.".format(
            _kb(record["bytes"]), record["sha256"][:12]
        ),
        proposal_id=proposal_id,
    )
    store.save(job)
    return {"job_id": job_id, "verdict": "clear", **record}


# ---------------------------------------------------------------- local media for the console


def frame_jpeg(store: JobStore, job_id: str, index: int, width: int) -> Path:
    job = store.load(job_id)
    count = int(job["vision"]["frame_count"])
    if not 0 <= index < count:
        raise NotFound("frame out of range")
    width = 320 if width <= 320 else 640 if width <= 640 else 1280
    dest = store.job_dir(job_id) / "cache" / "f{0:04d}-w{1}.jpg".format(index, width)
    return extract_jpeg(Path(job["asset"]["local_path"]), dest, frame_index=index, width=width)


def media_file(store: JobStore, job_id: str, name: str) -> Path:
    job = store.load(job_id)
    if name == "master.mp4":
        path = Path(job["asset"]["local_path"])
    elif name == "proof.mp4" and job.get("renders"):
        path = store.job_dir(job_id) / "renders" / "proof.mp4"
    else:
        raise NotFound("no such media")
    if not path.is_file():
        raise NotFound("no such media")
    return path
