# jassub spikes — findings (§1.7.3 performance, §1.7.4 geometry)

jassub **2.5.5**, headless chromium (playwright), 1280×720 canvas, DejaVu Sans served via
`availableFonts` + eager `fonts: []` preload. Harness: `index.html` (+ `serve.py` with
COOP/COEP for SharedArrayBuffer), driven by `run-spikes.cjs` / `run-geometry.cjs`.

## Integration gotchas (worth more than the numbers)

1. **`workerUrl` must be the module worker** (`jassub/dist/worker/worker.js`, bundled — it has
   bare imports), NOT `dist/wasm/jassub-worker.js` (the emscripten glue). Passing the glue
   boots a worker that never speaks the IPC protocol → `instance.ready` hangs **forever,
   silently**, even with `debug: true`. Bundle with esbuild: `esbuild worker.js --bundle
   --format=esm`.
2. **Preload fonts eagerly** (`fonts: ['url.ttf']`): `availableFonts` lazy-load left the first
   render glyphless headless.
3. **Pixel readback lags the render**: after `manualRender` resolves, the placeholder canvas
   (control transferred to the worker) composites asynchronously — wait ~250ms + double-rAF
   before `drawImage`/screenshot, or you read zeros.
4. `manualRender({mediaTime})` + `renderer.setTrack(text)` is the whole no-video API. All
   `renderer.*` calls are worker IPC — always await.

## Spike A — full-song scale (31 events × 12 words, 2 chained \t per word ≈ 372 words)

| Metric | Result |
|---|---|
| .ass size | 27 KB |
| `setTrack` (track swap, ×5) | **1.1–1.5 ms** |
| First render after swap | 2.6 ms |
| Seek renders (20 spread) | mostly **0.1–0.6 ms**, occasional 7–50 ms outliers on first visit to a dense event (shaping cache warm-up) |

**Verdict: comfortably confirms the claims.** Edit→pixels re-parse is ~1ms (claimed single-digit
ms); steady-state render is sub-ms (claimed 1–5ms). Worst observed frame 50ms = one-off cache
warm, invisible in practice. Full-song typewriter-scale animation is a non-issue for jassub.

## Spike B — geometry: DOM (same font file) vs libass advances

Method: cumulative-prefix rows ("Alpha", "Alpha Bravo", …, 8 rows) rendered white, ink bbox per
row band; DOM measures the same strings with the same TTF via @font-face; one least-squares
uniform scale; residuals = per-prefix advance error. (Color-classification methods failed —
AA cross-talk; prefix rows are robust.)

| Variant | Uniform scale (libass/DOM @ same nominal size) | Max resid | Mean resid |
|---|---|---|---|
| Regular, fs48, lines ≤1140px | **0.8654** | **4.1 px** | 2.2 px |
| Bold (\b1 / font-weight:bold) | **0.8658** | 4.5 px | 2.4 px |

**Verdicts:**
- **Same-font DOM layout matches libass advances to ≤5px across a full 1280px line** after one
  uniform scale. The scale factor (~0.866 for DejaVu) is libass's VSFilter-style font sizing vs
  CSS px — a **per-font constant, weight-independent** (identical regular vs bold), calibratable
  once at runtime (render one reference string, divide).
- Adequate for **click hit-testing** (half-word tolerance ≫ 5px) and **padded selection
  outlines** (4px pad ≈ max drift). The §1.5 overlay plan is **GO**.
- Pitfalls that produced garbage before the clean result, for the real implementation:
  reference styles by their actual name (a typo silently falls back to libass's tiny default
  style), and beware line wrap — keep the DOM mirror's wrapping width identical to PlayRes
  minus margins.

## Combined with the libass semantics spikes (`../libass/FINDINGS.md`)

All five §1.7 spikes pass. No engine-spec changes required; the compiler emits `\t` in
narrow-scope-last order (last-listed wins continuously), `\clip` wipes and `\kf` sweeps are
viable, scale is a non-issue, and the geometry overlay strategy stands with a one-time per-font
scale calibration.
