# Animation Panel Rework — Design

**Source:** designer kit zip 13 — `export/handoff-anim-editor/HANDOFF.md` + `ui_kits/desktop-app/{anims,atoms,app,panels,theme,icons}.jsx`. The kit **leads** the product; we port the behavior + visual contract, not the literal JS.

**Target:** `web/src/components/panels/AnimSection.tsx` (+ `StyleWaterfall`, a new shared `EditableNum`, model helpers), `engine/` + `daemon/`/`mcp_server/` for one new mutation, `web/src/components/Editor.tsx` wiring.

**Branch:** `feat/custom-anim-picker-fix` (already carries the §E picker portal fix + the timeline-block fix; the superseded zip-12 CustomBuilder draft was discarded, keeping only the `AnimChannel` widening).

This supersedes the zip-12 §D "CustomBuilder popover" approach entirely.

---

## Goals

Rework the Inspector animation panel so that:

1. **Custom animations are authored in-row**, are first-class (real timing modes, editable forever), and are flagged with `custom: true`.
2. **Inherited rows redirect** to where the animation is actually defined.
3. The panel shows **previews** (per-tier timeline + per-animation mini) so authors get immediate visual feedback.
4. **Preset animations gain a timing-window editor** (segment From/To offsets).
5. **Every numeric cell is click-to-type editable** via a shared `EditableNum` atom.

---

## Model change

Custom animations stop using the `mode: "custom"` sentinel. Instead:

- A custom animation carries **`custom: true`** and a **real timing `mode`** (default `"percue"`), plus `step`/`step_unit`/`enabled` like any preset. This lets a custom animation use per-cue / cascade / … sequencing.
- `Animation.custom?: boolean` is added to `web/src/types.ts`. (The `AnimChannel` union was already widened in this branch to the custom channels: `outline | fontsize | shear_x | rot_z | spacing | border_w`.)

**Back-compat:** `isCustomAnim(anim) === !!(anim.custom || anim.mode === "custom")`. No heavy migration is written: there is **no shipped data** with `mode:"custom"` (the only code that ever emitted it was the discarded zip-12 draft, never released). `isCustomAnim` treats a legacy `mode:"custom"` as custom for display; the first `set_animation_props({mode})` from the timing picker overwrites the sentinel with a real mode. The engine already round-trips an unknown `custom` key verbatim (`anim_add` deep-copies the record; `validate_animation` only reads known keys), so **no engine change is needed for persistence**.

---

## Backend: one new mutation

`anim_set_props` only allows `mode/step/step_unit/segments/enabled/name` and cannot change `channel` or the record **count**. Editing a custom's Property can flip single↔paired channels (Scale = `scale_x` + `scale_y` sharing a `group_id`), so we need a dedicated mutation.

**Decision — client builds, engine splices.** The client already owns `buildCustom` (TS); duplicating it in Python would be wasteful. So:

- Client rebuilds the full record set from the editor cfg via `buildCustom(cfg, nextId, timing)`, where `nextId` **returns the existing lead id first** (preserving it), then fresh ids for any new sibling. Timing/`enabled` are carried forward from the current lead.
- New engine mutation **`anim_edit_custom(project, scope, ref, anim_id, anims)`**: find the lead `anim_id` in the carrier list, compute the replaced set (`anim_id` + any `group_id` siblings), validate each incoming record, and splice the new records **in place at the lead's slot** (preserving surrounding order). No-op if the lead isn't an own record at that scope.
- New tool **`edit_custom_animation(ctx, scope, ref, anim_id, anims)`** in `mcp_server/tools.py` (mirrors `add_animation`: `_norm_scope` → `_do(ctx, "anim_edit_custom", …)` → `_anim_view`), registered in `mcp_server/server.py`.
- Client method `editCustomAnimation(...)` in the API client; `Editor.tsx` wires `onEditCustom = (scope, ref, animId, cfg) => { build recs; dispatch("edit_custom_animation", {scope, ref, anim_id, anims}); }`.

**Second backend change — sibling-sync for segment writes.** `SegmentTiming` (and the existing strip drag-retime) edit the **lead** segment via `anim_set_props`, but a multi-channel preset (Pop = `scale_x`+`scale_y`, identical segments) must keep siblings in sync or they visibly desync. So `anim_set_props` is extended: when the target anim has a `group_id`, the `segments` / `t0` / `t1` writes apply to **every own record sharing that `group_id`** (not `mode`/`step`/`enabled`/`name`, which stay per-record — though in practice siblings share them). This also fixes the pre-existing drag-retime-only-moves-`scale_x` gap. Covered by the same TDD.

Engine + both mutation changes are **test-first** per the house rule.

---

## Shared frontend pieces

- **`EditableNum`** (new, `web/src/components/controls/EditableNum.tsx`): a click-to-type value cell that drops in place of a stepper's read-only value span. Props `{ display, value, parse, onCommit, step?, className?, title? }`. Click/focus → numeric `<input.num-in>`; **Enter/blur commits, Esc cancels, ↑/↓ nudge by `step`**; `stopPropagation` so it doesn't trigger row-toggle; surrounding +/− buttons keep working. Reused by every numeric stepper.
- **`anchorSec(span, t)`** (new, in `web/src/model/animCustom.ts`): preview-only resolver mirroring `engine/anim.anchor_seconds` for a nominal cue — `base = /_end$/.test(t.anchor) ? span[1] : span[0]`; `frac` → `base + offset*(span[1]-span[0])`, else `base + offset/1000`. **Not** authoritative timing (the daemon resolves real times); only lays out the representative-cue previews.
- **Model helpers** (`web/src/model/animCustom.ts`, unit-tested): `isCustomAnim`, `DEFAULT_CUSTOM`, `CUSTOM_TIMING`, `CUSTOM_CHANNELS`, `buildCustom(cfg, nextId, timing)`, `customCfgOf(anim)` (inverse: reconstructs `{ch, anchor, offset, mode, dur, ease, value}` from the stored lead segment).

---

## AnimSection rewrite

- **Shared open state** lifted to `AnimSection`: `open = { scope, id, nonce }` with a `setOpen` that bumps `nonce` each call. A `useEffect([open])` scrolls the focused `.anim-ov.editing` row into view (walk to nearest scrollable ancestor; `getBoundingClientRect` math — **never `scrollIntoView`**, per house rule) and re-triggers an `.ov-flash` pulse keyed by `nonce`.
- **`＋ Custom`** immediately adds `DEFAULT_CUSTOM` (= `{ch:"primary", anchor:"cue_end", offset:-30, mode:"snap", dur:200, ease:"out", value:"#FF3DA6"}`) and opens its details. Authoring lives in a controlled **`CustomEditor`** inside `.ov-edit` (Property / When / Value / Transition). **Color Value uses the product's shared `ColorPicker` (`mode="field"`)** — not bespoke swatches — matching the style waterfall, and benefiting from the §E portal fix.
- **Own rows** show: mini-preview, Enabled toggle, `TimingModePicker`, then either the `CustomEditor` (custom) or `SegmentTiming` (preset). The row icon is `sliders` for customs (`sparkles` otherwise) + a `custom` tag.
- **Inherited rows** become a clickable **redirect** with a `»` (double `chevRight`) affordance → `setOpen({scope: row.src, id: row.id})`. ✕ still removes (tombstone-here); ↺ restores tombstones.
- **`AnimPreview`** (per tier): collapsible "bogus cue" (`NOMINAL_CUE = 1.0s`) with resolved animations (own + inherited, tombstones excluded) as type-coded strips (`apStripStyle` keyed by channel); own = solid, inherited = dashed + corner marker, disabled = dimmed; capped at `AP_MAX = 3` with a `+N` chip that expands inline; click a strip → focus via the shared `open`.
- **`AnimStripPreview`** (per animation, in details): one strip of that animation on the representative cue + timing caption.
- **`SegmentTiming`** (presets only): From/To rows, each Start/End anchor + offset stepper (ms or %), live duration readout (`instant`/`Nms`/`ends before start`); writes the lead segment's `t0`/`t1` via `onSetProps({segments:[…]})` — the engine's sibling-sync (above) propagates it to `group_id` siblings (Pop). **Row is a render function, not a nested component**, so the live input isn't remounted on re-render (focus-loss guard, per HANDOFF note).

## StyleWaterfall + EventStrip

- `StyleWaterfall` PropRow steppers → `EditableNum`: **Size**, **Outline-w**, **Shadow**, and **Box-alpha** (hex: `parse` reads base-16, `onCommit` writes the 2-digit hex string).
- **Group Linger** (EventStrip) → `EditableNum` (seconds, step 0.1).
- **TimingModePicker → Step** → `EditableNum` (ms or %; `parse` converts % ↔ fraction).

---

## Testing strategy

- **Engine (TDD):** `anim_edit_custom` — replaces lead in place preserving id+slot; carries timing; handles single→paired (adds sibling) and paired→single (drops sibling); validates; no-op on inherited/missing. `anim_set_props` sibling-sync — a `segments`/`t0`/`t1` write to a `group_id` lead updates all siblings; non-segment props stay per-record. Round-trip `custom:true` through save/load + `get_project`.
- **Model (vitest):** `buildCustom`/`customCfgOf` round-trip; `isCustomAnim` (incl. legacy `mode:"custom"`); `anchorSec` (cue_start/end, ms vs frac).
- **Components (vitest/jsdom):** `EditableNum` (commit/cancel/nudge, stopPropagation); `CustomEditor` cfg→onChange; `SegmentTiming` writes segments; inherited-row redirect calls `setOpen(src,id)`; `＋Custom` adds default + opens; `AnimPreview` strip click focuses; StyleWaterfall editable steppers + box-alpha hex.
- **e2e (native daemon):** add a custom at cue scope → edit its Property (flip to Scale) → assert two `scale_*` records share `group_id` and the lead id is preserved; inherited redirect opens the owning tier.

---

## Out of scope

- §F true-italic/bold/underline mid-cue event split (designer-marked "spec, not done"; backend `render.py`/`ass.py` work).
- DS housekeeping (`.jsx.txt` rename) — kit-side only.
