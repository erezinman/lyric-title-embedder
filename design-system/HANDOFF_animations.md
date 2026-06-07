# HANDOFF — Caption Animations: authoring IA + timeline strips

**Status:** design locked, prototyped. Ready to build into the real React/Vite app
(`web/src/**`) wired to the daemon. This file is self-contained — a programmer agent should be
able to implement from it alone. Companion specs: `HANDOFF_real-model.md` (project model + daemon
API), `HANDOFF_v3.md` (architecture). Brand tokens: `colors_and_type.css`.

> **Engine status — animations are PROVEN, not aspirational.** Empirical spikes in the repo
> (`spikes/libass/FINDINGS.md`, `spikes/jassub-bench/FINDINGS.md`, commit `73ed386`) confirm libass
> can render every animation type below, and **jassub** (libass-in-wasm) renders them **in the
> browser at sub-millisecond** — so the "Exact" preview is live, not ffmpeg-only. Each type maps to a
> specific libass primitive with empirically-derived compiler rules (see §4.1, §8). Build the real
> renderer; do **not** stub/no-op. The only true unknown is the easing vocabulary (§7).

Working prototypes (open in a browser, tokens come from `../../colors_and_type.css`):
- `ui_kits/desktop-app/animations-ia.html` (+ `ia.css`, `ia.js`) — 3 placement options + the
  append-style inspector model.
- `ui_kits/desktop-app/timeline-anim.html` (+ `tl-anim.css`, `tl-anim.js`) — timeline animation
  strips, 2-click select→focus, drag-retime, +N overflow → inline expand.

Ground-truth engine resources (in the repo @ `73ed386`, read before implementing the renderer):
- `spikes/libass/FINDINGS.md` + `spike1.py spike1_fine.py spike2.py spike3.py harness.py` — libass
  `\t` / `\clip` / `\kf` semantics, empirically measured. **The compiler rules in §4.1/§8 come from
  here.**
- `spikes/jassub-bench/FINDINGS.md` + `index.html serve.py run-spikes.cjs run-geometry.cjs` — jassub
  perf (sub-ms full-song) + DOM↔libass geometry calibration (one per-font scale ≈ 0.866 for DejaVu).
- `core.py` (ASS emit: `ass_time esc rgb_to_ass`), `app_base.py` (libass render + ffmpeg burn),
  `karaoke_subtitle_gui.py` (`build_ass_v2`, the per-word `\t` fade emitter to extend).

---

## 1. Authoring placement — DECIDED: Option A (Inspector section)

Animations live in the **Inspector rail**, directly under the existing style waterfall, reusing the
same **global → group → cue** resolution and inherit/override language. (Options B "Animate tab" and
C "modal" were prototyped and rejected — B splits style/motion across tabs & duplicates the
waterfall; C is modal and loses live preview/lane context.)

Cue lanes gain a 4th **ANIMATION** column mirroring the fade lanes (inherited-grey vs override-solid).

## 2. Inspector model — DECIDED: append-style overrides (not greyed full grid)

Replace the "every tier shows all ~10 rows, inherited greyed" panel with a **rule model**:

- **GLOBAL** tier = the **complete** base: all style props + a base **Animations** list.
- **GROUP** and **CUE** tiers start **empty** and **append only what they override**. A tier with
  nothing added reads *"inherits everything from {parent}"*.
- Each override row has **✎ edit** and **↺ revert-to-inherited**. Animation rows also have **✕ remove**.
- **Property vs animation rows differ:** a fill/size always *has* a value → only override/revert
  (no remove). Only **animations & fades** support remove.
- **Removing an inherited (global/group) animation at a child scope = an explicit TOMBSTONE row**
  (`⊘ {name} — removed here` + restore ↺). Critical: for animations *absent ≠ removed* (absent =
  inherit), so a negative override must be a stored, visible, reversible state — **not** mere absence.
- **`＋ Add override ▾`** lists only not-yet-set props; **`＋ Add animation ▾`** opens the preset
  picker. **`▸ Inherited (n)`** disclosure reveals the full computed list on demand (override/remove
  inline from there) — clean default, full context one click away.

See `animations-ia.html` bottom section ("The override model") for the rendered target.

### Resolution semantics (per scope, most-specific wins)
```
style props:   cue.style[k]   ?? group.style[k]   ?? global.style[k]   ?? builtin
animations:    start from global.animations (the base list), then per child scope apply, in order:
                 - APPEND  rows the scope added
                 - TOMBSTONE rows the scope removed (drop the inherited anim of that id)
                 - EDIT    rows (override props of an inherited anim by id)
               → resolved list = the set actually rendered for that cue.
```

## 3. Timeline animation strips — DECIDED

Each animation renders as a **strip docked to the bottom band of its cue block**, x-bounds synced to
the **same time axis** as the track. The **fill encodes the type** (the strip *is* the legend):

| Type | Fill treatment |
|---|---|
| `color` | literal `linear-gradient(90deg, from, to)` |
| `alpha` | opacity ramp of the cue fill — `…00 → solid` (fade-in), mirrored for `dir:"out"` |
| `size`  | rising wedge — `clip-path:polygon(0 100%,100% 0,100% 100%)` over a tint→solid gradient |
| `type`  | left→right hatch — `repeating-linear-gradient(90deg, c 0 3px, c33 3px 7px)` |
| `move`  | directional gradient + arrow glyph (`dir` sets orientation) |
| `glow`  | soft `radial-gradient` bloom, slight blur |

### Density rules (DECIDED — no vertical zoom exists)
- **Cap = 3 stacked bars** per cue. They share the bottom **~42%** band, each `42/slots` tall.
- **>3 animations:** show `MAX_BARS-1` real bars + a **"+N" overflow chip** in the last slot. The
  chip is striped with the hidden animations' type colors and spans their time union.
- **Inline expand (DECIDED):** clicking **+N** on the *already-selected* cue **expands the stack
  inline** — the cue **grows taller** (`54 + (n-3)*13 px`), band widens to ~60%, shows **all** bars
  plus a **✕ collapse** chip (top-right). Re-selecting elsewhere or ✕ collapses it. (Focus panel also
  lists all animations regardless, as a fallback.)
- **Too-short bars → glyph chip.** Below **`MIN_PX = 26px`** rendered width, draw a fixed-width glyph
  chip (type glyph + a subtle `~` "not to scale" mark) instead of a true-width bar. Because width =
  `duration × pxPerSec(zoom)`, **horizontal zoom** naturally expands short animations past the
  threshold into real bars. This is the *only* zoom that affects bar density.

### Interaction (DECIDED)
- **1st click** on a cue (or any strip) → **select the cue** (as today: opens it in the Inspector).
- **2nd click** on a strip (cue already selected) → **focus that animation**: Inspector drills into
  that animation's override row; on the track the strip gets **drag handles on its left/right edges**.
- **Drag a handle** → retime the animation (`set start`/`set end`), clamped to ≥50ms and within
  reason; this maps to the engine edit (see §5).
- **Esc** clears animation focus back to cue selection.
- Strips are **muted** (lower opacity/desat) until the cue is hovered or selected, so the lyrics stay
  the visual focus and the track doesn't read as a rainbow. (Toggleable in the prototype.)

## 4. Data model additions (extends `HANDOFF_real-model.md §5`)

Add an `animations` array at each style scope. An animation:
```jsonc
{
  "id": "a3",                 // stable within its scope
  "type": "color",            // color | alpha | size | type | move | glow  (extensible)
  "s": 1.55, "e": 2.30,       // start/end in seconds, on the project time axis
  "easing": "out",            // optional; engine default otherwise
  // type-specific:
  "from": "#FFFFFF", "to": "#FF3DA6",   // color
  "dir": "in" | "out" | "up" | "down" | "left" | "right",  // alpha (in/out), move (direction)
  "amount": 1.4               // size scale factor / glow intensity, etc.
}
```
Scope carriers (mirrors the style waterfall):
```
project.globalStyle.animations          : Animation[]            // the base list
project.layout[gi].style.animations      : Animation[]            // group appends
project.layout[gi].style.anim_removed     : string[]             // group tombstones (anim ids)
tok.style.animations                      : Animation[]           // cue appends
tok.style.anim_removed                    : string[]             // cue tombstones
```
> Note: in the shipped engine (`web/src/types.ts`) fade durations already moved **off** the tag
> onto the group (`LayoutGroup.fade`). Animations follow the same "props live on the scope, color is
> derived" philosophy — band/strip color comes from `colorForIndex`/type, not stored per anim.

### 4.1 Type → libass primitive (PROVEN by `spikes/libass/FINDINGS.md`)
Each UI type compiles to a specific ASS override; the spikes pin down the exact emit rules.

| UI type | libass primitive | Compiler rule (empirical) |
|---|---|---|
| `color` | `\t(s,e,\1c&H…&)` (and `\3c` for outline) | Standard transform. AABBGGRR; use `core.rgb_to_ass`. |
| `alpha` (fade in/out) | `\alpha&HFF&` then `\t(s,e,\alpha&H00&)` (mirror for out) | This is the **existing v2 fade emitter** — extend it. |
| `size` (Pop) | `\fscx/\fscy` via `\t`, optional spring = two `\t` | **Last-listed `\t` wins per property, continuously** (Spike 1). Emit at most ONE `\t` per (property,window); the one that should dominate any overlap goes **LAST**. Never assume additive. Don't append a static `\fscN` after an animated one unless cancelling it. |
| `type` (Typewriter) | `\clip(x1,y1,x2,y2)` **rect** under `\t` | `\clip` **rect is linearly interpolated, pixel-accurate** (Spike 2) — a true wipe. Compute endpoints from the **actual laid-out text bbox** (account for alignment), not PlayRes guesses. The vector/`\iclip` form is NOT interpolated — use the rect form. |
| `karaoke sweep` | `\k`/`\kf` centisecond fill | `\kf` is a smooth L→R partial fill; insert `\k<gap>` padding between words so fills hit real word times; durations are **cs from event start, must sum to cover every gap**; unsung=`SecondaryColour`, sung=`PrimaryColour` (Spike 3). One block per word suffices. |
| `move` | `\move(x1,y1,x2,y2,s,e)` or `\t…\pos` | Standard; from the laid-out bbox. |
| `glow` | `\t` on `\blur`/`\be` (+ optional `\3a`) | Standard transform. |

## 5. Daemon edit tools to add (extends `HANDOFF_real-model.md §4`)
All flow through the one shared undo/redo timeline; each returns the affected entity; `/ws` pushes
new state. The simulated AI agent can drive these too.
```
add_animation(scope, ref, anim)            // scope: "global"|"group"|"cue"; ref: gi | word_ids
remove_animation(scope, ref, anim_id)      // child scope on an INHERITED id ⇒ writes a tombstone
restore_animation(scope, ref, anim_id)     // clears a tombstone
set_animation_props(scope, ref, anim_id, partial)   // incl. {s, e} from drag-retime
```
Resolution endpoint: `get_render` / `get_word` should return the **resolved** animation list per cue
(post append/tombstone/edit) so the timeline & preview consume a flat list.

## 6. Build checklist (React, in `web/src/`)
1. **Types** (`types.ts`): add `Animation`, extend `Style`/scope carriers (§4); type the resolved
   render-group animation list.
2. **`useProjectStore`**: optimistic local-echo for the 4 new tools (§5), reconciled by `/ws`.
3. **Inspector**: convert tiers to the **append model** (§2) — `OverrideRow`, `TombstoneRow`,
   `AddOverrideMenu`, `AddAnimationMenu`, `InheritedDisclosure`. Port styles from `ia.css`
   (`.tier.append`, `.ov-row`, `.tomb`, `.add-row`, `.inh-disc`).
4. **Cue lanes**: add the 4th ANIMATION column (inherited-grey vs override-solid), mirroring fades.
5. **WordTrack**: render animation strips (§3) — fill-by-type, ≤3 + overflow, inline expand, glyph
   threshold off horizontal zoom, 2-click select→focus, drag-retime handles. Port `tl-anim.css`
   (`.astrip`, `.astrip.glyph|.overflow|.collapse`, `.h`, `.cue.exp`) and the render/interaction
   logic from `tl-anim.js` (`stripStyle`, `typeColor`, `typeGlyph`, the click handler, the drag
   pointer handlers).
6. **Animation preset picker**: the existing disabled "Karaoke Bounce / Pop / Glow / Typewriter"
   presets become the `＋ Add animation` menu; each preset instantiates a typed `Animation`.
7. **Preview**: **Exact = jassub (libass-in-wasm) live in the browser** — proven sub-ms per frame at
   full-song scale (§8). `manualRender({mediaTime})` + `setTrack(ass)`; re-`setTrack` on edit (~1ms).
   Keep a CSS Live overlay for the very smoothest scrub if desired, but Exact is now cheap enough to
   be the default. (Desktop CTk path still uses the ffmpeg/libass render in `app_base.py`.)

## 7. Open product decisions (defaults chosen; confirm before final)
- **Cap = 3** (chosen over 2) with inline-expand escape hatch. Revisit if 3 feels dense at small zoom.
- **Preset list**: Bounce / Pop / Glow / Typewriter + the timeline-native types (color/alpha/size/
  move/glow). Suggest also: **Cascade** (per-word stagger), **Karaoke sweep** (fill wipe synced to
  word timing). Confirm the canonical preset set.
- **Easing vocabulary** to expose (linear / out / in-out / spring) — TBD with engine. This is the one
  remaining unknown; the spikes only validated linear `\t`.

## 8. Rendering & live preview (from the engine spikes — build against these)

**libass semantics that constrain the compiler** (`spikes/libass/FINDINGS.md`):
- **`\t` overlap (same property): last-listed wins, continuously** (smooth bend at crossover, not
  additive, not discontinuous). → emit ≤1 `\t` per (property,window); dominant transform LAST.
- **`\clip` rect under `\t`: linearly interpolated, pixel-accurate** → Typewriter/Wipe is real; use
  the **rect** form (not vector/`\iclip`), compute from the laid-out bbox.
- **`\kf` + `\k` gap-padding**: karaoke fills align to real word times; cs from event start must sum
  across gaps; unsung=`SecondaryColour`, sung=`PrimaryColour`.

**jassub live preview** (`spikes/jassub-bench/FINDINGS.md`, jassub 2.5.5):
- Full-song (≈372 animated words, 27 KB `.ass`): `setTrack` swap **1.1–1.5 ms**, steady-state seek
  render **0.1–0.6 ms** (rare 7–50 ms one-off shaping-cache warmups). Edit→pixels is ~1 ms. **Live
  exact preview is a non-issue.**
- **Integration gotchas (will silently break you):** (1) `workerUrl` must be the **bundled module
  worker** (`jassub/dist/worker/worker.js`, esbuild `--bundle --format=esm`), NOT the emscripten glue
  — wrong one hangs `instance.ready` forever, silently. (2) **Preload fonts eagerly** (`fonts:[url]`),
  not lazy `availableFonts`, or first render is glyphless headless. (3) **Pixel readback lags render**
  — wait ~250 ms + double-rAF after `manualRender` before screenshot/`drawImage`, or you read zeros.
  (4) All `renderer.*` are worker IPC — always `await`.

**DOM↔libass geometry** (for the CSS overlay & click hit-testing, Spike B):
- Same-font DOM layout matches libass advances to **≤5 px across a full 1280 px line** after **one
  uniform per-font scale** (≈0.866 for DejaVu, **weight-independent**). Calibrate once at runtime
  (render a reference string, divide). Good enough for hit-testing and padded selection outlines.
- Pitfalls: reference styles by their **exact** name (a typo silently falls back to a tiny default
  style); keep the DOM mirror's **wrap width = PlayRes − margins**.
