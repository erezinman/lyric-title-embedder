// probe-boot.cjs — boot jassub with debug logging, dump everything for 20s.
const { chromium } = require("/home/erez/karaoke-subtitle-studio/web/node_modules/playwright-core");
(async () => {
  const browser = await chromium.launch({ timeout: 30000 });
  const page = await browser.newPage();
  page.on("console", (m) => console.log("[page:" + m.type() + "]", m.text()));
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  page.on("requestfailed", (r) => console.log("[reqfail]", r.url(), r.failure()?.errorText));
  await page.goto("http://127.0.0.1:8123/", { timeout: 15000 });
  await page.waitForFunction("window.__benchLoaded === true", { timeout: 15000 });
  console.log("-- booting with debug --");
  const res = await page.evaluate(async () => {
    window.addEventListener("unhandledrejection", (e) => console.log("UNHANDLED:", String(e.reason)));
    const ass = await (await fetch("./sanity.ass")).text();
    return Promise.race([
      window.bench.init(ass, true).then(() => "BOOT_OK"),
      new Promise((r) => setTimeout(() => r("BOOT_TIMEOUT"), 18000)),
    ]);
  });
  console.log("RESULT:", res);
  if (res === "BOOT_OK") {
    const ms = await page.evaluate(() => window.bench.seekAndRender(1.0));
    const ink = await page.evaluate(() => window.bench.inkCount(0, 0, 1280, 720));
    console.log("renderMs:", ms, "ink:", ink);
  }
  await browser.close();
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
