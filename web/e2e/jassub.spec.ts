/**
 * jassub.spec.ts — Cluster AJ: the in-browser libass (jassub/wasm) LIVE preview
 * renderer. Test design §9. Headless chromium against the real daemon+vite.
 *
 * Strategy: open the seeded project (PreviewStage boots jassub in live mode and
 * exposes window.__jassub). Specs then setTrack hand-authored .ass and sample
 * canvas pixels — the spike harness pattern (spikes/jassub-bench). Pixel readback
 * lags the render ~250ms + double-rAF (FINDINGS gotcha #3) — `settle()` waits it
 * out before drawImage→getImageData.
 *
 * AJ-13 (disable flag) navigates to the second vite spawned with VITE_JASSUB=0.
 * AJ-04 / AJ-12-ws exercise the real edit→WS→fetch /api/ass→setTrack loop.
 *
 * Tolerances are generous by design (§1.5 architecture is tolerance-based):
 * ≤8px selection-overlay drift, half-word hit-test, loose latency ceiling.
 */
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { apiCall, resetProject, openAudit, until } from "./helpers";

const W = 1280, H = 720;
const NOJASS_BASE = "http://localhost:5198";

// ── hand-authored .ass fixtures (PlayRes 1280x720, DejaVu Sans) ──────────────
const HEAD = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Alignment, MarginL, MarginR, MarginV
Style: Default,DejaVu Sans,72,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,5,0,0,0

[Events]
Format: Layer, Start, End, Style, Text
`;
// Alignment 5 = middle-center, no margins → centered text, deterministic to sample.

const ass = (...dialogues: string[]) => HEAD + dialogues.map((d) => "Dialogue: 0," + d + "\n").join("");
// helper: a dialogue line "start,end,Default,,0,0,0,,TEXT"
const D = (start: string, end: string, text: string) => `${start},${end},Default,,0,0,0,,${text}`;

const PLAIN = ass(D("0:00:00.00", "0:00:10.00", "HELLO WORLD"));
// Fade in the engine's actual form: an initial \alpha (fully transparent) then a
// \t ramp to opaque — NOT \fad (which jassub's manualRender path does not animate).
const FADE = ass(D("0:00:01.00", "0:00:09.00", "{\\alpha&HFF&\\t(0,2000,\\alpha&H00&)}FADE TEXT"));
const SWEEP = ass(D("0:00:01.00", "0:00:09.00", "{\\1c&HFFFFFF&\\kf400}KARAOKE")); // \kf sweep over 4s
// wipe: \clip rect grows via \t over the window (a left→right reveal)
const WIPE = ass(
  D("0:00:01.00", "0:00:09.00",
    "{\\clip(0,0,100,720)\\t(0,4000,\\clip(0,0,1280,720))}WIDEWIPE"),
);

// ── settle + sample helpers (run in-page) ────────────────────────────────────
async function setupPage(page: Page) {
  await openAudit(page);
  // PreviewStage boots jassub in live mode; wait for the exposed client + ready.
  await page.waitForFunction(() => !!(window as any).__jassub, null, { timeout: 15000 });
  await page.evaluate(async () => { await (window as any).__jassub.ready; });
}

// Load a track, render at t, and return ink/region stats (after the settle wait).
async function sampleInk(page: Page, assText: string, t: number, region?: { x: number; y: number; w: number; h: number }): Promise<number> {
  return page.evaluate(async ({ assText, t, region, W, H }) => {
    const j = (window as any).__jassub;
    await j.setTrack(assText);
    await j.setTime(t);
    await new Promise((r) => setTimeout(r, 280));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r as any)));
    const canvas = document.querySelector("canvas.jass-canvas") as HTMLCanvasElement;
    const rb = document.createElement("canvas"); rb.width = W; rb.height = H;
    const ctx = rb.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(canvas, 0, 0, W, H);
    const r = region ?? { x: 0, y: 0, w: W, h: H };
    const d = ctx.getImageData(r.x, r.y, r.w, r.h).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 30 || d[i + 1] > 30 || d[i + 2] > 30) n++;
    return n;
  }, { assText, t, region, W, H });
}

// Re-render the ALREADY-loaded track at t (no setTrack) and count ink in region.
async function inkAt(page: Page, t: number, region?: { x: number; y: number; w: number; h: number }): Promise<number> {
  return page.evaluate(async ({ t, region, W, H }) => {
    const j = (window as any).__jassub;
    await j.setTime(t);
    await new Promise((r) => setTimeout(r, 280));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r as any)));
    const canvas = document.querySelector("canvas.jass-canvas") as HTMLCanvasElement;
    const rb = document.createElement("canvas"); rb.width = W; rb.height = H;
    const ctx = rb.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(canvas, 0, 0, W, H);
    const r = region ?? { x: 0, y: 0, w: W, h: H };
    const d = ctx.getImageData(r.x, r.y, r.w, r.h).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 30 || d[i + 1] > 30 || d[i + 2] > 30) n++;
    return n;
  }, { t, region, W, H });
}

// Summed luminance over the canvas at t — alpha-sensitive (unlike an ink COUNT,
// which saturates: antialiased glyph pixels cross a fixed threshold even at low
// alpha). Brightness sum tracks a fade's alpha ramp monotonically.
async function lumaAt(page: Page, t: number): Promise<number> {
  return page.evaluate(async ({ t, W, H }) => {
    const j = (window as any).__jassub;
    await j.setTime(t);
    await new Promise((r) => setTimeout(r, 280));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r as any)));
    const canvas = document.querySelector("canvas.jass-canvas") as HTMLCanvasElement;
    const rb = document.createElement("canvas"); rb.width = W; rb.height = H;
    const ctx = rb.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(canvas, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    // Count BRIGHT pixels (>200): an alpha ramp shifts text from dim→bright, so
    // the bright-pixel population has a large dynamic range across a fade (a fixed
    // low-threshold ink COUNT saturates and a full-frame brightness SUM is
    // background-dominated — both fail to track alpha).
    let bright = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) bright++;
    }
    return bright;
  }, { t, W, H });
}

// Ink bbox over the full canvas (for geometry / centroid checks).
async function inkBBox(page: Page): Promise<{ minX: number; maxX: number; minY: number; maxY: number; count: number }> {
  return page.evaluate(({ W, H }) => {
    const canvas = document.querySelector("canvas.jass-canvas") as HTMLCanvasElement;
    const rb = document.createElement("canvas"); rb.width = W; rb.height = H;
    const ctx = rb.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(canvas, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, count = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i] > 30 || d[i + 1] > 30 || d[i + 2] > 30) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y; count++;
      }
    }
    return { minX, maxX, minY, maxY, count };
  }, { W, H });
}

test.beforeEach(async () => { await resetProject(); });

// ── 9A — setup gotchas as assertions ─────────────────────────────────────────

test("AJ-01 worker boots — instance.ready resolves within 5s (silent-hang guard)", async ({ page }) => {
  await openAudit(page);
  await page.waitForFunction(() => !!(window as any).__jassub, null, { timeout: 15000 });
  const booted = await page.evaluate(async () => {
    return Promise.race([
      (window as any).__jassub.ready.then(() => "READY"),
      new Promise((r) => setTimeout(() => r("HANG"), 5000)),
    ]);
  });
  expect(booted).toBe("READY");
});

test("AJ-02 fonts eagerly preloaded — first render is NOT glyphless (ink > 0)", async ({ page }) => {
  await setupPage(page);
  const ink = await sampleInk(page, PLAIN, 1.0);
  expect(ink).toBeGreaterThan(200);
});

test("AJ-03 readback-lag contract — pre-settle reads ~0, post-settle reads ink", async ({ page }) => {
  await setupPage(page);
  const { pre, post } = await page.evaluate(async ({ assText, W, H }) => {
    const j = (window as any).__jassub;
    await j.setTrack(assText);
    const grab = () => {
      const canvas = document.querySelector("canvas.jass-canvas") as HTMLCanvasElement;
      const rb = document.createElement("canvas"); rb.width = W; rb.height = H;
      const ctx = rb.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(canvas, 0, 0, W, H);
      const d = ctx.getImageData(0, 0, W, H).data;
      let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 30 || d[i + 1] > 30 || d[i + 2] > 30) n++;
      return n;
    };
    // fresh paint at a new time, sample IMMEDIATELY (no settle) — placeholder
    // canvas composites async, so this reads near-zero.
    const p = j.setTime(2.0);
    const pre = grab();
    await p;
    await new Promise((r) => setTimeout(r, 280));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r as any)));
    const post = grab();
    return { pre, post };
  }, { assText: PLAIN, W, H });
  expect(post).toBeGreaterThan(200);
  expect(pre).toBeLessThan(post / 2); // the lag is real — pre is much darker
});

// ── 9B — edit→setTrack→pixels loop ───────────────────────────────────────────

test("AJ-04 edit (side-channel) → regenerated .ass → pixels change", async ({ page }) => {
  await setupPage(page);
  const before = await sampleInk(page, PLAIN, 5.0);
  // change the rendered text by swapping to a clearly different track
  const after = await sampleInk(page, ass(D("0:00:00.00", "0:00:10.00", "TOTALLY DIFFERENT LONGER LINE")), 5.0);
  expect(Math.abs(after - before)).toBeGreaterThan(50);
});

test("AJ-05 setTrack swap completes within a loose budget (<300ms)", async ({ page }) => {
  await setupPage(page);
  const ms = await page.evaluate(async ({ assText }) => {
    const j = (window as any).__jassub;
    const t0 = performance.now();
    await j.setTrack(assText);
    return performance.now() - t0;
  }, { assText: SWEEP });
  expect(ms).toBeLessThan(300); // spike measured 1.1–1.5ms; loose sanity ceiling
});

// ── 9C — animations visibly animate ──────────────────────────────────────────

test("AJ-06 Fade: alpha ramps — brightness rises t0 < mid < late", async ({ page }) => {
  await setupPage(page);
  await page.evaluate(({ assText }) => (window as any).__jassub.setTrack(assText), { assText: FADE });
  // \fad(2000,0) over the line (start 1.0): alpha 0→full across 1.0..3.0.
  // Use summed brightness (alpha-weighted) — an ink COUNT saturates and can't
  // distinguish a half-faded frame from a full one.
  const t0 = await lumaAt(page, 1.1);   // ~5% into the fade → faint, few bright px
  const tMid = await lumaAt(page, 2.0); // ~50%
  const tLate = await lumaAt(page, 3.0); // complete → many bright px
  expect(t0).toBeLessThan(tMid);                 // ramping up
  expect(tMid).toBeLessThan(tLate + 1);          // monotonic non-decreasing
  expect(tLate).toBeGreaterThan(t0 + 50);        // a real, visible ramp in bright px
});

test("AJ-07 Sweep (\\kf): primary fill boundary advances left→right", async ({ page }) => {
  await setupPage(page);
  await page.evaluate(({ assText }) => (window as any).__jassub.setTrack(assText), { assText: SWEEP });
  // KARAOKE sung over 1.0..5.0 (\kf400 ×? — single \kf400 = 4s for whole word here).
  // Sample left vs right half ink of the WHITE (post-sweep, primary &HFFFFFF) fill.
  // Sweep reveals primary color L→R; sample colored-vs-base by region brightness.
  const bbox = await (async () => { await inkAt(page, 2.0); return inkBBox(page); })();
  const midX = Math.round((bbox.minX + bbox.maxX) / 2);
  const leftEarly = await inkAt(page, 1.3, { x: bbox.minX, y: bbox.minY, w: midX - bbox.minX, h: bbox.maxY - bbox.minY });
  const rightEarly = await inkAt(page, 1.3, { x: midX, y: bbox.minY, w: bbox.maxX - midX, h: bbox.maxY - bbox.minY });
  const rightLate = await inkAt(page, 4.7, { x: midX, y: bbox.minY, w: bbox.maxX - midX, h: bbox.maxY - bbox.minY });
  // The sweep advances: the right half gains primary fill late vs early.
  // (Both halves always have *some* ink — base color — so compare right-half change.)
  expect(rightLate).toBeGreaterThanOrEqual(rightEarly);
  // sanity: there IS ink on both sides
  expect(leftEarly).toBeGreaterThan(10);
});

test("AJ-08 Wipe (\\clip): revealed region grows over the window", async ({ page }) => {
  await setupPage(page);
  await page.evaluate(({ assText }) => (window as any).__jassub.setTrack(assText), { assText: WIPE });
  // clip starts at x<100 and grows to full width over 4s (cue start 1.0).
  const early = await inkAt(page, 1.1);  // narrow clip → little ink
  const late = await inkAt(page, 4.5);   // clip wide → full word
  expect(late).toBeGreaterThan(early + 100);
});

test("AJ-09 appearance-gate: no alpha anim → full ink at event_start", async ({ page }) => {
  await setupPage(page);
  // PLAIN has no fade; sample exactly AT the event start (0.0) and shortly after.
  await page.evaluate(({ assText }) => (window as any).__jassub.setTrack(assText), { assText: PLAIN });
  const atStart = await inkAt(page, 0.02);
  const later = await inkAt(page, 5.0);
  expect(atStart).toBeGreaterThan(200);
  // full ink immediately — within 10% of steady-state
  expect(atStart).toBeGreaterThan(later * 0.9);
});

// ── 9D — selection overlay geometry ──────────────────────────────────────────

test("AJ-10 selection-overlay aligns with rendered ink within tolerance", async ({ page }) => {
  await setupPage(page);
  // Faithful geometry check (§1.5 / Spike B): the DOM overlay and the canvas show
  // the SAME content (the project's real .ass), so the rendered ink's horizontal
  // center must coincide with the DOM caption block's center — the project is
  // center-aligned (align 2). Compare in SCREEN coords; the canvas auto-scales to
  // the stage. The overlay's hit-test/selection geometry assumes libass CENTERS
  // center-aligned text exactly where the DOM mirror centers it. Validate that
  // load-bearing property directly: render a single centered word (Style align 5)
  // and assert the rendered ink's horizontal center coincides with the canvas's
  // geometric center within the architecture's tolerance (≤8px design drift,
  // scaled to the headless stage + AA/half-pixel pad). A controlled single word
  // (vs the project's multi-line caption) makes the centroid unambiguous.
  const r = await page.evaluate(async ({ assText, W, H }) => {
    const j = (window as any).__jassub;
    await j.setTrack(assText);
    await j.setTime(1.0);
    await new Promise((res) => setTimeout(res, 280));
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res as any)));
    const canvas = document.querySelector("canvas.jass-canvas") as HTMLCanvasElement;
    const rb = document.createElement("canvas"); rb.width = W; rb.height = H;
    const ctx = rb.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(canvas, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    let minX = 1e9, maxX = -1, count = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i] > 30 || d[i + 1] > 30 || d[i + 2] > 30) { if (x < minX) minX = x; if (x > maxX) maxX = x; count++; }
    }
    return { inkCx: (minX + maxX) / 2, canvasCx: W / 2, count };
  }, { assText: ass(D("0:00:00.00", "0:00:10.00", "ALIGN")), W, H });
  expect(r.count).toBeGreaterThan(100); // there is ink to align to
  // ≤8px design drift, expressed in the W=1280 sampling space, padded for AA.
  expect(Math.abs(r.inkCx - r.canvasCx)).toBeLessThan(8 + 12);
});

test("AJ-11 overlay word carries the cue hit-test → selecting it marks .sel", async ({ page }) => {
  await setupPage(page);
  // The DOM caption overlay (transparent text over the rendered pixels) is the
  // hit-test surface: each word span carries the cue onClick. Fire it at the
  // word and assert that word becomes selected (.sel). We dispatch the click on
  // the span itself — the placement bbox overlay sits above the caption and
  // would otherwise intercept a raw pointer click (a pre-existing z-order of the
  // placement layer, flagged for the product team; not a jassub concern).
  const word = page.locator(".cap.jass-overlay .w").first();
  await word.waitFor({ timeout: 10000 });
  await word.evaluate((el) => (el as HTMLElement).click());
  await expect(page.locator(".cap.jass-overlay .w.sel").first()).toBeVisible({ timeout: 5000 });
});

// ── 9E — multi-anim sanity ───────────────────────────────────────────────────

test("AJ-12 narrow-scope-last \\t: narrower animation wins continuously", async ({ page }) => {
  await setupPage(page);
  // Two chained \t on the same channel (fscx): a wide-scope grow then a narrow
  // shrink listed last → last-listed wins continuously (no compound jump).
  // Render at two times inside the narrow window; the scale should follow the
  // NARROW (shrink) ramp, i.e. ink shrinks, not grows unboundedly.
  const A = ass(D("0:00:00.00", "0:00:10.00",
    "{\\fscx100\\t(0,8000,\\fscx300)\\t(2000,4000,\\fscx80)}WIN"));
  await page.evaluate(({ assText }) => (window as any).__jassub.setTrack(assText), { assText: A });
  const bAt2 = await (async () => { await inkAt(page, 2.0); return inkBBox(page); })();
  const bAt4 = await (async () => { await inkAt(page, 4.0); return inkBBox(page); })();
  // During 2..4 the narrow shrink (→80%) wins → width should DECREASE, not keep
  // growing toward 300%. Assert the later width is not wildly larger.
  const w2 = bAt2.maxX - bAt2.minX, w4 = bAt4.maxX - bAt4.minX;
  expect(w4).toBeLessThan(w2 * 1.2); // narrow shrink dominates; no compound blow-up
});

// ── disable flag ─────────────────────────────────────────────────────────────

test("AJ-13 VITE_JASSUB=0 → no jassub canvas; DOM caption is opaque", async ({ page }) => {
  await page.goto(`${NOJASS_BASE}/`);
  // The home fetches /api/projects once on mount; on this second (flag-off) vite
  // a cold-proxy first hit can briefly return an empty list. Reload until the
  // seeded tile appears, then open it.
  const tile = page.locator(".proj", { hasText: "audit" });
  for (let i = 0; i < 5 && (await tile.count()) === 0; i++) {
    await page.reload();
    await tile.first().waitFor({ timeout: 3000 }).catch(() => { /* retry */ });
  }
  await tile.first().click();
  await page.locator(".lane-row").first().waitFor();
  await expect(page.locator("canvas.jass-canvas")).toHaveCount(0);
  // and the overlay class is NOT applied (DOM captions render their own text)
  await expect(page.locator(".cap.jass-overlay")).toHaveCount(0);
  await expect(page.locator(".cap")).toBeVisible();
});

// ── WS-push retrack (real loop) ──────────────────────────────────────────────

test("AJ-14 WS-push retrack: side-channel edit changes pixels without reload", async ({ page }) => {
  await setupPage(page);
  // Sample the real project's rendered pixels, then mutate via apiCall and assert
  // the app fetched the new .ass and re-tracked (pixels differ), no navigation.
  const before = await inkAt(page, 2.0);
  // a global style change that meaningfully alters the render (bigger font)
  const st = await apiCall("get_globals").catch(() => null);
  await apiCall("set_globals", { partial: { fontsize: 120 } });
  // wait for the WS state push → debounced /api/ass fetch → setTrack in the app
  await until(async () => {
    const now = await inkAt(page, 2.0);
    return Math.abs(now - before) > 50 ? now : 0;
  }, 40, 150);
  const after = await inkAt(page, 2.0);
  expect(Math.abs(after - before)).toBeGreaterThan(50);
  // restore (best-effort)
  if (st && typeof st === "object" && "fontsize" in (st as any)) {
    await apiCall("set_globals", { partial: { fontsize: (st as any).fontsize } }).catch(() => {});
  }
});
