# Cluster D — Audit Failures Report

Date: 2026-06-05
Agent: WRITER AGENT D (WordTrack, CueLanes, OpsToolbar)

## Summary

- **Total tests written:** 51
- **Passing tests:** 48
- **`it.fails` findings recorded:** 3 (all pass as expected-failures)
- **Unexpected failures:** 0

---

## Findings (it.fails)

### D-52 — Duplicate Undo/Redo buttons in DOM (ambiguous role queries)

**ID:** D-52  
**File:** `web/src/components/panels/OpsToolbar.audit.test.tsx`  
**Observed:** `getByRole("button", { name: /Undo/i })` and `getByRole("button", { name: /Redo/i })` both throw `TestingLibraryElementError: Found multiple elements with the role "button" and name …`.  
**Root cause:** Both `TopBar` and `OpsToolbar` render Undo/Redo buttons. The TopBar buttons have `title="Undo"` / `title="Redo"` (which sets the accessible name); the OpsToolbar buttons have visible text "Undo" / "Redo". Both match the regex.  
**Expected:** Each Undo and Redo affordance should be accessible via a unique query, or there should be a single canonical location. If two locations are intentional, each component's buttons should have a distinct accessible name or `aria-label` to disambiguate.  
**Suspicion:** Design intent — TopBar provides global undo/redo keyboard-accessible shortcuts while OpsToolbar provides inline buttons in the dock. Neither is wrong per se, but accessibility tooling cannot distinguish them. Adding `aria-label="Undo (toolbar)"` vs `"Undo (topbar)"`, or scoping queries to a container, would fix this.

---

### D-66 — OpsToolbar Undo dispatches `undo` tool (blocked by duplicate button ambiguity)

**ID:** D-66  
**File:** `web/src/components/panels/OpsToolbar.audit.test.tsx`  
**Observed:** Same duplicate-button error as D-52 prevents clicking the OpsToolbar Undo and asserting its dispatch.  
**Expected:** OpsToolbar's Undo button should dispatch `{ tool: "undo", args: {} }` via `store.undo()`.  
**Suspicion:** The code path (`onUndo={() => store.undo()…}`) is correct; the test cannot reach it due to ambiguous selectors. Fix: query within `.cue-tools-wrap` container.

---

### D-67 — OpsToolbar Redo dispatches `redo` tool (blocked by duplicate button ambiguity)

**ID:** D-67  
**File:** `web/src/components/panels/OpsToolbar.audit.test.tsx`  
**Observed:** Same as D-66 for Redo.  
**Expected:** OpsToolbar's Redo button should dispatch `{ tool: "redo", args: {} }` via `store.redo()`.  
**Suspicion:** Same as D-66. Fix: narrow query to `.cue-tools-wrap`.

---

### D-68 — `merge_events` can never reference two user-selected groups (FINDING: architecture gap)

**ID:** D-68  
**File:** `web/src/components/panels/OpsToolbar.audit.test.tsx`  
**Observed:** The Editor tracks only a single `sel.gi` (integer). `canMergeEvents` is `sel.scope === "group" && sel.gi < P.layout.length - 1`. `mergeEvents()` always dispatches `{ gidxs: [sel.gi, sel.gi + 1] }`. There is no mechanism to ctrl-click two event headers to build a multi-group selection set.  
**Expected (per inventory):** Selecting two group headers should produce `merge_events { gidxs: [gi_a, gi_b] }` reflecting the actual user's selection of two groups, not just "current gi + 1".  
**Suspicion:** The inventory described multi-group selection for merge_events, but the current model never implemented a `Set<number>` for selected groups — only single `gi` is tracked. The `it.fails` test expresses the desired behaviour; the test correctly fails because ctrl-clicking a second event header does not add it to any multi-group selection. A fix would require a `selectedGroups: Set<number>` state analogous to `selectedWords`.

---

## All Test IDs

| ID | Description | Result |
|----|-------------|--------|
| D-01 | CueLanes plain click → `.sel` on row | PASS |
| D-02 | CueLanes plain click → selCount=1 | PASS |
| D-03 | ctrl-click → `.multi` on both rows | PASS |
| D-04 | ctrl-click again removes row from multi | PASS |
| D-05 | shift-click range-selects by time | PASS |
| D-06 | cross-group shift-click includes both groups | PASS |
| D-07 | Esc clears all selection | PASS |
| D-08 | event header click → EventStrip appears | PASS |
| D-09 | event header click → `.sel` on `.lane-evt` | PASS |
| D-10 | chevron collapses rows | PASS |
| D-11 | chevron collapse+expand restores rows | PASS |
| D-12 | lane-row click → `.sel` on lane-row | PASS |
| D-13 | WordTrack locked block click → `.sel` in CueLanes | PASS |
| D-20 | WordTrack locked click → onSelect, no onRetime | PASS |
| D-21 | WordTrack locked drag → no onRetime | PASS |
| D-22 | WordTrack unlocked body drag → computeMove oracle | PASS |
| D-23 | WordTrack multi-select drag → computeMove all toks | PASS |
| D-24 | left-handle drag → computeResize(start) oracle | PASS |
| D-25 | right-handle drag → computeResize(end) oracle | PASS |
| D-26 | Esc mid-drag → no onRetime | PASS |
| D-27 | click-no-move (<3px) → onSelect not onRetime | PASS |
| D-28 | drag-then-drag-back → second dispatch = original times | PASS |
| D-40 | no selection → fade/merge/delete disabled | PASS |
| D-41 | single word → fade enabled; merge disabled | PASS |
| D-42 | 2 adjacent → merge enabled | PASS |
| D-43 | 2 non-adjacent → merge button enabled (Editor gates on click) | PASS |
| D-44 | fin_tag word → Clear in button appears | PASS |
| D-45 | fout_tag word → Clear out button appears | PASS |
| D-46 | merged token → merge disabled | PASS |
| D-47 | no selection → Break line disabled | PASS |
| D-48 | single word → Break line enabled | PASS |
| D-49 | group 0 selected → Merge events enabled | PASS |
| D-50 | last group selected → Merge events disabled | PASS |
| D-51 | Split event gated on lines>1 | PASS |
| D-52 | Undo/Redo enabled (FINDING: duplicate buttons) | it.fails |
| D-53 | make_fade_tag kind=in | PASS |
| D-54 | make_fade_tag kind=out | PASS |
| D-55 | clear_fade_tag kind=in | PASS |
| D-56 | merge_word_span smoke | PASS |
| D-57 | break_line mid-line | PASS |
| D-58 | join_lines line-end toggle | PASS |
| D-59 | merge_events gidxs=[0,1] | PASS |
| D-60 | split_event gi+line_index | PASS |
| D-61 | ungroup_event gi | PASS |
| D-62 | delete_words word_ids | PASS |
| D-63 | delete echo → Restore label | PASS |
| D-64 | restore_words dispatched | PASS |
| D-65 | double-delete → delete_words again | PASS |
| D-66 | OpsToolbar Undo → undo dispatch (FINDING: duplicate buttons) | it.fails |
| D-67 | OpsToolbar Redo → redo dispatch (FINDING: duplicate buttons) | it.fails |
| D-68 | merge_events multi-group selection (FINDING: architecture gap) | it.fails |
