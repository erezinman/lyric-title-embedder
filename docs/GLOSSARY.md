# Glossary

Canonical vocabulary for the project. Docs, code comments, designer handoffs and UI copy should
use these terms in these senses.

## Data model (bottom-up)

| Term | Meaning |
|---|---|
| **Word** | The atomic unit from Suno's alignment: `{text, start, end}`. Its index in `words[]` is its **wid** (word id). Never split or retimed by layout operations. |
| **Cue** (= **token**) | A *logical word*: one or more words rendered as a unit — `{ids, sep, del, style}`. What you click in the lanes/caption. A **merged cue** has >1 ids; its **span** = earliest start → latest end of its ids. |
| **Line** | A sequence of cues separated by line breaks (`\N`) inside a group. |
| **Group** (layout group) | A labeled block of lines ("Verse 1") with its own window, style overrides, fade/animations. The unit the lanes' headers show. |
| **Event** | The ASS *output* unit — one `Dialogue:` row with start/end and styled text. We compile **one event per group**, spanning its window. "Event" is the renderer's word; "group" is the authoring word for (almost) the same thing. |
| **Window** (`win_start/win_end`) | The time range a group is on screen. Defaults to first sung start → last sung end + linger. |
| **Linger** | Extra seconds a group stays visible after its last word ends. |
| **Sung interval** | `cue_start → cue_end`: when the word is actually *sung* — as opposed to when it *appears*. |
| **Appearance** | The moment a cue becomes visible. Not separate machinery: it *is* the alpha (fade-in) animation covering the cue. No alpha animation ⇒ visible for the whole event. |
| **Tag** | A set of word ids carrying a payload across groups. Legacy: fade tags `{ids, trigger}`. New: animation tags `{ids, anims, suppress}`. The "selection of cues" scope — per-cue is a tag of one. |
| **wid / gi / li / ti** | Indices: word id; group, line, token index. A cue's address is `(gi, li, ti)`. |

## Inheritance & animation

| Term | Meaning |
|---|---|
| **Scope** | Where a style/animation lives: **global** → **group** → **tag** (selection/cue). |
| **Waterfall** | Override inheritance: narrower scope wins (`global < group < cue`). Styles override; **animations are additive** across scopes instead. |
| **Channel** | One animatable property: `alpha`, `scale_x`, `primary`, `blur`, `clip_rect`, `karaoke_fill`, `move`… |
| **Segment** | One from→to leg of an animation. Chaining segments = multi-phase animations. |
| **Anchor** | The reference moment a segment endpoint is relative to: cue / line / span / event × start / end. |
| **Span** (anchor sense) | The owning scope's overall time range — tag: min→max over its ids; group: the event window. `span_*` anchors = members animate **together**. |
| **Timing mode** | How a scope's members relate in time: Per cue / Per line / Together / Cascade / Typewriter (+ Reverse, Center-out, Jitter under Advanced). UI sugar over anchors + stagger. |
| **Stagger** | A computed per-member delay on top of the anchor (the cascade family). Ordering basis: layout reading order (gi, li, ti). |
| **Accumulate** (legacy) | The old per-group appearance mode (words/lines/off). Redefined: it was always just the *timing mode of the appearance animation* (words≡Per cue, lines≡Per line, off≡Together). The field is removed from the model. |
| **Trigger** (legacy) | The old fade-out start time, stored absolute; migrates to a `cue_end`-anchored offset (follows the words after retiming). |
| **Suppress** | Mute an inherited animation at a narrower scope without deleting it at its source. |
| **Preset** | A named UI template (Fade in, Sweep, Pop, Wipe…) that writes ordinary animation records. |
| **Sweep / karaoke fill** | The left-to-right fill as a word is sung — ASS's native `\kf`, primary color filling over **secondary** (base) color. |

## Rendering & formats

| Term | Meaning |
|---|---|
| **ASS** | Advanced SubStation Alpha — the subtitle format we compile to (`.ass`). |
| **Dialogue / Style / PlayRes** | ASS file parts: an event row; a named style definition; the script's logical reference resolution. |
| **Override block** | `{\tags}` inline in event text — per-cue styling/animation lives here. |
| **`\t` (transform)** | The ASS animation tag: interpolates properties over a time range with power easing (`accel`). Overlapping `\t` on one property: last-listed wins, continuously (spike-verified). |
| **`\pos` / `\move` / `\an`** | Whole-event position pin / linear motion / alignment. Event-level — the reason per-cue motion is out of v1. |
| **libass** | The canonical ASS renderer (ffmpeg uses it for burn/exact frames). |
| **jassub** | libass compiled to WASM — the in-browser live-preview renderer (planned). |
| **Compiler** | Our engine code (`render.py` + `ass.py`) that flattens project → render-groups → ASS text. The scope hierarchy/suppression resolve here; ASS never sees them. |

## App surfaces

| Term | Meaning |
|---|---|
| **Live / Exact mode** | Preview modes: live = in-browser smooth rendering; exact = server-rendered ffmpeg frame per seek. |
| **Burn** | Export: ffmpeg hard-subbing the `.ass` into a video file. |
| **Placement / free placement** | Margin-based box positioning vs a `\pos` pin (`use_pos`). |
| **Lanes / WordTrack / Inspector / Rail / Dock** | Editor surfaces: cue table by group; draggable timing blocks; right-side property panel; the right column; the bottom panel. |
