"use client";

import { useCallback, useRef } from "react";
import type { Job, Proposal } from "@/lib/api";
import { tcMs } from "@/lib/format";

interface Props {
  job: Job;
  frame: number;
  proposal: Proposal | null;
  onSeek: (index: number) => void;
}

export default function Timeline({ job, frame, proposal, onSeek }: Props) {
  const lane = useRef<HTMLDivElement>(null);
  const { frames, fps, frame_count: count, threshold } = job.vision;
  const duration = job.asset.duration_ms;
  const pos = (ms: number) => `${(ms / duration) * 100}%`;
  const width = (start: number, end: number) => `${((end - start) / duration) * 100}%`;

  const seekFrom = useCallback(
    (clientX: number) => {
      const rect = lane.current?.getBoundingClientRect();
      if (!rect) return;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onSeek(Math.min(count - 1, Math.floor(ratio * count)));
    },
    [count, onSeek],
  );

  const occluded = job.vision.tracks.find((track) => track.track_id === "wordmark")?.spans.filter((span) => !span.visible) ?? [];
  const hold = proposal?.plan.wordmark_hold;
  const lower = proposal?.plan.lower_third;
  const holdStart = hold ? tcMs(hold.start) : 0;
  const holdEnd = hold ? tcMs(hold.end) : 0;
  const conflicts = occluded
    .map((span) => [Math.max(holdStart, tcMs(span.start)), Math.min(holdEnd, tcMs(span.end))] as const)
    .filter(([a, b]) => hold && b > a);

  const seconds = Array.from({ length: Math.floor(duration / 1000) + 1 }, (_, i) => i);

  return (
    <div
      className="timeline"
      onPointerDown={(event) => {
        (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
        seekFrom(event.clientX);
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) seekFrom(event.clientX);
      }}
      role="slider"
      aria-label="Playhead"
      aria-valuemin={0}
      aria-valuemax={count - 1}
      aria-valuenow={frame}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") onSeek(Math.min(count - 1, frame + (event.shiftKey ? fps : 1)));
        if (event.key === "ArrowLeft") onSeek(Math.max(0, frame - (event.shiftKey ? fps : 1)));
      }}
    >
      <div className="tl-labels">
        <span />
        <span>Wordmark coverage · measured</span>
        <span>Transcript</span>
        <span>Plan · logo hold</span>
        <span>Plan · lower third</span>
      </div>
      <div className="tl-lanes" ref={lane}>
        <div className="tl-ruler">
          {seconds.map((s) => (
            <span key={s} style={{ left: pos(s * 1000) }} className="mono">
              {String(s).padStart(2, "0")}s
            </span>
          ))}
        </div>
        <div className="tl-row tl-coverage">
          {frames.map((f) => (
            <i
              key={f.index}
              style={{ height: `${Math.max(4, f.wordmark_coverage_bp / 100)}%` }}
              className={f.wordmark_coverage_bp >= threshold.occluded_bp ? "bar bar-bad" : "bar"}
            />
          ))}
        </div>
        <div className="tl-row">
          {job.transcript.map((cue) => (
            <div
              key={cue.start}
              className="tl-block tl-cue"
              style={{ left: pos(tcMs(cue.start)), width: width(tcMs(cue.start), tcMs(cue.end)) }}
              title={cue.text}
            >
              <b>{cue.lang}</b> {cue.text}
            </div>
          ))}
        </div>
        <div className="tl-row">
          {hold && (
            <div className="tl-block tl-hold" style={{ left: pos(holdStart), width: width(holdStart, holdEnd) }}>
              {hold.start}–{hold.end}
            </div>
          )}
          {conflicts.map(([a, b]) => (
            <div key={a} className="tl-block tl-conflict" style={{ left: pos(a), width: width(a, b) }} title="Plan overlaps measured occlusion" />
          ))}
        </div>
        <div className="tl-row">
          {lower && (
            <div className="tl-block tl-lower" style={{ left: pos(tcMs(lower.start)), width: width(tcMs(lower.start), tcMs(lower.end)) }}>
              {lower.text}
            </div>
          )}
        </div>
        <div className="tl-playhead" style={{ left: pos(((frame + 0.5) * 1000) / fps) }} />
      </div>
    </div>
  );
}
