# UI Kit — Desktop Editor (Karaoke Subtitle Studio v3)

A high-fidelity, interactive recreation of the **merged editor**: a single screen combining the old
app's main window + pop-out cue editor. Layout = **Timeline Dock** (controls left · big preview ·
full-width timeline + cue lanes docked at the bottom). Includes a **Project Library** home screen.

This is a **prototype** — pixel-accurate look + believable interactions, but the backend (ffmpeg /
libass / the ASS pipeline) is faked. See `../../HANDOFF_v3.md` for how it becomes real.

## Run
Open `index.html`. Loads React 18 + Babel (CDN), then the component scripts, then `theme.css`
(which `@import`s the design tokens from `../../colors_and_type.css`).

## What you can do (interactions)
- **Library → editor:** click any project card (or *New project*) to enter; click the brand to go back.
- **Playback:** play/pause + skip; the **live word** highlights and the playhead glides; the caption
  follows the active cue. Click the **waveform** to scrub.
- **Select:** click a word in the preview, a **block** in the timeline, or a row/header in the cue
  lanes. Selection opens the **Inspector**.
- **Edit a cue (revertible):** in the Inspector, change the word **text** and nudge **start/stop**
  bounds. **Split** a word into two timed **fractions**.
- **Add a cue:** *Word in group* (adds into the selected cue/group) or *New cue* (a standalone
  "solo" group). Both insert at the playhead.
- **Delete / Restore** a word (soft, revertible). **Undo / Redo** everything (top bar or toolbar).
- **Animation preset:** Style tab → pick Bounce / Pop / Glow / Typewriter (changes the live word's
  entrance).
- **Export:** shows a burn confirmation toast.

## Files & component contracts

| File | Exports (→ window) | Notes |
|---|---|---|
| `theme.css` | — | All component styling; imports the design tokens. |
| `icons.jsx` | `Icon({name,size,stroke})` | Inlined Lucide set. Names: play, pause, back, fwd, skipBack/Fwd, waveform, layers, type, sliders, sparkles, download, folder, search, plus, chevDown, settings, scissors, undo, redo, music, film, eye, clock, grid, align, check, close. |
| `atoms.jsx` | `Toggle, Stepper, Select, Combo, Swatches, Chip` | Presentational controls. |
| `stage.jsx` | `TopBar, PreviewStage, Waveform, WordTrack, fmt` | Top bar (brand/transport/export/undo-redo), the video preview + caption, the scrubbable waveform, the per-word block track. `fmt(seconds)` → `m:ss.cs`. |
| `panels.jsx` | `ControlsRail, Inspector, CueLanes, CueToolbar, PRESETS, groupRange` | Left rail (style + presets), the global→group→word **waterfall** inspector incl. the **CueEditor** (text + bounds), the 3-lane cue table, the add/split/delete/undo toolbar. |
| `library.jsx` | `ProjectLibrary, PROJECTS` | Recent-projects home screen. |
| `app.jsx` | mounts `App` | State + history (undo/redo), playback loop, and all cue operations; composes the editor. |

### Data model (the contract)
```js
groups: [{ id, label, solo:boolean, words: [{ id, text, s, e, fadeOut?, del?, frac? }] }]
// cue = one+ words; solo group = standalone cue.
// selection: { type:'word'|'group', id }
// everything mutates through a history (useHistory) → undo/redo.
```
`s`/`e` are seconds (cue start/stop bounds). The editor derives `allWords` (flattened, with group
index `gi` + `groupId`), the **live** word from the playhead, and the **active cue** for the caption.

### Cross-file scope note
Each `<script type="text/babel">` is transpiled separately, so components are shared via
`Object.assign(window, …)` at the bottom of each file. Don't add a second top-level
`const { useState } = React` in another file (it would collide); use `React.useState` inside
components there (as `panels.jsx`'s `CueEditor` does).

## Known fakes / limits
- No real audio/video decode, ffmpeg, or libass — the waveform and caption are illustrative.
- Animation presets show the *spirit* of each entrance, not the exact ASS transform.
- Designed for a desktop viewport (~1360×860+). In a very short pane the caption may wrap to two
  lines (realistic) — that's expected.

## Model fidelity vs the real engine (important)
This kit's `groups → words` shape is a **presentational simplification**. The shipped Python engine's
model is richer and is the source of truth — see `../../HANDOFF_v3.md` §6b. The kit deliberately drops:
- **Immutable word atoms** + stable indices (kit mutates word objects directly).
- **Multi-line layout events** (`lines:[{toks:[{ids,sep,del}]}]`) and **token merge/break** (`sep`).
- **Accumulate modes** (words | lines | off) and per-event **win_start / win_end / linger**.
- **Fade-in grouping** (`fin_tags`) — the kit only illustrates a fade-out group. The real lanes are a
  tag-grouping editor (drag-select → Group, drill-down), not the read-only display shown here.
- **Per-scope STYLE overrides** — the Inspector's GROUP "Font / Size" are *static placeholders*, not
  backed by a model field. Adding a `style_override` dict (resolved word→group→global) is the real
  feature; §6b of the handoff specs it, including why **box-vs-outline border mode** must be a
  group-scope `[V4+ Styles]` choice rather than an inline per-word tag.
- Built-in defaults are **fade-in 250 ms · fade-out 1000 ms** (reconciled).
