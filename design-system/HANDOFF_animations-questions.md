# Designer questions — animations (generalized fade system)

**Status:** open — this is the design package for the next headline feature. Unlike previous
handoffs, the engineering layer below the UI is already decided (data model, compilation,
renderer); what's open is the entire authoring UX. Questions are numbered at the end; everything
before them is the context you need to answer well. Each question states the engineer's current
leaning so you can react to a concrete proposal.

**Feature in one sentence:** users can attach any number of *animations* (alpha, scale, color,
rotation, blur, clip-wipe, …) to a cue, a selection of cues, a group, or the whole project, with
times expressed relative to each cue's own start/end — and the existing fade-in/fade-out system
becomes a built-in preset of this general mechanism rather than special-purpose code.

---

## Part 1 — Settled engineering context

### 1.1 Where animations live in the product today (the thing being generalized)

Fades are the only animation today, wired three ways:

| Today | Becomes |
|---|---|
| `fin_tags` / `fout_tags` — `{ids, trigger}` tags marking word-sets that fade in/out | Animation **tags**: `{ids, anims}` — the "selection of cues" scope |
| `group.fade` — `{fade_in_ms?, fade_out_ms?}` per-group duration overrides | **Group-scope** animations |
| `globals.fade_in_ms / fade_out_ms` — project defaults | **Global-scope** animations |

The fade UI you designed (Group fade-in/out buttons, FadeGroupPanel trigger editor,
FadeDefaultsPanel) keeps working — those controls become shorthands that write animation records
underneath. (UI-level continuity only: the WS/MCP API surface is **not** kept backward
compatible — old fade tools are replaced by the new animation tools; project *files*
auto-convert on open.)

### 1.2 The new data model (authoritative, reviewed)

```ts
// ---- a channel is ONE animatable property -------------------------------
type AnimChannel =
  | "alpha"                                   // overall opacity (fades use this)
  | "fill_alpha" | "outline_alpha" | "shadow_alpha"
  | "primary" | "outline" | "back"            // colors (hex string values)
  | "scale_x" | "scale_y"                     // % (100 = normal) — "pop"
  | "fontsize"                                // pt (reflows; prefer scale_x/y)
  | "rot_x" | "rot_y" | "rot_z"               // degrees — flips/spins
  | "shear_x" | "shear_y"                     // italic-lean wobble
  | "spacing"                                 // letter tracking, px
  | "border_w" | "shadow_depth" | "blur"      // px
  | "clip_rect"                               // [x1,y1,x2,y2] — wipes/reveals
  | "move";                                   // position — SPECIAL, see §1.5

// ---- timing: every endpoint is anchor + offset --------------------------
interface AnimTime {
  anchor: "cue_start" | "cue_end" | "event_start" | "event_end";
  offset: number;            // signed, in `unit`
  unit: "ms" | "frac";       // frac = fraction of the cue's own span (0..1)
}
// Examples:
//   {anchor:"cue_start", offset:-200, unit:"ms"}  → 200ms BEFORE the word lights up
//   {anchor:"cue_start", offset:0.5, unit:"frac"} → halfway through the word
// Merged cues: span = earliest start .. latest end of the merged words (existing rule).

// ---- one animation = one channel + chained segments ---------------------
interface AnimSegment {
  t0: AnimTime;
  t1: AnimTime;
  from: number | string | number[] | null;   // null = "whatever the value is at t0"
  to:   number | string | number[];
  accel: number;             // easing: power curve t^accel; 1 = linear (see §1.4)
}

interface Animation {
  id: string;                // stable id — referenced by suppression
  name: string;              // preset id ("fade_in", "pop", …) or "custom"
  channel: AnimChannel;
  segments: AnimSegment[];   // ordered, non-overlapping WITHIN one animation;
                             // chaining is first-class: e.g. alpha 0→50% in 20ms,
                             // then 50→100% in 80ms = two segments
  enabled: boolean;          // soft on/off without deleting
}

// ---- scopes --------------------------------------------------------------
interface AnimTag { ids: number[]; anims: Animation[]; suppress: string[]; }
// "per cue" = a tag whose ids has one entry; "selection" = many. One mechanism.

// Project additions:
//   globals.animations:   Animation[]                      (whole project)
//   layout[gi].animations: Animation[]                     (one group)
//   layout[gi].suppress:   string[]                        (mute inherited global anims)
//   anim_tags:             AnimTag[]                       (cue / selection scope;
//                                                           tag.suppress mutes inherited
//                                                           global+group anims for its ids)
// fin_tags / fout_tags / group.fade / globals.fade_*_ms are MIGRATED into the above
// and removed (existing projects auto-convert on open).
```

### 1.3 Resolution semantics (what the user must be able to predict)

For each cue the engine collects: global animations → its group's animations → animations from
every tag containing it. Then:

1. **Suppression** — a group can mute specific inherited global animations; a tag can mute
   inherited global/group animations for its cues. Muted = not rendered for that scope, still
   visible (as "inherited, suppressed") in the UI.
2. **Additivity** — everything that survives runs. Any number of animations per cue is legal.
3. **Same-kind conflict rule** — two animations of the same `name` overlapping in time on the
   same cue: the narrowest scope wins (cue/tag > group > global). E.g. a cue-level custom
   fade-in replaces the global fade-in *during its overlap window* — practically, the inherited
   one is dropped for that cue.
4. **Different-kind, same-channel overlap** — e.g. a "pop" and a "stretch" both animating
   `scale_x` at once: both are emitted; the renderer composes them sequentially, which is
   well-defined but visually non-obvious. The compiler flags this as a **warning** (UI question
   8 below).

### 1.4 What the renderer can and cannot do (hard constraints on your design)

The export/preview renderer is libass (the industry ASS renderer; ffmpeg uses it for burn).

- ✅ Every channel in §1.2 except `move` animates **per cue**, with arbitrary chained segments.
- ⚠️ **Easing is a power curve only** (`t^accel`): linear / ease-in / ease-out / extreme
  variants. No beziers, no bounce/elastic natively. (Future: fancy curves can be *approximated*
  by auto-generated chained segments — schema already supports it, so designing easing as a
  named-preset picker now is safe.)
- ⚠️ **`move` (position) is event-level, not per-cue**, and linear-only with a single
  from→to. v1: a slide/drift applies to a whole group's rendered line block, not to one word.
  (Future: per-cue motion is achievable by compiling cues into separate render events — a
  known technique — but it is explicitly out of v1.)
- ❌ No per-glyph effects or particles in v1.

### 1.5 Preview: live mode becomes truthful (decided)

The live preview is being upgraded to **render the real .ass in the browser** (libass compiled
to WASM — jassub). Consequences for your design:

- What the author sees while scrubbing/playing **is** the final render, animations included —
  today's "fades are invisible in live mode" gap disappears.
- The current DOM caption layer is demoted to an **invisible hit-testing/selection overlay**
  above the rendered canvas: clicking words, the drag box, the placement pin all still work,
  but the *pixels* come from the renderer. Selection highlight must therefore be drawn as an
  overlay outline/scrim on top of rendered text rather than restyling the text itself
  (question 11).
- Smooth 60fps playback and instant scrub — no per-frame server round-trip in live mode.

### 1.6 The v1 preset shortlist (engineer proposal — react freely)

Presets are pure UI sugar: each writes ordinary `Animation` records, openable later as raw
channels. Proposed v1 list:

| Preset | Channel(s) | Params exposed |
|---|---|---|
| Fade in | alpha | duration, lead-in (start before cue), easing |
| Fade out | alpha | duration, easing |
| Pop | scale_x+scale_y | overshoot %, duration |
| Color flash | primary | color, attack/decay durations |
| Wipe in | clip_rect | direction (L→R/R→L/T→B), duration |
| Blur in | blur | start blur px, duration |
| Slide (group-level only) | move | direction, distance, duration |

---

## Part 2 — Design questions

## 1. Authoring surface: presets vs channels
**Engineer leaning:** presets-first UI on top of a raw-channel engine ("C"): the visible flow is
pick preset → tweak 2–4 params; an "Advanced" disclosure reveals the real channel/segment/timing
records for power users. The engine stores raw channels regardless, so this is purely a question
of what the UI exposes and when.
- a. Presets only in v1 (no advanced view), presets + advanced disclosure, or channel-editor-first?
- b. If presets+advanced: is "Advanced" per-animation (expand a row) or a mode switch for the
  whole panel?

## 2. The preset shortlist (§1.6)
- a. Right set? Anything missing that singers/editors will ask for on day one (e.g. karaoke
  fill/sweep, typewriter)?
- b. Naming — we used plain verbs; want a more branded vocabulary?
- c. Which params are worth surfacing per preset vs locked to good defaults?

## 3. Where the animation UI lives
**Engineer leaning:** a new Inspector section mirroring the style waterfall's tier logic — the
selected scope (global / group / cue-or-selection) shows *its own* animations plus *inherited*
ones, in one list. Entry point for "add to selection": an **Add animation** button in the cue
OpsToolbar (next to Group fade-in/out) opening the preset picker.
- a. Inspector section vs dedicated rail tab ("Animate") vs modal editor?
- b. Should the existing fade buttons/panels (Group fade-in/out, FadeGroupPanel,
  FadeDefaultsPanel) survive as-is as shortcuts, be absorbed into the new animation list, or
  both (buttons stay, panels fold in)?

## 4. Presenting inheritance + suppression
The list at any scope contains: own animations (editable) and inherited ones (from wider
scopes). Inherited animations can be **suppressed** per group / per tag — muted for that scope
but still defined at their source.
- a. Visual treatment of inherited rows (dimmed? badge with source scope, e.g. `global`?) and of
  *suppressed* inherited rows (struck through? eye-off icon?).
- b. The suppress control: per-row mute toggle (eye / speaker metaphor), overflow menu, or swipe?
- c. Where does the user *un*-suppress — same row, or a "show suppressed" disclosure?
- d. Editing an inherited row: jump to its source scope, or offer "override here" (copies it to
  the narrow scope, which by rule 3 in §1.3 then wins)?

## 5. Timing editor (anchor + offset)
Every animation endpoint is `anchor ∈ {cue start, cue end, event start, event end}` + signed
offset in **ms or fraction-of-cue**. Defaults do the right thing (fade-in = cue_start+0), but
custom editing needs a face.
- a. How literal do we get? Options: (i) two dropdown+number rows ("Start: cue start − 200 ms"),
  (ii) a mini-timeline strip per animation — a bar representing the cue span with draggable
  in/out handles that snap to anchors, (iii) both, mini-timeline as the editor and the row as
  the readout.
- b. The ms-vs-fraction unit choice: explicit unit toggle, or infer (typed `%` vs `ms`)?
- c. Multi-segment animations (the 0→50%-in-20ms-then-50→100%-in-80ms case): stacked segment
  rows, or drawn as a single mini-curve with draggable breakpoints?

## 6. Lanes / timeline indication
Cue lanes currently mark fade membership with dedicated columns; the word track shows blocks.
With N animations possible per cue:
- a. How do lanes mark "this cue has animations"? (count badge, dot per kind, colored underline?)
- b. Should the WordTrack render animation *spans* (e.g. a thin bar under a block showing where
  the fade-in lives in time)? v1 or later?

## 7. Multi-select → tag lifecycle
Selecting N cues and adding an animation creates a **tag** (`{ids, anims}`). Later the user
clicks one member cue.
- a. Should the UI surface "this animation comes from a tag covering 7 cues" and offer
  "select all 7"?
- b. Editing a tag animation from one member: edits apply to the whole tag (engineer leaning),
  or fork the edited cue out of the tag?
- c. Adding a cue to an existing tag: re-select + re-apply, or an explicit "extend tag" affordance?

## 8. Conflict warnings
Per §1.3-4, different-kind animations overlapping on the same channel render with non-obvious
composition. The compiler detects this.
- a. Where does the warning live — inline icon on both offending rows, a toast at apply time,
  or a passive "issues" indicator on the panel header?
- b. Tone: block (require resolution), warn (allow, flag), or silent-but-inspectable? Engineer
  leaning: warn, never block.

## 9. Easing picker
Only power curves exist (§1.4): linear, ease-in, ease-out at varying strengths.
- a. Named presets (Linear / Ease in / Ease out / Strong in / Strong out) vs a small curve
  scrubber vs numeric accel field under Advanced?
- b. Per-segment easing matters for multi-segment animations — per-segment picker, or one
  easing applied to the whole animation in simple view?

## 10. Fade migration UX
Existing projects auto-convert: `fin/fout` tags, group fade overrides, and global fade defaults
become animation records named `fade_in`/`fade_out`. The user's first encounter with the new
panel will be these migrated rows.
- a. Should migrated fades look exactly like any other animation, or keep a touch of their old
  identity (icon continuity with the current sparkles)?
- b. FadeGroupPanel's "trigger" (absolute fade-out start time) maps to a `cue_end`-anchored
  offset. The old UI exposed ±0.5s/auto buttons; keep that micro-UI inside the new animation
  row, or generalize to the standard timing editor?

## 11. Selection feedback over the rendered preview (consequence of §1.5)
Today selecting a word restyles the DOM caption (accent fill). With pixels coming from the
renderer, selection must be an overlay.
- a. Outline box around the selected word's bbox? Scrim + cutout? Underline bar?
- b. Same question for multi-select and for the "live word" highlight during playback — the
  renderer already paints the karaoke state, so does the UI still add anything during playback,
  or only while paused/editing?

## 12. Communicating the position limitation
"Slide" works at group level only in v1 (§1.4); users *will* try to slide a single word.
- a. Hide per-cue slide entirely, or show it disabled with a "group-level only (for now)"
  explainer?
- b. Where does that explainer live — preset picker, or at apply time?

---

*Engineer note: the formal engine spec (mutations, MCP tools, migration details, compiler) will
follow the usual spec flow once these are answered. No WS/MCP backward compatibility is required
— the old fade tools are removed outright and replaced by animation tools, so questions 3b and
10b are purely about UI presentation and block nothing engine-side. Project-file migration
(auto-convert on open) is still in scope.*
