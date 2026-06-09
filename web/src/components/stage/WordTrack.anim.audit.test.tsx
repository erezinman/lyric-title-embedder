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
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WordTrack } from "./WordTrack";
import type { TrackWord } from "./WordTrack";
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

// AT-05/AT-06 covered the inline-expand-grows-the-block model, which is REMOVED
// in this rework — the block stays a constant 55px card and expansion becomes a
// floating overlay accordion (spec §4). Re-expressed against the overlay model
// in Phase 5.
describe("AT-05 / AT-06 inline expand", () => {
  it.todo("moved to Phase 5 expand-to-overlay accordion (block height stays BLOCK_H)");
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
// wt-area is mocked 1000px wide, so pxPerSec = 1000/dur. ms = round(px / pxPerSec * 1000).
const DUR = 10.7;
const PXPS = 1000 / DUR;
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
    fireEvent.pointerDown(rh(), { clientX: 90 });
    fireEvent.pointerMove(window, { clientX: 120, altKey: true });
    fireEvent.pointerUp(window, { clientX: 120, altKey: true }); // +30px
    fireEvent.pointerDown(rh(), { clientX: 120 });
    fireEvent.pointerMove(window, { clientX: 90, altKey: true });
    fireEvent.pointerUp(window, { clientX: 90, altKey: true }); // -30px
    const calls = dispatchesOf("set_animation_props");
    expect(calls.length).toBe(2);
    expect((calls[0].args.partial as any).t1.offset).toBe(pxToMs(30));
    expect((calls[1].args.partial as any).t1.offset).toBe(-pxToMs(30));
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
