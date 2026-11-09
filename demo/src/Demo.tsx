import { AbsoluteFill, Easing, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadSans } from "@remotion/google-fonts/Inter";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import markers from "../public/markers.json";

const { fontFamily: SANS } = loadSans();
const { fontFamily: SERIF } = loadSerif();
const { fontFamily: MONO } = loadMono();

export const FPS = 30;
const M = markers as Record<string, number>;
const sec = (s: number) => Math.round(s * FPS);
const at = (name: string, offsetMs = 0) => Math.max(0, Math.round(((M[name] ?? 0) + offsetMs) / 1000 * FPS));

const C = {
  bg: "#07080a",
  ink: "#f2efe8",
  dim: "#a39f96",
  faint: "#6b675f",
  brass: "#e0b56a",
  hold: "#ef5b3c",
  clear: "#b9e08a",
  cloud: "#8fb8d8",
  line: "rgba(242,239,232,0.12)",
};

// ---------------------------------------------------------------- building blocks

const Grain: React.FC = () => (
  <AbsoluteFill
    style={{
      background: "radial-gradient(1200px 700px at 20% 0%, rgba(224,181,106,0.08), transparent 60%), radial-gradient(900px 600px at 100% 100%, rgba(143,184,216,0.06), transparent 60%)",
      pointerEvents: "none",
    }}
  />
);

function useFadeInOut(duration: number, fade = 12) {
  const frame = useCurrentFrame();
  return interpolate(frame, [0, fade, duration - fade, duration], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

const Kicker: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = C.brass }) => (
  <div style={{ fontFamily: MONO, fontSize: 22, letterSpacing: 6, textTransform: "uppercase", color }}>{children}</div>
);

const Rise: React.FC<{ delay?: number; children: React.ReactNode }> = ({ delay = 0, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return <div style={{ opacity: s, transform: `translateY(${(1 - s) * 24}px)` }}>{children}</div>;
};

// ---------------------------------------------------------------- cards

const Title: React.FC<{ duration: number }> = ({ duration }) => {
  const opacity = useFadeInOut(duration, 15);
  return (
    <AbsoluteFill style={{ background: C.bg, opacity, justifyContent: "center", padding: "0 160px" }}>
      <Grain />
      <Rise>
        <Kicker>Lenovo ThinkStation P8 · RTX PRO 6000 Blackwell</Kicker>
      </Rise>
      <Rise delay={8}>
        <div style={{ fontFamily: SERIF, fontSize: 190, color: C.ink, lineHeight: 1, marginTop: 30, letterSpacing: -4 }}>
          Brand<span style={{ color: C.brass }}>Forward</span>
        </div>
      </Rise>
      <Rise delay={18}>
        <div style={{ fontFamily: SANS, fontSize: 44, color: C.dim, marginTop: 30, maxWidth: 1300, lineHeight: 1.25 }}>
          Pre-publishability verification for unreleased video. The footage stays on the workstation.
        </div>
      </Rise>
    </AbsoluteFill>
  );
};

const PROBLEMS = [
  ["Upload is the wrong boundary.", "Cloud video tools want gigabytes of unreleased footage. That breaks privacy, compliance, and contracts."],
  ["Cloud models guess about pixels.", "A planner reads “hold on the name” and schedules a logo reveal at 04.2 s. At 04.2 s the logo is behind a crane load."],
  ["Nobody can prove what was checked.", "When legal asks which model decided and what was verified, the answer is a log line, not evidence."],
];

const Problem: React.FC<{ duration: number }> = ({ duration }) => {
  const opacity = useFadeInOut(duration);
  return (
    <AbsoluteFill style={{ background: C.bg, opacity, justifyContent: "center", padding: "0 160px", gap: 54 }}>
      <Grain />
      <Rise>
        <Kicker>The problem</Kicker>
      </Rise>
      {PROBLEMS.map(([head, body], i) => (
        <Rise key={head} delay={14 + i * 22}>
          <div style={{ display: "flex", gap: 40, alignItems: "baseline" }}>
            <div style={{ fontFamily: MONO, fontSize: 28, color: C.faint, width: 60 }}>0{i + 1}</div>
            <div>
              <div style={{ fontFamily: SERIF, fontSize: 72, color: C.ink, lineHeight: 1.05 }}>{head}</div>
              <div style={{ fontFamily: SANS, fontSize: 32, color: C.dim, marginTop: 12, maxWidth: 1350 }}>{body}</div>
            </div>
          </div>
        </Rise>
      ))}
    </AbsoluteFill>
  );
};

const Boundary: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const opacity = useFadeInOut(duration);
  const grow = interpolate(frame, [20, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const cross = interpolate(frame, [70, 120], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  return (
    <AbsoluteFill style={{ background: C.bg, opacity, padding: "0 160px", justifyContent: "center" }}>
      <Grain />
      <Rise>
        <Kicker>The trust boundary moves</Kicker>
      </Rise>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 1fr", marginTop: 60, alignItems: "stretch" }}>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 18, padding: 44, background: "rgba(255,255,255,0.02)" }}>
          <div style={{ fontFamily: MONO, color: C.clear, fontSize: 24, letterSpacing: 4 }}>WORKSTATION</div>
          <div style={{ fontFamily: SERIF, color: C.ink, fontSize: 64, marginTop: 18 }}>Every pixel stays.</div>
          <div style={{ marginTop: 40, fontFamily: SANS, color: C.dim, fontSize: 28 }}>Raw master · 30.7 MB here, gigabytes in production</div>
          <div style={{ height: 22, background: "rgba(255,255,255,0.06)", borderRadius: 6, marginTop: 14, overflow: "hidden" }}>
            <div style={{ width: `${grow * 100}%`, height: "100%", background: C.faint }} />
          </div>
          <div style={{ marginTop: 34, fontFamily: SANS, color: C.dim, fontSize: 28 }}>Decode · hash 144 frames · measure · verify · sign · render</div>
        </div>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: `repeating-linear-gradient(${C.brass} 0 10px, transparent 10px 20px)` }} />
          <div
            style={{
              position: "absolute",
              top: "48%",
              left: `${-40 + cross * 120}%`,
              fontFamily: MONO,
              fontSize: 24,
              color: C.bg,
              background: C.brass,
              padding: "8px 14px",
              borderRadius: 8,
              whiteSpace: "nowrap",
              opacity: cross > 0 ? 1 : 0,
            }}
          >
            2.0 KB proxy →
          </div>
        </div>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 18, padding: 44, background: "rgba(143,184,216,0.03)" }}>
          <div style={{ fontFamily: MONO, color: C.cloud, fontSize: 24, letterSpacing: 4 }}>CLOUD</div>
          <div style={{ fontFamily: SERIF, color: C.ink, fontSize: 64, marginTop: 18 }}>Plans are opinions.</div>
          <div style={{ marginTop: 40, fontFamily: SANS, color: C.dim, fontSize: 28 }}>Track ids · measured spans · redaction flags · transcript · keyframe hashes</div>
          <div style={{ marginTop: 34, fontFamily: SANS, color: C.dim, fontSize: 28 }}>Never a frame, a path, or a file byte.</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- console clips

interface ClipProps {
  from: number; // frame in capture timeline
  duration: number; // frames in output
  rate?: number;
  caption: string;
  sub?: string;
  zoom?: { x: number; y: number; scale: number }; // focus point in 0..1 of the capture, and scale
  tone?: "hold" | "clear" | "brass" | "cloud";
}

const CAPTURE_W = 1600;
const CAPTURE_H = 900;

const Clip: React.FC<ClipProps> = ({ from, duration, rate = 1, caption, sub, zoom, tone = "brass" }) => {
  const frame = useCurrentFrame();
  const opacity = useFadeInOut(duration, 8);
  const z = zoom ?? { x: 0.5, y: 0.5, scale: 1 };
  const k = interpolate(frame, [0, 24, duration - 18, duration], [1, z.scale, z.scale, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const scale = 1920 / CAPTURE_W;
  const color = tone === "hold" ? C.hold : tone === "clear" ? C.clear : tone === "cloud" ? C.cloud : C.brass;
  return (
    <AbsoluteFill style={{ background: C.bg, opacity }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <div style={{ width: CAPTURE_W, height: CAPTURE_H, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
          <div style={{ width: CAPTURE_W, height: CAPTURE_H, transform: `scale(${k})`, transformOrigin: `${z.x * 100}% ${z.y * 100}%` }}>
            <OffthreadVideo src={staticFile("capture.webm")} startFrom={from} playbackRate={rate} muted style={{ width: CAPTURE_W, height: CAPTURE_H }} />
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 60,
          bottom: 56,
          maxWidth: 1180,
          padding: "22px 30px",
          background: "rgba(7,8,10,0.86)",
          border: `1px solid ${C.line}`,
          borderLeft: `4px solid ${color}`,
          borderRadius: 12,
          backdropFilter: "blur(8px)",
        }}
      >
        <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 38, color: C.ink, lineHeight: 1.2 }}>{caption}</div>
        {sub && <div style={{ fontFamily: SANS, fontSize: 26, color: C.dim, marginTop: 8, lineHeight: 1.3 }}>{sub}</div>}
      </div>
    </AbsoluteFill>
  );
};

const WhyP8: React.FC<{ duration: number }> = ({ duration }) => {
  const opacity = useFadeInOut(duration);
  const rows = [
    ["30B+ open-weight planner", "Gemma 4 31B ran on this Mac for the failover"],
    ["SAM 3.1 frame tracking", "replaces the template-diff vision on the P8"],
    ["Whisper transcription", "replaces the fixture transcript"],
    ["4K decode + ffmpeg render", "concurrently, without raw video leaving the box"],
  ];
  return (
    <AbsoluteFill style={{ background: C.bg, opacity, justifyContent: "center", padding: "0 160px" }}>
      <Grain />
      <Rise>
        <Kicker>Why it needs an RTX PRO 6000 · 96 GB</Kicker>
      </Rise>
      <Rise delay={8}>
        <div style={{ fontFamily: SERIF, fontSize: 84, color: C.ink, marginTop: 24, lineHeight: 1.05 }}>All of it, at once, on one machine.</div>
      </Rise>
      <div style={{ marginTop: 50, display: "grid", gap: 18 }}>
        {rows.map(([a, b], i) => (
          <Rise key={a} delay={20 + i * 10}>
            <div style={{ display: "grid", gridTemplateColumns: "640px 1fr", fontSize: 34, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
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
  const opacity = useFadeInOut(duration, 15);
  return (
    <AbsoluteFill style={{ background: C.bg, opacity, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <Grain />
      <Rise>
        <div style={{ fontFamily: SERIF, fontSize: 150, color: C.ink, letterSpacing: -3 }}>
          Brand<span style={{ color: C.brass }}>Forward</span>
        </div>
      </Rise>
      <Rise delay={10}>
        <div style={{ fontFamily: SANS, fontSize: 40, color: C.dim, marginTop: 20 }}>Pixels stay. Models propose. Frames decide. Receipts prove.</div>
      </Rise>
      <Rise delay={20}>
        <div style={{ fontFamily: MONO, fontSize: 32, color: C.brass, marginTop: 50 }}>github.com/ankitshah009/brandforward</div>
      </Rise>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- timeline

interface Scene {
  duration: number;
  render: (duration: number) => React.ReactNode;
}

function scenes(): Scene[] {
  const clip = (props: Omit<ClipProps, "duration">, duration: number): Scene => ({ duration, render: (d) => <Clip {...props} duration={d} /> });
  const localWait = Math.max(1, (M.local_done - M.local_start) / 1000);
  const localRate = Math.max(1, localWait / 4);
  return [
    { duration: sec(5), render: (d) => <Title duration={d} /> },
    { duration: sec(9), render: (d) => <Problem duration={d} /> },
    { duration: sec(6.5), render: (d) => <Boundary duration={d} /> },
    clip(
      {
        from: at("play", -400),
        caption: "A real master, drawn and decoded on device.",
        sub: "ffmpeg hashes all 144 frames. Wordmark coverage is measured per frame against the brand template, not asserted.",
        zoom: { x: 0.33, y: 0.4, scale: 1.25 },
      },
      sec(7),
    ),
    clip(
      {
        from: at("proxy", -1600),
        caption: "The only thing that may leave: a 2 KB proxy.",
        sub: "Track ids, measured spans, redaction flags, transcript, keyframe hashes. A guard rejects paths, pixels, and file bytes.",
        zoom: { x: 0.86, y: 0.3, scale: 1.55 },
      },
      sec(5),
    ),
    clip(
      {
        from: at("cloud_plan", -500),
        caption: "The cloud plans a logo hold at 03.900 – 04.800.",
        sub: "It read “hold on the name” in the transcript. That is an opinion until the workstation checks it.",
        zoom: { x: 0.86, y: 0.45, scale: 1.5 },
        tone: "cloud",
      },
      sec(5),
    ),
    clip(
      {
        from: at("hold", -400),
        caption: "HOLD. Frame 111 shows the wordmark 65.9% covered.",
        sub: "Every claim, and everything an edit implies, is checked against decoded frames. Evidence: frame index, SHA-256, percentage.",
        zoom: { x: 0.45, y: 0.55, scale: 1.2 },
        tone: "hold",
      },
      sec(7.5),
    ),
    clip(
      {
        from: at("render_refused", -2000),
        caption: "ffmpeg refuses to render on a HOLD.",
        sub: "The render is gated on a valid CLEAR receipt for this exact plan and master.",
        zoom: { x: 0.8, y: 0.35, scale: 1.35 },
        tone: "hold",
      },
      sec(4),
    ),
    clip(
      {
        from: at("revised", -900),
        caption: "Revise with evidence → CLEAR.",
        sub: "Only the failed checks go back to the planner: ids, intervals, numbers. Never pixels. The new hold sits where the logo is visible.",
        zoom: { x: 0.4, y: 0.55, scale: 1.2 },
        tone: "clear",
      },
      sec(7),
    ),
    clip(
      {
        from: at("tamper", -4200),
        caption: "A signed receipt: measured facts vs model opinions.",
        sub: "Ed25519 over canonical JSON. Flip the verdict in a copy and verification fails.",
        zoom: { x: 0.86, y: 0.55, scale: 1.6 },
        tone: "clear",
      },
      sec(6.5),
    ),
    clip(
      {
        from: at("rendered", -800),
        caption: "Render unlocks. The proof cut follows the cleared plan.",
        sub: "Talent pixelated, lower third placed clear of the face and logo, logo hold where the wordmark is measured visible.",
        zoom: { x: 0.86, y: 0.62, scale: 1.7 },
        tone: "clear",
      },
      sec(6.5),
    ),
    clip(
      {
        from: at("local_start", -2200),
        rate: localRate,
        caption: "Drop the link. Gemma 4 31B plans on device.",
        sub: `Nothing transmitted. The open-weight model took ${localWait.toFixed(0)} s on this Mac (shown at ${localRate.toFixed(1)}×).`,
        zoom: { x: 0.86, y: 0.35, scale: 1.45 },
        tone: "brass",
      },
      sec(2.2 + localWait / localRate + 2),
    ),
    clip(
      {
        from: at("local_verdict", -400),
        caption: "On-device plan, same verifier, same receipt.",
        sub: "The cloud is optional. The check is not.",
        zoom: { x: 0.45, y: 0.55, scale: 1.2 },
        tone: "clear",
      },
      sec(5),
    ),
    { duration: sec(7), render: (d) => <WhyP8 duration={d} /> },
    { duration: sec(6), render: (d) => <Outro duration={d} /> },
  ];
}

export function totalFrames(): number {
  return scenes().reduce((sum, s) => sum + s.duration, 0);
}

export const BrandForwardDemo: React.FC = () => {
  let cursor = 0;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {scenes().map((scene, i) => {
        const start = cursor;
        cursor += scene.duration;
        return (
          <Sequence key={i} from={start} durationInFrames={scene.duration}>
            {scene.render(scene.duration)}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
