"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { overlaps, tcToMs, type Cue, type Interval, type Plan, type VisionFrame } from "@/lib/job";

export interface TimelineProps {
  frames: VisionFrame[];
  fps: number;
  durationMs: number;
  thresholdBp: number;
  transcript: Cue[];
  occludedSpans: Interval[];
  plan: Plan | null;
  planSource?: "cloud" | "device";
  playhead: number;
  onSeek: (frame: number) => void;
}

const LABEL_W = 132;

export function Timeline(p: TimelineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const x = (tc: string) => `${(tcToMs(tc) / p.durationMs) * 100}%`;
  const w = (i: Interval) => `${((tcToMs(i.end) - tcToMs(i.start)) / p.durationMs) * 100}%`;

  const seekFrom = (e: PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const f = Math.floor(((e.clientX - r.left) / r.width) * p.frames.length);
    p.onSeek(Math.max(0, Math.min(p.frames.length - 1, f)));
  };
  const seconds = Array.from({ length: Math.floor(p.durationMs / 1000) + 1 }, (_, i) => i);
  const planBar = (i: Interval, label: string, hold: boolean) => {
    const bad = hold ? p.occludedSpans.map((o) => overlaps(i, o)).filter((o): o is Interval => !!o) : [];
    const span = tcToMs(i.end) - tcToMs(i.start);
    return (
      <div className="absolute inset-y-1" style={{ left: x(i.start), width: w(i) }}>
        <div
          className={cn(
            "relative h-full overflow-hidden rounded-[3px] border px-1.5 font-mono text-[10px] leading-[18px] tnum",
            p.planSource === "device" ? "border-brass/50 bg-brass-dim text-brass" : "border-cloud/45 bg-cloud-dim text-cloud",
          )}
        >
          {bad.map((b, k) => (
            <div
              key={k}
              className="hatch-hold absolute inset-y-0 border-x border-hold"
              style={{ left: `${((tcToMs(b.start) - tcToMs(i.start)) / span) * 100}%`, width: `${((tcToMs(b.end) - tcToMs(b.start)) / span) * 100}%` }}
            />
          ))}
          <span className="relative truncate">{label}</span>
        </div>
      </div>
    );
  };

  return (
    <section className="panel shrink-0 select-none overflow-hidden rounded-[6px]" aria-label="Timeline">
      <div className="flex">
        <div className="eyebrow flex shrink-0 items-center px-3" style={{ width: LABEL_W }}>
          Timeline
        </div>
        <div className="relative h-6 flex-1">
          {seconds.map((s) => (
            <span
              key={s}
              className="absolute top-1.5 -translate-x-1/2 font-mono text-[10px] text-faint tnum first:translate-x-0 last:-translate-x-full"
              style={{ left: `${((s * 1000) / p.durationMs) * 100}%` }}
            >
              {String(s).padStart(2, "0")}s
            </span>
          ))}
        </div>
      </div>
      <div className="relative">
        <Row label="Wordmark · measured" h="h-14">
          <div className="absolute inset-x-0 bottom-1 top-1 flex items-end gap-px">
            {p.frames.map((f) => (
              <div
                key={f.index}
                className={cn("flex-1 rounded-t-[1px]", f.wordmark_coverage_bp >= p.thresholdBp ? "bg-hold" : "bg-hairline-strong")}
                style={{ height: `${Math.max(4, (f.wordmark_coverage_bp / 10000) * 100)}%`, opacity: f.index === p.playhead ? 1 : 0.85 }}
              />
            ))}
          </div>
          <div className="absolute inset-x-0 border-t border-dashed border-hold/40" style={{ bottom: `calc(${(p.thresholdBp / 10000) * 100}% + 4px)` }} />
        </Row>
        <Row label="Transcript">
          {p.transcript.map((c, i) => (
            <div
              key={i}
              className="absolute inset-y-1 flex items-center gap-1.5 overflow-hidden rounded-[3px] border border-hairline-strong bg-surface-2 px-1.5"
              style={{ left: x(c.start), width: w(c) }}
              title={c.text}
            >
              <span className="rounded-[2px] bg-surface-3 px-1 font-mono text-[9px] uppercase text-muted-foreground">{c.lang}</span>
              <span className="truncate text-[11px] text-foreground/85" lang={c.lang}>
                {c.text}
              </span>
            </div>
          ))}
        </Row>
        <Row label="Plan · logo hold">{p.plan ? planBar(p.plan.wordmark_hold, `${p.plan.wordmark_hold.start}–${p.plan.wordmark_hold.end}`, true) : <Empty />}</Row>
        <Row label="Plan · lower third">{p.plan ? planBar(p.plan.lower_third, p.plan.lower_third.text, false) : <Empty />}</Row>

        <div
          ref={ref}
          className="absolute inset-y-0 right-0 cursor-ew-resize touch-none"
          style={{ left: LABEL_W }}
          role="slider"
          tabIndex={0}
          aria-label="Playhead"
          aria-valuemin={0}
          aria-valuemax={p.frames.length - 1}
          aria-valuenow={p.playhead}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            seekFrom(e);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) seekFrom(e);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") p.onSeek(Math.min(p.frames.length - 1, p.playhead + (e.shiftKey ? p.fps : 1)));
            if (e.key === "ArrowLeft") p.onSeek(Math.max(0, p.playhead - (e.shiftKey ? p.fps : 1)));
          }}
        >
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-foreground shadow-[0_0_10px_oklch(1_0_0/60%)]"
            style={{ left: `${((p.playhead + 0.5) / p.frames.length) * 100}%` }}
          >
            <div className="absolute -left-[5px] -top-0.5 h-2.5 w-[11px] rounded-b-[3px] bg-foreground" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Empty() {
  return <div className="absolute inset-y-1 left-0 right-0 flex items-center text-[11px] text-faint/70">No plan yet</div>;
}

function Row({ label, children, h = "h-7" }: { label: string; children: ReactNode; h?: string }) {
  return (
    <div className="flex border-t border-hairline">
      <div className="flex shrink-0 items-center px-3 text-[11px] text-faint" style={{ width: LABEL_W }}>
        {label}
      </div>
      <div className={cn("relative flex-1", h)}>{children}</div>
    </div>
  );
}
