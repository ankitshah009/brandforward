import { NextRequest, NextResponse } from "next/server";

// Same-origin proxy to the local engine. The engine binds to loopback; this route
// is how the console in the browser reaches it. Bodies stream through untouched,
// so frames and video (including byte ranges for scrubbing) work.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENGINE = process.env.BRAND_FORWARD_ENGINE ?? "http://127.0.0.1:8787";
const PASS_REQUEST = ["content-type", "range", "accept"];
const PASS_RESPONSE = ["content-type", "content-length", "content-range", "accept-ranges", "cache-control", "x-brandforward-export"];

async function forward(request: NextRequest, path: string[]): Promise<Response> {
  if (path.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\\"))) {
    return NextResponse.json({ detail: "Bad path." }, { status: 400 });
  }
  const method = request.method.toUpperCase();
  const target = `${ENGINE}/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
  const headers = new Headers();
  for (const name of PASS_REQUEST) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const research = path[path.length - 1] === "research";
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      // On-device planning with a 31B model can take a while on first load.
      signal: AbortSignal.timeout(research ? 300_000 : 60_000),
    });
  } catch {
    return NextResponse.json(
      { detail: `Engine offline. Start it with: cd engine && uv run python -m brand_forward (expects ${ENGINE}).` },
      { status: 503, headers: { "x-brandforward-engine": "offline" } },
    );
  }
  const out = new Headers();
  for (const name of PASS_RESPONSE) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  if (!out.has("cache-control")) out.set("cache-control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

async function handle(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  return forward(request, path);
}

export const GET = handle;
export const POST = handle;
export const HEAD = handle;
