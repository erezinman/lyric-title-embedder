# Track B conflicts — engineering disposition

**Source report:** `docs/superpowers/2026-06-10-track-b-conflicts-report.md` (`b7bc738`)
**Verified against:** `feat/designer-sync` (`engine/model.py` confirms the `align` claim verbatim)
**Date:** 2026-06-10

Reviewed and endorsed. One substantive change vs. the original zip-15 Track B review: **#1 `align` flips
from "revert" to "keep"** — the engine cross-check proves the port is engine-faithful.

---

## Ship now — deterministic, no designer needed

### #2 + #6 — nullable selection (one root cause)
Non-nullable `SelState` clearing to `gi:0` is the mechanism that lets a group-tier edit silently hit `layout[0]`.

- `Editor.tsx:33-37` — make selection nullable: `scope: "global"|"group"|"cue"|null; gi: number|null`.
- `Editor.tsx:371-375` — `clearSelection` → `setSel({ scope: null, gi: null, tok: null })` (drop the `gi:0` reset).
- `AnimSection.tsx:604-606` — gate the GROUP tier:
  `{sel.scope !== "global" && sel.gi != null && <AnimTier tierScope="group" … />}`.
- `AnimTier` (`:476`) — type `gi: number | null`; keep the `groupRows` null-guard. Audit `gi:number`
  consumers + `refFor("group", gi, …)` (`AnimSection.tsx:57`) for the null path.
- **Acceptance:** with nothing selected (post-Esc / global scope) the GROUP tier is hidden and no group-tier
  dispatch can resolve to `layout[0]`.

### #10(i) — merged-cue badge truncation (trivial)
- `StyleWaterfall.tsx:340,342` — replace `project.words[tok.ids[0]]?.text` with
  `tok.ids.map(id => project.words[id]?.text).join(tok.sep || " ")` (or the existing `tokText(project, tok)`
  helper if exposed). Fixes "up in" → "up" in the CUE badge + picker previews.

---

## Keep port — close as resolved, no change

- **#1 `align`** — engine-faithful. `engine/model.py`: `STYLE_KEYS` (13) +
  `GROUP_ONLY_STYLE_KEYS=("border_style","align")` make `align` a real **group-level** style key; the port's
  GROUP+GLOBAL row with CUE-exclusion mirrors `CUE_STYLE_KEYS`. *Only* optional follow-up: relabel to
  disambiguate **placement-align** (ControlsRail → `set_globals`) vs **style-align** (waterfall →
  `set_group_style`). Cosmetic.
- **#9** equality-clear on B/I/U — keep (inheritance hygiene).
- **#4** default rail tab + selection — keep (avoids the duplicate-label render).

---

## Bundle for a designer pass — product decisions, do not implement unprompted

| # | Item | Note |
|---|---|---|
| 3 | EventStrip placement (top vs bottom) | lean **bottom** (summary, not a primary control) |
| 5 | Alignment control model | at minimum add the disabled-reason `title` + current-value caption to the inline grid |
| 7 | Magnet chip "alt" state | "alt" (kit) vs inverted on/off (port) |
| 8 | Inspector tier chrome | restore the header **band cosmetics only**; keep collapse-only |
| 10(ii) | GROUP preview text | cue text vs `g.label` |

---

## Net

Three PRs:
1. **#2 + #6** — nullable-selection refactor (the only real defect).
2. **#10(i)** — one-line badge fix.
3. *(optional)* **#1** relabel.

Everything else is settled-keep or designer-gated.
