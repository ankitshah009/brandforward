// Types mirror the engine's job JSON (engine/brand_forward/pipeline.py). Keep them in sync with the engine.

export type Timecode = string; // "MM:SS.mmm"
export interface Box { x: number; y: number; w: number; h: number }
export interface Interval { start: Timecode; end: Timecode }

export interface Asset {
  asset_id: string; byte_length: number; command: string[]; container: string; duration_ms: number;
  ffmpeg: string; fps: number; height: number; origin: string; sha256: string; width: number;
}
export interface Cue { start: Timecode; end: Timecode; lang: string; text: string }
export interface Span {
  start: Timecode; end: Timecode; occlusion?: string; visible?: boolean;
  peak_coverage_bp?: number; face_present?: boolean;
}
export interface Track {
  box?: Box; evidence: string; kind: string; label: string; redacted: boolean;
  redaction?: string; spans: Span[]; track_id: string;
}
export interface Claim { id: string; asserted: string; start: Timecode; end: Timecode; track_id: string }
export interface Plan {
  face_blur: boolean;
  lower_third: Interval & { text: string };
  wordmark_hold: Interval;
}
export interface Proposal {
  id: string; claims: Claim[]; created_at?: string; input_proxy_sha256: string; mode: string;
  model: string; plan: Plan; provider: string; source: string; summary: string; revises?: string;
}
export interface MeasuredEvidence {
  first_frame: number; frames_examined: number; frames_sha256: string; last_frame: number;
  method: string; threshold_bp: number; worst_coverage_bp: number; worst_frame: number;
  worst_frame_sha256: string; worst_timecode: Timecode;
}
export interface Check {
  id: string; asserted: string; evidence: MeasuredEvidence | Record<string, unknown>;
  interval: Interval | null; kind: string; observed: string; passed: boolean;
  reason: string; source: string; subject: string;
}
export type Verdict = "hold" | "clear";
export interface Verification {
  checks: Check[]; job_id: string; proposal_id: string; schema: string; summary: string; verdict: Verdict;
}
export interface ReceiptBody {
  checks: Check[]; fixture_id: string; issuer: { node_id: string }; job_id: string;
  measured: {
    asset_bytes: number; asset_sha256: string; ffmpeg: string; fps: number; frame_count: number;
    template_sha256: string; vision_method: string;
  };
  opinion: {
    input_proxy_sha256: string; model: string; proposal_id: string; proposal_sha256: string; provider: string; source: string;
  };
  schema: string; verdict: Verdict;
}
export interface Receipt {
  algorithm: string; body: ReceiptBody; canonical_sha256: string; public_key: string;
  receipt_id: string; signature: string;
}
export interface Egress {
  seq: number; at?: string; bytes: number; destination: string; guard: string; kind?: string;
  model: string; payload_bytes: number; payload_sha256: string | null; provider: string;
  raw_media_bytes: number; reason?: string; status: string; transmitted: boolean; latency_ms?: number;
}
export interface RenderOut {
  at: string; bytes: number; command: string[]; output_name: string; proposal_id: string;
  receipt_id: string; renderer: string; sha256: string;
}
export interface VisionFrame { index: number; sha256: string; timecode: Timecode; wordmark_coverage_bp: number }
export interface Vision {
  fps: number; frame_count: number; frames: VisionFrame[]; method: string; template_sha256: string;
  threshold: { diff_luma: number; occluded_bp: number; scale: number }; tracks: Track[];
}
export interface JobEvent { seq: number; at: string; stage: string; status: string; mode: string; message: string }
export interface Job {
  id: string; title: string; synopsis: string; status: string; created_at: string; fixture_id: string;
  node_id: string; asset: Asset; proxy: Record<string, unknown>; proxy_bytes: number; proposals: Proposal[];
  verifications: Verification[]; receipts: Receipt[]; renders: RenderOut[]; egress: Egress[];
  events: JobEvent[]; transcript: Cue[]; vision: Vision;
}

export function tcToMs(tc: Timecode): number {
  const [m, s] = tc.split(":");
  return Math.round((Number(m) * 60 + Number(s)) * 1000);
}
export function msToTc(ms: number): Timecode {
  const m = Math.floor(ms / 60000);
  const s = (ms % 60000) / 1000;
  return `${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
}
export function isMeasured(e: Check["evidence"]): e is MeasuredEvidence {
  return typeof e === "object" && e !== null && "worst_frame" in e;
}
export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
export const pct = (bp: number) => `${(bp / 100).toFixed(1)}%`;
export const short = (h: string | null | undefined, n = 10) => (h ? h.slice(0, n) : "—");
export function overlaps(a: Interval, b: Interval): Interval | null {
  const s = Math.max(tcToMs(a.start), tcToMs(b.start));
  const e = Math.min(tcToMs(a.end), tcToMs(b.end));
  return e > s ? { start: msToTc(s), end: msToTc(e) } : null;
}
export function modelName(model: string, provider: string): string {
  const m = model.toLowerCase();
  if (m.includes("gemma-4-31b")) return "Gemma 4 31B";
  if (m.includes("gemma-4-e4b")) return "Gemma 4 E4B";
  const claude = /^claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d+))?$/.exec(m);
  if (claude) return `Claude ${claude[1][0].toUpperCase()}${claude[1].slice(1)} ${claude[2]}${claude[3] ? "." + claude[3] : ""}`;
  if (provider === "scripted" || model === "scripted-cloud") return "Scripted cloud";
  if (provider === "rule") return "Rule planner";
  return model.split(":")[0];
}
export const modelLabel = (p: Proposal) => modelName(p.model, p.provider);
