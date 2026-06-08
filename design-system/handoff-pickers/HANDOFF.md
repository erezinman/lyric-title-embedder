# Color &amp; Font Pickers — Developer Handoff

Karaoke Subtitle Studio · design-system components for picking subtitle **fill / outline / box
colors** and **fonts** (with bold/italic/underline + custom-font upload), each with a **live
caption preview**.

This package is the **reference design** (React + CSS). The production app is the Python/libass
tool; this document specifies behavior precisely enough to port to that stack, or to drop the React
components in directly if the editor is web-based.

---

## 1. What's in this zip

```
handoff-pickers/
├── HANDOFF.md                 ← you are here (spec + behavior)
├── INTEGRATION.md             ← exact wiring used in the reference editor
├── colors_and_type.css        ← design tokens the pickers read (dependency)
└── components/
    ├── ColorPicker.jsx.txt     ← color picker component (solid)
    ├── ColorPicker.d.ts.txt    ← color picker prop contract
    ├── FontPicker.jsx.txt      ← font picker component (+ typography + upload)
    ├── FontPicker.d.ts.txt     ← font picker prop contract
    ├── pickers.css             ← all picker styling (self-contained; needs the tokens)
    └── Pickers.demo.html       ← live demo of every variation (reference)
```

> **Note on the `.txt` suffix.** The `.jsx`/`.d.ts` sources carry a trailing `.txt` purely so they
> don't get picked up by the source project's design-system compiler. **Strip the `.txt`** to use
> them — `ColorPicker.jsx.txt` → `ColorPicker.jsx`, `ColorPicker.d.ts.txt` → `ColorPicker.d.ts`,
> etc. Contents are unchanged.

**Dependencies**
- **React 18** (global `React` / `ReactDOM`; UMD is fine). The `.jsx` files use `React.*` and
  `export { … }`. No JSX runtime import.
- **`colors_and_type.css`** — the components are unstyled without it; `pickers.css` consumes its
  CSS custom properties (`--surface-*`, `--accent`, `--text-*`, `--radius-*`, `--danger`, fonts…).
- **`pickers.css`** — load after the tokens. It also `@import`s the Google preview faces
  (Anton, Bebas Neue, Oswald, Montserrat, Archivo Black).

No other runtime deps. No build step required (they transpile under Babel-standalone in the demo),
but they’re ordinary ES modules and bundle fine with esbuild/vite/webpack.

---

## 2. Quick start

```jsx
import { ColorPicker } from "./components/ColorPicker.jsx";
import { FontPicker }  from "./components/FontPicker.jsx";

// Fill color, inline panel
<ColorPicker
  value={fill} onChange={setFill}
  alpha={fillAlpha} onAlphaChange={setFillAlpha}   // omit both to hide the alpha channel
  previewText="Bleating obsession" previewFont={font}
/>

// Outline color, compact "field" trigger that opens a popover
<ColorPicker
  mode="field"
  value={outline} onChange={setOutline}
  previewText={cueText} previewFont={font}
  previewRole="outline" previewFill={fill}         // ← preview strokes the text in this color
/>

// Font + typography + upload
<FontPicker
  value={font} onChange={setFont}
  typo={{ bold, italic, underline }}
  onTypo={(key, val) => setTypo(t => ({ ...t, [key]: val }))}
  previewText={cueText} color={fill}
/>
```

Both components have two render modes:
- **`mode="panel"`** (default) — the full inline panel.
- **`mode="field"`** — a compact trigger (swatch+hex / font name) that opens the panel in a
  **fixed-positioned popover** (escapes scrolling/overflow parents; auto-flips up and clamps to the
  viewport). This is what the editor’s inspector uses.

`<ColorPanel>` / `<ColorField>` and `<FontPanel>` / `<FontField>` are exported too if you want to
skip the `mode` switch.

---

## 3. ColorPicker — behavior spec

A **solid** color picker (no gradients). Anatomy, top to bottom:

1. **Header** — label (“Fill”/“Outline”/“Box”) + a tag showing the current `#HEX` (and `· NN%` when
   alpha is enabled).
2. **Live preview tile** — renders `previewText` in `previewFont`. Role-aware (see §3.2).
3. **Saturation/Value square** — drag to set S (x) and V (y). Background hue tracks the hue slider.
4. **Hue slider** — drag to set hue 0–360.
5. **Alpha slider** — only when `alpha` + `onAlphaChange` are provided. 0–100%.
6. **Inputs row** — a transparency-checkered chip showing the current color, a **hex** input
   (3- or 6-digit, normalized to 6 uppercase), and a numeric **alpha %** input (if alpha on).
7. **Palette** — preset palette pills (**Brand / Neon / Warm / Cool / Mono**) that swap the swatch
   row; click a swatch to set the color. Pin a single fixed row instead with the `swatches` prop.
8. **Recent** — a running queue of the custom colors the user has picked (see §3.3). Hidden until
   non-empty.

### 3.1 Color model
- Value is a 6-digit hex string, e.g. `"#FF3DA6"`. `onChange(hex)` fires on every change (drag,
  hex commit, swatch click).
- Internal HSV state keeps **hue stable at grayscale** (so dragging V to black doesn’t reset hue).
- Alpha is a **separate** 0–100 channel via `alpha`/`onAlphaChange` — it is *not* baked into the hex
  (the host owns how alpha is stored; the libass model uses a 2-char hex `back_alpha`, converted by
  the host).

### 3.2 Role-aware preview (`previewRole`)
The picked color means different things for fill vs outline vs box. The preview reflects that:
- `previewRole="fill"` (default) — paints the **text** in the picked color.
- `previewRole="outline"` — text shown in `previewFill` (the real fill, default white) with the
  picked color as a **stroke** around it (`-webkit-text-stroke` + `paint-order: stroke fill`).
- `previewRole="box"` — text in `previewFill` sitting on a **box** of the picked color (respects
  alpha). Mirrors an opaque-box (`BorderStyle 3`) caption.

Always pass `previewFill` (the resolved fill color) for outline/box so the preview shows a real
caption, not white-on-default.

### 3.3 Recent-colors queue
- Module-level **shared store**, persisted to `localStorage` key **`kss.recentColors`** (max 10,
  most-recent-first, deduped, uppercased).
- Populated on **commit** of a *custom* color: end of a spectrum/hue drag, or hex entry. Clicking a
  preset/palette/recent swatch does **not** enqueue (those are already saved).
- Shared across **every** ColorPicker instance automatically — no prop wiring.
- Override with controlled props: pass `recent={string[]}` + `onAddRecent={hex => …}` to manage it
  yourself (then the built-in store is bypassed).

---

## 4. FontPicker — behavior spec

Anatomy:

1. **Header** — label + current family tag.
2. **Live preview tile** — `previewText` in the selected family, reflecting bold/italic/underline
   and the `color` fill.
3. **B / I / U toggles** — shown only when `onTypo` is provided (see §4.1).
4. **Search** — filters the list (case-insensitive).
5. **Upload custom font** — file picker (see §4.2). Hide with `allowUpload={false}`.
6. **Font list** — each row is set **in its own typeface** (so you read the face, not the name) and
   echoes the current weight/slant. Selected row shows a check; uploaded rows show a hover ✕ to
   remove. The default curated set is `KSP_FONTS` (Space Grotesk, Anton, Bebas Neue, Oswald,
   Montserrat, Archivo Black, Hanken Grotesk, Impact, Georgia, Courier New). Override with `fonts`.

### 4.1 Typography (bold / italic / underline)
- These are owned **by the FontPicker**, not as separate controls. Pass current state via `typo`
  (`{bold, italic, underline}`) or the individual `bold`/`italic`/`underline` props, and a handler
  `onTypo(key, nextValue)` where `key ∈ {"bold","italic","underline"}`.
- The preview and the list rows reflect weight + slant live (underline shows in the preview only —
  it’s noisy per row).
- If `onTypo` is omitted, the B/I/U row is hidden (pure font selection).

### 4.2 Custom-font upload
- Accepts **`.ttf / .otf / .woff / .woff2`**.
- On select: the file is read as a data URL, registered with the **`FontFace` API on the whole
  document** (so it renders in *every* preview **and** the live caption stage immediately), added to
  the list (tagged “custom”), selected (`onChange(family)`), and `onUploadFont({name, file})` fires
  if provided.
- The family name is derived from the filename (extension stripped, `_`→space).
- **Shared + persisted**: uploaded fonts live in a module-level store persisted to `localStorage`
  key **`kss.customFonts`** (as `{name, url}` data URLs) and are **re-registered on load**. They
  appear in every FontPicker instance. Remove via the row’s ✕ (`kspFontStore.remove(name)`).
- `kspFontStore` is exported for host control (`.get()`, `.add(name,url)`, `.remove(name)`,
  `.subscribe(fn)`).

> **⚠ Production caveat (libass/export).** Registering a `FontFace` makes the font available to the
> *UI/preview* only. Burning subtitles (`.ass` → ffmpeg/libass) resolves fonts via **fontconfig on
> the render host**. A real “upload” must therefore also **persist the font file somewhere libass
> can find it** (install into a fonts dir / point `fontconfig` or `libass set_fonts_dir` at it) and
> store the family name in the cue style. The picker gives you `{name, file}` via `onUploadFont` —
> the host is responsible for that copy + the `[V4+ Styles] Fontname` it writes. See INTEGRATION.md.

---

## 5. Full prop reference

See the `.d.ts` files for the authoritative, typed contract:
- `components/ColorPicker.d.ts.txt`
- `components/FontPicker.d.ts.txt`

Both are heavily commented. Exported symbols:
- ColorPicker.jsx → `ColorPicker, ColorPanel, ColorField, KSP_BRAND_SWATCHES, KSP_PALETTES`
- FontPicker.jsx → `FontPicker, FontPanel, FontField, KSP_FONTS, kspFontStore`

---

## 6. Styling &amp; theming

- All visual styling is in **`pickers.css`**, scoped under `.ksp*` classes. It is self-contained
  apart from the **token variables** in `colors_and_type.css`.
- To re-theme, override the tokens (e.g. `--accent`, `--surface-2`, `--radius-lg`) — don’t edit the
  picker CSS. The pickers inherit the app’s look automatically.
- The popover uses `position: fixed` with JS-computed coordinates (`.ksp-pop.fixed`) so it never
  gets clipped by a scrolling inspector. Z-index: backdrop `79`, popover `80`.

---

## 7. Accessibility / interaction notes

- Spectrum, hue, alpha, and (n/a here) angle tracks are pointer-drag with `touch-action: none`
  (mouse + touch). They use a shared `kspUseDrag(onMove, onEnd)` helper.
- B/I/U toggles expose `aria-pressed`. The field triggers are real `<button>`s.
- Hex input commits on blur/Enter; invalid input reverts to the current value.
- Known gap to close for full a11y: keyboard control of the SV/hue/alpha tracks (arrow keys) is not
  yet implemented — they’re pointer-only today.

---

## 8. Running the demo

`components/Pickers.demo.html` is the design-system card. It loads the **compiled bundle** from the
original project (`../_ds_bundle.js`) — that path won’t resolve outside the project. To preview the
components from **source** in this zip, load `ColorPicker.jsx` / `FontPicker.jsx` directly under
Babel-standalone and read them off `window` (strip the `export {…}` line and `Object.assign(window,
{…})` instead), with `colors_and_type.css` + `pickers.css` linked. INTEGRATION.md §4 shows the exact
loader snippet.
