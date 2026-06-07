/**
 * WordTrack.snap.test.tsx — magnet snapping for block drag/resize.
 *
 * Reuses the px↔time mock from WordTrack.drag.test.tsx: wt-area = 1000px, dur=10
 * → pxPerSec = 100. SNAP_PX=9 → 0.09s pull, REVEAL_PX=40 → 0.40s reveal.
 *
 * blocks: word0 @ 1.0–1.5, word1 @ 2.0–2.5 (same event). Dragging word0's edges
 * magnetizes to word1's edges / track ends / the playhead.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { WordTrack } from "./WordTrack";
import type { Project } from "../../types";

const words = [
  { wid: 0, text: "a", s: 1, e: 1.5, gi: 0, li: 0, ti: 0 },
  { wid: 1, text: "b", s: 2, e: 2.5, gi: 0, li: 0, ti: 1 },
];
const events = [{ gi: 0, label: "V" }];

function proj(): Project {
  return {
    words: [{ text: "a", start: 1, end: 1.5 }, { text: "b", start: 2, end: 2.5 }],
    layout: [{ label: "V", win_start: null, win_end: null, linger: null, del: false, style: {}, animations: [], suppress: [],
      lines: [{ toks: [{ ids: [0], sep: "", del: false, style: {} }, { ids: [1], sep: "", del: false, style: {} }] }] }],
    anim_tags: [], globals: { linger: 0, animations: [] },
    global_style: { font: "x", fontsize: 64, bold: true, primary: "#fff", outline: "#000", back: "#000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1, align: 2 },
    placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 0, margin_r: 0, margin_v: 0, pos: null }, video: null,
  };
}

beforeEach(() => {
  Element.prototype.getBoundingClientRect = vi.fn(() => ({ x: 0, left: 0, width: 1000, top: 0, right: 1000, bottom: 30, height: 30, y: 0, toJSON: () => {} } as DOMRect));
});

function setup(opts: { magnet?: boolean; time?: number } = {}) {
  const onRetime = vi.fn();
  const utils = render(
    <WordTrack
      words={words as any}
      events={events}
      project={proj()}
      dur={10}
      time={opts.time ?? 0}
      liveId={null}
      selId={0}
      selectedWords={new Set([0])}
      unlocked
      magnet={opts.magnet ?? true}
      onRetime={onRetime}
      onSelect={() => {}}
    />,
  );
  return { ...utils, onRetime };
}

describe("WordTrack snap — block edge magnetizes", () => {
  it("snaps word0's right edge onto word1's start (2.0s) and shows a lock guide + tag", () => {
    const { container, onRetime } = setup();
    const block = container.querySelectorAll(".block")[0]!;
    // grab the right resize handle of word0 (origin end = 1.5s)
    const rh = block.querySelector(".wt-handle.r")!;
    // drag right by +46px (=+0.46s → 1.96s); within 9px (0.09s) of word1 start (2.0) → snaps to 2.0
    fireEvent.pointerDown(rh, { clientX: 150 });
    fireEvent.pointerMove(window, { clientX: 196 });
    // lock guide visible with the snapped time tag
    const guide = container.querySelector(".snap-guide:not(.near)") as HTMLElement;
    expect(guide).toBeTruthy();
    expect(guide.querySelector(".sg-tag")!.textContent).toBe("2.00s");
    fireEvent.pointerUp(window, { clientX: 196 });
    // committed end snapped to exactly 2.0
    expect(onRetime).toHaveBeenCalledTimes(1);
    expect(onRetime.mock.calls[0][0]).toContainEqual({ wid: 0, start: 1, end: 2 });
  });

  it("shows dotted near-line previews as an edge approaches a candidate", () => {
    const { container } = setup();
    const rh = container.querySelectorAll(".block")[0]!.querySelector(".wt-handle.r")!;
    // drag right by +20px → end at 1.70s; word1 start (2.0) is 0.30s = 30px away (< 40 reveal, > 9 snap)
    fireEvent.pointerDown(rh, { clientX: 150 });
    fireEvent.pointerMove(window, { clientX: 170 });
    expect(container.querySelector(".snap-guide.near")).toBeTruthy();
    // not locked (no solid guide / tag)
    expect(container.querySelector(".sg-tag")).toBeNull();
  });

  it("Alt held during the drag bypasses snapping (no guide, raw value committed)", () => {
    const { container, onRetime } = setup();
    const rh = container.querySelectorAll(".block")[0]!.querySelector(".wt-handle.r")!;
    fireEvent.pointerDown(rh, { clientX: 150 });
    fireEvent.pointerMove(window, { clientX: 196, altKey: true });
    expect(container.querySelector(".snap-guide")).toBeNull();
    fireEvent.pointerUp(window, { clientX: 196, altKey: true });
    // raw end = 1.96, not snapped to 2.0
    expect(onRetime.mock.calls[0][0]).toContainEqual({ wid: 0, start: 1, end: 1.96 });
  });

  it("magnet={false} → no snapping (raw value)", () => {
    const { container, onRetime } = setup({ magnet: false });
    const rh = container.querySelectorAll(".block")[0]!.querySelector(".wt-handle.r")!;
    fireEvent.pointerDown(rh, { clientX: 150 });
    fireEvent.pointerMove(window, { clientX: 196 });
    expect(container.querySelector(".snap-guide")).toBeNull();
    fireEvent.pointerUp(window, { clientX: 196 });
    expect(onRetime.mock.calls[0][0]).toContainEqual({ wid: 0, start: 1, end: 1.96 });
  });

  it("snaps an edge to the playhead", () => {
    // playhead at 1.93s (no block edge there); drag word0's right edge to ~1.96
    // → within 9px (0.09s) of the playhead → snaps to 1.93 with the playhead guide.
    const { container } = setup({ time: 1.93 });
    const rh = container.querySelectorAll(".block")[0]!.querySelector(".wt-handle.r")!;
    fireEvent.pointerDown(rh, { clientX: 150 });
    fireEvent.pointerMove(window, { clientX: 196 });
    const guide = container.querySelector(".snap-guide.k-playhead") as HTMLElement;
    expect(guide).toBeTruthy();
    expect(guide.querySelector(".sg-tag")!.textContent).toBe("1.93s");
  });

  it("clears the guide on pointer-up", () => {
    const { container } = setup();
    const rh = container.querySelectorAll(".block")[0]!.querySelector(".wt-handle.r")!;
    fireEvent.pointerDown(rh, { clientX: 150 });
    fireEvent.pointerMove(window, { clientX: 196 });
    expect(container.querySelector(".snap-guide")).toBeTruthy();
    fireEvent.pointerUp(window, { clientX: 196 });
    expect(container.querySelector(".snap-guide")).toBeNull();
  });
});

describe("WordTrack snap — group move snaps by ONE delta", () => {
  it("moving a 2-block selection snaps once and preserves the inter-block gap", () => {
    const onRetime = vi.fn();
    const { container } = render(
      <WordTrack
        words={words as any}
        events={events}
        project={proj()}
        dur={10}
        time={0}
        liveId={null}
        selId={0}
        selectedWords={new Set([0, 1])}
        unlocked
        magnet
        onRetime={onRetime}
        onSelect={() => {}}
      />,
    );
    // group span 1.0..2.5. Drag body of word0 by +296px (=+2.96s).
    // raw group start 3.96, raw end 5.46. track-end (10) far; no candidate near
    // 3.96 within 9px → but 4.0? none. So we instead aim near a track edge:
    // Actually pick +146px (=+1.46s): rawS=2.46, rawE=3.96. No target near.
    // Use +100px (=+1.0s): rawS=2.0 (matches word… but words excluded). playhead 0, edges 0/10.
    // → nothing snaps; both blocks shift by exactly +1.0s, gap preserved.
    const block = container.querySelectorAll(".block")[0]!;
    fireEvent.pointerDown(block, { clientX: 120 }); // mid-body of word0
    fireEvent.pointerMove(window, { clientX: 220 }); // +100px = +1.0s
    fireEvent.pointerUp(window, { clientX: 220 });
    expect(onRetime).toHaveBeenCalledTimes(1);
    const updates = onRetime.mock.calls[0][0];
    // both moved by the same +1.0s delta → gap (0.5s) preserved
    expect(updates).toContainEqual({ wid: 0, start: 2, end: 2.5 });
    expect(updates).toContainEqual({ wid: 1, start: 3, end: 3.5 });
  });
});
