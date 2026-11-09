// BrandForward demo, v2 structure from the Lovable review: cold open on the HOLD,
// one UI element fills each console shot, one-line captions, a real-time live
// Claude segment, and a visible badge wherever time is compressed.
import { AbsoluteFill, Easing, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadSans } from "@remotion/google-fonts/Inter";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import markers from "../public/markers.json";

const { fontFamily: SANS } = loadSans("normal", { weights: ["400", "600"], subsets: ["latin"] });
const { fontFamily: SERIF } = loadSerif("normal", { subsets: ["latin"] });
const { fontFamily: MONO } = loadMono("normal", { weights: ["400", "600"], subsets: ["latin"] });

export const FPS = 30;
const OUT_W = 1920;
const OUT_H = 1080;
const CAP_W = 1600;
const CAP_H = 900;

type Box = { x: number; y: number; w: number; h: number };
type Tone = "hold" | "clear" | "brass" | "cloud";
const M = markers as unknown as Record<string, number> & { boxes: Record<string, Record<string, Box>> };
const B = (beat: string, el: string): Box => M.boxes[beat]?.[el] ?? { x: 0, y: 0, w: CAP_W, h: CAP_H };
const ms = (beat: string, offset = 0) => (M[beat] ?? 0) + offset;
const sec = (s: number) => Math.round(s * FPS);

const C = {
  bg: "#07080a",
  ink: "#f2efe8",
  dim: "#a39f96",
  faint: "#6b675f",
  brass: "#e0b56a",
  hold: "#ef5b3c",
  clear: "#6fd6a0",
  cloud: "#8fb8d8",
  line: "rgba(242,239,232,0.12)",
};
const TONE: Record<Tone, string> = { hold: C.hold, clear: C.clear, brass: C.brass, cloud: C.cloud };

// ---------------------------------------------------------------- framing

interface Shot {
  fromMs: number; // capture time where the shot starts
  dur: number; // seconds in the output
  box: Box; // capture-space element to frame
  fill?: number; // fraction of the output the element should fill
  maxScale?: number;
  rate?: number;
  pad?: number; // capture px of breathing room around the box
}

function framing(shot: Shot) {
  const pad = shot.pad ?? 16;
  const bx = Math.max(0, shot.box.x - pad);
  const by = Math.max(0, shot.box.y - pad);
  const bw = Math.min(CAP_W - bx, shot.box.w + pad * 2);
  const bh = Math.min(CAP_H - by, shot.box.h + pad * 2);
  const fill = shot.fill ?? 0.82;
  const base = OUT_W / CAP_W;
  const s = Math.max(base, Math.min((OUT_W * fill) / bw, (OUT_H * fill) / bh, shot.maxScale ?? 4.2));
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const tx = clamp(OUT_W / 2 - s * (bx + bw / 2), OUT_W - s * CAP_W, 0);
  const ty = clamp(OUT_H / 2 - s * (by + bh / 2), OUT_H - s * CAP_H, 0);
  return { s, tx, ty };
}

const ShotView: React.FC<{ shot: Shot }> = ({ shot }) => {
  const frame = useCurrentFrame();
  const { s, tx, ty } = framing(shot);
  // A gentle 8-frame push-in; hard cuts between shots.
  const k = interpolate(frame, [0, 8], [0.95, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const cx = OUT_W / 2;
  const cy = OUT_H / 2;
  const x = cx + (tx - cx) * k;
  const y = cy + (ty - cy) * k;
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: CAP_W, height: CAP_H, transformOrigin: "0 0", transform: `translate(${x}px, ${y}px) scale(${s * k})` }}>
        <OffthreadVideo src={staticFile("capture.webm")} startFrom={Math.round((shot.fromMs / 1000) * FPS)} playbackRate={shot.rate ?? 1} muted style={{ width: CAP_W, height: CAP_H }} />
      </div>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)" }} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- overlays

const Caption: React.FC<{ text: string; tone?: Tone; duration: number }> = ({ text, tone = "brass", duration }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 6, duration - 6, duration], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 64, bottom: 60, opacity: o, transform: `translateY(${(1 - o) * 10}px)` }}>
      <div
        style={{
          fontFamily: SANS,
          fontWeight: 600,
          fontSize: 48,
          color: C.ink,
          padding: "16px 28px",
          background: "rgba(7,8,10,0.86)",
          borderLeft: `6px solid ${TONE[tone]}`,
          borderRadius: 10,
          boxShadow: "0 18px 50px rgba(0,0,0,0.5)",
          letterSpacing: -0.5,
        }}
      >
        {text}
      </div>
    </div>
  );
};

const Badge: React.FC<{ text: string; tone?: Tone }> = ({ text, tone = "brass" }) => (
  <div
    style={{
      position: "absolute",
      right: 56,
      top: 48,
      fontFamily: MONO,
      fontWeight: 600,
      fontSize: 26,
      letterSpacing: 2,
      color: TONE[tone],
      padding: "10px 18px",
      border: `2px solid ${TONE[tone]}`,
      borderRadius: 8,
      background: "rgba(7,8,10,0.8)",
    }}
  >
    {text}
  </div>
);

const Grain: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        "radial-gradient(1200px 700px at 20% 0%, rgba(224,181,106,0.08), transparent 60%), radial-gradient(900px 600px at 100% 100%, rgba(143,184,216,0.06), transparent 60%)",
    }}
  />
);

const Rise: React.FC<{ delay?: number; children: React.ReactNode }> = ({ delay = 0, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return <div style={{ opacity: s, transform: `translateY(${(1 - s) * 20}px)` }}>{children}</div>;
};

function fade(frame: number, duration: number, f = 8) {
  return interpolate(frame, [0, f, duration - f, duration], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

const Kicker: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = C.brass }) => (
  <div style={{ fontFamily: MONO, fontSize: 24, letterSpacing: 6, textTransform: "uppercase", color }}>{children}</div>
);

// ---------------------------------------------------------------- cards

const TitleCard: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg, opacity: fade(frame, duration), justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <Grain />
      <Rise>
        <Kicker>Built for Lenovo ThinkStation P8 · RTX PRO 6000 Blackwell</Kicker>
      </Rise>
      <Rise delay={6}>
        <div style={{ fontFamily: SERIF, fontSize: 200, color: C.ink, lineHeight: 1, marginTop: 28, letterSpacing: -4 }}>
          Brand<span style={{ color: C.brass }}>Forward</span>
        </div>
      </Rise>
      <Rise delay={14}>
        <div style={{ fontFamily: SANS, fontSize: 46, color: C.ink, marginTop: 28, opacity: 0.9 }}>Verify unreleased video. The footage never leaves the workstation.</div>
      </Rise>
    </AbsoluteFill>
  );
};

const ProblemCard: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const strike = interpolate(frame, [18, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ background: C.bg, opacity: fade(frame, duration), justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <Grain />
      <div style={{ width: 150, height: 150, marginBottom: 46 }}>
        <svg viewBox="0 0 100 100" width={150} height={150}>
          <path d="M30 70 a18 18 0 0 1 2-36 a24 24 0 0 1 44 6 a15 15 0 0 1-2 30 z" fill="none" stroke={C.cloud} strokeWidth="4" />
          <path d="M50 74 V44 M40 54 L50 44 L60 54" fill="none" stroke={C.cloud} strokeWidth="4" strokeLinecap="round" />
          <line x1="14" y1="86" x2={14 + 72 * strike} y2={86 - 72 * strike} stroke={C.hold} strokeWidth="7" strokeLinecap="round" />
        </svg>
      </div>
      <Rise delay={4}>
        <div style={{ fontFamily: SERIF, fontSize: 92, color: C.ink, lineHeight: 1.05, maxWidth: 1500 }}>
          Cloud AI wants your masters. <span style={{ color: C.hold, fontStyle: "italic" }}>Then it guesses.</span>
        </div>
      </Rise>
    </AbsoluteFill>
  );
};

const BoundaryCard: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [20, 90], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  return (
    <AbsoluteFill style={{ background: C.bg, opacity: fade(frame, duration), padding: "0 120px", justifyContent: "center" }}>
      <Grain />
      <Rise>
        <Kicker>The trust boundary</Kicker>
      </Rise>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 260px 1fr", marginTop: 48, alignItems: "stretch" }}>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 20, padding: 48, background: "rgba(255,255,255,0.02)" }}>
          <div style={{ fontFamily: MONO, color: C.clear, fontSize: 26, letterSpacing: 4 }}>WORKSTATION</div>
          <div style={{ fontFamily: SERIF, color: C.ink, fontSize: 84, marginTop: 18, lineHeight: 1 }}>Every pixel stays.</div>
          <div style={{ marginTop: 34, fontFamily: MONO, color: C.dim, fontSize: 32 }}>master.mp4 · 30.7 MB</div>
        </div>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 3, background: `repeating-linear-gradient(${C.brass} 0 12px, transparent 12px 24px)` }} />
          <div
            style={{
              position: "absolute",
              top: "40%",
              left: `${-30 + t * 110}%`,
              fontFamily: MONO,
              fontWeight: 600,
              fontSize: 30,
              color: C.bg,
              background: C.brass,
              padding: "10px 16px",
              borderRadius: 8,
              whiteSpace: "nowrap",
            }}
          >
            {(2.0 * t).toFixed(1)} KB →
          </div>
          <div style={{ position: "absolute", bottom: 6, width: "100%", textAlign: "center", fontFamily: MONO, color: C.dim, fontSize: 22 }}>
            raw media sent
            <div style={{ color: C.clear, fontSize: 40, fontWeight: 600 }}>0 B</div>
          </div>
        </div>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 20, padding: 48, background: "rgba(143,184,216,0.03)" }}>
          <div style={{ fontFamily: MONO, color: C.cloud, fontSize: 26, letterSpacing: 4 }}>CLOUD MODEL</div>
          <div style={{ fontFamily: SERIF, color: C.ink, fontSize: 84, marginTop: 18, lineHeight: 1 }}>Plans are opinions.</div>
          <div style={{ marginTop: 34, fontFamily: MONO, color: C.dim, fontSize: 32 }}>proxy · 2.0 KB · no pixels</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const HardwareCard: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const fill = interpolate(frame, [16, 60], [0, 33 / 96], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const rows = [
    ["Gemma 4 31B planner (Q8)", "33 GB, measured on this Mac"],
    ["+ SAM 3.1 frame tracking", "replaces template-diff vision"],
    ["+ Whisper transcription", "replaces the fixture transcript"],
    ["+ 4K decode and ffmpeg render", "next to the footage, at once"],
  ];
  return (
    <AbsoluteFill style={{ background: C.bg, opacity: fade(frame, duration), padding: "0 140px", justifyContent: "center" }}>
      <Grain />
      <Rise>
        <Kicker>Why it needs an RTX PRO 6000 · 96 GB</Kicker>
      </Rise>
      <Rise delay={6}>
        <div style={{ fontFamily: SERIF, fontSize: 92, color: C.ink, marginTop: 20, lineHeight: 1 }}>All of it, at once, on one machine.</div>
      </Rise>
      <div style={{ marginTop: 40, height: 34, borderRadius: 8, background: "rgba(255,255,255,0.06)", overflow: "hidden", position: "relative" }}>
        <div style={{ width: `${fill * 100}%`, height: "100%", background: C.brass }} />
        <div style={{ position: "absolute", right: 14, top: 2, fontFamily: MONO, fontSize: 24, color: C.dim }}>96 GB</div>
      </div>
      <div style={{ marginTop: 34, display: "grid", gap: 16 }}>
        {rows.map(([a, b], i) => (
          <Rise key={a} delay={20 + i * 8}>
            <div style={{ display: "grid", gridTemplateColumns: "780px 1fr", fontSize: 36, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
              <span style={{ fontFamily: SANS, color: C.ink, fontWeight: 600 }}>{a}</span>
              <span style={{ fontFamily: SANS, color: C.dim }}>{b}</span>
            </div>
          </Rise>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg, opacity: fade(frame, duration, 10), justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <Grain />
      <Rise>
        <div style={{ fontFamily: SERIF, fontSize: 170, color: C.ink, letterSpacing: -3 }}>
          Brand<span style={{ color: C.brass }}>Forward</span>
        </div>
      </Rise>
      <Rise delay={8}>
        <div style={{ fontFamily: SANS, fontSize: 46, color: C.ink, marginTop: 20 }}>Pixels stay. Models propose. Frames decide. Receipts prove.</div>
      </Rise>
      <Rise delay={16}>
        <div style={{ fontFamily: MONO, fontSize: 36, color: C.brass, marginTop: 44, fontWeight: 600 }}>github.com/ankitshah009/brandforward</div>
      </Rise>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- timeline

interface Scene {
  duration: number; // seconds
  render: (frames: number) => React.ReactNode;
}

function shotsScene(shots: Shot[], caps: { at: number; text: string; tone?: Tone }[], badge?: { text: string; tone?: Tone }): Scene {
  const duration = shots.reduce((t, s) => t + s.dur, 0);
  return {
    duration,
    render: () => {
      let cursor = 0;
      const total = sec(duration);
      return (
        <AbsoluteFill>
          {shots.map((shot, i) => {
            const from = sec(cursor);
            cursor += shot.dur;
            return (
              <Sequence key={i} from={from} durationInFrames={sec(shot.dur)}>
                <ShotView shot={shot} />
              </Sequence>
            );
          })}
          {caps.map((c, i) => {
            const from = sec(c.at);
            const to = i + 1 < caps.length ? sec(caps[i + 1].at) : total;
            return (
              <Sequence key={`c${i}`} from={from} durationInFrames={Math.max(1, to - from)}>
                <Caption text={c.text} tone={c.tone} duration={to - from} />
              </Sequence>
            );
          })}
          {badge && <Badge text={badge.text} tone={badge.tone} />}
        </AbsoluteFill>
      );
    },
  };
}

const card = (duration: number, Card: React.FC<{ duration: number }>): Scene => ({ duration, render: (f) => <Card duration={f} /> });

export function scenes(): Scene[] {
  const liveWait = (ms("live_done") - ms("live_start")) / 1000;
  const localWait = (ms("local_done") - ms("local_start")) / 1000;
  const localRate = Math.max(1, Math.round(localWait / 3.5));
  const liveA = 1.8;
  const liveB = liveWait + 0.6;
  return [
    // 1. Cold open: the occluded frame, then the verdict.
    shotsScene(
      [
        { fromMs: ms("hold", 400), dur: 1.6, box: B("hold", "monitor"), fill: 0.95 },
        { fromMs: ms("hold", 2000), dur: 2.4, box: B("hold", "verdict"), fill: 0.92 },
      ],
      [{ at: 0.2, text: "Frame 111. Logo 65.9% covered. HOLD.", tone: "hold" }],
    ),
    card(4, TitleCard),
    card(5, ProblemCard),
    card(6, BoundaryCard),
    // 5. Decode and measure on device.
    shotsScene([{ fromMs: ms("play", 1200), dur: 6, box: B("console", "monitor"), fill: 0.95 }], [{ at: 0.2, text: "144 frames decoded, hashed and measured here." }]),
    // 6. The scripted cloud plan.
    shotsScene(
      // 0.6x: the card is static, and real time would run into the next click before the HOLD beat.
      [{ fromMs: ms("cloud_plan", 200), dur: 5, box: B("cloud_plan", "plan"), fill: 0.8, maxScale: 3.2, rate: 0.6 }],
      [{ at: 0.2, text: "Cloud plan: hold the logo at 03.900.", tone: "cloud" }],
      { text: "SCRIPTED PLAN · REPLAY", tone: "cloud" },
    ),
    // 7. HOLD with evidence, render locked.
    shotsScene(
      [
        { fromMs: ms("hold", 300), dur: 4, box: B("hold", "verdict"), fill: 0.92 },
        { fromMs: ms("render_refused", -300), dur: 4, box: B("render_refused", "alert"), fill: 0.86, maxScale: 2.6 },
      ],
      [
        { at: 0.2, text: "HOLD. The frames disagree.", tone: "hold" },
        { at: 4, text: "So ffmpeg refuses to render.", tone: "hold" },
      ],
    ),
    // 8. Revise with evidence: HOLD turns CLEAR in place.
    shotsScene([{ fromMs: ms("revised", -1600), dur: 6, box: B("clear", "verdict"), fill: 0.92 }], [{ at: 0.2, text: "Only failed checks go back. Never pixels.", tone: "clear" }]),
    // 9. LIVE: Claude Opus 5.5, real API, real time.
    shotsScene(
      [
        { fromMs: ms("live_toggle", -900), dur: liveA, box: B("live_toggle", "step1"), fill: 0.86, maxScale: 2.4 },
        { fromMs: ms("live_start", -200), dur: liveB, box: B("live_busy", "step1"), fill: 0.86, maxScale: 2.4 },
        { fromMs: ms("live_done", 600), dur: 3.4, box: B("live_done", "plan"), fill: 0.84, maxScale: 3 },
        { fromMs: ms("live_clear", 200), dur: 3.4, box: B("live_clear", "verdict"), fill: 0.92 },
      ],
      [
        { at: 0.2, text: "LIVE: Claude Opus 5.5, real API call.", tone: "cloud" },
        { at: liveA + 0.6, text: "4.3 KB sent. 0 B of raw media.", tone: "cloud" },
        { at: liveA + liveB, text: "It planned around the covered frames.", tone: "cloud" },
        { at: liveA + liveB + 3.4, text: "CLEAR. 6 of 6 checks agree.", tone: "clear" },
      ],
      { text: "LIVE · REAL TIME", tone: "cloud" },
    ),
    // 10. Signed receipt, tamper rejected.
    shotsScene([{ fromMs: ms("tamper", -2600), dur: 6, box: B("tamper", "receipt"), fill: 0.86, maxScale: 2.4 }], [{ at: 0.2, text: "Signed receipt. Change one byte: rejected.", tone: "clear" }]),
    // 11. The proof cut renders.
    shotsScene([{ fromMs: ms("rendered", 200), dur: 6, box: B("rendered", "render"), fill: 0.86, maxScale: 2.4 }], [{ at: 0.2, text: "Render unlocks. Face pixelated. Title placed clear.", tone: "clear" }]),
    // 12. Offline: Gemma 4 31B on device.
    shotsScene(
      [
        { fromMs: ms("link_down", -700), dur: 1.8, box: B("link_down", "meter"), fill: 0.7, maxScale: 3.4 },
        { fromMs: ms("local_start", 100), dur: 3.6, box: B("local_done", "verdict"), fill: 0.92, rate: localRate },
        { fromMs: ms("local_verdict", 200), dur: 3.2, box: B("local_verdict", "verdict"), fill: 0.92 },
      ],
      [
        { at: 0.2, text: "Link down. Gemma 4 31B plans on this machine.", tone: "brass" },
        { at: 5.4, text: "Same verifier. Same receipt. CLEAR.", tone: "clear" },
      ],
      { text: `${localRate}× · REAL TIME ${Math.round(localWait)} S`, tone: "brass" },
    ),
    card(7, HardwareCard),
    card(4.5, Outro),
  ];
}

export function totalFrames(): number {
  return scenes().reduce((sum, s) => sum + sec(s.duration), 0);
}

export const BrandForwardDemo: React.FC = () => {
  let cursor = 0;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {scenes().map((scene, i) => {
        const start = cursor;
        const frames = sec(scene.duration);
        cursor += frames;
        return (
          <Sequence key={i} from={start} durationInFrames={frames}>
            {scene.render(frames)}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
