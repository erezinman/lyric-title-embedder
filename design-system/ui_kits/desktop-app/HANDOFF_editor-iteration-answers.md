# Editor-iteration — designer answers (Q1–Q7) + conflict resolutions

Reply to `design-system/HANDOFF_editor-iteration-conflicts.md`. Short version: the staleness ledger
is all **acknowledged**, the WP split (WP-1 layout-ops / WP-2 shell-UX / WP-3 magnet) is **approved**,
and the §9 reversals are **intentional** — they were made in a deliberate designer review *after* the
finish-ui answers, not by drift. Decisions below unblock §9.

> **§9 status: RESOLVED — keep your box, layer the additive wins.** Designer is indifferent on
> body-drag/8-handle vs edge-only, so we **keep your shipped, tested direct-manipulation box** (body-
> drag, 8 handles, band-height, per-side resize) and **do not** do the edge-only rewrite. We only
> **layer on**: snap + safe-area guides (while-dragging, Alt-bypass) and caption-follows-the-box. Read
> Q1–Q4 below in that light. Everything else is settled.

## Q1 — body-drag removal + 8 handles → 3–4 edge bars? **WITHDRAWN — keep your box**
Keep **body-drag = move** and the **8-handle** set exactly as shipped. The edge-only model was purity
over usability; your direct-manipulation box is more intuitive and is already tested (`B-09…B-19`
stay green). Ignore the kit's `pointer-events:none` + edge-bar `.bbox`/`.mh` CSS — **do not** apply it.

## Q2 — symmetric resize? **As a Shift modifier, not the default**
Keep your **per-side** resize as the default (one handle = one margin; `B-18/B-19` unchanged). Add
**Shift = symmetric** (one shared delta to both margins, center-fixed, stop at min width without
sliding the center) for the common centered case. So: default per-side, Shift symmetric, Alt ignores
snapping. (Earlier I suggested symmetric-as-default — dropping that to avoid relearning a shipped gesture.)

## Q3 — losing manual band-height? **WITHDRAWN — keep band-height**
Keep it. It's the one piece that makes margin editing feel direct, it's session-local and tested
(`B-22`), and removing it for model-purity isn't worth it. (It is technically a synthetic DOF — ASS
has no band height — so leave a code comment saying so, but ship it.)

## Q4 — promote snap + safe-area guides to v1; rects always-on? **CONFIRMED (layered on your box)**
This is the one piece of §9 we still want — it's additive and works on **your** body-drag box, not a
replacement for it. Soft snap (center + 5%/10% safe), **Alt to bypass**, ~1.8% tolerance, applied to
whichever edge/the body is being dragged. Guides: default **faint + only while a placement drag is
active** (not always-on — reversing my earlier always-on ask, since the box is now grab-anywhere and
always-on guides would clutter it). Snap targets the same handles you already move.

## Q5 — drag-readout chip stays? **CONFIRMED**
Keep it — once per-edge labels are gone it's the only live readout, so it's load-bearing. (It was the
finish-ui §2 addition; unchanged.)

## Q6 — Esc-cancel stays? **CONFIRMED**
Keep **your** version with `stopImmediatePropagation` (so Esc-during-drag doesn't also clear the cue
selection). Better than the prototype's.

## Q7 — undo/redo placement? **TopBar-only (de-dupe) — CONFIRMED**
This was a deliberate designer call: the dock copy read as "undo is scoped to cue/layout ops," which is
misleading — history is global. Remove the **OpsToolbar** undo/redo; the **TopBar** control plus the
**Ctrl/⌘+Z / Ctrl+Y** keyboard shortcut cover in-reach undo while working in the dock. Keep your
`aria-pressed/.on` toggle-state work for the *other* dock op-buttons (unrelated). Apply the press-flash
to the TopBar undo/redo.

---

## Conflicts that aren't §9

### Dock panels (§7) — keep your chrome, take my resize behavior
Designer's read: your dock panels **look slightly better** — keep your visual chrome. There's no
functional difference; just fold the **resizable rail-width / dock-height** behavior (drag the edge,
clamped) onto your panels. Pure addition, no look change on your side.

### "Coming soon" stub → defer to live AnimSection — **AGREED (delete the stub, no hole)**
Right call: delete the ControlsRail stub **and** let the rail make room for / point at the already-wired
`AnimSection`. Don't just drop the chips and leave a gap. This is your cleanup to own; the changelog's
"remove the stub" was correct but undersold (it predated AnimSection landing).

### Selection highlight (violet + left bar) — **ADOPT as a one-token swap**
Since `.lane-row.multi` already does accent-fill + inset left bar, just swap the token to `--violet` for
multi (keep `--accent` for the single `.sel`). Pure CSS.

### Font picker — **build the real `<select>`; nothing to "fix"**
Confirmed: your row is display-only, so the combo→stepper bug never existed there (it was prototype-only).
Port the `FONTS` list + styled `<select>` (`.pv-select-wrap/.pv-select`). No corruption risk to worry about.

### clearStyle "X" cue-tier — **STALE, skip**
Prototype-only; your C-cluster proves cue-tier clear works. Nothing to port.

### §10 MCP popover values — **CORRECTED in the prototype** (so the kit isn't misleading)
- **Auth is conditional** — the popover now reads "Bearer — if token set" and the note says *"auth only
  if `KSS_MCP_TOKEN` set."* With no token there's **no auth header**, so don't render an unconditional
  Bearer.
- **CORS** note now reads `127.0.0.1:5173 / localhost:5173`.
- **Port** labeled `8137 (default)` — it's the default for `--port`, not contractual.
Otherwise port the popover near-verbatim.

### `.bbox`/`.mh` CSS — **ship lockstep with the §9 JSX** (agreed)
The `pointer-events:none` box + `pointer-events:auto` edge-bar geometry only makes sense with the §9
render (no body `onPointerDown`, no corner handles). Land them in the same WP so the box never goes
"dead" in an intermediate state. `.bbox.ro` (read-only pinned box) is net-new and pairs with pin mode.

---

## Staleness ledger — all acknowledged
- **Engine model "unchanged" is stale** — animations shipped (carriers `globals.animations` /
  per-group `animations`+`suppress`, `anim_tags`, accumulate removed, fade migrated→dropped),
  migration-on-open, the four `*_animation` tools, legacy fade tools deleted. Disregard the changelog's
  "model unchanged" dev-note and the `set_*`-only framing; treat `HANDOFF_animations-*.md` as current.
- **Waveform** already an honest ruler (`27c5ce1`) — our §8 "removed (deferred)" just matches reality.
- **§11 strips** AT cluster shipped; only **magnet / zoom-to-playhead / source-linking** are net-new.

## Locked decisions — agreed
- **Time-ordered range** (range by `start`, not token index): **agreed, keep yours** — correct for a
  timeline-anchored editor where cues retime/merge out of document order. Anchor-ref + held-modifier pill
  adopted as-is.
- Snap engine (`SNAP_PX`, `REVEAL_PX`, `snapEdge`, `nearLines`), magnet toggle + Alt-invert, and the
  MCP popover: port near-verbatim — 

## Net
**§9 resolved: keep your placement box; just add snap + safe-area guides (while-dragging, Alt-bypass)
and caption-follows-the-box.** No change to body-drag / 8 handles / band-height / per-side resize. Q5
chip, Q6 Esc (yours), Q7 TopBar-only undo/redo all stand. WP-1/WP-2/WP-3 are all clear to start — there's
no separate §9 rewrite; it collapses into "add snap/guides + caption-follow to the existing box" (folds
into WP-3).
