# BrandForward console

Next.js 15 (App Router) console for the BrandForward engine. The browser only talks to same-origin `/api/*`; `app/api/[...path]/route.ts` streams those requests to the local engine (default `http://127.0.0.1:8787`, override with `BRAND_FORWARD_ENGINE`), including byte ranges so the raw master can be scrubbed locally.

```bash
npm install
npm run dev      # http://localhost:3000
```

- `/` — the problem and the flow.
- `/jobs/harbor-launch` — creates a fresh job and opens the console.
- `/jobs/<job_id>` — an existing job.

Components: `Monitor` (real master + measured overlays), `Timeline` (per-frame coverage vs plan), `Rail` (egress, plans, checks, receipt, render), `Console` (state and actions).
