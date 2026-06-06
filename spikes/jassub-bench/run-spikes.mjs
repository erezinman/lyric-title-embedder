// run-spikes.mjs — drive the bench page headlessly; print JSON results.
// Uses the web project's playwright install.
import { chromium } from "/home/erez/karaoke-subtitle-studio/web/node_modules/playwright-core/index.mjs";
import { readFileSync } from "node:fs";

const URL = "http://127.0.0.1:8123/";
const meta = JSON.parse(readFileSync("spikeB_meta.json", "utf-8"));

console.log("launching chromium...");
const browser = await chromium.launch({ timeout: 30000 });
console.log("launched");
const page = await browser.newPage({ viewport: { width: 1400, height: 1600 } });
page.setDefaultTimeout(30000);
page.on("console", (m) => { if (m.type() === "error") console.error("[page]", m.text()); });
page.on("pageerror", (e) => console.error("[pageerror]", e.message));
await page.goto(URL, { timeout: 15000 });
console.log("page loaded");
await page.waitForFunction("window.__benchLoaded === true", { timeout: 15000 });
console.log("bench loaded");

const ev = (fn, ...args) => page.evaluate(fn, ...args);

// ---------- sanity ----------
const sanity = await ev(async () => {
  const ass = await (await fetch("./sanity.ass")).text();
  await window.bench.init(ass);
  const ms = await window.bench.seekAndRender(1.0);
  const ink = await window.bench.inkCount(0, 0, 1280, 720);
  return { firstRenderMs: +ms.toFixed(1), inkPixels: ink };
});
console.log("SANITY", JSON.stringify(sanity));
if (sanity.inkPixels < 100) { console.error("SANITY FAILED — no ink rendered"); await browser.close(); process.exit(1); }
await page.screenshot({ path: "shot-sanity.png", clip: { x: 0, y: 0, width: 1280, height: 720 } });

// ---------- Spike A: full-song scale ----------
const spikeA = await ev(async () => {
  const ass = await (await fetch("./spikeA.ass")).text();
  const out = { assBytes: new Blob([ass]).size, setTrackMs: [], renders: [] };
  for (let i = 0; i < 5; i++) out.setTrackMs.push(+(await window.bench.setTrackTimed(ass)).toFixed(1));
  // 20 spread seeks across ~248s of content (31 events × 8s)
  const times = Array.from({ length: 20 }, (_, i) => 1.3 + i * 12.4);
  for (const t of times) out.renders.push(+(await window.bench.seekAndRender(t)).toFixed(1));
  out.midInk = await window.bench.inkCount(0, 0, 1280, 720);
  return out;
});
console.log("SPIKE_A", JSON.stringify(spikeA));
await page.screenshot({ path: "shot-fullsong.png", clip: { x: 0, y: 0, width: 1280, height: 720 } });

// ---------- Spike B: geometry (canvas vs DOM) ----------
// ASS colors are &HBBGGRR — convert meta colors to RGB for pixel classification.
const rgb = meta.colors.map((c) => {
  const h = c.replace(/&H?|&/g, "").padStart(6, "0");
  return { b: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), r: parseInt(h.slice(4, 6), 16) };
});

async function measureCanvas(assUrl) {
  return ev(async ({ assUrl, rgb }) => {
    const ass = await (await fetch(assUrl)).text();
    await window.bench.setTrackTimed(ass);
    await window.bench.seekAndRender(1.0);
    return window.bench.colorBoxes(0, 0, 1280, 720, rgb);
  }, { assUrl, rgb });
}

const canvasBoxes = await measureCanvas("./spikeB.ass");
await page.screenshot({ path: "shot-geometry.png", clip: { x: 0, y: 0, width: 1280, height: 720 } });
const canvasBoxesBold = await measureCanvas("./spikeB_bold.ass");
const dom = await ev(async (words) => {
  await window.bench.fontReady();
  return window.bench.measureDom(words);
}, meta.words);

console.log("SPIKE_B_CANVAS", JSON.stringify(canvasBoxes));
console.log("SPIKE_B_CANVAS_BOLD", JSON.stringify(canvasBoxesBold));
console.log("SPIKE_B_DOM", JSON.stringify(dom));

// ---------- Spike B analysis ----------
function analyze(boxes, domSpans) {
  const c0 = boxes[0].minX;
  const cTotal = boxes[boxes.length - 1].maxX - c0;
  const d0 = domSpans[0].left;
  const dTotal = (domSpans[domSpans.length - 1].left + domSpans[domSpans.length - 1].width) - d0;
  const scale = cTotal / dTotal;
  const rows = boxes.map((b, i) => {
    const cOff = b.minX - c0, cW = b.width;
    const dOffRaw = domSpans[i].left - d0, dWRaw = domSpans[i].width;
    return {
      word: meta.words[i],
      canvas: { off: cOff, w: cW },
      domRaw: { off: +dOffRaw.toFixed(1), w: +dWRaw.toFixed(1) },
      domNorm: { off: +(dOffRaw * scale).toFixed(1), w: +(dWRaw * scale).toFixed(1) },
      rawDrift: +(dOffRaw - cOff).toFixed(1),
      normDrift: +(dOffRaw * scale - cOff).toFixed(1),
    };
  });
  return { scale: +scale.toFixed(4), rows,
    maxNormDrift: Math.max(...rows.map((r) => Math.abs(r.normDrift))),
    meanNormDrift: +(rows.reduce((s, r) => s + Math.abs(r.normDrift), 0) / rows.length).toFixed(2) };
}
console.log("SPIKE_B_ANALYSIS", JSON.stringify(analyze(canvasBoxes, dom.spans), null, 1));

await browser.close();
