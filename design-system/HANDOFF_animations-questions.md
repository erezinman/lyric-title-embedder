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
  | "karaoke_fill"                            // SPECIAL: native \kf sweep (primary
                                              //   fills over a base color as the
                                              //   word is sung); used only by the
                                              //   Sweep preset; dedicated emission
                                              //   path, not \t; timing is
                                              //   intrinsically the sung interval
  | "move";                                   // position — SPECIAL, see §1.4

// ---- timing: every endpoint is anchor + offset --------------------------
interface AnimTime {
  anchor: "cue_start" | "cue_end"      // the cue's sung interval. A cue is the
                                       //   LOGICAL word (post-merge): span =
                                       //   earliest start..latest end of its ids
        | "line_start" | "line_end"    // the member's LINE sung span → each line
                                       //   of a group animates as a unit
        | "span_start" | "span_end"    // the owning scope's overall span (tag:
                                       // earliest start..latest end of its ids;
                                       // group: the event window) → members
                                       // animate IN UNISON
        | "event_start" | "event_end"; // the rendered event window
  offset: number;            // signed, in `unit`
  unit: "ms" | "frac";       // frac = fraction of the anchor's span (0..1)
}
// NO ABSOLUTE-TIME ANCHOR (decided): all timing is relative to cue/line/span/
// event. Consequence, accepted: today's fade-out "trigger" is stored as absolute
// seconds; it migrates to a cue_end-anchored offset, so a migrated trigger now
// FOLLOWS the words when they are retimed instead of staying at its wall-clock
// moment. If an absolute use case materializes (timed title cards), a `project`
// anchor is a pure-additive extension.
// Examples:
//   {anchor:"cue_start", offset:-200, unit:"ms"}  → 200ms BEFORE the word lights up
//   {anchor:"cue_start", offset:0.5, unit:"frac"} → halfway through the word
//   {anchor:"span_start", offset:0, unit:"ms"}    → all selected cues start together
// Anchors are PER ENDPOINT, so one animation on a selection can fade the whole
// selection in together (span_start..span_start+300ms) while another colors each
// word on its own clock (cue_start..cue_end) — the "group fades as one, color
// progresses per cue" case. Hybrids are legal too (start together, end per cue).
// Merged cues: cue span = earliest start .. latest end of the merged words.
// Edge: if a span-based animation starts before a member cue's event exists,
// that cue appears already mid/past-animation (compiler clamps) — relevant only
// for tags spanning multiple groups.
//
// ACCUMULATE IS GONE AS A CONCEPT (decided). In the current engine, appearance
// already IS the fade-in: render.py computes an accumulate-resolved appear time
// and ass.py gates visibility with an alpha animation at it (fade duration 0 →
// visible from event start). The generalized model drops the `accumulate` field
// entirely — accumulate was never anything but the TIMING MODE (question 5d)
// of one particular animation, the group's appearance (fade-in) animation:
//     accumulate "words" ≡ appearance anim in "Per cue" mode   (cue_start)
//     accumulate "lines" ≡ "Per line" mode                     (line_start)
//     accumulate "off"   ≡ "Together" mode                     (event_start)
// Migration converts each group's accumulate value into that mode. The
// EventStrip's 3-way control is REPLACED by the standard timing-mode picker on
// the appearance animation row — and as a corollary the appearance animation
// gains every other mode for free: cascade, chained (typewriter reveal),
// reverse, jitter are all now legal ways for a group's words to appear.
// One rule stays explicit: a cue with NO alpha animation covering it is visible
// for the whole event — exactly today's zero-duration behavior. Sung-time
// animations (cue_start color sweeps) compose freely with any appearance mode.

// ---- one animation = one channel + chained segments ---------------------
interface AnimSegment {
  t0: AnimTime;
  t1: AnimTime;
  from: number | string | number[] | null;
  // null is PRECISELY defined: for the first segment it is the channel's STATIC
  // resolved value from the style waterfall (global<group<cue), computed at
  // compile time — NEVER the dynamic mid-value of some other animation. For
  // segment k>0 it is the previous segment's `to`. Interaction between two
  // animations on one channel is governed solely by the overlap rules (§1.3).
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
  stagger?: AnimStagger;     // optional per-member offset on top of the anchor
  enabled: boolean;          // soft on/off without deleting
}

// ---- stagger: computed per-member delay added to the anchor ---------------
// The anchor sets the base clock; stagger shifts each member off it. The two
// no-stagger defaults are "per cue" (cue_* anchors) and "together" (span_*).
interface AnimStagger {
  order: "index"             // cascade: member i starts i×step after the first —
                             //   an EVEN wave, ignoring the actual word rhythm
       | "reverse"           // same, last member first (great for exits)
       | "center_out"        // ordered by distance from the member-list midpoint
                             //   (ripple)
       | "random";           // deterministic jitter within ±step (seeded by word
                             //   id → renders are stable)
  step: { value: number; unit: "ms" | "frac" };   // per-member delay (frac of span)
  chained?: boolean;         // step = previous member's animation duration
                             //   (typewriter / domino) — overrides step.value
}
// ORDERING BASIS (canonical): members are ordered by layout READING order
// (group index, line index, token index) — not by time — so cascades are stable
// under retiming and well-defined for multi-line and non-contiguous selections.
// center_out measures distance from the midpoint of that ordered member list
// (index space, no pixel metrics involved).
// All modes are compile-time arithmetic emitting ordinary \t tags — no renderer
// cost or risk. PARKED (needs data we don't have): beat-grid stagger (members
// snap to a BPM grid) — requires tempo metadata (bpm + downbeat) on the project;
// flagged as a follow-up feature, the schema slot is reserved.

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
// fin_tags / fout_tags / group.fade / globals.fade_*_ms AND layout[gi].accumulate
// are MIGRATED into the above and removed (existing projects auto-convert on
// open; accumulate becomes the appearance animation's anchor — see below).
```

### 1.3 Resolution semantics (what the user must be able to predict)

For each cue the engine collects: global animations → its group's animations → animations from
every tag containing it. Then:

1. **Suppression** — a group can mute specific inherited global animations; a tag can mute
   inherited global/group animations for its cues. Muted = not rendered for that scope, still
   visible (as "inherited, suppressed") in the UI.
2. **Additivity** — everything that survives runs. Any number of animations per cue is legal.
3. **Cross-scope conflict rule — keyed on channel + time-overlap, never on name** (names are
   labels; two `custom` animations must not magically suppress each other). When animations
   from *different scopes* touch the same channel of the same cue with overlapping time
   windows: the narrowest scope wins and the wider-scope animation is dropped **entirely for
   that cue** (no time-slicing — predictability over cleverness). E.g. a cue-level custom
   fade-in beats the global fade-in. Non-overlapping same-channel animations all run —
   chained-segment idioms stay first-class.
4. **Same-scope, same-channel overlap** — e.g. a "pop" and a "stretch" both animating
   `scale_x` at once at group level: both are emitted, and the renderer's behavior for
   overlapping `\t` on one property is **implementation-defined compounding** (each `\t`
   interpolates the accumulated value — it does NOT cleanly blend or last-win). The compiler
   flags this as a **warning** (UI question 8 below); a verification spike (§1.7) pins down
   the exact jassub behavior.

### 1.4 What the renderer can and cannot do (hard constraints on your design)

The export/preview renderer is libass (the industry ASS renderer; ffmpeg uses it for burn).

- ✅ Every channel in §1.2 except `move` animates **per cue**, with arbitrary chained segments.
- ⚠️ **Easing is a power curve only** (`t^accel`): linear / ease-in / ease-out / extreme
  variants. **One segment cannot do ease-in-out (S-curve)** — any preset implying an S-curve
  auto-expands to two chained segments at compile time (invisible to the user). No beziers,
  no bounce/elastic natively; fancy curves are likewise approximable by auto-generated chained
  segments — schema already supports it, so designing easing as a named-preset picker is safe.
- ⚠️ **`move` (position) is event-level, not per-cue**, and linear-only with a single
  from→to. This is enforced **at the model level**: the mutation layer rejects a `move`
  animation on a tag (cue/selection) scope — it is only accepted at group/global. The UI
  should disable rather than explain-after-the-fact (question 12). v1: a slide/drift applies
  to a whole group's rendered line block, not to one word. (Future: per-cue motion is
  achievable by compiling cues into separate render events — a known technique — but it is
  explicitly out of v1.)
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
- **Per-word geometry is the top integration risk** (flagged in design review): libass exposes
  no per-word boxes, so the overlay must reproduce the renderer's layout closely enough for
  hit-testing and selection outlines. Mitigation plan: the overlay uses the SAME font file
  (served by the daemon, loaded via @font-face) at PlayRes-scaled size — browsers and libass
  both shape with HarfBuzz, so advances and break positions match closely for our simple
  horizontal text, and decorations (\bord/\shad) don't shift advances. Plus: selection
  outlines drawn with a few px of padding so residual error is invisible; event-level bounding
  boxes extracted from the renderer's per-frame bitmap positions as a sanity clamp; an
  explicit calibration spike (§1.7) BEFORE committing to this architecture. Hit-test tolerance
  (clicks resolve to the nearest cue) absorbs small drift; pixel-perfect alignment is not
  required, unlike the old Tk ink-ratio problem where the approximation WAS the pixels.
- Smooth 60fps playback and instant scrub — no per-frame server round-trip in live mode.
- **The edit→pixels loop:** every committed edit already broadcasts new state over WS; the
  client then pulls the regenerated `.ass` and hands it to the renderer (`setTrack`).
  Re-parsing is per-EDIT (single-digit ms at our file sizes), rendering is per-frame (~1–5ms),
  so the authoring loop feels exactly like today — only truthful. Playback/scrub never
  re-parses; the clock just moves.
- **Continuous drags** (placement box, pin, word blocks): mutations dispatch on release, so the
  rendered pixels update on release; *during* the drag the existing overlay ghosts (bbox, pin
  crosshair, readout chip) remain the live feedback. Engineer decision for v1; live-truth
  dragging via throttled speculative recompiles is a possible later upgrade.

### 1.6 The v1 preset shortlist (engineer proposal — react freely)

Presets are pure UI sugar: each writes ordinary `Animation` records, openable later as raw
channels. Proposed v1 list:

| Preset | Channel(s) | Params exposed |
|---|---|---|
| Fade in | alpha | duration, lead-in (start before cue), easing |
| Fade out | alpha | duration, easing |
| **Sweep** (karaoke fill) | karaoke_fill | base (pre-sweep) color; sweeps to primary as sung |
| Pop | scale_x+scale_y | overshoot %, duration |
| Color flash | primary | color, attack/decay durations |
| Wipe in | clip_rect | direction (L→R/R→L/T→B), duration |
| Blur in | blur | start blur px, duration |
| Slide (group-level only) | move | direction, distance, duration |

Sweep is the genre-defining karaoke effect (left-to-right fill as the word is sung) and uses
ASS's native `\kf` mechanism — the oldest, best-supported feature of the format. Its timing is
intrinsically the cue's sung interval (no anchors/modes apply).

### 1.7 Verification spikes (run before the engine spec is finalized)

Cheap, isolated experiments answering the review's empirical questions:

1. **Overlap semantics** — two overlapping `\t` on one property in jassub: compounding,
   last-wins, or jump? Pins down the warning copy for Q8 and whether §1.3-4 needs hardening.
2. **`\clip` interpolation** — does jassub animate `\clip(x1,y1,x2,y2)` under `\t`? Gates the
   Wipe preset.
3. **Full-song scale** — typewriter+stagger across all ~363 words: measure .ass size, jassub
   `setTrack` parse time, and per-frame render time. Validates the "single-digit ms" claim at
   worst case.
4. **Geometry calibration** — same-font DOM layer vs rendered pixels across fontsize/bold/
   spacing/scale variations; measure per-word bbox drift. Gates the §1.5 overlay plan.
5. **`\kf` gap padding** — our words have silence gaps inside an event, so the compiler must
   emit padding `\k` segments to keep the accumulated karaoke clock honest. Verify the
   technique renders correctly in jassub (incl. fill color = primary over base). Gates the
   Sweep preset.

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
Every animation endpoint is one of the **8 anchors** (cue / line / span / event × start / end,
§1.2 — enough for a *grouped* picker, not a flat dropdown) + signed
offset in **ms or fraction-of-cue**. Defaults do the right thing (fade-in = cue_start+0), but
custom editing needs a face.
- a. How literal do we get? Options: (i) two dropdown+number rows ("Start: cue start − 200 ms"),
  (ii) a mini-timeline strip per animation — a bar representing the cue span with draggable
  in/out handles that snap to anchors, (iii) both, mini-timeline as the editor and the row as
  the readout.
- b. The ms-vs-fraction unit choice: explicit unit toggle, or infer (typed `%` vs `ms`)?
- c. Multi-segment animations (the 0→50%-in-20ms-then-50→100%-in-80ms case): stacked segment
  rows, or drawn as a single mini-curve with draggable breakpoints?
- d. **Timing modes** (anchors + stagger, §1.2): for group/selection animations the user picks
  how members relate in time. The full set: **Per cue** (each word on its own clock), **Per
  line** (each line as a unit), **Together** (whole scope in unison), **Cascade** (even wave,
  i×step), **Chained** (each starts as the previous ends — typewriter), **Reverse** (exits),
  **Center-out** (ripple), **Jitter** (random sparkle). Engineer leaning: the "Timing" control
  is a small mode picker on the animation row; a `step` field appears only for the
  cascade-family; raw per-endpoint anchors (and hybrids like start-together/end-per-cue) stay
  under Advanced. Defaults per preset (fades → together, color/pop → per cue).
  - How should eight modes be presented without overwhelming the row — flat dropdown, grouped
    dropdown (Follow words / As one / Wave…), or icon segmented control?
  - Are all eight worth exposing in simple view, or should center-out/jitter live under
    Advanced?

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
  offset — decided (§1.2): no absolute anchor in v1, so a migrated trigger now *follows the
  words* when retimed rather than staying at its wall-clock moment. The old UI exposed
  ±0.5s/auto buttons; keep that micro-UI inside the new animation row, or generalize to the
  standard timing editor?

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

---

## Part 3 — Product answers (decided 2026-06-06; design against these)

The five product calls the designer escalated, answered by the product owner:

1. **v1 ambition (Q1): presets + Advanced.** Simple comes first and dominates the surface;
   Advanced is differentiated with a small tag (or similar lightweight marker), and exposes
   the raw channel/segment/timing records. Rationale: MCP agents author raw records, and the
   UI must be able to display any state the server holds.
2. **Karaoke sweep: in v1.** Added to §1.6 and the channel list (`karaoke_fill`); spike #5
   gates it.
3. **Vocabulary (Q2b): plain verbs.** "Fade in / Sweep / Pop / Wipe" — consistent with the
   app's imperative labels ("Merge words", "Break line"). No branded effect names.
4. **Timing modes in simple view (Q5d): five** — Per cue / Per line / Together / Cascade /
   Typewriter. Reverse, Center-out and Jitter live under Advanced. (Typewriter = chained
   cascade; both earn simple-view slots: cascade for its adjustable step, typewriter for
   instant recognizability.)
5. **IA (Q3): Inspector section mirroring the style waterfall**, inheriting its tier grammar
   (tier select, inherited rendering, clear/override). The Group fade-in/out toolbar buttons
   survive as preset shortcuts; FadeDefaultsPanel and FadeGroupPanel fold into the animation
   list.

Remaining sub-questions of the 12 are the designer's to decide, noted for engineer sign-off.

---

*Engineer note: the formal engine spec (mutations, MCP tools, migration details, compiler) will
follow the usual spec flow now that Part 3 is decided. No WS/MCP backward compatibility is
required — the old fade tools are removed outright and replaced by animation tools. Project-file
migration (auto-convert on open) is still in scope. The §1.7 spikes run before the engine spec
is finalized.*
