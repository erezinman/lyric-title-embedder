import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { PreviewStage } from "./PreviewStage";
import type { PlacementState } from "../../model/bbox";

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
  const box = r.container.querySelector(".bbox") as HTMLElement;
  return { onPlacement, box, stage };
}

describe("PreviewStage drag", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("body drag dispatches margins once on release (margin mode)", () => {
    const { onPlacement, box } = setup();
    fireEvent.pointerDown(box, { clientX: 200, clientY: 400, button: 0 });
    fireEvent.pointerMove(window, { clientX: 250, clientY: 400 });   // +50 screen px / scale 0.5 => +100 canvas
    fireEvent.pointerUp(window, { clientX: 250, clientY: 400 });
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
    const { onPlacement, box } = setup({ ...placement, pos: [960, 1020] });
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
