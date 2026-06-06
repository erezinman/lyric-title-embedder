// run-geometry.cjs — spike B v3: cumulative-prefix rows, color-free.
const { chromium } = require("/home/erez/karaoke-subtitle-studio/web/node_modules/playwright-core");
const { readFileSync } = require("node:fs");
(async () => {
  const meta = JSON.parse(readFileSync("spikeB_meta.json", "utf-8"));
  const browser = await chromium.launch({ timeout: 30000 });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1600 } });
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  await page.goto("http://127.0.0.1:8123/", { timeout: 15000 });
  await page.waitForFunction("window.__benchLoaded === true", { timeout: 15000 });

  // canvas: ink bbox per row band
  const canvasRows = await page.evaluate(async ({ rows }) => {
    const ass = await (await fetch("./spikeB.ass")).text();
    await window.bench.init(ass);
    await window.bench.seekAndRender(1.0);
    await new Promise((r) => setTimeout(r, 300));
    const out = [];
    for (const { y0, y1 } of rows) {
      const px = await window.bench.getPixels(0, y0, 1280, y1 - y0);
      let minX = 1e9, maxX = -1;
      for (let y = 0; y < px.height; y++) for (let x = 0; x < px.width; x++) {
        const i = (y * px.width + x) * 4;
        if (px.data[i] > 120 && px.data[i + 1] > 120 && px.data[i + 2] > 120) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
        }
      }
      out.push({ minX, maxX, w: maxX - minX + 1 });
    }
    return out;
  }, { rows: meta.rows });
  await page.screenshot({ path: "shot-geometry.png", clip: { x: 0, y: 0, width: 1280, height: 720 } });

  // DOM: widths of the same prefix strings with the same font file
  const domRows = await page.evaluate(async (words) => {
    await window.bench.fontReady();
    document.getElementById('domline').style.fontWeight = 'bold';
    const dl = document.getElementById("domline");
    const out = [];
    for (let i = 0; i < words.length; i++) {
      dl.textContent = words.slice(0, i + 1).join(" ");
      void dl.offsetWidth;
      out.push(dl.getBoundingClientRect().width);
    }
    return out;
  }, meta.words);

  // least-squares uniform scale: minimize sum (c - s*d)^2
  const num = canvasRows.reduce((a, c, i) => a + c.w * domRows[i], 0);
  const den = domRows.reduce((a, d) => a + d * d, 0);
  const s = num / den;
  console.log("SCALE(ls)", s.toFixed(4), " (libass-ink / DOM-rect at same nominal 64)");
  const rows = canvasRows.map((c, i) => {
    const fit = s * domRows[i];
    return { prefixWords: i + 1, canvasInkW: c.w, domW: +domRows[i].toFixed(1),
             domScaled: +fit.toFixed(1), resid: +(c.w - fit).toFixed(1) };
  });
  console.log(JSON.stringify(rows, null, 1));
  // per-word advance comparison (differences of consecutive prefixes)
  const adv = [];
  for (let i = 1; i < rows.length; i++) {
    adv.push({ word: meta.words[i],
      canvasAdv: canvasRows[i].w - canvasRows[i - 1].w,
      domScaledAdv: +((domRows[i] - domRows[i - 1]) * s).toFixed(1) });
  }
  console.log("ADVANCES", JSON.stringify(adv, null, 1));
  const resids = rows.map((r) => Math.abs(r.resid));
  console.log("RESID max", Math.max(...resids).toFixed(1), "mean",
    (resids.reduce((a, c) => a + c, 0) / resids.length).toFixed(1), "px at 1280x720");
  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
