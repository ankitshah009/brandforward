# BrandForward engine

The local half of BrandForward: ffmpeg ingest, pixel-measured vision, the proxy egress seam, frame cross-check, Ed25519 receipts, and the gated render. It binds to `127.0.0.1:8787`.

```bash
uv run python -m brand_forward          # serve
uv run --extra dev pytest -n auto  # test
```

See the [root README](../README.md) for the full story, environment variables, and what is real versus stand-in on this build. The HTTP contract is [`contracts/openapi.yaml`](../contracts/openapi.yaml); the MCP tool list is [`mcp/manifest.json`](mcp/manifest.json).
