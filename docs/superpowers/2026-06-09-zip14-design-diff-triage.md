# Design-system diff triage — zip 14 full snapshot vs. ported codebase (2026-06-09)

Maps **every** difference between the designer's most-current snapshot
(`Karaoke Subtitle Studio — Design System (14).zip`, the complete self-contained
`desktop-app-bundle`: 8 JSX modules + `theme.css` + `colors_and_type.css`/`fonts.css`/`pickers.css`
+ `index.html`) and `web/src/**`, then splits the work into two tracks.

## How to read this

zip14 is a **static mock the designer reverse-derived from our app** (CDN React/Babel, `window`
globals, in-memory history, sample data). So raw "differences" fall into three buckets, and they
are NOT equivalent:

- **▲ Port-ahead** — real features the mock cannot contain (daemon, RTL, video, live libass,
  timing edit, anim strips, cue lanes). Not regressions. The only open question is whether the
  designer has *seen* their visual treatment → those go to **Track B**.
- **▼ Kit-ahead** — visual/UX the designer refined in the kit that our code lacks or dropped.
  The kit is authoritative here and the correct behavior is unambiguous → **Track A**.
- **✗ Conflict** — both model the thing but disagree on placement/label/value/behavior. If the
  fix is "match the kit" with no product judgment → Track A; if it's a real product choice → Track B.

The full per-surface inventory (with the ▲/▼/✗ markers and file refs) lives at the bottom under
**Appendix: complete difference inventory**. The two tracks below are the actionable split.

Severity: **High** = visible on every session / re-introduces a known bug · **Med** = noticeable ·
**Low** = pixel-tier. Effort: XS/S/M.

---

## TRACK A — adopt the kit (designer-leading, no new design decision)

Where zip14 is the source of truth and the right outcome is "make ours match." Safe to proceed.

### A1. Picker-transparency regressions — re-introduces the zip-12 §E bug
| Item | Sev | Fix | Effort |
|---|---|---|---|
| **`.ksp-pop` opacity re-added** (`pickers.css`) | High | Kit animates **transform only**; opacity deliberately stays `1` (long comment warns the fixed popover must never flash half-transparent on delayed first paint). Ours re-added `opacity:0→1`. Revert keyframe to transform-only. | XS |
| **`.prow.inh { opacity:.8 }`** whole-row opacity (`theme.css`) | High | Kit dims only specific children at `.62` and **never** puts opacity on a picker-popover ancestor (documented). Ours flattens the entire inherited row → can render the portaled popover half-transparent. Match the kit: per-child dim at `.62`, no ancestor opacity. | S |

> These two undo exactly what zip-12 §E (the picker portal fix) was meant to guarantee. Highest priority.

### A2. Visual fidelity — kit look we dropped
| Item | Sev | Fix | Effort |
|---|---|---|---|
| ~~Gradient caption fill + glow~~ | — | **DISCARDED (2026-06-09).** Not a regression — the kit's `capFill` only has a defensive branch for `gradient(` strings its own data never produces; our model/ColorPicker carry solid hex only and the engine has zero gradient support (real impl = per-char `\c` stops, a future HANDOFF item). Restoring the preview alone would render something export can't produce. Not doing it. | — |
| **`.cap` font-size clamp halved** | High | Kit `clamp(15px,3.3cqw,64px)` → ours `clamp(11px,4.2cqw,36px)`. Kit caption is ~1.8× bigger on large stages. Restore kit clamp (verify against our multi-line grouping). | S |
| **Library card metadata** | Med | Render caption preview (`.cap2`), duration pill (`.dur`), and "edited Xh ago" (`.sub`). **Backend half:** enrich `library.list_projects` to return `{name, modified (mtime), duration_s, caption}` — all derivable today (no schema change). **NO preset badge, NO kind** (decided 2026-06-09 — mock-only concepts absent from our model). | M |
| ~~`.block.sel` selection treatment~~ | — | **VERIFIED PRESENT (2026-06-09).** Our timeline renders `.wt-area .block` (not legacy `.track .block`); `.wt-area .block.sel` (theme.css:333) already has the multi-ring glow + recede-others (`.wt.has-sel`, :336) + resize handles (:382-386). The orphan `.block.sel` at theme.css:272 is dead legacy — optional cleanup only. No port needed. | — |
| **Swatch dots** | Low | Kit `.sw-dot` = 17×17 rounded-rect + 2px accent ring shadow when on. Ours = 16×16 circle + outline. Match kit shape/size/indicator. | XS |
| **`.num-in` edit affordance** | Low | Kit highlights the editable value cell with a cyan inset ring + tint; ours is a plain surface-1 box. Restore the cyan edit ring. | XS |
| **`.substep::before` elbow connector** | Low | Kit draws an L-shaped connector from a sub-row to its parent; we removed it. Restore. | XS |
| **Export popover entrance + close-X** | Low | Kit `.exp-pop` has a `popIn` animation, `--shadow-pop`, and an `.exp-x` close button; ours `.export-pop` dropped the animation, uses a shallower shadow, and has no close-X. | S |

### A3. Missing affordances present in the kit
| Item | Sev | Fix | Effort |
|---|---|---|---|
| **`dock-hint` contextual help text** | Med | Kit shows a per-tab help span in the dock (Timeline: "Drag the ruler… ⇧ range · ⌘/ctrl pick"; Cue lanes: "Click a cue… ⇧ select range…"). Absent everywhere in our dock. Add the `dock-hint` span (`Editor.tsx:1078-1096`). | S |
| **Favicon not wired** | Low | Kit `index.html` links `logo-mark.svg` as `rel="icon"`; our `web/index.html` has none (asset exists at `web/public/logo-mark.svg`). Add the link. | XS |
| **`Select` / `Combo` display atoms** | Low | Kit defines div-based `Select`/`Combo` atoms (`.select`/`.combo` CSS exists in our theme); we never ported the components. Port them if any styled non-native select is needed. | S |
| **Break/Join label never flips to "Join line"** | Med | Kit toggles the button label between "Break line"/"Join line" on `lineBroken`; ours is always "Break line" (state shown only via `on` highlight). Restore the label flip (`OpsToolbar.tsx:63-66`). | XS |
| **TimingPanel "Stop" → we renamed to "End"** | Low | Kit row label is "Stop". Decide: match kit ("Stop") or keep "End". Trivial; listed here as a kit-match. | XS |

### A4. Token / markup hygiene (no visual change today, but kit-authoritative)
| Item | Sev | Fix | Effort |
|---|---|---|---|
| **Gradient tokens removed** | Med | Kit defines `--grad-brand`, `--grad-brand-vert`, `--grad-live`, `--grad-canvas`, `--grad-stage`; we deleted all 5 and inlined the literals. Re-add the tokens and reference them so palette re-skinning works. | S |
| **Self-hosted variable fonts → CDN @import** | Med | Kit self-hosts variable .ttf (`@font-face`, full axes: Hanken 100–900, JetBrains 100–800) + a `--family-*` registry. We `@import` Google Fonts with discrete 400/500/600/700 only. Re-vendor the variable fonts + restore the registry tier (also fixes offline). | M |
| **Color/accent swaps** (`.minibtn.on` cyan→accent, `.md-item.on` violet→cyan, tombstone warn→danger) | Low | Several active-state colors drifted from the kit. Match kit unless a deliberate re-theme. | S |
| **`chevRight` markup, fallback stacks, `.crumb` clamp, snap-toggle/tl-toolrow sizes, playhead glow, sg-tag offset, preset-picker columns** | Low | The pixel-tier table in the appendix — batch as one "kit-fidelity CSS pass". | M |

> **Backend note (library cards):** The only backend touch in Track A. `library.list_projects` (`daemon/library.py:201`) returns names only; enrich it to `[{name, modified, duration_s, caption}]` — all derivable from existing files (`project.json` mtime, `cues_v2`/video duration, `lyrics.json` first words). TDD-first per house rule. preset/kind dropped (no model concept).

---

## TRACK B — needs designer review (product decision or un-reviewed surface)

### B1. Port-ahead surfaces with NO kit reference (designer never saw these)
The mock can't contain them, so there's no authoritative visual. Confirm the treatment is signed off.
| Surface | Why it needs review |
|---|---|
| **Timeline vertical lane grouping** | Kit timeline is ONE flat label-less time-track (confirmed: `gi` only picks palette color). We render one labelled `.wt-lane` per event with a gutter. This is a fundamental rendering-model choice the kit does not depict — is the lane model the intended design, or should the timeline be flat like the kit? **The single biggest divergence.** |
| **Animation strips on timeline blocks** | Stacked strip bars / glyph chips / `+N` overflow / inline-expand / focus-retime. No kit treatment at all. |
| **Cue Lanes panel** | Entire LAYOUT+ANIMATION grid; kit references it only by name in tooltips. |
| **CreateProjectModal** | Full create flow (`.modal/.cpm/.fld/.seg-btn`); no kit reference. |
| **VideoControl** | 4-state upload/swap/clear; kit Video is a static read-only path row. |
| **Live libass renderer + exact-frame image** | Kit live mode is CSS-approx only, exact mode is a button with no frame. Badge wording ("libass · wasm" vs kit "CSS approx"/"libass") is a design call. |
| **Text-direction (RTL) rail section + bidi marks + RTL hint chip** | No kit counterpart. |
| **Animations rail link, timeline zoom, placement snap guides + band height, arrow-key timing nudge** | Added affordances with no kit equivalent. |
| **Editable TimingPanel (was a locked "planned feature" placeholder in the kit)** | Kit explicitly defers it; we built full Start/End/Text editing. Confirm against an updated handoff. |

### B2. Genuine conflicts — both model it, the "right" answer is a product choice
| Item | The decision the designer owns |
|---|---|
| **`align` added to the Style Waterfall** | Kit keeps alignment ONLY in ControlsRail/placement (12 `STYLE_KEYS`, no `align`). We added an `align` row + `GlobalStyle.align` to GLOBAL+GROUP tiers. Is per-tier alignment styling intended, or scope creep to revert? (Also needs engine agreement.) |
| **EventStrip placement** | Kit renders it at the **bottom** of the dock (after the body); we render it at the **top** (above the toolbar). Which? |
| **Default rail tab + default selection** | Kit opens on **Inspector** tab with a **cue** pre-selected; we open on **Project** tab with a **group/empty** selection (to avoid a label-overlap bug). Confirm intended open-state. |
| **Alignment control model** | Kit = labelled dropdown ("Bottom-Center (2)") + popover; ours = always-open inline `AlignGrid`, no textual label, no disabled-reason tooltip. Keep inline grid or restore the labelled dropdown? |
| **`clearSelection` target** | Kit clears to "nothing selected" (`scope:null`); we clear to the global tier. Should Esc be able to land on no-selection? |
| **Magnet chip "alt" state** | Kit chip reads literally **"alt"** while Alt is held; we instead flip on↔off. Which reads better? |
| **GROUP anim-tier gating (`gi != null`)** | Kit hides the GROUP `AnimTier` when no group is in context; we render it unconditionally → indexes an invalid `gi`. **This one is arguably a straight bug** (add the guard) — but listed here because it touches selection-model intent. Likely promote to Track A. |
| **Tier chrome (shaded header band + tier selection rings)** | Kit `.tier3`/`.t3-h` has a filled header band and clickable tier selection (`.tier3.sel`); we flattened the header and removed tier selection. Restore the band? Re-enable tier-click selection? |
| **Waveform: bars vs honest tick ruler** | Kit draws a (placeholder) bar waveform + fixed 6-mark ruler; we deliberately dropped bars for an adaptive tick ruler ("no real audio to draw"). Keep honest ruler, or render placeholder bars to match the kit look until real audio lands? |
| **ADJ-12 equality-clear on B/I/U toggles** | We clear the override when a toggle equals the inherited value; kit always writes explicit. Confirm the round-trip-to-inherited semantics are wanted. |
| **Merged-cue badge / GROUP preview text** | Kit badge = full merged `tokText`, GROUP preview = cue text; we show first-word-only / group label. |

---

## Needs a non-CSS verification before classifying
| Item | Check |
|---|---|
| **GLOBAL_STYLE engine defaults** | Kit pins defaults (fontsize 64, bold true, outline_w 3, back_alpha "80", border_style 1). Our web layer pins none — they come from the backend. Confirm `engine`/`get_project` defaults match the kit; if not, that's a silent divergence. |
| ~~`.block.sel` relocation~~ | **RESOLVED (2026-06-09):** relocated to `.wt-area .block.sel` (glow + recede + handles intact); the `.track .block.sel` at theme.css:272 is dead legacy. Not a regression. |
| **Resolved-source naming** | Kit anim source label is `"cue"`; our `ResolvedAnim.src` uses `"tag"` (style source is `"cue"` in both). Internal inconsistency — confirm intended. |

## Mock-isms — explicitly NOT differences to act on
Simulated AI-agent edit loop · in-memory `useHistory` · `PROJECTS`/`WORDS` sample data ·
`onOpen("bleating")` static nav · CDN React/Babel + `text/babel` + `_ds_bundle.js` + `window.*`
globals · `setTimeout`-faked burn/download · mock MCP connection strings · the picker `KSP_DS`
bundle shim + inline swatch/`<select>` fallback · `WAVE_BARS` constant data.

---

## Suggested order if we act
1. **A1 (picker transparency)** — smallest, highest value, undoes a known regression. Do first.
2. **A2 + A4 kit-fidelity CSS pass** — gradient text, `.cap` size, swatch/num-in/elbow/export-pop,
   gradient tokens, color swaps, the pixel-tier batch. One frontend sweep, all unambiguous.
3. **A3 affordances** — dock-hint, favicon, Break/Join label, Select/Combo atoms.
4. **Verification items** — engine defaults, `.block.sel` relocation, src naming (quick checks that
   may move things between tracks).
5. **Track B handoff** — bundle B1 (un-reviewed surfaces, led by the timeline-grouping question)
   and B2 (the conflicts) into one designer review, same as the prior editor-iteration loop.

---

## Appendix: complete difference inventory
The full per-surface tables (Library, Top bar, Rail, Preview stage, Timeline, Cue lanes,
Waveform, Style waterfall, Timing, Anim panel, Pickers, Typography/fonts, Tokens/model/icons,
and the pixel-level "dock-drag line width" tier) are reproduced from the six parallel module
audits. Marker key: ▼ kit-only · ▲ port-only · ✗ conflict · = identical · ⚠ verify.

### A.1 Project Library screen
| | Difference | Detail |
|---|---|---|
| ▼ | Card caption preview gone | Kit thumbnail shows a 2-line caption preview (`.cap2`, 2nd line bold) + duration pill (`.dur`). Our `ProjectThumb` renders only the empty `.scan` panel. |
| ▼ | Card metadata gone | Kit `.sub` line: preset `.badge` + kind ("Reels"/"Shorts") + "edited 3h ago". Ours shows only `.nm`. (Blocked partly by `projects.list()` returning names only.) |
| ▲ | Real create flow | Kit "New project" is static `onOpen("bleating")`; we have `CreateProjectModal`. Modal styling has no kit reference. |
| = | Search box | Both non-functional static `.lib-search`. Brand/hero/logo/"v3"/copy byte-identical. |

### A.2 Top bar / transport
| | Difference | Detail |
|---|---|---|
| ✗ | Undo/redo tooltip text | Kit titles carry shortcut inline (`"Undo (⌘Z)"`); we moved it to `aria-keyshortcuts`, visible title is just `"Undo"`. |
| ✗ | Undo/redo never disabled | Kit disables at history ends; we hard-code both `true` (server-authoritative history). |
| ▲ | Play forces live mode | Our `onPlay` also sets `pvMode="live"`; kit just toggles `playing`. |
| = | Brand, crumb, AI pill, transport set (−2s/play/+2s, `m:ss.xx`), Export — structurally identical. |

### A.3 Left rail (ControlsRail)
| | Difference | Detail |
|---|---|---|
| ▲ | Text-direction section | Whole "Text direction (global)" block (Auto/LTR/RTL + bidi marks + note). No kit counterpart. |
| ▲ | Animations link | "Edit animations →" row → Inspector. No kit counterpart. |
| ▲ | VideoControl | Kit Video = static read-only path row (`meta.video`); we have 4-state upload/swap/clear. |
| ✗ | Alignment control model | Kit = labelled dropdown ("Bottom-Center (2)") + 3×3 popover, `dim`+tooltip when `\pos` active. We = always-visible inline `AlignGrid` + `disabled` prop, no textual label, no disabled-reason tooltip. |
| ✗ | Free-placement toggle | Kit `<Toggle on={pl.use_pos}>`; we derive from bbox (`posActive`) via inline `role="switch"`. Equivalent. |

### A.4 Preview stage
| | Difference | Detail |
|---|---|---|
| ▲ | Live libass renderer | Kit live = CSS-approx DOM; we run jassub wasm canvas + hit-layer ("libass · wasm", "LIVE" pulse). Kit exact = button; we render a real `<img>` frame. |
| ▼ | Gradient text fill + glow dropped | Kit caption supports gradient fills (`background-clip:text`) + glow (`capFill`/`isGradient`, `stage.jsx:66-75`). Ours solid color only. |
| ▲ | Multi-line + per-word scale + bidi | We group by line, support per-word `scale` em, RTL `dir`. Kit one flat flow, no scale, no bidi. |
| ✗ | Mode toggle placement | Kit Live/Exact toggle inside stage (`.pv-mode > .seg2.pv`) + source pill. Ours in `.stage-mode-bar` above stage + separate `.approx-badge`. |
| ▲ | Placement snap guides + band height | We add centre/5%/10% safe-line guides + synthetic `bandH`. Kit has no in-stage placement guides. |
| ✗ | Inline pin/bbox tags | Kit shows live `\pos x,y` and `margins L..R..V..`; we show bare `\pos`/`margins`, coords in separate `.drag-readout`. |
| ✗ | Stage box-model | Rewritten (ADJ-13): kit `aspect-ratio:16/9` fill; ours `min(100cqw,(100cqh-78px)*16/9)`. |

### A.5 Timeline (headline structural difference)
| | Difference | Detail |
|---|---|---|
| ✗ | Vertical lane grouping | Kit `WordTrack` = ONE flat `.track`, blocks positioned horizontally only, `gi` only picks palette color — no rows/lanes/labels. We render one labelled `.wt-lane` per event + gutter. |
| ▲ | Animation strips on blocks | Stacked strip bars per type, glyph chips, `+N` overflow, inline-expand, collapse ✕, focus-retime, source-link highlight. Kit blocks have none. |
| ▲ | Timeline zoom | `pxPerSecOverride` + playhead-anchored `zoomAnchorScroll`. Kit no zoom. |
| ✗ | Drag gated behind `unlocked` | Kit blocks always editable, `.rs.l/.rs.r` grips always present. Ours `.wt-handle` only when `unlocked`; move-vs-resize inferred from cursor. |
| ✗ | Snap-guide visuals | Kit delegates to parent; we self-render `.wt-guides` + seconds `.sg-tag`. |
| ✗ | Min block width | Kit `0.8%`, ours `0.4%`. |

### A.6 Cue Lanes panel
| | Difference | Detail |
|---|---|---|
| ▲ | Entire panel is port-only | Kit has no CueLanes — referenced only by name in block tooltips. We have the full LAYOUT(text·start·end)+ANIMATION grid, resizable persisted columns, collapse chevrons, `\N` dividers, spill carets, channel-colored anim chips with waterfall state. |

### A.7 Waveform / ruler
| | Difference | Detail |
|---|---|---|
| ✗ | Bars vs no bars | Kit draws 56 `WAVE_BARS`, played bars get `.on`, fixed 6-mark ruler, "placeholder" tag. We dropped bars for an adaptive tick ruler + gutter spacer. |
| ▲ | Scrub + magnet | We add drag-to-scrub + playhead magnet-snap to edges. Kit click-to-seek only. |
| ✗ | Ruler tick model | Kit fixed `dur/5` 6 marks; ours adaptive snapped-step ticks in `.ruler-row`. |

### A.8 Inspector — Style Waterfall
| | Difference | Detail |
|---|---|---|
| ✗ | `align` added as a waterfall row | Kit `STYLE_KEYS` = 12, no `align`; alignment only in ControlsRail/placement. We add `align` row (`kind:"align"`→`AlignGrid`, `ALIGN_SHORT`) to GLOBAL+GROUP + `GlobalStyle.align`. |
| ✗ | Tier chrome | Kit `.tier3` = card w/ shaded `.t3-h` header band + `.t3-body`; ours flat padded card, transparent header. Kit has tier selection rings (`.tier3.sel`) + clickable `onSelect` — we removed both. |
| ✗ | Property row layout | Kit `.prow` = flex (`.pl` 78px/`.pv` flex). Ours = grid `78px 1fr auto` (explicit clear column). |
| ✗ | Inherited-row dimming (popover-safety) | Kit dims specific children at `.62`, never on a popover ancestor. Ours `opacity:.8` on whole `.prow.inh`. |
| ✗ | Swatch dots | Kit 17×17 rounded-rect + 2px accent ring shadow on; ours 16×16 circle + outline + hover scale. |
| ✗ | ADJ-12 equality-clear | We clear override when B/I/U toggle == inherited; kit always writes explicit. |
| ✗ | Merged-cue badge text | Kit = full merged `tokText`; ours = `words[ids[0]]` only. |
| ✗ | GROUP preview text | Kit = actual cue text; ours = group label ("Verse 1"). |
| ✗ | `.psrc`/`.pclear`/`.seg2` styling | Source badge kit plain bordered → ours bold uppercase surface-3. Clear kit transparent → ours surface-3. `.seg2` kit padded pill (raised surface-1 "on") → ours flush bordered (solid accent "on"); kit `.seg2.sm`/`.pv` variants absent. |

### A.9 Inspector — Timing & Event strip
| | Difference | Detail |
|---|---|---|
| ▲ | TimingPanel fully editable | Kit = hard-locked placeholder ("planned feature"), static `.lock-pill`, `<b class="mono">` start/stop. We made it a lock toggle + editable Start/End `NumField` + editable Text. |
| ✗ | Label "Stop" → "End" | Kit row label "Stop"; ours "End". |
| ✗ | Lock-pill interactive | Kit static label; ours pill toggle w/ accent states. `.locked` card: kit solid border/solid surface; ours dashed strong border/translucent surface. |
| ✗ | EventStrip negative linger | Kit clamps `max(0,n)`; we reject `n<0` (null). Trivial. |
| ✗ | EventStrip placement | Kit at dock **bottom** (after body); ours at dock **top** (above toolbar). |
| ✗ | EventStrip gating | Kit shows on any `scope==="group"`; ours additionally requires `groupExplicitSel`. |

### A.10 Inspector — Animation panel (closest match)
| | Difference | Detail |
|---|---|---|
| ✗ | GROUP tier not gated on `gi != null` | Kit renders GROUP `AnimTier` only with group context (`anims.jsx:736`); we render unconditionally (`AnimSection.tsx:605`) → invalid `gi` indexing. |
| ✗ | Section header markup | Kit `.sec-t cyan spacer` + empty `.di` divider; ours `.sec-t cyan` + plain space. |
| ✗ | Tier class namespace | Kit `tier3/t3-h/tier-tag/word` + `.t3-meta`; ours `tier/tier-h/ttag/cue`, label inline. |
| ✗ | Seq popover backdrop | Kit `.seq-back` click-catcher for outside-click dismiss; we omit it. |
| = | Everything else identical — 8 presets, ＋Custom tile, 9 channels, DEFAULT_CUSTOM, CB_EASE, buildCustom/customCfgOf/isCustomAnim, timing modes, segment timing, AnimPreview, redirect `»`, tombstone/restore, focus-flash, add-row per tier. |

### A.11 Pickers
| | Difference | Detail |
|---|---|---|
| ✗ | `.ksp-pop` opacity re-added (bug) | Kit animates transform only, opacity stays 1; we re-added `opacity:0→1`. |
| ▲ | RTL hint chip | We add `.ksp-rtl-hint` (cyan dashed) in font picker. Additive. |
| = | Rest of pickers.css byte-identical (panel 268px, SV square, hue/alpha tracks, swatch dots, font list, BIU grid, z-indices). |

### A.12 Ops toolbar
| | Difference | Detail |
|---|---|---|
| ▲ | Group fade-in/out + Clear in/out buttons | Kit toolbar has exactly 7 controls, NO fade buttons (fades = alpha animations). We prepend fade shortcuts + a `sep`. |
| ✗ | Break/Join label | Kit toggles "Break line"/"Join line"; ours always "Break line" (state via highlight only). |
| ✗ | Empty-state hint text | Kit "⇧ shift = range · ⌘/ctrl = pick"; ours "shift-click words to multi-select". |
| ▲ | `on`/aria-pressed on Merge/Delete | We add toggle highlight; kit only flips Delete label. |

### A.13 Typography & fonts
| | Difference | Detail |
|---|---|---|
| ✗ | `.cap` font-size | Kit `clamp(15px,3.3cqw,64px)` → ours `clamp(11px,4.2cqw,36px)` (~1.8× smaller). |
| ✗ | Font delivery | Kit self-hosted variable .ttf (`@font-face`, Hanken 100–900/JetBrains 100–800) + `--family-*` registry → ours Google `@import`, discrete 400/500/600/700, no registry. |
| ✗ | Fallback stacks | Kit longer (`-apple-system,"Segoe UI"…`/`"SF Mono",Menlo…`); ours `system-ui,sans-serif`/`ui-monospace,monospace`. |

### A.14 Tokens / model / icons
| | Difference | Detail |
|---|---|---|
| ✗ | Gradient tokens removed | Kit `--grad-brand`/`-brand-vert`/`-live`/`-canvas`/`-stage`; we deleted all 5, inlined literals. |
| ▲ | Model extensions | Full `AnimChannel`/`TimingMode` enums, `accel:"inout"`, `stagger?`/`custom?`, `Globals.text_direction`/`bidi_marks`, `Project.video`. Additive. |
| ✗ | Resolved-source naming | Kit anim src `"cue"`; ours `ResolvedAnim.src` = `"tag"` (style src `"cue"` in both). |
| ⚠ | GLOBAL_STYLE defaults unpinned | Kit pins fontsize 64/bold true/outline_w 3/back_alpha "80"/border_style 1; web layer pins none (backend supplies). Verify engine match. |
| ▼ | `Select`/`Combo` atoms | Kit defines div-based atoms; we never ported (CSS exists, components don't). |
| ✗ | `chevRight` glyph | Kit `<polyline 9 6 15 12 9 18>`; ours `<path m9 18 6-6-6-6>`. Identical render. |
| ▲ | Extra icons | We add `shield`/`alertCircle`/`alertTriangle`/`info`. All 28 kit icons present + identical. |
| = | Palette identical | 10 hexes byte-for-byte, mirrored `--cue-1..10`. All numeric color/spacing/radius/shadow/easing tokens identical. |

### A.15 Pixel-level tier ("dock-drag line width" examples)
| | Selector | Kit → Ours |
|---|---|---|
| ✗ | Pane drag line | `.rail-resize`/`.dock-resize` = **8px** strip tinted `accent 35%` → `.splitter` **2px** `--border` hairline (+kbd nudge, dbl-click reset, ARIA). |
| ✗ | `.snap-toggle` | height 28→26px, left pad 11→10px |
| ✗ | `.tl-toolrow` | bottom pad 6→2px |
| ✗ | waveform `.playhead` | 50% cyan + 6px/35% glow → solid cyan + 10px glow |
| ✗ | `.playhead.tl-through::before` dot | kit keeps (top −2px) → we hide; we add `.ph-head` 13×9 grab-tab kit lacks |
| ✗ | `.snap-guide .sg-tag` top | −2px → 2px (4px lower) |
| ✗ | `.minibtn.on` | cyan active → accent/magenta active |
| ✗ | `.md-item.on` + checkmark | violet → cyan |
| ✗ | `.ov-row.tomb`/`.tomb-lbl` | warn/amber italic → danger/red mono uppercase chip |
| ✗ | `.preset-picker` columns | 2 → 4 |
| ✗ | `.num-in` | cyan inset-ring tint → plain surface-1 |
| ✗ | `.substep::before` elbow | kit L-connector → removed |
| ✗ | `.ap-cue` window | cyan-tint + dashed edges → neutral surface + inset border |
| ✗ | `.tm-row` | kit unstyled → carded + cyan left accent bar |
| ✗ | `.crumb` | clamps to 200px + ellipsis → runs full width |
| ✗ | Export popover | `.exp-pop` fixed/top58/right18/`--shadow-pop`/`popIn`/close-X → `.export-pop` absolute/top52/right16/shallow shadow/no anim/no close-X |
| ▼ | Unported kit classes | `.line-div`, `.sel-count`, `.disabled-sec`/`.soon`, `.mtag`/`.acc-badge`/`.acc-words`, `.toast.ai`/`.toast-undo`/`aiPulse`/`.aihot` |
| ⚠ | classic `.track`/`.block` styles | `.block.sel` glow+lift+scale, `.has-sel` recede, `.rs` handles, `.blk-subtick`, `.fade.on`, `.block.multi` flagged "removed" — likely relocated to `.wt-area .block.sel`. Verify on screen. |
