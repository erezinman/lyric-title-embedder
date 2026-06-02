# CLAUDE.md — project context & engineering notes

Context for future Claude sessions (and humans). The user-facing feature reference is in
**README.md**; this file covers **where the data comes from, how the subtitle pipeline works, the
ASS techniques, the code architecture, and conventions/gotchas**.

## What this project is

A toolkit to turn **word-level-timed lyrics** into **karaoke-style subtitles** with per-word
fade-in/out, precise placement, and grouping — as `.ass` (libass) or `.srt`. Primary deliverable is
the GUI (`karaoke_subtitle_gui_v2.py`); batch scripts exist for headless generation.

## Background & data provenance (important)

- The example song is **"Bleating Obsession"**, generated on **Suno** (`suno.com`).
- Word timings come from Suno's internal **aligned-lyrics API**, the same one the
  **"Suno Lyric Downloader"** Chrome extension (GitHub `zh30/get-suno-lyric`) uses. The extension's
  content script calls, via the service worker:
  ```
  GET https://studio-api.prod.suno.com/api/gen/<songId>/aligned_lyrics/v2/
  Authorization: Bearer <suno session JWT>
  ```
  (plus `/api/clip/<songId>` for duration). It's processed locally; nothing is uploaded.
- We fetched it directly with the user's session token and saved the raw response as
  **`aligned_lyrics.json`**. Shape:
  - `aligned_words`: flat list of `{word, success, start_s, end_s, p_align}` — **sub-word tokens**
    (e.g. `"*Ba"`, `"a..."`); newlines inside `word` mark real line breaks. ~363 tokens here.
  - `aligned_lyrics`: list of `{text, start_s, end_s, section, words:[{text,start_s,end_s}]}` —
    Suno's own line segmentation (often splits mid-word/mid-phrase; not authoritative).
  - `waveform_data`, `duration`, etc.
- **Tokens (whole words)** are reconstructed by merging sub-word tokens on whitespace boundaries.
  Lines are reconstructed by merging Suno lines that are lowercase continuations. This is why the
  editor lets you re-cut line breaks: Suno's segmentation is messy.

Treat any pasted Suno bearer token as a short-lived credential; it expires quickly (the one used
during development is long dead).

## Pipeline / data flow

```
Suno API  ──►  aligned_lyrics.json  ──►  reconstruct_lines + merge_subwords  ──►  canonical words
                                                                                      │
                          ┌───────────────────────────────────────────────────────────┤
                          ▼                                                             ▼
                 build_from_api.py / ass_from_api.py                        editable cue project (v2)
                 (headless SRT/ASS variants)                                 layout + fade tags + globals
                                                                                      │
                                                                          project_to_render_v2  (bake fades)
                                                                                      │
                                                                          render-groups  ──►  build_ass_v2  ──►  .ass
                                                                                      │
                                                                          tkinter preview / libass render / ffmpeg burn
```

## Code architecture

Flat modules (no package; `package-mode = false` in poetry). Run scripts directly.

- **`karaoke_subtitle_gui.py` (v1, ~1400 lines)** — the engine + a tree-based cue editor:
  - Pure helpers: `ass_time`, `esc`, `rgb_to_ass`, `reconstruct_lines`, `merge_subwords`,
    `token_text/token_span`, `is_dashes`, `list_font_families`, `total_duration`.
  - `App` (tk.Tk): scrollable style controls, the **preview canvas with the draggable placement
    box**, libass exact-render, **ffmpeg burn with progress** (worker thread + main-thread poller),
    preset save/load, the **per-font preview sizing factor** (`_font_px_factor`, uses Pillow).
  - v1 model: `make_project`/`project_to_render`/`build_ass`, `CueEditor` (Treeview, line=dict with
    `toks`+`fout_at`, per-line fade-out, group fade_out, linger).
- **`karaoke_subtitle_gui_v2.py` (v2, ~1000 lines)** — **subclasses `base.App`** and reuses all of
  its engine. It overrides only the model/build/editor:
  - `make_project_v2` / `project_to_render_v2` / `build_ass_v2`, `serialize_cues_v2` / `apply_cues_v2`.
  - `AppV2`: swaps in the v2 model, v2 build, undo/redo stack, v2 preset (`cues_v2` + `theme`).
  - `CueTableEditor`: the 3-lane `tk.Text` table, themes, tooltips.
  - Key trick: **v2's render-groups keep v1's shape** `{start,end,accumulate,lines:[{words:[{text,
    start_s,end_s,fin_ms,fout_at,fout_ms}]}]}`, so v1's preview/approximation/burn just work. All
    fade behavior is **baked into per-word `start_s`/`fout_at`** in `project_to_render_v2`, so
    `build_ass_v2` is uniform (no per-mode branching).

### v2 model (the source of truth)
```python
project = {
  "words":  [{text,start,end}],                       # immutable canonical atoms
  "layout": [{label, win_start, win_end, linger, accumulate, del,
              "lines":[{"toks":[{ids,sep,del}]}]}],    # events → lines(\N) → tokens
  "fin_tags":  [{ids:set, color:int, trigger, dur}],   # appear-together
  "fout_tags": [{ids:set, color:int, trigger, dur}],   # fade-together
  "globals": {fade_in_ms, fade_out_ms, linger},
  "palette": [10 colors],
}
```
Resolution (reactive, most-specific wins): **word → tag → global → built-in**. `None`/blank = inherit.
Fade-in trigger default = first member word start; fade-out trigger default = last member word end.

## ASS / libass techniques (the rendering core)

- **Absolute placement:** `{\pos(x,y)}` per event, from the box anchor — avoids the libass quirk
  where bottom-anchored `MarginV` can't go past the vertical center. Safe because every line break
  is explicit (`\N`), so we never rely on margin wrapping.
- **`WrapStyle: 2`** — no automatic wrapping; break only on `\N`. So resizing the box never re-wraps.
- **Per-word fade-in:** each word starts `\alpha&HFF&` (transparent) then `\t(in, in+dur,\alpha&H00&)`.
  All words present from event start (alpha-hidden), so the **layout is fixed** — words fade in
  *in their final place* (no re-centering).
- **Fade-out:** append `\t(out, out+dur, \alpha&HFF&)`. Per-word/line/group via the tags; faded
  lines keep their `\N` row so others don't move.
- **Accumulate modes** collapse to per-word `start_s`: `words` = own time, `lines` = line's first
  word, `off` = window start. Fade-in groups override to a shared trigger.
- **Preview font sizing:** libass renders ~`0.78 × Fontsize` of ink height regardless of font;
  FreeType's ink/pixel ratio varies per font. So the tkinter preview uses pixel size
  `0.78 × Fontsize / FreeType_ink_ratio`, measured per font via Pillow + `fc-match`
  (`LIBASS_INK_AT_100 = 78`, fallback factor 0.82). Tk font sizes are **negative** = pixels.
- **Burn:** `ffmpeg -i video -vf "ass='file.ass'" -c:a copy out.mp4`; preview frames use
  `-ss t -copyts` so libass renders the event active at the true timestamp.

## System dependencies (not pip)
`ffmpeg`+libass (`--enable-libass`), `ffprobe`, fontconfig (`fc-list`/`fc-match`), tkinter
(`python3-tk`). Pillow is the only managed pip dep (optional; graceful fallback).

## Testing
`tests/test_v2_ui.py` — 22 headless UI checks driving the editor via synthesized `<Button-1>`
events at real coordinates. Asserts state/render correctness (not pixels). Run:
`poetry run python tests/test_v2_ui.py` (needs a display or `xvfb-run`). Re-run after any editor
change; it has already caught real bugs (drill-on-first-click, stale-selection crash,
header misalignment).

## Conventions & gotchas
- **Tk threading:** never touch widgets / call `after()` from a worker thread. The burn uses a
  shared state dict + a main-thread `_poll_burn`. Keep this pattern.
- **`tk.Text` colors per *row*, not per cell** — that's why the editor uses three side-by-side Text
  panes (one per lane), and pads fade cells to full width so group colors render as solid bars.
- **Structural edits invalidate selection indices** — `CueTableEditor._validate_selection()` clears
  stale `sel_word`/`sel_group` on reload; call paths must go through `reload()`.
- **Canonical word indices are stable** (words are immutable); tags/tokens reference them, which is
  what makes presets reload-safe. Keyed by `nwords`.
- **v2 reuses v1 by shape, not by copying** — if you change v1's render-group shape, v2 breaks.
- Default file paths resolve relative to the script dir (`HERE`); run batch scripts from the repo
  root so `aligned_lyrics.json` is found.

## Roadmap / open ideas
- **customtkinter** migration for a nicer look (would be a managed dep; uncomment in `pyproject.toml`).
  Note: the editor's 3-pane `tk.Text` table relies on raw Text tag styling — customtkinter wraps tk
  widgets, so the table likely stays `tk.Text` while chrome (buttons/frames/combos) becomes ctk.
- Layout-lane word **reordering / moving words between events** (drag).
- Per-event `\pos` override (currently `\pos` is global from the placement box).
- A proper packaged entry point (`ksstudio` console script) if/when it becomes a real package.
