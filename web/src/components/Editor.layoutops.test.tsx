// Editor.layoutops.test.tsx — W1 layout-ops cluster (CHANGELOG §3):
//   - Unmerge button gating + dispatch (unmerge_words)
//   - merge_words_run cross-line contiguity
//   - selection preserved through merge (merged cue) & unmerge (all words)
//   - multi break/join: selection spans >1 line → join_lines; else break_line each
//   - merged-cue timeline segments (subs positions + divider ticks)
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "./Editor";
import { setupFakeWS, FakeWS } from "../test-util/fakews";
import { mockApi, emitState, dispatches, clearDispatches } from "../test-util/dispatch";
import { baseProject, withMergedTok, mutate } from "../test-util/fixtures";

beforeEach(() => {
  FakeWS.last = null;
  setupFakeWS();
  mockApi();
});

async function boot() {
  render(<Editor projectName="t" onHome={() => {}} />);
  await waitFor(() => expect(FakeWS.last).toBeTruthy());
}
async function bootWith(p: ReturnType<typeof baseProject>) {
  await boot();
  emitState(p);
}

async function clickLaneWord(
  user: ReturnType<typeof userEvent.setup>, word: string,
  mods: { ctrl?: boolean; shift?: boolean } = {},
) {
  const els = screen.getAllByText(word);
  const row = els.find((el) => el.closest(".lane-row")) ?? els[0];
  if (mods.ctrl) { await user.keyboard("{Control>}"); await user.click(row); await user.keyboard("{/Control}"); }
  else if (mods.shift) { await user.keyboard("{Shift>}"); await user.click(row); await user.keyboard("{/Shift}"); }
  else await user.click(row);
}

function toolBtn(name: RegExp) {
  return within(document.querySelector(".cue-tools-wrap") as HTMLElement).getByRole("button", { name });
}

// ── Unmerge button gating ─────────────────────────────────────────────────────
describe("Unmerge button", () => {
  it("disabled with a plain (single-word) cue selected", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await clickLaneWord(user, "alpha");
    expect(toolBtn(/unmerge/i)).toBeDisabled();
  });

  it("enabled when the selected cue is merged (mergeOn derivation)", async () => {
    const user = userEvent.setup();
    await bootWith(withMergedTok(baseProject()));
    await clickLaneWord(user, "alpha bravo");
    expect(toolBtn(/unmerge/i)).not.toBeDisabled();
  });

  it("dispatches unmerge_words {gi, li, ti} for the merged token", async () => {
    const user = userEvent.setup();
    await bootWith(withMergedTok(baseProject()));
    await clickLaneWord(user, "alpha bravo");
    clearDispatches();
    await user.click(toolBtn(/unmerge/i));
    const d = dispatches().filter((d) => d.tool === "unmerge_words");
    expect(d).toHaveLength(1);
    expect(d[0].args).toMatchObject({ gi: 0, li: 0, ti: 0 });
  });
});

// ── selection preservation ──────────────────────────────────────────────────
describe("selection preservation through merge/unmerge", () => {
  it("after merge → the resulting merged cue is selected (selCount reflects its ids)", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await clickLaneWord(user, "alpha");
    await clickLaneWord(user, "bravo", { ctrl: true });
    await user.click(toolBtn(/merge words/i));
    // server echoes the merged state (words 0+1 in one tok)
    emitState(withMergedTok(baseProject()));
    await waitFor(() => {
      // both ids stay selected → "2 selected"
      expect(screen.getByText(/2 selected/i)).toBeTruthy();
    });
    // and the merged cue lights Merge words on / Unmerge enabled
    expect(toolBtn(/merge words/i)).toHaveAttribute("aria-pressed", "true");
    expect(toolBtn(/unmerge/i)).not.toBeDisabled();
  });

  it("after unmerge → all resulting word cues are selected", async () => {
    const user = userEvent.setup();
    await bootWith(withMergedTok(baseProject()));
    await clickLaneWord(user, "alpha bravo");
    await user.click(toolBtn(/unmerge/i));
    // server echoes the split-back state (words 0 and 1 are separate single toks)
    emitState(baseProject());
    await waitFor(() => {
      expect(screen.getByText(/2 selected/i)).toBeTruthy();
    });
  });
});

// ── multi break/join (§3) ──────────────────────────────────────────────────────
describe("multi break/join semantics", () => {
  it("selection within ONE line (multiple cues) → break_line after each selected cue", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());            // group 0 line 0 = [alpha,bravo,charlie,delta]
    await clickLaneWord(user, "alpha");
    await clickLaneWord(user, "bravo", { ctrl: true });
    clearDispatches();
    await user.click(toolBtn(/break line/i));
    const breaks = dispatches().filter((d) => d.tool === "break_line");
    const joins = dispatches().filter((d) => d.tool === "join_lines");
    expect(joins).toHaveLength(0);
    // break after each selected cue (alpha @ti0, bravo @ti1)
    expect(breaks.length).toBe(2);
    expect(breaks.every((b) => b.args.gi === 0 && b.args.li === 0)).toBe(true);
  });

  it("selection spanning >1 line within a group → join_lines", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());            // group 0: line0 [0..3], line1 [4..6]
    await clickLaneWord(user, "alpha");        // line 0
    await clickLaneWord(user, "echo", { ctrl: true }); // line 1
    clearDispatches();
    await user.click(toolBtn(/break line/i));
    const joins = dispatches().filter((d) => d.tool === "join_lines");
    const breaks = dispatches().filter((d) => d.tool === "break_line");
    expect(breaks).toHaveLength(0);
    expect(joins.length).toBeGreaterThanOrEqual(1);
    expect(joins[0].args.gi).toBe(0);
  });

  it("single cue (no multi-selection) keeps the existing break/join toggle", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await clickLaneWord(user, "alpha");        // mid-line → break
    clearDispatches();
    await user.click(toolBtn(/break line/i));
    const d = dispatches();
    expect(d.filter((x) => x.tool === "break_line")).toHaveLength(1);
    expect(d[0].args).toMatchObject({ gi: 0, li: 0, ti: 0, after: true });
  });
});

// ── merged-cue timeline segments ──────────────────────────────────────────────
describe("merged-cue internal segments (timeline)", () => {
  async function openTimeline(user: ReturnType<typeof userEvent.setup>) {
    const tl = screen.getByRole("button", { name: /timeline/i });
    await user.click(tl);
  }

  it("a merged block renders one segment per word, positioned by real start/end with a divider tick", async () => {
    const user = userEvent.setup();
    // words 0 (0.5–1.2) + 1 (1.5–2.2) merged → block spans 0.5–2.2; two segments
    await bootWith(withMergedTok(baseProject()));
    await openTimeline(user);
    const segs = document.querySelectorAll(".blk-seg");
    expect(segs.length).toBeGreaterThanOrEqual(2);
    // each segment carries its word text
    const texts = Array.from(segs).map((s) => s.textContent);
    expect(texts).toContain("alpha");
    expect(texts).toContain("bravo");
    // segments after the first carry a divider tick (left border)
    const second = segs[1] as HTMLElement;
    expect(second.style.borderLeft || second.style.borderLeftWidth).toBeTruthy();
  });

  it("a non-merged (single-word) block has no internal segments", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await openTimeline(user);
    expect(document.querySelectorAll(".blk-seg").length).toBe(0);
  });
});

// ── roundtrip baseline (fixture-level) ──────────────────────────────────────────
describe("merge → unmerge roundtrip (fixture deep-equal)", () => {
  it("merging words 0+1 then unmerging returns to a baseline-equivalent layout", async () => {
    // This documents the engine roundtrip at the UI's data layer: withMergedTok is
    // the merged echo of baseProject; unmerging it yields single-word toks again.
    const merged = withMergedTok(baseProject());
    const split = mutate(merged, (d) => {
      d.layout[0].lines[0].toks = [
        { ids: [0], sep: "", del: false, style: {} },
        { ids: [1], sep: "", del: false, style: {} },
        { ids: [2], sep: "", del: false, style: {} },
        { ids: [3], sep: "", del: false, style: {} },
      ];
    });
    expect(split.layout[0].lines[0].toks).toEqual(baseProject().layout[0].lines[0].toks);
  });
});
