"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Cloud, Cpu, FileSignature, Film, HardDrive, ScanEye, Send } from "lucide-react";
import { Wordmark } from "@/components/bf/Wordmark";
import { btnVariants, Chip } from "@/components/bf/primitives";
import { cn } from "@/lib/utils";

// Figures from the deterministic harbor-launch job (the engine draws the same master every run).
const MASTER = "260.4 KB";
const PROXY = "2.0 KB";

const fade = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.7, ease: [0.2, 0.8, 0.2, 1] as const },
};

const STEPS = [
  { icon: Send, t: "Send a proxy", d: "Track ids, measured spans, transcript, hashes. About 2 KB. No pixels." },
  { icon: Cloud, t: "Model proposes", d: "A cloud or on-device model returns an edit plan. It is an opinion." },
  { icon: ScanEye, t: "Frames decide", d: "Every claim, and everything an edit implies, is checked against decoded frames." },
  { icon: FileSignature, t: "Sign a receipt", d: "HOLD or CLEAR, Ed25519 signed. Measured facts kept apart from opinions." },
  { icon: Film, t: "Render unlocks", d: "ffmpeg runs only on a valid CLEAR receipt. The talent is pixelated." },
];

const HONESTY = [
  { t: "ffmpeg decode, hash, render", s: "real" },
  { t: "Pixel-measured vision", s: "real" },
  { t: "Gemma 4 31B on device", s: "real" },
  { t: "Ed25519 receipts", s: "real" },
  { t: "Transcript", s: "fixture" },
  { t: "SAM 3.1 · Whisper", s: "P8 target" },
];

export default function Landing() {
  return (
    <div className="grain min-h-screen overflow-x-hidden bg-background">
      <header className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-5">
        <Wordmark />
        <nav className="flex items-center gap-5 text-sm text-muted-foreground">
          <a href="#boundary" className="hover:text-foreground max-sm:hidden">
            Trust boundary
          </a>
          <a href="#honesty" className="hover:text-foreground max-sm:hidden">
            On this build
          </a>
          <a href="https://github.com/ankitshah009/brandforward" className="hover:text-foreground">
            GitHub
          </a>
          <Link href="/jobs/harbor-launch" className={btnVariants({ variant: "secondary", size: "sm" })}>
            Open console
          </Link>
        </nav>
      </header>

      <section className="vignette relative mx-auto max-w-[1200px] px-6 pb-20 pt-20 md:pt-28">
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, delay: 0.3 }}
          className="pointer-events-none absolute right-6 top-32 hidden w-[380px] rotate-[2deg] xl:block"
          aria-hidden
        >
          <div className="overflow-hidden rounded-[6px] border border-hold/50 shadow-[var(--glow-hold)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/frame-112-occluded.jpg" alt="" className="aspect-video w-full object-cover opacity-80" />
            <div className="flex items-center justify-between bg-surface-1 px-3 py-2">
              <span className="font-display text-[34px] leading-none text-hold">HOLD</span>
              <span className="font-mono text-[10px] text-muted-foreground">frame 112 · 67.0% covered</span>
            </div>
          </div>
          <div className="-mt-6 ml-16 -rotate-[4deg] overflow-hidden rounded-[6px] border border-clear/50 bg-surface-1 shadow-[var(--glow-clear)]">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="font-display text-[34px] leading-none text-clear">CLEAR</span>
              <span className="font-mono text-[10px] text-muted-foreground">30 frames agree · Ed25519</span>
            </div>
          </div>
        </motion.div>
        <motion.div {...fade} className="relative max-w-[760px]">
          <Chip tone="brass">Local-first · Pre-publishability verification</Chip>
          <h1 className="mt-6 font-display text-[56px] leading-[0.98] tracking-[-0.02em] md:text-[80px]">
            AI video tools want your unreleased footage.
            <span className="block italic text-muted-foreground">Then they guess about it.</span>
          </h1>
          <p className="mt-7 max-w-[560px] text-[17px] leading-relaxed text-muted-foreground">
            BrandForward keeps the master on your workstation. A model only sees a tiny anonymized proxy. Its plan is checked against real frames, then
            signed HOLD or CLEAR before anything renders.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href="/jobs/harbor-launch" className={btnVariants({ variant: "primary", size: "lg" })}>
              Run the harbor-launch job <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="font-mono text-xs text-faint tnum">harbor-launch · 6 s · 1280×720 · 24 fps · 144 frames hashed</span>
          </div>
        </motion.div>
      </section>

      <section id="boundary" className="mx-auto max-w-[1200px] px-6 pb-24">
        <motion.div {...fade} className="panel relative overflow-hidden rounded-[10px]">
          <div className="grid md:grid-cols-[1.25fr_auto_1fr]">
            <div className="p-7">
              <div className="eyebrow flex items-center gap-2">
                <Cpu className="h-3.5 w-3.5 text-brass" />
                Workstation · local
              </div>
              <div className="relative mt-5 overflow-hidden rounded-[6px] border border-hairline-strong">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/frame-034-clear.jpg" alt="Harbor launch master frame on the workstation" className="aspect-video w-full object-cover" />
                <div className="glass absolute bottom-3 left-3 rounded-[4px] px-2.5 py-1 font-mono text-[11px]">master.mp4 · {MASTER}</div>
              </div>
              <p className="mt-5 font-display text-[34px] leading-none">Every pixel stays.</p>
              <p className="mt-2 text-sm text-muted-foreground">Decode, measure, verify, sign and render all happen here.</p>
            </div>
            <div className="relative flex items-center justify-center border-hairline px-2 py-8 md:w-[220px] md:border-x">
              <div className="absolute inset-y-6 left-1/2 w-px -translate-x-1/2 border-l border-dashed border-brass/50 max-md:hidden" />
              <span className="eyebrow absolute left-1/2 top-5 -translate-x-1/2 whitespace-nowrap !text-brass max-md:hidden">Trust boundary</span>
              <div className="relative h-24 w-full overflow-hidden">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="animate-packet absolute left-0 top-1/2 -mt-3 rounded-[3px] border border-cloud/50 bg-cloud-dim px-1.5 py-0.5 font-mono text-[10px] text-cloud [--travel:180px]"
                    style={{ animationDelay: `${i * 0.93}s` }}
                  >
                    {PROXY}
                  </span>
                ))}
              </div>
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center font-mono text-[10px] text-faint">
                raw media sent
                <br />
                <span className="text-[15px] text-clear">0 B</span>
              </div>
            </div>
            <div className="p-7">
              <div className="eyebrow flex items-center gap-2">
                <Cloud className="h-3.5 w-3.5 text-cloud" />
                Cloud model · remote
              </div>
              <pre className="mt-5 overflow-hidden rounded-[6px] border border-hairline bg-surface-0 p-4 font-mono text-[11px] leading-relaxed text-muted-foreground">{`{
  "schema": "brandforward.proxy.v2",
  "frame_count": 144,
  "languages": ["en", "ja"],
  "tracks": ["product_hero",
             "talent", "wordmark"],
  "keyframes": [ sha256 × 6 ]
}`}</pre>
              <p className="mt-5 font-display text-[34px] leading-none">{PROXY} crosses.</p>
              <p className="mt-2 text-sm text-muted-foreground">It returns a plan. A plan is an opinion until frames agree.</p>
            </div>
          </div>
        </motion.div>
      </section>

      <section className="mx-auto max-w-[1200px] px-6 pb-24">
        <motion.h2 {...fade} className="font-display text-[44px] leading-none">
          Five steps. One verdict.
        </motion.h2>
        <ol className="mt-10 grid gap-px overflow-hidden rounded-[8px] border border-hairline bg-hairline md:grid-cols-5">
          {STEPS.map((s, i) => (
            <motion.li key={s.t} {...fade} transition={{ ...fade.transition, delay: i * 0.06 }} className="bg-surface-1 p-5">
              <div className="flex items-center justify-between">
                <s.icon className="h-4 w-4 text-brass" />
                <span className="font-mono text-[11px] text-faint">0{i + 1}</span>
              </div>
              <h3 className="mt-6 text-sm font-medium">{s.t}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{s.d}</p>
            </motion.li>
          ))}
        </ol>
        <motion.div {...fade} className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="flex items-center gap-5 rounded-[8px] border border-hold/40 bg-hold-dim p-5">
            <span className="font-display text-[56px] leading-none text-hold">HOLD</span>
            <p className="text-sm text-muted-foreground">The cloud plans a logo hold at 00:03.900. Frame 112 shows the wordmark 67.0% covered by a crane load.</p>
          </div>
          <div className="flex items-center gap-5 rounded-[8px] border border-clear/40 bg-clear-dim p-5">
            <span className="font-display text-[56px] leading-none text-clear">CLEAR</span>
            <p className="text-sm text-muted-foreground">Revised with evidence to 00:01.200–00:02.400. All 30 frames agree. Render unlocks.</p>
          </div>
        </motion.div>
      </section>

      <section id="honesty" className="border-y border-hairline bg-surface-1/50">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-8 gap-y-4 px-6 py-6">
          <span className="eyebrow">What&apos;s real on this build</span>
          {HONESTY.map((h) => (
            <span key={h.t} className="flex items-center gap-2 text-sm">
              <span className={cn("h-1.5 w-1.5 rounded-full", h.s === "real" ? "bg-clear" : h.s === "fixture" ? "bg-brass" : "bg-cloud")} />
              {h.t}
              <Chip tone={h.s === "real" ? "clear" : h.s === "fixture" ? "brass" : "cloud"}>{h.s}</Chip>
            </span>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-6 py-24 text-center">
        <HardDrive className="mx-auto h-5 w-5 text-brass" />
        <h2 className="mx-auto mt-5 max-w-[720px] font-display text-[48px] leading-[1.02]">If the link drops, planning moves on device. The check does not change.</h2>
        <p className="mt-4 text-muted-foreground">Gemma 4 31B, open weights, through Ollama. Built for ThinkStation P8 with RTX PRO 6000 Blackwell.</p>
        <Link href="/jobs/harbor-launch" className={cn(btnVariants({ variant: "primary", size: "lg" }), "mt-9")}>
          Run the harbor-launch job <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
      <footer className="mx-auto flex max-w-[1200px] items-center justify-between border-t border-hairline px-6 py-6 text-xs text-faint">
        <Wordmark className="opacity-70" />
        <span className="font-mono">Raw media sent · 0 B</span>
      </footer>
    </div>
  );
}
