# Subtitle editing — retime & edit text of existing cues

**Date:** 2026-06-03
**Status:** Approved for planning (pending user review)
**Branch:** `feat/subtitle-editing`
**Parent:** Spec B (`2026-06-03-react-ui-design.md`) — builds on the web editor + daemon.
**Deferred siblings:** add/hard-delete subtitles; rename soft-delete→"disable" + delete-warning;
**checkpoints** (version history, original = checkpoint 0); horizontal timeline zoom.

## Context

Today word atoms are immutable: the Timing panel is read-only ("locked to source — editing coming
soon"), and `io.apply_cues` rebuilds words from the lyrics file on load. This feature unlocks
**retiming** (start/end) and **text editing** of *existing* cues — no adding or deleting subtitles in
this pass, so the **word count never changes**. That keeps the model change small: no `nwords`-guard
removal, no orphan/reindex/word-id strategy. The only model gap is **persistence** of the edited word
timing/text.

A "cue" = a timeline block = a token (1+ word atoms; almost always 1). Editing operates on the cue:
single-word cues edit their word; merged cues move/resize as a unit (un-merge for per-word).

## Decisions (locked)

| Topic | Decision |
|---|---|
| Operations | Retime (start/end) + edit text of existing cues. **No** add/delete/disable changes. |
| Unit | The cue block. Single-word → its word atom; merged → shift/scale the span as a unit; text-edit on single-word cues only. |
| Model | Words editable in place; **count fixed**. The `nwords` guard stays. |
| Persistence | `serialize_cues` now saves `words[]` (text/start/end); `apply_cues` uses them when `nwords` matches. Old projects load unchanged. |
| Engine ops | Batch `set_word_times(updates:[{wid,start,end}])` (atomic, validated, one undo step) + `set_word_text(wid,text)`. |
| Constraints | `start ≥ 0`, `start < end` (mutation rejects otherwise). Overlaps and any ordering allowed. |
| Selection | One shared `selectedWords` set across the timeline **and** the cue lanes (bidirectional). click = single (primary); Ctrl/Cmd-click = toggle; Shift-click = range (time order). **Esc** clears selection. |
| Retime UX | Timeline drag (body = move, edge = resize) **+** numeric Timing panel. Multi-select **move** shifts all selected by the same delta (diffs preserved). Resize is single-cue. **Esc during drag cancels** (revert, no commit). |
| Timing lock | A **lock/unlock timings** toggle, **default locked**. While locked, ALL timing edits are disabled (timeline drag/resize handles inert, keyboard nudge off, numeric start/end read-only); **text editing stays available**. Unlocking enables timing edits. (Reuses/replaces the Timing panel's existing "locked" pill.) |
| Numeric fields | Start/end inputs accept direct entry and step on **↑/↓** while focused (Shift+↑/↓ = larger step); only active when timings are unlocked. |
| Small cues | Min block hit-width (~14px); resize handles appear on hover/selection and may overhang; below ~22px the block is move-only by drag with resize via panel/keyboard; keyboard nudge (`←/→` shift, `Shift+←/→` resize end) — all gated on unlocked timings. |
| Zoom | Deferred. |

## Architecture

### Engine (`engine/`)
- **`mutations.set_word_times(project, updates)`** — `updates: list[{wid, start, end}]`. Validate every
  entry (`start >= 0` and `start < end`); if any invalid, raise and apply **nothing** (atomic). Then
  set each `project["words"][wid]["start"]/["end"]`. One call = one undo step.
- **`mutations.set_word_text(project, wid, text)`** — set `project["words"][wid]["text"]` (text may be
  any non-None string; empty allowed).
- **`io.serialize_cues`** — add `"words": [{"text","start","end"} for w in p["words"]]`.
- **`io.apply_cues`** — keep the `nwords` guard; after it, if `d.get("words")` is present and
  `len(d["words"]) == nwords`, replace `project["words"]` with copies of the saved words (so edits
  persist). Absent `words` → behaves exactly as today (lyrics-derived words).
- `render.project_to_render` already reads `words[*].start/end` — no change; retimes flow through.

### Daemon / tools (`mcp_server/`)
- `tools.set_word_times(ctx, updates)` → `_do("set_word_times", updates)`, returns `get_state` (or the
  affected word views). `tools.set_word_text(ctx, wid, text)` → `_do("set_word_text", wid, text)`.
- Register both in `mcp_server/server.py`.
- `get_project` already serializes `words` verbatim — the web has live word timing/text.

### Web (`web/src/`)
- **Timing lock** (in `Editor`): `timingsUnlocked: boolean`, **default false**. A lock toggle in the
  Timing panel header (replacing the static "locked" pill) flips it. When `false`, all timing
  affordances are inert: `WordTrack` renders no drag/resize handles and ignores pointer-drags, the
  keyboard nudge handler is disabled, and the numeric start/end fields are read-only. Text editing is
  independent of the lock. Every retime entry point checks this flag before dispatching.
- **Selection model** (in `Editor`): `selectedWords: Set<number>` (representative wid per selected
  cue) + a `primary` wid (drives the inspector/Timing panel) + an `anchor` wid (for Shift-range).
  Handlers `selectOne(wid)`, `toggle(wid)`, `rangeTo(wid)` (selects all cues whose time falls between
  the anchor's and the clicked cue's start, inclusive), `clearSelection()`. **Both** `WordTrack` and
  `CueLanes` call these (bidirectional) and render highlight from the same set.
- **Timeline drag** (`WordTrack` + a `useTimelineDrag` helper): on pointer-down on a block, determine
  mode from the x-position within the block — left/right **edge handle** (resize) vs **body** (move).
  Capture: mode, affected word ids (move = all member words of all selected cues; resize = the grabbed
  cue's words), their original times, the lane-area pixel width, and `dur`. On pointer-move compute
  `dt = (dx / areaPx) * dur`; for move clamp `dt` so the earliest affected start stays `≥ 0`; update a
  **local drag-preview** map (`wid → {start,end}`) that the blocks render from (no dispatch yet). On
  pointer-up dispatch **one** `set_word_times(updates)`; on **Esc** during drag, discard the preview
  and dispatch nothing. Resize edits only the grabbed cue's start (left) or end (right), enforcing
  `start < end` (min cue width in time).
- **Block rendering** uses the drag-preview times when present, else the model times; min visual width
  ~14px; resize handles (`.wt-handle`, `ew-resize`) shown on hover/selection, overhanging on narrow
  blocks; body cursor `grab`.
- **Keyboard** (when a cue is selected and the timeline/editor has focus): `←/→` nudge the primary
  cue's start+end by a small step (e.g., 50ms) via `set_word_times`; `Shift+←/→` nudge only the end;
  **Esc** clears selection (when not dragging).
- **Timing panel** (`TimingPanel`): a **lock toggle** in the header (default locked). **Text** input
  for the primary cue is always editable → `set_word_text` on commit. **Start/end** fields are
  read-only while locked; when unlocked they accept direct entry and step on **↑/↓** (Shift+↑/↓ =
  larger step) and commit on blur/Enter → `set_word_times`. The old "locked / coming soon" note is
  replaced by the live lock toggle.
- Cue start/end for a block = `min(member word starts)` … `max(member word ends)`; a small helper
  (e.g., `cueSpan(project, token)`), reused by the timeline and panel.

## Data flow
Edit (drag release / panel commit / keyboard nudge) → `store.call("set_word_times" | "set_word_text",
…)` → daemon mutates the shared session → broadcasts `get_project` → the web replaces state and
re-renders with the new word times/text. During a drag, only local preview updates; the authoritative
state arrives on release. Undo/redo (server timeline) revert/replay each retime/text edit as one step.

## Error handling
- Invalid retime (`start ≥ end` or `start < 0`) → the mutation raises; `store.call` surfaces the error
  toast; the UI clamps inputs so this is rare (resize can't cross the opposite edge; min cue width
  enforced in the drag math).
- Esc mid-drag → no dispatch, blocks snap back to model times.
- A `set_word_times` referencing an out-of-range `wid` → mutation raises (guard), toast.

## Testing
**Engine (headless):**
- `set_word_times`: applies a batch; **atomic** — an invalid entry (start≥end) raises and leaves all
  words unchanged; valid batch updates every listed word; rejects `start<0`.
- `set_word_text`: updates the word's text (incl. empty string).
- io round-trip: a project with a **retimed + retitled** word, `serialize_cues`→`apply_cues`,
  **preserves** the edits (count-matched); a serialized doc **without** `words` still loads
  (lyrics-derived), proving back-compat.
- render: a retimed word's appearance/`fout` times reflect the new `start/end`.

**Daemon:** `POST /api/call set_word_times` updates state and pushes; `set_word_text` likewise.

**Web (Vitest + RTL):**
- selection: Ctrl-click toggles, Shift-click range-selects (time order), plain click selects one;
  selecting in the timeline reflects in the cue lanes and vice versa; Esc clears.
- drag math (pure helper): a multi-selection move produces a `set_word_times` whose updates shift
  every selected word by the **same delta** (diffs preserved), clamped at 0; a resize produces a
  one-element update changing only the grabbed edge with `start < end`.
- Esc during a simulated drag dispatches nothing and reverts preview.
- keyboard nudge dispatches `set_word_times` with the stepped time.
- **timing lock (default locked):** with timings locked, a block exposes no resize/drag handles and a
  pointer-drag dispatches nothing; the numeric start/end fields are read-only; keyboard nudge is a
  no-op; **text editing still dispatches** `set_word_text`. After toggling unlock, drag/nudge/numeric
  edits dispatch `set_word_times`.
- **numeric fields:** ↑/↓ in a focused start/end field steps the value (Shift = larger step) and
  commit dispatches `set_word_times`.
- Timing panel: the lock toggle flips the locked/unlocked state; text input dispatches `set_word_text`
  regardless of lock.

## Verification
1. `python -m daemon` + `npm --prefix web run dev`; open a project, Timeline tab.
2. Drag a cue's body → it moves; drag an edge → it resizes; numeric panel matches; reload (save→open)
   preserves the new timing.
3. Shift/Ctrl-select several cues in the timeline (and confirm the cue lanes mirror the selection);
   drag the body → all move together preserving gaps; Esc mid-drag cancels.
4. Edit a cue's text in the panel → preview + ASS reflect it; persists across save/open.
5. Drive `set_word_times` via `/api/call` in a second client → this UI updates over `/ws`.
6. `npm --prefix web run test` and the headless suites are green.

## Out of scope
Adding/deleting subtitles; the disable rename + delete-warning; checkpoints/version history;
horizontal timeline zoom; multi-cue resize; per-word editing inside a merged cue (un-merge first).
