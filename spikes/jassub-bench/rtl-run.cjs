const { chromium } = require("/home/erez/karaoke-subtitle-studio/web/node_modules/playwright-core");
(async () => {
  const browser = await chromium.launch({ timeout: 30000 });
  const page = await browser.newPage({ viewport: { width: 1300, height: 760 } });
  page.on("pageerror", e => console.error("[pageerror]", e.message));
  await page.goto("http://127.0.0.1:8123/", { timeout: 15000 });
  await page.waitForFunction("window.__benchLoaded === true", { timeout: 15000 });
  const shots = [
    ["rtl-heb-plain.ass", 9.0, "shot-rtl-heb-plain.png"],
    ["rtl-heb-fade.ass", 0.4, "shot-rtl-heb-midfade.png"],
    ["rtl-heb-fade.ass", 9.0, "shot-rtl-heb-faded-done.png"],
    ["rtl-mixed.ass", 9.0, "shot-rtl-mixed.png"],
    ["rtl-mixed-marks.ass", 9.0, "shot-rtl-mixed-marks.png"],
  ];
  let first = true;
  for (const [ass, t, out] of shots) {
    const txt = await (await page.evaluate(async (a) => (await (await fetch(a)).text()), ass));
    if (first) { await page.evaluate(async (a) => { await window.bench.init(a); }, txt); first = false; }
    else { await page.evaluate(async (a) => { await window.bench.setTrackTimed(a); }, txt); }
    await page.evaluate(async (tt) => { await window.bench.seekAndRender(tt); }, t);
    await page.waitForTimeout(350);
    await page.screenshot({ path: out, clip: { x: 600, y: 300, width: 680, height: 140 } });
    console.log("shot", out);
  }
  await browser.close();
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
