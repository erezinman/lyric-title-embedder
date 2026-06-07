# Karaoke Subtitle Studio — Design System

A complete brand + UI design system for **Karaoke Subtitle Studio**, a desktop tool that turns
**word-timed lyrics into styled karaoke captions** (per-word fade-in/out, precise placement,
grouping) and burns them into video. This design system reimagines the product as a sleek,
**Synthwave**-themed modern pro-tool ("v3").

> **Direction summary** — sleek dark, electric-accent (hot magenta + violet on violet-black),
> crisp/pro voice, for solo creators & YouTubers. The design *reimagines* the UX into a single
> merged editor; it is not a 1:1 copy of the current app's look.

---

## What the product is

Karaoke Subtitle Studio ingests **word-level timed lyrics** (e.g. Suno's `aligned_lyrics.json`),
reconstructs clean lines/words, and lets you shape exactly **when and how each word appears and
disappears** — then exports `.ass` (libass) / `.srt` or burns subtitles into a video via ffmpeg.

The defining mental model (kept from the real engine and central to the brand):

- **Cue** = a subtitle: one or more **words**, each with its own **start/stop** bounds.
- Cues live in a **group** (event), or stand alone (a **solo** cue = its own group).
- Styling/timing resolves through a **waterfall: global → group → word** (most specific wins).
- Per-word **fade-in / fade-out** groups; **animation presets** (Bounce / Pop / Glow / Typewriter).
- A **live preview** over the video with a draggable placement box, plus exact libass render.

### Surfaces in this system
- **Desktop editor** (the product) — a single *merged* screen: controls + big preview + a
  timeline (waveform + per-word blocks) docked over detailed cue lanes, with a global→group→word
  inspector. Includes a **Project Library** home screen.
- (No marketing site or mobile app in scope — desktop editor only.)

---

## Sources (provenance)

Built by reading the real codebase — not screenshots.

- **GitHub:** `https://github.com/erezinman/lyric-title-embedder` (branch `main`)
  - Read: `app_base.py` (UI engine), `karaoke_subtitle_gui.py` (v2 app + 3-lane cue editor),
    `core.py` (constants, ASS helpers, resolution model), `CLAUDE.md` (data provenance + ASS
    techniques), `pyproject.toml`, `examples/sample_preset.json`.
- The current app is **Python + CustomTkinter** (dark mode + stock "blue" theme, accent `#1f6aa5`).
  It is functional but visually generic; this system elevates it. CTk specifics that informed the
  recreation: split layout (scrollable controls | preview), the action bar (Edit cues / Generate /
  Burn / presets / Quit), the 3 synced monospace cue lanes (LAYOUT · FADE-IN · FADE-OUT), themes,
  undo/redo, and the muted 10-color group palette.

> The example song referenced throughout ("Bleating Obsession" and friends) comes from the repo's
> sample data. Any Suno bearer tokens in the original repo are dead/short-lived — not used here.

---

## Content fundamentals (voice & copy)

**Voice: crisp and pro, creator-facing.** Confident, technical-but-warm, never cutesy. The tool
respects that its users are makers who want control and speed.

- **Person:** address the user as **you** ("Pick up where you left off"). The app speaks in
  imperatives for actions ("Generate captions", "Add a word").
- **Casing:** **Sentence case** for UI labels, headings, buttons ("Save preset", "New cue",
  "Cue lanes"). **Title Case** only for the product name. Technical file types stay literal
  (`.ass`, `.srt`). UPPERCASE is reserved for tiny eyebrow labels & tier tags (`WORD`, `GROUP`,
  `GLOBAL`, `LAYOUT`, `FADE-IN`).
- **Length:** terse. Buttons are 1–3 words. Hints are one short sentence ("Drag a handle to
  resize the placement box.").
- **Numbers & precision:** timing is first-class and always **monospace** — `0:13.04`,
  `@12.88 / 180`, `1.40s`. Two-decimal seconds for cue bounds, ms for fades.
- **Emoji:** **none** in product UI. The original app used `✓ ✗ ⚠` glyphs and a couple of emoji
  in its log; v3 replaces those with Lucide icons + semantic color (success/warn/danger).
- **Status/log tone:** factual, prefixed with a state ("Burned → bleating_subbed.mp4",
  "Loaded 9 sections · 142 words"). Past tense for completed, present-participle for in-progress
  ("burning… 62%").

**Examples**
- Hero: *“Your projects.”* / *“Word-timed lyrics in, styled karaoke captions out.”*
- Buttons: `Export` · `Edit cues…` · `Generate .ass` · `New cue` · `Word in group` · `Split`
- Hints: *“Click the waveform to scrub · click a block to edit its bounds.”*
- Inspector note: *“resolved: word → group → global.”*

---

## Visual foundations

**Overall vibe.** Sleek dark "pro-tool" meets neon karaoke. Deep **violet-black** surfaces, a single
confident **electric magenta** as the hero accent, **violet** as the secondary (group tier / burn),
and **cyan** as the live/now signal (playhead, "LIVE"). Neon is a *seasoning* — used on the live
word, the primary CTA, the playhead, and the logo — never washed across whole panels.

**Color.** Full tokens in [`colors_and_type.css`](colors_and_type.css).
- Surfaces ramp violet-black: `--bg #0C0A14` → `--surface-1 #15111F` → `-2 #1A1528` →
  `-3 #221B33` (inputs) → `-4 #241C36` (hover). Hairlines `--border #2C2440` / `--border-strong #3A3052`.
- Accents: `--accent #FF3DA6` (magenta), `--violet #8A5BFF`, `--cyan #3DE0FF`. Ink on accent
  `#22041A`. Primary CTAs use a magenta→violet **gradient**.
- Text ramp: `#ECE7F4` / `#A599BC` / `#6E6385`.
- Semantic: success `#4DE0C2`, warn `#FFC24D`, danger `#FF6B6B`.
- **Cue-group palette** (10 muted bands) tints grouped words/events in the lanes & timeline,
  echoing the real app's group colors but tuned toward the synthwave hues.

**Type.** Three families (all open-source):
- **Space Grotesk** — display, headings, the brand wordmark, and on-screen captions (700/600).
- **Hanken Grotesk** — UI + body (400/500). Clean neutral grotesque.
- **JetBrains Mono** — all timecodes, cue values, paths, ASS tags. Mono = "this is data."
- Tight tracking on display (`-0.01 to -0.02em`); generous body line-height (1.55).

**Spacing & radii.** 4px base scale. Radii: inputs/chips `7px`, buttons/cards `9–12px`,
big surfaces `16px`, pills `999px`. Steppers and small controls sit at `30px` tall; buttons `34–36px`.

**Backgrounds.** Flat dark surfaces, no busy patterns. Two *subtle* depth cues: a faint radial
glow at the top of the editor canvas (`radial-gradient` violet→bg) and a **scanline** texture +
bottom vignette inside the video preview to read as "footage." No stocky gradients on panels.

**Cards & panels.** `--surface-2` fill, `1px --border`, `radius-lg`. Elevation via soft dark
shadows (`--shadow-1/2/3`) — never glowing borders, except the **selected** state which uses a
magenta ring (`--ring-accent`). Floating panels use `--shadow-3`.

**Borders.** Hairline `--border` everywhere; `--border-strong` for emphasis (segmented controls,
device edges). The placement **bounding box** in the preview is a dashed magenta rectangle with
8 white-cored handles.

**Hover / press / selected.**
- Hover: lift to the next surface (`-3 → -4`), border → `--border-strong`, icon tints to accent.
- Press: `translateY(1px)` (buttons). Primary CTA darkens via `--accent-press`.
- Selected: magenta ring + tinted fill (`color-mix accent 9–12%`). The **live** caption word turns
  magenta with a soft glow; the active timeline block gets a magenta outline.

**Animation.** Purposeful, quick. `--dur 180ms`, ease `cubic-bezier(.2,.7,.3,1)`. Caption word
entrances map to **presets**: *Karaoke Bounce* (rise + slight overshoot), *Pop* (scale-in),
*Glow*, *Typewriter*. The "LIVE" dot pulses (1.4s). The playhead glides linearly during playback.
No infinite decorative motion on chrome; respect reduced-motion in production.

**Transparency & blur.** Used only for overlays: the preview's stage chips (`backdrop-filter: blur`)
and the library top bar. Surfaces themselves are opaque.

**Imagery vibe.** The "video" is implied with a cool, slightly-purple dark gradient + scanlines —
deliberately neutral so magenta captions pop. Real product previews would show user footage.

---

## Iconography

- **System: Lucide** (https://lucide.dev, ISC) — clean 24px-grid line icons, ~1.75 stroke,
  rounded caps/joins. They match the pro-tool feel (transport, layers, sliders, sparkles, waveform,
  scissors, undo/redo, download, folder, search…).
- **Delivery:** the icons used in the UI kit are **inlined** as a small React map in
  [`ui_kits/desktop-app/icons.jsx`](ui_kits/desktop-app/icons.jsx) so the kit works offline. For
  production, install the `lucide` package (or its React port) and reference by name — the set is a
  1:1 match. *(Substitution flag: Lucide is a chosen system, not an asset shipped by the original
  app, which used Unicode glyphs `↶ ↷ ▸ ▾ ⏎ ✓ ✗ ⚠`. We standardize on Lucide + semantic color.)*
- **Emoji:** not used. **Unicode glyphs** appear only inside the mono cue cells where they carry
  meaning (e.g. a small `◴` marks a fraction-split word).
- **Logo:** there was **no logo in the source** (the app is a Python window). The brand mark here is
  original: a rounded gradient tile with two **caption bars** + a **pulse dot** — "subtitles +
  audio." Files in [`assets/`](assets/): `logo-mark.svg` (gradient tile) and `logo-glyph.svg`
  (bars-on-dark for small/inverse use).

---

## Fonts (substitution flag)

The three families are **Google Fonts** and are currently loaded via CDN `@import` in
`colors_and_type.css`. Font **binaries were not vendored** into `fonts/` (couldn't be downloaded in
this environment). **To self-host / ship offline:** download the woff2 for Space Grotesk, Hanken
Grotesk, and JetBrains Mono into `fonts/` and swap the `@import` for `@font-face` rules. None of
the three is an "AI-slop" default (no Inter/Roboto).

---

## Index / manifest

| File | What it is |
|---|---|
| `README.md` | This file — brand context, content + visual foundations, iconography, index. |
| `colors_and_type.css` | **Single source of truth**: all color, type, spacing, radii, shadow tokens + semantic type classes. |
| `SKILL.md` | Agent-Skill entry point (Claude Code compatible) for designing in-brand. |
| `HANDOFF_v3.md` | Developer handoff for building v3 for real (Tauri/web shell over the Python core; perf + preview architecture; feature→engine map). |
| `HANDOFF_real-model.md` | Reconciles the UI kit with the **real engine model** (ground-truth `project` shape, daemon API, the global→group→cue style waterfall) + the design decisions behind the v3 editor. |
| `HANDOFF_animations.md` | **Caption animations feature** — authoring IA (Inspector append-model), timeline animation strips (fill-by-type, ≤3+overflow, 2-click select→focus, drag-retime), data-model + daemon additions, React build checklist. Prototypes: `ui_kits/desktop-app/animations-ia.html`, `timeline-anim.html`. |
| `assets/` | `logo-mark.svg`, `logo-glyph.svg`. |
| `preview/` | Design-system specimen cards (type, colors, spacing, components, brand) shown in the Design System tab. `card.css` is shared scaffolding. |
| `ui_kits/desktop-app/` | The interactive **merged editor** UI kit (Project Library → Timeline-Dock editor). See its own README for component contracts. |
| `directions/` | Exploration scratch: the 3 color directions and the 3 merged-editor layouts that led to the chosen design. Not part of the shipped system. |

**Start here:** open `ui_kits/desktop-app/index.html` for the live product, and
`preview/*` via the Design System tab for the foundations.
