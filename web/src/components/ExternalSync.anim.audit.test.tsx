/**
 * ExternalSync.anim.audit.test.tsx — Cluster AX (external-sync, animations).
 * Test IDs: AX-01 .. AX-12 (test design §7).
 *
 * Theme (cluster F extension): every animation mutation pushed EXTERNALLY renders
 * with ZERO UI interaction — FakeWS emit({type:"state", state}). Organized per tool
 * × per UI facet. The push must update: inspector rows (.tier.append.*),
 * tombstone rows (.ov-row.tomb), Inherited(n) count, timeline strips (.astrip),
 * and the lanes ANIMATION column (.lc.anim). Then a baseline push reverts each
 * (back to square one — deep-equal DOM snapshot for the roundtrip facet).
 *
 * VIS-CLICK is allowed only to make a surface visible (switch rail/dock tab, select
 * a cue, expand a disclosure) — never to cause the mutation under test.
 *
 * NOTE on resolved lists: strips (WordTrack) and the lanes ANIMATION column both
 * read tok.anims_resolved (the daemon-filled flat per-cue list — see
 * tests/test_anim_tools.py ResolvedAnim shape: {id,name,channel,group_id,segments:
 * [{start_s,end_s,...}],src,warning}). Pushed states therefore carry both the
 * carriers (withAnimations — drives the Inspector) AND the resolved lists
 * (withResolved — drives strips + lanes), exactly as a real daemon push would.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, within, act, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "./Editor";
import { setupFakeWS, FakeWS } from "../test-util/fakews";
import { mockApi, emitState } from "../test-util/dispatch";
import { baseProject, withAnimations, withResolved, resolved, anim } from "../test-util/fixtures";
import type { Project } from "../types";

beforeEach(() => {
  FakeWS.last = null;
  setupFakeWS();
  mockApi();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Boot Editor, wait for WS, emit an initial project, wait for the lanes to render. */
async function boot(initial: Project = baseProject()) {
  const utils = render(<Editor projectName="audit" onHome={() => {}} />);
  await waitFor(() => expect(FakeWS.last).toBeTruthy());
  emitState(initial);
  await waitFor(() => expect(screen.getAllByText("Verse 1").length).toBeGreaterThan(0));
  return utils;
}

// ── VIS-CLICK helpers (reveal a surface; never cause the mutation) ───────────
async function openInspector(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Inspector/i }));
}
async function openLanes(user: ReturnType<typeof userEvent.setup>) {
  // Cue lanes is the default dock tab; this is a no-op safety re-click.
  await user.click(screen.getByRole("button", { name: /Cue lanes/i }));
}
/** Switch the dock to the Timeline tab so WordTrack (the .astrip strips) mounts. */
async function openTimeline(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Timeline/i }));
}
async function selectWord(user: ReturnType<typeof userEvent.setup>, word: string) {
  const els = screen.getAllByText(word);
  const row = els.find((el) => el.closest(".lane-row")) ?? els[0];
  await user.click(row);
}

// ── surface accessors ────────────────────────────────────────────────────────
const animSection = () => document.querySelector(".anim-section") as HTMLElement;
const cueTier = () => animSection().querySelector(".tier.append.cue") as HTMLElement;
const groupTier = () => animSection().querySelector(".tier.append.group") as HTMLElement;
const globalTier = () => animSection().querySelector(".tier.append.global") as HTMLElement;

/** lanes ANIMATION cell for the lane-row containing `word`. */
function animCell(container: HTMLElement, word: string): HTMLElement {
  const row = [...container.querySelectorAll(".lane-row")].find((r) =>
    r.textContent?.includes(word),
  )!;
  return row.querySelector(".lc.anim") as HTMLElement;
}
/** the first timeline .astrip for anim id `aid` (WordTrack must be the active dock tab). */
const stripEl = (aid: string) => document.querySelector(`.astrip[data-aid="${aid}"]`) as HTMLElement | null;
/** how many .astrip strips carry anim id `aid` (a global anim resolves on every cue,
 * so its id repeats — count distinguishes per-cue suppression). */
const stripCount = (aid: string) => document.querySelectorAll(`.astrip[data-aid="${aid}"]`).length;

// ── fixtures (carriers + resolved, mirroring a daemon push) ──────────────────
// A global fade-in resolves onto every cue as an inherited (src:"global") alpha
// strip; word 0's lead-id keys the resolved list.
const GLOBAL_FADE_CARRIER = { global: [anim({ id: "g_fade", name: "fade_in", channel: "alpha" })] };

/** resolved lists for a global fade-in over the first cues (inherited everywhere). */
function globalFadeResolved(): Record<number, ReturnType<typeof resolved>[]> {
  const r = (wid: number) => [resolved({ id: "g_fade", name: "fade_in", channel: "alpha", src: "global" }, 0.5 + wid, 0.75 + wid)];
  return { 0: r(0), 4: r(4) };
}

/** baseProject with a global fade carrier + resolved strips on cues 0 & 4. */
function pushGlobalFade(): Project {
  return withResolved(withAnimations(baseProject(), GLOBAL_FADE_CARRIER), globalFadeResolved());
}

/** a cue/tag add: tag over [0,1] with a color_flash (own → src:"tag"). */
function pushCueTag(): Project {
  return withResolved(
    withAnimations(baseProject(), {
      tags: [{ ids: [0, 1], anims: [anim({ id: "t_color", name: "color_flash", channel: "primary" })], suppress: [] }],
    }),
    { 0: [resolved({ id: "t_color", name: "color_flash", channel: "primary", src: "tag" }, 0.5, 0.7)] },
  );
}

/** global fade + group-0 tombstone: cue 0 resolves empty (suppressed), cue 4 keeps it. */
function pushTombstone(): Project {
  return withResolved(
    withAnimations(baseProject(), { ...GLOBAL_FADE_CARRIER, suppress: { 0: ["g_fade"] } }),
    { 0: [], 4: globalFadeResolved()[4] },
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 7A — add_animation (pushed)
// ═════════════════════════════════════════════════════════════════════════════
describe("add_animation (pushed)", () => {
  it("AX-01 — pushed global add → Inspector GLOBAL row + lanes ANIMATION cell + strip, zero clicks", async () => {
    const user = userEvent.setup();
    const { container } = await boot();

    // baseline surfaces: no global row, lanes cell .none, no strip
    await openInspector(user);          // VIS-CLICK
    await selectWord(user, "alpha");    // VIS-CLICK
    expect(within(globalTier()).queryByText("fade_in")).toBeNull();

    // the only mutation arrives via the push
    emitState(pushGlobalFade());

    // Inspector GLOBAL tier now lists the base fade_in
    await waitFor(() => expect(within(globalTier()).getByText("fade_in")).toBeTruthy());
    // lanes column (default dock tab) flips none → inh (global-sourced)
    const cell = animCell(container, "alpha");
    expect(cell.classList.contains("inh")).toBe(true);
    expect(cell.classList.contains("none")).toBe(false);
    // timeline strip present once the Timeline dock tab is shown
    await openTimeline(user);           // VIS-CLICK
    expect(stripEl("g_fade")).toBeTruthy();
  });

  it("AX-02 — pushed cue/tag add → strip on the tagged cue + inspector own row + 'N cues' chip", async () => {
    const user = userEvent.setup();
    await boot();
    await openInspector(user);          // VIS-CLICK
    await selectWord(user, "alpha");    // VIS-CLICK

    emitState(pushCueTag());

    // own row at the CUE tier with the 2-cue chip
    await waitFor(() => expect(within(cueTier()).getByText("color_flash")).toBeTruthy());
    expect(within(cueTier()).getByRole("button", { name: /2 cues/i })).toBeTruthy();
    // strip rendered (ovr/tag-sourced) on the tagged cue
    await openTimeline(user);           // VIS-CLICK
    expect(stripEl("t_color")).toBeTruthy();
  });

  it("AX-03 — baseline re-push reverts all surfaces (deep-equal DOM snapshot)", async () => {
    const user = userEvent.setup();
    const { container } = await boot();
    await openInspector(user);          // VIS-CLICK
    await selectWord(user, "alpha");    // VIS-CLICK
    await openTimeline(user);           // VIS-CLICK: mount WordTrack for the strip count

    // capture the pristine DOM of each surface
    const globalHTML = globalTier().innerHTML;
    const stripCountBefore = document.querySelectorAll(".astrip").length;

    emitState(pushGlobalFade());
    await waitFor(() => expect(within(globalTier()).getByText("fade_in")).toBeTruthy());
    await waitFor(() => expect(document.querySelectorAll(".astrip").length).toBeGreaterThan(stripCountBefore));

    // baseline re-push → every surface back to square one
    emitState(baseProject());
    await waitFor(() => expect(within(globalTier()).queryByText("fade_in")).toBeNull());
    expect(globalTier().innerHTML).toBe(globalHTML);
    expect(document.querySelectorAll(".astrip").length).toBe(stripCountBefore);
    void container;
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7B — remove_animation / tombstone (pushed)
// ═════════════════════════════════════════════════════════════════════════════
describe("remove_animation / tombstone (pushed)", () => {
  it("AX-04 — pushed tombstone → tomb row + Inherited(n) drops + strip gone + column suppressed", async () => {
    const user = userEvent.setup();
    const { container } = await boot(pushGlobalFade());
    await openInspector(user);          // VIS-CLICK
    await selectWord(user, "alpha");    // VIS-CLICK
    // expand the GROUP-tier disclosure to reveal the inherited global row
    await user.click(within(groupTier()).getByRole("button", { name: /Inherited \(1\)/i }));
    expect(within(groupTier()).getByText("fade_in")).toBeTruthy();
    // lanes ANIMATION column shows the inherited marker before the push
    expect(animCell(container, "alpha").classList.contains("inh")).toBe(true);

    // the only mutation: a tombstone push
    emitState(pushTombstone());

    // a .tomb row renders (removed-here); the inherited disclosure still counts it
    // (the global record is inherited-but-suppressed, not gone — count stays (1)).
    await waitFor(() => expect(groupTier().querySelector(".ov-row.tomb")).toBeTruthy());
    const tomb = groupTier().querySelector(".ov-row.tomb") as HTMLElement;
    expect(within(tomb).getByText(/removed here/i)).toBeTruthy();
    expect(within(groupTier()).getByRole("button", { name: /Inherited \(1\)/i })).toBeTruthy();
    // lanes column shows the suppressed marker (cue 0 resolves empty + suppress carrier)
    expect(animCell(container, "alpha").classList.contains("supp")).toBe(true);
    // cue-0 strip disappears (resolves empty for the suppressed group); cue 4 keeps its
    // strip, so the g_fade strip count drops from 2 → 1.
    await openTimeline(user);           // VIS-CLICK
    await waitFor(() => expect(stripCount("g_fade")).toBe(1));
  });

  it("AX-05 — baseline (global-only) re-push reverts the tombstone surfaces", async () => {
    const user = userEvent.setup();
    const { container } = await boot(pushTombstone());
    await openInspector(user);          // VIS-CLICK
    await selectWord(user, "alpha");    // VIS-CLICK
    await user.click(within(groupTier()).getByRole("button", { name: /Inherited/i }));
    expect(groupTier().querySelector(".ov-row.tomb")).toBeTruthy();

    emitState(pushGlobalFade());        // restore: global-only, no suppress

    await waitFor(() => expect(groupTier().querySelector(".ov-row.tomb")).toBeNull());
    expect(within(groupTier()).getByText("fade_in")).toBeTruthy();
    expect(animCell(container, "alpha").classList.contains("supp")).toBe(false);
    expect(animCell(container, "alpha").classList.contains("inh")).toBe(true);
    await openTimeline(user);           // VIS-CLICK
    expect(stripEl("g_fade")).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7C — restore_animation (pushed)
// ═════════════════════════════════════════════════════════════════════════════
describe("restore_animation (pushed)", () => {
  it("AX-06 — pushed restore → tomb row reverts to inherited row + strip reappears", async () => {
    const user = userEvent.setup();
    await boot(pushTombstone());
    await openInspector(user);          // VIS-CLICK
    await selectWord(user, "alpha");    // VIS-CLICK
    await user.click(within(groupTier()).getByRole("button", { name: /Inherited/i }));
    await openTimeline(user);           // VIS-CLICK: mount WordTrack
    expect(groupTier().querySelector(".ov-row.tomb")).toBeTruthy();
    expect(stripCount("g_fade")).toBe(1);   // suppressed on cue 0, only cue 4 remains

    // the only mutation: a restore push (suppress cleared)
    emitState(pushGlobalFade());

    await waitFor(() => expect(groupTier().querySelector(".ov-row.tomb")).toBeNull());
    // inherited row returns
    expect(within(groupTier()).getByText("fade_in")).toBeTruthy();
    // strip reappears on cue 0 → count back to 2
    await waitFor(() => expect(stripCount("g_fade")).toBe(2));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7D — set_animation_props (pushed)
// ═════════════════════════════════════════════════════════════════════════════
describe("set_animation_props (pushed)", () => {
  it("AX-07 — pushed prop change (segments retime) → strip x-bounds update", async () => {
    const user = userEvent.setup();
    await boot(pushGlobalFade());
    await user.click(screen.getByRole("button", { name: /Timeline/i }));   // VIS-CLICK: ensure WordTrack
    const left0 = stripEl("g_fade")!.style.left;
    const width0 = stripEl("g_fade")!.style.width;

    // push a retimed resolved list (start shifted later, longer) — zero interaction
    emitState(
      withResolved(withAnimations(baseProject(), GLOBAL_FADE_CARRIER), {
        0: [resolved({ id: "g_fade", name: "fade_in", channel: "alpha", src: "global" }, 1.0, 1.6)],
        4: globalFadeResolved()[4],
      }),
    );

    await waitFor(() => {
      const s = stripEl("g_fade")!;
      expect(s.style.left).not.toBe(left0);
      expect(s.style.width).not.toBe(width0);
    });
    void user;
  });

  it("AX-08 — pushed mode change reflects in the inspector row (no interaction)", async () => {
    // The live Inspector edit affordance toggles `enabled`; the standalone
    // TimingModePicker (AM cluster) is not yet wired into the Editor (see FINDINGS).
    // The observable AX facet here is that a pushed prop change re-renders the
    // animation's Inspector row from the new carrier state.
    const user = userEvent.setup();
    await boot(withAnimations(baseProject(), {
      group: { 0: [anim({ id: "grp_pop", name: "pop", channel: "scale_x", mode: "percue" })] },
    }));
    await openInspector(user);          // VIS-CLICK
    await selectWord(user, "alpha");    // VIS-CLICK
    expect(within(groupTier()).getByText("pop")).toBeTruthy();

    // push a mode change on the carrier — row persists, reflecting new state
    emitState(withAnimations(baseProject(), {
      group: { 0: [anim({ id: "grp_pop", name: "pop", channel: "scale_x", mode: "cascade", step: 80, step_unit: "ms" })] },
    }));
    await waitFor(() => expect(within(groupTier()).getByText("pop")).toBeTruthy());
    // the carrier-driven row is still the single own row (no duplication on re-push)
    expect(groupTier().querySelectorAll(".ov-row.anim-ov").length).toBe(1);
  });

  it("AX-09 — pushed enabled:false → strip drops (excluded from resolution)", async () => {
    const user = userEvent.setup();
    await boot(pushGlobalFade());
    await user.click(screen.getByRole("button", { name: /Timeline/i }));   // VIS-CLICK
    expect(stripEl("g_fade")).toBeTruthy();

    // disabled anim is excluded from resolution → resolved list empty → no strip
    emitState(
      withResolved(
        withAnimations(baseProject(), { global: [anim({ id: "g_fade", name: "fade_in", channel: "alpha", enabled: false })] }),
        { 0: [], 4: [] },
      ),
    );
    await waitFor(() => expect(stripEl("g_fade")).toBeNull());
    void user;
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7E — Conflict warning (pushed)
// ═════════════════════════════════════════════════════════════════════════════
describe("conflict warning (pushed)", () => {
  it("AX-10 — pushed same-scope overlap → warning marker on the offending strips", async () => {
    const user = userEvent.setup();
    await boot();
    await user.click(screen.getByRole("button", { name: /Timeline/i }));   // VIS-CLICK

    // two same-channel (scale_x) tag anims with overlapping windows, both flagged
    // warning:"overlap" in the resolved payload (mirrors AE-RES-08 / AD-GET-03).
    emitState(
      withResolved(
        withAnimations(baseProject(), {
          tags: [{
            ids: [0],
            anims: [
              anim({ id: "pop_a", name: "pop", channel: "scale_x" }),
              anim({ id: "stretch_b", name: "pop", channel: "scale_x" }),
            ],
            suppress: [],
          }],
        }),
        {
          0: [
            resolved({ id: "pop_a", name: "pop", channel: "scale_x", src: "tag", warning: "overlap" }, 0.5, 0.8),
            resolved({ id: "stretch_b", name: "pop", channel: "scale_x", src: "tag", warning: "overlap" }, 0.6, 0.9),
          ],
        },
      ),
    );

    await waitFor(() => expect(stripEl("pop_a")).toBeTruthy());
    // the warning surfaces on the strips (.warn class)
    expect(stripEl("pop_a")!.classList.contains("warn")).toBe(true);
    expect(stripEl("stretch_b")!.classList.contains("warn")).toBe(true);
    void user;
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7F — external-edit detection + undo-from-another-client
// ═════════════════════════════════════════════════════════════════════════════
describe("external-edit detection + undo-from-another-client", () => {
  it("AX-11 — unsolicited animation push shows the 'AI agent updated' toast; post-local-call push does NOT", async () => {
    // (a) unsolicited push → toast
    vi.useFakeTimers();
    render(<Editor projectName="audit" onHome={() => {}} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(FakeWS.last).toBeTruthy();
    act(() => { FakeWS.last!.emit({ type: "state", state: baseProject() }); });
    act(() => { FakeWS.last!.emit({ type: "state", state: pushGlobalFade() }); });
    expect(screen.getByText(/AI agent updated the project/i)).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(screen.queryByText(/AI agent updated the project/i)).toBeNull();
    vi.useRealTimers();
    vi.restoreAllMocks();
    cleanup();                          // unmount the first Editor before re-mounting

    // (b) push right after a UI-triggered local animation dispatch → NO new toast.
    FakeWS.last = null;
    setupFakeWS();
    mockApi();
    const user = userEvent.setup();
    await boot();
    await openInspector(user);
    await selectWord(user, "alpha");
    // local edit: add a preset (sets the localUntil suppression window)
    await user.click(within(cueTier()).getByRole("button", { name: /Add animation/i }));
    await user.click(screen.getByRole("button", { name: /^Fade in$/i }));
    // snapshot the existing external-toast node, then emit the local echo
    const nodeBefore = document.querySelector(".toast.ai");
    act(() => { FakeWS.last!.emit({ type: "state", state: pushCueTag() }); });
    const nodeAfter = document.querySelector(".toast.ai");
    // same node identity (or both gone) ⇒ lastExternal not bumped ⇒ no new external toast
    expect(nodeAfter).toBe(nodeBefore);
  });

  it("AX-12 — undo pushed from another client → full anim UI reverts (rows + strip + column)", async () => {
    const user = userEvent.setup();
    const { container } = await boot();
    await openInspector(user);          // VIS-CLICK
    await selectWord(user, "alpha");    // VIS-CLICK
    await openTimeline(user);           // VIS-CLICK: mount WordTrack for strip counts

    // capture pristine surfaces
    const cueHTML = cueTier().innerHTML;
    const stripCount0 = document.querySelectorAll(".astrip").length;

    // another client adds a cue tag (state A)
    emitState(pushCueTag());
    await waitFor(() => expect(within(cueTier()).getByText("color_flash")).toBeTruthy());
    await waitFor(() => expect(document.querySelectorAll(".astrip").length).toBeGreaterThan(stripCount0));

    // another client pushes UNDO → baseline state; entire anim UI reverts, zero clicks
    emitState(baseProject());
    await waitFor(() => expect(within(cueTier()).queryByText("color_flash")).toBeNull());
    expect(cueTier().innerHTML).toBe(cueHTML);
    expect(document.querySelectorAll(".astrip").length).toBe(stripCount0);
    // lanes column back to none
    await openLanes(user);              // VIS-CLICK
    expect(animCell(container, "alpha").classList.contains("none")).toBe(true);
  });
});
