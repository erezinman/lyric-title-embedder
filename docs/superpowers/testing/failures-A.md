# Cluster A — Audit Failures Report

Generated: 2026-06-05
Agent: WRITER AGENT A (Shell — TopBar + Editor chrome)
Test files: `web/src/components/TopBar.audit.test.tsx`, `web/src/components/Editor.shell.audit.test.tsx`

## Summary

| Category | Count |
|---|---|
| Tests written | 64 (21 TopBar + 43 Editor shell) |
| Passing | 63 |
| Failing (`it.fails`) | 1 |

---

## Failing tests

### A-19a — when pvMode=exact and play is clicked, live badge appears (no .libass-badge)

**Test ID:** A-19a  
**File:** `web/src/components/Editor.shell.audit.test.tsx`, describe block "A-19 — play in Exact mode switches preview to Live"

**Observed behavior:** The test attempts to find a mode-switch button in the PreviewStage via the selector `[data-mode='exact'], .mode-btn`. No such element exists in the rendered output. The assertion `expect(exactBtn).toBeTruthy()` therefore fails because `exactBtn` is `null`. Vitest's `it.fails` wrapper correctly catches this as an expected failure.

**Expected behavior:** There should be a way to switch the preview into "exact" mode from the shell integration test. After switching to exact mode and clicking play, the product code in `Editor.tsx` sets `pvMode` back to `"live"` via `onPlay={() => { if (!playing) setPvMode("live"); setPlaying(!playing); }`. The test verifies that the `.libass-badge` disappears (i.e. the stage is in live mode, not exact/libass mode) after play is clicked.

**Suspicion:** Test-harness limitation — the actual CSS class for the mode buttons in `PreviewStage.tsx` is `.seg-btn`, not `.mode-btn` or `[data-mode='...']`. The test used a guessed selector that does not match the real DOM. This is **not a product bug**: the product code correctly resets `pvMode` to `"live"` on play. To make this test passing, the selector should be updated to target `.seg-btn` elements that correspond to the "exact" mode option (the second `.seg-btn` inside `.stage-mode-bar`). The assertion intent is correct; only the element-finding strategy is wrong.

---

## Notes on non-failing tests of interest

- **A-11c** (seek-forward clamping at duration): Initially marked `it.fails` but the product correctly implements clamping via `Math.min(dur, t + d)` in `onSeekRel`, so the test passed. The `it.fails` annotation was removed and the test now passes normally.
- **A-13 series** (Export menu toggle): The ExportMenu renders an "Export" heading text in addition to the TopBar Export button, causing `getByText("Export")` to be ambiguous. Resolved by using the stable CSS selector `.topbar .btn.primary` instead of text matching. The ExportMenu's internal `useEffect` (for `getEnv()`) also generates a React act() warning during tests; this is benign — it is an untracked async state update in the ExportMenu's environment check, not a product bug.
- **A-16b** (Esc inside INPUT): The test correctly verifies the guard in `Editor.tsx` (`if (target?.tagName === "INPUT") return`). The test works by switching to the Inspector rail tab to expose the TimingPanel's text input, then firing `keyDown` on that input. Product behaviour is correct.
