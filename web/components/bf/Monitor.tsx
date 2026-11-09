"use client";

import { Pause, Play, ShieldCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { pct, short, tcToMs, type Plan, type Track, type VisionFrame } from "@/lib/job";

export interface MonitorProps {
  frame: VisionFrame;
  frameCount: number;
  fps: number;
  videoSrc: string;
  width: number;
  height: number;
  tracks: Track[];
  occludedThresholdBp: number;
  plan: Plan | null;
  planSource?: "cloud" | "device";
  playing: boolean;
  onTogglePlay: () => void;
  onFrame: (index: number) => void;
  onEnded: () => void;
  meta: string;
}

export function Monitor(p: MonitorProps) {
  const video = useRef<HTMLVideoElement>(null);
  const { frame, width: W, height: H, fps, frameCount, onFrame, onEnded } = p;
  const wm = p.tracks.find((t) => t.kind === "logo");
  const talent = p.tracks.find((t) => t.kind === "person");
  const occluded = frame.wordmark_coverage_bp >= p.occludedThresholdBp;
  const t = tcToMs(frame.timecode);
  const inHold = p.plan && t >= tcToMs(p.plan.wordmark_hold.start) && t < tcToMs(p.plan.wordmark_hold.end);
  const inLower = p.plan && t >= tcToMs(p.plan.lower_third.start) && t < tcToMs(p.plan.lower_third.end);
  const planColor = p.planSource === "device" ? "var(--brass)" : "var(--cloud)";

  // Paused: seek the real decoded master to the playhead frame.
  useEffect(() => {
    const el = video.current;
    if (!el || p.playing) return;
    const target = (frame.index + 0.5) / fps;
    if (Math.abs(el.currentTime - target) > 0.5 / fps) el.currentTime = target;
  }, [frame.index, fps, p.playing]);

  // Playing: follow the video frame-accurately.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (!p.playing) {
      el.pause();
      return;
    }
    let handle = 0;
    let live = true;
    const tick = () => {
      if (!live) return;
      onFrame(Math.min(frameCount - 1, Math.floor(el.currentTime * fps)));
      handle = requestAnimationFrame(tick);
    };
    if (el.ended || el.currentTime >= el.duration - 0.05) el.currentTime = 0;
    void el.play().catch(() => onEnded());
    handle = requestAnimationFrame(tick);
    return () => {
      live = false;
      cancelAnimationFrame(handle);
    };
  }, [p.playing, fps, frameCount, onFrame, onEnded]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative aspect-video h-full max-h-full max-w-full overflow-hidden rounded-[4px] border border-hairline-strong bg-surface-0 shadow-[0_30px_80px_-30px_oklch(0_0_0/90%)]">
            <video
              ref={video}
              src={p.videoSrc}
              muted
              playsInline
              preload="auto"
              onEnded={onEnded}
              aria-label={`Local master, frame ${frame.index}`}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden>
              <rect x={W * 0.05} y={H * 0.05} width={W * 0.9} height={H * 0.9} fill="none" stroke="white" strokeOpacity=".06" />
              {talent?.box && (
                <g>
                  <rect x={talent.box.x} y={talent.box.y} width={talent.box.w} height={talent.box.h} fill="none" stroke="var(--brass)" strokeWidth="2" strokeDasharray="6 5" />
                  <text x={talent.box.x} y={talent.box.y - 10} fill="var(--brass)" fontSize="15" fontFamily="var(--font-mono)" letterSpacing="1.5">
                    TALENT · REDACT ON RENDER
                  </text>
                </g>
              )}
              {wm?.box && (
                <g>
                  <rect
                    x={wm.box.x - 6}
                    y={wm.box.y - 6}
                    width={wm.box.w + 12}
                    height={wm.box.h + 12}
                    fill={occluded ? "oklch(0.64 0.215 28 / 0.12)" : "none"}
                    stroke={occluded ? "var(--hold)" : "var(--clear)"}
                    strokeWidth={occluded ? 3 : 2}
                    strokeDasharray={occluded ? undefined : "8 6"}
                  />
                  <rect x={wm.box.x - 6} y={wm.box.y - 36} width={occluded ? 330 : 300} height={26} fill={occluded ? "var(--hold)" : "oklch(0.12 0 0 / .75)"} />
                  <text
                    x={wm.box.x + 4}
                    y={wm.box.y - 18}
                    fill={occluded ? "oklch(0.15 0 0)" : "var(--clear)"}
                    fontSize="15"
                    fontWeight="600"
                    fontFamily="var(--font-mono)"
                    letterSpacing="1"
                  >
                    {occluded ? `${pct(frame.wordmark_coverage_bp)} COVERED · MEASURED` : "WORDMARK VISIBLE · MEASURED"}
                  </text>
                </g>
              )}
              {wm?.box && p.plan && (
                <g opacity={inHold ? 1 : 0.35}>
                  {(() => {
                    const b = wm.box!;
                    const x0 = b.x - 18, y0 = b.y - 18, x1 = b.x + b.w + 18, y1 = b.y + b.h + 18, L = 26;
                    return (
                      <path
                        d={`M${x0} ${y0 + L}V${y0}H${x0 + L} M${x1 - L} ${y0}H${x1}V${y0 + L} M${x1} ${y1 - L}V${y1}H${x1 - L} M${x0 + L} ${y1}H${x0}V${y1 - L}`}
                        stroke={planColor}
                        strokeWidth="2.5"
                        fill="none"
                      />
                    );
                  })()}
                  <text x={wm.box.x + wm.box.w + 18} y={wm.box.y + wm.box.h + 42} textAnchor="end" fill={planColor} fontSize="14" fontFamily="var(--font-mono)" letterSpacing="1.5">
                    PLAN · LOGO HOLD {p.plan.wordmark_hold.start}–{p.plan.wordmark_hold.end}
                  </text>
                </g>
              )}
              {p.plan && inLower && (
                <g>
                  <rect x={0} y={600} width={W} height={84} fill="oklch(0 0 0 / .35)" stroke={planColor} strokeOpacity=".7" strokeDasharray="5 6" />
                  <text x={64} y={650} fill="white" fillOpacity=".75" fontSize="26" fontFamily="var(--font-display)">
                    {p.plan.lower_third.text}
                  </text>
                  <text x={W - 64} y={648} textAnchor="end" fill={planColor} fontSize="13" fontFamily="var(--font-mono)" letterSpacing="1.5">
                    LOWER THIRD · PLAN
                  </text>
                </g>
              )}
            </svg>
            <div className="glass absolute left-3 top-3 flex items-center gap-3 rounded-[4px] px-2.5 py-1 font-mono text-[11px] tnum">
              <span className="text-foreground">{frame.timecode}</span>
              <span className="text-faint">
                frame <span className="text-foreground/90">{String(frame.index).padStart(3, "0")}</span>/{frameCount - 1}
              </span>
              <span className="text-faint">
                sha <span className="text-foreground/80">{short(frame.sha256)}</span>
              </span>
            </div>
            <div className="glass absolute right-3 top-3 flex items-center gap-1.5 rounded-[4px] px-2.5 py-1 text-[11px]">
              <ShieldCheck className="h-3.5 w-3.5 text-clear" />
              <span>Raw master · local only</span>
            </div>
            <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_oklch(0_0_0/55%)]" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-faint">
        <button
          type="button"
          onClick={p.onTogglePlay}
          aria-label={p.playing ? "Pause" : "Play"}
          className="inline-flex h-7 items-center gap-1.5 rounded-[4px] border border-hairline-strong bg-surface-2 px-2.5 text-xs text-foreground hover:bg-surface-3"
        >
          {p.playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {p.playing ? "Pause" : "Play"}
        </button>
        <span className="font-mono tnum">{p.meta}</span>
        <span className={cn("ml-auto font-mono tnum", occluded ? "text-hold" : "text-faint")}>coverage {pct(frame.wordmark_coverage_bp)}</span>
      </div>
    </div>
  );
}
