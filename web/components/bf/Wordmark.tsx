import { cn } from "@/lib/utils";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-foreground", className)}>
      <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" aria-hidden>
        <rect x="1" y="1" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeOpacity=".35" />
        <path d="M5 6h6M5 10h9M5 14h6" stroke="var(--brass)" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M13 12.5l2 1.5-2 1.5" stroke="var(--brass)" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-display text-[21px] leading-none tracking-[-0.01em]">BrandForward</span>
    </span>
  );
}
