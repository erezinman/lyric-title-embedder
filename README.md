# Karaoke Subtitle Studio (v2)

Turn word-timed lyrics (Suno `aligned_lyrics.json`) into **styled, per-word fade-in/out
subtitles** as `.ass` (libass) or `.srt`, with a **live draggable preview** over your video and
a **3-lane cue editor** for fine control of layout, fade-in, and fade-out.

Two GUIs ship in this repo:

- **`karaoke_subtitle_gui_v2.py`** — the current app. Everything in v1 **plus** the tag-based
  3-lane cue table editor, themes, undo/redo, and per-word fade-out groups. **Start here.**
- **`karaoke_subtitle_gui.py`** — v1 (kept as a stable fallback). Same style/preview/burn engine
  with a simpler tree-based cue editor. v2 subclasses it and reuses its engine.

There are also three headless batch scripts (`ass_from_api.py`, `build_from_api.py`,
`build_srts.py`) for generating subtitles without the GUI — see [Batch scripts](#batch-scripts).

---

## Requirements

| Need | Why | Notes |
|------|-----|-------|
| Python 3.10+ with **tkinter** | the GUI | `sudo apt install python3-tk` if missing |
| **ffmpeg + libass** | exact libass preview & burning into video | `sudo apt install ffmpeg`; the build must report `--enable-libass` |
| **ffprobe** | burn progress (input duration) | ships with ffmpeg |
| **fontconfig** (`fc-list`, `fc-match`) | font picker + per-font sizing | standard on Linux |
| **Pillow** (managed dep) | makes the preview font size match libass exactly | optional; without it a 0.82 fallback scale is used |

Everything except Pillow is a system tool. Pillow is installed into the poetry venv.

## Setup & run

```bash
cd karaoke-subtitle-studio
poetry install            # creates the venv, installs Pillow
poetry run python karaoke_subtitle_gui_v2.py
```

(If you don't use poetry, the app also runs under any Python 3.10+ with tkinter; Pillow is optional.)

---

## The main window

A split layout: **scrollable controls on the left**, **live preview on the right**, an action
bar and a progress bar/log along the bottom.

### Input / Output panel
- **aligned_lyrics.json** — the word-timed source (file picker). Changing it reloads the project.
- **Output .ass** — where Generate writes the subtitle.
- **Input video (optional)** — used as the live preview background and the burn source.
- **Output video** — burn destination.

### Style panel (all controls)
- **Font family** — editable combobox of all system families; **Choose…** opens a searchable
  picker dialog with a live font preview (double-click or OK to select).
- **Font size** — in PlayRes pixels (your canvas resolution).
- **Bold** — toggle.
- **Alignment (anchor)** — numpad positions 1–9 (bottom-left … top-right). Sets the text anchor.
- **Free placement (\pos)** — when on (default), text is placed by absolute `\pos(x,y)` derived
  from the on-screen box, giving full vertical freedom. When off, classic margin placement (note:
  libass clamps bottom-anchored `MarginV` at center, so vertical control is limited).
- **Fade-in (ms/word)** — default per-word fade-in duration.
- **Group by** — `section` (one event per section header) or `line` (one event per lyric line)
  when first building the cue project.
- **Skip '---' lines** — drop the bare `---` separator lines from the source.
- **Canvas W × H** — reference resolution; match your video (e.g. 1920×1080).
- **Margin L / R / V** — the bounding box edges (also driven by dragging on the preview).
- **Text / Outline / Box-shadow color** — color pickers.
- **Box alpha** — `00`=opaque … `FF`=clear, for the box/shadow color.
- **Border style** — `1` = outline+shadow, `3` = opaque box behind text.
- **Outline width**, **Shadow depth** — in pixels.

### Preview / placement pane
- **Time slider** + time label — scrub the song. On release it (optionally) renders the exact frame.
- **Auto (libass)** — when on, releasing the slider/box renders the exact libass frame; off uses
  only the fast tkinter approximation.
- **Render now** — force an exact libass render at the current time.
- **Canvas** — shows the video frame (if a video is loaded) or a solid background, with the live
  subtitle. A dashed **bounding box with 8 handles**:
  - drag the **body** to move the text anchor,
  - drag a **corner/edge handle** to resize the box (sets MarginL/R/V live).
  - The on-canvas text is a fast approximation; **Render now / Auto** is pixel-exact.
- Background frame extraction is cached and refreshed on slider release (so scrubbing stays smooth).

### Action bar & status
- **Edit cues…** — opens the [Cue Table editor](#the-cue-table-editor).
- **Generate .ass** — writes the subtitle file (instant).
- **Generate + Burn video** — burns the subtitle into the input video with ffmpeg, showing a
  **progress bar** (driven by ffmpeg `-progress`, total from ffprobe). Runs off the UI thread.
- **Save preset / Load preset** — persist *everything* (style + box + theme + the full cue model)
  to a JSON. Loading against a different lyrics source keeps style/theme and warns that cues were
  skipped.
- **Quit**.
- A green **log** strip reports actions, warnings, and errors.

---

## The Cue Table editor

A pop-out window with **three synced panes** — **LAYOUT · FADE-IN · FADE-OUT** — one row per word,
under collapsible per-event headers. This is where you shape exactly when and how each word/line
appears and disappears.

### The model (Group → Line → Word, plus fade tags)
- **Words** are immutable canonical atoms with their source timings.
- **Layout** = ordered **events** (one ASS Dialogue each). An event holds **lines** (the `\N`
  breaks) holding **tokens** (rendered words; tokens can merge several source words).
- **Fade-in tags** and **fade-out tags** are independent sets of words that fade **together**.
- **Globals** hold the default fade-in ms, fade-out ms, and linger.

**Resolution is reactive — most specific wins:** `word → tag → global → built-in`. Editing a
global instantly re-resolves *every* inherited value shown in the table.

### Visual language
- Each fade group gets a **background color** from a 10-color palette (full-width color bar).
- **Grey italic** = inherited default. **Solid** = overridden. **Strikethrough/dim** = deleted
  (reversible).
- Cells show the **resolved value** (e.g. `@12.53/1000` = trigger 12.53s / 1000ms), so you always
  see what's actually applied.

### Selecting
- Click a **fade cell** → selects that word's whole group (members highlighted).
- Click the **same cell again** → drills down to the single word.
- **Ctrl-click** fade cells → build a multi-word selection (then Group).
- Click a **layout header** → selects that event (for its properties); **Ctrl-click** headers to
  select several (for merge). Click the header's **▸/▾ arrow** to collapse/expand the event.
- Click a **word in the LAYOUT lane** → selects the word for word-level ops.

### Toolbar ops
- **Group** — fade lane: make the selected words a fade group (next palette color). Layout lane:
  merge the selected **adjacent** events into one.
- **Ungroup** — fade lane: dissolve the group (members revert to default). Layout lane: split an
  event into one event per line.
- **Split event** — split the selected word's event so its line starts a new event.
- **Delete/Restore** — soft-delete the selected word(s) (reversible; rendered as struck-through and
  omitted from output).
- **Break before / Break after** — insert a line break (`\N`) around the selected word.
- **Merge prev •** / **Merge prev ␣** — merge the word into the previous one as a single rendered
  word, with no space (`forehead`) or a space (`fore head`). Unmerge by… re-splitting (Break).
- **↶ Undo / ↷ Redo** — full history of every editor op.
- **Theme** — `Light` / `Dark` / `System` (see [Themes](#themes)).
- **Preview-couple** — when on, selecting a group/word scrubs the main preview to its time.

### Fade semantics (what the groups mean)
- **Fade-in group** = the words **appear together**. Trigger defaults to the group's **first word's**
  appearance time; duration defaults to the global fade-in. Both overridable.
- **Fade-out group** = the words **fade out together**. Trigger defaults to the group's **last
  word's end**; duration defaults to the global fade-out. Both overridable — e.g. set a fade-out
  trigger to a later time to fade lines 1–2 out as lines 3–4 arrive. Faded-out lines **keep their
  row**, so remaining lines don't shift.
- **Accumulate** (per event, in its properties): `words` = word-by-word reveal (karaoke); `lines` =
  whole line appears at its first word; `off` = all visible for the window.

### Properties panels
- **Context panel** (changes with selection):
  - *Layout event:* window **start/end** (blank = auto from words), **linger** (blank = global),
    **accumulate**. `↳ default` hints show the inherited value/source.
  - *Fade group:* **trigger** and **dur** (blank = inherited; hints show the boundary-word/global
    defaults).
  - *Word:* shows its text, source start time, and deleted state.
- **Global defaults panel:** fade-in ms, fade-out ms, linger — editing any of these live-updates
  every inherited (grey-italic) cell across all three lanes and the preview.

### Hover tooltips
Hovering a fade cell (after ~0.6s) shows the resolved value **and its source** — e.g.
`fade-out group · trigger: default 1.04s (last word end) · dur: default 1000ms (global)`, or
`overridden …` when you've set a value.

### Themes
- **Light** — light panes, pastel group colors, dark text.
- **Dark** — dark panes, muted group colors, light text (default).
- **System** — uses the OS ttk look with light panes.
- Forcing Light/Dark switches the ttk look app-wide (so the editor is readable even on a dark
  system). The chosen theme is saved in presets.

### Layout that survives resizing
Each lane's header sits inside its column, so headers stay aligned with their panes at any window
width; all three panes scroll together.

---

## Persistence

`Save preset` writes one JSON containing the style, the placement box/margins, the theme, **and**
the entire cue model (`cues_v2`): events, line breaks, token merges, deletions, fade tags with
their overrides, per-event window/linger/accumulate, globals, and palette. It is keyed by source
word count, so loading it onto the same `aligned_lyrics.json` restores everything exactly; onto a
different source it keeps style/theme and skips the cues with a warning.

---

## Batch scripts

Headless generators (no GUI). Run from the project root so `aligned_lyrics.json` resolves.

- **`ass_from_api.py`** — `aligned_lyrics.json` → `bleating.ass` with per-word fade-in. Style is a
  config block at the top of the file (font, size, alignment, margins, colors, fade ms, group-by).
- **`build_from_api.py`** — emits several `.srt` variants from the API timings:
  `*_words` (one cue per word), `*_lines` (per reconstructed line), `*_v1_by_section`,
  `*_v2_pairs`, `*_v3_sliding_pairs`, `*_v4_cumulative`, `*_v5_word_accum`.
- **`build_srts.py`** — the original hand-mapped SRT variants (by-section / pairs / sliding pairs),
  predating the API extraction. Kept for reference.

---

## Testing

```bash
poetry run python tests/test_v2_ui.py
```

A 22-check UI regression suite that drives the editor through **synthesized click events** at real
pixel coordinates (so hit-testing is exercised, not bypassed): selection/drill-down, fade grouping
and the one-tag-per-word invariant, layout merge/split/ungroup, break/merge/delete, global
reactivity, undo/redo, serialize round-trip, valid ASS output, and more. Exits non-zero on any
failure. Needs a display (`:0`/`:1`) or `xvfb-run`.

The suite asserts **behavior and render-model correctness**, not pixel appearance — visual glitches
(exact colors, tooltip flicker) are best caught by eye.

---

## Known limitations / gotchas

- The on-canvas preview text is an **approximation**; trust **Render now / Auto** for the exact look.
- `\pos`-off (margin) mode can't push bottom-anchored text above the vertical center (libass clamp).
- Fade groups can span events; the boundary-word default keeps that sane, but an overridden trigger
  outside an event's window will clamp.
- Burn progress polls ffmpeg on a worker thread; very short clips may jump straight to 100%.

See **CLAUDE.md** for data provenance (the Suno API), the ASS rendering techniques, and design notes.
