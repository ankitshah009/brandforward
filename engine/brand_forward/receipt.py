"""Ed25519 pre-publishability receipts.

The signed bytes are the canonical JSON of `body` only. Signature, public key,
algorithm, and the convenience digest sit outside the body. Ed25519 signatures
are deterministic, so the same body and the same workstation key always match.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
from binascii import Error as BinasciiError
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

from brand_forward import NODE_ID, RECEIPT_SCHEMA
from brand_forward.canonical import canonicalize, sha256_canonical


def build_body(*, job: dict, proposal: dict, report: dict) -> dict:
    """Canonical receipt body. Wall-clock fields stay out so the body is replayable.

    `measured` holds what this workstation computed from files. `opinion` holds
    what a model proposed. `checks` joins them. Only measured values decide the verdict.
    """
    asset = job["asset"]
    vision = job["vision"]
    return {
        "schema": RECEIPT_SCHEMA,
        "job_id": job["id"],
        "fixture_id": job["fixture_id"],
        "measured": {
            "asset_sha256": asset["sha256"],
            "asset_bytes": asset["byte_length"],
            "frame_count": vision["frame_count"],
            "fps": vision["fps"],
            "vision_method": vision["method"],
            "template_sha256": vision["template_sha256"],
            "ffmpeg": asset["ffmpeg"],
        },
        "opinion": {
            "proposal_id": proposal["id"],
            "proposal_sha256": sha256_canonical(proposal),
            "source": proposal["source"],
            "provider": proposal["provider"],
            "model": proposal["model"],
            "input_proxy_sha256": proposal["input_proxy_sha256"],
        },
        "checks": report["checks"],
        "verdict": report["verdict"],
        "issuer": {"node_id": NODE_ID},
    }


def sign_body(body: dict, private_key: Ed25519PrivateKey) -> dict:
    canonical = canonicalize(body)
    signature = private_key.sign(canonical)
    public = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    digest = hashlib.sha256(canonical).hexdigest()
    return {
        "receipt_id": "r_{0}".format(digest[:16]),
        "algorithm": "Ed25519",
        "public_key": base64.b64encode(public).decode("ascii"),
        "signature": base64.b64encode(signature).decode("ascii"),
        "canonical_sha256": digest,
        "body": body,
    }


def verify_receipt(receipt: dict, *, pinned_public_b64: str) -> bool:
    """Offline verify. A mutated body, digest, algorithm, or key all fail."""
    try:
        if not isinstance(receipt, dict):
            return False
        if receipt.get("algorithm") != "Ed25519":
            return False
        if receipt.get("public_key") != pinned_public_b64:
            return False
        body = receipt["body"]
        canonical = canonicalize(body)
        digest = hashlib.sha256(canonical).hexdigest()
        if receipt.get("canonical_sha256") != digest:
            return False
        signature = base64.b64decode(receipt["signature"], validate=True)
        public_raw = base64.b64decode(receipt["public_key"], validate=True)
        Ed25519PublicKey.from_public_bytes(public_raw).verify(signature, canonical)
        return True
    except (InvalidSignature, BinasciiError, KeyError, TypeError, ValueError):
        return False


class Signer:
    """Workstation key. The seed stays in the data directory and is never a tool argument."""

    def __init__(self, private_key: Ed25519PrivateKey) -> None:
        self._private = private_key
        public = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        self.public_b64 = base64.b64encode(public).decode("ascii")

    def sign(self, body: dict) -> dict:
        return sign_body(body, self._private)

    @classmethod
    def generate(cls) -> "Signer":
        return cls(Ed25519PrivateKey.generate())

    @classmethod
    def load(cls, data_dir: Path) -> "Signer":
        path = data_dir / "node_key.json"
        if path.is_file():
            data = json.loads(path.read_text(encoding="utf-8"))
            seed = base64.b64decode(data["seed_b64"], validate=True)
            return cls(Ed25519PrivateKey.from_private_bytes(seed))
        private = Ed25519PrivateKey.generate()
        seed = private.private_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PrivateFormat.Raw,
            encryption_algorithm=serialization.NoEncryption(),
        )
        public = private.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(
                {
                    "schema": "brand-forward.node-key.v1",
                    "note": (
                        "Demo workstation key for pre-publishability receipts. "
                        "Not a production HSM key. Raw video is not inside the receipt."
                    ),
                    "seed_b64": base64.b64encode(seed).decode("ascii"),
                    "public_key": base64.b64encode(public).decode("ascii"),
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
        return cls(private)
