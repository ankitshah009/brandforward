"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Check as CheckIcon,
  ChevronDown,
  Cloud,
  Download,
  FileJson,
  HardDrive,
  KeyRound,
  Lock,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatBytes, isMeasured, modelLabel, pct, short, type Check, type Egress, type Proposal, type Receipt, type RenderOut, type Verdict, type Verification } from "@/lib/job";
import { frameUrl } from "@/lib/api";
import { Btn, BusyLine, Chip, KV, type ChipTone } from "./primitives";

export type StepStatus = "active" | "done" | "idle";
export interface Busy {
  label: string;
  elapsedMs: number;
}

export function StepCard({ n, title, status, aside, children }: { n: number; title: string; status: StepStatus; aside?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (status === "active") ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [status]);
  return (
    <section
      ref={ref}
      data-step={n}
      aria-current={status === "active" ? "step" : undefined}
      className={cn("relative border-b border-hairline px-4 transition-colors duration-500", status === "idle" ? "py-3" : "py-4", status === "active" && "bg-surface-1")}
    >
      {status === "active" && <motion.span layoutId="rail-active" className="absolute inset-y-0 left-0 w-[2px] bg-brass shadow-[0_0_12px_var(--brass)]" />}
      <header className={cn("flex items-center gap-2.5", status !== "idle" && "mb-3")}>
        <span
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-full border font-mono text-[10px] tnum",
            status === "done" ? "border-clear/50 bg-clear-dim text-clear" : status === "active" ? "border-brass/60 text-brass" : "border-hairline-strong text-faint",
          )}
        >
          {status === "done" ? <CheckIcon className="h-3 w-3" /> : String(n).padStart(2, "0")}
        </span>
        <h3 className={cn("text-[13px] font-medium", status === "idle" && "text-muted-foreground")}>{title}</h3>
        <div className="ml-auto">{aside}</div>
      </header>
      {status === "idle" ? null : children}
    </section>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  label: string;
  disabled?: boolean;
  options: { value: T; label: string; icon?: ReactNode; tone?: "hold" | "clear" }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="relative grid flex-1 rounded-[6px] border border-hairline-strong bg-surface-0 p-[3px] shadow-[inset_0_2px_6px_oklch(0_0_0/60%)]"
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-10 flex h-7 items-center justify-center gap-1.5 text-xs transition-colors disabled:opacity-50",
              on ? (o.tone === "hold" ? "text-hold" : o.tone === "clear" ? "text-clear" : "text-foreground") : "text-faint hover:text-muted-foreground",
            )}
          >
            {on && (
              <motion.span
                layoutId={`seg-${label}`}
                transition={{ type: "spring", stiffness: 520, damping: 34 }}
                className="absolute inset-0 -z-10 rounded-[4px] border border-hairline-strong bg-surface-3 shadow-[0_1px_0_oklch(1_0_0/10%)_inset,0_3px_8px_oklch(0_0_0/50%)]"
              />
            )}
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const EGRESS: Record<string, { label: string; tone: ChipTone }> = {
  blocked: { label: "not sent · link down", tone: "hold" },
  scripted: { label: "scripted · not sent", tone: "brass" },
  answered: { label: "sent · answered", tone: "cloud" },
  failed: { label: "failed · failover", tone: "hold" },
  rejected: { label: "rejected · failover", tone: "hold" },
  sending: { label: "sending", tone: "brass" },
};

export interface BoundaryStepProps {
  status: StepStatus;
  masterBytes: number;
  proxyBytes: number;
  proxy: unknown;
  link: "up" | "down";
  onLinkChange: (l: "up" | "down") => void;
  provider: "scripted" | "live";
  onProviderChange: (m: "scripted" | "live") => void;
  providerNote: string;
  egress: Egress[];
  onSend: () => void;
  busy: Busy | null;
  locked: boolean;
  loadPayload: (seq: number) => Promise<string>;
}

export function BoundaryStep(p: BoundaryStepProps) {
  const [showProxy, setShowProxy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [payload, setPayload] = useState<Record<number, string>>({});
  const ratio = p.proxyBytes / p.masterBytes;
  const toggle = async (seq: number) => {
    if (open === seq) return setOpen(null);
    setOpen(seq);
    if (!payload[seq]) {
      try {
        const text = await p.loadPayload(seq);
        let pretty = text;
        try {
          pretty = JSON.stringify(JSON.parse(text), null, 2);
        } catch {}
        setPayload((prev) => ({ ...prev, [seq]: pretty }));
      } catch {
        setPayload((prev) => ({ ...prev, [seq]: "Payload unavailable." }));
      }
    }
  };
  return (
    <StepCard n={1} title="What leaves the machine" status={p.status}>
      <div className="space-y-2">
        <div>
          <div className="mb-1 flex justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <HardDrive className="h-3 w-3" />
              Raw master · stays
            </span>
            <span className="font-mono tnum">{formatBytes(p.masterBytes)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-clear/70" />
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Cloud className="h-3 w-3" />
              Metadata proxy · may cross
            </span>
            <span className="font-mono tnum">
              {formatBytes(p.proxyBytes)} <span className="text-faint">· {(ratio * 100).toFixed(2)}%</span>
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-3">
            <div className="h-full min-w-[3px] rounded-full bg-cloud" style={{ width: `${ratio * 100}%` }} />
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setShowProxy((v) => !v)}
        className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
        aria-expanded={showProxy}
      >
        <FileJson className="h-3 w-3" />
        {showProxy ? "Hide" : "Show"} proxy JSON <ChevronDown className={cn("h-3 w-3 transition-transform", showProxy && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {showProxy && (
          <motion.pre
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 200, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="scroll-thin mt-2 overflow-auto rounded-[4px] border border-hairline bg-surface-0 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground"
          >
            {JSON.stringify(p.proxy, null, 2)}
          </motion.pre>
        )}
      </AnimatePresence>
      <div className="mt-3 flex gap-2">
        <Segmented
          label="Link"
          value={p.link}
          onChange={p.onLinkChange}
          disabled={p.locked}
          options={[
            { value: "up", label: "Link up", icon: <Wifi className="h-3 w-3" />, tone: "clear" },
            { value: "down", label: "Drop link", icon: <WifiOff className="h-3 w-3" />, tone: "hold" },
          ]}
        />
        <Segmented
          label="Planner"
          value={p.provider}
          onChange={p.onProviderChange}
          disabled={p.locked || p.link === "down"}
          options={[
            { value: "scripted", label: "Scripted" },
            { value: "live", label: "Live" },
          ]}
        />
      </div>
      <p className="mt-2 text-[10.5px] leading-relaxed text-faint">{p.providerNote}</p>
      <div className="mt-3">
        {p.busy ? (
          <BusyLine {...p.busy} />
        ) : (
          <Btn variant="primary" className="w-full" disabled={p.locked} onClick={p.onSend}>
            {p.link === "down" ? (
              <>
                <HardDrive className="h-3.5 w-3.5" />
                Plan on device
              </>
            ) : (
              "Send proxy"
            )}
          </Btn>
        )}
      </div>
      {p.egress.length > 0 && (
        <div className="mt-3">
          <div className="eyebrow mb-1.5">Egress ledger</div>
          <ul className="divide-y divide-hairline rounded-[4px] border border-hairline">
            {[...p.egress].reverse().map((e) => {
              const s = EGRESS[e.status] ?? { label: e.status, tone: "neutral" as ChipTone };
              return (
                <motion.li key={e.seq} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="px-2.5 py-2 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-faint tnum">#{e.seq}</span>
                    <span className="capitalize">{e.kind ?? "plan"}</span>
                    <span className="truncate font-mono text-faint">{e.destination}</span>
                    <Chip tone={s.tone} className="ml-auto">
                      {s.label}
                    </Chip>
                  </div>
                  <div className="mt-1 flex items-center gap-3 font-mono text-[10px] text-faint tnum">
                    <span>
                      raw <span className="text-clear">{e.raw_media_bytes} B</span>
                    </span>
                    <span>sent {formatBytes(e.bytes)}</span>
                    <button
                      type="button"
                      className="ml-auto text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      onClick={() => void toggle(e.seq)}
                      aria-expanded={open === e.seq}
                    >
                      exact payload
                    </button>
                  </div>
                  {open === e.seq && (
                    <div className="mt-2 rounded-[3px] bg-surface-0 p-2">
                      <KV k="payload" v={formatBytes(e.payload_bytes)} />
                      <KV k="sha256" v={short(e.payload_sha256, 20)} />
                      <KV k="guard" v={e.guard} />
                      {e.reason && <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{e.reason}</p>}
                      <pre className="scroll-thin mt-2 max-h-[180px] overflow-auto font-mono text-[9.5px] leading-relaxed text-muted-foreground">{payload[e.seq] ?? "Loading…"}</pre>
                    </div>
                  )}
                </motion.li>
              );
            })}
          </ul>
        </div>
      )}
    </StepCard>
  );
}

export interface PlansStepProps {
  status: StepStatus;
  proposals: Proposal[];
  currentId?: string;
  verdicts: Record<string, Verdict | undefined>;
  onSelect: (id: string) => void;
}

export function PlansStep(p: PlansStepProps) {
  return (
    <StepCard n={2} title="Edit plans · model opinions" status={p.status}>
      {p.proposals.length === 0 && <p className="text-xs text-faint">No plans yet. The planner only sees the proxy.</p>}
      <div className="space-y-2">
        {[...p.proposals].reverse().map((pr) => {
          const device = pr.source !== "cloud";
          const v = p.verdicts[pr.id];
          return (
            <motion.button
              type="button"
              key={pr.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => p.onSelect(pr.id)}
              className={cn(
                "block w-full rounded-[5px] border p-2.5 text-left transition-colors",
                pr.id === p.currentId ? "border-hairline-strong bg-surface-2 ring-1 ring-brass/40" : "border-hairline opacity-70 hover:opacity-100",
              )}
            >
              <div className="flex items-center gap-1.5">
                <Chip tone={device ? "brass" : "cloud"}>
                  {device ? <HardDrive className="h-2.5 w-2.5" /> : <Cloud className="h-2.5 w-2.5" />}
                  {device ? "On device" : "Cloud"}
                </Chip>
                <span className="text-xs font-medium">{modelLabel(pr)}</span>
                <span className="font-mono text-[10px] text-faint">{pr.id}</span>
                <span className="ml-auto">{v ? <Chip tone={v}>{v}</Chip> : <Chip>unchecked</Chip>}</span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{pr.summary}</p>
              <div className="mt-1.5 grid grid-cols-2 gap-x-3">
                <KV k="logo hold" v={`${pr.plan.wordmark_hold.start}–${pr.plan.wordmark_hold.end}`} />
                <KV k="face blur" v={pr.plan.face_blur ? "on" : "off"} />
                <KV k="lower third" v={`${pr.plan.lower_third.start}–${pr.plan.lower_third.end}`} />
                <KV k="mode" v={pr.revises ? `${pr.mode} · revises ${pr.revises}` : pr.mode} />
              </div>
            </motion.button>
          );
        })}
      </div>
    </StepCard>
  );
}

const kindTone: Record<string, ChipTone> = { measured: "clear", geometry: "cloud", policy: "brass", layout: "neutral" };

function CheckRow({ c, jobId, onSeek }: { c: Check; jobId: string; onSeek: (frame: number) => void }) {
  const ev = isMeasured(c.evidence) ? c.evidence : null;
  return (
    <li className={cn("rounded-[5px] border p-2.5", c.passed ? "border-hairline" : "border-hold/45 bg-hold-dim")}>
      <div className="flex items-center gap-1.5">
        <span className={cn("flex h-4 w-4 items-center justify-center rounded-full", c.passed ? "bg-clear-dim text-clear" : "bg-hold text-primary-foreground")}>
          {c.passed ? <CheckIcon className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
        </span>
        <Chip tone={kindTone[c.kind] ?? "neutral"}>{c.kind}</Chip>
        <span className="truncate font-mono text-[10px] text-faint">{c.id}</span>
        <span className="ml-auto font-mono text-[10px] text-faint tnum">{c.interval ? `${c.interval.start}–${c.interval.end}` : "whole cut"}</span>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/85">{c.reason}</p>
      {ev && (
        <button type="button" onClick={() => onSeek(ev.worst_frame)} className="mt-2 flex w-full gap-2.5 text-left" title="Jump the monitor to this frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={frameUrl(jobId, ev.worst_frame, 320)}
            alt={`Evidence frame ${ev.worst_frame}`}
            className={cn("h-[54px] w-24 shrink-0 rounded-[3px] border object-cover", c.passed ? "border-clear/40" : "border-hold/60")}
          />
          <div className="min-w-0 flex-1 font-mono text-[10px] leading-[15px] text-muted-foreground tnum">
            <div>
              frame <span className="text-foreground">{ev.worst_frame}</span> · {ev.worst_timecode}
            </div>
            <div className={c.passed ? "text-clear" : "text-hold"}>
              {pct(ev.worst_coverage_bp)} covered · {ev.frames_examined} frames
            </div>
            <div className="truncate">sha {short(ev.worst_frame_sha256, 12)}</div>
          </div>
        </button>
      )}
    </li>
  );
}

export interface ChecksStepProps {
  status: StepStatus;
  jobId: string;
  verification: Verification | null;
  canCheck: boolean;
  onCheck: () => void;
  canRevise: boolean;
  reviseNote: string;
  onRevise: () => void;
  onSeek: (frame: number) => void;
  busy: Busy | null;
}

export function ChecksStep(p: ChecksStepProps) {
  const failed = p.verification?.checks.filter((c) => !c.passed).length ?? 0;
  return (
    <StepCard
      n={3}
      title="Cross-check against frames"
      status={p.status}
      aside={
        p.verification && (
          <span className="font-mono text-[10px] text-faint tnum">
            {p.verification.checks.length - failed}/{p.verification.checks.length} pass
          </span>
        )
      }
    >
      {!p.verification && !p.canCheck && <p className="text-xs text-faint">Every claim, and everything an edit implies, is checked against decoded frames on this workstation.</p>}
      {p.verification && (
        <ul className="space-y-2">
          {p.verification.checks.map((c) => (
            <CheckRow key={c.id} c={c} jobId={p.jobId} onSeek={p.onSeek} />
          ))}
        </ul>
      )}
      {p.busy ? (
        <div className="mt-3">
          <BusyLine {...p.busy} />
        </div>
      ) : (
        <>
          {p.canCheck && (
            <Btn variant="primary" className="mt-3 w-full" onClick={p.onCheck}>
              Cross-check &amp; sign
            </Btn>
          )}
          {p.canRevise && (
            <div className="mt-3">
              <Btn variant="primary" className="w-full" onClick={p.onRevise}>
                <RotateCcw className="h-3.5 w-3.5" />
                Revise with evidence
              </Btn>
              <p className="mt-1.5 text-[10px] leading-relaxed text-faint">{p.reviseNote}</p>
            </div>
          )}
        </>
      )}
    </StepCard>
  );
}

export interface ReceiptStepProps {
  status: StepStatus;
  receipt: Receipt | null;
  sig: null | { valid: boolean; reason: string; tampered: boolean };
  onVerify: () => void;
  onTamper: () => void;
  busy: Busy | null;
}

export function ReceiptStep(p: ReceiptStepProps) {
  const r = p.receipt;
  return (
    <StepCard n={4} title="Pre-publishability receipt" status={p.status}>
      {!r ? (
        <p className="text-xs text-faint">Signed after the cross-check. Measured facts and model opinions are kept apart.</p>
      ) : (
        <>
          <div className={cn("flex items-end justify-between rounded-[5px] border px-3 py-2", r.body.verdict === "hold" ? "border-hold/45 bg-hold-dim" : "border-clear/40 bg-clear-dim")}>
            <span className={cn("font-display text-[42px] leading-none", r.body.verdict === "hold" ? "text-hold" : "text-clear")}>{r.body.verdict.toUpperCase()}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{r.receipt_id}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-[5px] border border-clear/25 bg-surface-0 p-2">
              <div className="eyebrow mb-1 !text-clear">Measured · this workstation</div>
              <KV k="master" v={short(r.body.measured.asset_sha256)} />
              <KV k="frames" v={`${r.body.measured.frame_count} @ ${r.body.measured.fps}`} />
              <KV k="vision" v={r.body.measured.vision_method} />
              <KV k="template" v={short(r.body.measured.template_sha256)} />
              <KV k="ffmpeg" v={r.body.measured.ffmpeg} />
            </div>
            <div className="rounded-[5px] border border-cloud/25 bg-surface-0 p-2">
              <div className="eyebrow mb-1 !text-cloud">Opinion · from a model</div>
              <KV k="proposal" v={r.body.opinion.proposal_id} />
              <KV k="source" v={r.body.opinion.source} />
              <KV k="provider" v={r.body.opinion.provider} />
              <KV k="plan" v={short(r.body.opinion.proposal_sha256)} />
              <KV k="saw proxy" v={short(r.body.opinion.input_proxy_sha256)} />
            </div>
          </div>
          <div className="mt-2 space-y-0.5 rounded-[4px] bg-surface-0 px-2 py-1.5">
            <KV
              k={
                <span className="flex items-center gap-1">
                  <KeyRound className="h-3 w-3" />
                  {r.algorithm} key
                </span>
              }
              v={short(r.public_key, 22)}
            />
            <KV k="signature" v={short(r.signature, 22) + "…"} />
            <KV k="canonical" v={short(r.canonical_sha256, 22)} />
          </div>
          <div className="mt-2 flex gap-1.5">
            <Btn size="sm" className="flex-1" onClick={p.onVerify} disabled={!!p.busy}>
              <ShieldCheck className="h-3.5 w-3.5" />
              Verify signature
            </Btn>
            <Btn size="sm" className="flex-1" onClick={p.onTamper} disabled={!!p.busy}>
              <ShieldAlert className="h-3.5 w-3.5" />
              Tamper test
            </Btn>
            <a
              className="inline-flex h-7 items-center rounded-[5px] px-2.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              download={`${r.receipt_id}.json`}
              href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(r, null, 2))}`}
              aria-label="Download receipt"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="mt-2">
            {p.busy ? (
              <BusyLine {...p.busy} />
            ) : (
              <AnimatePresence mode="wait">
                {p.sig && p.sig.valid && (
                  <motion.div
                    key="v"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 rounded-[5px] border border-clear/40 bg-clear-dim px-2.5 py-2 text-xs text-clear"
                  >
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    Signature valid against the pinned workstation key.
                  </motion.div>
                )}
                {p.sig && !p.sig.valid && (
                  <motion.div
                    key="r"
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: [0, -4, 4, -2, 0] }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 rounded-[5px] border border-hold/50 bg-hold-dim px-2.5 py-2 text-xs text-hold"
                  >
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    {p.sig.tampered ? "Tampered copy rejected: the verdict was flipped after signing." : p.sig.reason}
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        </>
      )}
    </StepCard>
  );
}

export interface RenderStepProps {
  status: StepStatus;
  unlocked: boolean;
  hasReceipt: boolean;
  render: RenderOut | null;
  proofSrc: string | null;
  onRender: () => void;
  busy: Busy | null;
}

export function RenderStep(p: RenderStepProps) {
  return (
    <StepCard n={5} title="Render on device" status={p.status}>
      <div className={cn("flex items-center gap-2.5 rounded-[5px] border px-2.5 py-2 text-[11px]", p.unlocked ? "border-clear/35 text-clear" : "border-hold/35 text-hold")}>
        {p.unlocked ? <Unlock className="h-3.5 w-3.5 shrink-0" /> : <Lock className="h-3.5 w-3.5 shrink-0" />}
        <span className="text-muted-foreground">
          {p.unlocked ? "Unlocked by a valid CLEAR receipt for this exact plan and master." : "Locked. ffmpeg will not run without a valid CLEAR receipt for this plan."}
        </span>
      </div>
      <div className="mt-3">
        {p.busy ? (
          <BusyLine {...p.busy} />
        ) : (
          !p.render && (
            <Btn variant={p.unlocked ? "clear" : "secondary"} className="w-full" disabled={!p.hasReceipt} onClick={p.onRender}>
              <Play className="h-3.5 w-3.5" />
              Render proof cut
            </Btn>
          )
        )}
      </div>
      {p.render && p.proofSrc && (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="mt-1">
          <div className="relative overflow-hidden rounded-[4px] border border-clear/35">
            <video src={p.proofSrc} className="aspect-video w-full bg-black object-cover" controls muted playsInline autoPlay loop preload="auto" />
            <span className="glass pointer-events-none absolute left-2 top-2 rounded-[3px] px-1.5 py-0.5 font-mono text-[10px]">{p.render.output_name}</span>
          </div>
          <div className="mt-2">
            <KV k="renderer" v={p.render.renderer} />
            <KV k="size" v={formatBytes(p.render.bytes)} />
            <KV k="sha256" v={short(p.render.sha256, 16)} />
            <KV k="receipt" v={p.render.receipt_id} />
          </div>
        </motion.div>
      )}
    </StepCard>
  );
}
