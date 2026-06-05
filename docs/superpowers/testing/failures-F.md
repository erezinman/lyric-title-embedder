# Cluster F — External sync (WebSocket state-push) — failure log

Writer agent F. File: `web/src/components/ExternalSync.audit.test.tsx`.
Run: `npm --prefix web run test -- ExternalSync`.

## Summary

- Tests written: **44** (F-01 … F-44)
- Passing: **44**
- `it.fails` (findings): **0**

**No findings.** Every async WebSocket state push (the MCP-agent edit path)
rendered correctly in the UI with zero UI interaction. All surfaces — Project
tab (AlignGrid, margins → `.bbox`/`.cap`, `.pinbox`, Video), Inspector
(StyleWaterfall tiers, FadeDefaultsPanel, FadeGroupPanel, group FadeRows),
CueLanes (acc-badge, `.rng`, FADE-IN/OUT cells, strikethrough, merged tag,
line-div count, lane-evt count), EventStrip, WordTrack (`.block` left/width %,
`.wt-lane` count), the live-preview `.cap` words, the "AI agent updated the
project" toast (appear / suppress / auto-dismiss), the `.ai-pill`, and the
burn progress/done/error toasts — all updated on push and reverted on a
baseline push. No assertion had to be marked `it.fails`.

## Notes on `// VIS-CLICK` usage

Per the iron rule, the only UI clicks used cause a *surface to become visible*,
never the mutation under test (which always arrives via `emitState`):

- Switching the side rail to **Inspector** (F-05, F-06, F-10, F-14, F-15,
  F-16, F-17, F-22) — StyleWaterfall / FadeDefaultsPanel / FadeGroupPanel live
  on that tab.
- Switching the dock to **Timeline** (F-29, F-36) — WordTrack `.block` /
  `.wt-lane` only render there.
- Selecting the **Verse 1 group header** (F-24, F-25, F-26) — EventStrip only
  renders after an explicit group selection (`groupExplicitSel`).
- Selecting a word (F-17, F-22) — FadeGroupPanel needs `selWid()` inside a fade
  group to render its membership rows.

In F-40 the two clicks (open AlignGrid + pick a cell) intentionally *are* the
local dispatch being tested (the suppression path), not the external push; the
external push is still delivered via `emitState`/`FakeWS.emit`.

## Determinism

- Burn / toast timing tests that depend on timeouts use fake timers
  (`vi.useFakeTimers()` in F-39; burn pushes F-42–44 assert synchronously off
  the emitted message and need no timers).
- F-40 deliberately uses real timers because the `localUntil` suppression
  window is wall-clock (`Date.now() + 1500`) and the echo is delivered
  synchronously right after the click — comfortably inside the window — so the
  result is deterministic without timer mocking. The assertion checks toast
  *node identity* (no remount), which detects a broken suppression that would
  bump `store.lastExternal` and remount `ExternalToast`.
