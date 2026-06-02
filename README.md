# Karaoke Subtitle Studio (v2)

Turn word-timed lyrics (Suno `aligned_lyrics.json`) into **styled, per-word fade-in/out
subtitles** as `.ass` (libass) or `.srt`, with a **live draggable preview** over your video and
a **merged single-window editor** — 3-lane cue dock (layout, fade-in, fade-out) and a
**Style | Inspector** left rail for global, per-group, and per-cue style overrides.

### Project layout

```
engine/                      # UI-free engine package (v3-portable)
  model.py                   #   project shape, make_project, STYLE_KEYS/CUE_STYLE_KEYS,
                             #   resolve_style, BUILTIN, PALETTE
  render.py                  #   project_to_render → render-groups (group_style + per-word style)
  ass.py                     #   build_ass (one [V4+ Styles] per distinct box-mode; inline deltas)
  io.py                      #   serialize_project / load_project (portable project file)
  mutations.py               #   pure (project, …) edits incl. set_group_style / set_cue_style
  ffmpeg.py                  #   command builders + headless run(cmd, progress_cb)
controller.py                # Session: project + undo/redo + on_change; no tkinter
core.py                      # shared UI-free helpers: parsing, constants (used by engine + view)
app_base.py                  # CTk view engine: App(ctk.CTk) — preview, burn, dock, drag
karaoke_subtitle_gui.py      # THE app — AppV2 binding + CueDock  ← run this
old/karaoke_subtitle_gui.py  # archived v1 (tree-based editor), kept runnable
ass_from_api.py / build_from_api.py / build_srts.py   # headless batch generators
tests/test_v2_ui.py          # 26-check UI regression suite
tests/test_engine.py         # headless engine/controller unit tests
```

`engine/` + `controller.py` are the UI-free portable core (`design-system/HANDOFF_v3.md`);
a future Tauri/React v3 is a **view-only rewrite** of `app_base.py` +
`karaoke_subtitle_gui.py` that reuses the engine unchanged. `old/` imports only `core.py`
and runs in isolation.

---

## Requirements

| Need | Why | Notes |
|------|-----|-------|
| Python 3.10+ with **tkinter** | the GUI | `sudo apt install python3-tk` if missing |
| **customtkinter** (managed dep) | modern themed UI chrome | installed into the poetry venv |
| **ffmpeg + libass** | exact libass preview & burning into video | `sudo apt install ffmpeg`; the build must report `--enable-libass` |
| **ffprobe** | burn progress (input duration) | ships with ffmpeg |
| **fontconfig** (`fc-list`, `fc-match`) | font picker + per-font sizing | standard on Linux |
| **Pillow** (managed dep) | makes the preview font size match libass exactly | optional; without it a 0.82 fallback scale is used |

Everything except Pillow is a system tool. Pillow is installed into the poetry venv.

## Setup & run

```bash
cd karaoke-subtitle-studio
poetry install            # creates the venv, installs deps
poetry run python karaoke_subtitle_gui.py          # the app
poetry run python old/karaoke_subtitle_gui.py      # archived v1 (optional)
```

(If you don't use poetry, the app also runs under any Python 3.10+ with tkinter; Pillow is optional.)

---

## The main window

A single merged window: **toolbar** at the top; **Style | Inspector left rail** on the left;
**live preview** in the center; **3-lane cue dock** at the bottom (adjustable height, detachable);
action bar + status log at the very bottom.

### Toolbar
- **Undo / Redo** — history via `controller.Session` (deep-copy snapshots).
- **Theme** — Light / Dark / System.

### Input / Output (Style tab)
- **aligned_lyrics.json** — the word-timed source (file picker). Changing it reloads the project.
- **Output .ass** — where Generate writes the subtitle.
- **Input video (optional)** — used as the live preview background and the burn source.
- **Output video** — burn destination.

### Style panel — global defaults
- **Font family** — editable combobox of all system families; **Choose…** opens a searchable
  picker dialog with a live font preview.
- **Font size** — in PlayRes pixels (your canvas resolution).
- **Bold** — toggle.
- **Alignment (anchor)** — numpad positions 1–9. Sets the text anchor.
- **Free placement (\pos)** — when on (default), text is placed by absolute `\pos(x,y)` derived
  from the on-screen box. When off, classic margin placement.
- **Fade-in (ms/word)** — default per-word fade-in duration.
- **Group by** — `section` or `line` when first building the cue project.
- **Skip '---' lines** — drop bare separator lines from the source.
- **Canvas W × H** — reference resolution; match your video (e.g. 1920×1080).
- **Margin L / R / V** — the bounding box edges (also driven by dragging on the preview).
- **Text / Outline / Box-shadow color** — color pickers.
- **Box alpha** — `00`=opaque … `FF`=clear.
- **Border style** — `1` = outline+shadow, `3` = opaque box behind text.
- **Outline width**, **Shadow depth** — in pixels.

### Inspector tab — per-group and per-cue style overrides

The **global < group < cue waterfall** (most specific wins). `None`/absent = inherit; the
inspector shows the inherited value as a grey hint.

- **WORD (cue)** — selected token: per-cue overrides for font, size, bold, primary/outline/box
  colors, box alpha, outline width, shadow depth. Blank = inherit.
- **GROUP** — selected event header: same set **plus** box-mode (`BorderStyle`). Box-mode cannot
  be per-cue (hard constraint — a `Dialogue` references one `[V4+ Styles]` and `BorderStyle` has
  no inline tag).
- **GLOBAL** — read-only reflection of the global defaults (edited in the Style tab).

### Preview / placement pane
- **Time slider** + time label — scrub the song. On release it (optionally) renders the exact frame.
- **Auto (libass)** — when on, releasing the slider/box renders the exact libass frame.
- **Render now** — force an exact libass render at the current time.
- **Canvas** — live subtitle on the video frame (or a solid background). Draggable bounding box
  with 8 handles. The on-canvas text is a **per-cue approximation** (each word's resolved
  font/size/colors); **Render now / Auto** is pixel-exact.

### Cue dock (bottom)
A 3-lane pane — **LAYOUT · FADE-IN · FADE-OUT** — one row per word under collapsible per-event
headers. Synced scrolling. Drag the separator above to adjust the dock height; use **Detach ⧉**
to pop it into its own window (recovers the old two-window workflow).

See [The cue dock](#the-cue-dock) below for full detail.

### Action bar & status
- **Generate .ass** — writes the subtitle file (instant).
- **Generate + Burn video** — burns the subtitle into the input video with ffmpeg, showing a
  progress bar. Runs off the UI thread.
- **Save project / Load project** — persist *everything* (global style + fade defaults + placement
  + theme + the full cue model incl. per-group and per-cue `style`) to a portable JSON. Source
  paths are **not stored**. Loading an older file without `style` fields treats all overrides as
  inherit. Loading against a different lyrics source keeps style/theme and warns that cues were
  skipped.
- **Quit**.
- A status log strip reports actions, warnings, and errors.

---

## The cue dock

Three synced panes — **LAYOUT · FADE-IN · FADE-OUT** — one row per word, under collapsible
per-event headers.

### The model (group → line → word, plus fade tags)
- **Words** are immutable canonical atoms with their source timings.
- **Layout** = ordered **events** (one ASS Dialogue each). An event holds **lines** (the `\N`
  breaks) holding **tokens** (rendered words; tokens can merge several source words). Each event
  carries an optional `style` dict (per-group overrides); each token carries an optional `style`
  dict (per-cue overrides, no box-mode).
- **Fade-in tags** and **fade-out tags** are independent sets of words that fade together.
- **Globals** hold the default fade-in ms, fade-out ms, and linger.

**Resolution is reactive — most specific wins:** `word → tag → global → built-in`. Editing a
global instantly re-resolves *every* inherited value shown in the table.

### Visual language
- Each fade group gets a **background color** from a 10-color palette (full-width color bar).
- **Grey italic** = inherited default. **Solid** = overridden. **Strikethrough/dim** = deleted
  (reversible).
- Cells show the **resolved value** (e.g. `@12.53/1000` = trigger 12.53s / 1000ms).

### Selecting
- Click a **fade cell** → selects that word's whole group (members highlighted).
- Click the **same cell again** → drills down to the single word.
- **Ctrl-click** fade cells → build a multi-word selection (then Group).
- Click a **layout header** → selects that event (Inspector shows GROUP tier).
- **Ctrl-click** headers to select several (for merge). Click **▸/▾** to collapse/expand.
- Click a **word in the LAYOUT lane** → selects the word (Inspector shows WORD tier).

### Toolbar ops
- **Group** — fade lane: make the selected words a fade group. Layout lane: merge adjacent events.
- **Ungroup** — fade lane: dissolve the group. Layout lane: split an event into one event per line.
- **Split event** — split the selected word's event so its line starts a new event.
- **Delete/Restore** — soft-delete the selected word(s) (reversible).
- **Break before / Break after** — insert a line break (`\N`) around the selected word.
- **Merge prev •** / **Merge prev ␣** — merge the word into the previous one (no space / space).
- **↶ Undo / ↷ Redo** — full history (via `controller.Session`).
- **Theme** — Light / Dark / System.
- **Preview-couple** — when on, selecting a group/word scrubs the main preview to its time.

### Fade semantics
- **Fade-in group** = words appear together. Trigger defaults to the group's first word's start.
- **Fade-out group** = words fade out together. Trigger defaults to the group's last word's end.
  Faded-out lines keep their `\N` row so remaining lines don't shift.
- **Accumulate** (per event): `words` = word-by-word reveal; `lines` = whole line at its first
  word; `off` = all visible for the window.

### Properties
- **Inspector** (left rail, changes with selection): layout event → GROUP tier;
  word → WORD tier; fade group → trigger/dur (blank = inherited).
- **Global defaults** (Style tab): fade-in ms, fade-out ms, linger — editing any of these
  live-updates every inherited (grey-italic) cell across all lanes and the preview.

### Hover tooltips
Hovering a fade cell shows the resolved value and its source — e.g.
`fade-out group · trigger: default 1.04s (last word end) · dur: default 1000ms (global)`.

---

## Persistence

**Save project** writes one portable JSON: global style + fade defaults + placement + theme +
the full cue model (`layout` events with per-group `style`, tokens with per-cue `style`, fade tags
with overrides, globals, palette). **Source paths are not stored**, so the file is portable.
Loading it onto the same `aligned_lyrics.json` restores everything exactly; onto a different source
it keeps style/theme and skips cues with a warning. Old preset files (no `style` keys) load with
all overrides defaulting to inherit.

---

## Batch scripts

Headless generators (no GUI). Run from the project root so `aligned_lyrics.json` resolves.

- **`ass_from_api.py`** — `aligned_lyrics.json` → `bleating.ass` with per-word fade-in. Style is a
  config block at the top of the file.
- **`build_from_api.py`** — emits several `.srt` variants from the API timings.
- **`build_srts.py`** — the original hand-mapped SRT variants. Kept for reference.

---

## Testing

```bash
# Headless engine/controller unit tests (no display needed)
.venv/bin/python tests/test_engine.py

# UI regression suite (needs a display or xvfb-run)
poetry run python tests/test_v2_ui.py
```

`tests/test_v2_ui.py` — 26 checks driving the editor via synthesized `<Button-1>` events at real
pixel coordinates: selection/drill-down, fade grouping, layout merge/split/ungroup, break/merge/
delete, global reactivity, undo/redo, per-group/per-cue style set/clear/inherit, project
round-trip with style, ASS Styles-by-box-mode + inline deltas, detachable dock selection, and
more. Exits non-zero on any failure.

`tests/test_engine.py` — headless units covering `engine/` and `controller.Session` with no
display required.

The suites assert **behavior and render-model correctness**, not pixel appearance.

---

## Known limitations / gotchas

- The on-canvas preview text is a **per-cue approximation** (word-by-word fonts/colors); trust
  **Render now / Auto** for the exact look.
- `\pos`-off (margin) mode can't push bottom-anchored text above the vertical center (libass clamp).
- Box-mode (`BorderStyle`) is **group-level only** — `BorderStyle` has no inline override tag in
  ASS, so all cues in one event share box-mode.
- Fade groups can span events; the boundary-word default keeps that sane, but an overridden trigger
  outside an event's window will clamp.
- Burn progress polls ffmpeg on a worker thread; very short clips may jump straight to 100%.

See **CLAUDE.md** for data provenance (the Suno API), the ASS rendering techniques, and
engineering notes.
