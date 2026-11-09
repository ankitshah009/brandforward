"use client";

import { ArrowRight, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, EngineError, mediaUrl, type NodeInfo } from "@/lib/api";
import { modelLabel, modelName, tcToMs, type Interval, type Job, type Receipt } from "@/lib/job";
import { Monitor } from "@/components/bf/Monitor";
import { Timeline } from "@/components/bf/Timeline";
import { VerdictHero } from "@/components/bf/VerdictHero";
import { TopBar } from "@/components/bf/TopBar";
import { BoundaryStep, ChecksStep, PlansStep, ReceiptStep, RenderStep, type StepStatus } from "@/components/bf/Rail";
import { Btn, Spinner } from "@/components/bf/primitives";
import { Wordmark } from "@/components/bf/Wordmark";

interface BusyState {
  label: string;
  started: number;
  scope: "plan" | "check" | "receipt" | "render" | "job";
}

export default function Console({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [node, setNode] = useState<NodeInfo | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [link, setLink] = useState<"up" | "down">("up");
  const [provider, setProvider] = useState<"scripted" | "live">("scripted");
  const [busy, setBusy] = useState<BusyState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [frame, setFrame] = useState(100);
  const [playing, setPlaying] = useState(false);
  const [sig, setSig] = useState<{ valid: boolean; reason: string; tampered: boolean } | null>(null);
  const created = useRef(false);

  const load = useCallback(async () => {
    const fresh = await api.job(jobId);
    setJob(fresh);
    return fresh;
  }, [jobId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (jobId === "new") {
          // Strict mode runs effects twice; create exactly one job and always navigate to it.
          if (created.current) return;
          created.current = true;
          const fresh = await api.createJob();
          router.replace(`/jobs/${fresh.id}`);
          return;
        }
        await load();
      } catch (err) {
        if (!cancelled) setFatal(err instanceof Error ? err.message : String(err));
      }
    })();
    api
      .nodes()
      .then((d) => !cancelled && setNode(d.nodes[0] ?? null))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [jobId, load, router]);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [busy]);

  const run = useCallback(async (scope: BusyState["scope"], label: string, task: () => Promise<void>) => {
    setError(null);
    setBusy({ label, started: Date.now(), scope });
    setNow(Date.now());
    try {
      await task();
    } catch (err) {
      setError(err instanceof EngineError || err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, []);

  const selected = useMemo(() => (job ? job.proposals.find((p) => p.id === selectedId) ?? job.proposals[job.proposals.length - 1] ?? null : null), [job, selectedId]);
  const verification = useMemo(() => (job && selected ? job.verifications.find((v) => v.proposal_id === selected.id) ?? null : null), [job, selected]);
  const receipt: Receipt | null = useMemo(() => (job && selected ? job.receipts.find((r) => r.body.opinion.proposal_id === selected.id) ?? null : null), [job, selected]);
  const render = useMemo(() => (job && selected ? job.renders.find((r) => r.proposal_id === selected.id) ?? null : null), [job, selected]);

  const local = node?.capabilities?.local_reasoner;
  const cloud = node?.capabilities?.cloud;
  const localName = local?.model ? modelName(local.model, "ollama") : "the rule planner";
  const providerNote =
    link === "down"
      ? `Air-gapped. Nothing is transmitted. ${localName} plans on this machine.`
      : provider === "scripted"
        ? "Scripted cloud answer for a repeatable demo. The request is built, guarded and logged, not transmitted."
        : cloud?.state === "configured"
          ? `Live: sends only the proxy to ${cloud.model} at ${cloud.host}. Any failure fails over to ${localName}.`
          : `No cloud key configured, so a live call fails over to ${localName} on device.`;

  const select = (id: string) => {
    setSelectedId(id);
    setSig(null);
  };

  const focus = (fresh: Job, proposalId: string) => {
    const v = fresh.verifications.find((x) => x.proposal_id === proposalId);
    const bad = v?.checks.find((c) => !c.passed && "worst_frame" in c.evidence);
    setPlaying(false);
    if (bad) {
      setFrame(Number((bad.evidence as { worst_frame: number }).worst_frame));
      return;
    }
    const p = fresh.proposals.find((x) => x.id === proposalId);
    if (p) setFrame(Math.min(fresh.vision.frame_count - 1, Math.floor((tcToMs(p.plan.wordmark_hold.start) * fresh.vision.fps) / 1000) + 6));
  };

  const plan = () =>
    run("plan", link === "down" ? `${localName} planning on device` : provider === "live" ? "Asking the live cloud planner" : "Scripted cloud planning", async () => {
      const r = await api.research(jobId, { link, provider });
      await load();
      select(r.proposal.id);
    });
  const check = () =>
    run("check", "Cross-checking decoded frames and signing", async () => {
      if (!selected) return;
      await api.receipt(jobId, selected.id);
      focus(await load(), selected.id);
    });
  const revise = () =>
    run(
      "check",
      selected?.source === "cloud" && link === "up" ? "Planner revising with the failed checks" : `${localName} revising on device`,
      async () => {
        if (!selected) return;
        const r = await api.research(jobId, { link, provider, revise: selected.id });
        await load();
        select(r.proposal.id);
      },
    );
  const doRender = () =>
    run("render", "ffmpeg rendering the cleared plan on device", async () => {
      if (!selected) return;
      try {
        await api.render(jobId, selected.id);
      } finally {
        await load();
      }
    });
  const verify = () =>
    run("receipt", "Verifying signature", async () => {
      if (!receipt) return;
      const r = await api.checkReceipt(receipt);
      setSig({ ...r, tampered: false });
    });
  const tamper = () =>
    run("receipt", "Flipping the verdict in a copy and re-verifying", async () => {
      if (!receipt) return;
      const copy = JSON.parse(JSON.stringify(receipt)) as Receipt;
      copy.body.verdict = copy.body.verdict === "clear" ? "hold" : "clear";
      const r = await api.checkReceipt(copy);
      setSig({ ...r, tampered: !r.valid });
    });
  const newJob = () =>
    run("job", "Starting a fresh job", async () => {
      const fresh = await api.createJob();
      router.push(`/jobs/${fresh.id}`);
    });

  // The one obvious next action, for the top bar and the N key.
  const next = useMemo(() => {
    if (!job) return null;
    if (!selected) return { label: link === "down" ? "Plan on device" : "Send proxy", go: plan };
    if (!verification) return { label: "Cross-check & sign", go: check };
    if (verification.verdict === "hold") return { label: "Revise with evidence", go: revise };
    if (!render) return { label: "Render proof cut", go: doRender };
    if (!sig) return { label: "Verify signature", go: verify };
    if (!sig.tampered) return { label: "Tamper test", go: tamper };
    const onDevice = job.proposals.some((p) => p.source !== "cloud");
    if (link === "up" && !onDevice) return { label: "Drop link", go: () => setLink("down") };
    if (!onDevice) return { label: "Plan on device", go: plan };
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, selected, verification, render, sig, link]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey) return;
      if (e.key === "n" && next && !busy) next.go();
      if (e.key === " " && (e.target as HTMLElement)?.getAttribute("role") !== "slider") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, busy]);

  const onFrame = useCallback((i: number) => setFrame(i), []);
  const onEnded = useCallback(() => setPlaying(false), []);

  if (fatal) {
    return (
      <main className="grain flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <Wordmark />
        <h1 className="font-display text-5xl">Engine unreachable</h1>
        <p className="max-w-[560px] text-sm text-muted-foreground">{fatal}</p>
        <Btn variant="primary" onClick={() => location.reload()}>
          Retry
        </Btn>
      </main>
    );
  }
  if (!job) {
    return (
      <main className="grain flex min-h-screen flex-col items-center justify-center gap-5 p-6">
        <Wordmark />
        <p className="flex items-center gap-2 text-sm text-brass">
          <Spinner />
          {jobId === "new" ? "Drawing the master, hashing all 144 frames, measuring the wordmark…" : "Loading job…"}
        </p>
      </main>
    );
  }

  const elapsed = busy ? now - busy.started : 0;
  const busyFor = (scope: BusyState["scope"]) => (busy && busy.scope === scope ? { label: busy.label, elapsedMs: elapsed } : null);
  const verdict = receipt?.body.verdict ?? verification?.verdict ?? "none";
  const failed = verification?.checks.filter((c) => !c.passed) ?? [];
  const transmitted = job.egress.reduce((s, e) => s + e.bytes, 0);
  const occludedSpans: Interval[] = job.vision.tracks.find((t) => t.track_id === "wordmark")?.spans.filter((s) => !s.visible) ?? [];
  const planSource = selected ? (selected.source === "cloud" ? "cloud" : "device") : undefined;
  const steps: StepStatus[] = [
    job.proposals.length ? "done" : "active",
    !selected ? "idle" : verification ? "done" : "active",
    !selected ? "idle" : !verification ? "active" : verification.verdict === "hold" ? "active" : "done",
    !receipt ? "idle" : "done",
    render ? "done" : receipt ? "active" : "idle",
  ];

  return (
    <div className="grain flex h-screen flex-col overflow-hidden bg-background">
      <TopBar
        title={job.title}
        jobId={job.id}
        rawMediaSent={0}
        metadataSent={transmitted}
        metadataSealed={job.proxy_bytes}
        link={link}
        nodeLabel={node?.name ?? "This machine"}
        targetLabel="ThinkStation P8 · RTX PRO 6000"
        action={
          <div className="flex items-center gap-1.5">
            {next && (
              <Btn variant="primary" size="sm" onClick={next.go} disabled={!!busy} title="Next step (N)">
                {next.label}
                <ArrowRight className="h-3.5 w-3.5" />
              </Btn>
            )}
            <Btn variant="ghost" size="sm" onClick={newJob} disabled={!!busy} aria-label="New job" title="New job">
              <RotateCcw className="h-3.5 w-3.5" />
            </Btn>
          </div>
        }
      />
      {error && (
        <div role="alert" className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-[5px] border border-hold/45 bg-hold-dim px-3 py-2 text-xs text-hold">
          {error}
          <button type="button" className="underline underline-offset-2" onClick={() => setError(null)}>
            dismiss
          </button>
        </div>
      )}
      <main className="grid min-h-0 flex-1 grid-cols-1 min-[1100px]:grid-cols-[minmax(0,1fr)_420px]">
        <section className="flex min-h-0 flex-col gap-3 p-4">
          <div className="min-h-[300px] flex-1">
            <Monitor
              frame={job.vision.frames[frame] ?? job.vision.frames[0]}
              frameCount={job.vision.frame_count}
              fps={job.vision.fps}
              videoSrc={mediaUrl(job.id, "master.mp4", job.asset.sha256.slice(0, 8))}
              width={job.asset.width}
              height={job.asset.height}
              tracks={job.vision.tracks}
              occludedThresholdBp={job.vision.threshold.occluded_bp}
              plan={selected?.plan ?? null}
              planSource={planSource}
              playing={playing}
              onTogglePlay={() => setPlaying((p) => !p)}
              onFrame={onFrame}
              onEnded={onEnded}
              meta={`${job.asset.width}×${job.asset.height} · ${job.vision.fps} fps · ${job.vision.frame_count} frames hashed · ffmpeg ${job.asset.ffmpeg}`}
            />
          </div>
          <VerdictHero
            verdict={verdict}
            reason={
              verification
                ? failed.length
                  ? failed[0].reason
                  : verification.summary
                : selected
                  ? "Not checked yet. A plan is an opinion until decoded frames agree."
                  : "Send the proxy for an edit plan. Nothing clears until frames agree."
            }
            sourceLabel={selected ? `${selected.source === "cloud" ? "Cloud" : "On device"} · ${modelLabel(selected)} · ${selected.id}` : undefined}
            receiptId={receipt?.receipt_id}
            renderUnlocked={verdict === "clear" && !!receipt}
            busy={busy && (busy.scope === "plan" || busy.scope === "check") ? { label: busy.label, elapsedMs: elapsed } : null}
          />
          <Timeline
            frames={job.vision.frames}
            fps={job.vision.fps}
            durationMs={job.asset.duration_ms}
            thresholdBp={job.vision.threshold.occluded_bp}
            transcript={job.transcript}
            occludedSpans={occludedSpans}
            plan={selected?.plan ?? null}
            planSource={planSource}
            playhead={frame}
            onSeek={(i) => {
              setPlaying(false);
              setFrame(i);
            }}
          />
        </section>
        <aside className="scroll-thin min-h-0 overflow-y-auto border-l border-hairline bg-surface-0" aria-label="Steps">
          <BoundaryStep
            status={steps[0]}
            masterBytes={job.asset.byte_length}
            proxyBytes={job.proxy_bytes}
            proxy={job.proxy}
            link={link}
            onLinkChange={setLink}
            provider={provider}
            onProviderChange={setProvider}
            providerNote={providerNote}
            egress={job.egress}
            onSend={plan}
            busy={busyFor("plan")}
            locked={!!busy}
            loadPayload={(seq) => api.egressText(job.id, seq)}
          />
          <PlansStep
            status={steps[1]}
            proposals={job.proposals}
            currentId={selected?.id}
            verdicts={Object.fromEntries(job.verifications.map((v) => [v.proposal_id, v.verdict]))}
            onSelect={select}
          />
          <ChecksStep
            status={steps[2]}
            jobId={job.id}
            verification={verification}
            canCheck={!!selected && !verification}
            onCheck={check}
            canRevise={verification?.verdict === "hold"}
            reviseNote={
              selected?.source === "cloud" && link === "up"
                ? "Sends only the failed checks back to the planner: ids, intervals, percentages, reasons. Never pixels."
                : "Revises on device with the failed checks. Nothing is transmitted."
            }
            onRevise={revise}
            onSeek={(i) => {
              setPlaying(false);
              setFrame(i);
            }}
            busy={busyFor("check")}
          />
          <ReceiptStep status={steps[3]} receipt={receipt} sig={sig} onVerify={verify} onTamper={tamper} busy={busyFor("receipt")} />
          <RenderStep
            status={steps[4]}
            unlocked={verdict === "clear" && !!receipt}
            hasReceipt={!!receipt}
            render={render}
            proofSrc={render ? mediaUrl(job.id, "proof.mp4", render.sha256.slice(0, 8)) : null}
            onRender={doRender}
            busy={busyFor("render")}
          />
          <p className="px-4 py-4 text-[10.5px] leading-relaxed text-faint">
            Press <kbd className="rounded border border-hairline-strong px-1 font-mono">N</kbd> for the next step, space to play. Arrow keys scrub the
            timeline. Evidence thumbnails are decoded frames from this machine; click one to jump the monitor.
          </p>
        </aside>
      </main>
    </div>
  );
}
