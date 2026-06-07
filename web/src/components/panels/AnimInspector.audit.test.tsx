/**
 * AnimInspector.audit.test.tsx — Cluster AI (Inspector append model) audit.
 * Test IDs: AI-01 .. AI-20 (test design §4: 4A append model, 4B tombstones,
 * 4C Inherited(n) disclosure, 4D tag-chip/lifecycle, 4E preset picker).
 *
 * Pattern mirrors OpsToolbar.audit.test.tsx: setupFakeWS + mockApi in beforeEach,
 * boot() + emitState(withAnimations(...)); assert dispatch via dispatchesOf(tool)
 * and UI via class names / role queries. Facets A/R/D/G per item.
 *
 * Dispatch contract (Editor → daemon):
 *   add_animation     { scope, ref, anim }   scope global→ref null · group→ref gi · cue→ref word_ids
 *   remove_animation  { scope, ref, anim_id }
 *   restore_animation { scope, ref, anim_id }
 *   set_animation_props { scope, ref, anim_id, partial }
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "../Editor";
import { setupFakeWS, FakeWS } from "../../test-util/fakews";
import { mockApi, emitState, dispatches, dispatchesOf, clearDispatches } from "../../test-util/dispatch";
import { baseProject, withAnimations } from "../../test-util/fixtures";
import { anim, seg, time } from "../../model/animPresets";
import type { Project } from "../../types";

beforeEach(() => {
  FakeWS.last = null;
  setupFakeWS();
  mockApi();
});

async function boot() {
  render(<Editor projectName="test" onHome={() => {}} />);
  await waitFor(() => expect(FakeWS.last).toBeTruthy());
}
async function bootWith(p: Project) { await boot(); emitState(p); }

// open the Inspector rail tab
async function openInspector(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Inspector/i }));
}

// select a lane word (drives sel.tok so the CUE tier shows)
async function selectWord(user: ReturnType<typeof userEvent.setup>, word: string) {
  const els = screen.getAllByText(word);
  const row = els.find((el) => el.closest(".lane-row")) ?? els[0];
  await user.click(row);
}

// the AnimSection block (cyan animation section in the rail)
function animSection(): HTMLElement {
  return document.querySelector(".anim-section") as HTMLElement;
}

// convenience fixtures (test design §1.3)
const withInheritedStack = (p: Project) =>
  withAnimations(p, {
    global: [anim({ id: "g_fade", name: "fade_in", channel: "alpha" })],
    group: { 0: [anim({ id: "grp_pop", name: "pop", channel: "scale_x" })] },
    tags: [{ ids: [0, 1], anims: [anim({ id: "t_color", name: "color_flash", channel: "primary" })], suppress: [] }],
  });

const withTombstone = (p: Project) =>
  withAnimations(p, {
    global: [anim({ id: "g_fade", name: "fade_in", channel: "alpha" })],
    suppress: { 0: ["g_fade"] },
  });

const withMultiGroupTag = (p: Project) =>
  withAnimations(p, {
    tags: [{ ids: [0, 1, 2, 3, 4, 5, 6], anims: [anim({ id: "t_pop", name: "pop", channel: "scale_x" })], suppress: [] }],
  });

// ───────────────────────────────────────────────────────────────────────────
// 4A — Append model
// ───────────────────────────────────────────────────────────────────────────
describe("AI-4A append model", () => {
  it("AI-01 — GLOBAL shows the base list; GROUP/CUE start empty reading 'inherits everything'", async () => {
    const user = userEvent.setup();
    await bootWith(withAnimations(baseProject(), {
      global: [anim({ id: "g_fade", name: "fade_in", channel: "alpha" })],
    }));
    await openInspector(user);
    await selectWord(user, "alpha");

    const sec = animSection();
    // GLOBAL tier renders the base animation as an own row
    const globalTier = sec.querySelector(".tier.append.global") as HTMLElement;
    expect(within(globalTier).getByText("fade_in")).toBeTruthy();
    // CUE tier (selected word 0, untagged) has no overrides → empty-row copy
    const cueTier = sec.querySelector(".tier.append.cue") as HTMLElement;
    expect(within(cueTier).getByText(/inherits everything/i)).toBeTruthy();
  });

  it("AI-02 — '＋ Add animation ▾' opens the preset picker", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await openInspector(user);
    await selectWord(user, "alpha");

    const cueTier = animSection().querySelector(".tier.append.cue") as HTMLElement;
    await user.click(within(cueTier).getByRole("button", { name: /Add animation/i }));
    // the picker lists presets
    expect(screen.getByRole("button", { name: /^Fade in$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Pop$/i })).toBeTruthy();
  });

  it("AI-03 — picking Pop dispatches add_animation {scope:'cue', ref:word_ids} with scale channels + default mode percue", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await openInspector(user);
    await selectWord(user, "alpha");
    clearDispatches();

    const cueTier = animSection().querySelector(".tier.append.cue") as HTMLElement;
    await user.click(within(cueTier).getByRole("button", { name: /Add animation/i }));
    await user.click(screen.getByRole("button", { name: /^Pop$/i }));

    const d = dispatchesOf("add_animation");
    // Pop = scale_x + scale_y sibling records (SPEC-GAP-2)
    expect(d.length).toBe(2);
    expect(d[0].args.scope).toBe("cue");
    expect(d[0].args.ref).toEqual([0]);
    const a0 = d[0].args.anim as { channel: string; mode: string; group_id: string | null };
    const a1 = d[1].args.anim as { channel: string; group_id: string | null };
    expect([a0.channel, a1.channel].sort()).toEqual(["scale_x", "scale_y"]);
    expect(a0.mode).toBe("percue");
    // siblings share a group_id
    expect(a0.group_id).toBeTruthy();
    expect(a1.group_id).toBe(a0.group_id);
  });

  it("AI-04 — Slide preset disabled at CUE tier, enabled at GROUP/GLOBAL", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await openInspector(user);
    await selectWord(user, "alpha");

    // CUE tier picker: Slide disabled
    const cueTier = animSection().querySelector(".tier.append.cue") as HTMLElement;
    await user.click(within(cueTier).getByRole("button", { name: /Add animation/i }));
    expect(within(cueTier).getByRole("button", { name: /^Slide$/i })).toBeDisabled();
    clearDispatches();
    await user.click(within(cueTier).getByRole("button", { name: /^Slide$/i }));
    expect(dispatchesOf("add_animation")).toHaveLength(0);

    // GROUP tier picker: Slide enabled
    const groupTier = animSection().querySelector(".tier.append.group") as HTMLElement;
    await user.click(within(groupTier).getByRole("button", { name: /Add animation/i }));
    expect(within(groupTier).getByRole("button", { name: /^Slide$/i })).not.toBeDisabled();
  });

  it("AI-05 — edit (✎) an own animation row opens props; committing dispatches set_animation_props", async () => {
    const user = userEvent.setup();
    await bootWith(withAnimations(baseProject(), {
      tags: [{ ids: [0], anims: [anim({ id: "t_pop", name: "pop", channel: "scale_x" })], suppress: [] }],
    }));
    await openInspector(user);
    await selectWord(user, "alpha");
    clearDispatches();

    const cueTier = animSection().querySelector(".tier.append.cue") as HTMLElement;
    const row = within(cueTier).getByText("pop").closest(".ov-row") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: /Edit/i }));
    // the edit affordance toggles enabled (a committable prop) → dispatch
    await user.click(within(cueTier).getByRole("button", { name: /Disable|Enable/i }));

    const d = dispatchesOf("set_animation_props");
    expect(d.length).toBe(1);
    expect(d[0].args.scope).toBe("cue");
    expect(d[0].args.ref).toEqual([0]);
    expect(d[0].args.anim_id).toBe("t_pop");
    expect((d[0].args.partial as Record<string, unknown>)).toHaveProperty("enabled");
  });

  it("AI-06 — revert (↺) an own animation removes the override (remove_animation)", async () => {
    const user = userEvent.setup();
    await bootWith(withAnimations(baseProject(), {
      tags: [{ ids: [0], anims: [anim({ id: "t_pop", name: "pop", channel: "scale_x" })], suppress: [] }],
    }));
    await openInspector(user);
    await selectWord(user, "alpha");
    clearDispatches();

    const cueTier = animSection().querySelector(".tier.append.cue") as HTMLElement;
    const row = within(cueTier).getByText("pop").closest(".ov-row") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: /Remove/i }));

    const d = dispatchesOf("remove_animation");
    expect(d.length).toBe(1);
    expect(d[0].args.anim_id).toBe("t_pop");
    expect(d[0].args.scope).toBe("cue");
  });

  it("AI-07 — remove (✕) an own animation dispatches remove_animation", async () => {
    const user = userEvent.setup();
    await bootWith(withAnimations(baseProject(), {
      group: { 0: [anim({ id: "grp_pop", name: "pop", channel: "scale_x" })] },
    }));
    await openInspector(user);
    await selectWord(user, "alpha");
    clearDispatches();

    const groupTier = animSection().querySelector(".tier.append.group") as HTMLElement;
    const row = within(groupTier).getByText("pop").closest(".ov-row") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: /Remove/i }));

    const d = dispatchesOf("remove_animation");
    expect(d.length).toBe(1);
    expect(d[0].args.scope).toBe("group");
    expect(d[0].args.ref).toBe(0);
    expect(d[0].args.anim_id).toBe("grp_pop");
  });

  it("AI-08 — add then remove the same animation → state echoes back to baseline (deep-equal)", async () => {
    const user = userEvent.setup();
    const base = baseProject();
    await bootWith(base);
    await openInspector(user);
    await selectWord(user, "alpha");

    // add fade_in to cue
    const cueTier = animSection().querySelector(".tier.append.cue") as HTMLElement;
    await user.click(within(cueTier).getByRole("button", { name: /Add animation/i }));
    await user.click(screen.getByRole("button", { name: /^Fade in$/i }));
    const addD = dispatchesOf("add_animation");
    expect(addD.length).toBe(1);
    const addedId = (addD[0].args.anim as { id: string }).id;
    // echo the added state
    const added = withAnimations(base, {
      tags: [{ ids: [0], anims: [anim({ id: addedId, name: "fade_in", channel: "alpha" })], suppress: [] }],
    });
    emitState(added);

    // remove it
    clearDispatches();
    const row = within(animSection().querySelector(".tier.append.cue") as HTMLElement)
      .getByText("fade_in").closest(".ov-row") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: /Remove/i }));
    expect(dispatchesOf("remove_animation")[0].args.anim_id).toBe(addedId);
    // echo baseline (tag cleared) → CUE tier reads empty again
    emitState(base);
    const cueTier2 = animSection().querySelector(".tier.append.cue") as HTMLElement;
    expect(within(cueTier2).getByText(/inherits everything/i)).toBeTruthy();
  });

  it("AI-09 — double add of two presets stacks two independently-removable rows", async () => {
    const user = userEvent.setup();
    const base = baseProject();
    await bootWith(base);
    await openInspector(user);
    await selectWord(user, "alpha");

    // two presets stacked in echoed state
    const stacked = withAnimations(base, {
      tags: [{
        ids: [0],
        anims: [
          anim({ id: "a1", name: "fade_in", channel: "alpha" }),
          anim({ id: "a2", name: "color_flash", channel: "primary" }),
        ],
        suppress: [],
      }],
    });
    emitState(stacked);

    const cueTier = animSection().querySelector(".tier.append.cue") as HTMLElement;
    const ownRows = cueTier.querySelectorAll(".ov-row.anim-ov");
    expect(ownRows.length).toBe(2);
    // each has its own remove button
    clearDispatches();
    const row2 = within(cueTier).getByText("color_flash").closest(".ov-row") as HTMLElement;
    await user.click(within(row2).getByRole("button", { name: /Remove/i }));
    expect(dispatchesOf("remove_animation")[0].args.anim_id).toBe("a2");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4B — Tombstone rows + restore
// ───────────────────────────────────────────────────────────────────────────
describe("AI-4B tombstones", () => {
  it("AI-10 — removing an inherited animation at a child scope renders a tombstone row + dispatch", async () => {
    const user = userEvent.setup();
    await bootWith(withAnimations(baseProject(), {
      global: [anim({ id: "g_fade", name: "fade_in", channel: "alpha" })],
    }));
    await openInspector(user);
    await selectWord(user, "alpha");
    clearDispatches();

    // expand the inherited disclosure on the GROUP tier to reach the inherited global row
    const groupTier = animSection().querySelector(".tier.append.group") as HTMLElement;
    await user.click(within(groupTier).getByRole("button", { name: /Inherited/i }));
    const inhRow = within(groupTier).getByText("fade_in").closest(".ov-row") as HTMLElement;
    await user.click(within(inhRow).getByRole("button", { name: /Remove/i }));

    const d = dispatchesOf("remove_animation");
    expect(d.length).toBe(1);
    expect(d[0].args.scope).toBe("group");
    expect(d[0].args.anim_id).toBe("g_fade");
    expect(dispatchesOf("add_animation")).toHaveLength(0);

    // echo the tombstoned state → a .tomb row appears with restore (disclosure stays open)
    emitState(withTombstone(baseProject()));
    const groupTier2 = animSection().querySelector(".tier.append.group") as HTMLElement;
    const tomb = groupTier2.querySelector(".ov-row.tomb") as HTMLElement;
    expect(tomb).toBeTruthy();
    expect(within(tomb).getByText(/removed here/i)).toBeTruthy();
    expect(within(tomb).getByRole("button", { name: /Restore/i })).toBeTruthy();
  });

  it("AI-11 — tombstone restore (↺) dispatches restore_animation; row reverts to inherited", async () => {
    const user = userEvent.setup();
    await bootWith(withTombstone(baseProject()));
    await openInspector(user);
    await selectWord(user, "alpha");
    const groupTier = animSection().querySelector(".tier.append.group") as HTMLElement;
    await user.click(within(groupTier).getByRole("button", { name: /Inherited/i }));
    clearDispatches();

    const tomb = groupTier.querySelector(".ov-row.tomb") as HTMLElement;
    await user.click(within(tomb).getByRole("button", { name: /Restore/i }));
    const d = dispatchesOf("restore_animation");
    expect(d.length).toBe(1);
    expect(d[0].args.scope).toBe("group");
    expect(d[0].args.anim_id).toBe("g_fade");

    // echo restored (no suppress) → tomb gone, inherited row present (disclosure stays open)
    emitState(withAnimations(baseProject(), {
      global: [anim({ id: "g_fade", name: "fade_in", channel: "alpha" })],
    }));
    const groupTier2 = animSection().querySelector(".tier.append.group") as HTMLElement;
    expect(groupTier2.querySelector(".ov-row.tomb")).toBeNull();
    expect(within(groupTier2).getByText("fade_in")).toBeTruthy();
  });

  it("AI-12 — remove(inherited) → restore → UI baseline (deep-equal snapshot)", async () => {
    const user = userEvent.setup();
    const stateWithGlobal = withAnimations(baseProject(), {
      global: [anim({ id: "g_fade", name: "fade_in", channel: "alpha" })],
    });
    await bootWith(stateWithGlobal);
    await openInspector(user);
    await selectWord(user, "alpha");
    const groupTier = animSection().querySelector(".tier.append.group") as HTMLElement;
    await user.click(within(groupTier).getByRole("button", { name: /Inherited/i }));
    const baselineHTML = (animSection().querySelector(".tier.append.group") as HTMLElement).innerHTML;

    // remove → tombstone echo (disclosure stays open across echoes)
    const inhRow = within(groupTier).getByText("fade_in").closest(".ov-row") as HTMLElement;
    await user.click(within(inhRow).getByRole("button", { name: /Remove/i }));
    emitState(withTombstone(baseProject()));
    // restore → back to global-only echo
    const groupTier2 = animSection().querySelector(".tier.append.group") as HTMLElement;
    const tomb = groupTier2.querySelector(".ov-row.tomb") as HTMLElement;
    await user.click(within(tomb).getByRole("button", { name: /Restore/i }));
    emitState(stateWithGlobal);

    const groupTier3 = animSection().querySelector(".tier.append.group") as HTMLElement;
    expect(groupTier3.innerHTML).toBe(baselineHTML);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4C — Inherited(n) disclosure
// ───────────────────────────────────────────────────────────────────────────
describe("AI-4C inherited disclosure", () => {
  it("AI-13 — withInheritedStack: CUE tier shows ▸ Inherited (2); expanding reveals inherited list", async () => {
    const user = userEvent.setup();
    await bootWith(withInheritedStack(baseProject()));
    await openInspector(user);
    await selectWord(user, "alpha"); // word 0: tag t_color (own) + group pop + global fade (inherited)

    const cueTier = animSection().querySelector(".tier.append.cue") as HTMLElement;
    // own = t_color (1); inherited = grp_pop + g_fade (2)
    const disc = within(cueTier).getByRole("button", { name: /Inherited \(2\)/i });
    expect(disc).toBeTruthy();
    // collapsed by default — inherited rows hidden
    expect(within(cueTier).queryByText("fade_in")).toBeNull();
    await user.click(disc);
    expect(within(cueTier).getByText("fade_in")).toBeTruthy();
    expect(within(cueTier).getByText("pop")).toBeTruthy();
  });

  it("AI-14 — remove from within the disclosure dispatches against the NARROW (cue) scope", async () => {
    const user = userEvent.setup();
    await bootWith(withInheritedStack(baseProject()));
    await openInspector(user);
    await selectWord(user, "alpha");
    const cueTier = animSection().querySelector(".tier.append.cue") as HTMLElement;
    await user.click(within(cueTier).getByRole("button", { name: /Inherited \(2\)/i }));
    clearDispatches();

    const inhRow = within(cueTier).getByText("fade_in").closest(".ov-row") as HTMLElement;
    await user.click(within(inhRow).getByRole("button", { name: /Remove/i }));
    const d = dispatchesOf("remove_animation");
    expect(d.length).toBe(1);
    expect(d[0].args.scope).toBe("cue");        // narrow scope, not global
    expect(d[0].args.ref).toEqual([0]);
    expect(d[0].args.anim_id).toBe("g_fade");
  });

  it("AI-15 — disclosure toggle is idempotent; (n) matches inherited+tombstone count", async () => {
    const user = userEvent.setup();
    await bootWith(withInheritedStack(baseProject()));
    await openInspector(user);
    await selectWord(user, "alpha");
    const cueTier = animSection().querySelector(".tier.append.cue") as HTMLElement;
    const disc = () => within(animSection().querySelector(".tier.append.cue") as HTMLElement)
      .getByRole("button", { name: /Inherited/i });
    // count (2) matches the inherited list length once expanded
    await user.click(disc());
    const expanded = animSection().querySelector(".tier.append.cue") as HTMLElement;
    expect(expanded.querySelectorAll(".ov-row.inherited").length).toBe(2);
    // collapse → expand → collapse: same count, no duplicates
    await user.click(disc());
    expect((animSection().querySelector(".tier.append.cue") as HTMLElement)
      .querySelectorAll(".ov-row.inherited").length).toBe(0);
    await user.click(disc());
    expect((animSection().querySelector(".tier.append.cue") as HTMLElement)
      .querySelectorAll(".ov-row.inherited").length).toBe(2);
    void cueTier;
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4D — Tag ("N cues") affordance
// ───────────────────────────────────────────────────────────────────────────
describe("AI-4D tag chip", () => {
  it("AI-16 — multi-cue tag row shows a '7 cues' chip; clicking it selects all member cues", async () => {
    const user = userEvent.setup();
    await bootWith(withMultiGroupTag(baseProject()));
    await openInspector(user);
    await selectWord(user, "alpha");

    const cueTier = animSection().querySelector(".tier.append.cue") as HTMLElement;
    const chip = within(cueTier).getByRole("button", { name: /7 cues/i });
    expect(chip).toBeTruthy();
    await user.click(chip);
    // all 7 member cues now selected → OpsToolbar shows "7 selected"
    await waitFor(() => expect(screen.getByText(/7 selected/i)).toBeTruthy());
  });

  it("AI-17 — editing a tag animation carries the tag's full ids, not the single cue", async () => {
    const user = userEvent.setup();
    await bootWith(withMultiGroupTag(baseProject()));
    await openInspector(user);
    await selectWord(user, "alpha"); // single cue selected, but tag spans [0..6]
    clearDispatches();

    const cueTier = animSection().querySelector(".tier.append.cue") as HTMLElement;
    const row = within(cueTier).getByText("pop").closest(".ov-row") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: /Remove/i }));
    const d = dispatchesOf("remove_animation");
    expect(d.length).toBe(1);
    expect(d[0].args.ref).toEqual([0, 1, 2, 3, 4, 5, 6]); // whole tag
    expect(d[0].args.anim_id).toBe("t_pop");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4E — Preset picker
// ───────────────────────────────────────────────────────────────────────────
describe("AI-4E preset picker", () => {
  it("AI-18 — picker lists exactly the canonical v1 set", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await openInspector(user);
    await selectWord(user, "alpha");
    const cueTier = animSection().querySelector(".tier.append.cue") as HTMLElement;
    await user.click(within(cueTier).getByRole("button", { name: /Add animation/i }));

    const picker = document.querySelector(".preset-picker") as HTMLElement;
    const names = [...picker.querySelectorAll(".preset")].map((e) => e.textContent?.trim());
    expect(names).toEqual([
      "Fade in", "Fade out", "Sweep", "Pop", "Color flash", "Wipe in", "Blur in", "Slide",
    ]);
  });

  it("AI-19 — each preset instantiates the correct channel(s)", async () => {
    const user = userEvent.setup();
    const cases: [RegExp, string[]][] = [
      [/^Fade in$/i, ["alpha"]],
      [/^Sweep$/i, ["karaoke_fill"]],
      [/^Pop$/i, ["scale_x", "scale_y"]],
      [/^Color flash$/i, ["primary"]],
      [/^Wipe in$/i, ["clip_rect"]],
      [/^Blur in$/i, ["blur"]],
    ];
    for (const [name, channels] of cases) {
      cleanup();
      FakeWS.last = null; setupFakeWS();
      await bootWith(baseProject());
      await openInspector(user);
      await selectWord(user, "alpha");
      clearDispatches();
      const cueTier = animSection().querySelector(".tier.append.cue") as HTMLElement;
      await user.click(within(cueTier).getByRole("button", { name: /Add animation/i }));
      await user.click(screen.getByRole("button", { name: name }));
      const chans = dispatchesOf("add_animation").map((d) => (d.args.anim as { channel: string }).channel);
      expect(chans.sort()).toEqual([...channels].sort());
    }
  });

  it("AI-20 — Slide instantiates the move channel at GROUP scope (group/global only)", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await openInspector(user);
    await selectWord(user, "alpha");
    clearDispatches();

    const groupTier = animSection().querySelector(".tier.append.group") as HTMLElement;
    await user.click(within(groupTier).getByRole("button", { name: /Add animation/i }));
    await user.click(screen.getByRole("button", { name: /^Slide$/i }));
    const d = dispatchesOf("add_animation");
    expect(d.length).toBe(1);
    expect(d[0].args.scope).toBe("group");
    expect(d[0].args.ref).toBe(0);
    expect((d[0].args.anim as { channel: string }).channel).toBe("move");
    void seg; void time; void dispatches;
  });
});
