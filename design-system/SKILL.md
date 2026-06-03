---
name: karaoke-subtitle-studio-design
description: Use this skill to generate well-branded interfaces and assets for Karaoke Subtitle Studio, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create
static HTML files for the user to view. If working on production code, you can copy assets and read
the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or
design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production
code, depending on the need.

## Fast orientation
- **Brand:** Karaoke Subtitle Studio — a desktop tool turning word-timed lyrics into styled karaoke
  captions. Direction is **Synthwave**: hot magenta `#FF3DA6` + violet `#8A5BFF` + cyan `#3DE0FF`
  live-signal, on **violet-black** surfaces. Voice is **crisp/pro**, sentence case, no emoji,
  timecodes/values always in mono.
- **Tokens:** everything is in `colors_and_type.css` (color, type, spacing, radii, shadows + the
  `.ks-*` type classes). Import it; never hardcode hexes.
- **Type:** Space Grotesk (display/caption), Hanken Grotesk (UI/body), JetBrains Mono (data). Loaded
  from Google Fonts CDN — self-host into `fonts/` for offline.
- **Icons:** Lucide (inlined in `ui_kits/desktop-app/icons.jsx`). Reuse it; don't hand-draw icons.
- **Logo:** `assets/logo-mark.svg` (gradient tile) and `assets/logo-glyph.svg` (bars-on-dark).
- **Components:** the merged editor lives in `ui_kits/desktop-app/` — TopBar, PreviewStage,
  Waveform/WordTrack, ControlsRail, CueLanes, Inspector (global→group→word waterfall), CueEditor
  (text + start/stop bounds), CueToolbar, ProjectLibrary. Copy/adapt these rather than reinventing.
- **Specimens:** `preview/*` are the design-system cards (foundations + component states).

## Core product concepts to respect
- A **cue** = a subtitle = one or more **words**, each with **start/stop** bounds.
- Cues live in a **group**, or stand alone (a **solo** cue = its own group).
- Styling/timing resolves **global → group → word** (most specific wins).
- Per-word fade-in/out; animation presets: Karaoke Bounce / Pop / Glow / Typewriter.

## Rules of thumb
- Neon is a seasoning: accent on the live word, primary CTA, playhead, logo — not whole panels.
- Selected = magenta ring + faint tint. Hover = lift one surface step. Press = 1px down.
- Surfaces opaque; blur only for floating overlays. Cards: `--surface-2`, 1px border, soft shadow.
- Keep copy terse and confident; UI labels sentence case; data in mono.

## Build / handoff
- For real implementation, read `HANDOFF_v3.md` — v3 is a Tauri/web shell over the existing Python
  core (`core.py` + ffmpeg/libass), with the feature→engine mapping and preview/perf architecture.
