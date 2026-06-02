# Per-cue / per-group style overrides + merged single-window editor

**Date:** 2026-06-02
**Status:** Approved for planning
**Repo:** lyric-title-embedder (karaoke-subtitle-studio), branch from `main`

## Context

The app turns Suno word-timed lyrics into styled karaoke `.ass`/`.srt` and burns
them into video. Today **style is global only** (one font/size/colors/box for the
whole subtitle), and the cue editor is a **separate pop-out window** (`CueTableEditor`
Toplevel). The model already resolves *timing* through a `word → tag → global`
waterfall; styling has no such tiers.

This change does three things the user asked for:

1. **Per-cue and per-group style overrides**, resolved through a three-tier
   waterfall `global < group < cue` (most specific wins) — mirroring the timing
   model and the v3 design-system Inspector concept.
2. **Merge the main window and the cue dialog into one window**, adopting the
   design system's *Timeline-Dock* layout adapted to CustomTkinter (no waveform —
   that is a deliberate v3-only piece CTk can't render well).
3. **Unified save/load** that persists global defaults, per-group/per-cue
   overrides, and all existing cue decisions in one project file.

**Road:** extend the existing Python/CustomTkinter app now ("middle way"), but keep
the model a **forward-compatible superset** so a future Tauri/React v3 (per
`design-system/HANDOFF_v3.md`) can consume the same shape. Nothing in the current
model is removed; `old/` (v1) stays runnable and untouched.

## Decisions (locked)

| Topic | Decision |
|---|---|
| Resolution | `global < group < cue`; `None`/absent = inherit |
| Per-**group** props | font, size, bold, primary/outline/box colors, box alpha, outline width, shadow depth, **box-mode (BorderStyle)** |
| Per-**cue** props | same set **except box-mode** (see constraint C1) |
| Placement (align/pos/margins/canvas) | **global only** — no per-group/per-cue |
| Live preview | **full per-cue** rendering (word-by-word mixed fonts/sizes/colors) |
| Inspector location | **left-rail tab** (`Style | Inspector`) |
| Project file paths | **omit** source lyrics/video paths (portable) |

### Hard constraints (technical, not preferences)

- **C1 — Box-mode is group-level only.** A `Dialogue` event references exactly one
  `[V4+ Styles]`, and `BorderStyle` (1=outline vs 3=opaque box) has **no inline
  override tag**. All cues in one event share its box-mode. Outline width
  (`\bord`), shadow depth (`\shad`), colors, font, size, bold *are* inline and can
  be per-cue.
- **C2 — tk live preview ≠ libass exactly.** Existing caveat; unchanged. The
  per-cue tk preview is faithful in layout/size/color but glyph metrics still
  differ from libass; the exact "Render now" path remains ground truth.

## Architecture

Files: `karaoke_subtitle_gui.py` (model/build/editor), `app_base.py` (shared UI
engine + preview), `core.py` (helpers — minor). `old/` and the v1 model untouched.

### 1. Model (superset — `karaoke_subtitle_gui.py`)

Add an optional `style` dict at **two levels**. Empty/missing = inherit.

```python
STYLE_KEYS = ["font","fontsize","bold","primary","outline","back",
              "back_alpha","outline_w","shadow","border_style"]
# group:  layout[gi]["style"] = {}            # all 10 keys allowed
# cue:    token["style"]       = {}            # all keys EXCEPT "border_style" (C1)
```

- `make_project_v2`: initialize `g["style"] = {}` per event and `tok["style"] = {}`
  per token.
- Global tier = existing app controls (`font_var`, `size_var`, `bold_var`,
  `_color`, `backa_var`, `outline_var`, `shadow_var`, `border_var`).
- Resolution helper: `resolve_style(token, group, gctx)` → for each key returns
  `token.style → group.style → gctx[key]`; `border_style` resolves
  `group.style → gctx` only.

### 2. Render-groups (shared contract)

Extend the existing render-group shape so both the build and the preview can
resolve style without new coupling:

- each render-group gains `group_style` (raw group override dict),
- each word gains `style` (raw cue override dict).

`project_to_render_v2` copies these through (no resolution here — kept lazy so the
global context lives only in the app's `cfg()`). v1 render-groups simply lack these
keys → treated as `{}` (old/ stays runnable).

### 3. ASS build (`build_ass_v2`)

- **Style selection (C1):** compute the set of distinct *resolved group*
  `border_style` values across events; emit one `[V4+ Styles]` entry per distinct
  value (e.g. `Default`=outline, `Box`=opaque). Each `Dialogue` references the
  style matching its group's resolved box-mode. All other style props are inline.
- **Per-word inline style via running-state deltas (correctness):** inline tags
  persist within an event, so emit a property tag only when a word's *resolved*
  value differs from the **previous word's** resolved value (state initialized to
  the global/Style baseline at event start). This both resets correctly (word B
  with no override after word A's override re-emits the baseline) and minimizes
  output. Inline-able tags: `\fn \fs \b \1c \3c \4c \4a \bord \shad`. Existing fade
  tags (`\alpha`, `\t(...)`) are emitted alongside, unchanged.
- `cfg` carries the global style baseline (already does) plus is the resolution
  context for group/cue overrides.

### 4. Live preview (`app_base.py` — `_draw_text_approx`)

Rewrite line drawing from "one string per line" to **word-by-word**:

- For each line, iterate **all** tokens (appeared and pending) to compute stable x
  positions (reserve space for not-yet-appeared words, as today).
- Per word, resolve effective `font/size/bold/primary/outline` (cue→group→global)
  and build/cache a `tkfont.Font` keyed by `(family, px, bold)`; px uses the
  existing per-font factor (`_font_px_factor`) and `self.sy()`.
- Measure each word in its own font; line width = Σ word widths; left edge from the
  global anchor/alignment. Line height = max `linespace` across the line's fonts.
- Draw appeared words only: 4-offset outline in the word's outline color + fill in
  its primary color.
- Box color/alpha and box-mode are **not** drawn in the tk approx (only visible in
  the exact libass render) — same as today.

### 5. Merged window (`app_base.py` `_build` + dissolve `CueTableEditor`)

Single window, Timeline-Dock layout (CTk-adapted, no waveform):

```
Toolbar:  brand .......... undo/redo   Theme ▾
┌ left rail (CTkTabview: Style | Inspector) ┬ center: time slider + preview ┐
│  Style:    IO + global font/size/bold/    │   draggable placement box      │
│            align/colors/outline/shadow/    │                               │
│            box + global fade defaults      │                               │
│  Inspector: selection waterfall            │                               │
│            WORD(cue) / GROUP / GLOBAL      │                               │
├───────────────────────────────────────────┴───────────────────────────────┤
│ Cue toolbar: Group · Ungroup · Split · Delete · Break · Merge · Undo · Redo │
│  LAYOUT · cue/words │ FADE-IN │ FADE-OUT      (the existing 3 synced lanes)  │
├─────────────────────────────────────────────────────────────────────────────┤
│ Generate .ass · Burn · Save project · Load project · Quit                    │
│ [progress]   status log                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

- `CueTableEditor` (Toplevel) is **dissolved** into the main window: its 3 lanes +
  cue toolbar become the **bottom dock**; its property/inspector + global-fade
  defaults move into the left rail **Inspector** / **Style** tabs. Preserve:
  selection model, drag/shift/ctrl multiselect, click-again drill-down,
  scroll-preservation, tooltips, themes, undo/redo, `_validate_selection`.
- `open_editor` / the separate window go away; `_editor` references are replaced by
  in-window panel state. (v1 in `old/` keeps its own Toplevel editor.)

### 6. Inspector — per-cue / per-group style editing (left rail)

The Inspector tab shows tiers by selection (matches the design system):

- **WORD (cue)** tier — when a token row is selected: editable overrides for all
  per-cue props; each field shows the **resolved group/global value** as the
  grey-italic inherited hint; blank/"inherit" clears the override.
- **GROUP** tier — when a layout header is selected (or always shown as the parent
  of the selected word): the per-group overrides incl. box-mode; inherited hint =
  global. Plus existing `win_start/win_end/linger/accumulate`.
- **GLOBAL** tier — read-only reflection of the global defaults (edited in the
  Style tab).

Controls: numeric entries (size/outline_w/shadow) with grey global hint (reuse
`_pe`); font = combo + Choose…; bold/border_style = tri-state option menu
(`inherit / …`); colors = swatch button with an **inherit** state (faint global
color) + a clear-to-inherit affordance. Grey-italic = inherited, solid = overridden
(existing convention).

New undo-tracked mutations on `AppV2`:
`set_group_style(gi, partial)` and `set_cue_style(token_ref, partial)` →
update the relevant `style` dict (drop keys set back to inherit) → `_rebuild_render()`.
Multi-select word style apply: set the override on every token covered by `sel_ids`.

### 7. Save / load → unified project file

- Rename actions **Save project / Load project** (was Save/Load preset).
- File = today's preset superset: global style + global fade defaults + placement
  (align/pos/margins/canvas) + theme + `cues_v2` extended with each group's `style`
  and each token's `style`.
- **Backward compatible:** old presets load (missing `style` ⇒ all inherit).
- Source lyrics/video paths **not stored**; loader keeps current paths.
- `serialize_cues_v2` / `apply_cues_v2`: add `style` round-trip for groups and
  tokens; preserve the existing `nwords` guard.

## Out of scope

- Animation presets (Bounce/Pop/Glow/Typewriter), waveform/word-block timeline,
  Project Library, synthwave look — all v3 (Tauri) per HANDOFF; not in CTk.
- Per-group/per-cue **placement** (position/alignment/margins) — global only.
- Per-cue **box-mode** — impossible inline (C1).

## Verification

1. **Run:** `python3 karaoke_subtitle_gui.py` (with `.venv`/poetry). Load
   `aligned_lyrics.json`. Confirm single merged window; left-rail Style|Inspector;
   bottom 3-lane dock; preview + drag still work.
2. **Per-group:** select an event header → set group font/size/color/box-mode →
   live preview + "Render now" reflect it for that event only; other events
   unchanged.
3. **Per-cue:** select a word row → set a different font/size/color → live preview
   shows that single word differing within its line; "Render now" matches; a
   sibling word with no override keeps the group/global style (delta-reset works).
4. **Waterfall:** changing a global default updates every inherited (non-overridden)
   value live; clearing an override reverts that field to the inherited grey value.
5. **Build:** generated `.ass` has the right number of `[V4+ Styles]` (one per
   distinct group box-mode) and correct inline tags; libass burn renders without
   error.
6. **Project file:** Save project → Load project round-trips global + group + cue
   style and all cue decisions; an old preset (no `style`) still loads as all-inherit.
7. **Tests:** `python3 tests/test_v2_ui.py` passes, including new cases:
   group/cue style set/clear/inherit, multi-select style apply, project round-trip
   with style, build emits correct Styles + inline deltas. `old/` v1 still launches.
