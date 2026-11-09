// Drive the real BrandForward console and record it. Nothing here is mocked:
// it clicks the same buttons a judge would, against a running engine.
//
//   CONSOLE=http://localhost:3000 node capture.mjs
//
// Writes public/capture.webm and public/markers.json (ms offsets of each beat).

import { chromium } from "playwright";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.CONSOLE ?? "http://localhost:3000";
const OUT = path.resolve("public");
const RAW = path.resolve(".capture-tmp");
const W = 1600;
const H = 900;

await rm(RAW, { recursive: true, force: true });
await mkdir(RAW, { recursive: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  recordVideo: { dir: RAW, size: { width: W, height: H } },
  colorScheme: "dark",
});
const page = await context.newPage();
const t0 = Date.now();
const markers = {};
const mark = (name) => {
  markers[name] = Date.now() - t0;
  console.log(String(markers[name]).padStart(7), name);
};
const pause = (ms) => page.waitForTimeout(ms);

// A visible cursor, since headless video has none.
await page.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    const dot = document.createElement("div");
    dot.id = "__cursor";
    Object.assign(dot.style, {
      position: "fixed", left: "0px", top: "0px", width: "22px", height: "22px", marginLeft: "-11px", marginTop: "-11px",
      borderRadius: "50%", border: "2px solid #f3ddb0", background: "rgba(224,181,106,0.25)", zIndex: 99999,
      pointerEvents: "none", transition: "transform 0.12s", boxShadow: "0 0 0 4px rgba(0,0,0,0.35)",
    });
    document.body.appendChild(dot);
    addEventListener("mousemove", (e) => { dot.style.left = e.clientX + "px"; dot.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => { dot.style.transform = "scale(0.7)"; }, true);
    addEventListener("mouseup", () => { dot.style.transform = "scale(1)"; }, true);
  });
});

async function click(locator, { settle = 600 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("no box for click target");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
  await pause(250);
  await locator.click();
  await pause(settle);
}

async function reveal(selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, selector);
  await pause(900);
}

const button = (name) => page.getByRole("button", { name, exact: true });
const nextBtn = () => page.locator('header button[title="Next step (N)"]');
const idle = () => page.waitForFunction(() => document.querySelectorAll('[role="status"]').length === 0, null, { timeout: 300_000 });
async function next(settle = 300) {
  await click(nextBtn(), { settle: 150 });
  await page.waitForTimeout(250);
  await idle();
  await pause(settle);
}

// Where each key element is on screen at a beat, so the edit can frame it exactly.
const SELECTORS = {
  monitor: "main .aspect-video",
  verdict: 'section[aria-live="polite"]',
  timeline: 'section[aria-label="Timeline"]',
  meter: 'header [aria-label="Boundary meter"]',
  step1: 'aside section[data-step="1"]',
  egress: 'aside section[data-step="1"] ul',
  plan: 'aside section[data-step="2"] button.ring-1',
  checks: 'aside section[data-step="3"] ul',
  receipt: 'aside section[data-step="4"]',
  render: 'aside section[data-step="5"]',
  alert: '[role="alert"]',
  busy: 'aside [role="status"]',
};
const boxes = {};
async function snap(beat) {
  boxes[beat] = await page.evaluate((sels) => {
    const out = {};
    for (const [name, sel] of Object.entries(sels)) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const x = Math.max(0, r.left), y = Math.max(0, r.top);
      const w = Math.min(innerWidth, r.right) - x, h = Math.min(innerHeight, r.bottom) - y;
      if (w > 4 && h > 4) out[name] = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
    }
    return out;
  }, SELECTORS);
}

// 1. A fresh job: master drawn, frames hashed, wordmark measured.
await page.goto(BASE + "/jobs/harbor-launch");
await page.waitForSelector("main video", { timeout: 60_000 });
await page.waitForFunction(() => {
  const v = document.querySelector("main video");
  return v && v.readyState >= 2;
});
await page.mouse.move(W / 2, H / 2);
mark("console");
await snap("console");
await pause(1500);

// Play the shot so the crane swing is visible.
await click(button("Play"), { settle: 0 });
mark("play");
await pause(6600);
mark("play_end");

// 2. What leaves: show the proxy.
await click(page.getByRole("button", { name: /Show proxy JSON/ }), { settle: 2400 });
mark("proxy");
await snap("proxy");
await click(page.getByRole("button", { name: /Hide proxy JSON/ }), { settle: 400 });

// 3. Scripted cloud plan, then HOLD with frame evidence.
await next(600);
mark("cloud_plan");
await snap("cloud_plan");
await pause(2200);
await next(500);
mark("hold");
await snap("hold");
await pause(4500);

// The render is refused while the receipt says HOLD.
await click(button("Render proof cut"), { settle: 1200 });
mark("render_refused");
await snap("render_refused");
await pause(1800);

// 4. Revise with evidence: only failed checks go back.
await next(0);
mark("revised");
await next(500);
mark("clear");
await snap("clear");
await pause(3000);

// 5. LIVE: Claude Opus 5.5 plans from the proxy, in real time.
await click(page.getByRole("radio", { name: "Live" }), { settle: 900 });
mark("live_toggle");
await snap("live_toggle");
await click(page.locator('aside section[data-step="1"] button', { hasText: "Send proxy" }), { settle: 0 });
mark("live_start");
await pause(1200);
await snap("live_busy");
await idle();
mark("live_done");
await pause(600);
await snap("live_done");
await pause(2600);
await next(500);
mark("live_clear");
await snap("live_clear");
await pause(4000);

// 6. Render the cleared live plan; the proof cut autoplays in the rail.
await next(800);
mark("rendered");
await snap("rendered");
await pause(5500);

// 7. Receipt: verify, then tamper.
await next(1000);
await next(500);
mark("tamper");
await snap("tamper");
await pause(3000);

// 8. Drop the link: on-device planning, nothing transmitted.
await next(600);
mark("link_down");
await snap("link_down");
await pause(900);
await click(nextBtn(), { settle: 300 });
mark("local_start");
await idle();
mark("local_done");
await pause(600);
await snap("local_done");
await pause(1800);
await next(500);
mark("local_verdict");
await snap("local_verdict");
await pause(4000);
mark("end");

const video = page.video();
await context.close();
await browser.close();
const raw = await video.path();
await rename(raw, path.join(OUT, "capture.webm"));
await rm(RAW, { recursive: true, force: true });
await writeFile(path.join(OUT, "markers.json"), JSON.stringify({ ...markers, boxes }, null, 2) + "\n");
console.log("wrote public/capture.webm and public/markers.json");
const files = await readdir(OUT);
console.log(files.join(" "));
