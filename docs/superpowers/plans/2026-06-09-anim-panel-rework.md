# Animation Panel Rework — Implementation Plan

> **For agentic workers:** implement task-by-task. Steps use checkbox (`- [ ]`) syntax. Engine/daemon code is **test-first** (house rule). Port the kit's JSX behavior + visual contract, not the literal JS.

**Goal:** Land zip-13's animation-panel rework (in-row custom authoring, inherited-row redirect, previews, preset timing-window editor, click-to-type numbers) plus the carried-forward zip-12 §D row-UX.

**Spec:** `docs/superpowers/specs/2026-06-09-anim-panel-rework-design.md`

**Kit reference (verbatim source for the JSX port):** `/tmp/zip13/export/handoff-anim-editor/changed/ui_kits/desktop-app/{anims,atoms,app,panels,theme,icons}.jsx`

**Branch:** `feat/custom-anim-picker-fix` (carries §E picker fix, timeline fix, `AnimChannel` widening, the spec).

**Tech:** Python engine/daemon + MCP tools; React/Vite/TS web; vitest (jsdom) + Playwright e2e; pytest for engine.

---

## Phase 1 — Backend: `anim_edit_custom` + `anim_set_props` sibling-sync (TDD)

**Files:**
- Test: `tests/test_anim_edit_custom.py` (new, pytest-style)
- Modify: `engine/mutations.py` (`anim_edit_custom`, extend `anim_set_props`)
- Modify: `mcp_server/tools.py` (`edit_custom_animation`), `mcp_server/server.py` (register)
- Test: `tests/test_anim_tools.py` or `tests/test_anim_daemon.py` (tool round-trip)

- [ ] **1.1 Write failing engine tests** `tests/test_anim_edit_custom.py`:

```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest
from engine import mutations as M
import anim_fixtures as fx

def _custom(id, ch="primary", gid=None, to="#FF3DA6"):
    a = fx._anim(id=id, name="fill", channel=ch, segments=[
        fx._seg(fx._time("cue_end", -30), fx._time("cue_end", -30), None, to, 1)])
    a["custom"] = True; a["group_id"] = gid; a["mode"] = "percue"
    return a

# replace a single-channel custom in place, preserving lead id + slot
def test_edit_custom_replaces_in_place_preserving_id():
    p = fx.synth_project()
    M.anim_add(p, "global", None, _custom("a1"))
    M.anim_add(p, "global", None, fx._anim(id="z9", channel="alpha"))  # a later sibling row
    newrec = _custom("a1", ch="blur", to=6); newrec["segments"][0]["to"] = 6
    M.anim_edit_custom(p, "global", None, "a1", [newrec])
    lst = p["globals"]["animations"]
    assert [a["id"] for a in lst] == ["a1", "z9"]          # slot + order preserved
    assert lst[0]["channel"] == "blur" and lst[0]["custom"] is True

# single → paired (Scale) adds a sibling sharing group_id; lead id kept
def test_edit_custom_single_to_paired_adds_sibling():
    p = fx.synth_project()
    M.anim_add(p, "global", None, _custom("a1"))
    sx = _custom("a1", ch="scale_x", gid="a1"); sy = _custom("a2", ch="scale_y", gid="a1")
    M.anim_edit_custom(p, "global", None, "a1", [sx, sy])
    lst = p["globals"]["animations"]
    assert [a["channel"] for a in lst] == ["scale_x", "scale_y"]
    assert lst[0]["id"] == "a1" and lst[0]["group_id"] == "a1" and lst[1]["group_id"] == "a1"

# paired → single drops the sibling
def test_edit_custom_paired_to_single_drops_sibling():
    p = fx.synth_project()
    M.anim_add(p, "group", 0, _custom("a1", ch="scale_x", gid="a1"))
    M.anim_add(p, "group", 0, _custom("a2", ch="scale_y", gid="a1"))
    M.anim_edit_custom(p, "group", 0, "a1", [_custom("a1", ch="primary")])
    lst = p["layout"][0]["animations"]
    assert [a["id"] for a in lst] == ["a1"] and lst[0]["channel"] == "primary"

# no-op when the id isn't an own record at that scope
def test_edit_custom_noop_on_missing():
    p = fx.synth_project()
    M.anim_edit_custom(p, "global", None, "nope", [_custom("nope")])
    assert p["globals"]["animations"] == []

# validation: bad incoming record raises
def test_edit_custom_validates():
    p = fx.synth_project()
    M.anim_add(p, "global", None, _custom("a1"))
    bad = _custom("a1"); bad["channel"] = "bogus"
    with pytest.raises(ValueError):
        M.anim_edit_custom(p, "global", None, "a1", [bad])

# sibling-sync: a segments write to a group_id lead updates all siblings
def test_set_props_segments_sync_group_siblings():
    p = fx.synth_project()
    M.anim_add(p, "group", 0, _custom("a1", ch="scale_x", gid="a1"))
    M.anim_add(p, "group", 0, _custom("a2", ch="scale_y", gid="a1"))
    newseg = [fx._seg(fx._time("cue_start", 0), fx._time("cue_start", 120), 1, 1.2, 1)]
    M.anim_set_props(p, "group", 0, "a1", {"segments": newseg})
    lst = p["layout"][0]["animations"]
    assert lst[0]["segments"][0]["t1"]["offset"] == 120
    assert lst[1]["segments"][0]["t1"]["offset"] == 120     # sibling synced

# sibling-sync does NOT touch non-segment props (mode stays per-record)
def test_set_props_mode_not_synced():
    p = fx.synth_project()
    M.anim_add(p, "group", 0, _custom("a1", ch="scale_x", gid="a1"))
    M.anim_add(p, "group", 0, _custom("a2", ch="scale_y", gid="a1"))
    M.anim_set_props(p, "group", 0, "a1", {"mode": "cascade", "step": 80, "step_unit": "ms"})
    lst = p["layout"][0]["animations"]
    assert lst[0]["mode"] == "cascade" and lst[1]["mode"] == "percue"
```

Run: `.venv/bin/python -m pytest tests/test_anim_edit_custom.py -q` → FAIL (`anim_edit_custom` missing).

- [ ] **1.2 Implement `anim_edit_custom`** in `engine/mutations.py` (after `anim_set_props`):

```python
def anim_edit_custom(project, scope, ref, anim_id, anims):
    """Replace an own animation (and its group_id siblings) at scope/ref with the
    provided record set, in place at the lead's slot. The client rebuilds the
    records (preserving the lead id); the engine validates + splices. No-op if
    anim_id isn't an own record here."""
    lst = _anim_list(project, scope, ref)
    lead = next((a for a in lst if a["id"] == anim_id), None)
    if lead is None:
        return
    gid = lead.get("group_id")
    replaced = {a["id"] for a in lst if a["id"] == anim_id or (gid and a.get("group_id") == gid)}
    for rec in (anims or []):
        _anim.validate_animation(project, scope, ref, rec)
    out, inserted = [], False
    for a in lst:
        if a["id"] in replaced:
            if not inserted:
                out.extend(copy.deepcopy(r) for r in (anims or []))
                inserted = True
        else:
            out.append(a)
    if not inserted:
        out.extend(copy.deepcopy(r) for r in (anims or []))
    lst[:] = out
```

- [ ] **1.3 Extend `anim_set_props`** to sync `segments`/`t0`/`t1` writes to `group_id` siblings. Replace the single-match loop with: locate the target, build `merged` as today, then apply the **segment-bearing** result to the target AND every own record sharing its `group_id`. Concretely, after computing `merged` for the target, if `merged.get("group_id")`, also write the resulting `segments` onto each sibling (re-validate each). Keep `mode/step/step_unit/enabled/name` target-only.

```python
def anim_set_props(project, scope, ref, anim_id, partial):
    lst = _anim_list(project, scope, ref)
    target = next((a for a in lst if a["id"] == anim_id), None)
    if target is None:
        return
    def apply_to(a, seg_only):
        merged = copy.deepcopy(a)
        for k, v in partial.items():
            if k in ("segments",) or (not seg_only and k in ("mode", "step", "step_unit", "enabled", "name")):
                merged[k] = v
        for ep in ("t0", "t1"):
            if ep in partial and isinstance(partial[ep], dict):
                d = partial[ep]
                for s in merged["segments"]:
                    t = s[ep]
                    if "anchor" in d: t["anchor"] = d["anchor"]
                    if "unit" in d: t["unit"] = d["unit"]
                    if "offset" in d: t["offset"] = t.get("offset", 0) + d["offset"]
        _anim.validate_animation(project, scope, ref, merged)
        a.clear(); a.update(merged)
    apply_to(target, seg_only=False)
    gid = target.get("group_id")
    has_seg = "segments" in partial or "t0" in partial or "t1" in partial
    if gid and has_seg:
        for a in lst:
            if a["id"] != anim_id and a.get("group_id") == gid:
                apply_to(a, seg_only=True)
```

(Preserves the existing single-anim semantics; only adds sibling segment propagation. Existing `test_anim_*` for set_props must still pass.)

- [ ] **1.4 Run** `.venv/bin/python -m pytest tests/test_anim_edit_custom.py tests/test_anim_model.py tests/test_anim_timing.py tests/test_anim_resolve.py -q` → PASS.

- [ ] **1.5 Add the MCP tool** in `mcp_server/tools.py` (after `set_animation_props`):

```python
def edit_custom_animation(ctx, scope, ref=None, anim_id=None, anims=None):
    scope = _norm_scope(scope)
    _do(ctx, "anim_edit_custom", scope, ref, anim_id, anims or [])
    return ctx.run(lambda: _anim_view(ctx, scope, ref))
```

Register in `mcp_server/server.py` next to `add_animation` (mirror its `@mcp.tool()`/wrapper).

- [ ] **1.6 Write + run a tool round-trip test** in `tests/test_anim_daemon.py` (mirror `t_AD_SP_01`): POST `/api/call` `edit_custom_animation` with a rebuilt record set at cue scope; assert the returned view + state carry the replaced record with the preserved lead id. Run `.venv/bin/python -m pytest tests/test_anim_daemon.py -q` → PASS.

- [ ] **1.7 Commit:** `feat(engine): anim_edit_custom mutation + anim_set_props group sibling-sync`

---

## Phase 2 — Shared model: types + `animCustom.ts` (vitest)

**Files:**
- Modify: `web/src/types.ts` (`Animation.custom?: boolean`)
- Create: `web/src/model/animCustom.ts`
- Test: `web/src/model/animCustom.test.ts`

- [ ] **2.1** Add `custom?: boolean;` to the `Animation` interface in `web/src/types.ts`.

- [ ] **2.2 Write failing tests** `web/src/model/animCustom.test.ts` covering:
  - `isCustomAnim`: true for `{custom:true}` and legacy `{mode:"custom"}`; false otherwise.
  - `buildCustom(DEFAULT_CUSTOM, idGen)`: one record, `custom:true`, `mode:"percue"`, channel `primary`, segment `t0/t1 = {anchor:"cue_end", offset:-30}` (snap → equal), `to:"#FF3DA6"`, `accel:1`.
  - `buildCustom` Scale → two records sharing `group_id` = lead id; channels `scale_x`,`scale_y`.
  - `buildCustom` ramp + ease `out` → `t1.offset = t0.offset + dur`, `accel:0.5`.
  - `buildCustom` carries `timing` (`mode/step/step_unit/enabled`).
  - `customCfgOf(buildCustom(cfg)[0])` round-trips `{ch, anchor, offset, mode, dur, ease, value}`.
  - `anchorSec([0,1], {anchor:"cue_end", offset:-30, unit:"ms"})` ≈ `0.97`; `frac` unit scales by span.

- [ ] **2.3 Implement `web/src/model/animCustom.ts`** — TS port of the kit's `anims.jsx` helpers (`CUSTOM_CHANNELS`, `CB_EASE`, `DEFAULT_CUSTOM`, `CUSTOM_TIMING`, `isCustomAnim`, `buildCustom(cfg, nextId, timing?)`, `customCfgOf(anim)`) reusing `time`/`seg` from `animPresets.ts`, plus:

```ts
export type Span = readonly [number, number];
export function anchorSec(span: Span, t: { anchor: string; offset?: number; unit?: string }): number {
  const base = /_end$/.test(t.anchor) ? span[1] : span[0];
  const off = t.offset ?? 0;
  return t.unit === "frac" ? base + off * (span[1] - span[0]) : base + off / 1000;
}
```

`CustomCfg` type = `{ ch: AnimChannel; anchor: "cue_start"|"cue_end"; offset: number; mode: "snap"|"ramp"; dur: number; ease: string; value: string|number }`.

- [ ] **2.4 Run** `npm --prefix web run test -- animCustom` → PASS. **Commit:** `feat(web): animCustom model — buildCustom/customCfgOf/isCustomAnim/anchorSec`

---

## Phase 3 — `EditableNum` atom (vitest)

**Files:** Create `web/src/components/controls/EditableNum.tsx`; Test `EditableNum.test.tsx`.

- [ ] **3.1 Write failing tests:** renders `display` as a span; click → `input.num-in` seeded with `value`; Enter commits parsed value via `onCommit`; blur commits; Esc cancels (no commit); ArrowUp/Down nudge by `step`; `parse` returning null/NaN rejects; click `stopPropagation` (a parent `onClick` doesn't fire).
- [ ] **3.2 Implement** the TS port of the kit `atoms.jsx#EditableNum` (props `{display, value, parse?, onCommit, step?, className?, title?}`). Default `parse = (s)=>parseFloat(s)`.
- [ ] **3.3 Run** `npm --prefix web run test -- EditableNum` → PASS. **Commit:** `feat(web): EditableNum click-to-type value cell`

---

## Phase 4 — AnimSection rewrite + Editor wiring (vitest)

**Files:**
- Modify: `web/src/components/panels/AnimSection.tsx` (full rewrite, TS port of kit `anims.jsx` AnimSection/AnimTier/AnimOwnRow/AnimInheritedRow/CustomEditor/SegmentTiming/AnimPreview/AnimStripPreview/PresetPicker)
- Modify: `web/src/components/panels/TimingModePicker.tsx` (Step → `EditableNum`)
- Modify: `web/src/api/client.ts` (`editCustomAnimation`), `web/src/components/Editor.tsx` (`onEditCustom` wiring + pass to AnimSection)
- Test: `web/src/components/panels/AnimSection.test.tsx`

- [ ] **4.1** API client: add `editCustomAnimation(scope, ref, anim_id, anims)` calling `/api/call` `edit_custom_animation` (mirror existing anim client methods).
- [ ] **4.2** `Editor.tsx`: add `animEditCustom(scope, ref, animId, cfg)` that builds records with `buildCustom(cfg, idGen, timingFromCurrentLead)` (idGen returns `animId` first, then fresh ids; read current lead's `mode/step/step_unit/enabled`) and dispatches `edit_custom_animation`. Pass `onEditCustom={animEditCustom}` to `AnimSection`. Add `onEditCustom` to `AnimSectionProps`.
- [ ] **4.3 Write failing component tests** (mirror spec §Testing → Components): row-UX (`.ov-line` toggles; ✕/cues-chip stopPropagation; adding opens new row expanded; global add-row present); `＋Custom` adds default + opens; inherited-row click calls the open/redirect; `CustomEditor` Property/When/Value/Transition changes call `onEditCustom` with the right cfg; `SegmentTiming` From/To writes `onSetProps({segments})`; `AnimPreview` renders strips and a strip click focuses; custom color Value renders a `ColorPicker` field.
- [ ] **4.4 Rewrite `AnimSection.tsx`** porting kit `anims.jsx` with product adaptations:
  - TS types; import `Icon`, `TimingModePicker`, `ColorPicker`, `EditableNum`, model helpers from `animCustom.ts`, rows from `animRows.ts`, presets from `animPresets.ts`.
  - Shared `open = {scope,id,nonce}` state + `setOpen` (nonce bump) + `useEffect` scroll-into-view (nearest scrollable ancestor; `getBoundingClientRect`; **no `scrollIntoView`**) + `.ov-flash` keyed by nonce.
  - `CustomEditor` uses the product `ColorPicker` (`mode="field"`) for color channels (no kit `KSP_DS_ANIM` shim — import directly); numeric cells use `EditableNum`.
  - `SegmentTiming` row is a **render function**, not a nested component (focus-loss guard). Uses `anchorSec` for the duration readout.
  - `AnimPreview` + `AnimStripPreview` use `anchorSec`/`apBounds`/`apStripStyle`/`apTiming` ported to TS; `CH_COLOR`/`CH_TYPE` maps included.
  - `addCustom` adds `DEFAULT_CUSTOM` via `onAdd` then `setOpen` to new lead; `addPreset` likewise opens the new row.
  - Inherited row → clickable redirect (`»` double `chevRight`) → `setOpen({scope: row.src, id: row.id})`.
- [ ] **4.5** `TimingModePicker.tsx`: swap the Step value span for `EditableNum` (ms → step 10; % → step 5, parse converts %↔fraction), per kit `StepSubRow`.
- [ ] **4.6 Run** `npm --prefix web run test -- AnimSection TimingModePicker` → PASS. Fix the existing `AnimSection`/`TimingModePicker` audit tests that assumed the old ✎-pencil/`mode:"custom"` shape. **Commit:** `feat(web): in-row custom editor, previews, segment-timing, inherited redirect`

---

## Phase 5 — StyleWaterfall + Group Linger editable cells (vitest)

**Files:** Modify `web/src/components/panels/StyleWaterfall.tsx` (PropRow steppers), the EventStrip/group-linger control (find via grep — kit `app.jsx` EventStrip), test updates.

- [ ] **5.1 Write/adjust failing tests:** Size/Outline-w/Shadow steppers accept typed input via `EditableNum`; Box-alpha accepts a 2-digit hex typed value (`parse` base-16 → commit 2-digit hex string); Group Linger accepts typed seconds.
- [ ] **5.2 Implement:** replace the read-only value spans in those steppers with `EditableNum` (per kit `panels.jsx` PropRow + `app.jsx` EventStrip Linger). Box-alpha: `display` = `0x{HH}`, `value` = `parseInt(hex,16)`, `parse` reads base-16 clamped 0–255, `onCommit` writes the 2-digit uppercase hex.
- [ ] **5.3 Run** `npm --prefix web run test -- StyleWaterfall` (+ any linger test) → PASS. **Commit:** `feat(web): click-to-type numeric cells in style waterfall + group linger`

---

## Phase 6 — Styles (theme.css)

**Files:** Modify `web/src/theme.css`.

- [ ] **6.1** Port the kit `theme.css` additions: `.custom-editor`, `.ce-block`/`.ce-h`, `.custom-tag`, `.ov-redir`, `.ov-flash` (+ `@keyframes anim-focus-flash`), the `.anim-preview`/`.ap-*` set (`.ap-h/.ap-chev/.ap-count/.ap-stage/.ap-cue/.ap-bar/.ap-ovf/.ap-ovn/.ap-collapse/.ap-none`), the mini-preview `.ap-mini*`, `.seg-timing`/`.st-dur`, `.num-in`, and the `.ov-line`/`.ov-chev`/`.ov-edit`/`.en-toggle`/`.preset .pv-ic`/`.preset.custom`/`.cb-*` rules (row-UX + builder controls), adapting var names to the product's tokens (`--cyan`, `--surface-*`, `--border-strong`, `--ease-out`, `--text-on-accent`, `--warn` — all confirmed present).
- [ ] **6.2** Build + a quick Playwright screenshot of the Inspector animation panel (reuse the e2e harness) to eyeball previews/editor/redirect. **Commit:** `style(web): animation panel rework styles`

---

## Phase 7 — e2e + full verification

**Files:** `web/e2e/animations.spec.ts` (extend) or new spec.

- [ ] **7.1** e2e: add a custom at cue scope (`＋Custom`) → open its details → change Property to **Scale** → assert state has two `scale_*` records sharing `group_id`, lead id preserved; edit a Pop preset's timing window → assert both `scale_x`/`scale_y` segments moved (sibling-sync); click an inherited row → it opens in the owning tier.
- [ ] **7.2 Full sweep:** `.venv/bin/python -m pytest tests/ -q` (engine/daemon green) and `npm --prefix web run test` (vitest green) and `npm --prefix web run e2e` (Playwright green). Fix fallout.
- [ ] **7.3 Commit** any test fixups; then `superpowers:finishing-a-development-branch`.

---

## Notes / invariants
- **No `scrollIntoView`** — `scrollTop`/`scrollLeft` math with a rAF (house rule).
- **No `opacity`/`filter`/`transform` on a popover ancestor** — the custom color `ColorPicker` is already portal-hardened (§E).
- Engine code **test-first**; web suites are written alongside (not deferred).
- `buildCustom` lives **only** in TS (`animCustom.ts`); the engine never rebuilds — it splices client-sent records.
