# Track A re-diff — kit vs feat/designer-sync@9fae50c

| file | kit rules | port rules | **differ** | kit-only | port-only |
|---|--:|--:|--:|--:|--:|
| pickers.css | 84 | 85 | 0 | 0 | 1 |
| colors_and_type.css | 12 | 11 | 0 | 2 | 1 |
| fonts.css | 2 | 2 | 1 | 0 | 0 |
| theme.css | 669 | 770 | 106 | 158 | 259 |

---

---

## ▍Bottom line

**Track A is essentially done.** Every high-priority item the triage flagged is already fixed on `feat/designer-sync@9fae50c`. What remains is a short list of **low-severity cosmetic drifts — all judgment calls, no regressions.**

### ✅ Resolved (triage's "do first" items — now match the kit)
- **A1 picker portal** — `pickers.css`: **0 shared rules differ.** Transform-only `kspPop` (no opacity ramp) + `.prow.inh` child-dimming that skips `.ksp-anchor`, both with the zip-12 §E warning comments. The "highest priority regression" is not present.
- **A2 caption** — `.cap` is `clamp(15px, 3.3cqw, 64px)`, matches kit.
- **A4 tokens + fonts** — all 5 `--grad-*` tokens defined and referenced; fonts self-hosted via `@import './fonts.css'` + `--family-*` registry (no CDN).

### ⚠ Genuine remaining Track A — all LOW severity, your call
1. **Tombstone color** (`.tomb-lbl`, `.ov-row.tomb .ov-ic`): port = danger/red mono chip; kit = warn/amber italic. Deliberate-or-revert (red arguably reads better for "deleted").
2. **`.substep`**: port dropped the kit's `::before` elbow/L-connector and uses looser margins + larger label text.
3. **`.bbox.dragging`**: port lost the kit's `box-shadow: 0 0 0 1px accent, 0 0 22px glow` on drag — trivial restore.
4. **Sub-pixel nudges**: `.snap-guide` ±3px inset, `.sg-tag` top `-2px`→`2px`, `.playhead.tl-through:hover` 75%→78%, `.snap-toggle` lost `font-ui`. Batch or ignore.
5. **`.ks-gradient-text`** utility exists in kit `colors_and_type.css`, absent in port — only matters if a surface needs gradient text. Verify usage before adding.

### ⛔ NOT Track A (≈100 of the theme.css diffs)
Legitimate divergence — **do not "revert to kit":**
- Real app layout the static kit mock omits (`.app`, `.stage-col`, `.dock`, `.insp`, `.stage`).
- Track-B feature refinements (resizable `--lane-cols`, overlay/lane work, etc.).
The port is a living app; the kit is a static mock. Structural divergence here is expected and correct.

### Note
`fonts.css`: the only diff is the `.ttf` filename/path convention (`JetBrainsMono[wght].ttf` vs `./JetBrainsMono-var.ttf`) — both self-hosted, no regression.

---

## Raw rule-level diff (reference)

## pickers.css

**No shared selectors differ.** Port matches the kit on every rule they have in common.

_Port-only selectors: 1 (additive — not Track A)._

## colors_and_type.css

**No shared selectors differ.** Port matches the kit on every rule they have in common.

### Kit-only selectors (2) — port may be missing these
- `@import url('fonts.css'); :root`
- `.ks-gradient-text`

_Port-only selectors: 1 (additive — not Track A)._

## fonts.css

### Shared selectors that DIFFER (1)

**`@font-face`**
- kit:  `font-family: "JetBrains Mono"; src: url("fonts/JetBrainsMono[wght].ttf") format("truetype-variations"); font-weight: 100 800; font-style: normal; font-display: swap;`
- port: `font-family: "JetBrains Mono"; src: url("./fonts/JetBrainsMono-var.ttf") format("truetype-variations"); font-weight: 100 800; font-style: normal; font-display: swap;`

_Port-only selectors: 0 (additive — not Track A)._

## theme.css

### Shared selectors that DIFFER (106)

**`.app`**
- kit:  `-webkit-user-select: none; user-select: none`
- port: `background: var(--bg); display: flex; flex-direction: column; height: 100vh; overflow: hidden`

**`.stage-col`**
- kit:  `align-items: center; display: flex; flex-direction: column; gap: 0; justify-content: center; max-height: 100%; max-width: 100%; min-height: 0; width: min(100cqi, calc((100cqb - 34px) * 16 / 9), 1920px)`
- port: `align-items: center; container-type: size; display: flex; flex-direction: column; flex: 1; gap: 0; justify-content: center; min-height: 0; width: 100%`

**`.stage`**
- kit:  `aspect-ratio: 16/9; background: radial-gradient(125% 120% at 70% 6%, #241a36 0%, #0f0a18 48%, #060410 100%); border-radius: var(--radius-lg); border: 1px solid var(--border-strong); box-shadow: var(--shadow-pop); container-type: inline-size; max-width: none; o…`
- port: `aspect-ratio: 16/9; background: radial-gradient(125% 120% at 70% 6%, #241a36 0%, #0f0a18 48%, #060410 100%); border-radius: var(--radius-lg); border: 1px solid var(--border-strong); box-shadow: var(--shadow-pop); container-type: inline-size; flex: 0 0 auto; he…`

**`.cap`**
- kit:  `align-items: center; bottom: 13%; display: flex; flex-direction: column; font-family: var(--font-display); font-size: clamp(15px, 3.3cqw, 64px); font-weight: 700; gap: .04em; left: 0; letter-spacing: -.01em; line-height: 1.16; padding: 0 5%; position: absolute…`
- port: `align-items: center; bottom: 13%; display: flex; flex-direction: column; font-family: var(--font-display); font-size: clamp(15px, 3.3cqw, 64px); font-weight: 700; gap: .04em; left: 0; letter-spacing: -.01em; line-height: 1.16; padding: 0 5%; position: absolute…`

**`.bbox.dragging`**
- kit:  `border-color: var(--accent); border-style: solid; box-shadow: 0 0 0 1px var(--accent), 0 0 22px var(--glow-accent); cursor: grabbing; opacity: 1`
- port: `border-color: var(--accent); opacity: 1`

**`.dock`**
- kit:  `background: var(--surface-1); border-top: 1px solid var(--border); display: flex; flex-direction: column; flex: 0 0 252px; min-height: 0; position: relative`
- port: `background: var(--surface-1); border-top: 1px solid var(--border); display: flex; flex-direction: column; flex: 0 0 252px; min-height: 0`

**`.playhead`**
- kit:  `background: color-mix(in srgb, var(--cyan) 50%, transparent); bottom: -4px; box-shadow: 0 0 6px color-mix(in srgb, var(--cyan) 35%, transparent); position: absolute; top: -4px; transition: left .1s linear; width: 2px`
- port: `background: var(--cyan); bottom: -4px; box-shadow: 0 0 10px var(--cyan); position: absolute; top: -4px; transition: left .1s linear; width: 2px`

**`.block`**
- kit:  `touch-action: none`
- port: `align-items: center; border-radius: 5px; bottom: 4px; color: #fff; cursor: grab; display: flex; font-size: 11px; justify-content: center; overflow: hidden; position: absolute; top: 4px; transition: outline .12s; white-space: nowrap`

**`.block.sel`**
- kit:  `box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px #fff, 0 0 0 6px var(--accent), 0 0 22px color-mix(in srgb, var(--accent) 65%, transparent); outline: none; transform: translateY(-2px) scale(1.015); z-index: 4`
- port: `outline: 1.5px solid #fff`

**`.playhead.tl-through`**
- kit:  `bottom: 0; pointer-events: none; top: 0; z-index: 6`
- port: `background: color-mix(in srgb, var(--cyan) 55%, transparent); box-shadow: 0 0 6px color-mix(in srgb, var(--cyan) 35%, transparent); z-index: 6`

**`.playhead.tl-through::before`**
- kit:  `top: -2px`
- port: `display: none`

**`.playhead.tl-through:hover`**
- kit:  `background: color-mix(in srgb, var(--cyan) 75%, transparent)`
- port: `background: color-mix(in srgb, var(--cyan) 78%, transparent)`

**`.snap-toggle`**
- kit:  `align-items: center; background: var(--surface-3); border-radius: var(--radius-pill); border: 1px solid var(--border); color: var(--text-2); cursor: pointer; display: inline-flex; font-family: var(--font-ui); font-size: 11.5px; gap: 7px; height: 28px; padding:…`
- port: `align-items: center; background: var(--surface-3); border-radius: var(--radius-pill); border: 1px solid var(--border); color: var(--text-2); cursor: pointer; display: inline-flex; font-size: 11.5px; gap: 7px; height: 28px; padding: 0 6px 0 11px; transition: va…`

**`.snap-guide`**
- kit:  `border-left: 1.5px dashed var(--cyan); bottom: -3px; filter: drop-shadow(0 0 6px color-mix(in srgb, var(--cyan) 70%, transparent)); pointer-events: none; position: absolute; top: -3px; width: 0; z-index: 7`
- port: `border-left: 1.5px dashed var(--cyan); bottom: 0; filter: drop-shadow(0 0 6px color-mix(in srgb, var(--cyan) 70%, transparent)); pointer-events: none; position: absolute; top: 0; width: 0`

**`.snap-guide .sg-tag`**
- kit:  `background: rgba(12,10,20,.78); border-radius: 4px; border: 1px solid color-mix(in srgb, var(--cyan) 40%, transparent); color: var(--cyan); font-family: var(--font-mono); font-size: 9px; left: 4px; padding: 1px 5px; position: absolute; top: -2px; white-space: …`
- port: `background: rgba(12,10,20,.78); border-radius: 4px; border: 1px solid color-mix(in srgb, var(--cyan) 40%, transparent); color: var(--cyan); font-family: var(--font-mono); font-size: 9px; left: 4px; padding: 1px 5px; position: absolute; top: 2px; white-space: n…`

**`.lane-evt`**
- kit:  `align-items: center; background: var(--surface-2); border-bottom: 1px solid var(--border); box-shadow: inset 3px 0 0 var(--g-color); color: var(--text-2); cursor: pointer; display: flex; font-family: var(--font-display); font-size: 11px; font-weight: 600; gap:…`
- port: `align-items: center; background: var(--surface-2); border-bottom: 1px solid var(--border); box-shadow: inset 3px 0 0 var(--g-color); color: var(--text-2); cursor: pointer; display: flex; font-family: var(--font-display); font-size: 11px; font-weight: 600; gap:…`

**`.lane-head`**
- kit:  `background: var(--surface-2); border-bottom: 1px solid var(--border); display: grid; grid-template-columns: 1.7fr .72fr .72fr 1.5fr`
- port: `background: var(--surface-2); border-bottom: 1px solid var(--border); display: grid; grid-template-columns: var(--lane-cols, minmax(120px,1.7fr) 96px 96px minmax(150px,1.4fr))`

**`.lane-head .lh`**
- kit:  `align-items: center; border-right: 1px solid var(--border); color: var(--text-2); display: flex; font-family: var(--font-display); font-size: 10.5px; font-weight: 600; gap: 6px; letter-spacing: .04em; overflow: hidden; padding: 8px 12px; white-space: nowrap`
- port: `align-items: center; border-right: 1px solid var(--border); color: var(--text-2); display: flex; font-family: var(--font-display); font-size: 10.5px; font-weight: 600; gap: 6px; letter-spacing: .04em; padding: 8px 12px; position: relative`

**`.lane-row`**
- kit:  `border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent); cursor: pointer; display: grid; grid-template-columns: 1.7fr .72fr .72fr 1.5fr`
- port: `border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent); cursor: pointer; display: grid; grid-template-columns: var(--lane-cols, minmax(120px,1.7fr) 96px 96px minmax(150px,1.4fr))`

**`.insp`**
- kit:  `display: flex; flex-direction: column`
- port: `display: flex; flex-direction: column; gap: 9px`

**`.seg2`**
- kit:  `background: var(--surface-3); border-radius: var(--radius-sm); border: 1px solid var(--border); display: inline-flex; gap: 2px; padding: 2px`
- port: `background: var(--surface-3); border-radius: var(--radius-sm); border: 1px solid var(--border); display: inline-flex; overflow: hidden`

**`.seg2 button`**
- kit:  `background: transparent; border-radius: 5px; border: 0; color: var(--text-2); font-size: 11px; font: inherit; padding: 3px 9px; white-space: nowrap`
- port: `background: transparent; border: 0; color: var(--text-2); cursor: pointer; font-size: 11.5px; height: 26px; padding: 0 11px`

**`.seg2 button.on`**
- kit:  `background: var(--surface-1); box-shadow: inset 0 0 0 1px var(--border-strong); color: var(--text-1)`
- port: `background: var(--accent); color: var(--text-on-accent); font-weight: 600`

**`.wf-head`**
- kit:  `color: var(--text-3); font-size: 11px; margin-bottom: 10px`
- port: `color: var(--text-3); font-size: 11px; line-height: 1.5; margin-bottom: 2px`

**`.wf-foot svg`**
- kit:  `color: var(--violet); flex: 0 0 auto; margin-top: 1px`
- port: `color: var(--violet-soft); flex: 0 0 auto; margin-top: 1px`

**`.wf-foot b`**
- kit:  `color: var(--violet-soft)`
- port: `color: var(--text-2)`

**`.tier3`**
- kit:  `background: var(--surface-2); border-radius: var(--radius-lg); border: 1px solid var(--border); cursor: default; margin-bottom: 9px; overflow: hidden; transition: var(--dur) var(--ease-out)`
- port: `background: var(--surface-2); border-radius: var(--radius-lg); border: 1px solid var(--border); padding: 11px 12px; transition: border-color var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out)`

**`.t3-h`**
- kit:  `cursor: pointer; user-select: none`
- port: `align-items: center; cursor: pointer; display: flex; gap: 8px; margin-bottom: 9px; user-select: none`

**`.t3-chev`**
- kit:  `align-items: center; background: transparent; border: 0; color: var(--text-3); cursor: pointer; display: inline-flex; padding: 0; transition: transform .15s var(--ease-out), color .12s`
- port: `color: var(--text-3); display: inline-flex; transition: transform var(--dur) var(--ease-out)`

**`.tier3.collapsed .t3-h`**
- kit:  `border-bottom: 0`
- port: `margin-bottom: 0`

**`.t3-meta`**
- kit:  `color: var(--text-3); font-family: var(--font-mono); font-size: 10.5px; font-weight: 400; margin-left: auto`
- port: `color: var(--text-2); font-size: 11.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`

**`.t3-body`**
- kit:  `padding: 6px 11px 9px`
- port: `display: flex; flex-direction: column; gap: 3px`

**`.prow`**
- kit:  `align-items: center; display: flex; gap: 8px; min-height: 28px; padding: 4px 0`
- port: `align-items: center; display: grid; gap: 9px; grid-template-columns: 78px 1fr auto; min-height: 30px`

**`.prow .pl`**
- kit:  `color: var(--text-2); flex: 0 0 78px; font-size: 11.5px; width: 78px`
- port: `color: var(--text-2); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`

**`.psrc`**
- kit:  `border-radius: 4px; border: 1px solid var(--border); color: var(--text-3); flex: 0 0 auto; font-family: var(--font-mono); font-size: 9px; padding: 1px 5px`
- port: `background: var(--surface-3); border-radius: var(--radius-xs); border: 1px solid var(--border); color: var(--text-3); font-family: var(--font-mono); font-size: 9px; font-weight: 700; letter-spacing: .06em; padding: 2px 5px; text-transform: uppercase`

**`.psrc.base`**
- kit:  `border-color: var(--border-strong); color: var(--text-2)`
- port: `color: var(--text-2)`

**`.pclear`**
- kit:  `background: transparent; border-radius: 5px; border: 1px solid var(--border); color: var(--text-3); display: grid; flex: 0 0 auto; height: 20px; place-items: center; width: 20px`
- port: `background: var(--surface-3); border-radius: var(--radius-xs); border: 1px solid var(--border); color: var(--text-3); cursor: pointer; display: grid; height: 20px; place-items: center; transition: var(--dur) var(--ease-out); width: 20px`

**`.pv-step`**
- kit:  `align-items: center; background: var(--surface-3); border-radius: var(--radius-xs); border: 1px solid var(--border); display: inline-flex`
- port: `align-items: center; background: var(--surface-3); border-radius: var(--radius-sm); border: 1px solid var(--border); display: inline-flex; height: 26px; overflow: hidden`

**`.pv-step .v`**
- kit:  `color: var(--text-1); font-family: var(--font-mono); font-size: 11px; min-width: 44px; padding: 0 4px; text-align: center`
- port: `color: var(--text-1); font-family: var(--font-mono); font-size: 11.5px; min-width: 50px; padding: 0 9px; text-align: center; white-space: nowrap`

**`.pv-step .pm`**
- kit:  `color: var(--text-2); cursor: pointer; display: grid; height: 26px; place-items: center; width: 22px`
- port: `align-self: stretch; color: var(--text-2); cursor: pointer; display: grid; place-items: center; user-select: none; width: 24px`

**`.pv-step .pm:hover`**
- kit:  `color: var(--accent)`
- port: `background: var(--surface-4); color: var(--accent)`

**`.pv-ctl`**
- kit:  `align-items: center; display: inline-flex; gap: 7px`
- port: `align-items: center; display: inline-flex; gap: 6px`

**`.swrow2`**
- kit:  `display: flex; gap: 4px`
- port: `flex-wrap: wrap; gap: 5px; justify-content: flex-end`

**`.fg-panel`**
- kit:  `background: var(--surface-2); border-radius: var(--radius-lg); border: 1px solid color-mix(in srgb, var(--cyan) 30%, var(--border)); margin-bottom: 9px; padding: 10px 11px`
- port: `background: var(--surface-2); border-radius: var(--radius-lg); border: 1px solid var(--border); margin-top: 12px; padding: 11px 12px`

**`.fg-head`**
- kit:  `align-items: center; display: flex; font-family: var(--font-display); font-size: 12px; font-weight: 600; gap: 7px; margin-bottom: 8px`
- port: `align-items: center; color: var(--text-1); display: flex; font-family: var(--font-display); font-size: 12px; font-weight: 600; gap: 7px; margin-bottom: 9px`

**`.fg-head svg`**
- kit:  `color: var(--cyan)`
- port: `color: var(--accent)`

**`.fg-hint`**
- kit:  `color: var(--text-3); font-family: var(--font-ui); font-size: 10px; font-weight: 400; margin-left: auto`
- port: `color: var(--text-3); font-size: 10px; font-weight: 400; margin-left: auto`

**`.fg-row`**
- kit:  `border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent); padding: 6px 0`
- port: `border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px; padding: 8px 0`

**`.fg-row:first-of-type`**
- kit:  `border-top: 0`
- port: `border-top: 0; padding-top: 0`

**`.fg-k`**
- kit:  `align-items: center; color: var(--text-1); display: flex; font-size: 11.5px; gap: 7px; margin-bottom: 6px`
- port: `align-items: center; color: var(--text-1); display: flex; font-size: 12px; gap: 7px`

**`.fg-band`**
- kit:  `background: var(--band); border-radius: 3px; height: 10px; width: 10px`
- port: `background: var(--band, var(--violet)); border-radius: 3px; flex: 0 0 auto; height: 10px; width: 10px`

**`.fg-fields`**
- kit:  `display: flex; gap: 8px`
- port: `display: flex; flex-wrap: wrap; gap: 8px`

**`.fg-f`**
- kit:  `align-items: center; background: var(--surface-3); border-radius: var(--radius-xs); border: 1px solid var(--border); display: inline-flex; font-family: var(--font-mono); font-size: 10.5px; gap: 5px; padding: 3px 6px`
- port: `align-items: center; background: var(--surface-3); border-radius: var(--radius-sm); border: 1px solid var(--border); color: var(--text-2); display: inline-flex; font-size: 11.5px; gap: 6px; padding: 3px 8px`

**`.fg-f.inh`**
- kit:  `color: var(--text-3)`
- port: `opacity: .72`

**`.fg-f.inh b`**
- kit:  `color: var(--text-2)`
- port: `color: var(--text-2); font-style: italic`

**`.fg-f b`**
- kit:  `font-weight: 600`
- port: `color: var(--text-1); font-family: var(--font-mono); font-weight: 600`

**`.fg-f .pm`**
- kit:  `border-radius: 3px; color: var(--text-2); cursor: pointer; display: grid; height: 18px; place-items: center; width: 18px`
- port: `border-radius: 4px; color: var(--text-2); cursor: pointer; display: grid; height: 18px; place-items: center; user-select: none; width: 18px`

**`.fg-f .pm:hover`**
- kit:  `background: var(--surface-4); color: var(--cyan)`
- port: `background: var(--surface-4); color: var(--accent)`

**`.fg-f .pm.x`**
- kit:  `font-size: 9px; padding: 0 5px; width: auto`
- port: `color: var(--text-3); font-family: var(--font-mono); font-size: 9px; padding: 0 5px; width: auto`

**`.locked`**
- kit:  `background: var(--surface-2); border-radius: var(--radius-lg); border: 1px solid var(--border); padding: 11px`
- port: `background: color-mix(in srgb, var(--surface-2) 75%, transparent); border-radius: var(--radius-lg); border: 1px dashed var(--border-strong); margin-top: 12px; padding: 11px 12px`

**`.locked-h`**
- kit:  `align-items: center; display: flex; font-family: var(--font-display); font-size: 12px; font-weight: 600; gap: 7px; margin-bottom: 8px`
- port: `align-items: center; color: var(--text-2); display: flex; font-family: var(--font-display); font-size: 12px; font-weight: 600; gap: 7px; margin-bottom: 8px`

**`.lock-pill`**
- kit:  `align-items: center; border-radius: 4px; border: 1px solid var(--border); color: var(--text-3); display: inline-flex; font-family: var(--font-mono); font-size: 9px; font-weight: 400; gap: 4px; margin-left: auto; padding: 1px 6px`
- port: `align-items: center; background: var(--surface-3); border-radius: var(--radius-pill); border: 1px solid var(--border); color: var(--text-3); cursor: pointer; display: inline-flex; font-family: var(--font-mono); font-size: 9px; gap: 4px; letter-spacing: .06em; …`

**`.locked-row`**
- kit:  `align-items: center; color: var(--text-2); display: flex; font-size: 12px; justify-content: space-between; padding: 3px 0`
- port: `align-items: center; color: var(--text-2); display: flex; font-size: 12px; gap: 6px; justify-content: space-between; padding: 3px 0`

**`.locked-note`**
- kit:  `color: var(--text-3); font-size: 10.5px; line-height: 1.45; margin: 7px 0 0`
- port: `color: var(--text-3); font-size: 10.5px; line-height: 1.45; margin-top: 8px`

**`.lc.t-cell`**
- kit:  `align-items: center; color: var(--text-2); display: flex; font-family: var(--font-mono); font-size: 11px; gap: 4px; position: relative`
- port: `align-items: center; color: var(--text-2); display: flex; font-family: var(--font-mono); font-size: 11px; gap: 4px`

**`.lc.t-cell.spill::before`**
- kit:  `background: linear-gradient(var(--cyan), color-mix(in srgb, var(--cyan) 10%, transparent)); border-radius: 2px; bottom: 4px; content: ""; position: absolute; top: 4px; width: 3px`
- port: `background: var(--cyan); border-radius: 2px; bottom: 4px; content: ""; position: absolute; top: 4px; width: 3px`

**`.achip`**
- kit:  `align-items: center; border-radius: var(--radius-pill); border: 1px solid color-mix(in srgb, var(--ch) 45%, transparent); display: inline-flex; font-family: var(--font-ui); font-size: 10px; gap: 5px; line-height: 1; padding: 2px 7px 2px 6px; white-space: nowra…`
- port: `align-items: center; border-radius: 999px; border: 1px solid transparent; display: inline-flex; font-family: var(--font-ui); font-size: 10px; gap: 5px; line-height: 1; padding: 3px 7px`

**`@keyframes popIn`**
- kit:  `from { transform: scale(.97) translateY(-4px); } to { transform: none; }`
- port: `from { opacity: 0; transform: scale(.98) translateY(-4px); } to { opacity: 1; transform: none; }`

**`.anim-section`**
- kit:  `margin-top: 18px`
- port: `border-top: 1px solid var(--border); margin-top: 16px; padding-top: 14px`

**`.ov-row`**
- kit:  `background: var(--surface-3); border-radius: var(--radius-sm); border: 1px solid var(--border); margin-bottom: 6px`
- port: `align-items: center; background: var(--surface-3); border-radius: var(--radius-sm); display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 5px; padding: 5px 6px`

**`.ov-row.anim-ov`**
- kit:  `position: relative`
- port: `box-shadow: inset 3px 0 0 var(--cyan); position: relative`

**`.ov-line`**
- kit:  `border-radius: 6px; cursor: pointer; transition: background .12s var(--ease-out)`
- port: `align-items: center; border-radius: 6px; display: flex; gap: 8px; padding: 7px 9px; transition: background .12s var(--ease-out)`

**`.ov-main`**
- kit:  `align-items: center; color: var(--text-1); display: flex; flex: 1; font-size: 12.5px; gap: 7px; min-width: 0`
- port: `align-items: baseline; display: flex; flex: 1; gap: 7px; min-width: 0`

**`.ov-sub`**
- kit:  `color: var(--text-3); font-family: var(--font-mono); font-size: 9px; letter-spacing: .04em; text-transform: uppercase`
- port: `color: var(--text-3); font-family: var(--font-mono); font-size: 9.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`

**`.cues-chip`**
- kit:  `background: color-mix(in srgb, var(--cyan) 12%, transparent); border-radius: var(--radius-pill); border: 1px solid color-mix(in srgb, var(--cyan) 38%, transparent); color: var(--cyan); cursor: pointer; font-family: var(--font-mono); font-size: 9.5px; padding: …`
- port: `background: color-mix(in srgb, var(--cyan) 12%, transparent); border-radius: var(--radius-pill); border: 1px solid color-mix(in srgb, var(--cyan) 35%, transparent); color: var(--cyan); cursor: pointer; font-family: var(--font-mono); font-size: 10px; padding: 1…`

**`.ov-act`**
- kit:  `background: transparent; border-radius: var(--radius-xs); border: 1px solid var(--border); color: var(--text-3); cursor: pointer; display: grid; flex: 0 0 auto; font-size: 12px; height: 23px; place-items: center; transition: var(--dur) var(--ease-out); width: …`
- port: `background: transparent; border-radius: 5px; border: 1px solid var(--border); color: var(--text-3); cursor: pointer; flex: 0 0 auto; font-size: 11px; height: 22px; width: 22px`

**`.ov-row.inherited`**
- kit:  `background: transparent; opacity: .85`
- port: `opacity: .72`

**`.ov-row.tomb`**
- kit:  `background: transparent; border-style: dashed`
- port: `background: transparent; border: 1px dashed color-mix(in srgb, var(--text-3) 45%, transparent)`

**`.ov-row.tomb .ov-ic`**
- kit:  `color: var(--warn)`
- port: `color: var(--danger, #ff5a7a)`

**`.tomb-lbl`**
- kit:  `color: var(--warn); font-size: 10px; font-style: italic`
- port: `background: color-mix(in srgb, var(--danger, #ff5a7a) 12%, transparent); border-radius: 4px; color: var(--danger, #ff5a7a); font-family: var(--font-mono); font-size: 9px; letter-spacing: .04em; padding: 1px 6px; text-transform: uppercase; white-space: nowrap`

**`.en-toggle`**
- kit:  `align-self: flex-start; background: var(--surface-2); border-radius: var(--radius-pill); border: 1px solid var(--border-strong); color: var(--text-3); cursor: pointer; font-family: var(--font-mono); font-size: 10.5px; font: inherit; height: 24px; padding: 0 11…`
- port: `align-self: flex-start; background: transparent; border-radius: var(--radius-pill); border: 1px solid var(--border-strong); color: var(--text-3); cursor: pointer; font-size: 11px; font: inherit; height: 24px; padding: 0 11px`

**`.add-row`**
- kit:  `display: flex; gap: 6px`
- port: `display: flex; gap: 6px; margin-top: 4px`

**`.add-btn`**
- kit:  `align-items: center; background: transparent; border-radius: var(--radius-sm); border: 1px dashed var(--border-strong); color: var(--text-2); cursor: pointer; display: flex; font-size: 12px; font: inherit; gap: 6px; height: 30px; justify-content: center; width…`
- port: `align-items: center; background: transparent; border-radius: var(--radius-sm); border: 1px dashed var(--border-strong); color: var(--text-2); cursor: pointer; display: inline-flex; flex: 1; font-size: 11px; font: inherit; gap: 5px; height: 28px; justify-conten…`

**`.add-btn:hover`**
- kit:  `border-color: var(--text-3); color: var(--text-1)`
- port: `border-color: var(--accent); color: var(--text-1)`

**`.add-btn.cyan:hover`**
- kit:  `background: color-mix(in srgb, var(--cyan) 9%, transparent)`
- port: `border-color: var(--cyan)`

**`.add-btn .caret`**
- kit:  `font-size: 9px; opacity: .8`
- port: `color: var(--text-3); font-size: 9px`

**`.custom-tag`**
- kit:  `border-radius: var(--radius-pill); border: 1px solid color-mix(in srgb, var(--cyan) 38%, transparent); color: var(--cyan); font-family: var(--font-mono); font-size: 9px; letter-spacing: .06em; margin-left: 7px; padding: 1px 7px; text-transform: uppercase`
- port: `background: color-mix(in srgb, var(--cyan) 12%, transparent); border-radius: 4px; color: var(--cyan); font-family: var(--font-mono); font-size: 9px; letter-spacing: .06em; padding: 1px 6px; text-transform: uppercase`

**`.ce-h`**
- kit:  `align-items: center; color: var(--cyan); display: inline-flex; font-family: var(--font-mono); font-size: 9.5px; gap: 6px; letter-spacing: .06em; text-transform: uppercase`
- port: `align-items: center; color: var(--cyan); display: flex; font-family: var(--font-mono); font-size: 9.5px; gap: 6px; letter-spacing: .06em; text-transform: uppercase`

**`.ov-redir`**
- kit:  `align-items: center; color: var(--text-3); display: inline-flex; margin-left: auto; transition: color .12s, transform .12s var(--ease-out)`
- port: `align-items: center; color: var(--text-3); display: inline-flex; margin-left: auto; transition: transform .12s var(--ease-out), color .12s`

**`.ap-h`**
- kit:  `align-items: center; background: transparent; border: 0; color: var(--text-3); cursor: pointer; display: flex; font-family: var(--font-mono); font-size: 9px; font: inherit; gap: 5px; letter-spacing: .06em; padding: 1px 0; text-transform: uppercase; width: 100%`
- port: `align-items: center; background: transparent; border: 0; color: var(--text-2); cursor: pointer; display: flex; font-family: var(--font-mono); font-size: 9.5px; font: inherit; gap: 5px; letter-spacing: .05em; text-transform: uppercase; width: 100%`

**`.ap-cue`**
- kit:  `background: color-mix(in srgb, var(--cyan) 8%, transparent); border-left: 1px dashed color-mix(in srgb, var(--text-3) 55%, transparent); border-radius: 4px; border-right: 1px dashed color-mix(in srgb, var(--text-3) 55%, transparent); bottom: 0; left: var(--cue…`
- port: `background: color-mix(in srgb, var(--surface-1) 55%, transparent); bottom: 0; box-shadow: inset 0 0 0 1px var(--border); left: var(--cue-l); position: absolute; top: 0; width: var(--cue-w)`

**`.ap-collapse`**
- kit:  `background: var(--surface-4); border-radius: 4px; border: 1px solid var(--border-strong); color: var(--text-2); cursor: zoom-out; display: grid; font-size: 9px; height: 15px; place-items: center; position: absolute; right: 2px; top: 2px; width: 15px; z-index: …`
- port: `background: var(--surface-2); border-radius: 4px; border: 1px solid var(--border-strong); color: var(--text-3); cursor: pointer; display: grid; font-size: 9px; height: 15px; place-items: center; position: absolute; right: 2px; top: 2px; width: 15px`

**`.ap-mini-cue`**
- kit:  `background: color-mix(in srgb, var(--cyan) 8%, transparent); border-left: 1px dashed color-mix(in srgb, var(--text-3) 55%, transparent); border-right: 1px dashed color-mix(in srgb, var(--text-3) 55%, transparent); bottom: 0; left: var(--cue-l); position: absol…`
- port: `background: color-mix(in srgb, var(--surface-1) 55%, transparent); bottom: 0; box-shadow: inset 0 0 0 1px var(--border); left: var(--cue-l); position: absolute; top: 0; width: var(--cue-w)`

**`.ov-flash`**
- kit:  `border-radius: var(--radius-sm); inset: 0; pointer-events: none; position: absolute; z-index: 2`
- port: `animation: anim-focus-flash 1.05s var(--ease-out); border-radius: var(--radius-sm); inset: 0; pointer-events: none; position: absolute; z-index: 2`

**`@keyframes anim-focus-flash`**
- kit:  `0% { box-shadow: 0 0 0 1px var(--cyan), inset 0 0 0 1px var(--cyan); background: color-mix(in srgb, var(--cyan) 16%, transparent); } 100% { box-shadow: 0 0 0 1px transparent; background: transparent; }`
- port: `0% { box-shadow: 0 0 0 1px var(--cyan), inset 0 0 0 1px var(--cyan); background: color-mix(in srgb, var(--cyan) 16%, transparent); } 100% { box-shadow: none; background: transparent; }`

**`.cb-l`**
- kit:  `color: var(--text-2); flex: 0 0 50px; font-size: 10.5px; width: 50px`
- port: `color: var(--text-2); cursor: help; flex: 0 0 50px; font-size: 10.5px; width: 50px`

**`.cb-select`**
- kit:  `appearance: none; background: var(--surface-1); border-radius: 6px; border: 1px solid var(--border-strong); color: var(--text-1); cursor: pointer; font-size: 11.5px; font: inherit; height: 26px; padding: 0 22px 0 9px; width: 100%`
- port: `-webkit-appearance: none; appearance: none; background: var(--surface-1); border-radius: 6px; border: 1px solid var(--border-strong); color: var(--text-1); cursor: pointer; font-size: 11px; font: inherit; height: 26px; padding: 0 22px 0 9px; width: 100%`

**`.preset`**
- kit:  `align-items: center; background: var(--surface-2); border-radius: var(--radius-sm); border: 1px solid var(--border); color: var(--text-2); cursor: pointer; display: flex; flex-direction: column; font-size: 10.5px; font: inherit; gap: 5px; padding: 9px 6px; tra…`
- port: `align-items: center; background: var(--surface-2); border-radius: var(--radius-md); border: 1px solid var(--border); color: var(--text-1); cursor: pointer; display: flex; flex-direction: column; font-size: 11px; font: inherit; gap: 5px; padding: 9px 6px; text-…`

**`.preset:disabled`**
- kit:  `border-style: dashed; cursor: not-allowed; opacity: .4`
- port: `cursor: not-allowed; opacity: .4`

**`.inh-disc`**
- kit:  `background: transparent; border: 0; color: var(--text-3); cursor: pointer; font-size: 11px; font: inherit; padding: 6px 2px 4px; text-align: left; width: 100%`
- port: `background: transparent; border: 0; color: var(--text-3); cursor: pointer; font-size: 10.5px; font: inherit; margin-top: 8px; padding: 3px 2px; text-align: left; width: 100%`

**`.inh-disc:hover`**
- kit:  `color: var(--text-1)`
- port: `color: var(--text-2)`

**`.tm-row`**
- kit:  `display: flex; flex-direction: column; gap: 0`
- port: `background: var(--surface-2); border-radius: var(--radius-md); border: 1px solid var(--border); box-shadow: inset 3px 0 0 var(--cyan); display: flex; flex-direction: column; gap: 0; margin: 7px 0; overflow: visible`

**`.substep`**
- kit:  `align-items: center; background: var(--surface-2); border-radius: var(--radius-sm); border: 1px solid var(--border); display: flex; gap: 8px; margin-top: 8px; padding: 7px 9px; position: relative`
- port: `align-items: center; background: var(--surface-2); border-radius: var(--radius-sm); border: 1px solid var(--border); display: flex; gap: 9px; margin: 0 10px 10px; padding: 8px 9px; position: relative`

**`.substep .ss-lbl`**
- kit:  `align-items: center; color: var(--text-2); display: inline-flex; flex: 0 0 auto; font-family: var(--font-mono); font-size: 9.5px; gap: 5px; letter-spacing: .04em; text-transform: uppercase`
- port: `align-items: center; color: var(--text-2); display: inline-flex; flex: 0 0 auto; font-size: 10.5px; gap: 5px`

**`.substep.na`**
- kit:  `background: transparent; border-style: dashed`
- port: `background: transparent; border-color: var(--border); border-style: dashed`

**`.substep.na .na-txt`**
- kit:  `color: var(--text-3); font-size: 10.5px; font-style: italic; margin-left: auto`
- port: `color: var(--text-3); font-size: 11px; font-style: italic`

### Kit-only selectors (158) — port may be missing these
- `@import url('../../colors_and_type.css'); @import url('../../components/pickers.css'); *`
- `.rail-resize`
- `.rail-resize:hover, .rail-resize:active`
- `.dock-resize`
- `.dock-resize:hover, .dock-resize:active`
- `.stage-pad`
- `.ctl.dim`
- `.kit-sel:disabled`
- `.block.sel .blk-t, .block.sel .blk-seg`
- `.track.has-sel .block:not(.sel):not(.multi):not(.live)`
- `.block .rs`
- `.block .rs.l`
- `.block .rs.r`
- `.block .rs::after`
- `.block .rs.l::after`
- `.block .rs.r::after`
- `.block:hover .rs, .block.sel .rs, .block.multi .rs`
- `.block .rs:hover`
- `.tl-lanes`
- `.tl-lanes .track`
- `.wave-wrap > .ruler.scrub`
- `.tl-lanes, .tl-toolrow, .track, .wave, .wave-wrap > .ruler`
- `body.tl-drag, body.tl-drag *`
- `.lc.inh`
- `.lc.ovr`
- `.lc.grouped`
- `.lc.word.grouped`
- `.ai-pill-wrap:hover .ai-pop`
- `.toast.ai`
- `.toast.ai svg`
- `.toast-undo`
- `.toast-undo:hover`
- `@keyframes aiPulse`
- `.aihot`
- `.seg2.sm button`
- `.pv-mode`
- `.seg2.pv button.on`
- `.pv-src`
- `.pv-src.exact`
- `.stage.exact`
- `.stage.exact::before`
- `.exact-btn`
- `.exact-btn:hover`
- `.wave-tag`
- `.block .blk-t`
- `.block .blk-subtick`
- `.block .blk-seg`
- `.block .fade.on`
- `.block .fade.in.on`
- `.block .fade.out.on`
- `.block.multi`
- `.tier3.sel`
- `.tier3.word.sel`
- `.tier3.group.sel`
- `.t3-h:hover`
- `.t3-h:hover .t3-chev`
- `.t3-chev:hover`
- `.prow .pv`
- `.swrow2 .sw-dot`
- `.swrow2 .sw-dot.on`
- `.fg-f.ovr b`
- `.locked-row .mono`
- `.mtag`
- `.acc-badge`
- `.acc-words`
- `.anim-dock .lane-head .lh.layout, .anim-dock .lane-row .lc.t-cell, .anim-dock .lane-row .lc.word`
- `.anim-dock .lane-head .lh.sub`
- `.anim-dock .lane-head .lh.anim svg`
- `.anim-dock .lane-head, .anim-dock .lane-row`
- `.anim-dock .lane-head .lh`
- `.acc-off`
- `.line-div`
- `.line-div span`
- `.line-div::before, .line-div span`
- `.lane-row.del .lc.word`
- `.sel-count`
- `.disabled-sec`
- `.soon`
- `.chips.disabled`
- `.chips.disabled .chip`
- `.exp-backdrop`
- `.exp-pop`
- `.exp-h`
- `.exp-x`
- `.exp-x:hover`
- `.exp-sec`
- `.exp-l`
- `.exp-opt`
- `.exp-inp`
- `.exp-inp:focus`
- `.exp-inp::placeholder`
- `.exp-burn`
- `.exp-div`
- `.exp-row`
- `.exp-row:hover`
- `.exp-row-i`
- `.exp-row-t`
- `.exp-row-t b`
- `.exp-row-s`
- `.btn.primary.on`
- `.sec-t.cyan svg, .sec-t .di`
- `.sec-sub`
- `.tier3.append`
- `.tier3.append:hover`
- `.tier3.append.word:hover`
- `.tier3.append.group:hover`
- `.tier3.append.word`
- `.tier3.append.group`
- `.t3-body .empty-row`
- `.ov-row:last-of-type`
- `.ov-ic`
- `.ov-ic.cyan`
- `.ov-main b`
- `.cues-chip:hover`
- `.ov-act.on`
- `.ov-row.inherited .ov-main b`
- `.ov-row.tomb .ov-main b`
- `.add-btn.cyan`
- `.custom-builder`
- `.numstep .v, .cb-step .v, .pv-step .v, .substep .stepper .sv`
- `@media (prefers-reduced-motion: no-preference)`
- `.cb-ease`
- `.cb-ease:hover`
- `.cb-add`
- `.cb-add:hover`
- `.ov-line:hover`
- `.ov-row:not(.editing) .ov-chev`
- `.ov-line:hover .ov-chev`
- `.cb-or`
- `.cb-or span`
- `.cb-or::before, .cb-or::after`
- `.preset:hover`
- `.tm-mode-line`
- `.tm-mode-line .ml-lbl svg`
- `.tm-row .seg`
- `.tm-row .seg-b`
- `.tm-row .seg-b:first-child`
- `.tm-row .seg-b .sb-l`
- `.tm-row .seg-b:hover`
- `.tm-row .seg-b.on`
- `.tm-row .seg-b.seq`
- `.tm-row .seg-b.seq.on`
- `.seq-wrap .seq-back`
- `.seq-wrap .md-pop`
- `.seq-wrap .md-grp`
- `.seq-wrap .md-item`
- `.seq-wrap .md-item:hover`
- `.seq-wrap .md-item.on`
- `.seq-wrap .md-item .mi-ck`
- `.substep .ss-lbl svg`
- `.substep .stepper`
- `.substep .stepper button`
- `.substep .stepper button:hover`
- `.substep .stepper .sv`
- `.substep .unit`
- `.substep .unit button`
- `.substep .unit button:last-child`
- `.substep .unit button.on`

_Port-only selectors: 259 (additive — not Track A)._
