"use client";

import type { Check, EgressRecord, Job, Proposal, Receipt, RenderRecord, Verification } from "@/lib/api";
import { frameUrl, mediaUrl } from "@/lib/api";
import { bytes, modelLabel, pct, short, sourceLabel } from "@/lib/format";

export interface Busy {
  label: string;
  started: number;
}

interface RailProps {
  job: Job;
  link: "up" | "down";
  provider: "scripted" | "live";
  cloudNote: string;
  selected: Proposal | null;
  verification: Verification | null;
  receipt: Receipt | null;
  render: RenderRecord | null;
  busy: Busy | null;
  now: number;
  signature: { valid: boolean; reason: string } | null;
  tamper: { valid: boolean; reason: string } | null;
  showProxy: boolean;
  payload: { seq: number; text: string } | null;
  onLink: (link: "up" | "down") => void;
  onProvider: (provider: "scripted" | "live") => void;
  onPlan: () => void;
  onSelect: (id: string) => void;
  onSign: () => void;
  onRevise: () => void;
  onRender: () => void;
  onVerify: () => void;
  onTamper: () => void;
  onSeek: (frame: number) => void;
  onToggleProxy: () => void;
  onPayload: (seq: number | null) => void;
}

function Step({ n, title, state, children }: { n: number; title: string; state: "done" | "active" | "idle"; children: React.ReactNode }) {
  return (
    <section className={`step step-${state}`}>
      <header>
        <span className="step-n mono">{String(n).padStart(2, "0")}</span>
        <h3>{title}</h3>
      </header>
      <div className="step-body">{children}</div>
    </section>
  );
}

function Spinner({ busy, now }: { busy: Busy; now: number }) {
  return (
    <p className="busy" role="status">
      <span className="spin" /> {busy.label} <span className="mono">{((now - busy.started) / 1000).toFixed(1)} s</span>
    </p>
  );
}

const STATUS_TEXT: Record<EgressRecord["status"], string> = {
  blocked: "Not sent · link down",
  scripted: "Scripted · not transmitted",
  sending: "Sending",
  answered: "Sent · answered",
  failed: "Failed · failed over",
  rejected: "Answer rejected · failed over",
};

function EgressRow({ record, onOpen }: { record: EgressRecord; onOpen: () => void }) {
  const tone = record.status === "answered" ? "warn" : record.status === "blocked" || record.status === "scripted" ? "ok" : "bad";
  return (
    <li className="egress-row">
      <span className={`chip chip-${tone}`}>{STATUS_TEXT[record.status]}</span>
      <span className="mono">
        #{record.seq} {record.kind === "revision" ? "revision" : "plan"} · {bytes(record.bytes)} left · raw media {bytes(record.raw_media_bytes)}
      </span>
      <button className="link" onClick={onOpen}>
        exact payload
      </button>
      {record.reason && <small className="muted">{record.reason}</small>}
    </li>
  );
}

function CheckRow({ check, jobId, onSeek }: { check: Check; jobId: string; onSeek: (frame: number) => void }) {
  const worst = check.evidence.worst_frame;
  return (
    <li className={`check ${check.passed ? "check-pass" : "check-fail"}`}>
      <div className="check-head">
        <span className="check-mark" aria-label={check.passed ? "passed" : "failed"}>
          {check.passed ? "✓" : "✕"}
        </span>
        <span className={`kind kind-${check.kind}`}>{check.kind}</span>
        <span className="check-title">
          {check.subject.replace("_", " ")} · {check.asserted.replace("_", " ")}
          {check.interval ? (
            <span className="mono muted">
              {" "}
              {check.interval.start}–{check.interval.end}
            </span>
          ) : null}
        </span>
        <span className="check-src">{check.source === "claim" ? "model claim" : check.source === "edit" ? "implied by edit" : "policy"}</span>
      </div>
      <p className="check-reason">{check.reason}</p>
      {check.kind === "measured" && typeof worst === "number" && (
        <button className="evidence" onClick={() => onSeek(worst)} title="Jump the monitor to this frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={frameUrl(jobId, worst, 320)} alt={`Frame ${worst}`} width={160} height={90} />
          <span className="mono">
            frame {worst} · {check.evidence.worst_timecode}
            <br />
            {pct(check.evidence.worst_coverage_bp ?? 0)} covered · {check.evidence.frames_examined} frames examined
            <br />
            sha {short(check.evidence.worst_frame_sha256, 16)}
          </span>
        </button>
      )}
    </li>
  );
}

export default function Rail(props: RailProps) {
  const { job, selected, verification, receipt, render, busy, now } = props;
  const masterBytes = job.asset.byte_length;
  const ratio = Math.max(0.6, (job.proxy_bytes / masterBytes) * 100);
  const hasProposals = job.proposals.length > 0;
  const verdict = receipt?.body.verdict ?? verification?.verdict ?? null;
  const planLabel =
    props.link === "down" ? "Plan on device" : props.provider === "live" ? "Send proxy to live cloud" : "Send proxy to cloud (scripted)";

  return (
    <aside className="rail">
      <Step n={1} title="What leaves the machine" state={hasProposals ? "done" : "active"}>
        <div className="sizes">
          <div className="size-row">
            <span>Raw master</span>
            <div className="size-bar">
              <i style={{ width: "100%" }} className="size-master" />
            </div>
            <span className="mono">{bytes(masterBytes)}</span>
            <span className="chip chip-ok">stays</span>
          </div>
          <div className="size-row">
            <span>Proxy</span>
            <div className="size-bar">
              <i style={{ width: `${ratio}%` }} className="size-proxy" />
            </div>
            <span className="mono">{bytes(job.proxy_bytes)}</span>
            <span className="chip chip-warn">may leave</span>
          </div>
        </div>
        <p className="muted small">
          Track ids, measured spans, redaction flags, transcript, keyframe hashes. The leakage guard rejects paths, pixels, and file bytes before anything is
          built.{" "}
          <button className="link" onClick={props.onToggleProxy}>
            {props.showProxy ? "Hide proxy" : "Show proxy"}
          </button>
        </p>
        {props.showProxy && <pre className="json">{JSON.stringify(job.proxy, null, 2)}</pre>}

        <div className="controls">
          <div className="seg" role="group" aria-label="Network link">
            <button className={props.link === "up" ? "on" : ""} onClick={() => props.onLink("up")}>
              Link up
            </button>
            <button className={props.link === "down" ? "on on-bad" : ""} onClick={() => props.onLink("down")}>
              Drop link
            </button>
          </div>
          <div className="seg" role="group" aria-label="Cloud planner">
            <button className={props.provider === "scripted" ? "on" : ""} onClick={() => props.onProvider("scripted")} disabled={props.link === "down"}>
              Scripted
            </button>
            <button className={props.provider === "live" ? "on" : ""} onClick={() => props.onProvider("live")} disabled={props.link === "down"}>
              Live
            </button>
          </div>
        </div>
        <p className="muted small">{props.link === "down" ? "Air-gapped. Nothing is transmitted; planning fails over to on-device weights." : props.cloudNote}</p>
        <button className="btn btn-primary" onClick={props.onPlan} disabled={Boolean(busy)}>
          {planLabel}
        </button>
        {job.egress.length > 0 && (
          <ul className="egress">
            {[...job.egress].reverse().map((record) => (
              <EgressRow key={record.seq} record={record} onOpen={() => props.onPayload(record.seq)} />
            ))}
          </ul>
        )}
        {props.payload && (
          <div className="payload">
            <div className="payload-head">
              <span className="mono">
                Egress #{props.payload.seq} · exact request body · {bytes(new Blob([props.payload.text]).size)}
              </span>
              <button className="link" onClick={() => props.onPayload(null)}>
                close
              </button>
            </div>
            <pre className="json">{(() => {
              try {
                return JSON.stringify(JSON.parse(props.payload.text), null, 2);
              } catch {
                return props.payload.text;
              }
            })()}</pre>
          </div>
        )}
      </Step>

      <Step n={2} title="Edit plans · model opinions" state={!hasProposals ? "idle" : verification ? "done" : "active"}>
        {!hasProposals && <p className="muted small">No plan yet. The cloud sees only the proxy above.</p>}
        <ul className="proposals">
          {[...job.proposals].reverse().map((proposal) => {
            const v = job.verifications.find((item) => item.proposal_id === proposal.id);
            return (
              <li key={proposal.id}>
                <button className={`proposal ${selected?.id === proposal.id ? "proposal-on" : ""}`} onClick={() => props.onSelect(proposal.id)}>
                  <div className="proposal-head">
                    <span className={`chip ${proposal.source === "cloud" ? "chip-cloud" : "chip-local"}`}>{sourceLabel(proposal.source)}</span>
                    <b>{modelLabel(proposal.model, proposal.provider)}</b>
                    {proposal.mode === "scripted" && <span className="chip chip-dim">scripted</span>}
                    {proposal.revises && <span className="chip chip-dim">revises {proposal.revises}</span>}
                    {v && <span className={`chip ${v.verdict === "clear" ? "chip-ok" : "chip-bad"}`}>{v.verdict.toUpperCase()}</span>}
                  </div>
                  <p>{proposal.summary}</p>
                  <dl className="plan mono">
                    <dt>logo hold</dt>
                    <dd>
                      {proposal.plan.wordmark_hold.start}–{proposal.plan.wordmark_hold.end}
                    </dd>
                    <dt>lower third</dt>
                    <dd>“{proposal.plan.lower_third.text}”</dd>
                    <dt>face blur</dt>
                    <dd>{proposal.plan.face_blur ? "yes" : "no"}</dd>
                    <dt>claims</dt>
                    <dd>{proposal.claims.length}</dd>
                  </dl>
                </button>
              </li>
            );
          })}
        </ul>
      </Step>

      <Step n={3} title="Cross-check against frames" state={!selected ? "idle" : verification ? "done" : "active"}>
        {selected && !verification && (
          <>
            <p className="muted small">
              Every claim, and everything the edits imply, is checked against decoded frames, scene geometry, and redaction policy. Then the result is signed.
            </p>
            <button className="btn btn-primary" onClick={props.onSign} disabled={Boolean(busy)}>
              Cross-check &amp; sign receipt
            </button>
          </>
        )}
        {verification && (
          <>
            <ul className="checks">
              {verification.checks.map((check) => (
                <CheckRow key={check.id} check={check} jobId={job.id} onSeek={props.onSeek} />
              ))}
            </ul>
            {verification.verdict === "hold" && (
              <button className="btn btn-primary" onClick={props.onRevise} disabled={Boolean(busy)}>
                Revise with evidence
              </button>
            )}
            {verification.verdict === "hold" && (
              <p className="muted small">
                Sends the failed checks back to the planner: ids, intervals, percentages, reasons. Never pixels.
                {selected?.source !== "cloud" ? " This plan came from on-device weights, so the revision stays on device." : ""}
              </p>
            )}
          </>
        )}
      </Step>

      <Step n={4} title="Pre-publishability receipt" state={!receipt ? "idle" : "done"}>
        {!receipt && <p className="muted small">Signed after the cross-check. Ed25519 over canonical JSON.</p>}
        {receipt && (
          <>
            <div className={`receipt-verdict ${verdict === "clear" ? "is-clear" : "is-hold"}`}>
              <span className="display">{verdict === "clear" ? "CLEAR" : "HOLD"}</span>
              <span className="mono">{receipt.receipt_id}</span>
            </div>
            <div className="ledger">
              <div>
                <h4>Measured · by this workstation</h4>
                <dl className="mono">
                  <dt>master sha256</dt>
                  <dd>{short(String(receipt.body.measured.asset_sha256), 16)}</dd>
                  <dt>frames</dt>
                  <dd>
                    {receipt.body.measured.frame_count} @ {receipt.body.measured.fps} fps
                  </dd>
                  <dt>vision</dt>
                  <dd>{receipt.body.measured.vision_method}</dd>
                  <dt>template</dt>
                  <dd>{short(String(receipt.body.measured.template_sha256), 16)}</dd>
                  <dt>ffmpeg</dt>
                  <dd>{receipt.body.measured.ffmpeg}</dd>
                </dl>
              </div>
              <div>
                <h4>Opinion · from a model</h4>
                <dl className="mono">
                  <dt>proposal</dt>
                  <dd>{receipt.body.opinion.proposal_id}</dd>
                  <dt>planner</dt>
                  <dd>{modelLabel(receipt.body.opinion.model, receipt.body.opinion.provider)}</dd>
                  <dt>plan sha256</dt>
                  <dd>{short(receipt.body.opinion.proposal_sha256, 16)}</dd>
                  <dt>saw proxy</dt>
                  <dd>{short(receipt.body.opinion.input_proxy_sha256, 16)}</dd>
                </dl>
              </div>
            </div>
            <p className="muted small mono">
              {receipt.algorithm} · key {short(receipt.public_key, 16)} · sig {short(receipt.signature, 16)}
            </p>
            <div className="row">
              <button className="btn btn-ghost btn-sm" onClick={props.onVerify} disabled={Boolean(busy)}>
                Verify signature
              </button>
              <button className="btn btn-ghost btn-sm" onClick={props.onTamper} disabled={Boolean(busy)}>
                Tamper test
              </button>
              <a
                className="btn btn-ghost btn-sm"
                download={`${receipt.receipt_id}.json`}
                href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(receipt, null, 2))}`}
              >
                Download
              </a>
            </div>
            {props.signature && (
              <p className={`sig ${props.signature.valid ? "sig-ok" : "sig-bad"}`}>
                {props.signature.valid ? "✓ Valid." : "✕ Invalid."} {props.signature.reason}
              </p>
            )}
            {props.tamper && (
              <p className={`sig ${props.tamper.valid ? "sig-ok" : "sig-bad"}`}>
                Flipped the verdict to {verdict === "clear" ? "HOLD" : "CLEAR"} and re-verified: {props.tamper.valid ? "✓ still valid (unexpected)" : "✕ rejected."}{" "}
                {props.tamper.reason}
              </p>
            )}
          </>
        )}
      </Step>

      <Step n={5} title="Render on device" state={render ? "done" : verdict === "clear" ? "active" : "idle"}>
        <div className={`lock ${verdict === "clear" ? "lock-open" : ""}`}>
          <span className="lock-icon" aria-hidden>
            {verdict === "clear" ? "UNLOCKED" : "LOCKED"}
          </span>
          <span>
            {verdict === "clear"
              ? "Unlocked by a valid CLEAR receipt for this exact plan and master."
              : "Locked. ffmpeg will not run without a valid CLEAR receipt for this plan."}
          </span>
        </div>
        <button className="btn btn-primary" onClick={props.onRender} disabled={Boolean(busy) || !receipt}>
          Render proof cut
        </button>
        {render && (
          <div className="proof">
            <video src={mediaUrl(job.id, "proof.mp4", render.sha256.slice(0, 8))} controls muted playsInline preload="metadata" />
            <p className="muted small mono">
              {render.output_name} · {bytes(render.bytes)} · sha {short(render.sha256, 16)} · receipt {render.receipt_id}
            </p>
          </div>
        )}
      </Step>
      {busy && <Spinner busy={busy} now={now} />}
    </aside>
  );
}
