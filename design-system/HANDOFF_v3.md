# HANDOFF_v3 — Building Karaoke Subtitle Studio v3 for real

This is the developer handoff for **path B**: rebuild the front-end as a modern shell **on top of the
existing Python core**, achieving the fidelity in `ui_kits/desktop-app/`. The visual + interaction
spec is the UI kit; this doc covers architecture, the bridge to the engine, the preview/perf plan,
and how each new feature maps onto code that already exists.

> TL;DR: keep `core.py` + the ASS/ffmpeg pipeline as the **engine**. Replace the CustomTkinter GUI
> with a **Tauri** (Rust + system-webview) shell rendering the React UI from the kit. Same engine,
> full fidelity, small footprint.

---

## 1. Why not CustomTkinter

CTk is a themed-Tk widget set. It can carry the *palette* (theme JSON) and restyled buttons/inputs,
but the defining parts of v3 — the timeline dock, animated glowing captions, floating inspector,
smooth playback highlight — are exactly what CTk fights you on (no timeline/waveform widget, no
CSS-grade animation, no compositing/glow). A CTk reskin lands ~40–50% of the design at the highest
effort. So v3 is a new front-end, not a reskin.

## 2. Recommended stack

- **Shell:** **Tauri 2** (Rust core + OS webview). ~tens of MB, low RAM, signed installers,
  filesystem + process APIs. (Electron also works but bundles Chromium — heavier.)
- **Front-end:** the kit's React components, built with Vite + TypeScript. The `*.jsx` here are the
  starting components; promote to `.tsx`, add real state management as needed.
- **Engine:** the **existing Python** (`core.py`, `build_ass_v2`, `project_to_render_v2`, ffmpeg
  burn). Ship it as a **sidecar** process (PyInstaller one-file) that Tauri spawns, or call ffmpeg
  directly from Rust and keep only the model/ASS logic in Python.
- **Alternative:** PySide6 + QML if you must stay all-Python — performant and GPU-accelerated, but
  the kit's web components don't port (you'd rebuild the UI in QML against this same spec).

## 3. Architecture

```
┌───────────────────────────── Tauri shell ─────────────────────────────┐
│  WebView (React UI from ui_kits/desktop-app)                            │
│    • Project Library, editor, timeline, cue lanes, inspector            │
│    • <video> live preview + CSS/Canvas caption overlay                  │
│        │  invoke()/IPC                                                   │
│  Rust core                                                              │
│    • file dialogs, fs, project save/load (preset JSON)                  │
│    • spawns Python sidecar / ffmpeg; streams progress                   │
│        │  stdin/stdout (JSON) or temp files                             │
│  Python engine (unchanged logic)                                        │
│    • parse aligned_lyrics → model • project_to_render_v2 → build_ass_v2  │
│    • ffmpeg+libass: exact frame render & final burn                     │
└─────────────────────────────────────────────────────────────────────────┘
```

The model (groups → words, fade tags, globals, palette) is the contract. The web UI edits it; the
engine consumes the **same shape** the kit already uses (see the kit README's data model — it
mirrors `karaoke_subtitle_gui.py`'s v2 project).

## 4. The rendering preview (the crux)

Two tiers, same split the current app already makes (approx vs exact) — just a far better "approx":

1. **Live editing preview (interactive, 60fps).** Play the real footage in a `<video>` element
   (hardware-decoded) and draw the caption as a **CSS/Canvas overlay**. The animation presets
   (Bounce/Pop/Glow/Typewriter) *are* CSS/Canvas animations, so the live preview is near-final and
   fully scrubbable. The placement box drags in the DOM and writes back `\pos`/margins.
2. **Exact frame / final (authoritative).** On demand ("Render exact") and on Export, call the
   engine to run **ffmpeg + libass** on the generated `.ass` — identical to today's `_render_exact`
   / burn, with `-progress` driving the bar. The web layer never re-implements libass.

**Honest caveat:** the CSS overlay won't be glyph-for-glyph identical to libass (browser vs libass
font metrics) — the *same* caveat the current app documents. Workflow stays: edit on the live
overlay, trust the exact render for ground truth. Because the overlay is much closer than the old tk
approximation, you reach for the exact render less.

Codec note: webviews decode common mp4/h264 fine; for exotic inputs, have the engine transcode a
lightweight proxy for the preview while burning the original.

## 5. Performance

The UI workload is light. The only scaling concern is a **dense** timeline (hundreds–thousands of
words):
- Draw the **waveform + word-block track on a `<canvas>`** (not DOM nodes); hit-test in JS.
- **Virtualize** the cue-lane list to the visible range.
- Playback highlight via `requestAnimationFrame`, updating only the active node — never re-render
  the whole tree per frame.
- Debounce engine calls (exact render) behind the live overlay.

The heavy lifting (decode, libass, encode) is the engine's job, off the UI thread.

## 6. Feature → engine mapping (none of this is from scratch)

| v3 feature | Maps to existing engine concept |
|---|---|
| **Cue** (word or words, start/stop) | a token/run in a layout **event**; bounds = word `start_s`/`end_s`. |
| **Add cue in group** | append word(s) to a layout event's line/tokens. |
| **New cue (solo group)** | a new layout **event** with its own line. |
| **Edit text / bounds** | mutate token text / word `start`/`end`; re-run `project_to_render_v2`. |
| **Fraction (split)** | split a token into sub-word tokens — the repo's sub-word merge/`add_break`/`merge_prev_word` machinery already models this. |
| **Undo/redo, revertible** | the app already deep-copies the project per op (`push_undo`). |
| **global → group → word waterfall** | literally the existing `word → tag → global → built-in` resolution. |
| **Animation presets** (Bounce/Pop/Glow/Typewriter) | compile to per-word ASS transforms: fade already uses `\t(…\alpha…)`; add `\fscx/\fscy` (Pop), `\t`+`\frz`/`\move` (Bounce), `\blur`/`\3c` (Glow), per-char reveal (Typewriter). Emit in `build_ass_v2`. |
| **Real-time word highlight** | preview resolves active word by timestamp (already done in `full_text_at` / preview). |
| **Group fade-in/out** | the existing `fin_tags`/`fout_tags` (appear/fade together). |
| **Export / burn** | unchanged ffmpeg `-vf "ass='…'" -c:a copy` with `-progress`. |
| **Project library / presets** | the existing preset JSON (style + box + full cue model), one file per project. |

## 7. Suggested milestones

1. **Shell + library:** Tauri app, Project Library reading preset JSONs from a projects folder.
2. **Read-only editor:** load a project, render timeline/lanes/preview from the model; playback +
   live caption overlay; exact-render button calling the engine.
3. **Editing:** text/bounds, add cue (group & solo), split fraction, delete/restore, undo/redo —
   each writing the model and re-deriving render groups.
4. **Styling:** style controls + animation presets compiled into `build_ass_v2`; inspector waterfall.
5. **Export:** burn with progress; preset save/load round-trip.
6. **Polish:** canvas timeline + virtualization for long songs; reduced-motion; keyboard shortcuts.

## 8. Where the spec lives
- **Look & tokens:** `colors_and_type.css` (+ `preview/*` specimens).
- **Components & interactions:** `ui_kits/desktop-app/` (+ its README's contracts & data model).
- **Voice, iconography, foundations:** root `README.md`.
- **Design-in-brand for future agents:** `SKILL.md`.
