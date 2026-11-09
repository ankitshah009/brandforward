"""BrandForward local engine.

Raw media stays on the workstation. This package is the HTTP and MCP
implementation of ingest, fixture inference, proxy export, frame cross-check,
and Ed25519 pre-publishability receipts.
"""

__version__ = "0.2.0"

NODE_ID = "local-m5-max"
DEFAULT_FIXTURE_ID = "harbor-launch"
PROXY_SCHEMA = "brandforward.proxy.v2"
RECEIPT_SCHEMA = "brandforward.receipt.v2"
CROSS_CHECK_SCHEMA = "brandforward.cross-check.v2"
