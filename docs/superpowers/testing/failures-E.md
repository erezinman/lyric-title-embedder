# Cluster E — Audit Failures Report

Generated: 2026-06-05
Agent: WRITER AGENT E (Modals — ProjectLibrary, CreateProjectModal, ExportMenu)
Test files:
- `web/src/components/library/ProjectLibrary.audit.test.tsx`
- `web/src/components/library/CreateProjectModal.audit.test.tsx`
- `web/src/components/ExportMenu.audit.test.tsx`

## Summary

| Category | Count |
|---|---|
| Tests written | 105 |
| Passing | 104 |
| Failing (`it.fails` — expected failures / findings) | 1 |
| Unexpected failures | 0 |

---

## Failing tests (expected — `it.fails`)

### E-58b — FINDING: double-clicking Burn should fire onBurn exactly once (desired UX, no guard currently)

**Test ID:** E-58b
**File:** `web/src/components/ExportMenu.audit.test.tsx`, describe block "E-58 — double-click Burn fires onBurn (documents actual behavior)"

**Observed behavior:** The `ExportMenu` Burn button has no debounce, disabled-after-click guard, or click-count protection. Each click unconditionally calls `onBurn(out, videoIn || undefined)` followed by `onClose()` synchronously. In jsdom tests where the component is not unmounted between clicks, double-clicking fires `onBurn` twice.

**Expected / desired behavior:** A Burn interaction should produce exactly one `onBurn` call per user gesture. In production this is partially guarded by the fact that `onClose()` typically unmounts the menu before a second click can land. However, any caller that delays unmounting (or in the face of fast double-clicks before the parent re-renders) will trigger `onBurn` twice, which means two simultaneous burn jobs would be dispatched to the server.

**Recommendation:** Add `disabled` state or a click guard to the Burn button after the first click (similar to the `busy` pattern used in `CreateProjectModal`). Alternatively, the parent should disable the Export button immediately on `onBurn` receipt. This is a UX hardening issue, not a crash-level bug, but is observable in low-latency environments.

**Note:** Test E-58a documents actual (current) behavior — that `onBurn` is called at least once — and passes. E-58b is the desired-once assertion, correctly written as `it.fails` since the product does not yet implement the guard.

---

## Test distribution by group

| Describe group | Tests | IDs |
|---|---|---|
| **ProjectLibrary.audit** | | |
| E-01 library lists projects | 2 | E-01a, E-01b |
| E-02 card click calls onOpen | 2 | E-02a, E-02b |
| E-03 both New-project entry points | 3 | E-03a–c |
| E-04 modal close returns library | 2 | E-04a, E-04b |
| E-05 list failure → empty grid | 2 | E-05a, E-05b |
| E-06 onCreated closes modal + onOpen | 1 | E-06a |
| **Subtotal ProjectLibrary** | **12** | |
| **CreateProjectModal.audit** | | |
| E-11 source toggle Suno⇄SRT | 5 | E-11a–e |
| E-12 lyrics file accept attr | 3 | E-12a–c |
| E-13 upload⇄path modes (same_host:true) | 5 | E-13a–e |
| E-14 same_host:false hides paths | 3 | E-14a–c |
| E-15 name input | 2 | E-15a, E-15b |
| E-16 lyrics file / path fields | 2 | E-16a, E-16b |
| E-17 video file / path fields | 2 | E-17a, E-17b |
| E-18 group_by select (Suno) | 3 | E-18a–c |
| E-19 skip_dashes checkbox + revert | 3 | E-19a–c |
| E-20 line_break select 4 options (SRT) | 5 | E-20a–e |
| E-21 n_words: visibility, clamp, step | 7 | E-21a–g |
| E-22 Create gating | 6 | E-22a–f |
| E-23 busy state disables Create+Cancel | 2 | E-23a, E-23b |
| E-24 FormData keys Suno | 4 | E-24a–d |
| E-25 FormData keys SRT | 3 | E-25a–c |
| E-26 video conditional in FormData | 3 | E-26a–c |
| E-27 modal error path | 3 | E-27a–c |
| E-28 modal close mechanics | 4 | E-28a–d |
| **Subtotal CreateProjectModal** | **65** | |
| **ExportMenu.audit** | | |
| E-51 default output name | 2 | E-51a, E-51b |
| E-52 editing output filename | 2 | E-52a, E-52b |
| E-53 video override only same_host | 4 | E-53a–d |
| E-54 Burn fires onBurn+onClose | 3 | E-54a–c |
| E-55 Download .ass blob | 5 | E-55a–e |
| E-56 keyboard Enter+Space triggers | 3 | E-56a–c |
| E-57 getAss rejection → alert, stays open | 3 | E-57a–c |
| E-58 double-click Burn behavior | 2 | E-58a, E-58b (it.fails) |
| E-59 dialog role + stopPropagation | 2 | E-59a, E-59b |
| E-60 .ass row accessibility | 2 | E-60a, E-60b |
| **Subtotal ExportMenu** | **28** | |
| **TOTAL** | **105** | |

---

## Notes on non-failing tests of interest

- **E-13d / E-13e (path round-trip):** The component uses independent `lyricsPath` / `videoPath` state variables that are never reset when toggling modes. Switching upload→path→upload→path correctly preserves the typed path. This is favorable behavior and these tests verify it explicitly.

- **E-23 (busy state / Cancel):** Reading the component source (`<button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>`), Cancel is disabled while busy. Both E-23a and E-23b confirm this against the code. The spec note "busy state disables Create+Cancel(?)" is confirmed: Cancel IS disabled.

- **E-26c (video_path):** The video path FormData inclusion uses `else if (videoPath)` (non-empty check), meaning an empty video path string produces no `video_path` key. This is correct behavior and the test confirms it.

- **E-55 (jsdom navigation warning):** The `a.click()` call in `downloadAss()` triggers jsdom's "Not implemented: navigation" stderr warning. This is a benign jsdom limitation — the click correctly constructs the anchor and sets `download` attribute, which is the assertion target. The warning does not affect test correctness.

- **E-52 (act() warning):** The `getEnv` useEffect in ExportMenu resolves asynchronously after render. When tests interact with the component before waiting for `getEnv` to settle (e.g. typing in the output field), React emits an act() warning. This is benign and pre-existing (matches the pattern in the existing `ExportMenu.test.tsx`).
