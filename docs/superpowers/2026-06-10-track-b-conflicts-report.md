# Track B conflicts — detailed report (2026-06-10)

The **genuine conflicts** from the zip-14 design audit: places where the designer's reference kit and
our ported app BOTH implement something but DISAGREE. (Distinct from the port-ahead surfaces the kit
never modeled, and from the timeline cluster zip-15 already decided.) Each item below is verified at
small scale against the live branch.

- **KIT** (source of truth): `/tmp/zip14/.../ui_kits/desktop-app/{app,panels,anims,model,stage}.jsx` + `theme.css`
  (archived decisions context: `docs/superpowers/zip15-decisions/`).
- **PORT**: `web/src/**` on `feat/designer-sync` (post Track-A + zip-15 patch + timeline rework).
- Engine cross-checked under `engine/` / `mcp_server/` where it settles a "bug vs choice" question.

## Summary & triage

| # | Conflict | Severity | Bug / Choice | Recommendation |
|---|---|---|---|---|
| 1 | `align` in the Style Waterfall | Med | **Choice** (port is engine-faithful) | **Keep port**; consider relabeling to disambiguate the two align channels |
| 2 | GROUP anim-tier `gi != null` guard | Med | **Bug (latent)** | **Fix** — gate the tier; resolve with #6 |
| 3 | EventStrip placement (dock top vs bottom) | Low | Choice | Designer pick (cosmetic) |
| 4 | Default rail tab + selection | Low | Choice (documented) | Designer pick |
| 5 | Alignment control model (dropdown vs inline grid) | Low–Med | Choice (+minor UX regression) | **Hybrid** — add disabled-reason tooltip + value caption |
| 6 | `clearSelection` target (null vs global/0) | Med | Choice (bug-adjacent) | **Fix with #2** (nullable selection) |
| 7 | Magnet chip "alt" state | Low | Choice | Designer pick |
| 8 | Inspector tier chrome (band + selection rings) | Med | Choice (documented "zip 11") | Designer pick; **hybrid** restores polish only |
| 9 | ADJ-12 equality-clear on B/I/U | Med | Choice (intended/newer) | **Keep port** (inheritance hygiene) |
| 10 | Merged-cue badge / GROUP preview text | Low–Med | (i) **Bug** / (ii) Choice | **Fix (i)** full token text; (ii) designer pick |

**Actionable now without a designer (deterministic):** #2 + #6 (together), #10(i). Everything else is a
product/design decision (bundle for a designer pass) or already a settled port choice.

**Cross-cutting:** #2 and #6 are the same underlying issue — PORT's `clearSelection → {scope:"global", gi:0}`
(#6) plus the unguarded GROUP anim tier (#2) is the one mechanism by which a group-scoped animation edit can
silently target `layout[0]` when nothing meaningful is selected. Fixing #6 (nullable selection) neutralizes #2.

---

## Conflict 1 — `align` in the Style Waterfall

**Summary:** KIT's style model has 12 keys and no `align` (alignment lives only in placement/ControlsRail);
PORT added `align` as a 13th style key and renders an Alignment row in the GROUP + GLOBAL waterfall tiers.

**KIT** — `model.jsx:96`:
```js
const STYLE_KEYS = ["font","fontsize","bold","italic","underline","primary","outline","back","back_alpha","outline_w","shadow","border_style"];
```
`CUE_STYLE_KEYS` (`model.jsx:97`) filters only `border_style`. `STYLE_META` (`panels.jsx:13-24`) has no
`align` entry. Alignment is exclusively placement: `ControlsRail` (`panels.jsx:39-53`) edits `pl.align`
(1–9 numpad) via `onPlacement({align:n})`.

**PORT** — `types.ts:1-2`:
```ts
export const STYLE_KEYS = ["font",...,"border_style","align"] as const;
export const CUE_STYLE_KEYS = STYLE_KEYS.filter((k) => k !== "border_style" && k !== "align");
```
`GlobalStyle.align: number` (`types.ts:9`). `StyleWaterfall.tsx:35` adds a meta entry
`align: { label:"Alignment", kind:"align", fmt: v => \`${ALIGN_SHORT[Number(v)] ?? "?"} (${v})\` }`,
with `ALIGN_SHORT` (`:39-43`) and an `align` control branch (`:150-153`) rendering
`<AlignGrid value={Number(val)||2} onPick={(n)=>onSet(pkey,n)} />`. GROUP + GLOBAL tiers pass
`keys={STYLE_KEYS}` (`:362,379`), CUE passes `keys={CUE_STYLE_KEYS}` (`:343`) → the row shows in
**GROUP + GLOBAL only**, never CUE (codified by `StyleWaterfall.align.test.tsx:22-39`).

**Engine check (settles it):** the real engine treats `align` as a group-level style key —
`engine/model.py:7-17` (`STYLE_KEYS` includes `align`; `GROUP_ONLY_STYLE_KEYS=("border_style","align")`),
`set_group_style` accepts it (`engine/mutations.py:34-44`), `engine/ass.py:116-121` emits a per-group Style
`align` override. So `style.align` is a genuine engine capability the KIT simply under-modeled. **Nuance:**
the engine ALSO has a separate placement/cfg align (`mcp_server/tools.py:9` `_PLACE_KEYS`, `engine/ass.py:145`)
that PORT's ControlsRail still edits via `set_globals` — so PORT exposes two align channels (placement-global
vs group/global style); the KIT only ever modeled the placement one.

**Difference:** KIT 12 keys, align placement-only, never in the waterfall. PORT 13 keys, align is a GROUP+GLOBAL
waterfall row (excluded from CUE) AND still a placement control.

**Severity: Med · Choice (port closer to the engine), not a bug.** Only smell: two "alignment" controls may confuse.

**Options:** match-kit (drop align from the waterfall — loses a real engine feature) · keep-port (most faithful,
two surfaces) · **hybrid** (keep the row but relabel/group so placement-align vs style-align is explicit).

---

## Conflict 2 — GROUP anim-tier `gi != null` guard  *(latent bug)*

**Summary:** KIT renders the GROUP `AnimTier` only when a group is selected (`gi != null`); PORT renders it
unconditionally, so with no group selected it binds to `gi=0`.

**KIT** — `anims.jsx:735-737`:
```js
{selWid != null && <AnimTier tierScope="cue" {...tierProps} />}
{gi != null && <AnimTier tierScope="group" {...tierProps} />}
<AnimTier tierScope="global" {...tierProps} />
```

**PORT** — `AnimSection.tsx:604-606` (no guard):
```tsx
{selWid != null && <AnimTier tierScope="cue" {...tierProps} />}
<AnimTier tierScope="group" {...tierProps} />
<AnimTier tierScope="global" {...tierProps} />
```
`AnimTier` declares `gi: number` (non-nullable, `:476`); `groupRows(project, gi)` is called at `:485`.

**Concrete bad behavior:** PORT seeds `sel.gi=0` always (`Editor.tsx:62`) and `clearSelection` resets to
`gi:0` (see #6), so `gi` is never actually null. `groupRows` is null-safe (`animRows.ts:64-67`). Net effect:
the GROUP tier is ALWAYS shown — even at GLOBAL scope or after Esc — bound to `layout[0]`. A group-tier
add/remove from that state dispatches `refFor("group", gi=0,…) → 0` (`AnimSection.tsx:57`), i.e. mutates
Verse 1 regardless of what's actually selected.

**Severity: Med · Likely BUG (latent).** Not a crash; a misdirected-edit defect.

**Options:** **match-kit** (gate `{sel.scope !== "global" && …}` or make `gi` nullable + guard — fixes it;
pairs with #6) · keep-port (accidental layout[0] edits remain) · hybrid (render but disable add/remove unless
scope is group/cue).

---

## Conflict 3 — EventStrip placement in the dock

**Summary:** KIT renders `<EventStrip>` as the LAST dock child (below dock-body); PORT renders it near the TOP
(between dock-tabs and OpsToolbar).

**KIT** — `app.jsx:565` (after dock-body): `{sel.scope==="group" && sel.gi!=null && <EventStrip g={P.layout[sel.gi]} onSet={setLayoutProp} />}`.
Dock order: dock-resize → dock-tabs → OpsToolbar (`:529`) → dock-body (`:537`) → **EventStrip** (`:565`).

**PORT** — `Editor.tsx:1150-1152` (between dock-tabs and OpsToolbar):
```tsx
{groupExplicitSel && sel.scope === "group" && P.layout[sel.gi] && (
  <EventStrip g={P.layout[sel.gi]} onSet={setLayoutProp} />
)}
```
Dock order: dock-tabs → **EventStrip** → OpsToolbar (`:1153`) → dock-body (`:1176`). (PORT adds the
`groupExplicitSel` gate — see #4.)

**Severity: Low · Choice** (pure ordering). Options: match-kit (below body, less discoverable) · keep-port
(always visible at top).

---

## Conflict 4 — Default rail tab + default selection

**Summary:** KIT boots `railTab="inspector"` + a CUE selection on word 3; PORT boots `railTab="project"` +
a GROUP selection at gi 0 with no tok — to avoid label overlap.

**KIT** — `app.jsx:30,33`:
```js
const [sel, setSel] = useState({ scope: "cue", gi: 0, tok: tokAt(INITIAL_PROJECT, 0, 0, 3) }); // the "bleating" cue
const [railTab, setRailTab] = useState("inspector");
```
**PORT** — `Editor.tsx:62,79`:
```tsx
const [sel, setSel] = useState<SelState>({ scope: "group", gi: 0, tok: null });
// rail / dock tabs — start on "project" so StyleWaterfall doesn't overlap CueLanes event labels
const [railTab, setRailTab] = useState<"project" | "inspector">("project");
```
Plus `groupExplicitSel` (`Editor.tsx:65-66`): "EventStrip only appears after an explicit group selection
(avoids duplicate label text nodes)".

**Severity: Low · Choice (documented).** Options: match-kit (Inspector+cue first impression, but reopens the
overlap/duplicate-label condition) · keep-port (safer render) · hybrid (Inspector+cue default but keep the
groupExplicitSel guard).

---

## Conflict 5 — Alignment control model (ControlsRail)

**Summary:** KIT = labelled dropdown ("Bottom-Center (2)") → 3×3 popover, dimmed + titled when `\pos` active;
PORT = always-visible inline `<AlignGrid disabled>`, no value text, no disabled-reason tooltip.

**KIT** — `panels.jsx:39-53`:
```jsx
<div className={"ctl" + (pl.use_pos ? " dim" : "")}><label>Alignment</label>
  <div className="ag-wrap">
    <button className="kit-sel" disabled={!!pl.use_pos}
      title={pl.use_pos ? "Disabled — free placement (\\pos) overrides alignment" : ""}
      onClick={() => !pl.use_pos && setAgOpen(o => !o)}>{ALIGN[cur]} ({cur})<Icon name="chevDown" size={14} /></button>
    {agOpen && !pl.use_pos && (…<div className="ag-grid">{[7,8,9,4,5,6,1,2,3].map(n => …)}</div>)}
  </div>
</div>
```
**PORT** — `ControlsRail.tsx:56-59`:
```tsx
<div className="ctl"><label>Alignment</label>
  <AlignGrid value={pl.align} onPick={(n) => onSetGlobal("align", n)} disabled={posOn} />
</div>
```
PORT loses: the textual current value, the `.dim` row class, the disabled-reason `title`. Dispatch also
differs (KIT `onPlacement({align})` vs PORT `onSetGlobal("align", n)` → `set_globals`).

**Severity: Low–Med · Choice (+minor UX regression).** Options: match-kit (popover+dim+tooltip, more work) ·
keep-port (simpler scan) · **hybrid** (inline grid + add the disabled-reason `title` and a current-value caption — cheap).

---

## Conflict 6 — `clearSelection` target  *(bug-adjacent; pair with #2)*

**Summary:** KIT's Esc/clear → `scope:null` (truly nothing); PORT's `clearSelection` → `scope:"global", gi:0`.

**KIT** — `app.jsx:136` (+ Esc `:124`): `setSel({ scope: null, gi: null, tok: null });`
**PORT** — `Editor.tsx:371-375`:
```tsx
const clearSelection = useCallback(() => {
  setSel({ scope: "global", gi: 0, tok: null });
  setSelectedWords(new Set()); anchorRef.current = null;
}, []);
```
PORT's `SelState` is non-nullable (`scope: "global"|"group"|"cue"; gi: number` — `Editor.tsx:33-37`) so it
*can't* represent "nothing"; clearing lands on GLOBAL with `gi:0` still set — the mechanism behind #2's
accidental `layout[0]` targeting and why the waterfall always shows GLOBAL after a clear.

**Severity: Med · Choice with bug-adjacent consequences.** Options: **match-kit** (make `SelState` nullable,
clear to null — fixes #2; ripples through `gi:number` consumers) · keep-port (latent targeting remains) ·
hybrid (keep non-nullable but treat `scope:"global"` as "no group context" everywhere group UI/dispatch is gated).

---

## Conflict 7 — Magnet chip "alt" state

**Summary:** KIT shows three literal states (`on`/`off`/`alt`); PORT shows only `on`/`off`, inverting while Alt held.

**KIT** — `app.jsx:543`: `…Magnet<span className="st-state">{altHeld ? "alt" : (magnet ? "on" : "off")}</span>`
**PORT** — `Editor.tsx:1188`: `<span className="st-state">{altHeld ? (magnet ? "off" : "on") : magnet ? "on" : "off"}</span>`

KIT names the modifier ("alt"); PORT previews the resulting snap state (inverted on/off).

**Severity: Low · Choice.** Options: match-kit ("alt") · keep-port (effective state) · hybrid ("alt → off").

---

## Conflict 8 — Inspector tier chrome

**Summary:** KIT = card with a shaded/ruled header band + scope-colored selection rings + clickable
header-select; PORT = flat header (no band), no `.sel` rings, header click only collapses.

**KIT** — `theme.css:439-454`: `.tier3.sel`, `.tier3.word.sel`, `.tier3.group.sel` (rings); `.t3-h`
with `background: color-mix(... surface-3 60% ...)` + `border-bottom: 1px solid var(--border)`; `.t3-h:hover`;
`.tier3.collapsed .t3-h { border-bottom: 0 }`. The KIT `Tier` wires `selected` + `onSelect`
(`panels.jsx:155,159,197,203,208`).

**PORT** — `theme.css:598-610` (comment at `:603`: "zip 11: tier header = collapse only … No scope-select,
no selected ring."): flat `.t3-h { display:flex; margin-bottom:9px; cursor:pointer }`, `.t3-body` flex column;
component header has `onToggle` only (`StyleWaterfall.tsx:266-273`) — no `selected`/`onSelect`. **Absent in PORT:**
all `.tier3*.sel` rings, the `.t3-h` band + `:hover`, `.tier3.collapsed .t3-h`. Consequence: KIT lets you click
a tier header to SELECT that scope; PORT's only scope-selection path is the dock.

**Severity: Med · Choice (documented "zip 11").** Options: match-kit (rings + band + header-select — reopens
the header-select interaction the port removed + #4 overlap) · keep-port (settled) · **hybrid** (restore only
the header band cosmetics, keep collapse-only).

---

## Conflict 9 — ADJ-12 equality-clear on B/I/U toggles

**Summary:** KIT always writes explicit on toggle (`onSet`); PORT, on non-global tiers, `onClear`s when the
toggled value equals the inherited value (round-trips to inherited). GLOBAL always writes in both.

**KIT** — `panels.jsx:76` + `:104`: `onClick={() => onSet(pkey, !val)}` and `onTypo={(k,v)=>onSet(k,v)}` — always explicit.
**PORT** — `StyleWaterfall.tsx:107-121` + `:260-263`:
```tsx
const next = !val;
if (!isGlobal && next === inheritFrom.value) onClear(pkey); else onSet(pkey, next);
…
if (!isGlobal && value === inherit[key]?.value) onClear(scope, key); else onSet(scope, key, value);
```
Documented "ADJ-12" (`:107-111`,`:257-259`): equality-clear applies to the **toggle kind only**, **non-global only**;
steppers/colors still always set. Changes the persisted shape (fewer redundant overrides) + the grp/glob src badge.

**Severity: Med · Choice (intended/newer; kit predates it).** Options: match-kit (always set — leaves redundant
overrides equal to inherited, defeats the inherit indicator) · **keep-port** (cleaner inheritance; a toggle can emit
a *clear*). Either/or — no hybrid.

---

## Conflict 10 — Merged-cue CUE badge + GROUP preview text

**Summary:** (i) KIT CUE badge = full merged token text; PORT = first word only — info loss on merged cues.
(ii) KIT GROUP preview = selected cue's text; PORT = the group label.

**KIT** — `panels.jsx:185,194`: `const text = tok ? tokText(project, tok) : "Karaoke";` and CUE badge
`“{tokText(project, tok)}”`. `tokText` (`model.jsx:110`) joins all `tok.ids` → "up in". GROUP tier reuses the
cue-derived preview.
**PORT** — `StyleWaterfall.tsx:340,342,359`:
```tsx
previewText={project.words[tok.ids[0]]?.text || "Karaoke"}                 // CUE — first word only
badge={<span className="t3-meta">"{project.words[tok.ids[0]]?.text ?? ""}"</span>}
previewText={g.label || "Karaoke"}  badge={<span className="t3-meta">{g.label}</span>}  // GROUP — label
```

**Severity: Low–Med.** (i) **Bug** — merged cue "up in" shows as "up" in the badge + picker previews.
(ii) Choice — group-label preview is defensible for a group-wide style tier.

**Options:** (i) **match-kit/fix**: `tok.ids.map(id => project.words[id]?.text).join(tok.sep || " ")` (trivial) ·
keep-port (misrepresents merges). (ii) match-kit (cue text — depends on which cue is selected) · keep-port
(`g.label`, stable) · hybrid (cue text when a cue is selected, else `g.label`).
