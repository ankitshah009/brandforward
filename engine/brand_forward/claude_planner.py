"""Live cloud planner on Claude, through the official Anthropic SDK.

Only `cloud.send` calls this module, after the leakage guard has passed. The
request carries the system prompt, the anonymized proxy, and (on a revision)
the planner's previous plan plus the failed checks. Nothing else.

A refusal, an error, or an answer outside the schema raises `PlannerError`;
the pipeline then fails over to on-device planning.
"""

from __future__ import annotations

import copy
import json
import os
import time

import anthropic

from brand_forward.planner import PLAN_SCHEMA

DEFAULT_MODEL = "claude-opus-5-5"
FALLBACK_BETA = "server-side-fallback-2026-07-01"
HOST = "api.anthropic.com"


class PlannerError(Exception):
    """Claude could not produce a usable plan for this request."""


def configured() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def model() -> str:
    return os.environ.get("BRAND_FORWARD_CLAUDE_MODEL", DEFAULT_MODEL)


def _schema() -> dict:
    """The plan schema without regex patterns; normalize_plan re-validates timecodes."""
    schema = copy.deepcopy(PLAN_SCHEMA)

    def strip(node: object) -> None:
        if isinstance(node, dict):
            node.pop("pattern", None)
            for value in node.values():
                strip(value)
        elif isinstance(node, list):
            for value in node:
                strip(value)

    strip(schema)
    return schema


def request_params(chat: list) -> dict:
    """Build the exact parameters handed to the SDK. The egress ledger stores these."""
    system = "\n".join(m["content"] for m in chat if m["role"] == "system")
    messages = [{"role": m["role"], "content": m["content"]} for m in chat if m["role"] != "system"]
    return {
        "model": model(),
        "max_tokens": 16000,
        "system": system,
        "messages": messages,
        "output_config": {
            "effort": "medium",
            "format": {"type": "json_schema", "schema": _schema()},
        },
        "fallbacks": "default",
        "betas": [FALLBACK_BETA],
    }


def payload_bytes(params: dict) -> bytes:
    return json.dumps(params, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def plan(params: dict, *, timeout: float = 120.0) -> tuple:
    """Call Claude. Returns (plan JSON text, latency_ms, model that served the answer)."""
    client = anthropic.Anthropic(timeout=timeout, max_retries=1)
    started = time.monotonic()
    try:
        response = client.beta.messages.create(**params)
    except anthropic.AuthenticationError as exc:
        raise PlannerError("Anthropic rejected the API key") from exc
    except anthropic.PermissionDeniedError as exc:
        raise PlannerError("API key lacks permission for this model") from exc
    except anthropic.NotFoundError as exc:
        raise PlannerError("model not found: {0}".format(params.get("model"))) from exc
    except anthropic.RateLimitError as exc:
        raise PlannerError("rate limited by Anthropic") from exc
    except anthropic.BadRequestError as exc:
        raise PlannerError("bad request: {0}".format(str(exc.message)[:160])) from exc
    except anthropic.APIStatusError as exc:
        raise PlannerError("Anthropic error {0}".format(exc.status_code)) from exc
    except anthropic.APIConnectionError as exc:
        raise PlannerError("unreachable: {0}".format(str(exc)[:120])) from exc
    latency = int((time.monotonic() - started) * 1000)
    if response.stop_reason == "refusal":
        category = getattr(getattr(response, "stop_details", None), "category", None)
        raise PlannerError("Claude declined the request ({0})".format(category or "refusal"))
    if response.stop_reason == "max_tokens":
        raise PlannerError("answer hit max_tokens before the plan was complete")
    text = next((block.text for block in response.content if block.type == "text"), "")
    if not text.strip():
        raise PlannerError("answer had no text block")
    return text, latency, getattr(response, "model", params.get("model"))
