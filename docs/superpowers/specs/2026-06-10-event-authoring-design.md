# Event authoring — design spec (2026-06-10)

Implements the zip-17 Event-Authoring decision (`docs/superpowers/zip15-decisions/DECISIONS.md` §"Event
authoring"; prototype `zip15-decisions/resources/Event-Authoring.html`).

**Goal:** Give an **Events panel** that authors what an `.srt` can't import — an SRT lands as one flat
"Subtitles" event (cue text + line timing only, no events/names/sections). The panel lets you **group** cues
into events, **name** them, set a **section** (new field), set **linger**, and give each event a **brand
color** (new field) that recolors it everywhere (lane + every cue block).

**Architecture:** two new persisted group fields (`section`, `color`) threaded through the engine
(TDD-first); a handful of new thin mutations (`set_event_label`, `set_event_section`, `set_event_color`);
reuse of the existing `merge_events`/`split_event`/`ungroup_event`/`set_layout_props`; a new Events panel in
the Project rail; inline rename on the CueLanes event header and the timeline Lanes gutter; one
`eventColor(group, gi)` helper replacing index-derived color at ~6 sites. **No ASS-compile change** — `section`
and `color` are organizational metadata, not rendered into subtitles.

**Tech:** Python engine + pytest/script tests (TDD-first per house rule), Starlette daemon (generic
`getattr` dispatch — new tools are auto-callable), React/TS web, Vitest, Playwright.

---

## 1 · Model-vs-prototype reconciliation (read first — affects scope)

Our model **partitions words**: every word belongs to exactly one group via `layout[gi].lines[].toks[].ids`.
The prototype is a flat mock list, so three of its affordances don't map 1:1. Decisions taken (flag if wrong):

- **No empty "＋New event".** You can't have an event with no cues in a word-partition model. → The toolbar's
  create primitive becomes **"Split off selection → new event"** (split the current group at the selected
  cue/line boundary into a new event), NOT an empty push. Label it **"New from selection"** (or keep "Split at
  cue"). *Open: confirm we drop the literal empty-＋New.*
- **Split is line-granular.** Existing `split_event(gi, line_index)` splits at a LINE boundary. For SRT (each
  cue is its own line) "split at cue" == "split at line", so this is sufficient for the import use-case.
  Splitting mid-line (Suno multi-word lines) is out of scope. → "Split at cue" maps to `split_event` at the
  line index of the chosen cue.
- **Merge is adjacency-only.** `layout_merge(gidxs)` merges ADJACENT groups (≥2). The panel's multi-select for
  Merge must be a **contiguous** range; non-adjacent merge stays disallowed (consistent with the frozen
  "no non-adjacent merge" decision). Disable Merge unless the selection is contiguous.

Everything else (name, section, linger, color, window-readonly) maps cleanly.

---

## 2 · Backend (TDD-first) — `section` + `color` fields + thin mutations

### 2.1 Two new group fields, threaded for persistence
`section: string` (one of the enum, a custom string, or `""`/`"—"` for none) and `color: string` (hex, or
`""`/absent = "use index default"). Thread through **both** sides of the round-trip + the read-projections
(unknown keys are dropped today):
- `engine/io.py` `_ser_group` (~20-35) and `_apply_group` (~58-72) — add `section`, `color` (omit/empty when
  unset to keep project.json clean).
- Group constructors: `engine/model.py:51-53` (`make_project`), `engine/srt.py:92-94` (`build_srt_layout` —
  SRT default `section` = `""`/none, `label` stays "Subtitles"), `engine/io.py:_apply_group`.
- `engine/mutations.py` `layout_ungroup` (~273) hand-builds child dicts — add `section`/`color` explicitly.
  (`layout_merge`/`layout_split_event` spread `{**g}` so they auto-carry.)
- MCP read-projections so the web sees them: `mcp_server/tools.py` `_event_view` (~42-54) and `get_project`
  layout projection (~114-116).
- `web/src/types.ts` `LayoutGroup` (62-68): add `section?: string; color?: string`.

### 2.2 New thin mutations (engine) + MCP tools
None of these exist today (`set_layout_props` ignores `label`; no rename/section/color/create):
- `set_event_label(project, gi, label)` — sets `layout[gi].label` (single-line; engine trusts client to
  sanitize, but also strips newlines defensively). MCP `set_event_label(ctx, gi, label)`.
- `set_event_section(project, gi, section)` — sets `layout[gi].section`. MCP `set_event_section(ctx, gi, section)`.
- `set_event_color(project, gi, color)` — sets `layout[gi].color` (hex or "" to clear). MCP `set_event_color(ctx, gi, color)`.
- Reuse existing: `merge_events(gidxs)`, `split_event(gi, line_index)`, `ungroup_event(gi)`,
  `set_layout_props(gi, win_start, win_end, linger)`.

The daemon dispatches any `mcp_server/tools.py` function by name (`daemon/api.py:16-44`) — no route wiring.

### 2.3 Engine tests (pytest/script, TDD-first)
- Field round-trip: set `section`/`color` on a group → `serialize_cues` → `apply_cues` → values survive
  (and absent when unset). New test in the daemon/library or a `test_event_fields.py`.
- `set_event_label`/`set_event_section`/`set_event_color`: each sets the field, no-ops on bad `gi`, strips
  newlines (label/section). `merge`/`split`/`ungroup` carry `section`/`color` (merge keeps the first group's;
  ungroup copies to both children).
- SRT import still lands as ONE group labeled "Subtitles" with empty section/color.

---

## 3 · Frontend — color helper (do early, isolates the recolor)

Add `eventColor(group, gi)` (in `model/palette.ts`): `group?.color || colorForIndex(gi)`. Replace the ~6
index-derived sites: `CueLanes.tsx:143`; `WordTrack.tsx:734, 750, 854, 863, 914`. After this, setting
`layout[gi].color` recolors the lane bar, every cue block, the anim-bar group tint, and the gutter dot —
"everywhere", satisfying the locked "color is its brand" rule.

---

## 4 · Frontend — Events panel (Project rail / `ControlsRail.tsx`)

A new **Events** panel section (per the locked "Project rail" home). Column grid
`26px 1fr 150px 120px 90px 64px` (grip+dot · Name · Section · Window · Linger · Cues), with `srt`/`author`
tag chips in the header + a legend. One `.ev` row per `layout[gi]`:
- **grip** (reorder is out of scope for v1 — render the grip but no drag, or omit; *open*), **color dot**
  button → palette popover (the 8-color `PALETTE`) → `set_event_color`.
- **Name** — `contenteditable` cell, single-line rules (§6), `Untitled event` placeholder, `.unnamed` style;
  pencil affordance focuses+selects. Commit → `set_event_label`.
- **Section** — `<select>` of `SEC_BASE = ["—","Intro","Verse","Pre-chorus","Chorus","Bridge","Outro","Hook"]`
  + a sticky `<option>` for a current custom value + `Custom…` → a single-line modal (maxlength 40, newlines→
  spaces, empty→"—"). Commit → `set_event_section`.
- **Window** — read-only `{win_start.toFixed(1)}–{win_end.toFixed(1)}s` (`srt`, edited in the timeline).
- **Linger** — stepper (step 0.1, min 0) → `set_layout_props({linger})` (existing).
- **Cues** — `${n} cue${n>1?"s":""}` (count of toks in the group), read-only.

**Toolbar:** `Merge selected` (enabled only when ≥2 **contiguous** events selected → `merge_events`),
`Split at cue` (split the focused group at a cue/line boundary → `split_event`), and the create primitive
(§1: "New from selection"/split-off, NOT empty push). Multi-select = per-row boolean; row click toggles
unless the click hit an interactive child (`.name/select/.stepper/.dot`).

New Editor dispatch handlers: `setEventLabel(gi,label)`, `setEventSection(gi,section)`,
`setEventColor(gi,color)` (the existing `setLayoutProp`/`onSet` are narrowly typed to window/linger — add
dedicated handlers rather than widening them).

**Section-header styling:** v1 = render the section as a small badge on the event row + the CueLanes
`.lane-evt` header; deeper "section divider" styling in the lanes/timeline is a follow-up (not v1).

---

## 5 · Frontend — inline rename in the two timeline sites

Both write `layout[i].label` via `set_event_label` (single-line rules §6):
- **CueLanes `.lane-evt` header** (`CueLanes.tsx:147-160`) — make `{g.label}` a double-click
  `contenteditable` (or pencil). Already the richest event-row UI (collapse, range, color bar).
- **WordTrack Lanes gutter** `.glabel`/`.gname` (`WordTrack.tsx:913-915`) — add `onDoubleClick` → inline edit;
  thread an `onRenameEvent(gi, label)` prop from Editor. Only relevant in Lanes density.

---

## 6 · Single-line name rules (LOCKED — shared by all rename sites)
- **Enter commits, never newlines:** on Enter `preventDefault()` + blur (commit).
- **Pasted breaks → spaces:** intercept paste, `text.replace(/[\r\n]+/g," ").trim()`, insert as plain text.
- **Truncate with … + full-name `title` tooltip;** empty → `Untitled event` (amber `.unnamed`).
- Same rules in the Events panel cell, the CueLanes header, the timeline gutter, and the Custom-section modal.

---

## 7 · Params (from prototype)
| Const | Value |
|---|---|
| `SEC_BASE` | `["—","Intro","Verse","Pre-chorus","Chorus","Bridge","Outro","Hook"]` (`—` = none) |
| `PALETTE` | `['#FF3DA6','#8A5CF6','#36E2FF','#37E29A','#FFC24B','#FF6B6B','#A88BFF','#4DE0C2']` (8) |
| Custom section | maxlength 40, newlines→spaces, empty→`—` |
| Linger | step 0.1, min 0 (existing) |
| Merge enable | ≥2 **contiguous** selected |
| Empty name | `Untitled event` |

---

## 8 · Build order (→ plan; each phase ships green)
1. **Backend fields + mutations (TDD-first):** `section`/`color` threading + round-trip tests; `set_event_label`/
   `_section`/`_color` mutations + tools + tests; merge/split/ungroup carry the fields.
2. **Color helper:** `eventColor(group, gi)` + swap the ~6 sites + types.ts fields. (Web tests for the helper.)
3. **Events panel:** ControlsRail panel (rows, toolbar, section select + Custom modal, color popover, linger,
   selection, Merge/Split contiguity gating) + Editor dispatch handlers + tests.
4. **Inline rename:** CueLanes header + WordTrack gutter double-click + shared single-line rules + tests.
5. **e2e:** SRT import → one "Subtitles" event → split into events → name/section/color → persists across
   reopen; recolor recolors lane + blocks; rename round-trips.

---

## 9 · Assumptions & open questions (confirm in review)
1. **"＋New event" is reinterpreted as split-off / "New from selection"** (no empty events) — §1. Biggest call.
2. **Split is line-granular** ("split at cue" == "split at line"; mid-line split out of scope) — §1.
3. **Merge is contiguous-only** (non-adjacent stays disallowed) — §1.
4. **`section` is pure metadata** — persisted + shown as a badge, **not** compiled into the ASS. "Section-header
   styling" v1 = a badge on the event row; richer section dividers are a follow-up.
5. **`color` is pure metadata** — stored per group, drives UI tint only (subtitle color stays `style.primary`).
6. **Reorder (grip drag) is out of scope for v1** (events are time-ordered by their cues anyway).
7. No changes to per-word retiming / window editing (those already live in the timeline).

---

## 11 · Designer flags (2026-06-11 — deferred-bits pass)

Two items from the Event-Authoring prototype need a designer decision/mockup before they can be built faithfully:

- **Grip-drag reorder of events — NOT implementable as drawn; needs a designer call.** The prototype's Events
  panel shows a `⋮⋮` grip and the legend says "drag the grip to reorder." But our events are **contiguous,
  time-ordered word ranges** (`layout[gi]` partitions `words` in time). You cannot put "Chorus" before
  "Verse 1" without retiming the underlying words — there is no meaningful free reorder. (Same class of gap as
  the empty "＋New event," which we already reinterpreted as split-off.) **Decision taken:** do not build
  arbitrary reorder; flagged here for the designer. If reorder is desired, it must be specced as a *retiming*
  operation (move a section's cues in time), not a list shuffle.
- **Section-header *grouping/divider* visual — undesigned; needs a mockup.** zip-17 says "section drives
  section-header styling," but no prototype shows what a section *header/divider* looks like in the lanes or
  timeline. **Built (2026-06-11, grounded):** the authored `section` now renders as a styled **section chip**
  on the CueLanes `.lane-evt` event header (kit tag vocabulary; hidden when unset/"—") — section is no longer
  invisible outside the panel select. **Deferred (needs a designer mockup):** a fuller treatment that *groups*
  events under shared section-divider rows, or surfaces sections on the timeline / in export.

---

## 10 · Key file anchors
- Engine: `engine/io.py` (`_ser_group`/`_apply_group`), `engine/model.py:51-53`, `engine/srt.py:92-94`,
  `engine/mutations.py` (`layout_ungroup` + new setters), `mcp_server/tools.py` (`_event_view`, `get_project`,
  new tools). Tests under `tests/`.
- Web: `web/src/types.ts:62-68`, `web/src/model/palette.ts` (`eventColor`), `web/src/components/panels/ControlsRail.tsx`
  (Events panel), `web/src/components/panels/CueLanes.tsx:147-160`, `web/src/components/stage/WordTrack.tsx:913-915`,
  `web/src/components/Editor.tsx` (dispatch handlers). Tests alongside.
