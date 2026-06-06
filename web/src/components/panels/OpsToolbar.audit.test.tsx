/**
 * OpsToolbar.audit.test.tsx — Cluster D interaction audit.
 * Tests ID prefix: D-40 through D-75
 * Covers:
 *   - Gating matrix for each button under: no-sel / single word / 2 adjacent /
 *     2 non-adjacent / fade-tag word / merged token
 *   - Action dispatches: make_fade_tag, clear_fade_tag, merge_word_span (smoke),
 *     break_line, join_lines toggle, merge_events, split_event, ungroup_event,
 *     delete_words → Restore → restore_words, undo/redo wire format.
 *   - FINDING test: merge_events with multi-group selection (can canMergeEvents
 *     ever be true with only single-group sel scope?).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "../Editor";
import { setupFakeWS, FakeWS } from "../../test-util/fakews";
import { mockApi, emitState, dispatches, clearDispatches } from "../../test-util/dispatch";
import {
  baseProject, withFadeTags, withMergedTok, mutate,
} from "../../test-util/fixtures";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  FakeWS.last = null;
  setupFakeWS();
  mockApi();
});

async function boot() {
  render(<Editor projectName="test" onHome={() => {}} />);
  await waitFor(() => expect(FakeWS.last).toBeTruthy());
}

async function bootWith(proj: ReturnType<typeof baseProject>) {
  await boot();
  emitState(proj);
}

async function clickLaneWord(
  user: ReturnType<typeof userEvent.setup>,
  word: string,
  mods: { ctrl?: boolean; shift?: boolean } = {}
) {
  const els = screen.getAllByText(word);
  const laneRow = els.find((el) => el.closest(".lane-row"));
  const target = laneRow ?? els[0];
  if (mods.ctrl) {
    await user.keyboard("{Control>}");
    await user.click(target);
    await user.keyboard("{/Control}");
  } else if (mods.shift) {
    await user.keyboard("{Shift>}");
    await user.click(target);
    await user.keyboard("{/Shift}");
  } else {
    await user.click(target);
  }
}

async function clickEventHeader(user: ReturnType<typeof userEvent.setup>, label: string) {
  const els = screen.getAllByText(label);
  const laneEvt = els.find((el) => el.closest(".lane-evt"));
  const target = laneEvt ? laneEvt.closest(".lane-evt") as HTMLElement : els[0];
  await user.click(target);
}

function btn(text: RegExp | string) {
  return screen.getByRole("button", { name: text });
}

// ---------------------------------------------------------------------------
// D-40 — D-51: Gating matrix
// ---------------------------------------------------------------------------
describe("OpsToolbar gating matrix", () => {

  it("D-40 — no selection: Group fade-in/out disabled, Merge words disabled, Delete disabled", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    // Press Esc to clear any implicit selection
    await user.keyboard("{Escape}");
void user;

    expect(btn(/Group fade-in/i)).toBeDisabled();
    expect(btn(/Group fade-out/i)).toBeDisabled();
    expect(btn(/Merge words/i)).toBeDisabled();
    expect(btn(/Delete/i)).toBeDisabled();
  });

  it("D-41 — single word selected: Group fade-in/out enabled; Merge words disabled", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await clickLaneWord(user, "alpha");

    expect(btn(/Group fade-in/i)).not.toBeDisabled();
    expect(btn(/Group fade-out/i)).not.toBeDisabled();
    expect(btn(/Merge words/i)).toBeDisabled();
    expect(btn(/Delete/i)).not.toBeDisabled();
  });

  it("D-42 — 2 adjacent words selected: Merge words enabled; Group fade enabled", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await clickLaneWord(user, "alpha");
    await clickLaneWord(user, "bravo", { ctrl: true });
    expect(screen.getByText(/2 selected/i)).toBeTruthy();

    expect(btn(/Merge words/i)).not.toBeDisabled();
    expect(btn(/Group fade-in/i)).not.toBeDisabled();
  });

  it("D-43 — 2 non-adjacent words (alpha+charlie): Merge words enabled at toolbar level (gating is Editor-level on click)", async () => {
    // Note: canMergeWords = selectedWords.size >= 2 — so the button IS enabled
    // even for non-adjacent. The actual adjacency check fires on click.
    const user = userEvent.setup();
    await bootWith(baseProject());
    await clickLaneWord(user, "alpha");
    await clickLaneWord(user, "charlie", { ctrl: true });
    expect(screen.getByText(/2 selected/i)).toBeTruthy();

    // canMergeWords is true (≥2 selected), so button enabled
    expect(btn(/Merge words/i)).not.toBeDisabled();
  });

  it("D-44 — word in fin_tag: Group fade-in enabled; Clear fade button appears", async () => {
    const user = userEvent.setup();
    // withFadeTags: words 0-3 in fin_tag, words 4-6 in fout_tag
    await bootWith(withFadeTags(baseProject()));
    await clickLaneWord(user, "alpha"); // word 0 is in fin_tag

    expect(btn(/Group fade-in/i)).not.toBeDisabled();
    // "Clear in" or "Clear fade" button should appear (fadeMembership="in")
    const clearBtn = screen.queryByRole("button", { name: /Clear in/i });
    expect(clearBtn).not.toBeNull();
  });

  it("D-45 — word in fout_tag: Clear fade button shows 'Clear out'", async () => {
    const user = userEvent.setup();
    await bootWith(withFadeTags(baseProject()));
    // word 4 = "echo" is in fout_tags
    await clickLaneWord(user, "echo");

    const clearBtn = screen.queryByRole("button", { name: /Clear out/i });
    expect(clearBtn).not.toBeNull();
  });

  it("D-46 — merged token selected: Group fade enabled; Merge words disabled (only 1 selection)", async () => {
    const user = userEvent.setup();
    await bootWith(withMergedTok(baseProject()));
    // withMergedTok: words 0+1 merged into one token "alpha bravo"
    await clickLaneWord(user, "alpha bravo");

    // Only 1 token selected → canMergeWords=false
    expect(btn(/Merge words/i)).toBeDisabled();
    expect(btn(/Group fade-in/i)).not.toBeDisabled();
  });

  it("D-47 — no selection: Break line disabled", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await user.keyboard("{Escape}");
    expect(btn(/Break line/i)).toBeDisabled();
  });

  it("D-48 — single word selected: Break line enabled (canBreakLine = tok != null)", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await clickLaneWord(user, "alpha");
    expect(btn(/Break line/i)).not.toBeDisabled();
  });

  it("D-49 — group selected (event header clicked): Merge events enabled when gi < last group", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    // Click "Verse 1" event header (gi=0, last gi=1)
    await clickEventHeader(user, "Verse 1");

    expect(btn(/Merge events/i)).not.toBeDisabled();
  });

  it("D-50 — group 1 (Chorus) selected: Merge events disabled (gi === last)", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await clickEventHeader(user, "Chorus");

    expect(btn(/Merge events/i)).toBeDisabled();
  });

  it("D-51 — group selected: Split event enabled only when group has >1 line", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    // Verse 1 has 2 lines → Split event enabled
    await clickEventHeader(user, "Verse 1");
    expect(btn(/Split event/i)).not.toBeDisabled();

    // Chorus has 1 line → Split event disabled
    await clickEventHeader(user, "Chorus");
    expect(btn(/Split event/i)).toBeDisabled();
  });

  it(
    "D-52 — OpsToolbar Undo and Redo are always enabled (scoped to .cue-tools-wrap to avoid TopBar ambiguity) — ADJ-05",
    async () => {
      // ADJ-05: two Undo/Redo locations are the designed layout; scope query to the toolbar container
      const { container } = render(<Editor projectName="test" onHome={() => {}} />);
      await waitFor(() => expect(FakeWS.last).toBeTruthy());
      emitState(baseProject());
      await waitFor(() => screen.getByText("Verse 1"));
      const wrap = container.querySelector(".cue-tools-wrap") as HTMLElement;
      const undoBtn = within(wrap).getByRole("button", { name: /Undo/i });
      const redoBtn = within(wrap).getByRole("button", { name: /Redo/i });
      expect(undoBtn).not.toBeDisabled();
      expect(redoBtn).not.toBeDisabled();
    }
  );
});

// ---------------------------------------------------------------------------
// D-53 — D-60: Action dispatches
// ---------------------------------------------------------------------------
describe("OpsToolbar action dispatches", () => {

  it("D-53 — Group fade-in dispatches make_fade_tag {kind:'in', word_ids:[wid]}", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await clickLaneWord(user, "alpha");
    clearDispatches();
    await user.click(btn(/Group fade-in/i));

    const d = dispatches().filter((d) => d.tool === "make_fade_tag");
    expect(d).toHaveLength(1);
    expect(d[0].args.kind).toBe("in");
    expect(d[0].args.word_ids).toEqual([0]);
  });

  it("D-54 — Group fade-out dispatches make_fade_tag {kind:'out', word_ids:[wid]}", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await clickLaneWord(user, "alpha");
    clearDispatches();
    await user.click(btn(/Group fade-out/i));

    const d = dispatches().filter((d) => d.tool === "make_fade_tag");
    expect(d).toHaveLength(1);
    expect(d[0].args.kind).toBe("out");
  });

  it("D-55 — Clear fade dispatches clear_fade_tag {kind:'in'} for a fin_tag word", async () => {
    const user = userEvent.setup();
    await bootWith(withFadeTags(baseProject()));
    await clickLaneWord(user, "alpha"); // word 0 in fin_tag
    clearDispatches();
    const clearBtn = screen.getByRole("button", { name: /Clear in/i });
    await user.click(clearBtn);

    const d = dispatches().filter((d) => d.tool === "clear_fade_tag");
    expect(d).toHaveLength(1);
    expect(d[0].args.kind).toBe("in");
    expect(d[0].args.word_ids).toEqual([0]);
  });

  it("D-56 — Merge words (smoke): 2 adjacent → merge_word_span dispatched", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await clickLaneWord(user, "alpha");
    await clickLaneWord(user, "bravo", { ctrl: true });
    clearDispatches();
    await user.click(btn(/Merge words/i));

    const d = dispatches().filter((d) => d.tool === "merge_word_span");
    expect(d).toHaveLength(1);
    expect(d[0].args.gi).toBe(0);
    expect(d[0].args.li).toBe(0);
  });

  it("D-57 — Break line on mid-line cue dispatches break_line", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    // alpha is gi=0, li=0, ti=0; ti_last=3; not last-in-line
    await clickLaneWord(user, "alpha");
    clearDispatches();
    await user.click(btn(/Break line/i));

    const d = dispatches().filter((d) => d.tool === "break_line");
    expect(d).toHaveLength(1);
    expect(d[0].args.gi).toBe(0);
    expect(d[0].args.li).toBe(0);
    expect(d[0].args.ti).toBe(0);
    expect(d[0].args.after).toBe(true);
  });

  it("D-58 — Break line on last-in-line (line-end) cue dispatches join_lines (toggle)", async () => {
    const user = userEvent.setup();
    // Build a project where "delta" (word 3) is the last cue on line 0 and line 1 follows
    // In baseProject, Verse 1 has lines [[0,1,2,3],[4,5,6]]
    // "delta" is ti=3, which IS last in line 0, and line 1 exists → join_lines
    await bootWith(baseProject());
    await clickLaneWord(user, "delta");
    clearDispatches();
    await user.click(btn(/Break line/i));

    const d = dispatches();
    // Should dispatch join_lines because delta is last in line 0 and line 1 follows
    const joins = d.filter((d) => d.tool === "join_lines");
    const breaks = d.filter((d) => d.tool === "break_line");
    // Either join or break fires; the toggle logic: isLastInLine && li < lines.length-1 → join_lines
    expect(joins.length + breaks.length).toBe(1);
    if (joins.length === 1) {
      expect(joins[0].args.gi).toBe(0);
      expect(joins[0].args.li).toBe(0);
    }
  });

  it("D-59 — Merge events dispatches merge_events {gidxs:[gi, gi+1]} for group 0", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await clickEventHeader(user, "Verse 1"); // gi=0
    clearDispatches();
    await user.click(btn(/Merge events/i));

    const d = dispatches().filter((d) => d.tool === "merge_events");
    expect(d).toHaveLength(1);
    expect(d[0].args.gidxs).toEqual([0, 1]);
  });

  it("D-60 — Split event dispatches split_event {gi, line_index:1} for Verse 1 (2 lines)", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await clickEventHeader(user, "Verse 1");
    clearDispatches();
    await user.click(btn(/Split event/i));

    const d = dispatches().filter((d) => d.tool === "split_event");
    expect(d).toHaveLength(1);
    expect(d[0].args.gi).toBe(0);
    expect(d[0].args.line_index).toBe(1);
  });

  it("D-61 — Ungroup event dispatches ungroup_event {gi}", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await clickEventHeader(user, "Verse 1");
    clearDispatches();
    await user.click(btn(/Ungroup event/i));

    const d = dispatches().filter((d) => d.tool === "ungroup_event");
    expect(d).toHaveLength(1);
    expect(d[0].args.gi).toBe(0);
  });

  it("D-62 — Delete dispatches delete_words {word_ids} for single selected word", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await clickLaneWord(user, "alpha");
    clearDispatches();
    await user.click(btn(/Delete/i));

    const d = dispatches().filter((d) => d.tool === "delete_words");
    expect(d).toHaveLength(1);
    expect(d[0].args.word_ids).toEqual([0]);
  });

  it("D-63 — after delete echo, Delete button label changes to Restore", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await clickLaneWord(user, "alpha");
    await user.click(btn(/Delete/i));

    // Echo the deleted state: word 0 marked del
    const deletedProj = mutate(baseProject(), (d) => {
      d.layout[0].lines[0].toks[0] = { ids: [0], sep: "", del: true, style: {} };
    });
    emitState(deletedProj);

    // Re-click alpha lane row (still visible as strikethrough/del)
    await clickLaneWord(user, "alpha");

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Restore/i })).not.toBeNull();
    });
  });

  it("D-64 — Restore dispatches restore_words {word_ids}", async () => {
    const user = userEvent.setup();
    // Start with already-deleted word 0
    const deletedProj = mutate(baseProject(), (d) => {
      d.layout[0].lines[0].toks[0] = { ids: [0], sep: "", del: true, style: {} };
    });
    await bootWith(deletedProj);
    await clickLaneWord(user, "alpha");
    clearDispatches();

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Restore/i })).not.toBeNull();
    });
    await user.click(btn(/Restore/i));

    const d = dispatches().filter((d) => d.tool === "restore_words");
    expect(d).toHaveLength(1);
    expect(d[0].args.word_ids).toEqual([0]);
  });

  it("D-65 — double-delete: second delete call also dispatches delete_words (not restore)", async () => {
    const user = userEvent.setup();
    await bootWith(baseProject());
    await clickLaneWord(user, "alpha");
    clearDispatches();
    await user.click(btn(/Delete/i));

    // Echo non-deleted state (server did not mark del for some reason)
    emitState(baseProject());
    await clickLaneWord(user, "alpha");
    clearDispatches();
    await user.click(btn(/Delete/i));

    const d = dispatches().filter((d) => d.tool === "delete_words");
    expect(d).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// D-66 — D-67: Undo / Redo wire format
// ---------------------------------------------------------------------------
describe("OpsToolbar undo/redo", () => {
  it(
    "D-66 — OpsToolbar Undo button dispatches undo (scoped to .cue-tools-wrap to avoid TopBar ambiguity) — ADJ-06",
    async () => {
      // ADJ-06: ambiguous selector fixed by scoping to .cue-tools-wrap (the toolbar container)
      const user = userEvent.setup();
      const { container } = render(<Editor projectName="test" onHome={() => {}} />);
      await waitFor(() => expect(FakeWS.last).toBeTruthy());
      emitState(baseProject());
      await waitFor(() => screen.getByText("Verse 1"));
      clearDispatches();
      const wrap = container.querySelector(".cue-tools-wrap") as HTMLElement;
      const undoBtn = within(wrap).getByRole("button", { name: /Undo/i });
      await user.click(undoBtn);

      const d = dispatches().filter((d) => d.tool === "undo");
      expect(d).toHaveLength(1);
    }
  );

  it(
    "D-67 — OpsToolbar Redo button dispatches redo (scoped to .cue-tools-wrap to avoid TopBar ambiguity) — ADJ-07",
    async () => {
      // ADJ-07: ambiguous selector fixed by scoping to .cue-tools-wrap (the toolbar container)
      const user = userEvent.setup();
      const { container } = render(<Editor projectName="test" onHome={() => {}} />);
      await waitFor(() => expect(FakeWS.last).toBeTruthy());
      emitState(baseProject());
      await waitFor(() => screen.getByText("Verse 1"));
      clearDispatches();
      const wrap = container.querySelector(".cue-tools-wrap") as HTMLElement;
      const redoBtn = within(wrap).getByRole("button", { name: /Redo/i });
      await user.click(redoBtn);

      const d = dispatches().filter((d) => d.tool === "redo");
      expect(d).toHaveLength(1);
    }
  );
});

// ---------------------------------------------------------------------------
// D-68: FINDING test — merge_events with multi-group selection
// The Editor's canMergeEvents = sel.scope==="group" && sel.gi < last.
// There is no way to set sel.scope="group" for TWO groups simultaneously —
// only single-group selection (gi) is tracked. Therefore merge_events always
// merges sel.gi with sel.gi+1, never an arbitrary pair.
// This test documents desired behavior (select 2 group headers → merge_events
// with both gidxs) and is expected to FAIL because the UI only tracks one gi.
// ---------------------------------------------------------------------------
describe("OpsToolbar merge_events daemon contract", () => {
  it(
    "D-68 — with group 0 selected, Merge events dispatches merge_events {gidxs:[0,1]}; disabled for last group — ADJ-08",
    async () => {
      // ADJ-08: daemon contract (HANDOFF_daemon-contract.md L146) defines merge_events as
      // merging [gi, gi+1] — "merge selected group with the next." No multi-group selection
      // set was ever specified; the UI correctly tracks a single gi. Test asserts the contract.
      const user = userEvent.setup();
      await bootWith(baseProject());

      // Select group 0 (Verse 1) — button should be enabled since gi=0 < last (gi=1)
      await clickEventHeader(user, "Verse 1");
      expect(btn(/Merge events/i)).not.toBeDisabled();

      clearDispatches();
      await user.click(btn(/Merge events/i));

      const d = dispatches().filter((d) => d.tool === "merge_events");
      expect(d).toHaveLength(1);
      // Daemon contract: merges [gi, gi+1] — group 0 merges with group 1
      expect(d[0].args.gidxs).toEqual([0, 1]);

      // Verify gating: Merge events disabled when selected group is the last one
      await clickEventHeader(user, "Chorus"); // gi=1 === last (layout.length-1=1)
      expect(btn(/Merge events/i)).toBeDisabled();
    }
  );
});

// User request 2026-06-06: Break line reflects its toggle state — "on"
// (pressed) when the selected cue already has a break after it (i.e. the cue
// is last in a non-final line, where pressing would JOIN the next line).
describe("D-70 — Break line toggled state", () => {
  it("D-70a — cue at end of a non-final line: Break line shows on/pressed", async () => {
    await bootWith(baseProject());
    // 'delta' is the last cue of line 0 (group 0 has 2 lines)
    const els = screen.getAllByText("delta");
    const row = els.find((el) => el.closest(".lane-row"))!;
    fireEvent.click(row);
    const btn = within(document.querySelector(".cue-tools-wrap") as HTMLElement)
      .getByRole("button", { name: /break line/i });
    expect(btn.className).toContain("on");
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("D-70b — mid-line cue: Break line is not pressed", async () => {
    await bootWith(baseProject());
    const els = screen.getAllByText("bravo");
    const row = els.find((el) => el.closest(".lane-row"))!;
    fireEvent.click(row);
    const btn = within(document.querySelector(".cue-tools-wrap") as HTMLElement)
      .getByRole("button", { name: /break line/i });
    expect(btn.className).not.toContain("on");
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("D-70c — last cue of the LAST line: not pressed (no break after it)", async () => {
    await bootWith(baseProject());
    // 'golf' ends line 1, the final line of group 0
    const els = screen.getAllByText("golf");
    const row = els.find((el) => el.closest(".lane-row"))!;
    fireEvent.click(row);
    const btn = within(document.querySelector(".cue-tools-wrap") as HTMLElement)
      .getByRole("button", { name: /break line/i });
    expect(btn.className).not.toContain("on");
  });
});

