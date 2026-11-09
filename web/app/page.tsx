import Link from "next/link";

const STEPS = [
  ["The footage stays", "The raw master is decoded, hashed, and measured on the workstation. It is never uploaded."],
  ["Only a 2 KB proxy leaves", "Track ids, measured spans, redaction flags, transcript, keyframe hashes. A guard rejects paths, pixels, and file bytes."],
  ["Cloud plans are opinions", "A frontier model plans the cut from the proxy. Its claims about the footage are not trusted."],
  ["Frames decide", "Every claim, and everything an edit implies, is checked against decoded frames. A wrong claim is a HOLD with frame evidence."],
  ["Receipts gate the render", "An Ed25519 receipt separates what was measured from what a model said. ffmpeg runs only on a valid CLEAR."],
];

export default function HomePage() {
  return (
    <main className="landing">
      <header className="landing-top">
        <span className="brand">
          Brand<span>Forward</span>
        </span>
        <span className="muted">Local-first pre-publishability · built for ThinkStation P8 · RTX PRO 6000 Blackwell</span>
      </header>
      <section className="hero">
        <p className="kicker">The problem</p>
        <h1 className="display">AI video tools want your unreleased footage. Then they guess about it.</h1>
        <p className="dek">
          Enterprises cannot upload gigabytes of unreleased film to a cloud black box, and cloud models hallucinate timestamps and objects they never saw.
          BrandForward keeps every pixel on the workstation, sends the cloud a kilobyte-sized proxy, checks its plan against real frames, and signs what it
          found.
        </p>
        <div className="actions">
          <Link className="btn btn-primary btn-lg" href="/jobs/harbor-launch">
            Run the harbor-launch job
          </Link>
          <span className="mono muted">Dispute: the cloud wants a logo hold at 00:03.900. A crane load covers the logo.</span>
        </div>
      </section>
      <ol className="flow">
        {STEPS.map(([title, body], index) => (
          <li key={title}>
            <span className="mono step-n">{String(index + 1).padStart(2, "0")}</span>
            <h2>{title}</h2>
            <p>{body}</p>
          </li>
        ))}
      </ol>
    </main>
  );
}
