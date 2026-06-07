# Reconciliation — animations design (response 4) vs the settled model

**Status:** engineering response to `HANDOFF_animations.md`. The **presentation layer is accepted
wholesale** — append-override model, tombstone rows, the 4th ANIMATION lanes column, timeline
strips with fill-by-type / cap-3 / +N inline expand / glyph chips / 2-click focus / drag-retime.
The prototypes nail it and we will port `ia.css`/`tl-anim.css` + the interaction logic as
specified in your §6.

**The data model in your §4, however, predates the settled schema** in
`HANDOFF_animations-questions.md` Part 1 (which your earlier review accepted, and whose product
calls are recorded in its Part 3). Four deltas need reconciling — none of them change the
pixels you designed; they change what the rows/strips read and write.

---

## 1. Timing is anchor + offset, not absolute seconds

Your `Animation.s/e` are absolute project-time seconds. Decided model (questions doc §1.2): every
endpoint is `{anchor, offset, unit}` with **8 anchors** (cue/line/span/event × start/end) and
**no absolute time in v1** — animations must survive retiming and apply to many cues at once
(a selection-scope fade can't store one absolute window).

**Impact on your design: none visually.**
- Strips: render from the **resolved** per-cue times (the daemon already returns them flat —
  your §5 resolution endpoint stands). A strip's x-bounds are exactly what you drew.
- Drag-retime: a handle drag writes `offset` deltas against the animation's existing anchors
  (`set_animation_props(... {t0|t1: {offset}})`). Clamps as you specified.
- The Inspector's timing row reads "cue start − 200 ms" style; the timing-mode picker (below)
  covers the common cases so most users never touch raw anchors (Advanced only).

## 2. The selection (tag) scope exists — and it's the headline flow

Your §4 carriers stop at global/group/cue. The decided model has a fourth: **animation tags**
`{ids, anims, suppress}` — "select N cues, add one animation" was the founding requirement, and
per-cue is just a tag of one. Storage:

```
project.globals.animations        Animation[]      // base list
project.layout[gi].animations     Animation[]      // group appends
project.layout[gi].suppress       string[]         // group tombstones
project.anim_tags                 AnimTag[]        // {ids, anims, suppress} — selection & cue
```

**Impact on your design: one addition.** The Inspector's CUE tier shows rows sourced from every
tag containing the selected cue; a row carries a small "7 cues" chip when its tag spans more
than one (with "select all" on click — your call on the affordance). Everything else (append,
tombstone, edit, disclosure) is unchanged.

## 3. Vocabulary: presets over channels (your "types" map cleanly)

Decided (Part 3): plain-verb **presets** writing raw **channel** records (`alpha`, `scale_x/y`,
`primary`, `clip_rect`, `blur`, `karaoke_fill`, `move`…), presets-first UI with a Advanced
disclosure. Your six types map:

| Your type | Canonical preset | Channel(s) |
|---|---|---|
| `alpha` (in/out) | Fade in / Fade out | alpha |
| `color` | Color flash | primary |
| `size` | Pop | scale_x + scale_y |
| `glow` | Blur in (glow) | blur (+ outline alpha) |
| `move` | Slide — **group/global only**, model-enforced | move |
| `type` (typewriter wipe) | **Wipe in** (per-cue clip) — see §4 below | clip_rect |

Plus the two you suggested, both already decided **into v1**: **Sweep** (karaoke fill, `\kf` —
the genre-definer) and **Cascade** (which is a timing mode, not a preset — next item). Strip
fill treatments keyed by preset/channel exactly as you drew them.

## 4. The one missing UI piece: the timing-mode picker (Q5d)

Decided set, simple view = **Per cue / Per line / Together / Cascade / Typewriter** (Reverse /
Center-out / Jitter under Advanced). This is the control your response doesn't cover:

- It's a per-animation-row control (defaults per preset: fades → Together, color/pop → Per cue).
- `step` (ms or % of span) appears only for Cascade.
- Note the distinction your `type` blurs: **Typewriter the timing mode** = members *start* one
  after another (any preset can typewrite); **Wipe the preset** = one cue's glyphs revealed by
  an animated clip. Both exist; they compose ("Wipe in, typewriter mode" = the full typewriter
  look).

**Ask:** a small design for this picker — grouped dropdown vs icon segmented control, and where
`step` lives on the row.

## 5. Settled answers to your §7 opens

- **Cap = 3** — accepted as designed (inline expand is the escape hatch).
- **Preset set (canonical, v1):** Fade in, Fade out, **Sweep**, Pop, Color flash, Wipe in,
  Blur in, Slide (group-level). "Bounce" needs spring easing — see next — park it.
- **Easing:** libass easing is a power curve (`t^accel`) only — named presets **Linear /
  Ease out / Ease in**, with **ease-in-out auto-expanded by the compiler into two chained
  segments** (already specced, questions doc §1.4). True spring/bounce is not natively
  expressible; approximable later via auto-generated segment chains. Expose the three names +
  a numeric accel under Advanced.

## 6. Small corrections

- Engine ground truth is `engine/ass.py` + `engine/render.py` + the daemon (`daemon/`,
  `mcp_server/tools.py`) — `core.py`/`app_base.py`/`build_ass_v2` are the legacy desktop path
  and not the integration target.
- Tombstones: concept accepted exactly as you drew it; the stored field is `suppress: string[]`
  per scope (group / tag), same semantics ("absent ≠ removed" — agreed, that's why it's stored).
- Your §5 tools match the planned MCP surface; final names:
  `add_animation / remove_animation (tombstone when inherited) / restore_animation /
  set_animation_props`, plus resolved lists in `get_project`/`get_render`. No WS/MCP backward
  compat constraints (old fade tools are removed outright).

---

**Net:** design accepted; implement against the questions-doc schema; one follow-up design ask
(the timing-mode picker, §4); presets/easing/cap confirmed per §5.
