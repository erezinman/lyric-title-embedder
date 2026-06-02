# Per-cue / per-group style overrides + merged single-window editor

**Date:** 2026-06-02
**Status:** Approved for planning
**Repo:** lyric-title-embedder (karaoke-subtitle-studio), branch `feat/per-cue-group-style` from `main`

## Context

The app turns Suno word-timed lyrics into styled karaoke `.ass`/`.srt` and burns
them into video. Today **style is global only**, the cue editor is a **separate
pop-out window** (`CueTableEditor`), and the business logic is **interleaved with
CustomTkinter** in `app_base.App` and as methods on `AppV2`.

This change delivers three user-requested features and one architectural goal:

1. **Per-cue and per-group style overrides** via a three-tier waterfall
   `global < group < cue` (most specific wins) — mirroring the existing timing
   model and the v3 design-system Inspector.
2. **Merge the main window and the cue dialog into one window** — the design
   system's *Timeline-Dock* layout adapted to CustomTkinter (no waveform; that is a
   v3-only piece CTk renders poorly).
3. **Unified, portable save/load** for global defaults, per-group/per-cue
   overrides, and all existing cue decisions.
4. **Full engine extraction** — move ALL business logic into a UI-free engine with
   a plain-dict contract, so a future Tauri/React v3 (`design-system/HANDOFF_v3.md`)
   is a **view-only rewrite** that reuses the engine unchanged.

**Road:** extend the CTk app now ("middle way"), model kept as a forward-compatible
superset. Nothing in the current model is removed; `old/` (v1) stays runnable and
untouched.

## Decisions (locked)

| Topic | Decision |
|---|---|
| Resolution | `global < group < cue`; `None`/absent = inherit |
| Per-**group** props | font, size, bold, primary/outline/box colors, box alpha, outline width, shadow depth, **box-mode (BorderStyle)** |
| Per-**cue** props | same set **except box-mode** (constraint C1) |
| Placement (align/pos/margins/canvas) | **global only** |
| Live preview | **full per-cue** (word-by-word mixed fonts/sizes/colors) |
| Inspector location | **left-rail tab** (`Style \| Inspector`) |
| Project file paths | **omit** source paths (portable) |
| **Engine seam** | **full extraction** — UI-free engine + pure mutations + thin controller; view is the only front-end-specific layer |
| Bottom cue dock | **adjustable height + detachable** to a Toplevel (recovers two-window workflow) |
| Copy/voice | adopt design-system conventions where free (sentence-case labels, drop log emoji, mono timecodes) |

### Hard constraints (technical, not preferences)

- **C1 — Box-mode is group-level only.** A `Dialogue` references exactly one
  `[V4+ Styles]`, and `BorderStyle` (1=outline / 3=box) has **no inline override
  tag**. All cues in one event share box-mode. Outline width (`\bord`), shadow
  (`\shad`), colors, font, size, bold *are* inline → per-cue OK.
- **C2 — tk preview ≠ libass exactly.** Existing caveat. The per-cue tk preview is
  faithful in layout/size/color, but glyph metrics differ; exact "Render now"
  (libass) stays ground truth.

## Architecture — full engine extraction

Layered, with a plain-dict contract. The **view** is the only layer a future v3
replaces; everything below the line is reused as-is (sidecar / IPC).

```
┌─ engine/  (pure Python, UI-free, JSON-serializable dicts) ─────────────┐
│  model.py      STYLE_KEYS, BUILTIN, make_project, resolve_style, …      │
│  render.py     project_to_render  (derive render-groups)                │
│  ass.py        build_ass  (Styles-by-box-mode + inline running deltas)  │
│  mutations.py  PURE (project, args) -> project  — every cue/style edit  │
│  io.py         serialize_project / load_project  (portable file)        │
│  ffmpeg.py     burn_cmd / frame_cmd + run(cmd, progress_cb), probe       │
│  (builds on core.py: ass_time, esc, rgb_to_ass, merge_subwords, …)      │
└─────────────────────────────────────────────────────────────────────────┘
        ▲ project dict + cfg dict  ← THE contract (file = its serialization)
┌─ controller.py  (UI-free) ───────────────────────────────────────────┐
│  Session: holds project + undo/redo (deep-copy); methods snapshot then  │
│  call engine.mutations; emits an on_change() callback. No tkinter.      │
└─────────────────────────────────────────────────────────────────────────┘
        ▲
┌─ view  (front-end-specific — NOT reused by v3) ──────────────────────┐
│  app_base.py  CTk widgets, preview canvas (per-cue), drag, dock,        │
│               after()-polling adapting engine.ffmpeg.run                │
│  karaoke_subtitle_gui.py  AppV2 = binding only: tk-vars↔cfg, toolbar/   │
│               rail/dock layout, lanes + inspector, wires a Session      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Contract (the durable part):**
- **`project`** dict — `words`, `layout` (events → `lines` → `toks`, each token now
  with `style`), each event with `style`, `fin_tags`, `fout_tags`, `globals`,
  `palette`. JSON-serializable.
- **`cfg`** dict — the global style/placement baseline + resolution context (what
  tk-vars bind to today; what JSON/IPC carries in v3).
- The **project file** is `serialize_project(project, cfg-globals, theme, placement)`.

**API stability:** `AppV2` keeps its existing method names (`make_tag`,
`set_global`, `layout_merge`, …) as **thin pass-throughs** to the controller, so the
editor code and `tests/test_v2_ui.py` keep working. New methods `set_group_style`,
`set_cue_style` follow the same pattern.

`old/` (v1) imports only `core.py` and its own UI — **not** the engine — so it stays
runnable and isolated.

### 1. Model & resolution — `engine/model.py`

```python
STYLE_KEYS = ["font","fontsize","bold","primary","outline","back",
              "back_alpha","outline_w","shadow","border_style"]
CUE_STYLE_KEYS = [k for k in STYLE_KEYS if k != "border_style"]   # C1
# layout[gi]["style"] = {}   (all keys)        token["style"] = {}   (no border_style)
```
- `make_project`: init `g["style"] = {}` and `tok["style"] = {}`.
- `resolve_style(token, group, gctx)` → per key: `token.style → group.style → gctx`;
  `border_style`: `group.style → gctx` only.

### 2. Render derivation — `engine/render.py`

`project_to_render` (was `project_to_render_v2`) copies through, per render-group, a
raw `group_style` dict and, per word, a raw cue `style` dict (no resolution here —
the global context lives in `cfg`, kept lazy). v1 render-groups lack these → `{}`.

### 3. ASS build — `engine/ass.py`

- **Styles-by-box-mode (C1):** emit one `[V4+ Styles]` per distinct *resolved group*
  `border_style` (e.g. `Default`=outline, `Box`=opaque); each `Dialogue` references
  the matching one. All other props inline.
- **Per-word inline running-state deltas:** inline tags persist within an event, so
  track a `cur` resolved-style state (init = global/Style baseline) and emit a tag
  for a property only when a word's resolved value (cue→group→global) **differs from
  the previous word's**. Correct reset + minimal output. Inline tags:
  `\fn \fs \b \1c \3c \4c \4a \bord \shad`, emitted alongside the unchanged fade
  tags (`\alpha`, `\t(...)`).

### 4. Mutations — `engine/mutations.py` (pure)

Every edit becomes `(project, args) -> project` (mutates the passed project; the
controller deep-copies first for undo). Migrate the current `AppV2` mutations:
`make_tag, clear_tag, set_tag_props, set_global, set_layout_props, toggle_word_del,
add_break, merge_prev_word, layout_merge, layout_ungroup, layout_split_event` — plus
new **`set_group_style(project, gi, partial)`** and **`set_cue_style(project,
token_ref|ids, partial)`** (drop keys reset to inherit; multi-select applies to every
token covered by `sel_ids`).

### 5. Project I/O — `engine/io.py`

- `serialize_project` / `load_project`: today's preset superset + each group's
  `style` + each token's `style`. **Backward compatible** (missing `style` ⇒ all
  inherit; keep the `nwords` guard). **Source paths omitted**; loader keeps current
  paths.
- Actions renamed **Save project / Load project**.

### 6. ffmpeg — `engine/ffmpeg.py`

Extract `burn_cmd(cfg, ass, out)`, `frame_cmd(cfg, ass, t, …)`,
`probe_duration(path)`, and a headless `run(cmd, progress_cb)` that parses
`-progress` and calls `progress_cb(frac)` — **no tkinter**. The CTk view keeps its
`after()`-poll loop but drives it through `run` + a thread, so v3 can reuse `run`
with a different transport.

### 7. Controller — `controller.py` (UI-free)

`Session` holds `project` + undo/redo stacks (deep-copy snapshots, the current
approach) and exposes `do(mutation, *args)` / `undo()` / `redo()` that call
`engine.mutations` and fire `on_change()`. The CTk App owns a `Session` and
subscribes `_rebuild_render` to `on_change`.

### 8. View — live preview rewrite (`app_base.py`)

`_draw_text_approx` goes **word-by-word**:
- Iterate **all** tokens per line (appeared + pending) to compute stable x positions
  (reserve space for pending words, as today).
- Per word resolve effective `font/size/bold/primary/outline` (cue→group→global);
  build/cache a `tkfont.Font` keyed `(family, px, bold)`; px via `_font_px_factor` +
  `self.sy()`.
- Line width = Σ word widths; left edge from the global anchor/alignment; line height
  = max `linespace` across the line's fonts.
- Draw appeared words only: 4-offset outline (word's outline color) + fill (word's
  primary). Box color/alpha/box-mode not drawn in tk (exact render only) — as today.

### 9. View — merged window + dock ergonomics (`app_base.py`)

Single window, Timeline-Dock (CTk-adapted, no waveform):

```
Toolbar:  brand .......... Undo Redo   Theme ▾
┌ left rail (CTkTabview: Style | Inspector) ┬ center: time slider + preview ┐
│  Style:    IO + global font/size/bold/    │   draggable placement box      │
│            align/colors/outline/shadow/    │                               │
│            box + global fade defaults      │                               │
│  Inspector: selection waterfall            │                               │
│            WORD(cue) / GROUP / GLOBAL      │                               │
├═══════════ adjustable separator ══════════╧═══════════════════════════════┤
│ Cue toolbar: Group · Ungroup · Split · Delete · Break · Merge   [Detach ⧉] │
│  LAYOUT · cue/words │ FADE-IN │ FADE-OUT      (the 3 synced lanes)          │
├─────────────────────────────────────────────────────────────────────────────┤
│ Generate .ass · Burn · Save project · Load project · Quit                    │
│ [progress]   status log                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

- `CueTableEditor` (Toplevel) is **dissolved** into the main window: its 3 lanes +
  cue toolbar → bottom dock; its property/inspector + global-fade defaults → left
  rail.
- **Dock height adjustable** (draggable separator, or collapse + a couple of presets)
  so lanes-vs-preview isn't a fixed compromise.
- **Detach dock** toggle pops the dock back into a Toplevel for the old two-window /
  multi-monitor workflow — making the merge purely additive.
- **Preserve explicitly:** selection model, drag/shift/ctrl multiselect, click-again
  drill-down, **collapsible layout groups (▸/▾)**, **preview-couple (scrub-to-
  selection)**, scroll-preservation, tooltips, themes, undo/redo,
  `_validate_selection`.

### 10. View — Inspector (left rail), tiered style editing

Tiers by selection (matches the design system Inspector):
- **WORD (cue)** — selected token: per-cue overrides; each field shows the resolved
  group/global value as the grey-italic inherited hint; blank/"inherit" clears.
- **GROUP** — selected header (or the parent of the selected word): per-group
  overrides incl. box-mode + existing `win_start/win_end/linger/accumulate`;
  inherited hint = global.
- **GLOBAL** — read-only reflection of the global defaults (edited in the Style tab).

Controls: numeric entries with grey global hint (reuse `_pe`); font = combo +
Choose…; bold/border_style = tri-state option menu (`inherit / …`); colors = swatch
with an **inherit** state + clear-to-inherit. Grey-italic = inherited, solid =
overridden. Edits call `AppV2.set_group_style` / `set_cue_style` → controller.

### 11. Copy / voice (minor, in-scope)

Adopt the cheap design-system conventions: **sentence-case** UI labels, **no emoji**
in the status log (replace `✓ ✗ ⚠` with text + semantic color), **timecodes/values
in monospace**. No restructuring beyond labels/log strings.

## Out of scope (v3 / Tauri)

Animation presets, waveform/word-block timeline, Project Library, synthwave skin;
per-group/per-cue **placement**; per-cue **box-mode** (C1).

## Verification

1. **Run:** `python3 karaoke_subtitle_gui.py`. Load `aligned_lyrics.json`. Single
   merged window; left-rail Style|Inspector; bottom 3-lane dock; adjustable + Detach;
   preview + drag work.
2. **Per-group:** select a header → set font/size/color/box-mode → live preview +
   "Render now" reflect it for that event only.
3. **Per-cue:** select a word → different font/size/color → live preview shows that
   one word differing within its line; "Render now" matches; a sibling with no
   override keeps group/global (delta-reset works).
4. **Waterfall:** changing a global default updates every inherited value live;
   clearing an override reverts to the grey inherited value.
5. **Build:** `.ass` has one `[V4+ Styles]` per distinct group box-mode + correct
   inline deltas; libass burn runs clean.
6. **Project file:** Save → Load round-trips global + group + cue style and all cue
   decisions; an old preset (no `style`) loads as all-inherit; no paths stored.
7. **Engine isolation:** `import engine` and `controller` succeed with tkinter
   absent (e.g. a headless smoke test that builds a project, mutates, derives,
   `build_ass`, serialize/load — no DISPLAY needed).
8. **Tests:** `python3 tests/test_v2_ui.py` passes incl. new cases (group/cue style
   set/clear/inherit, multi-select apply, project round-trip with style, build Styles
   + inline deltas, detachable dock selection paths). `old/` v1 still launches.
