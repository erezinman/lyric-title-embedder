const { chromium } = require("/home/erez/karaoke-subtitle-studio/web/node_modules/playwright-core");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 740 } });
  await page.goto("http://127.0.0.1:8123/", { timeout: 15000 });
  await page.waitForFunction("window.__benchLoaded === true", { timeout: 15000 });
  await page.evaluate(async () => {
    const ass = await (await fetch("./sanity.ass")).text();
    await window.bench.init(ass);
    await window.bench.seekAndRender(1.0);
  });
  await page.waitForTimeout(300);   // let the placeholder canvas composite
  await page.screenshot({ path: "shot-probe.png", clip: { x: 0, y: 0, width: 1280, height: 720 } });
  const ink = await page.evaluate(() => window.bench.inkCount(0, 0, 1280, 720));
  console.log("inPageInk:", ink);
  await browser.close();
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
