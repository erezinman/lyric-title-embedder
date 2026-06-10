# Karaoke Subtitle Studio — Design System update

**Date:** 2026-06-09  ·  **Branch verified against:** `erezinman/lyric-title-embedder` @ `feat/designer-sync` (`9fae50c`)

This package captures the design decisions made in this review round, the resources
(interactive prototypes) produced for each, and the corrected Track A punch-list +
patch for the port.

---

## 1 · Timeline structure — **density toggle** (Compact · Coherent · Lanes)

The old binary Track↔Grouped view became a **3-stop density control** on one axis
(most compact → most separated):

- **Compact** — fewest non-colliding rows; groups may scatter across rows.
- **Coherent** *(default)* — each group keeps **one row**; non-overlapping groups share
  a row to stay tight. Reads as phrases.
- **Lanes** — every event its own labelled row (the per-event extreme).

Animated **FLIP** transition between stops; the **selected cue stays pinned** in view.
Matters most with **many groups** (8 events → Lanes is 8 rows tall vs. ~2 for Compact/Coherent).

→ `resources/Timeline-View-Toggle.html` (integrated main prototype)

## 2 · Track packing — **group-coherent** (recommended over collision-only)

Packing only matters where cues **overlap** (echo / harmony / ad-libs). Collision-only
minimises rows but can **split one group across rows**; group-coherent keeps each group
on a single row so it reads as a continuous thread, sharing rows only between groups that
never overlap.

→ `resources/Track-Packing-Study.html` (hover a group to see scatter vs. phrase)

## 3 · Animation bars — **constant height**

Bars no longer divide a fixed band by count (which squished them to slivers). Each bar is
a **fixed, readable thickness**; width still encodes the real duration.

## 4 · Overflow — **expand-to-overlay** (Option A), constant lane height

Past **`MAX_VISIBLE = 3`** bars, a clear **`＋N` / `－` disclosure** lifts a **floating
overlay** of the cue at full height (all bars at their real timeline positions). The
**lane height never changes**; the overlay is **accordion** (one open at a time;
click-away / Esc closes). A cyan marker frames the original block's top edge (open bottom,
so it never draws a line across the expanded bars).

Replaced the old gradient `+N` sliver and the squished slot-divided strips.

→ `resources/Strips-Refined.html` (Option A vs. the constant-height + popover alternative)

## 5 · Animation indicator — kept the **refined strips** (explored, not adopted: pips)

Explored a sustain-underglow + keyframe-dot alternative (transient = keyframe dot at real
start → bar to real stop; sustained = underglow over its real range). **Decision: keep the
current `tl-anim` strips**, refined per §3–4. The pip study remains for reference.

→ `resources/Animation-Indicator-Study.html`

## 6 · Cue visibility ticks — **none**

The block's left/right edges (the **event window**) are the single source of truth on the
lane. The text's real appear / disappear / linger is **not** drawn on the timeline — it
lives only in the focus / inspector when editing a specific cue. (Studied Auto/Always/Off;
chose none for the lane.)

→ `resources/Cue-Visibility-Ticks.html` (the study behind the call)

## 7 · Waveform — **honest tick ruler** (not placeholder bars)

Keep the adaptive tick ruler over a drawn bar waveform: there is no decoded audio, so
amplitude bars would be invented data. Revisit only if real audio decoding lands.

→ `resources/Timeline-Waveform-Review.html`

---

## Track A triage — corrected against the live branch

**Headline: Track A is essentially done.** Every "highest priority" item in the original
triage is already merged on `feat/designer-sync`:

| Triage item | Status on branch |
|---|---|
| A1 `.ksp-pop` opacity ramp | ✅ fixed — transform-only `kspPop`, no opacity, warning comment intact |
| A1 `.prow.inh { opacity:.8 }` | ✅ fixed — dims `.62` children, skips `.ksp-anchor` |
| A2 caption size | ✅ fixed — `clamp(15px, 3.3cqw, 64px)` |
| A4 `--grad-*` tokens | ✅ fixed — all 5 defined & referenced |
| A4 variable fonts | ✅ fixed — self-hosted `.ttf` via `fonts.css`, no CDN |

**Remaining = 5 LOW-severity cosmetic drifts** (judgment calls, no regressions):
tombstone color (red vs amber), `.substep` elbow + spacing, `.bbox.dragging` glow,
sub-pixel nudges, and the missing `.ks-gradient-text` utility.

- Full rule-level diff: `Track-A-Rediff.md`
- Ready-to-apply CSS (kit values): `Track-A-Patch.css`

> The ~100 other `theme.css` differences are **not** Track A — they are real app layout the
> static kit mock omits and legitimate Track-B feature work. Do **not** revert those to the kit.

### Track A — applied on branch (2026-06-10 recheck)
Items 1–4 of the cosmetic patch are **merged** on `feat/designer-sync`: `.bbox.dragging` glow,
`.substep` elbow + label, `.snap-guide`/`.sg-tag` offsets, `.snap-toggle` font, hover %.
Not applied (intentional): **tombstone color** kept red/danger (deliberate — reads as "deleted"),
`.ks-gradient-text` utility still absent (add only if a surface needs it).

---

## Track B conflicts — disposition

The genuine kit↔port conflicts were reviewed against the live branch (see `Track-B-Disposition.md`).
Headline: only **#2+#6 (nullable selection)** and **#10(i) (merged-cue badge)** are deterministic fixes;
everything else is settled-keep or designer-gated. One reversal vs. the earlier review: **#1 `align`**
is **kept** (engine-faithful — `engine/model.py` makes it a real group-level style key), not reverted.

> **Status (632bc92):** #2+#6 and #10(i) are **merged** on the branch — verified.

### Judgment calls — LOCKED (2026-06-10)
1. **Tombstone** → red/danger chip (reads as "deleted").
2. **EventStrip** → bottom of dock (summary/footer).
3. **Alignment control** → hybrid: inline grid + value caption + disabled-reason tooltip.
4. **Magnet chip** → "alt" (names the modifier).
5. **Tier chrome** → restore shaded band cosmetics only; keep collapse-only click.
6. **GROUP preview** → hybrid: cue text when selected, else `g.label`.
- `.ks-gradient-text` → leave out until needed. · Density default → Lanes when events ≤ ~6, else Coherent.

---

## Event authoring — naming the SRT-import gaps

An `.srt` imports **cue text + line timing** (words share their cue's timing) — no events, names, or sections,
so it lands as one flat **"Subtitles"** event. The **Events panel** (Project rail / Lanes dock) is the method to
author the gaps; style / animation / placement / per-word retiming already have their own surfaces.

- **Group** — `＋New` · `Merge selected` · `Split at cue` build the `layout[]` structure.
- **Name** — inline rename (Events panel) or double-click the timeline lane header; both write `layout[i].label`.
- **Section** — fixed enum (—, Intro, Verse, Pre-chorus, Chorus, Bridge, Outro, Hook) **+ Custom…** which opens a small single-line text-box modal.
- **Linger** — stepper (hold past window). `win_start/win_end` are imported (editable in the timeline).

**Locked rules:** event names are **single-line** (Enter commits, no newline; pasted breaks → spaces) and
**truncate with … + a full-name tooltip**. SRT imports as a single "Subtitles" event — **no gap-threshold
auto-suggest** (manual grouping). The event **color is its brand** — clicking the swatch recolors the group
**everywhere** (its lane + every cue block in the timeline). → `resources/Event-Authoring.html`

---

## Contents

```
Karaoke-DS-Update/
├─ DECISIONS.md            ← this file
├─ Track-A-Rediff.md       ← full kit ↔ branch rule-level diff
├─ Track-A-Patch.css       ← the 5 remaining cosmetic fixes (kit values)
├─ Track-B-Disposition.md  ← engineering disposition for the Track B conflicts report
└─ resources/              ← interactive prototypes (open in a browser)
   ├─ Timeline-View-Toggle.html
   ├─ Track-Packing-Study.html
   ├─ Strips-Refined.html
   ├─ Animation-Indicator-Study.html
   ├─ Cue-Visibility-Ticks.html
   ├─ Event-Authoring.html
   └─ Timeline-Waveform-Review.html
```
