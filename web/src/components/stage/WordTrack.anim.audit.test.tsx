/**
 * WordTrack.anim.audit.test.tsx — Cluster AT (timeline animation strips).
 * Test IDs: AT-01..AT-13 (test-design §5A/§5B).
 *
 * Facets: A (render count/classes/fills/x-bounds; drag dispatch contract),
 * R (drag-back nets baseline), D (2nd click = focus; expand/collapse),
 * G (no dispatch from unfocused drag; clamp ≥50ms; Esc cancel; zoom view-only).
 *
 * Render/density/glyph facets drive the WordTrack component directly with a
 * mocked getBoundingClientRect (wt-area = 1000px). Focus/dispatch facets go
 * through Editor (bootWith/emitState/dispatches pattern) so the shared animFocus
 * state + set_animation_props wiring is exercised end-to-end.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useState, useEffect } from "react";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WordTrack } from "./WordTrack";
import type { TrackWord } from "./WordTrack";
import { BLOCK_H, fullBlockH } from "../../model/animStrips";
import { Editor } from "../Editor";
import { setupFakeWS, FakeWS } from "../../test-util/fakews";
import { mockApi, emitState, dispatchesOf, clearDispatches } from "../../test-util/dispatch";
import { baseProject, withResolved, resolved } from "../../test-util/fixtures";

// 1000px-wide wt-area for px↔seconds conversion.
beforeEach(() => {
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    x: 0, left: 0, width: 1000, top: 0, right: 1000,
    bottom: 30, height: 30, y: 0, toJSON: () => {},
  } as DOMRect));
  FakeWS.last = null;
  setupFakeWS();
  mockApi();
});

const events = [{ gi: 0, label: "V" }];

/** Render WordTrack directly with one cue (wid 0) carrying `anims`. dur=10. */
function renderStrips(
  anims: ReturnType<typeof resolved>[],
  extra: Partial<React.ComponentProps<typeof WordTrack>> = {},
) {
  const words: TrackWord[] = [
    { wid: 0, text: "a", s: 1, e: 3, gi: 0, li: 0, ti: 0, anims },
  ];
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

// ── 5A: fill-by-type & density ───────────────────────────────────────────────

describe("AT-01 strip renders docked, x-bounds from resolved times", () => {
  it("renders one .astrip with left/width matching the time axis", () => {
    // alpha anim spanning 1.5..2.0s; cue spans 1..3s; dur=10 → pxPerSec=100.
    const { container } = renderStrips([resolved({ id: "x", channel: "alpha" }, 1.5, 2.0)]);
    const strip = container.querySelector(".astrip") as HTMLElement;
    expect(strip).toBeTruthy();
    // strip x is relative to the cue block: (1.5-1)*100 = 50px left, (2.0-1.5)*100 = 50px wide
    expect(strip.style.left).toBe("50px");
    expect(strip.style.width).toBe("50px");
  });
});

describe("AT-02 fill-by-type class per channel", () => {
  it("maps each channel to its visual type class", () => {
    const cases: [string, string][] = [
      ["primary", "t-color"],   // color → linear-gradient
      ["alpha", "t-alpha"],     // alpha → opacity ramp
      ["scale_x", "t-size"],    // size → wedge
      ["clip_rect", "t-type"],  // type → hatch
      ["move", "t-move"],       // move → arrow/gradient
      ["blur", "t-glow"],       // glow → bloom
    ];
    for (const [channel, cls] of cases) {
      const { container } = renderStrips([resolved({ id: "x", channel: channel as never }, 1.2, 2.8)]);
      const strip = container.querySelector(".astrip") as HTMLElement;
      expect(strip.className).toContain(cls);
    }
  });
});

describe("AT-03 cap=3: ≤3 anims → that many real bars", () => {
  it("renders 3 bars for a 3-anim cue (no overflow chip)", () => {
    const { container } = renderStrips([
      resolved({ id: "a", channel: "alpha" }, 1.1, 2.9),
      resolved({ id: "b", channel: "primary" }, 1.1, 2.9),
      resolved({ id: "c", channel: "scale_x" }, 1.1, 2.9),
    ]);
    expect(container.querySelectorAll(".astrip").length).toBe(3);
    expect(container.querySelector(".astrip.overflow")).toBeNull();
  });
});

describe("AT-04 >3 → constant-height cap + ＋N overflow placeholder", () => {
  it("renders exactly 3 real bars + a non-interactive ＋N disc (no sliver strip)", () => {
    // Phase 3: bars are capped at MAX_VISIBLE=3 and the rest surface as a count;
    // the old slot-divided +N sliver strip is gone (overlay arrives in Phase 5).
    const { container } = renderStrips([
      resolved({ id: "a", channel: "alpha" }, 1.1, 2.0),
      resolved({ id: "b", channel: "primary" }, 1.1, 2.0),
      resolved({ id: "c", channel: "scale_x" }, 1.5, 2.2),
      resolved({ id: "d", channel: "blur" }, 1.8, 2.9),
    ]);
    // 3 bars shown, no overflow sliver strip
    expect(container.querySelectorAll(".astrip").length).toBe(3);
    expect(container.querySelector(".astrip.overflow")).toBeNull();
    // ＋N placeholder disc carries the hidden count (4 - 3 = 1)
    const disc = container.querySelector(".wt-block .disc") as HTMLElement;
    expect(disc).toBeTruthy();
    expect(disc.textContent).toContain("1");
  });
});

// AT-05/AT-06 re-expressed against the expand-to-overlay accordion (spec §4):
// the ＋N disc lifts a floating full-height overlay showing ALL bars while the
// underlying block height stays BLOCK_H; click－/Esc/click-away close it; opening
// a different cue's disc closes the first (one open at a time).

/** A controlled WordTrack with an accordion `expandedCue` driven by onToggleOverflow. */
function AccordionHarness({ words }: { words: TrackWord[] }) {
  const [expandedCue, setExpandedCue] = useState<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpandedCue(null); };
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest(".wt-scroller")) return;
      setExpandedCue(null);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("click", onClick); };
  }, []);
  return (
    <WordTrack
      words={words}
      events={events}
      dur={10}
      time={0}
      liveId={null}
      selId={0}
      selectedWords={new Set([0])}
      onSelect={() => {}}
      expandedCue={expandedCue}
      onToggleOverflow={(wid) => setExpandedCue((prev) => (prev === wid ? null : wid))}
    />
  );
}

const OVERFLOW_ANIMS = [
  resolved({ id: "a", channel: "alpha" }, 1.1, 2.0),
  resolved({ id: "b", channel: "primary" }, 1.1, 2.0),
  resolved({ id: "c", channel: "scale_x" }, 1.5, 2.2),
  resolved({ id: "d", channel: "blur" }, 1.8, 2.9),
];

describe("AT-05 ＋N disc opens the overlay with ALL bars; row/block height unchanged", () => {
  it("clicking ＋N renders a .wt-block.overlay with every bar; the base block stays BLOCK_H", () => {
    const words: TrackWord[] = [{ wid: 0, text: "a", s: 1, e: 3, gi: 0, li: 0, ti: 0, anims: OVERFLOW_ANIMS }];
    const { container } = render(<AccordionHarness words={words} />);
    // closed: capped at 3 bars, no overlay
    expect(container.querySelector(".wt-block.overlay")).toBeNull();
    const baseBlock = container.querySelector('.wt-block[data-wid="0"]:not(.overlay)') as HTMLElement;
    expect(baseBlock.style.height).toBe(`${BLOCK_H}px`);

    fireEvent.click(container.querySelector(".disc")!);

    const overlay = container.querySelector(".wt-block.overlay") as HTMLElement;
    expect(overlay).toBeTruthy();
    // ALL bars present in the overlay (4, none capped)
    expect(overlay.querySelectorAll(".astrip").length).toBe(4);
    // underlying block height is UNCHANGED
    const baseAfter = container.querySelector('.wt-block[data-wid="0"]:not(.overlay)') as HTMLElement;
    expect(baseAfter.style.height).toBe(`${BLOCK_H}px`);
    // overlay carries the cyan top-edge marker var (--baseh = BLOCK_H) and is taller
    expect(overlay.style.getPropertyValue("--baseh")).toBe(`${BLOCK_H}px`);
    expect(parseFloat(overlay.style.height)).toBe(fullBlockH(4));
  });
});

describe("AT-06 close: － / Esc / click-away; accordion (one open at a time)", () => {
  it("clicking － closes the overlay", () => {
    const words: TrackWord[] = [{ wid: 0, text: "a", s: 1, e: 3, gi: 0, li: 0, ti: 0, anims: OVERFLOW_ANIMS }];
    const { container } = render(<AccordionHarness words={words} />);
    fireEvent.click(container.querySelector(".disc")!);
    expect(container.querySelector(".wt-block.overlay")).toBeTruthy();
    // the overlay's own disc shows － → clicking it closes
    fireEvent.click(container.querySelector(".wt-block.overlay .disc")!);
    expect(container.querySelector(".wt-block.overlay")).toBeNull();
  });

  it("Esc closes the overlay", () => {
    const words: TrackWord[] = [{ wid: 0, text: "a", s: 1, e: 3, gi: 0, li: 0, ti: 0, anims: OVERFLOW_ANIMS }];
    const { container } = render(<AccordionHarness words={words} />);
    fireEvent.click(container.querySelector(".disc")!);
    expect(container.querySelector(".wt-block.overlay")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".wt-block.overlay")).toBeNull();
  });

  it("a click outside the scroller closes the overlay (click-away)", () => {
    const words: TrackWord[] = [{ wid: 0, text: "a", s: 1, e: 3, gi: 0, li: 0, ti: 0, anims: OVERFLOW_ANIMS }];
    const { container } = render(<AccordionHarness words={words} />);
    fireEvent.click(container.querySelector(".disc")!);
    expect(container.querySelector(".wt-block.overlay")).toBeTruthy();
    fireEvent.click(document.body);
    expect(container.querySelector(".wt-block.overlay")).toBeNull();
  });

  it("opening a different cue's disc closes the first (one open at a time)", () => {
    const words: TrackWord[] = [
      { wid: 0, text: "a", s: 1, e: 3, gi: 0, li: 0, ti: 0, anims: OVERFLOW_ANIMS },
      { wid: 1, text: "b", s: 5, e: 7, gi: 0, li: 0, ti: 1, anims: OVERFLOW_ANIMS },
    ];
    const { container } = render(<AccordionHarness words={words} />);
    const discs = container.querySelectorAll(".disc");
    fireEvent.click(discs[0]);
    expect(container.querySelectorAll(".wt-block.overlay").length).toBe(1);
    expect(container.querySelector('.wt-block.overlay[data-overlay="0"]')).toBeTruthy();
    // open the SECOND cue → the first overlay closes, only one overlay remains
    fireEvent.click(container.querySelectorAll(".wt-block:not(.overlay) .disc")[1]);
    expect(container.querySelectorAll(".wt-block.overlay").length).toBe(1);
    expect(container.querySelector('.wt-block.overlay[data-overlay="1"]')).toBeTruthy();
    expect(container.querySelector('.wt-block.overlay[data-overlay="0"]')).toBeNull();
  });
});

describe("AT-05b overlay marker + fullCount bars", () => {
  it("the overlay carries the cyan top-edge marker (--baseh) and exactly fullCount bars", () => {
    const words: TrackWord[] = [{ wid: 0, text: "a", s: 1, e: 3, gi: 0, li: 0, ti: 0, anims: OVERFLOW_ANIMS }];
    const { container } = render(<AccordionHarness words={words} />);
    fireEvent.click(container.querySelector(".disc")!);
    const overlay = container.querySelector(".wt-block.overlay") as HTMLElement;
    expect(overlay.style.getPropertyValue("--baseh")).toBe(`${BLOCK_H}px`);
    expect(overlay.querySelectorAll(".astrip").length).toBe(OVERFLOW_ANIMS.length);
  });
});

describe("AT-07 TINY_PX=18 glyph chip vs zoom", () => {
  it("a sub-18px bar renders .glyph; zoom past threshold promotes to a real bar", () => {
    // 30ms anim → at pxPerSec=100 (dur=10) width=3px < 18 → glyph chip.
    const tiny = [resolved({ id: "x", channel: "scale_x" }, 1.0, 1.03)];
    const { container, rerender } = renderStrips(tiny);
    expect(container.querySelector(".astrip.glyph")).toBeTruthy();

    // zoom in: same anim wider. Drive zoom via pxPerSecOverride so 30ms → 30px > 26.
    rerender(
      <WordTrack
        words={[{ wid: 0, text: "a", s: 1, e: 3, gi: 0, li: 0, ti: 0, anims: tiny }]}
        events={events}
        dur={10}
        time={0}
        liveId={null}
        selId={0}
        selectedWords={new Set([0])}
        onSelect={() => {}}
        pxPerSecOverride={1000}
      />,
    );
    const strip = container.querySelector(".astrip") as HTMLElement;
    expect(strip.classList.contains("glyph")).toBe(false);
  });
});

// ── 5B: 2-click focus & drag-retime (through Editor) ─────────────────────────

const STACK = withResolved(baseProject(), {
  0: [resolved({ id: "g_fade", name: "fade_in", channel: "alpha", src: "tag" }, 0.5, 0.9)],
});
// Editor dur = max(8, ...word ends) + 1.5; baseProject last end = 1.2+8 = 9.2 → dur 10.7.
// Phase 4: the Editor drives WordTrack with pxPerSecOverride = BASE_PPS(68) * hz, so
// the strip-handle drag maps px↔ms at the SAME 68px/s the bars are drawn with (zoom 1).
const PXPS = 68;
const pxToMs = (px: number) => Math.round((px / PXPS) * 1000);

async function bootTimeline() {
  const user = userEvent.setup();
  render(<Editor projectName="t" onHome={() => {}} />);
  await waitFor(() => expect(FakeWS.last).toBeTruthy());
  emitState(STACK);
  await user.click(screen.getByRole("button", { name: /Timeline/i }));
  return user;
}

/** The .astrip for anim `aid` (first match) inside WordTrack. */
function stripEl(aid: string): HTMLElement {
  const el = document.querySelector(`.astrip[data-aid="${aid}"]`);
  if (!el) throw new Error(`no strip for ${aid}`);
  return el as HTMLElement;
}

describe("AT-08 1st click selects the cue", () => {
  it("clicking a strip on an unselected cue selects the cue (no focus handles)", async () => {
    const user = await bootTimeline();
    // start with a different cue selected
    await user.click(stripEl("g_fade")); // selects cue 0
    // no drag handles yet (not focused)
    expect(document.querySelector(".astrip .h")).toBeNull();
  });
});

describe("AT-09 2nd click focuses the animation", () => {
  it("clicking a strip again (cue already selected) adds .foc + drag handles", async () => {
    const user = await bootTimeline();
    await user.click(stripEl("g_fade")); // 1st: select cue
    await user.click(stripEl("g_fade")); // 2nd: focus anim
    await waitFor(() => {
      const s = document.querySelector(`.astrip[data-aid="g_fade"]`)!;
      expect(s.classList.contains("foc")).toBe(true);
      expect(s.querySelector(".h.h-l")).toBeTruthy();
      expect(s.querySelector(".h.h-r")).toBeTruthy();
    });
  });
});

describe("AT-10 drag a handle dispatches set_animation_props (+ clamp)", () => {
  it("dragging the right handle by +Δpx dispatches t1 offset = px→ms", async () => {
    const user = await bootTimeline();
    await user.click(stripEl("g_fade"));
    await user.click(stripEl("g_fade")); // focus
    await waitFor(() => expect(document.querySelector(".astrip[data-aid='g_fade'] .h-r")).toBeTruthy());
    clearDispatches();
    const rh = document.querySelector(".astrip[data-aid='g_fade'] .h-r") as HTMLElement;
    // +50px right → +50px/pxPerSec ms
    fireEvent.pointerDown(rh, { clientX: 90 });
    fireEvent.pointerMove(window, { clientX: 140 });
    fireEvent.pointerUp(window, { clientX: 140 });
    const calls = dispatchesOf("set_animation_props");
    expect(calls.length).toBe(1);
    expect(calls[0].args.anim_id).toBe("g_fade");
    expect((calls[0].args.partial as any).t1.offset).toBe(pxToMs(50));
  });

  it("clamps so the strip never shrinks below 50ms width", async () => {
    const user = await bootTimeline();
    await user.click(stripEl("g_fade"));
    await user.click(stripEl("g_fade"));
    await waitFor(() => expect(document.querySelector(".astrip[data-aid='g_fade'] .h-l")).toBeTruthy());
    clearDispatches();
    // strip is 0.5..0.9s (400ms). Drag LEFT handle right past the 50ms-from-end wall.
    const lh = document.querySelector(".astrip[data-aid='g_fade'] .h-l") as HTMLElement;
    fireEvent.pointerDown(lh, { clientX: 50 });
    fireEvent.pointerMove(window, { clientX: 200 }); // +1.5s — way past end
    fireEvent.pointerUp(window, { clientX: 200 });
    const calls = dispatchesOf("set_animation_props");
    expect(calls.length).toBe(1);
    // clamp: t0 may move at most to t1-50ms. t1=900ms → max t0=850ms; orig t0=500 → offset +350ms.
    expect((calls[0].args.partial as any).t0.offset).toBe(350);
  });
});

describe("AT-11 drag-back nets baseline (no clamp)", () => {
  it("drag right then equal drag left fires two dispatches with +d then -d", async () => {
    const user = await bootTimeline();
    await user.click(stripEl("g_fade"));
    await user.click(stripEl("g_fade"));
    await waitFor(() => expect(document.querySelector(".astrip[data-aid='g_fade'] .h-r")).toBeTruthy());
    clearDispatches();
    const rh = () => document.querySelector(".astrip[data-aid='g_fade'] .h-r") as HTMLElement;
    // Alt-held so this asserts the raw px→ms contract (a nearby snap candidate
    // would otherwise pull the edge); strip snapping is covered separately.
    // ±20px (≈294ms at 68px/s): a clean symmetric drag-back that, on the 0.4s-wide
    // anim, stays clear of the 50ms min-width clamp in both directions.
    fireEvent.pointerDown(rh(), { clientX: 90 });
    fireEvent.pointerMove(window, { clientX: 110, altKey: true });
    fireEvent.pointerUp(window, { clientX: 110, altKey: true }); // +20px
    fireEvent.pointerDown(rh(), { clientX: 110 });
    fireEvent.pointerMove(window, { clientX: 90, altKey: true });
    fireEvent.pointerUp(window, { clientX: 90, altKey: true }); // -20px
    const calls = dispatchesOf("set_animation_props");
    expect(calls.length).toBe(2);
    expect((calls[0].args.partial as any).t1.offset).toBe(pxToMs(20));
    expect((calls[1].args.partial as any).t1.offset).toBe(-pxToMs(20));
  });
});

describe("AT-12 Esc mid-drag cancels", () => {
  it("Esc during a handle drag fires no dispatch", async () => {
    const user = await bootTimeline();
    await user.click(stripEl("g_fade"));
    await user.click(stripEl("g_fade"));
    await waitFor(() => expect(document.querySelector(".astrip[data-aid='g_fade'] .h-r")).toBeTruthy());
    clearDispatches();
    const rh = document.querySelector(".astrip[data-aid='g_fade'] .h-r") as HTMLElement;
    fireEvent.pointerDown(rh, { clientX: 90 });
    fireEvent.pointerMove(window, { clientX: 140 });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerUp(window, { clientX: 140 });
    expect(dispatchesOf("set_animation_props").length).toBe(0);
  });
});

describe("AT-13 strips muted until cue hovered/selected", () => {
  it("the cue-anims wrapper carries .muted by default", () => {
    const { container } = renderStrips([resolved({ id: "x", channel: "alpha" }, 1.2, 2.8)], {
      selId: null,
      selectedWords: new Set(),
    });
    expect(container.querySelector(".cue-anims.muted")).toBeTruthy();
  });
});
