"""Offline receipt verifier. Needs only this file, canonical.py, and `cryptography`.

    python -m brand_forward.verify receipt.json --public-key <base64>

Exit 0 when the Ed25519 signature over the canonical body verifies against the
pinned key, 1 when it does not, 2 on a usage or input error. No engine, network,
or footage is involved: anyone holding the receipt and the workstation's public
key can check it.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from brand_forward.receipt import verify_receipt


def main(argv: list | None = None) -> int:
    parser = argparse.ArgumentParser(prog="brand_forward.verify", description="Verify a BrandForward receipt offline.")
    parser.add_argument("receipt", type=Path, help="receipt JSON downloaded from the console")
    parser.add_argument("--public-key", required=True, help="the workstation's pinned Ed25519 public key (base64)")
    args = parser.parse_args(argv)
    try:
        receipt = json.loads(args.receipt.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print("cannot read receipt: {0}".format(exc), file=sys.stderr)
        return 2
    valid = verify_receipt(receipt, pinned_public_b64=args.public_key.strip())
    body = receipt.get("body") if isinstance(receipt, dict) else None
    body = body if isinstance(body, dict) else {}
    opinion = body.get("opinion") if isinstance(body.get("opinion"), dict) else {}
    print(
        json.dumps(
            {
                "valid": valid,
                "receipt_id": receipt.get("receipt_id") if isinstance(receipt, dict) else None,
                "verdict": body.get("verdict"),
                "proposal_id": opinion.get("proposal_id"),
                "planner": opinion.get("model"),
                "checks": len(body.get("checks") or []),
            },
            indent=2,
        )
    )
    return 0 if valid else 1


if __name__ == "__main__":
    raise SystemExit(main())
