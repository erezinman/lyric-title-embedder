/**
 * Waveform.drag.test.tsx — §4 draggable playhead / drag-to-scrub.
 *
 * The ruler stays a click-seeker (Waveform.audit.test.tsx covers that). Here:
 * dragging the ruler emits onSeek per move; a reduced-opacity playhead spans the
 * row with an opaque grab head; dragging snaps to block/event/playhead candidates
 * (magnet on by default, Alt bypasses). Track rect mocked: left 100, width 800.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Waveform } from "./Waveform";

const RECT = { left: 100, top: 0, width: 800, height: 40, right: 900, bottom: 40, x: 100, y: 0, toJSON: () => ({}) } as DOMRect;

function setup(dur: number, extra: Partial<React.ComponentProps<typeof Waveform>> = {}) {
  const onSeek = vi.fn();
  const r = render(<Waveform dur={dur} time={0} onSeek={onSeek} {...extra} />);
  const track = r.container.querySelector(".ruler-track") as HTMLElement;
  vi.spyOn(track, "getBoundingClientRect").mockReturnValue(RECT);
  const atX = (f: number) => RECT.left + f * RECT.width;
  return { ...r, onSeek, track, atX };
}

beforeEach(() => vi.restoreAllMocks());

describe("Waveform — draggable playhead / scrub", () => {
  it("renders a continuous playhead with a grab strip (single kit head, no .ph-head)", () => {
    const { container } = setup(100);
    const ph = container.querySelector(".playhead") as HTMLElement;
    expect(ph).toBeTruthy();
    // Single-head kit treatment: the visible head is the through-playhead's ::before
    // dot; the second .ph-head element was removed. The invisible grab strip stays.
    expect(ph.querySelector(".ph-head")).toBeNull();
    expect(ph.querySelector(".ph-hit")).toBeTruthy();
  });

  it("dragging the ruler emits onSeek for the down and each move", () => {
    const { track, onSeek, atX } = setup(100);
    fireEvent.pointerDown(track, { clientX: atX(0.25) });
    fireEvent.pointerMove(window, { clientX: atX(0.5) });
    fireEvent.pointerUp(window, { clientX: atX(0.5) });
    // down seeks to 0.25*dur, move seeks to 0.5*dur
    expect(onSeek.mock.calls).toEqual([[25], [50]]);
  });

  it("clamps the scrub to [0, dur]", () => {
    const { track, onSeek } = setup(100);
    fireEvent.pointerDown(track, { clientX: RECT.left - 300 });
    fireEvent.pointerMove(window, { clientX: RECT.right + 300 });
    fireEvent.pointerUp(window, { clientX: RECT.right + 300 });
    expect(onSeek.mock.calls).toEqual([[0], [100]]);
  });
});

describe("Waveform — playhead snaps to candidates", () => {
  // dur=100, width=800 → pxPerSec = 8. SNAP_PX=9 → 1.125s pull.
  const blocks = [{ wid: 0, s: 50, e: 60 }];

  it("snaps a scrub onto a nearby block edge and shows a guide", () => {
    const { track, onSeek, atX, container } = setup(100, { blocks, magnet: true });
    // drag to ~49.5s (0.495 fraction) → within 1.125s of block start 50 → snaps to 50
    fireEvent.pointerDown(track, { clientX: atX(0.495) });
    expect(onSeek).toHaveBeenLastCalledWith(50);
    expect(container.querySelector(".snap-guide")).toBeTruthy();
    fireEvent.pointerUp(window, { clientX: atX(0.495) });
    expect(container.querySelector(".snap-guide")).toBeNull();
  });

  it("Alt held bypasses the playhead snap", () => {
    const { track, onSeek, atX, container } = setup(100, { blocks, magnet: true });
    fireEvent.pointerDown(track, { clientX: atX(0.495), altKey: true });
    expect(onSeek).toHaveBeenLastCalledWith(49.5);
    expect(container.querySelector(".snap-guide")).toBeNull();
  });

  it("no snap inputs → plain scrub (no guide)", () => {
    const { track, onSeek, atX, container } = setup(100);
    fireEvent.pointerDown(track, { clientX: atX(0.495) });
    expect(onSeek).toHaveBeenLastCalledWith(49.5);
    expect(container.querySelector(".snap-guide")).toBeNull();
  });
});
