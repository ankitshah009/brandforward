"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Lock, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Verdict } from "@/lib/job";
import { Elapsed, Spinner } from "./primitives";

export interface VerdictHeroProps {
  verdict: Verdict | "none";
  reason: string;
  sourceLabel?: string;
  receiptId?: string;
  renderUnlocked: boolean;
  busy?: { label: string; elapsedMs: number } | null;
}

const WORD = { hold: "HOLD", clear: "CLEAR", none: "NO VERDICT" } as const;

export function VerdictHero(p: VerdictHeroProps) {
  const v = p.verdict;
  return (
    <section
      aria-live="polite"
      className={cn(
        "relative flex h-[104px] shrink-0 items-center gap-6 overflow-hidden rounded-[6px] border px-6 transition-colors duration-700",
        v === "hold" && "border-hold/45 bg-hold-dim",
        v === "clear" && "border-clear/40 bg-clear-dim",
        v === "none" && "border-hairline bg-surface-1",
      )}
    >
      <AnimatePresence mode="popLayout">
        <motion.div
          key={`glow-${v}`}
          className="pointer-events-none absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2 }}
          style={{
            background:
              v === "hold"
                ? "radial-gradient(60% 140% at 10% 50%, oklch(0.64 0.215 28 / .28), transparent 70%)"
                : v === "clear"
                  ? "radial-gradient(60% 140% at 10% 50%, oklch(0.8 0.15 158 / .22), transparent 70%)"
                  : "none",
          }}
        />
      </AnimatePresence>
      <AnimatePresence>
        {v !== "none" && (
          <motion.div
            key={`sweep-${v}`}
            className={cn("pointer-events-none absolute inset-y-0 w-40", v === "hold" ? "bg-hold/20" : "bg-clear/20")}
            style={{ filter: "blur(30px)" }}
            initial={{ left: "-20%" }}
            animate={{ left: "120%" }}
            transition={{ duration: 1.4, ease: [0.6, 0, 0.2, 1] }}
          />
        )}
      </AnimatePresence>
      <div className="relative w-[250px] shrink-0">
        <AnimatePresence mode="wait">
          <motion.h2
            key={v}
            initial={{ opacity: 0, y: 14, filter: "blur(10px)", letterSpacing: "0.18em" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)", letterSpacing: "0.01em" }}
            exit={{ opacity: 0, y: -10, filter: "blur(8px)", transition: { duration: 0.22 } }}
            transition={{ duration: 0.75, ease: [0.2, 0.8, 0.2, 1] }}
            className={cn(
              "font-display leading-none",
              v === "none" ? "text-[40px] text-faint" : "text-[76px]",
              v === "hold" && "text-hold [text-shadow:0_0_40px_oklch(0.64_0.215_28/55%)]",
              v === "clear" && "text-clear [text-shadow:0_0_40px_oklch(0.8_0.15_158/45%)]",
            )}
          >
            {WORD[v]}
          </motion.h2>
        </AnimatePresence>
      </div>
      <div className="relative min-w-0 flex-1">
        {p.busy ? (
          <div className="flex items-center gap-2 text-sm text-brass">
            <Spinner />
            {p.busy.label}… <Elapsed ms={p.busy.elapsedMs} />
          </div>
        ) : (
          <>
            <div className="eyebrow">
              {p.sourceLabel ?? "Awaiting a plan"}
              {p.receiptId && <span className="ml-2 normal-case tracking-normal text-faint">· {p.receiptId}</span>}
            </div>
            <p className="mt-1.5 line-clamp-2 text-[15px] leading-snug text-foreground/90">{p.reason}</p>
          </>
        )}
      </div>
      <motion.div
        layout
        className={cn(
          "relative flex shrink-0 items-center gap-2 rounded-[4px] border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em]",
          p.renderUnlocked ? "border-clear/45 text-clear" : "border-hold/40 text-hold",
        )}
      >
        {p.renderUnlocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
        Render {p.renderUnlocked ? "unlocked" : "locked"}
      </motion.div>
    </section>
  );
}
