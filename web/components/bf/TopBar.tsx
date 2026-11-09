import Link from "next/link";
import { ArrowRight, Cpu } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/job";
import { Wordmark } from "./Wordmark";

export interface TopBarProps {
  title: string;
  jobId: string;
  rawMediaSent: number;
  metadataSent: number;
  metadataSealed: number;
  link: "up" | "down";
  nodeLabel: string;
  targetLabel: string;
  action?: ReactNode;
}

function Meter({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "ok" | "warn" | "hold" }) {
  return (
    <div className="flex flex-col justify-center px-4 first:pl-0">
      <span className="eyebrow whitespace-nowrap !text-[9px]">{label}</span>
      <span className={cn("mt-0.5 whitespace-nowrap font-mono text-[13px] leading-none tnum", tone === "ok" && "text-clear", tone === "hold" && "text-hold", tone === "warn" && "text-brass")}>
        {value}
        {sub && <span className="ml-1.5 text-[10px] text-faint">{sub}</span>}
      </span>
    </div>
  );
}

export function TopBar(p: TopBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-5 border-b border-hairline bg-surface-0/80 px-4 backdrop-blur">
      <Link href="/" className="shrink-0 rounded-sm" aria-label="BrandForward home">
        <Wordmark />
      </Link>
      <div className="h-6 w-px bg-hairline" />
      <div className="flex min-w-0 items-baseline gap-2.5">
        <span className="eyebrow !text-brass">Unreleased</span>
        <span className="whitespace-nowrap text-sm font-medium">{p.title}</span>
        <span className="hidden font-mono text-[11px] text-faint min-[1500px]:inline">{p.jobId}</span>
      </div>
      <div className="ml-auto flex items-center divide-x divide-hairline" aria-label="Boundary meter">
        <Meter label="Raw media sent" value={formatBytes(p.rawMediaSent)} tone="ok" />
        <Meter label="Metadata sent" value={formatBytes(p.metadataSent)} sub={p.metadataSealed ? `${formatBytes(p.metadataSealed)} sealed` : undefined} />
        <Meter
          label="Link"
          tone={p.link === "up" ? "ok" : "hold"}
          value={
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("h-1.5 w-1.5 rounded-full", p.link === "up" ? "bg-clear shadow-[0_0_8px_var(--clear)]" : "bg-hold")} />
              {p.link}
            </span>
          }
        />
      </div>
      <div className="hidden items-center gap-2 whitespace-nowrap rounded-[5px] border border-hairline bg-surface-1 px-2.5 py-1.5 text-[11px] min-[1380px]:flex">
        <Cpu className="h-3.5 w-3.5 text-brass" />
        <span className="text-foreground/90">{p.nodeLabel}</span>
        <ArrowRight className="h-3 w-3 text-faint" />
        <span className="text-faint">
          Target <span className="text-muted-foreground">{p.targetLabel}</span>
        </span>
      </div>
      {p.action}
    </header>
  );
}
