import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { PreviewStage } from "./PreviewStage";
import type { PlacementState } from "../../model/bbox";

const placement: PlacementState = { align: 2, play_w: 1920, play_h: 1080,
  margin_l: 80, margin_r: 80, margin_v: 60, pos: null };

function setup(pl: PlacementState = placement) {
  const onPlacement = vi.fn();
  const r = render(
    <PreviewStage capWords={[{ wid: 0, li: 0, text: "hi", live: true, pending: false, sel: false, fill: null, scale: 1, bold: null, italic: null, underline: null }]}
      time={0} mode="live" onMode={() => {}}
      onRenderExact={() => {}} onSelectWord={() => {}}
      playW={pl.play_w} playH={pl.play_h}
      placement={pl} onPlacement={onPlacement} />
  );
  const stage = r.container.querySelector(".stage") as HTMLElement;
  vi.spyOn(stage, "getBoundingClientRect").mockReturnValue(
    { left: 0, top: 0, width: 960, height: 540, right: 960, bottom: 540, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
  return { r, onPlacement, stage };
}

const pctOf = (v: number, total: number) => `${(v / total) * 100}%`;

describe("caption follows placement", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("bottom-aligned: caption sits at the box (left/width/bottom from margins)", () => {
    const { r } = setup();
    const cap = r.container.querySelector(".cap") as HTMLElement;
    expect(cap.style.left).toBe(pctOf(80, 1920));
    expect(cap.style.width).toBe(pctOf(1760, 1920));
    expect(cap.style.bottom).toBe(pctOf(60, 1080));   // box bottom = H - margin_v
  });

  it("top-aligned: caption anchors to the top edge", () => {
    const { r } = setup({ ...placement, align: 8 });
    const cap = r.container.querySelector(".cap") as HTMLElement;
    expect(cap.style.top).toBe(pctOf(60, 1080));
  });

  it("caption moves live with a body drag", () => {
    const { r } = setup();
    const box = r.container.querySelector(".bbox") as HTMLElement;
    fireEvent.pointerDown(box, { clientX: 200, clientY: 400, button: 0 });
    fireEvent.pointerMove(window, { clientX: 230, clientY: 400 });   // +30px => +60 canvas
    const cap = r.container.querySelector(".cap") as HTMLElement;
    expect(cap.style.left).toBe(pctOf(140, 1920));   // 80 + 60
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerUp(window, { clientX: 230, clientY: 400 });
  });
});

describe("caption line breaks", () => {
  it("renders one caption line per li (\\N structure visible)", () => {
    const onPlacement = vi.fn();
    const r = render(
      <PreviewStage capWords={[
        { wid: 0, li: 0, text: "hello", live: false, pending: false, sel: false, fill: null, scale: 1, bold: null, italic: null, underline: null },
        { wid: 1, li: 0, text: "world", live: false, pending: false, sel: false, fill: null, scale: 1, bold: null, italic: null, underline: null },
        { wid: 2, li: 1, text: "second", live: false, pending: false, sel: false, fill: null, scale: 1, bold: null, italic: null, underline: null },
      ]} time={0} mode="live" onMode={() => {}} onRenderExact={() => {}} onSelectWord={() => {}}
        playW={1920} playH={1080} placement={placement} onPlacement={onPlacement} />
    );
    const cap = r.container.querySelector(".cap") as HTMLElement;
    const lines = cap.querySelectorAll(":scope > div");
    expect(lines).toHaveLength(2);
    expect(lines[0].textContent).toContain("hello");
    expect(lines[1].textContent).toContain("second");
  });
});

describe("caption reflects resolved cue style", () => {
  it("applies scale and bold to a word span", () => {
    const r = render(
      <PreviewStage capWords={[
        { wid: 0, li: 0, text: "big", live: false, pending: false, sel: false, fill: null, scale: 1.5, bold: false, italic: null, underline: null },
      ]} time={0} mode="live" onMode={() => {}} onRenderExact={() => {}} onSelectWord={() => {}}
        playW={1920} playH={1080} placement={placement} onPlacement={vi.fn()} />
    );
    const w = r.container.querySelector(".cap .w") as HTMLElement;
    expect(w.style.fontSize).toBe("1.5em");
    expect(w.style.fontWeight).toBe("400");
  });
});

describe("band height persists across a vertical resize", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("resizing the top edge (bottom-aligned) sticks after release instead of snapping back", () => {
    const { r } = setup();
    const heightBefore = (r.container.querySelector(".bbox") as HTMLElement).style.height;
    const n = r.container.querySelector(".bbox .n") as HTMLElement;
    fireEvent.pointerDown(n, { clientX: 480, clientY: 412, button: 0 });
    fireEvent.pointerMove(window, { clientX: 480, clientY: 362 });   // top edge up 50px => +100 canvas taller
    fireEvent.pointerUp(window, { clientX: 480, clientY: 362 });
    const heightAfter = (r.container.querySelector(".bbox") as HTMLElement).style.height;
    expect(heightAfter).not.toBe(heightBefore);
    expect(parseFloat(heightAfter)).toBeCloseTo(parseFloat(heightBefore) + (100 / 1080) * 100, 1);
  });

  it("top-edge resize does not change the committed margins (margin_v is bottom-anchored)", () => {
    const { onPlacement, r } = setup();
    const n = r.container.querySelector(".bbox .n") as HTMLElement;
    fireEvent.pointerDown(n, { clientX: 480, clientY: 412, button: 0 });
    fireEvent.pointerMove(window, { clientX: 480, clientY: 362 });
    fireEvent.pointerUp(window, { clientX: 480, clientY: 362 });
    expect(onPlacement).toHaveBeenCalledTimes(1);
    expect(onPlacement.mock.calls[0][0]).toEqual({ margin_l: 80, margin_r: 80, margin_v: 60 });
  });
});
