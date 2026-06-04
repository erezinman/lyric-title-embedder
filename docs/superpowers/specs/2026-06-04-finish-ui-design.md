# Finish Web UI — wire the Project tab + multi-word merge — Design

**Status:** scope + decisions approved in brainstorming (user delegated detail decisions to
engineer recommendations); pending written-spec review.
**Branch:** `feat/finish-ui` (off `feat/project-create-import`).

## 1. Goal

Eliminate the remaining *non-honest* placeholders in the v3 web UI:

1. **Project tab (`ControlsRail`)** — today it hardcodes the demo song's lyrics/video names,
   shows a fake "Group lyrics by" dropdown, and renders Alignment/Free-placement with inert
   lookalike atoms. Make every displayed value real and make Alignment editable.
2. **Multi-word merge** — today "Merge words" only works with exactly 2 selected words
   (pairwise `merge_prev_word` is unsafe to repeat against a stale client snapshot). Support
   merging any contiguous run of selected words in **one atomic engine operation**.

**Explicitly out of scope** (decided): library search, real project thumbnails, editable Canvas
W×H, a web drag-box for `\pos` coordinates, animation presets (engine lacks them — the existing
honest "Coming soon" stays).

## 2. Engine — atomic span merge

New mutation in `engine/mutations.py`:

```python
def merge_token_span(project, gi, li, ti_first, ti_last, sep=""):
    """Collapse tokens [ti_first..ti_last] of one line into a single token.
    ids concatenate in order; keeps the LEFT token's style and del flag
    (same semantics as merge_prev_word). Validates 0 <= ti_first < ti_last < len(toks);
    raises ValueError otherwise. No-ops are rejected (ti_first == ti_last)."""
```

- Generalizes `merge_prev_word` (which stays — Tk app + existing tool use it; internally
  `merge_prev_word` MAY be reimplemented as `merge_token_span(gi, li, ti-1, ti, sep)`).
- One mutation = one undo step via the existing `_do` dispatch.
- **Tests (TDD, per policy):** merge 3+ tokens (ids order, rendered text via `core.token_text`),
  left style/del preserved, `sep` applied, full-line merge, validation errors (negative ti,
  ti_first >= ti_last, ti_last out of range), undo restores the original tokens.

## 3. Tool surface

New tool `merge_word_span(ctx, gi, li, ti_first, ti_last, sep="")` in `mcp_server/tools.py`
(returns `_event_view(ctx, gi)` like `merge_words`); registered in `mcp_server/server.py`.
The existing `merge_words` (pairwise) is kept untouched for back-compat. `/api/call` exposes
the new tool automatically (name dispatch).

## 4. Daemon contract — expose the video

`get_project` gains one top-level field: `"video": ctx.video_path()` (absolute path or `null`).
This is the only contract addition. The web shows its basename. (Lyrics name needs **no**
contract change: in the library model lyrics are always `<project>/lyrics.json`, and the web
already knows the open project's name.)

- `web/src/types.ts`: `Project` gains `video: string | null`.
- Tests: daemon `get_project` includes `video` (null without video; the path after `set_video`).

## 5. Web — ControlsRail rewrite

`ControlsRail` becomes a wired panel. New props:
`{ project, projectName, onSetGlobal(key, value) }` (the Editor passes its existing
`set_globals`-partial dispatcher).

| Row | Behavior |
|---|---|
| Lyrics | Real: `<projectName>/lyrics.json` (display-only). |
| Video | Real: basename of `project.video`, or an em-dash "—" when null (display-only). |
| Group lyrics by | **Removed** — import-time-only; the create modal owns it. |
| Canvas | Display-only (unchanged values, real data). |
| Alignment | **Real `<select>`** (numpad 1–9 labels) → `onSetGlobal("align", n)`. Styled like the modal's `.combo`/existing select look. |
| Free placement (\pos) | Display-only Toggle (real state: `placement.pos != null`) + a one-line note that the coordinate is set by dragging in the desktop app — until the web grows a drag-box. |
| Animation preset | Unchanged honest "Coming soon" block. |

The inert `Select` atom usages disappear from the codebase (ControlsRail was the last consumer;
the atom itself may stay for the kit parity but nothing ships it — remove `Select`/`Combo` from
`atoms/index.tsx` only if no other file imports them after this change).

- **Tests (Vitest/RTL):** renders real lyrics/video names (and "—" when no video); no
  "Group lyrics by" row; alignment select fires `onSetGlobal("align", n)`; hardcoded
  `bleating_*` strings are gone.

## 6. Web — multi-word merge

`Editor.mergeWords()` changes:

1. Sort selected word ids; map each to its token's `(gi, li, ti)` in the current snapshot.
2. Validate: all tokens share the same `gi, li`; their `ti`s form a **contiguous run** (after
   dedup — two selected ids already merged into one token are fine); at least 2 distinct tokens.
   Invalid → existing error-toast path ("merge needs adjacent words on one line").
3. Dispatch **one** `merge_word_span {gi, li, ti_first, ti_last, sep: " "}`.

`canMergeWords` gating relaxes from `=== 2` to `>= 2` selected words (full adjacency validation
happens on click — gating stays cheap).

- **Tests:** 3-word merge dispatches one `merge_word_span` with the right span; non-adjacent /
  cross-line selection shows the error and dispatches nothing; 2-word path still works
  (now via the span tool); the stale-snapshot TODO comment is gone.

## 7. Error handling

- Engine `ValueError`s surface through the existing `/api/call` 422 → red toast path.
- Client-side adjacency validation prevents most invalid calls; the engine validation is the
  backstop (and the MCP agent's guard).

## 8. Testing summary

- `tests/test_engine_mutations.py` (extend): `merge_token_span` cases + undo.
- `tests/test_mcp.py` or `tests/test_daemon.py` (extend): `merge_word_span` tool + `get_project.video`.
- Web: ControlsRail suite (new file), Editor merge tests (extend existing), full suite + build.
- Tk suites unaffected (batched at end per convention).

## 9. File map

- Modify: `engine/mutations.py`, `mcp_server/tools.py`, `mcp_server/server.py`,
  `web/src/types.ts`, `web/src/components/panels/ControlsRail.tsx`,
  `web/src/components/Editor.tsx`, `web/src/components/atoms/index.tsx` (drop dead atoms if
  unreferenced), tests as above.
- No daemon route changes (tool dispatch + get_project cover everything).
