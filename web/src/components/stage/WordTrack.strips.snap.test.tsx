/**
 * WordTrack.strips.snap.test.tsx — §11 strip drag-retime snapping + source-link.
 *
 * Strip handle drags snap their dragged edge to cue edges / other strips / the
 * playhead / window ends, drawing the same cyan guide. The dispatch contract
 * ({t0|t1:{offset}} + 50ms clamp) is unchanged — snapping only adjusts the raw
 * seconds before the clamp. Source-linking is a pure render: hovering/focusing a
 * group/global-sourced strip outlines every visible strip sharing the source id.
 *
 * wt-area mocked 1000px, dur=10 → pxPerSec=100.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { WordTrack } from "./WordTrack";
import type { TrackWord } from "./WordTrack";
import { resolved } from "../../test-util/fixtures";

beforeEach(() => {
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    x: 0, left: 0, width: 1000, top: 0, right: 1000, bottom: 30, height: 30, y: 0, toJSON: () => {},
  } as DOMRect));
});

const events = [{ gi: 0, label: "V" }];

function renderTrack(words: TrackWord[], extra: Partial<React.ComponentProps<typeof WordTrack>> = {}) {
  return render(
    <WordTrack
      words={words}
      events={events}
      dur={10}
      time={0}
      liveId={null}
      selId={0}
      selectedWords={new Set([0])}
      onSelect={() => {}}
      {...extra}
    />,
  );
}

describe("strip drag snapping", () => {
  it("snaps the dragged edge to a sibling strip and shows a guide; clamp/contract intact", () => {
    // cue wid0 spans 1..3. strip A (focused) 1.2..1.8; strip B 2.0..2.6.
    // Drag A's right handle right toward 2.0 (B's start) → snaps to 2.0.
    const anims = [
      resolved({ id: "A", channel: "alpha" }, 1.2, 1.8),
      resolved({ id: "B", channel: "primary" }, 2.0, 2.6),
    ];
    const words: TrackWord[] = [{ wid: 0, text: "a", s: 1, e: 3, gi: 0, li: 0, ti: 0, anims }];
    const onAnimRetime = vi.fn();
    const { container } = renderTrack(words, {
      animFocus: { wid: 0, aid: "A" },
      onAnimRetime,
    });
    const rh = container.querySelector(".astrip[data-aid='A'] .h-r") as HTMLElement;
    expect(rh).toBeTruthy();
    // A end at 1.8 → px 80 (relative). Drag from clientX 80 by +189px → raw end 3.69? too far.
    // pxPerSec=100. We want raw end near 2.0: A end origin 1.8s. +0.19s = +19px → 1.99s,
    // within 9px (0.09s) of strip B start (2.0) → snaps to 2.0.
    fireEvent.pointerDown(rh, { clientX: 200 });
    fireEvent.pointerMove(window, { clientX: 219 });
    expect(container.querySelector(".snap-guide")).toBeTruthy();
    fireEvent.pointerUp(window, { clientX: 219 });
    // dispatched once with a t1 offset (the contract). snapped end 2.0 → offset +200ms.
    expect(onAnimRetime).toHaveBeenCalledTimes(1);
    const [, , edge, deltaMs] = onAnimRetime.mock.calls[0];
    expect(edge).toBe("t1");
    expect(deltaMs).toBe(200); // (2.0 - 1.8) * 1000
  });

  it("Alt during the strip drag bypasses snapping (raw delta)", () => {
    const anims = [
      resolved({ id: "A", channel: "alpha" }, 1.2, 1.8),
      resolved({ id: "B", channel: "primary" }, 2.0, 2.6),
    ];
    const words: TrackWord[] = [{ wid: 0, text: "a", s: 1, e: 3, gi: 0, li: 0, ti: 0, anims }];
    const onAnimRetime = vi.fn();
    const { container } = renderTrack(words, { animFocus: { wid: 0, aid: "A" }, onAnimRetime });
    const rh = container.querySelector(".astrip[data-aid='A'] .h-r") as HTMLElement;
    fireEvent.pointerDown(rh, { clientX: 200 });
    fireEvent.pointerMove(window, { clientX: 219, altKey: true });
    expect(container.querySelector(".snap-guide")).toBeNull();
    fireEvent.pointerUp(window, { clientX: 219, altKey: true });
    // raw +19px = +0.19s → +190ms, NOT snapped to +200
    expect(onAnimRetime.mock.calls[0][3]).toBe(190);
  });
});

describe("strip source-linking (pure render)", () => {
  // Two cues each carry a group-sourced 'g_fade' strip; focusing/hovering one
  // outlines every visible strip sharing that source id.
  const mkWords = (): TrackWord[] => [
    { wid: 0, text: "a", s: 1, e: 3, gi: 0, li: 0, ti: 0, anims: [
      resolved({ id: "g_fade", channel: "alpha", src: "group" }, 1.1, 1.9),
    ] },
    { wid: 1, text: "b", s: 4, e: 6, gi: 0, li: 0, ti: 1, anims: [
      resolved({ id: "g_fade", channel: "alpha", src: "group" }, 4.1, 4.9),
    ] },
  ];

  it("focusing a group-sourced strip outlines every visible strip with the same source id", () => {
    const { container } = renderTrack(mkWords(), { animFocus: { wid: 0, aid: "g_fade" } });
    const strips = container.querySelectorAll(".astrip[data-aid='g_fade']");
    expect(strips.length).toBe(2);
    // both instances carry .linked
    expect([...strips].every((s) => s.classList.contains("linked"))).toBe(true);
  });

  it("hovering a group-sourced strip links all instances; leaving clears", () => {
    const { container } = renderTrack(mkWords(), { selId: null, selectedWords: new Set() });
    const first = container.querySelector(".astrip[data-aid='g_fade']") as HTMLElement;
    expect(container.querySelectorAll(".astrip.linked").length).toBe(0);
    fireEvent.mouseEnter(first);
    expect(container.querySelectorAll(".astrip.linked").length).toBe(2);
    fireEvent.mouseLeave(first);
    expect(container.querySelectorAll(".astrip.linked").length).toBe(0);
  });

  it("a cue-sourced (non-shared) strip never links", () => {
    const words: TrackWord[] = [
      { wid: 0, text: "a", s: 1, e: 3, gi: 0, li: 0, ti: 0, anims: [
        resolved({ id: "local", channel: "alpha", src: "tag" }, 1.1, 1.9),
      ] },
    ];
    const { container } = renderTrack(words, { animFocus: { wid: 0, aid: "local" } });
    expect(container.querySelector(".astrip.linked")).toBeNull();
  });
});
