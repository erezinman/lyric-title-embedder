# Integration Notes — how the reference editor wires the pickers

This is exactly how the pickers were dropped into the reference editor
(`ui_kits/desktop-app/`). Use it as the integration recipe. The editor’s **style waterfall**
resolves a style per property as **cue → group → global** (most specific wins); the pickers sit in
those rows.

---

## 1. Loading the components

In the editor HTML, the compiled component bundle is loaded **before** the app scripts, and the
pickers are read off the global namespace:

```html
<!-- React + Babel first … then: -->
<script src="../../_ds_bundle.js"></script>   <!-- exposes window.<Namespace>.{ColorPicker,FontPicker,…} -->
<script type="text/babel" src="panels.jsx"></script>
```

```js
// panels.jsx — grab the components (with a graceful fallback if the bundle isn't ready)
const KSP_DS = (typeof window !== "undefined" && window.<Namespace>) || {};
// …later: if (KSP_DS.ColorPicker) <KSP_DS.ColorPicker … /> else <legacy swatch row/>
```

If you bundle with a normal toolchain instead, just `import { ColorPicker, FontPicker } from
"./ColorPicker.jsx" / "./FontPicker.jsx"` and skip the namespace dance.

`pickers.css` is pulled in via the editor’s stylesheet:

```css
/* theme.css */
@import url('../../colors_and_type.css');
@import url('../../components/pickers.css');
```

---

## 2. Data model changes (model.jsx)

Typography became real per-cue/group/global style keys:

```js
const STYLE_KEYS = ["font","fontsize","bold","italic","underline",
                    "primary","outline","back","back_alpha","outline_w","shadow","border_style"];
const CUE_STYLE_KEYS = STYLE_KEYS.filter(k => k !== "border_style");   // box-mode is group-only
const TYPO_KEYS = ["bold","italic","underline"];                       // owned by the Font picker

const GLOBAL_STYLE = {
  font: "Space Grotesk", fontsize: 64, bold: true, italic: false, underline: false,
  primary: "#FFFFFF", outline: "#000000", back: "#000000", back_alpha: "80",
  outline_w: 3, shadow: 0, border_style: 1,
};
```

- `primary` = fill, `outline` = outline color, `back` = box color, `back_alpha` = 2-char hex box
  opacity. These map to `.ass` `[V4+ Styles]` `PrimaryColour / OutlineColour / BackColour` and the
  `Bold / Italic / Underline` flags. `border_style` 1 = outline, 3 = opaque box.

---

## 3. Inspector wiring (panels.jsx)

### 3.1 Color rows (Fill / Outline / Box)
Each color property renders a `ColorPicker` in **field** mode, with the **role** derived from the
key so the preview is correct, and `previewFill` = the tier’s resolved fill:

```jsx
if (meta.kind === "color") {
  const role = pkey === "outline" ? "outline" : pkey === "back" ? "box" : "fill";
  return (
    <KSP_DS.ColorPicker mode="field"
      value={String(val).toUpperCase()} label={meta.label}
      previewText={ctx.text} previewFont={ctx.font}
      previewRole={role} previewFill={ctx.fill}
      onChange={(c) => onSet(pkey, c.toUpperCase())} />
  );
}
```

### 3.2 Font row (font + typography)
The Font row renders a `FontPicker` that also drives bold/italic/underline. Those keys are
**filtered out of the waterfall rows** (`TYPO_KEYS`) and set through `onTypo`:

```jsx
// in the "combo" (font) branch:
<KSP_DS.FontPicker mode="field"
  value={val} label={meta.label}
  previewText={ctx.text} color={ctx.fill}
  bold={ctx.bold} italic={ctx.italic} underline={ctx.underline}
  onTypo={(k, v) => onSet(k, v)}        // sets bold/italic/underline at the same tier
  onChange={(f) => onSet(pkey, f)} />

// in the tier renderer, don't render typography as their own rows:
keys.filter(k => !TYPO_KEYS.includes(k)).map(k => <PropRow … />)
```

`allowUpload` defaults to **true**, so the “Upload custom font” control appears automatically. The
upload store is global, so it works without any host wiring; pass `onUploadFont` only if you also
need the file for the libass handoff (§5).

### 3.3 Resolved-style context for previews
`StyleWaterfall` computes the **resolved** style per tier and feeds it to the rows so previews are
truthful (real fill behind an outline/box preview, real weight in the font preview):

```js
const ctxFor = (r) => ({ text, font: r.font, fill: r.primary,
                         bold: !!r.bold, italic: !!r.italic, underline: !!r.underline });
const ctxGlobal = ctxFor(gs);
const ctxGroup  = ctxFor({ ...gs, ...groupStyle });
const ctxCue    = ctxFor({ ...gs, ...groupStyle, ...cueStyle });
```

### 3.4 Reducer (app.jsx)
`onChange`/`onTypo` both funnel into one setter:

```js
const setStyle = (tier, key, value) => H.set(p => {
  const np = clone(p);
  if      (tier === "global") np.global_style[key] = value;
  else if (tier === "group")  np.layout[sel.gi].style[key] = value;
  else /* cue */              np.layout[sel.gi].lines[sel.tok.li].toks[sel.tok.ti].style[key] = value;
  return np;
});
```

---

## 4. Rendering the styles on the caption stage

The live preview stage reads the resolved style and applies the typography inline (color/outline
handled by the existing caption renderer):

```js
// app.jsx — building caption words
const rs = resolveStyle(P, gi, tok);
out.push({ …, fill: rs.primary.src !== "global" ? rs.primary.value : null,
           bold: !!rs.bold.value, italic: !!rs.italic.value, underline: !!rs.underline.value });

// stage.jsx — applying to each word span
const typo = {
  fontWeight: w.bold ? 800 : undefined,
  fontStyle: w.italic ? "italic" : undefined,
  textDecoration: w.underline ? "underline" : undefined,
};
<span style={{ ...typo, ...capFill(w) }}>{w.text}</span>
```

Because uploaded fonts are registered via `FontFace` on the document, the stage renders them with
no extra work — selecting an uploaded family just sets `font` in the style and it paints.

### 4.1 Previewing the components from source (no bundle)
To run the components straight from the `.jsx` in this zip (e.g. a quick harness), load them under
Babel-standalone after replacing the trailing `export { … }` with a window assignment:

```js
// build step or hand-edit: drop "export { A, B };" and append
Object.assign(window, { ColorPicker, ColorPanel, ColorField, KSP_BRAND_SWATCHES, KSP_PALETTES });
```
```html
<link rel="stylesheet" href="colors_and_type.css">
<link rel="stylesheet" href="components/pickers.css">
<!-- React UMD + Babel … -->
<script type="text/babel" src="components/ColorPicker.jsx"></script>
<script type="text/babel" src="components/FontPicker.jsx"></script>
```

---

## 5. The one piece the front-end can’t do: fonts at burn time

Everything above makes uploaded fonts work in the **UI**. For the actual render (`.ass` → libass):

1. On `onUploadFont({name, file})`, the host must **save the font file** to a directory libass can
   resolve (install into the OS font dir, or a project fonts folder you pass to libass via
   `fontconfig` config / `ass_set_fonts_dir`).
2. Persist the **family name** with the project (it’s already what the picker stores in the cue
   style’s `font`).
3. The `.ass` writer emits that family in `[V4+ Styles] Fontname` (and per-span `\fn` overrides if a
   cue/word differs). libass then matches it via fontconfig at render/burn time.

If the font isn’t installed on the render host, libass silently substitutes — so surfacing a
“preview only · install on render host to burn” hint for uploaded faces is recommended.

---

## 6. Persisted keys (localStorage)

| Key | Owner | Contents |
|-----|-------|----------|
| `kss.recentColors` | ColorPicker store | `string[]` of recent hex colors (max 10) |
| `kss.customFonts`  | FontPicker store  | `{name, url}[]` uploaded faces as data URLs |

Both are shared across all picker instances and rehydrate on load. Swap them for app-level state if
you prefer central control (ColorPicker: `recent`/`onAddRecent`; FontPicker: `kspFontStore` API).
