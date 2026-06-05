# Cluster C Interaction-Audit Failures

**Date:** 2026-06-05  
**Branch:** feat/interaction-audit  
**Files written:**
- `web/src/components/panels/StyleWaterfall.audit.test.tsx`
- `web/src/components/panels/Timing.audit.test.tsx`
- `web/src/components/panels/Fade.audit.test.tsx`
- `web/src/components/panels/EventStrip.audit.test.tsx`

## Summary

| File | Tests | Passing | it.fails (findings) |
|------|-------|---------|---------------------|
| StyleWaterfall.audit.test.tsx | 56 | 56 | 0 |
| Timing.audit.test.tsx | 26 | 26 | 3 |
| Fade.audit.test.tsx | 26 | 26 | 0 |
| EventStrip.audit.test.tsx | 20 | 20 | 0 |
| **Total** | **128** | **128** | **3** |

All 128 tests pass. 3 are `it.fails(...)` documenting findings.

---

## Findings (it.fails)

### FINDING-C-1 — TimingPanel lock pill accessible name is text content, not title attribute
**Test:** `C-20a`, `C-20b` in `Timing.audit.test.tsx`  
**Component:** `web/src/components/panels/TimingPanel.tsx`

The `lock-pill` button uses `title="Unlock timings"` / `title="Lock timings"` for its semantic label, but the button's accessible name resolves to its **text content** ("locked" / "unlocked"), not the title. This means:
- `getByRole("button", { name: /unlock timings/i })` fails (actual accessible name is "locked")
- The button has no `aria-label` to provide the semantic name that matches the title

**Impact:** Screen reader users hear "locked" / "unlocked" rather than the intended actionable description "Unlock timings" / "Lock timings". The title attribute is read as a tooltip only.

**Fix:** Add `aria-label` to the button, e.g. `aria-label={unlocked ? "Lock timings" : "Unlock timings"}`.

---

### FINDING-C-2 — jsdom fireEvent.keyDown fires on disabled NumField inputs (TimingPanel)
**Test:** `C-21c` in `Timing.audit.test.tsx`  
**Component:** `web/src/components/panels/TimingPanel.tsx` → `NumField`

When a `NumField` is rendered as `disabled`, `fireEvent.keyDown` in jsdom bypasses the disabled attribute and still triggers the `onKeyDown` handler, calling `onSetTime`. This means:
- The component's keyboard handler for ArrowUp/ArrowDown is not gated on the `disabled` prop — it relies entirely on the browser refusing to fire events to disabled inputs.
- In a real browser this is fine (disabled inputs receive no keyboard events), but the jsdom test environment reveals the component does not have a guard inside its `onKeyDown` handler.

**Impact:** If a test framework or assistive technology somehow delivers keyboard events to a disabled input, timing mutations would occur. Low real-world risk but the component could be hardened with an early-return guard: `if (disabled) return;`.

---

## Coverage delivered

### StyleWaterfall.audit.test.tsx (C-01 through C-16)
- C-01: All three tier headers fire `onSelectTier`; selected tier has `sel` class
- C-02: fontsize stepper ±2, min-8 clamp, double-press cumulative, up-then-down nets original
- C-03: outline_w stepper ±1, min-0 clamp
- C-04: shadow stepper ±1, min-0 clamp
- C-05: back_alpha hex stepper ±0x10, clamp at 00 and FF
- C-06: bold toggle fires `!currentVal` for both true→false and false→true
- C-07: All 7 primary color swatches render; each fires correct color; active swatch has `on` class
- C-08: outline and back color swatches fire correct key+color
- C-09: border_style Outline→1 and Box→3; CUE tier has NO Border mode row
- C-10: align grid (dropdown) — toggle opens, cell click fires `onSetStyle('group','align',N)`; CUE has no align row
- C-11: Inheritance display — grp/glob source chips, overridden shows clear, clear fires `onClearStyle`, after clear no clear button; group tier: non-overridden shows glob, overridden shows clear calling `onClearStyle('group', key)`
- C-12: CUE tier style controls (fontsize, primary swatch, bold toggle)
- C-13: Global tier controls (fontsize stepper, all-base chips, no clear buttons)
- C-14: Group fade rows — fade_in_ms ±50, min-0 clamp, clear→null, fade_out_ms ±50, clear→null, inherited shows glob chip
- C-15: CUE badge shows quoted word text
- C-16: aiTier class applied; null → no aihot class

### Timing.audit.test.tsx (C-20 through C-26)
- C-20: Lock pill text/title display (locked/unlocked), toggle fires onToggleLock, toggle×2
- C-21: Locked: Start/End disabled; ArrowUp on disabled (FINDING: fireEvent bypasses disabled)
- C-22: Unlocked: Start/End enabled; Enter commits; blur commits; ArrowUp/Down commits
- C-23: Merged cue: Start, End, and text all disabled even when unlocked; merged note shown
- C-24: Text field Enter and blur commit onSetText; shows current word text; retyping original calls onSetText
- C-25: tok=null renders nothing
- C-26: Start clamping at end-0.01

### Fade.audit.test.tsx (C-30 through C-40)
- C-30: FadeGroupPanel render conditions (null→null; finTag only; foutTag only; both)
- C-31: Trigger stepper from auto(null=0): +→0.5, −→0 (clamp), out +→0.5
- C-32: Trigger stepper from set values; clamp at 0; double-press cumulative
- C-33: "auto" reset button visible when set, absent when null; click→onSet(kind, null)
- C-34: Clear button calls onClear('in') / onClear('out')
- C-35: withFadeTags fixture integration; trigger=2.5 display; trigger=null label display
- C-36: Word count shown in row
- C-40: FadeDefaultsPanel double-press; linger min-0 clamp; linger double-press; fade_out_ms double-down; all three values rendered; fade_in_ms min-0 clamp

### EventStrip.audit.test.tsx (C-50 through C-54)
- C-50: All three accumulate buttons fire onSet; active button has `on` class; clicking current value still fires
- C-51: Linger ±0.1 from null(0) and set values; display of null→"0.0s"; display of 2.5→"2.5s"
- C-52: Linger double-press cumulative; up-then-down nets original
- C-53: Label display; window auto text; win_start/win_end display
- C-54: Active accumulate button styling for all three modes
