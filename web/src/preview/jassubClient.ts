// jassubClient — thin wrapper around jassub (libass-in-wasm) for the LIVE preview.
//
// Gotchas baked in (see spikes/jassub-bench/FINDINGS.md):
//   1. workerUrl MUST be the bundled MODULE worker (jassub/dist/worker/worker.js
//      bundled by vite's ?worker&url) — the emscripten glue (dist/wasm/*.js)
//      hangs `instance.ready` forever, silently.
//   2. Fonts must be eagerly preloaded via `fonts:[url]` (lazy availableFonts
//      lone leaves the first render glyphless).
//   3. All renderer.* calls are worker IPC — always await.
//   4. Pixel readback lags the render ~250ms + double-rAF (handled by callers/e2e).
import JASSUB from "jassub";
// Vite bundles the module worker and hands us a URL; wasm is shipped as an asset URL.
import workerUrl from "jassub/dist/worker/worker.js?worker&url";
import wasmUrl from "jassub/dist/wasm/jassub-worker.wasm?url";
import modernWasmUrl from "jassub/dist/wasm/jassub-worker-modern.wasm?url";

export interface JassubClient {
  /** Resolves once the worker is up and the wasm is ready (the silent-hang guard). */
  ready: Promise<void>;
  setTrack(assText: string): Promise<void>;
  /** Render the frame at mediaTime t (seconds). No video — the manual render API. */
  setTime(t: number): Promise<void>;
  resize(w: number, h: number): Promise<void>;
  dispose(): void;
}

interface JassubInstance {
  ready: Promise<void>;
  renderer: { setTrack(text: string): Promise<void> };
  manualRender(data: { expectedDisplayTime: number; width: number; height: number; mediaTime: number }): Promise<void>;
  resize(forceRepaint?: boolean, renderWidth?: number, renderHeight?: number): Promise<void>;
  destroy(): Promise<void>;
}

let singleton: JassubClient | null = null;
let singletonCanvas: HTMLCanvasElement | null = null;

/**
 * Initialise the renderer against a canvas with a preloaded font.
 * Guards double-init: returns the existing client if the same canvas is passed
 * again; tears the old one down and rebuilds if the canvas changed.
 */
export function initJassub(
  canvas: HTMLCanvasElement,
  fontUrl: string,
  defaultFont = "DejaVu Sans",
  initialAss = "",
): JassubClient {
  if (singleton && singletonCanvas === canvas) return singleton;
  if (singleton) singleton.dispose();

  const instance = new JASSUB({
    canvas,
    subContent: initialAss || MINIMAL_ASS,
    workerUrl,
    wasmUrl,
    modernWasmUrl,
    // eager preload — lazy availableFonts produced a glyphless first render headless
    fonts: [fontUrl],
    availableFonts: { [defaultFont.toLowerCase()]: fontUrl },
    defaultFont: defaultFont.toLowerCase(),
    // never hit the network probing system fonts; we serve exactly one
    queryFonts: false,
  }) as unknown as JassubInstance;

  let dims = { w: canvas.width || 1920, h: canvas.height || 1080 };
  let lastT = 0;
  const client: JassubClient = {
    ready: Promise.resolve(instance.ready),
    async setTrack(assText: string) {
      await instance.ready;
      await instance.renderer.setTrack(assText);
      // re-render the current frame so the swap is reflected immediately
      await client.setTime(lastT);
    },
    async setTime(t: number) {
      lastT = t;
      await instance.ready;
      // Render at the canvas's CURRENT backing-store size — jassub auto-resizes
      // the offscreen canvas to its CSS box, so a cached size would distort.
      const w = canvas.width || dims.w, h = canvas.height || dims.h;
      // manualRender is the whole no-video API: render the frame at mediaTime t
      await instance.manualRender({
        expectedDisplayTime: performance.now(),
        width: w,
        height: h,
        mediaTime: t,
      });
    },
    async resize(w: number, h: number) {
      dims = { w, h };
      await instance.ready;
      await instance.resize(false, w, h);
    },
    dispose() {
      try { instance.destroy(); } catch { /* already gone */ }
      if (singleton === client) { singleton = null; singletonCanvas = null; }
    },
  };
  singleton = client;
  singletonCanvas = canvas;
  return client;
}

// A valid-but-empty .ass so the worker has something to parse before the first
// real setTrack lands (avoids a transient parse error on boot).
const MINIMAL_ASS = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, Alignment
Style: Default,DejaVu Sans,64,&H00FFFFFF,2

[Events]
Format: Layer, Start, End, Style, Text
`;
