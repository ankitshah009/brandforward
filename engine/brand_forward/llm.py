"""Model endpoints over plain HTTP: an OpenAI-compatible cloud and local Ollama.

Standard library only, so the engine has no SDK dependency. Timeouts are hard:
a planner that does not answer is a failure the pipeline fails over from.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Optional

from brand_forward.planner import PLAN_SCHEMA

OLLAMA_URL = os.environ.get("BRAND_FORWARD_OLLAMA", "http://127.0.0.1:11434")


class LlmError(Exception):
    """The endpoint failed, timed out, or answered outside the schema."""


@dataclass
class CloudConfig:
    base_url: str
    model: str
    api_key: str

    @property
    def host(self) -> str:
        return urllib.parse.urlparse(self.base_url).netloc or self.base_url

    @property
    def configured(self) -> bool:
        return bool(self.api_key)


def cloud_config() -> CloudConfig:
    return CloudConfig(
        base_url=os.environ.get("BRAND_FORWARD_CLOUD_URL", "https://api.openai.com/v1").rstrip("/"),
        model=os.environ.get("BRAND_FORWARD_CLOUD_MODEL", "gpt-5-mini"),
        api_key=os.environ.get("BRAND_FORWARD_CLOUD_KEY") or os.environ.get("OPENAI_API_KEY") or "",
    )


def openai_request_body(model: str, messages: list) -> bytes:
    """Exact bytes POSTed to the cloud. The egress ledger stores and hashes these."""
    body = {
        "model": model,
        "messages": messages,
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "edit_plan", "strict": True, "schema": PLAN_SCHEMA},
        },
    }
    return json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def _post(url: str, payload: bytes, headers: dict, timeout: float) -> dict:
    request = urllib.request.Request(url, data=payload, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            parsed = json.loads(exc.read().decode("utf-8"))
            detail = str((parsed.get("error") or {}).get("code") or (parsed.get("error") or {}).get("message") or "")
        except (ValueError, AttributeError, OSError):
            pass
        raise LlmError("HTTP {0}{1}".format(exc.code, ": " + detail[:120] if detail else "")) from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        reason = getattr(exc, "reason", exc)
        raise LlmError("unreachable: {0}".format(str(reason)[:120])) from exc
    except ValueError as exc:
        raise LlmError("answer was not JSON") from exc


def openai_chat(config: CloudConfig, body: bytes, *, timeout: float = 30.0) -> str:
    if not config.configured:
        raise LlmError("no cloud API key configured")
    answer = _post(
        config.base_url + "/chat/completions",
        body,
        {"content-type": "application/json", "authorization": "Bearer " + config.api_key},
        timeout,
    )
    try:
        return str(answer["choices"][0]["message"]["content"])
    except (KeyError, IndexError, TypeError) as exc:
        raise LlmError("answer had no message content") from exc


def ollama_models(timeout: float = 1.5) -> list:
    request = urllib.request.Request(OLLAMA_URL + "/api/tags")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return []
    return [str(item.get("name")) for item in payload.get("models") or [] if item.get("name")]


def local_model(models: Optional[list] = None) -> Optional[str]:
    """Configured local weight, or the largest-looking Gemma/30B-class tag on this machine."""
    wanted = os.environ.get("BRAND_FORWARD_LOCAL_MODEL")
    available = ollama_models() if models is None else models
    if wanted:
        return wanted if wanted in available else None
    for marker in ("31b", "32b", "30b", "27b"):
        for name in available:
            if marker in name.lower():
                return name
    return None


def ollama_plan(model: str, messages: list, *, timeout: float = 240.0) -> tuple:
    """Plan on local weights. Returns (content, latency_ms)."""
    payload = json.dumps(
        {
            "model": model,
            "stream": False,
            "think": False,
            "keep_alive": "30m",
            "format": PLAN_SCHEMA,
            "options": {"temperature": 0, "seed": 7},
            "messages": messages,
        }
    ).encode("utf-8")
    started = time.monotonic()
    answer = _post(OLLAMA_URL + "/api/chat", payload, {"content-type": "application/json"}, timeout)
    latency = int((time.monotonic() - started) * 1000)
    try:
        return str(answer["message"]["content"]), latency
    except (KeyError, TypeError) as exc:
        raise LlmError("local answer had no message content") from exc


def warm(model: str) -> None:
    """Load the local weight into memory so the first failover is fast."""
    payload = json.dumps({"model": model, "keep_alive": "30m", "prompt": ""}).encode("utf-8")
    try:
        _post(OLLAMA_URL + "/api/generate", payload, {"content-type": "application/json"}, 600)
    except LlmError:
        pass
