import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const chipVariants = cva(
  "inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-[1px] font-mono text-[10px] uppercase leading-4 tracking-[0.08em] whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-hairline-strong text-muted-foreground bg-surface-2",
        brass: "border-brass/30 text-brass bg-brass-dim",
        hold: "border-hold/40 text-hold bg-hold-dim",
        clear: "border-clear/35 text-clear bg-clear-dim",
        cloud: "border-cloud/35 text-cloud bg-cloud-dim",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);
export type ChipTone = NonNullable<VariantProps<typeof chipVariants>["tone"]>;
export function Chip({ tone, className, children }: { tone?: ChipTone; className?: string; children: ReactNode }) {
  return <span className={cn(chipVariants({ tone }), className)}>{children}</span>;
}

export const btnVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[5px] text-[13px] font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-40 active:translate-y-px select-none",
  {
    variants: {
      variant: {
        primary: "bg-brass text-primary-foreground shadow-[0_0_0_1px_oklch(1_0_0/18%)_inset,0_8px_24px_-12px_var(--brass)] hover:brightness-110",
        secondary: "border border-hairline-strong bg-surface-2 text-foreground hover:bg-surface-3",
        ghost: "text-muted-foreground hover:text-foreground hover:bg-surface-2",
        clear: "bg-clear text-primary-foreground hover:brightness-110 shadow-[0_8px_24px_-12px_var(--clear)]",
        danger: "border border-hold/40 bg-hold-dim text-hold hover:bg-hold/20",
      },
      size: { sm: "h-7 px-2.5 text-xs", md: "h-8 px-3", lg: "h-10 px-4 text-sm" },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);
export function Btn({ variant, size, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof btnVariants>) {
  return <button type="button" className={cn(btnVariants({ variant, size }), className)} {...p} />;
}

export function KV({ k, v, mono = true }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px] text-[11px]">
      <span className="shrink-0 text-faint">{k}</span>
      <span className={cn("min-w-0 truncate text-right text-foreground/90 tnum", mono && "font-mono")}>{v}</span>
    </div>
  );
}

export function Elapsed({ ms }: { ms: number }) {
  return <span className="font-mono tnum">{(ms / 1000).toFixed(1)} s</span>;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-block h-3 w-3", className)} aria-hidden>
      <span className="absolute inset-0 animate-spin rounded-full border border-current border-r-transparent" />
    </span>
  );
}

export function BusyLine({ label, elapsedMs }: { label: string; elapsedMs: number }) {
  return (
    <div role="status" className="flex items-center gap-2 rounded-[5px] border border-brass/25 bg-brass-dim px-2.5 py-1.5 text-xs text-brass">
      <Spinner />
      <span className="flex-1">{label}…</span>
      <Elapsed ms={elapsedMs} />
    </div>
  );
}
