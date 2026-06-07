import { describe, it, expect } from "vitest";
import {
  SNAP_PX,
  REVEAL_PX,
  collectTargets,
  snap,
  zoomAnchorScroll,
  type SnapTarget,
} from "./snap";

// All px↔sec math in these tests uses pxPerSec = 100 (1000px / 10s) unless noted.
const PPS = 100;

describe("snap constants", () => {
  it("uses the kit's pull/reveal distances", () => {
    expect(SNAP_PX).toBe(9);
    expect(REVEAL_PX).toBe(40);
  });
});

describe("collectTargets", () => {
  const blocks = [
    { wid: 0, s: 1, e: 1.5 },
    { wid: 1, s: 2, e: 2.5 },
  ];

  it("includes track ends, playhead, event bounds and every block edge", () => {
    const t = collectTargets(blocks, 3.0, [], { start: 0, end: 10 });
    // track ends
    expect(t).toContainEqual({ sec: 0, kind: "edge" });
    expect(t).toContainEqual({ sec: 10, kind: "edge" });
    // playhead
    expect(t).toContainEqual({ sec: 3.0, kind: "playhead" });
    // block edges
    expect(t).toContainEqual({ sec: 1, kind: "block" });
    expect(t).toContainEqual({ sec: 1.5, kind: "block" });
    expect(t).toContainEqual({ sec: 2, kind: "block" });
    expect(t).toContainEqual({ sec: 2.5, kind: "block" });
  });

  it("includes event boundaries as kind 'event'", () => {
    const t = collectTargets(blocks, 3.0, [{ s: 0.2, e: 4.4 }], { start: 0, end: 10 });
    expect(t).toContainEqual({ sec: 0.2, kind: "event" });
    expect(t).toContainEqual({ sec: 4.4, kind: "event" });
  });

  it("excludes the blocks named in `exclude` (so an edge does not snap to itself)", () => {
    const t = collectTargets(blocks, 3.0, [], { start: 0, end: 10 }, new Set([0]));
    expect(t.some((c) => c.sec === 1 && c.kind === "block")).toBe(false);
    expect(t.some((c) => c.sec === 1.5 && c.kind === "block")).toBe(false);
    // the other block survives
    expect(t).toContainEqual({ sec: 2, kind: "block" });
  });

  it("omits the playhead when includePlayhead is false", () => {
    const t = collectTargets(blocks, 3.0, [], { start: 0, end: 10 }, undefined, false);
    expect(t.some((c) => c.kind === "playhead")).toBe(false);
  });

  it("adds optional strip edges as kind 'anim'", () => {
    const t = collectTargets(blocks, 3.0, [], { start: 0, end: 10 }, undefined, true, [
      { s: 5, e: 6 },
    ]);
    expect(t).toContainEqual({ sec: 5, kind: "anim" });
    expect(t).toContainEqual({ sec: 6, kind: "anim" });
  });
});

describe("snap — lock behaviour", () => {
  const targets: SnapTarget[] = [
    { sec: 2.0, kind: "block" },
    { sec: 5.0, kind: "playhead" },
  ];

  it("locks onto a target within SNAP_PX (9px → 0.09s at 100px/s)", () => {
    // pointer at 2.05s is 5px from the 2.0 target (< 9px) → snaps
    const r = snap(2.05, targets, PPS, { enabled: true, altHeld: false });
    expect(r.sec).toBe(2.0);
    expect(r.target).toEqual({ sec: 2.0, kind: "block" });
  });

  it("does not lock beyond SNAP_PX", () => {
    // pointer at 2.10s is 10px from target (> 9px) → passthrough
    const r = snap(2.1, targets, PPS, { enabled: true, altHeld: false });
    expect(r.sec).toBe(2.1);
    expect(r.target).toBeNull();
  });

  it("locks exactly at the SNAP_PX boundary (9px = 0.09s)", () => {
    const r = snap(2.09, targets, PPS, { enabled: true, altHeld: false });
    expect(r.sec).toBe(2.0);
    expect(r.target?.sec).toBe(2.0);
  });

  it("picks the nearest target when two are in range", () => {
    const near: SnapTarget[] = [
      { sec: 2.0, kind: "block" },
      { sec: 2.05, kind: "anim" },
    ];
    const r = snap(2.04, near, PPS, { enabled: true, altHeld: false });
    expect(r.sec).toBe(2.05);
  });
});

describe("snap — near-lines (reveal preview)", () => {
  it("reveals candidates within REVEAL_PX with proximity opacity", () => {
    const targets: SnapTarget[] = [{ sec: 2.0, kind: "block" }];
    // pointer 0.30s away = 30px (< 40px reveal). strength = 1 - 30/40 = 0.25
    const r = snap(2.3, targets, PPS, { enabled: true, altHeld: false });
    expect(r.nearLines.length).toBe(1);
    expect(r.nearLines[0].sec).toBe(2.0);
    expect(r.nearLines[0].opacity).toBeCloseTo(1 - 30 / REVEAL_PX, 5);
  });

  it("does not reveal candidates beyond REVEAL_PX", () => {
    const targets: SnapTarget[] = [{ sec: 2.0, kind: "block" }];
    // 0.50s away = 50px (> 40px)
    const r = snap(2.5, targets, PPS, { enabled: true, altHeld: false });
    expect(r.nearLines.length).toBe(0);
  });

  it("dedupes candidates that share the same time", () => {
    const targets: SnapTarget[] = [
      { sec: 2.0, kind: "block" },
      { sec: 2.0, kind: "event" },
    ];
    const r = snap(2.1, targets, PPS, { enabled: true, altHeld: false });
    expect(r.nearLines.length).toBe(1);
  });
});

describe("snap — enable/disable + Alt invert", () => {
  const targets: SnapTarget[] = [{ sec: 2.0, kind: "block" }];

  it("disabled → passthrough with no target and no near-lines", () => {
    const r = snap(2.05, targets, PPS, { enabled: false, altHeld: false });
    expect(r.sec).toBe(2.05);
    expect(r.target).toBeNull();
    expect(r.nearLines).toEqual([]);
  });

  it("Alt inverts an enabled magnet → behaves as disabled", () => {
    const r = snap(2.05, targets, PPS, { enabled: true, altHeld: true });
    expect(r.sec).toBe(2.05);
    expect(r.target).toBeNull();
    expect(r.nearLines).toEqual([]);
  });

  it("Alt inverts a disabled magnet → behaves as enabled (snaps)", () => {
    const r = snap(2.05, targets, PPS, { enabled: false, altHeld: true });
    expect(r.sec).toBe(2.0);
    expect(r.target?.sec).toBe(2.0);
  });
});

describe("zoomAnchorScroll — pin the playhead's on-screen x", () => {
  it("keeps the playhead at the same screen x across a zoom change", () => {
    // playhead at 5s. old 100px/s → x=500; scrollLeft 200 → screen x 300.
    // new 200px/s → playhead at 1000px; to keep screen x 300 → scrollLeft 700.
    const r = zoomAnchorScroll(100, 200, 5, 200, 800);
    expect(r).toBe(700);
  });

  it("never returns a negative scrollLeft", () => {
    // playhead near the very start, zooming out → would compute negative → clamp 0
    const r = zoomAnchorScroll(200, 100, 0.5, 0, 800);
    expect(r).toBe(0);
  });

  it("centers the playhead when it is currently off-screen (left of viewport)", () => {
    // old: playhead x = 500, scrollLeft 600 → screen x -100 (off left) → recenter
    // anchor = viewportW/2 = 400. new pps 100 (same) → scrollLeft = 500 - 400 = 100
    const r = zoomAnchorScroll(100, 100, 5, 600, 800);
    expect(r).toBe(100);
  });
});
