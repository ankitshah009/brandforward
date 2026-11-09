"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Monitor from "@/components/Monitor";
import Timeline from "@/components/Timeline";
import Rail, { type Busy } from "@/components/Rail";
import { api, EngineError, type Job, type NodeInfo, type Receipt } from "@/lib/api";
import { bytes, modelLabel } from "@/lib/format";

export default function Console({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [node, setNode] = useState<NodeInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [link, setLink] = useState<"up" | "down">("up");
  const [provider, setProvider] = useState<"scripted" | "live">("scripted");
  const [busy, setBusy] = useState<Busy | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [frame, setFrame] = useState(100);
  const [playing, setPlaying] = useState(false);
  const [signature, setSignature] = useState<{ valid: boolean; reason: string } | null>(null);
  const [tamper, setTamper] = useState<{ valid: boolean; reason: string } | null>(null);
  const [showProxy, setShowProxy] = useState(false);
  const [payload, setPayload] = useState<{ seq: number; text: string } | null>(null);
  const [showLog, setShowLog] = useState(false);

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
          const created = await api.createJob();
          if (!cancelled) router.replace(`/jobs/${created.id}`);
          return;
        }
        await load();
      } catch (err) {
        if (!cancelled) setFatal(err instanceof Error ? err.message : String(err));
      }
    })();
    api
      .nodes()
      .then((data) => !cancelled && setNode(data.nodes[0] ?? null))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [jobId, load, router]);

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [busy]);

  const run = useCallback(async (label: string, task: () => Promise<void>) => {
    setError(null);
    setBusy({ label, started: Date.now() });
    setNow(Date.now());
    try {
      await task();
    } catch (err) {
      setError(err instanceof EngineError || err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, []);

  const selected = useMemo(() => {
    if (!job) return null;
    return job.proposals.find((item) => item.id === selectedId) ?? job.proposals[job.proposals.length - 1] ?? null;
  }, [job, selectedId]);
  const verification = useMemo(() => (job && selected ? job.verifications.find((v) => v.proposal_id === selected.id) ?? null : null), [job, selected]);
  const receipt: Receipt | null = useMemo(
    () => (job && selected ? job.receipts.find((r) => r.body.opinion.proposal_id === selected.id) ?? null : null),
    [job, selected],
  );
  const render = useMemo(() => (job && selected ? job.renders.find((r) => r.proposal_id === selected.id) ?? null : null), [job, selected]);

  const cloud = node?.capabilities?.cloud;
  const local = node?.capabilities?.local_reasoner;
  const localName = local?.model ? modelLabel(local.model, "ollama") : "rule planner";
  const cloudNote =
    provider === "scripted"
      ? "Scripted cloud answer for a repeatable demo. The request is built and logged, not transmitted."
      : cloud?.state === "configured"
        ? `Live: sends the proxy to ${cloud.model} at ${cloud.host}. If it fails or breaks the schema, ${localName} takes over on device.`
        : `Live cloud has no API key, so this call fails over to ${localName} on device.`;

  const select = (id: string) => {
    setSelectedId(id);
    setSignature(null);
    setTamper(null);
  };

  const focusFailure = (fresh: Job, proposalId: string) => {
    const v = fresh.verifications.find((item) => item.proposal_id === proposalId);
    const failed = v?.checks.find((check) => !check.passed && typeof check.evidence.worst_frame === "number");
    const proposal = fresh.proposals.find((item) => item.id === proposalId);
    setPlaying(false);
    if (failed) {
      setFrame(failed.evidence.worst_frame as number);
    } else if (proposal) {
      const start = proposal.plan.wordmark_hold.start;
      const [m, rest] = start.split(":");
      const ms = Number(m) * 60000 + Number(rest) * 1000;
      setFrame(Math.min(fresh.vision.frame_count - 1, Math.floor((ms * fresh.vision.fps) / 1000) + 6));
    }
  };

  const plan = () =>
    run(link === "down" ? `${localName} planning on device…` : provider === "live" ? "Asking the live cloud planner…" : "Scripted cloud planning…", async () => {
      const result = await api.research(jobId, { link, provider });
      await load();
      select(result.proposal.id);
    });

  const sign = () =>
    run("Cross-checking decoded frames and signing…", async () => {
      if (!selected) return;
      await api.receipt(jobId, selected.id);
      const fresh = await load();
      focusFailure(fresh, selected.id);
    });

  const revise = () =>
    run(selected?.source === "cloud" && link === "up" ? "Planner revising with the failed checks…" : `${localName} revising on device…`, async () => {
      if (!selected) return;
      const result = await api.research(jobId, { link, provider, revise: selected.id });
      await load();
      select(result.proposal.id);
    });

  const doRender = () =>
    run("ffmpeg rendering the cleared plan on device…", async () => {
      if (!selected) return;
      try {
        await api.render(jobId, selected.id);
      } finally {
        await load();
      }
    });

  const verify = () =>
    run("Verifying signature…", async () => {
      if (!receipt) return;
      setSignature(await api.checkReceipt(receipt));
    });

  const tamperTest = () =>
    run("Tampering with a copy and re-verifying…", async () => {
      if (!receipt) return;
      const copy = JSON.parse(JSON.stringify(receipt)) as Receipt;
      copy.body.verdict = copy.body.verdict === "clear" ? "hold" : "clear";
      setTamper(await api.checkReceipt(copy));
    });

  const openPayload = (seq: number | null) => {
    if (seq === null) return setPayload(null);
    void api
      .egressText(jobId, seq)
      .then((text) => setPayload({ seq, text }))
      .catch((err: Error) => setError(err.message));
  };

  const newJob = () =>
    run("Starting a fresh job…", async () => {
      const created = await api.createJob();
      router.push(`/jobs/${created.id}`);
    });

  if (fatal) {
    return (
      <main className="center-note">
        <h1 className="display">Engine unreachable</h1>
        <p>{fatal}</p>
        <button className="btn btn-primary" onClick={() => location.reload()}>
          Retry
        </button>
      </main>
    );
  }
  if (!job) {
    return (
      <main className="center-note">
        <p className="busy">
          <span className="spin" /> {jobId === "new" ? "Drawing the master, hashing every frame, measuring the wordmark…" : "Loading job…"}
        </p>
      </main>
    );
  }

  const verdict = receipt?.body.verdict ?? verification?.verdict ?? null;
  const transmitted = job.egress.reduce((sum, item) => sum + item.bytes, 0);
  const failed = verification?.checks.filter((check) => !check.passed) ?? [];

  return (
    <div className="console">
      <header className="topbar">
        <a href="/" className="brand">
          Brand<span>Forward</span>
        </a>
        <div className="job-title">
          <span className="kicker">Unreleased</span>
          <b>{job.title}</b>
          <span className="mono muted">{job.id}</span>
        </div>
        <div className="meter" title="Bytes that left this machine during this job">
          <div>
            <span className="kicker">Raw media sent</span>
            <b className="mono ok">0 B</b>
          </div>
          <div>
            <span className="kicker">Metadata sent</span>
            <b className="mono">{bytes(transmitted)}</b>
          </div>
          <div>
            <span className="kicker">Link</span>
            <b className={link === "up" ? "mono" : "mono bad"}>{link === "up" ? "up" : "down"}</b>
          </div>
        </div>
        <div className="node" title={node?.capabilities ? Object.entries(node.capabilities).map(([k, v]) => `${k}: ${v.detail}`).join("\n") : ""}>
          <span className="dot dot-local" />
          <div>
            <b>{node?.name ?? "This machine"}</b>
            <span className="muted">Target: ThinkStation P8 · RTX PRO 6000 Blackwell</span>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={newJob} disabled={Boolean(busy)}>
          New job
        </button>
      </header>

      {error && (
        <div className="alert" role="alert">
          {error}
          <button className="link" onClick={() => setError(null)}>
            dismiss
          </button>
        </div>
      )}

      <main className="stage">
        <section className="left">
          <Monitor job={job} frame={frame} playing={playing} proposal={selected} onFrame={setFrame} onPlayingChange={setPlaying} />
          <div className={`verdict-strip ${verdict === "clear" ? "is-clear" : verdict === "hold" ? "is-hold" : "is-idle"}`}>
            <span className="display verdict-word">{verdict ? verdict.toUpperCase() : "NO VERDICT"}</span>
            <div className="verdict-text">
              {selected ? (
                <>
                  <b>
                    {modelLabel(selected.model, selected.provider)} · {selected.id}
                  </b>
                  <span>
                    {verification
                      ? failed.length
                        ? failed[0].reason
                        : verification.summary
                      : "Not checked yet. A model's plan is an opinion until the workstation checks it against frames."}
                  </span>
                </>
              ) : (
                <span>Send the proxy for a plan. The cloud never sees a pixel.</span>
              )}
            </div>
            <span className="verdict-lock">{verdict === "clear" ? "RENDER UNLOCKED" : "RENDER LOCKED"}</span>
          </div>
          <Timeline
            job={job}
            frame={frame}
            proposal={selected}
            onSeek={(index) => {
              setPlaying(false);
              setFrame(index);
            }}
          />
          <section className="log">
            <button className="link" onClick={() => setShowLog(!showLog)}>
              {showLog ? "Hide" : "Show"} session log ({job.events.length})
            </button>
            {showLog && (
              <ol>
                {job.events.map((event) => (
                  <li key={event.seq}>
                    <span className="mono muted">{event.at.slice(11, 19)}</span>
                    <span className="chip chip-dim">{event.stage}</span>
                    <span className="chip chip-dim">{event.mode}</span>
                    <span>{event.message}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </section>
        <Rail
          job={job}
          link={link}
          provider={provider}
          cloudNote={cloudNote}
          selected={selected}
          verification={verification}
          receipt={receipt}
          render={render}
          busy={busy}
          now={now}
          signature={signature}
          tamper={tamper}
          showProxy={showProxy}
          payload={payload}
          onLink={setLink}
          onProvider={setProvider}
          onPlan={plan}
          onSelect={select}
          onSign={sign}
          onRevise={revise}
          onRender={doRender}
          onVerify={verify}
          onTamper={tamperTest}
          onSeek={(index) => {
            setPlaying(false);
            setFrame(index);
          }}
          onToggleProxy={() => setShowProxy(!showProxy)}
          onPayload={openPayload}
        />
      </main>
    </div>
  );
}
