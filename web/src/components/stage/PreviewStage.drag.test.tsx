import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { PreviewStage } from "./PreviewStage";
import { boxFromState, marginsFromBox, applyResize, type PlacementState } from "../../model/bbox";

const placement: PlacementState = { align: 2, play_w: 1920, play_h: 1080,
  margin_l: 80, margin_r: 80, margin_v: 60, pos: null };

function setup(pl: PlacementState = placement) {
  const onPlacement = vi.fn();
  const r = render(
    <PreviewStage capWords={[]} time={0} mode="live" onMode={() => {}}
      onRenderExact={() => {}} onSelectWord={() => {}}
      playW={pl.play_w} playH={pl.play_h}
      placement={pl} onPlacement={onPlacement} />
  );
  const stage = r.container.querySelector(".stage") as HTMLElement;
  vi.spyOn(stage, "getBoundingClientRect").mockReturnValue(
    { left: 0, top: 0, width: 960, height: 540, right: 960, bottom: 540, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
  const box = r.container.querySelector(".bbox, .pinbox") as HTMLElement;
  return { onPlacement, box, stage, container: r.container };
}

describe("PreviewStage drag", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders .bbox + .bbox-tag and NOT .pinbox in margin mode", () => {
    const { container } = setup();
    expect(container.querySelector(".bbox")).toBeTruthy();
    expect(container.querySelector(".bbox-tag")).toBeTruthy();
    expect(container.querySelector(".pinbox")).toBeNull();
  });

  it("renders .pinbox and NOT .bbox in pin mode", () => {
    const { container } = setup({ ...placement, pos: [960, 1020], use_pos: true });
    expect(container.querySelector(".pinbox")).toBeTruthy();
    expect(container.querySelector(".bbox")).toBeNull();
  });

  it("shows .drag-readout (L/R/V) while dragging in margin mode, gone after release", () => {
    const { box, container } = setup();
    expect(container.querySelector(".drag-readout")).toBeNull();
    fireEvent.pointerDown(box, { clientX: 200, clientY: 400, button: 0 });
    fireEvent.pointerMove(window, { clientX: 250, clientY: 400 });
    const readout = container.querySelector(".drag-readout") as HTMLElement;
    expect(readout).toBeTruthy();
    expect(readout.textContent).toMatch(/L \d+ · R \d+ · V \d+/);
    fireEvent.pointerUp(window, { clientX: 250, clientY: 400 });
    expect(container.querySelector(".drag-readout")).toBeNull();
  });

  it("body drag dispatches margins once on release (margin mode)", () => {
    const { onPlacement, box } = setup();
    // Alt bypasses the always-on Q4 snap so this asserts the raw move geometry.
    fireEvent.pointerDown(box, { clientX: 200, clientY: 400, button: 0, altKey: true });
    fireEvent.pointerMove(window, { clientX: 250, clientY: 400, altKey: true });   // +50 screen px / scale 0.5 => +100 canvas
    fireEvent.pointerUp(window, { clientX: 250, clientY: 400, altKey: true });
    expect(onPlacement).toHaveBeenCalledTimes(1);
    const partial = onPlacement.mock.calls[0][0];
    // Derivation (W=1920,H=1080, align=2 bottom-center, scale=960/1920=0.5):
    //   boxFromState: l=80, r=1840, b=1020, t=825.6  (band 0.18*1080=194.4); box width w=1760
    //   +50 screen px => +100 canvas px. applyMove(box,+100,0,W,H):
    //     l = clamp(80+100, 0, W-w=1920-1760=160) = 160 ; r = 160+1760 = 1920
    //   marginsFromBox: margin_l=160, margin_r=max(0,1920-1920)=0, margin_v=1080-1020=60
    expect(partial.margin_l).toBe(160);
    expect(partial.margin_r).toBe(0);
  });

  it("pos mode dispatches a new pos", () => {
    const { onPlacement, box } = setup({ ...placement, pos: [960, 1020], use_pos: true });
    fireEvent.pointerDown(box, { clientX: 480, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 480, clientY: 250 });   // -50px => -100 canvas y
    fireEvent.pointerUp(window, { clientX: 480, clientY: 250 });
    const partial = onPlacement.mock.calls[0][0];
    expect(partial.pos[0]).toBe(960);
    expect(partial.pos[1]).toBe(920);
  });

  it("Escape cancels the drag — nothing dispatched", () => {
    const { onPlacement, box } = setup();
    fireEvent.pointerDown(box, { clientX: 200, clientY: 400, button: 0 });
    fireEvent.pointerMove(window, { clientX: 300, clientY: 400 });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerUp(window, { clientX: 300, clientY: 400 });
    expect(onPlacement).not.toHaveBeenCalled();
  });

  it("click without movement dispatches nothing", () => {
    const { onPlacement, box } = setup();
    fireEvent.pointerDown(box, { clientX: 200, clientY: 400, button: 0 });
    fireEvent.pointerUp(window, { clientX: 201, clientY: 400 });
    expect(onPlacement).not.toHaveBeenCalled();
  });
});

// Q2 — Shift = symmetric resize: one shared delta to both opposing margins,
// center fixed; min-width center-stop; default per-side unaffected; Shift+Esc cancel.
describe("PreviewStage Q2 symmetric resize (Shift)", () => {
  beforeEach(() => vi.restoreAllMocks());
  const W = 1920, H = 1080, SCALE = 0.5;
  const scr = (canvasDelta: number) => canvasDelta * SCALE;
  const handle = (c: HTMLElement, h: string) => c.querySelector(`.bbox .${h}`) as HTMLElement;

  it("Shift+'e' resize dispatches symmetric margins (center fixed: both l and r move)", () => {
    const { onPlacement, container } = setup();
    const b0 = boxFromState(placement);
    const e = handle(container, "e");
    fireEvent.pointerDown(e, { clientX: 480, clientY: 412, button: 0, shiftKey: true });
    fireEvent.pointerMove(window, { clientX: 480 + scr(60), clientY: 412, shiftKey: true });
    fireEvent.pointerUp(window, { clientX: 480 + scr(60), clientY: 412, shiftKey: true });
    const expected = marginsFromBox(applyResize(b0, "e", 60, 0, W, H, 40, true), placement);
    expect(onPlacement).toHaveBeenCalledTimes(1);
    expect(onPlacement.mock.calls[0][0]).toEqual(expected);
    // both margins changed symmetrically (center fixed): margin_l decreased, margin_r decreased
    expect(expected.margin_l).toBeLessThan(placement.margin_l);
    expect(expected.margin_r).toBeLessThan(placement.margin_r);
  });

  it("Shift symmetric stops at min width without sliding the center", () => {
    const { onPlacement, container } = setup();
    const b0 = boxFromState(placement);
    const e = handle(container, "e");
    // Alt bypasses Q4 snap so the collapsed edge isn't pulled to the centre line.
    fireEvent.pointerDown(e, { clientX: 480, clientY: 412, button: 0, shiftKey: true, altKey: true });
    fireEvent.pointerMove(window, { clientX: 480 - scr(5000), clientY: 412, shiftKey: true, altKey: true });
    fireEvent.pointerUp(window, { clientX: 480 - scr(5000), clientY: 412, shiftKey: true, altKey: true });
    const oracle = applyResize(b0, "e", -5000, 0, W, H, 40, true);
    expect(oracle.r - oracle.l).toBeCloseTo(40, 5);
    expect((oracle.l + oracle.r) / 2).toBeCloseTo((b0.l + b0.r) / 2, 5); // center fixed
    expect(onPlacement.mock.calls[0][0]).toEqual(marginsFromBox(oracle, placement));
  });

  it("without Shift the 'e' resize is the default per-side behavior", () => {
    const { onPlacement, container } = setup();
    const b0 = boxFromState(placement);
    const e = handle(container, "e");
    fireEvent.pointerDown(e, { clientX: 480, clientY: 412, button: 0 });
    fireEvent.pointerMove(window, { clientX: 480 + scr(60), clientY: 412 });
    fireEvent.pointerUp(window, { clientX: 480 + scr(60), clientY: 412 });
    const expected = marginsFromBox(applyResize(b0, "e", 60, 0, W, H), placement);
    expect(onPlacement.mock.calls[0][0]).toEqual(expected);
    expect(expected.margin_l).toBe(placement.margin_l); // left untouched
  });

  it("Shift+Esc cancels a symmetric resize — nothing dispatched", () => {
    const { onPlacement, container } = setup();
    const e = handle(container, "e");
    fireEvent.pointerDown(e, { clientX: 480, clientY: 412, button: 0, shiftKey: true });
    fireEvent.pointerMove(window, { clientX: 480 + scr(60), clientY: 412, shiftKey: true });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerUp(window, { clientX: 480 + scr(60), clientY: 412, shiftKey: true });
    expect(onPlacement).not.toHaveBeenCalled();
  });
});

// Q4 — placement snap + safe-area guides. Stage scale 0.5 (960/1920); canvas px
// = screen px * 2. base box: align-2 bottom-center l=80,r=1840,b=1020,t=825.6.
describe("PreviewStage Q4 snap + safe-area guides", () => {
  beforeEach(() => vi.restoreAllMocks());
  const SCALE = 0.5;
  const scr = (canvasDelta: number) => canvasDelta * SCALE;
  const handle = (c: HTMLElement, h: string) => c.querySelector(`.bbox .${h}`) as HTMLElement;

  it("guides render ONLY while a drag is active", () => {
    const { container, box } = setup();
    expect(container.querySelector(".snap-guides")).toBeNull();
    fireEvent.pointerDown(box, { clientX: 400, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 430, clientY: 320 });
    expect(container.querySelector(".snap-guides")).toBeTruthy();
    // faint guide lines present
    expect(container.querySelectorAll(".snap-guide-line").length).toBeGreaterThan(0);
    fireEvent.pointerUp(window, { clientX: 430, clientY: 320 });
    expect(container.querySelector(".snap-guides")).toBeNull();
  });

  it("'e' edge locks to the 90% safe line within tolerance; brightened class on lock", () => {
    const { onPlacement, container } = setup();
    // base r = 1840; drag e LEFT to ~1735 (near 1728 = 90%): canvas dx = -105
    const e = handle(container, "e");
    fireEvent.pointerDown(e, { clientX: 480, clientY: 412, button: 0 });
    fireEvent.pointerMove(window, { clientX: 480 + scr(-105), clientY: 412 });
    // a brightened (locked) vertical guide is present mid-drag
    expect(container.querySelector(".snap-guide-line.locked")).toBeTruthy();
    fireEvent.pointerUp(window, { clientX: 480 + scr(-105), clientY: 412 });
    // committed margin_r reflects the SNAPPED right edge (1728 → margin_r 192)
    const m = onPlacement.mock.calls[0][0];
    expect(m.margin_r).toBe(1920 - 1728);
  });

  it("Alt bypasses snapping: no lock, committed value is the raw edge", () => {
    const { onPlacement, container } = setup();
    const e = handle(container, "e");
    fireEvent.pointerDown(e, { clientX: 480, clientY: 412, button: 0, altKey: true });
    fireEvent.pointerMove(window, { clientX: 480 + scr(-105), clientY: 412, altKey: true });
    expect(container.querySelector(".snap-guide-line.locked")).toBeNull();
    fireEvent.pointerUp(window, { clientX: 480 + scr(-105), clientY: 412, altKey: true });
    // raw right edge 1840-105 = 1735 → margin_r 185 (NOT 192)
    const m = onPlacement.mock.calls[0][0];
    expect(m.margin_r).toBe(1920 - 1735);
  });
});
