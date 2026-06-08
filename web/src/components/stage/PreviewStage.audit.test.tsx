// PreviewStage.audit.test.tsx — Cluster B interaction audit for the preview
// stage: mode bar, render-exact, word selection, body-drag in all 4 directions,
// all 8 resize handles, min-size clamp, resize-back symmetry, band-height
// persistence, Esc cancel, click-no-move gating, pin mode, and the readout chip.
//
// Geometry expectations are computed with the pure oracle in model/bbox.ts
// (boxFromState / marginsFromBox / anchorXY / applyMove / applyResize) — never
// hand-derived. Drag scale is the established 960-stage / 1920-canvas = 0.5.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { PreviewStage, type CapWord } from "./PreviewStage";
import {
  boxFromState, marginsFromBox, anchorXY, applyMove, applyResize,
  type PlacementState,
} from "../../model/bbox";

const base: PlacementState = {
  align: 2, play_w: 1920, play_h: 1080, margin_l: 80, margin_r: 80, margin_v: 60,
  pos: null, use_pos: true,
};
const W = 1920, H = 1080;
const cap = (over: Partial<CapWord> = {}): CapWord => ({
  wid: 0, li: 0, text: "alpha", live: false, pending: false, sel: false,
  fill: null, scale: 1, bold: null, italic: null, underline: null, ...over,
});

interface Spies {
  onMode: ReturnType<typeof vi.fn>;
  onRenderExact: ReturnType<typeof vi.fn>;
  onSelectWord: ReturnType<typeof vi.fn>;
  onPlacement: ReturnType<typeof vi.fn>;
}

function setup(
  pl: PlacementState = base,
  opts: { mode?: "live" | "exact"; capWords?: CapWord[] } = {},
) {
  const s: Spies = {
    onMode: vi.fn(), onRenderExact: vi.fn(),
    onSelectWord: vi.fn(), onPlacement: vi.fn(),
  };
  const r = render(
    <PreviewStage
      capWords={opts.capWords ?? [cap()]}
      time={0}
      mode={opts.mode ?? "live"}
      onMode={s.onMode}
      onRenderExact={s.onRenderExact}
      onSelectWord={s.onSelectWord}
      playW={pl.play_w}
      playH={pl.play_h}
      placement={pl}
      onPlacement={s.onPlacement}
    />,
  );
  const stage = r.container.querySelector(".stage") as HTMLElement;
  vi.spyOn(stage, "getBoundingClientRect").mockReturnValue(
    { left: 0, top: 0, width: 960, height: 540, right: 960, bottom: 540, x: 0, y: 0, toJSON: () => ({}) } as DOMRect,
  );
  const box = () => r.container.querySelector(".bbox, .pinbox") as HTMLElement;
  const handle = (h: string) => r.container.querySelector(`.bbox .${h}`) as HTMLElement;
  return { ...s, r, stage, box, handle, container: r.container };
}

// screen px -> canvas px is /scale (scale 0.5) so canvas = screen*2.
const SCALE = 0.5;
const scr = (canvasDelta: number) => canvasDelta * SCALE; // screen px for a given canvas delta

beforeEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// 1. Mode bar — Live / Exact fire onMode both ways; double-click same mode.
// ---------------------------------------------------------------------------
describe("PreviewStage audit — mode bar", () => {
  it("B-01 — Live button fires onMode('live') (from exact mode)", () => {
    const { container, onMode } = setup(base, { mode: "exact" });
    const live = [...container.querySelectorAll(".stage-mode-bar .seg-btn")].find((b) => b.textContent === "Live")!;
    fireEvent.click(live);
    expect(onMode).toHaveBeenCalledTimes(1);
    expect(onMode).toHaveBeenCalledWith("live");
  });

  it("B-02 — Exact button fires onMode('exact') (from live mode)", () => {
    const { container, onMode } = setup(base, { mode: "live" });
    const exact = [...container.querySelectorAll(".stage-mode-bar .seg-btn")].find((b) => b.textContent === "Exact")!;
    fireEvent.click(exact);
    expect(onMode).toHaveBeenCalledTimes(1);
    expect(onMode).toHaveBeenCalledWith("exact");
  });

  it("B-03 — double-click the already-active mode still fires onMode each click", () => {
    const { container, onMode } = setup(base, { mode: "live" });
    const live = [...container.querySelectorAll(".stage-mode-bar .seg-btn")].find((b) => b.textContent === "Live")!;
    fireEvent.click(live);
    fireEvent.click(live);
    expect(onMode).toHaveBeenCalledTimes(2);
    expect(onMode.mock.calls).toEqual([["live"], ["live"]]);
  });

  it("B-04 — active class tracks the current mode prop", () => {
    const { container } = setup(base, { mode: "exact" });
    const [live, exact] = [...container.querySelectorAll(".stage-mode-bar .seg-btn")];
    expect(live.className).not.toContain("active");
    expect(exact.className).toContain("active");
  });
});

// ---------------------------------------------------------------------------
// 2. Render-exact button — only in exact mode; fires onRenderExact.
// ---------------------------------------------------------------------------
describe("PreviewStage audit — render-exact", () => {
  it("B-05 — render-exact button is absent in live mode", () => {
    const { container } = setup(base, { mode: "live" });
    const btn = [...container.querySelectorAll("button")].find((b) => /Render exact frame/i.test(b.textContent || ""));
    expect(btn).toBeUndefined();
  });

  it("B-06 — render-exact button present in exact mode and fires onRenderExact", () => {
    const { container, onRenderExact } = setup(base, { mode: "exact" });
    const btn = [...container.querySelectorAll("button")].find((b) => /Render exact frame/i.test(b.textContent || ""))!;
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onRenderExact).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Caption word click → onSelectWord(wid).
// ---------------------------------------------------------------------------
describe("PreviewStage audit — word selection", () => {
  it("B-07 — clicking a caption word fires onSelectWord with that wid", () => {
    const words = [cap({ wid: 0, text: "alpha" }), cap({ wid: 7, text: "hotel" })];
    const { container, onSelectWord } = setup(base, { mode: "live", capWords: words });
    const spans = [...container.querySelectorAll(".cap .w")];
    fireEvent.click(spans[1]);
    expect(onSelectWord).toHaveBeenCalledTimes(1);
    expect(onSelectWord).toHaveBeenCalledWith(7);
  });

  it("B-08 — caption words are absent in exact mode (no click target)", () => {
    const { container } = setup(base, { mode: "exact" });
    expect(container.querySelector(".cap")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Box body drag — 4 directions; margins == marginsFromBox(applyMove(...)).
// ---------------------------------------------------------------------------
describe("PreviewStage audit — body drag (4 directions)", () => {
  const b0 = boxFromState(base);

  // Q4: snap is now always-on during a placement drag. These tests assert the
  // PURE drag math (applyMove/applyResize) against the bbox oracle, so they hold
  // Alt (the documented snap-bypass) to isolate the geometry from the snap layer.
  // The snap layer has its own coverage in PreviewStage.drag.test.tsx + bbox.test.ts.
  const dragBody = (s: ReturnType<typeof setup>, sx: number, sy: number) => {
    fireEvent.pointerDown(s.box(), { clientX: 400, clientY: 300, button: 0, altKey: true });
    fireEvent.pointerMove(window, { clientX: 400 + sx, clientY: 300 + sy, altKey: true });
    fireEvent.pointerUp(window, { clientX: 400 + sx, clientY: 300 + sy, altKey: true });
  };

  it("B-09 — drag RIGHT: margins == marginsFromBox(applyMove(+canvas,0))", () => {
    const s = setup();
    dragBody(s, scr(60), 0); // +60 canvas x
    const expected = marginsFromBox(applyMove(b0, 60, 0, W, H), base);
    expect(s.onPlacement).toHaveBeenCalledTimes(1);
    expect(s.onPlacement.mock.calls[0][0]).toEqual(expected);
  });

  it("B-10 — drag LEFT: margins == marginsFromBox(applyMove(-canvas,0))", () => {
    const s = setup();
    dragBody(s, scr(-60), 0);
    const expected = marginsFromBox(applyMove(b0, -60, 0, W, H), base);
    expect(s.onPlacement.mock.calls[0][0]).toEqual(expected);
  });

  it("B-11 — drag UP: margins == marginsFromBox(applyMove(0,-canvas))", () => {
    const s = setup();
    dragBody(s, 0, scr(-100));
    const expected = marginsFromBox(applyMove(b0, 0, -100, W, H), base);
    expect(s.onPlacement.mock.calls[0][0]).toEqual(expected);
  });

  it("B-12 — drag DOWN: margins == marginsFromBox(applyMove(0,+canvas))", () => {
    const s = setup();
    dragBody(s, 0, scr(100));
    const expected = marginsFromBox(applyMove(b0, 0, 100, W, H), base);
    expect(s.onPlacement.mock.calls[0][0]).toEqual(expected);
  });

  it("B-13 — drag clamps at the LEFT canvas edge (margin_l never negative)", () => {
    const s = setup();
    dragBody(s, scr(-5000), 0); // hugely past the left edge
    const m = s.onPlacement.mock.calls[0][0];
    // oracle: applyMove clamps l>=0 → margin_l 0, box pinned to left edge
    expect(m).toEqual(marginsFromBox(applyMove(b0, -5000, 0, W, H), base));
    expect(m.margin_l).toBe(0);
  });

  it("B-14 — drag clamps at the RIGHT canvas edge (margin_r 0 at the wall)", () => {
    const s = setup();
    dragBody(s, scr(5000), 0);
    const m = s.onPlacement.mock.calls[0][0];
    expect(m).toEqual(marginsFromBox(applyMove(b0, 5000, 0, W, H), base));
    expect(m.margin_r).toBe(0);
  });

  // DOUBLE: two sequential drags with a placement echo (re-render the new prop)
  // between them; the second commit's margins must equal the originals.
  it("B-15 — DOUBLE body drag: right +40 then (echoed) left -40 nets the original margins", () => {
    const b0 = boxFromState(base);
    const onPlacement = vi.fn();
    const renderAt = (pl: PlacementState) => (
      <PreviewStage capWords={[cap()]} time={0} mode="live" onMode={vi.fn()}
        onRenderExact={vi.fn()} onSelectWord={vi.fn()} playW={pl.play_w} playH={pl.play_h}
        placement={pl} onPlacement={onPlacement} />
    );
    const r = render(renderAt(base));
    const mockRect = (root: HTMLElement) => {
      const stage = root.querySelector(".stage") as HTMLElement;
      vi.spyOn(stage, "getBoundingClientRect").mockReturnValue(
        { left: 0, top: 0, width: 960, height: 540, right: 960, bottom: 540, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    };
    mockRect(r.container);
    // drag 1: +40 canvas right
    let box = r.container.querySelector(".bbox") as HTMLElement;
    fireEvent.pointerDown(box, { clientX: 400, clientY: 300, button: 0, altKey: true });
    fireEvent.pointerMove(window, { clientX: 400 + scr(40), clientY: 300, altKey: true });
    fireEvent.pointerUp(window, { clientX: 400 + scr(40), clientY: 300, altKey: true });
    const first = onPlacement.mock.calls[0][0]; // {margin_l:120,...}
    expect(first).toEqual(marginsFromBox(applyMove(b0, 40, 0, W, H), base));

    // server echoes the new placement → re-render with merged margins
    const echoed: PlacementState = { ...base, ...first };
    r.rerender(renderAt(echoed));
    mockRect(r.container);

    // drag 2: -40 canvas left from the echoed box
    box = r.container.querySelector(".bbox") as HTMLElement;
    fireEvent.pointerDown(box, { clientX: 400, clientY: 300, button: 0, altKey: true });
    fireEvent.pointerMove(window, { clientX: 400 - scr(40), clientY: 300, altKey: true });
    fireEvent.pointerUp(window, { clientX: 400 - scr(40), clientY: 300, altKey: true });
    const second = onPlacement.mock.calls[1][0];
    const expectedBack = marginsFromBox(applyMove(boxFromState(echoed), -40, 0, W, H), echoed);
    expect(second).toEqual(expectedBack);
    // and that nets the original committed margins
    expect(second).toEqual({ margin_l: 80, margin_r: 80, margin_v: 60 });
  });

  // ADJ-02: wall-saturated drag round-trips are CORRECTLY lossy (applyMove clamps,
  // mirroring app_base.py). Rewritten to assert the CLAMPED expected values via the
  // bbox oracle — the test now PASSES by asserting correct clamp physics.
  it("B-16 — saturated drag clamps; round-trip is intentionally lossy at walls — ADJ-02", () => {
    const b0 = boxFromState(base);
    const onPlacement = vi.fn();
    const renderAt = (pl: PlacementState) => (
      <PreviewStage capWords={[cap()]} time={0} mode="live" onMode={vi.fn()}
        onRenderExact={vi.fn()} onSelectWord={vi.fn()} playW={pl.play_w} playH={pl.play_h}
        placement={pl} onPlacement={onPlacement} />
    );
    const r = render(renderAt(base));
    const mockRect = (root: HTMLElement) => {
      const stage = root.querySelector(".stage") as HTMLElement;
      vi.spyOn(stage, "getBoundingClientRect").mockReturnValue(
        { left: 0, top: 0, width: 960, height: 540, right: 960, bottom: 540, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    };
    mockRect(r.container);
    // drag 1: +100 canvas right — box width 1760, max l = 160, so r hits the wall (1920)
    // applyMove clamps: l=160 (not 180), r=1920, margin_r=0, margin_l=160
    let box = r.container.querySelector(".bbox") as HTMLElement;
    fireEvent.pointerDown(box, { clientX: 400, clientY: 300, button: 0, altKey: true });
    fireEvent.pointerMove(window, { clientX: 400 + scr(100), clientY: 300, altKey: true });
    fireEvent.pointerUp(window, { clientX: 400 + scr(100), clientY: 300, altKey: true });
    const first = onPlacement.mock.calls[0][0];
    // Oracle: applyMove clamps l to min(80+100,160)=160 → {ml:160, mr:0, mv:60}
    expect(first).toEqual(marginsFromBox(applyMove(b0, 100, 0, W, H), base));
    expect(first).toEqual({ margin_l: 160, margin_r: 0, margin_v: 60 });

    // Server echoes the clamped position
    const echoed: PlacementState = { ...base, ...first };
    r.rerender(renderAt(echoed));
    mockRect(r.container);

    // drag 2: -100 canvas left from the clamped position
    // From l=160, drag -100 → l=clamp(160-100,0,160)=60; r=1820 → margin_r=100
    // This is intentionally NOT the original {80,80} — the clamp ate the overshoot
    box = r.container.querySelector(".bbox") as HTMLElement;
    fireEvent.pointerDown(box, { clientX: 400, clientY: 300, button: 0, altKey: true });
    fireEvent.pointerMove(window, { clientX: 400 - scr(100), clientY: 300, altKey: true });
    fireEvent.pointerUp(window, { clientX: 400 - scr(100), clientY: 300, altKey: true });
    const second = onPlacement.mock.calls[1][0];
    // Oracle: applyMove from echoed box, -100 → {ml:60, mr:100, mv:60}
    const echoedBox = boxFromState(echoed);
    expect(second).toEqual(marginsFromBox(applyMove(echoedBox, -100, 0, W, H), echoed));
    expect(second).toEqual({ margin_l: 60, margin_r: 100, margin_v: 60 });
    // Not the original {80,80} — clamp physics are correct, round-trip is lossy at the wall
    expect(second).not.toEqual({ margin_l: 80, margin_r: 80, margin_v: 60 });
  });
});

// ---------------------------------------------------------------------------
// 5. ALL 8 resize handles — each adjusts only its edges; min clamp; resize-back;
//    band-height persistence.
// ---------------------------------------------------------------------------
describe("PreviewStage audit — resize handles", () => {
  const b0 = boxFromState(base);
  const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

  // Q4: hold Alt to bypass the always-on snap and assert pure resize geometry.
  const dragHandle = (s: ReturnType<typeof setup>, h: string, cdx: number, cdy: number) => {
    const el = s.handle(h);
    fireEvent.pointerDown(el, { clientX: 480, clientY: 412, button: 0, altKey: true });
    fireEvent.pointerMove(window, { clientX: 480 + scr(cdx), clientY: 412 + scr(cdy), altKey: true });
    fireEvent.pointerUp(window, { clientX: 480 + scr(cdx), clientY: 412 + scr(cdy), altKey: true });
  };

  for (const h of HANDLES) {
    it(`B-17.${h} — handle '${h}' commits margins == marginsFromBox(applyResize('${h}',+60,+60))`, () => {
      const s = setup();
      dragHandle(s, h, 60, 60);
      const expected = marginsFromBox(applyResize(b0, h, 60, 60, W, H), base);
      expect(s.onPlacement).toHaveBeenCalledTimes(1);
      expect(s.onPlacement.mock.calls[0][0]).toEqual(expected);
    });
  }

  it("B-18 — 'e' handle only changes margin_r (left/vertical untouched)", () => {
    const s = setup();
    dragHandle(s, "e", -60, 60); // pull right edge in; vertical irrelevant for e
    const m = s.onPlacement.mock.calls[0][0];
    expect(m).toEqual(marginsFromBox(applyResize(b0, "e", -60, 60, W, H), base));
    expect(m.margin_l).toBe(base.margin_l);
    expect(m.margin_v).toBe(base.margin_v);
  });

  it("B-19 — 'w' handle only changes margin_l", () => {
    const s = setup();
    dragHandle(s, "w", 60, 0);
    const m = s.onPlacement.mock.calls[0][0];
    expect(m).toEqual(marginsFromBox(applyResize(b0, "w", 60, 0, W, H), base));
    expect(m.margin_r).toBe(base.margin_r);
    expect(m.margin_v).toBe(base.margin_v);
  });

  it("B-20 — min-size clamp: collapsing 'e' inward never crosses l+min (width >= 40)", () => {
    const s = setup();
    dragHandle(s, "e", -5000, 0); // far past the left
    const oracleBox = applyResize(b0, "e", -5000, 0, W, H);
    expect(oracleBox.r - oracleBox.l).toBeGreaterThanOrEqual(40);
    expect(s.onPlacement.mock.calls[0][0]).toEqual(marginsFromBox(oracleBox, base));
  });

  it("B-21 — resize 'w' then resize-back nets the original margins (echo between)", () => {
    const onPlacement = vi.fn();
    const renderAt = (pl: PlacementState) => (
      <PreviewStage capWords={[cap()]} time={0} mode="live" onMode={vi.fn()}
        onRenderExact={vi.fn()} onSelectWord={vi.fn()} playW={pl.play_w} playH={pl.play_h}
        placement={pl} onPlacement={onPlacement} />
    );
    const r = render(renderAt(base));
    const mockRect = (root: HTMLElement) => {
      const stage = root.querySelector(".stage") as HTMLElement;
      vi.spyOn(stage, "getBoundingClientRect").mockReturnValue(
        { left: 0, top: 0, width: 960, height: 540, right: 960, bottom: 540, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    };
    mockRect(r.container);
    let w = r.container.querySelector(".bbox .w") as HTMLElement;
    fireEvent.pointerDown(w, { clientX: 40, clientY: 412, button: 0, altKey: true });
    fireEvent.pointerMove(window, { clientX: 40 + scr(40), clientY: 412, altKey: true });
    fireEvent.pointerUp(window, { clientX: 40 + scr(40), clientY: 412, altKey: true });
    const first = onPlacement.mock.calls[0][0];
    expect(first).toEqual(marginsFromBox(applyResize(boxFromState(base), "w", 40, 0, W, H), base));

    const echoed: PlacementState = { ...base, ...first };
    r.rerender(renderAt(echoed));
    mockRect(r.container);
    w = r.container.querySelector(".bbox .w") as HTMLElement;
    fireEvent.pointerDown(w, { clientX: 40, clientY: 412, button: 0, altKey: true });
    fireEvent.pointerMove(window, { clientX: 40 - scr(40), clientY: 412, altKey: true });
    fireEvent.pointerUp(window, { clientX: 40 - scr(40), clientY: 412, altKey: true });
    const second = onPlacement.mock.calls[1][0];
    expect(second).toEqual(marginsFromBox(applyResize(boxFromState(echoed), "w", -40, 0, W, H), echoed));
    expect(second).toEqual({ margin_l: 80, margin_r: 80, margin_v: 60 });
  });

  it("B-22 — band-height persists: 'n' resize stays visually taller after a margins echo", () => {
    // n-handle resize on a bottom-aligned box keeps margin_v constant but grows
    // the visual band; after the (identical-margins) echo it must not snap back.
    const onPlacement = vi.fn();
    const renderAt = (pl: PlacementState) => (
      <PreviewStage capWords={[cap()]} time={0} mode="live" onMode={vi.fn()}
        onRenderExact={vi.fn()} onSelectWord={vi.fn()} playW={pl.play_w} playH={pl.play_h}
        placement={pl} onPlacement={onPlacement} />
    );
    const r = render(renderAt(base));
    const mockRect = (root: HTMLElement) => {
      const stage = root.querySelector(".stage") as HTMLElement;
      vi.spyOn(stage, "getBoundingClientRect").mockReturnValue(
        { left: 0, top: 0, width: 960, height: 540, right: 960, bottom: 540, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    };
    mockRect(r.container);
    const heightBefore = (r.container.querySelector(".bbox") as HTMLElement).style.height;
    const n = r.container.querySelector(".bbox .n") as HTMLElement;
    fireEvent.pointerDown(n, { clientX: 480, clientY: 412, button: 0 });
    fireEvent.pointerMove(window, { clientX: 480, clientY: 412 - scr(100) }); // top edge up → taller
    fireEvent.pointerUp(window, { clientX: 480, clientY: 412 - scr(100) });
    const committed = onPlacement.mock.calls[0][0];
    // margin_v unchanged for a bottom-anchored top-edge resize
    expect(committed.margin_v).toBe(base.margin_v);
    // server echoes the SAME margins → re-render; visual height must remain grown
    r.rerender(renderAt({ ...base, ...committed }));
    mockRect(r.container);
    const heightAfter = (r.container.querySelector(".bbox") as HTMLElement).style.height;
    expect(parseFloat(heightAfter)).toBeCloseTo(parseFloat(heightBefore) + (100 / 1080) * 100, 1);
  });
});

// ---------------------------------------------------------------------------
// 6. Esc mid-drag — no dispatch; box style restored to pre-drag; chip gone.
// ---------------------------------------------------------------------------
describe("PreviewStage audit — Esc mid-drag", () => {
  it("B-23 — Esc cancels: no dispatch, box style restored, readout chip gone", () => {
    const s = setup();
    const styleBefore = s.box().getAttribute("style");
    fireEvent.pointerDown(s.box(), { clientX: 400, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 400 + scr(120), clientY: 300 });
    // mid-drag the box has moved and the chip is present
    expect(s.container.querySelector(".drag-readout")).toBeTruthy();
    expect(s.box().getAttribute("style")).not.toBe(styleBefore);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerUp(window, { clientX: 400 + scr(120), clientY: 300 });
    expect(s.onPlacement).not.toHaveBeenCalled();
    expect(s.container.querySelector(".drag-readout")).toBeNull();
    expect(s.box().getAttribute("style")).toBe(styleBefore);
  });
});

// ---------------------------------------------------------------------------
// 7. Click-no-move (<3px) — no dispatch.
// ---------------------------------------------------------------------------
describe("PreviewStage audit — click without move", () => {
  it("B-24 — pointerup within 3px of down does not dispatch", () => {
    const s = setup();
    fireEvent.pointerDown(s.box(), { clientX: 400, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 402, clientY: 301 }); // < 3px
    fireEvent.pointerUp(window, { clientX: 402, clientY: 301 });
    expect(s.onPlacement).not.toHaveBeenCalled();
  });

  it("B-25 — exactly 3px movement crosses the threshold and dispatches", () => {
    const s = setup();
    fireEvent.pointerDown(s.box(), { clientX: 400, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 403, clientY: 300 }); // == 3px
    fireEvent.pointerUp(window, { clientX: 403, clientY: 300 });
    expect(s.onPlacement).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 8. Pin mode (withPos) — .pinbox renders, no .bbox; pin drag commits pos ==
//    anchorXY(applyMove(...)); drag+drag-back nets original pos; Esc cancels;
//    readout shows "pos X, Y".
// ---------------------------------------------------------------------------
describe("PreviewStage audit — pin mode", () => {
  const pin: PlacementState = { ...base, pos: [960, 1020], use_pos: true };
  const pb = boxFromState(pin);

  it("B-26 — pin mode renders .pinbox and NOT .bbox", () => {
    const s = setup(pin);
    expect(s.container.querySelector(".pinbox")).toBeTruthy();
    expect(s.container.querySelector(".bbox")).toBeNull();
  });

  it("B-27 — pin drag commits pos == anchorXY(applyMove(...))", () => {
    const s = setup(pin);
    fireEvent.pointerDown(s.box(), { clientX: 480, clientY: 510, button: 0, altKey: true });
    fireEvent.pointerMove(window, { clientX: 480 + scr(40), clientY: 510 + scr(-60), altKey: true });
    fireEvent.pointerUp(window, { clientX: 480 + scr(40), clientY: 510 + scr(-60), altKey: true });
    const expectedPos = anchorXY(applyMove(pb, 40, -60, W, H), pin.align);
    expect(s.onPlacement).toHaveBeenCalledTimes(1);
    expect(s.onPlacement.mock.calls[0][0]).toEqual({ pos: expectedPos });
  });

  it("B-28 — pin drag readout shows 'pos X, Y' (not L·R·V)", () => {
    const s = setup(pin);
    fireEvent.pointerDown(s.box(), { clientX: 480, clientY: 510, button: 0 });
    fireEvent.pointerMove(window, { clientX: 480 + scr(40), clientY: 510 });
    const ro = s.container.querySelector(".drag-readout") as HTMLElement;
    expect(ro.textContent).toMatch(/^pos \d+, \d+$/);
    expect(ro.textContent).not.toMatch(/·/);
    fireEvent.keyDown(window, { key: "Escape" });
  });

  it("B-29 — pin Esc cancels: no dispatch, pinbox style restored", () => {
    const s = setup(pin);
    const styleBefore = s.box().getAttribute("style");
    fireEvent.pointerDown(s.box(), { clientX: 480, clientY: 510, button: 0 });
    fireEvent.pointerMove(window, { clientX: 480 + scr(80), clientY: 510 });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerUp(window, { clientX: 480 + scr(80), clientY: 510 });
    expect(s.onPlacement).not.toHaveBeenCalled();
    expect(s.box().getAttribute("style")).toBe(styleBefore);
  });

  it("B-30 — DOUBLE pin drag: +40x then (echoed) -40x nets the original pos", () => {
    const onPlacement = vi.fn();
    const renderAt = (pl: PlacementState) => (
      <PreviewStage capWords={[cap()]} time={0} mode="live" onMode={vi.fn()}
        onRenderExact={vi.fn()} onSelectWord={vi.fn()} playW={pl.play_w} playH={pl.play_h}
        placement={pl} onPlacement={onPlacement} />
    );
    const r = render(renderAt(pin));
    const mockRect = (root: HTMLElement) => {
      const stage = root.querySelector(".stage") as HTMLElement;
      vi.spyOn(stage, "getBoundingClientRect").mockReturnValue(
        { left: 0, top: 0, width: 960, height: 540, right: 960, bottom: 540, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    };
    mockRect(r.container);
    let box = r.container.querySelector(".pinbox") as HTMLElement;
    fireEvent.pointerDown(box, { clientX: 480, clientY: 510, button: 0, altKey: true });
    fireEvent.pointerMove(window, { clientX: 480 + scr(40), clientY: 510, altKey: true });
    fireEvent.pointerUp(window, { clientX: 480 + scr(40), clientY: 510, altKey: true });
    const first = onPlacement.mock.calls[0][0];
    expect(first).toEqual({ pos: anchorXY(applyMove(pb, 40, 0, W, H), pin.align) });

    const echoed: PlacementState = { ...pin, pos: first.pos };
    r.rerender(renderAt(echoed));
    mockRect(r.container);
    box = r.container.querySelector(".pinbox") as HTMLElement;
    fireEvent.pointerDown(box, { clientX: 480, clientY: 510, button: 0, altKey: true });
    fireEvent.pointerMove(window, { clientX: 480 - scr(40), clientY: 510, altKey: true });
    fireEvent.pointerUp(window, { clientX: 480 - scr(40), clientY: 510, altKey: true });
    const second = onPlacement.mock.calls[1][0];
    expect(second).toEqual({ pos: anchorXY(applyMove(boxFromState(echoed), -40, 0, W, H), echoed.align) });
    expect(second).toEqual({ pos: [960, 1020] });
  });
});

// ---------------------------------------------------------------------------
// 9. Readout chip — L·R·V matches live preview; follows pointer (+16); gone on release.
// ---------------------------------------------------------------------------
describe("PreviewStage audit — readout chip", () => {
  const b0 = boxFromState(base);
  it("B-31 — chip L·R·V matches marginsFromBox of the live preview box", () => {
    const s = setup();
    fireEvent.pointerDown(s.box(), { clientX: 400, clientY: 300, button: 0, altKey: true });
    fireEvent.pointerMove(window, { clientX: 400 + scr(60), clientY: 300, altKey: true }); // +60 canvas x
    const ro = s.container.querySelector(".drag-readout") as HTMLElement;
    const m = marginsFromBox(applyMove(b0, 60, 0, W, H), base);
    expect(ro.textContent).toBe(`L ${m.margin_l} · R ${m.margin_r} · V ${m.margin_v}`);
    fireEvent.keyDown(window, { key: "Escape" });
  });

  it("B-32 — chip follows the pointer with +16/+16 offsets and disappears on release", () => {
    const s = setup();
    fireEvent.pointerDown(s.box(), { clientX: 400, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 430, clientY: 320 });
    const ro = s.container.querySelector(".drag-readout") as HTMLElement;
    expect(ro.style.left).toBe("446px"); // 430 + 16
    expect(ro.style.top).toBe("336px");  // 320 + 16
    fireEvent.pointerUp(window, { clientX: 430, clientY: 320 });
    expect(s.container.querySelector(".drag-readout")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("PreviewStage audit — caption typography (italic / underline)", () => {
  const capSpan = (c: HTMLElement) => c.querySelector(".cap .w") as HTMLElement;

  it("B-24 — italic word renders fontStyle: italic on its span", () => {
    const s = setup(base, { capWords: [cap({ italic: true })] });
    expect(capSpan(s.container).style.fontStyle).toBe("italic");
  });
  it("B-25 — underline word renders textDecoration: underline", () => {
    const s = setup(base, { capWords: [cap({ underline: true })] });
    expect(capSpan(s.container).style.textDecoration).toBe("underline");
  });
  it("B-26 — explicit non-italic/non-underline override sets normal/none (not blank)", () => {
    const s = setup(base, { capWords: [cap({ italic: false, underline: false })] });
    expect(capSpan(s.container).style.fontStyle).toBe("normal");
    expect(capSpan(s.container).style.textDecoration).toBe("none");
  });
  it("B-27 — null italic/underline leave the span without inline typography (inherit)", () => {
    const s = setup(base, { capWords: [cap({ italic: null, underline: null })] });
    expect(capSpan(s.container).style.fontStyle).toBe("");
    expect(capSpan(s.container).style.textDecoration).toBe("");
  });
});
