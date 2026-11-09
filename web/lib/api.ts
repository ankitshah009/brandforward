// Calls to the BrandForward engine through the same-origin /api proxy.
import type { Egress, Job, Proposal, Receipt, RenderOut } from "@/lib/job";

export interface Capability { state: string; detail: string; target?: string; model?: string | null; host?: string }
export interface NodeInfo { id: string; name: string; capabilities?: Record<string, Capability> }
export interface ResearchResult { route: "cloud" | "local" | "local-failover"; cloud_called: boolean; egress: Egress | null; proposal: Proposal }

export class EngineError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
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
    const detail = data && typeof data === "object" && "detail" in data ? String((data as { detail: unknown }).detail) : `Engine answered ${response.status}.`;
    throw new EngineError(detail, response.status);
  }
  return data as T;
}

const post = <T,>(path: string, body: unknown) => call<T>(path, { method: "POST", body: JSON.stringify(body) });
const job = (id: string) => `/jobs/${encodeURIComponent(id)}`;

export const api = {
  nodes: () => call<{ nodes: NodeInfo[] }>("/nodes"),
  createJob: () => post<Job>("/jobs", { fixture_id: "harbor-launch" }),
  job: (id: string) => call<Job>(job(id)),
  research: (id: string, body: { link: "up" | "down"; provider: "scripted" | "live"; revise?: string }) => post<ResearchResult>(`${job(id)}/research`, body),
  receipt: (id: string, proposalId: string) => post<Receipt>(`${job(id)}/receipt`, { proposal_id: proposalId }),
  checkReceipt: (receipt: unknown) => post<{ valid: boolean; reason: string }>("/receipts/verify", receipt),
  render: (id: string, proposalId: string) => post<RenderOut>(`${job(id)}/render`, { proposal_id: proposalId }),
  egressText: async (id: string, seq: number) => {
    const response = await fetch(`/api${job(id)}/egress/${seq}`, { cache: "no-store" });
    if (!response.ok) throw new EngineError("Payload not found.", response.status);
    return response.text();
  },
};

export const mediaUrl = (id: string, name: "master.mp4" | "proof.mp4", bust?: string) => `/api${job(id)}/media/${name}${bust ? `?v=${bust}` : ""}`;
export const frameUrl = (id: string, index: number, width = 640) => `/api${job(id)}/frames/${index}.jpg?w=${width}`;
