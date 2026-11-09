"use client";

import { useEffect, useRef } from "react";
import type { Job, Proposal } from "@/lib/api";
import { mediaUrl } from "@/lib/api";
import { pct, short, tcMs } from "@/lib/format";

interface Props {
  job: Job;
  frame: number;
  playing: boolean;
  proposal: Proposal | null;
  onFrame: (index: number) => void;
  onPlayingChange: (playing: boolean) => void;
}

const BOX = { wordmark: { x: 800, y: 230, w: 380, h: 150 }, face: { x: 196, y: 318, w: 112, h: 132 }, lower: { x: 0, y: 600, w: 1280, h: 84 } };

function inside(ms: number, interval?: { start: string; end: string } | null): boolean {
  return Boolean(interval) && ms >= tcMs(interval!.start) && ms < tcMs(interval!.end);
}

export default function Monitor({ job, frame, playing, proposal, onFrame, onPlayingChange }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const fps = job.vision.fps;
  const record = job.vision.frames[frame] ?? job.vision.frames[0];
  const ms = (frame * 1000) / fps;
  const covered = record.wordmark_coverage_bp >= job.vision.threshold.occluded_bp;
  const tracks = Object.fromEntries(job.vision.tracks.map((track) => [track.track_id, track]));
  const wordmark = tracks.wordmark?.box ?? BOX.wordmark;
  const face = tracks.talent?.box ?? BOX.face;
  const plan = proposal?.plan;
  const holdActive = inside(ms, plan?.wordmark_hold);
  const lowerActive = inside(ms, plan?.lower_third);

  // Seek when the playhead moves while paused.
  useEffect(() => {
    const element = video.current;
    if (!element || playing) return;
    const target = (frame + 0.5) / fps;
    if (Math.abs(element.currentTime - target) > 0.5 / fps) element.currentTime = target;
  }, [frame, fps, playing]);

  // Follow playback frame-accurately.
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (!playing) {
      element.pause();
      return;
    }
    let handle = 0;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      onFrame(Math.min(job.vision.frame_count - 1, Math.floor(element.currentTime * fps)));
      handle = requestAnimationFrame(tick);
    };
    void element.play().catch(() => onPlayingChange(false));
    handle = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
    };
  }, [playing, fps, job.vision.frame_count, onFrame, onPlayingChange]);

  return (
    <div className="monitor">
      <div className="monitor-frame">
        <video
          ref={video}
          src={mediaUrl(job.id, "master.mp4", job.asset.sha256.slice(0, 8))}
          muted
          playsInline
          preload="auto"
          onEnded={() => onPlayingChange(false)}
          aria-label="Local master"
        />
        <svg viewBox={`0 0 ${job.asset.width} ${job.asset.height}`} className="overlay" aria-hidden>
          <rect
            x={wordmark.x}
            y={wordmark.y}
            width={wordmark.w}
            height={wordmark.h}
            className={covered ? "ov-box ov-bad" : "ov-box ov-good"}
          />
          <text x={wordmark.x} y={wordmark.y - 12} className={covered ? "ov-label ov-bad-text" : "ov-label ov-good-text"}>
            WORDMARK · {covered ? `${pct(record.wordmark_coverage_bp)} COVERED` : "VISIBLE"} · MEASURED
          </text>
          {holdActive && (
            <g className={covered ? "ov-hold ov-hold-bad" : "ov-hold"}>
              <rect x={wordmark.x - 14} y={wordmark.y - 34} width={wordmark.w + 28} height={wordmark.h + 48} />
              <text x={wordmark.x + wordmark.w + 14} y={wordmark.y + wordmark.h + 34} textAnchor="end" className="ov-label">
                PLAN · LOGO HOLD
              </text>
            </g>
          )}
          <rect x={face.x} y={face.y} width={face.w} height={face.h} className="ov-face" />
          <text x={face.x} y={face.y - 12} className="ov-label ov-face-text">
            TALENT · REDACT ON RENDER
          </text>
          {lowerActive && plan && (
            <g className="ov-lower">
              <rect x={BOX.lower.x} y={BOX.lower.y} width={BOX.lower.w} height={BOX.lower.h} />
              <text x={48} y={BOX.lower.y + 54}>
                {plan.lower_third.text}
              </text>
            </g>
          )}
        </svg>
        <div className="hud hud-left mono">
          <span>{record.timecode}</span>
          <span>
            frame {record.index}/{job.vision.frame_count - 1}
          </span>
          <span>sha {short(record.sha256, 10)}</span>
        </div>
        <div className="hud hud-right">
          <span className="dot dot-local" /> Raw master · local only
        </div>
      </div>
      <div className="monitor-bar">
        <button className="btn btn-ghost btn-sm" onClick={() => onPlayingChange(!playing)} aria-label={playing ? "Pause" : "Play"}>
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <span className="muted">
          {job.asset.width}×{job.asset.height} · {fps} fps · {job.vision.frame_count} frames hashed · ffmpeg {job.asset.ffmpeg}
        </span>
      </div>
    </div>
  );
}
