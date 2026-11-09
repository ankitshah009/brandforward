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

// 1. Landing: the problem, then the trust boundary.
await page.goto(BASE + "/");
await page.mouse.move(W / 2, H / 2);
mark("landing");
await pause(4500);
await page.mouse.wheel(0, 620);
await pause(3000);
await page.mouse.wheel(0, -620);
await pause(800);

// 2. A fresh job: master drawn, frames hashed, wordmark measured.
await click(page.getByRole("link", { name: /Run the harbor-launch job/ }).first(), { settle: 0 });
await page.waitForSelector("main video", { timeout: 60_000 });
await page.waitForFunction(() => {
  const v = document.querySelector("main video");
  return v && v.readyState >= 2;
});
mark("console");
await pause(2500);

// Play the shot so the crane swing is visible.
await click(button("Play"), { settle: 0 });
mark("play");
await pause(6600);
mark("play_end");

// 3. What leaves: show the proxy.
await click(page.getByRole("button", { name: /Show proxy JSON/ }), { settle: 2400 });
mark("proxy");
await click(page.getByRole("button", { name: /Hide proxy JSON/ }), { settle: 400 });

// 4. Cloud plan (scripted, for a repeatable demo).
await next(0);
mark("cloud_plan");
await pause(2500);

// 5. Cross-check: HOLD with frame evidence.
await next(0);
mark("hold");
await pause(4500);
mark("hold_end");

// Render is refused while the receipt is HOLD.
await click(button("Render proof cut"), { settle: 2500 });
mark("render_refused");

// 6. Revise with evidence: only failed checks go back to the planner.
await next(0);
mark("revised");
await pause(1500);
await next(0);
mark("clear");
await pause(3500);

// 7. Render the cleared plan; the proof cut autoplays in the rail.
await next(0);
mark("rendered");
await pause(6500);
mark("rendered_end");

// 8. Receipt: verify, then tamper.
await next(1200);
await next(0);
mark("tamper");
await pause(3500);

// 9. Drop the link: on-device planning, nothing transmitted.
await next(900);
await click(nextBtn(), { settle: 300 });
mark("local_start");
await idle();
mark("local_done");
await pause(2500);
await next(0);
mark("local_verdict");
await pause(4500);
mark("end");

const video = page.video();
await context.close();
await browser.close();
const raw = await video.path();
await rename(raw, path.join(OUT, "capture.webm"));
await rm(RAW, { recursive: true, force: true });
await writeFile(path.join(OUT, "markers.json"), JSON.stringify(markers, null, 2) + "\n");
console.log("wrote public/capture.webm and public/markers.json");
const files = await readdir(OUT);
console.log(files.join(" "));
