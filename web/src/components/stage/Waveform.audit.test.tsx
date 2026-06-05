// Waveform.audit.test.tsx — Cluster B audit for the scrubbable time ruler.
// Click at fraction f of the track width seeks to f*dur; boundary clicks at the
// extreme edges clamp to [0, dur]. The track rect is mocked so the math is
// deterministic (left 100, width 800).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Waveform } from "./Waveform";

const RECT = { left: 100, top: 0, width: 800, height: 40, right: 900, bottom: 40, x: 100, y: 0, toJSON: () => ({}) } as DOMRect;

function setup(dur: number, time = 0) {
  const onSeek = vi.fn();
  const r = render(<Waveform dur={dur} time={time} onSeek={onSeek} />);
  const track = r.container.querySelector(".ruler-track") as HTMLElement;
  vi.spyOn(track, "getBoundingClientRect").mockReturnValue(RECT);
  // click at a canvas-fraction f along [left, left+width]
  const clickAt = (f: number) => fireEvent.click(track, { clientX: RECT.left + f * RECT.width });
  // click at an absolute clientX (for out-of-bounds boundary tests)
  const clickX = (x: number) => fireEvent.click(track, { clientX: x });
  return { onSeek, track, clickAt, clickX };
}

beforeEach(() => vi.restoreAllMocks());

describe("Waveform audit — seek", () => {
  it("B-33 — click at fraction 0.5 seeks to 0.5*dur", () => {
    const dur = 120;
    const { onSeek, clickAt } = setup(dur);
    clickAt(0.5);
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledWith(0.5 * dur);
  });

  it("B-34 — click at fraction 0.25 seeks to 0.25*dur", () => {
    const dur = 200;
    const { onSeek, clickAt } = setup(dur);
    clickAt(0.25);
    expect(onSeek).toHaveBeenCalledWith(0.25 * dur);
  });

  it("B-35 — two clicks at different points seek to each fraction in order", () => {
    const dur = 80;
    const { onSeek, clickAt } = setup(dur);
    clickAt(0.1);
    clickAt(0.9);
    expect(onSeek.mock.calls).toEqual([[0.1 * dur], [0.9 * dur]]);
  });

  it("B-36 — boundary click at the left edge (f=0) seeks to 0", () => {
    const dur = 150;
    const { onSeek, clickAt } = setup(dur);
    clickAt(0);
    expect(onSeek).toHaveBeenCalledWith(0);
  });

  it("B-37 — boundary click at the right edge (f=1) seeks to exactly dur", () => {
    const dur = 150;
    const { onSeek, clickAt } = setup(dur);
    clickAt(1);
    expect(onSeek).toHaveBeenCalledWith(dur);
  });

  it("B-38 — click left of the track clamps to 0 (no negative seek)", () => {
    const dur = 100;
    const { onSeek, clickX } = setup(dur);
    clickX(RECT.left - 200); // way before the start
    expect(onSeek).toHaveBeenCalledWith(0);
  });

  it("B-39 — click right of the track clamps to dur (no overshoot)", () => {
    const dur = 100;
    const { onSeek, clickX } = setup(dur);
    clickX(RECT.right + 500);
    expect(onSeek).toHaveBeenCalledWith(dur);
  });

  it("B-40 — playhead reflects time/dur as a percentage", () => {
    const { track } = (() => {
      const onSeek = vi.fn();
      const r = render(<Waveform dur={200} time={50} onSeek={onSeek} />);
      const t = r.container.querySelector(".ruler-track") as HTMLElement;
      return { track: t };
    })();
    const playhead = track.querySelector(".playhead") as HTMLElement;
    expect(playhead.style.left).toBe("25%"); // 50/200
  });
});
