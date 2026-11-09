// Types and calls for the BrandForward engine. The console speaks the engine's own shape.

export type Verdict = "hold" | "clear";

export interface Span {
  start: string;
  end: string;
  visible: boolean;
  occlusion: string;
  peak_coverage_bp?: number;
  face_present?: boolean;
}

export interface Track {
  track_id: string;
  kind: string;
  label: string;
  redacted: boolean;
  redaction?: string;
  evidence: string;
  box?: { x: number; y: number; w: number; h: number };
  spans: Span[];
}

export interface FrameRecord {
  index: number;
  timecode: string;
  sha256: string;
  wordmark_coverage_bp: number;
}

export interface Vision {
  method: string;
  fps: number;
  frame_count: number;
  threshold: { diff_luma: number; occluded_bp: number; scale: number };
  template_sha256: string;
  frames: FrameRecord[];
  tracks: Track[];
}

export interface Interval {
  start: string;
  end: string;
}

export interface Plan {
  wordmark_hold: Interval;
  lower_third: Interval & { text: string };
  face_blur: boolean;
}

export interface Claim extends Interval {
  id: string;
  track_id: string;
  asserted: "fully_visible" | "occluded";
}

export interface Proposal {
  id: string;
  source: "cloud" | "local" | "local-failover";
  provider: string;
  model: string;
  mode: "scripted" | "live" | "deterministic";
  summary: string;
  input_proxy_sha256: string;
  plan: Plan;
  claims: Claim[];
  revises?: string;
  created_at?: string;
}

export interface Check {
  id: string;
  kind: "measured" | "geometry" | "policy" | "layout";
  source: "edit" | "claim" | "policy";
  subject: string;
  asserted: string;
  interval: Interval | null;
  observed: string;
  passed: boolean;
  reason: string;
  evidence: Record<string, unknown> & {
    worst_frame?: number;
    worst_timecode?: string;
    worst_frame_sha256?: string;
    worst_coverage_bp?: number;
    frames_examined?: number;
    first_frame?: number;
    last_frame?: number;
  };
}

export interface Verification {
  proposal_id: string;
  verdict: Verdict;
  summary: string;
  checks: Check[];
}

export interface ReceiptBody {
  schema: string;
  job_id: string;
  fixture_id: string;
  measured: Record<string, string | number>;
  opinion: {
    proposal_id: string;
    proposal_sha256: string;
    source: string;
    provider: string;
    model: string;
    input_proxy_sha256: string;
  };
  checks: Check[];
  verdict: Verdict;
  issuer: { node_id: string };
}

export interface Receipt {
  receipt_id: string;
  algorithm: string;
  public_key: string;
  signature: string;
  canonical_sha256: string;
  body: ReceiptBody;
}

export interface EgressRecord {
  seq: number;
  kind?: "plan" | "revision";
  provider: string;
  destination: string;
  model: string;
  status: "blocked" | "scripted" | "sending" | "answered" | "failed" | "rejected";
  transmitted: boolean;
  bytes: number;
  payload_bytes: number;
  payload_sha256: string | null;
  raw_media_bytes: number;
  guard: string;
  reason?: string;
  latency_ms?: number;
  at?: string;
}

export interface RenderRecord {
  proposal_id: string;
  receipt_id: string;
  renderer: string;
  sha256: string;
  bytes: number;
  output_name: string;
  command: string[];
  at: string;
}

export interface EventRecord {
  seq: number;
  stage: string;
  status: string;
  mode: string;
  at: string;
  message: string;
  cloud_called?: boolean;
  proposal_id?: string;
  verdict?: Verdict;
}

export interface Job {
  id: string;
  title: string;
  fixture_id: string;
  synopsis: string;
  status: string;
  node_id: string;
  created_at: string;
  events: EventRecord[];
  proposals: Proposal[];
  verifications: Verification[];
  receipts: Receipt[];
  renders: RenderRecord[];
  egress: EgressRecord[];
  asset: {
    asset_id: string;
    sha256: string;
    byte_length: number;
    duration_ms: number;
    width: number;
    height: number;
    fps: number;
    ffmpeg: string;
    origin: string;
  };
  vision: Vision;
  transcript: { start: string; end: string; lang: string; text: string }[];
  proxy: Record<string, unknown>;
  proxy_bytes: number;
}

export interface Capability {
  state: string;
  detail: string;
  target?: string;
  model?: string | null;
  host?: string;
}

export interface NodeInfo {
  id: string;
  name: string;
  platform?: string;
  intended_host?: string;
  intended_accelerator?: string;
  raw_media_leaves_machine?: boolean;
  capabilities?: Record<string, Capability>;
}

export interface ResearchResult {
  route: "cloud" | "local" | "local-failover";
  cloud_called: boolean;
  egress: EgressRecord | null;
  proposal: Proposal;
}

export class EngineError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  } catch {
    throw new EngineError("The console could not reach its own server.", 0);
  }
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const detail =
      data && typeof data === "object" && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : data && typeof data === "object" && "error" in data
          ? String((data as { error: unknown }).error)
          : `Engine answered ${response.status}.`;
    throw new EngineError(detail, response.status);
  }
  return data as T;
}

const post = <T,>(path: string, body: unknown) => call<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  health: () => call<{ ok: boolean; node: string; version: string; public_key: string }>("/health"),
  nodes: () => call<{ nodes: NodeInfo[] }>("/nodes"),
  createJob: () => post<Job>("/jobs", { fixture_id: "harbor-launch" }),
  job: (id: string) => call<Job>(`/jobs/${encodeURIComponent(id)}`),
  research: (id: string, body: { link: "up" | "down"; provider: "scripted" | "live"; revise?: string }) =>
    post<ResearchResult>(`/jobs/${encodeURIComponent(id)}/research`, body),
  receipt: (id: string, proposalId: string) => post<Receipt>(`/jobs/${encodeURIComponent(id)}/receipt`, { proposal_id: proposalId }),
  verifyStored: (id: string) =>
    call<{ valid: boolean; public_key: string; receipts: { receipt_id: string; valid: boolean; verdict: Verdict }[] }>(
      `/jobs/${encodeURIComponent(id)}/receipt/verify`,
    ),
  checkReceipt: (receipt: unknown) => post<{ valid: boolean; reason: string }>("/receipts/verify", receipt),
  render: (id: string, proposalId: string) => post<RenderRecord>(`/jobs/${encodeURIComponent(id)}/render`, { proposal_id: proposalId }),
  egressText: async (id: string, seq: number) => {
    const response = await fetch(`/api/jobs/${encodeURIComponent(id)}/egress/${seq}`, { cache: "no-store" });
    if (!response.ok) throw new EngineError("Payload not found.", response.status);
    return response.text();
  },
};

export const mediaUrl = (id: string, name: "master.mp4" | "proof.mp4", bust?: string) =>
  `/api/jobs/${encodeURIComponent(id)}/media/${name}${bust ? `?v=${bust}` : ""}`;

export const frameUrl = (id: string, index: number, width = 640) =>
  `/api/jobs/${encodeURIComponent(id)}/frames/${index}.jpg?w=${width}`;
