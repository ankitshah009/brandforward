# BrandForward

**Pre-publishability verification for unreleased video. Raw footage stays on the workstation. Cloud models plan edits from a 2 KB metadata proxy. Every claim they make is checked against decoded frames before anything renders, and the result is a signed receipt.**

<!-- DEMO_VIDEO -->

## The problem

Media teams want AI agents to cut, caption, and brand their footage. Three things stop that in production.

1. **Upload is the wrong boundary.** Cloud video tools want the raw footage: gigabytes of unreleased product shots, talent who has not been announced, embargoed launches. Sending them breaks privacy, compliance, and often contracts. It is also slow.
2. **Cloud models make confident claims about pixels they never checked.** A planner reads "hold on the name" in the transcript and schedules a logo reveal at 00:04.2. At 00:04.2 the logo is behind a crane load. Timestamps drift, objects are assumed, and the cut ships with the mistake.
3. **Nobody can prove what was checked.** When legal asks "was the talent blurred, was the logo visible, which model decided?", the answer is a log line, not evidence.

BrandForward moves the trust boundary. Pixels never leave the workstation. Models only give **opinions**. The workstation **measures**, and it signs what it measured.

## What it does

The demo job is `harbor-launch`: a 6-second launch shot of the MIRA hull. The talent is unreleased, and a crane load swings in front of the MIRA wordmark partway through.

1. **Ingest and measure, on device.** ffmpeg decodes and SHA-256-hashes all 144 frames. Vision compares the wordmark region of every frame with the brand template and records pixel coverage in integer basis points. In this shot the wordmark is covered from `00:03.708` to `00:05.333`, at up to 66.9 %.
2. **Seal the proxy.** The only document allowed to leave is a ~2 KB proxy: track ids, visibility spans, redaction flags, transcript lines, and one frame hash per second. A leakage guard rejects anything that looks like pixels, file bytes, paths, or URLs. The master is ~260 KB here and gigabytes in production.
3. **Cloud plan.** The proxy goes through a single egress seam that records the exact request bytes, their size, and their SHA-256. The cloud returns an edit plan: a logo hold, a lower third, face blur, and the visibility claims it relied on.
4. **Frame cross-check → HOLD.** The workstation never trusts the plan's own claims alone. Each edit implies checks of its own:
   - **measured**: is the wordmark visible across the hold interval, frame by frame?
   - **geometry**: does the lower third stay clear of the face and the wordmark?
   - **policy**: is a talent flagged for redaction actually blurred?

   The cloud's hold at `00:03.900–00:04.800` fails. Frame 112 shows the wordmark 66.9 % covered.
5. **Revise or fail over.** *Revise* sends the planner only the failed checks (ids, intervals, numbers, reasons, never pixels) and gets a corrected plan. *Drop link* never touches the network: the same planning step runs on device on Gemma 4 31B through Ollama, or on a deterministic rule planner if no local weight is loaded. A cloud error or an answer outside the schema fails over the same way.
6. **CLEAR, and a signed receipt.** The receipt is Ed25519 over canonical JSON. It keeps two sections apart:
   - `measured`: asset hash, frame count, vision method, template hash, ffmpeg version.
   - `opinion`: proposal hash, provider, model, and the hash of the proxy the model saw.

   `checks` joins the two, with frame indexes and frame hashes as evidence. The same inputs always produce the same bytes. Change one field and verification fails; the console has a tamper button to show it.
7. **Gated render.** ffmpeg renders the plan (face pixelation, lower third, logo hold) only if all of these hold:
   - a receipt exists for this exact proposal;
   - its signature verifies against the pinned key;
   - its verdict is CLEAR;
   - the proposal hash matches the one that was signed;
   - the master on disk still matches the signed hash;
   - a fresh cross-check still agrees.

   Anything else returns `409`.

## The boundary

```mermaid
flowchart LR
  subgraph WS["Workstation: raw media never leaves"]
    M[master.mp4] --> V[decode + hash 144 frames<br/>measure wordmark coverage]
    V --> P[proxy ~2 KB<br/>leakage guard]
    V --> X[frame cross-check<br/>measured · geometry · policy]
    L[on-device planner<br/>Gemma 4 31B / rule] --> X
    X --> R[Ed25519 receipt<br/>measured vs opinion]
    R -->|CLEAR only| F[ffmpeg render]
  end
  P -->|egress seam: exact bytes logged| C[cloud planner]
  C -->|edit plan = opinion| X
  X -.->|failed checks only| C
```

The arrows leaving the workstation carry only the proxy and, on a revision, the failed checks. `GET /jobs/{id}/egress/{seq}` returns the exact request body that was built for each call, whether or not it was sent.

## What is real on this build, and what is a stand-in

This build runs on an Apple M5 Max laptop, not the ThinkStation P8. The camera original is not on this machine, so the master is a synthetic harbor shot that ffmpeg draws on device: hull, talent, the MIRA wordmark panel, and a swinging crane load. Nothing downstream is told where the occlusion is. Vision measures it from decoded pixels.

| Stage | This build | On the ThinkStation P8 |
| --- | --- | --- |
| Media: generate, decode, hash, render | **Real.** ffmpeg, libx264, deterministic output | Same, 4K masters, NVENC |
| Wordmark visibility | **Real measurement.** Per-frame template diff against the brand template (`template-diff.v1`) | SAM 3.1 tracks |
| Talent face and hull boxes | Scene layout from the generator | SAM 3.1 detections |
| Transcript (en, ja) | Fixture | Whisper on device |
| On-device planner | **Real.** Gemma 4 31B (Q8) via Ollama when present; deterministic rule planner otherwise | 30B+ open weights on Blackwell |
| Cloud planner | Scripted answer by default, labeled as scripted, never transmitted. Optional live OpenAI-compatible endpoint (needs a valid key) | Frontier API |
| Egress ledger and leakage guard | **Real** | Same |
| Cross-check and receipts | **Real.** Ed25519, canonical JSON, pinned key | Same, HSM-backed key |

The console shows the same per-stage state, read from `GET /nodes`, so nothing on screen claims more than the engine ran.

## Why it needs an RTX PRO 6000

Everything that touches pixels has to run next to the footage, at the same time:

- a 30B+ planner held in memory for failover (the Q8 Gemma 4 31B used here is about 33 GB);
- SAM 3.1 tracking dense video;
- Whisper transcribing multilingual audio;
- 4K decode and encode.

On a 24 GB card these stages take turns and evict each other's weights and KV cache. With 96 GB they stay resident together, and frame-accurate verification stays fast enough to sit in the editing loop instead of after it.

## Quickstart

Requirements: [uv](https://docs.astral.sh/uv/), ffmpeg with `drawtext` (libfreetype), Node 20+. Optional: [Ollama](https://ollama.com) with a 27B to 32B-class model pulled.

```bash
# engine on 127.0.0.1:8787
cd engine
uv run --with-requirements requirements.txt python -m brand_forward

# console on http://localhost:3000 (second terminal)
cd web
npm install
npm run dev
```

Open http://localhost:3000 and choose **Run the harbor-launch job**.

Tests:

```bash
cd engine
uv run --with-requirements requirements.txt --with pytest-xdist pytest -n auto
```

The tests use a temporary data directory, the rule planner, and the scripted cloud. No network and no GPU.

### Configuration

Environment variables, or `KEY=VALUE` lines in a repo-root `.env.local` (gitignored, read by the engine at start):

| Variable | Default | Purpose |
| --- | --- | --- |
| `BRAND_FORWARD_PORT` | `8787` | Engine port (binds `127.0.0.1`). |
| `BRAND_FORWARD_DATA` | `engine/data` | Jobs, frames, renders, and the workstation signing key. |
| `BRAND_FORWARD_ENGINE` | `http://127.0.0.1:8787` | Engine origin the web console proxies to. |
| `BRAND_FORWARD_LOCAL` | `auto` | `rule` forces the deterministic planner and skips Ollama. |
| `BRAND_FORWARD_LOCAL_MODEL` | auto-detect | Ollama model tag for on-device planning. |
| `BRAND_FORWARD_OLLAMA` | `http://127.0.0.1:11434` | Ollama endpoint. |
| `BRAND_FORWARD_CLOUD_URL` | `https://api.openai.com/v1` | OpenAI-compatible base URL for `provider: live`. |
| `BRAND_FORWARD_CLOUD_MODEL` | `gpt-5-mini` | Cloud model. |
| `BRAND_FORWARD_CLOUD_KEY` / `OPENAI_API_KEY` | none | Cloud key. Without one, a live request fails over on device. |
| `BRAND_FORWARD_FONT` | system serif | Font file for the wordmark and lower third. |

## API

`contracts/openapi.yaml` is the HTTP contract. The core calls:

```bash
E=http://127.0.0.1:8787
JOB=$(curl -s -X POST $E/jobs -H 'content-type: application/json' -d '{}' | jq -r .id)
curl -s $E/jobs/$JOB/proxy | wc -c                                   # ~2 KB
curl -s -X POST $E/jobs/$JOB/research -H 'content-type: application/json' -d '{}'               # scripted cloud plan
curl -s -X POST $E/jobs/$JOB/receipt  -H 'content-type: application/json' -d '{"proposal_id":"cloud-1"}'   # HOLD
curl -s -X POST $E/jobs/$JOB/research -H 'content-type: application/json' -d '{"link":"down"}'  # on-device plan
curl -s -X POST $E/jobs/$JOB/receipt  -H 'content-type: application/json' -d '{"proposal_id":"local-1"}'   # CLEAR
curl -s -X POST $E/jobs/$JOB/render   -H 'content-type: application/json' -d '{"proposal_id":"local-1"}'   # proof.mp4
```

The same stage functions are exposed as MCP tools (`engine/mcp/manifest.json`): `track_frames`, `transcribe`, `reason_local`, `export_proxy`, `verify_proposal`, `sign_receipt`.

## Layout

```
engine/      FastAPI engine and MCP tools (Python, uv)
  brand_forward/
    scene.py       synthetic master: geometry and ffmpeg filter graph
    media.py       ffmpeg: generate, frame hashes, decode regions, render
    vision.py      per-frame wordmark coverage, measured spans
    planner.py     edit-plan schema, prompts, scripted and rule planners
    llm.py         OpenAI-compatible cloud and Ollama clients (stdlib HTTP)
    cloud.py       the egress seam and ledger
    guard.py       leakage guard for anything that leaves
    crosscheck.py  measured, geometry, policy, and layout checks
    receipt.py     canonical JSON and Ed25519 receipts
    pipeline.py    job stages; server.py is the HTTP API
  tests/
web/         Next.js console (proxies /api/* to the engine)
fixtures/    job fixtures: transcript and scripted cloud answers
contracts/   OpenAPI contract
infra/       optional node probe for GPU hosts
```

## License

MIT. See [LICENSE](LICENSE).
