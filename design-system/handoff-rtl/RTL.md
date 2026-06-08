# Engineering Handoff — RTL Support

**Project:** Karaoke Subtitle Studio · branch `feat/editor-iteration`
**Scope:** Right-to-left subtitle support (Hebrew first; Arabic shares the same machinery).
**Mockup:** `preview/rtl-support.html` (self-contained — open in a browser).

> **One-line estimate:** the *burned output* is nearly free (libass does bidi); the cost concentrates in
> the *editor* anywhere we compute word positions/selection ourselves instead of letting libass do it.

---

## Layer-by-layer difficulty

### 1. Burn / `.ass` output — **nearly free**
libass reorders bidi text through **FriBidi** and shapes through **HarfBuzz**. Hebrew/Arabic placed in an
event is reordered and laid out automatically — we never compute glyph positions, libass does. Because the
app already emits **one `\pos` per event** and lets libass flow the line (`WrapStyle: 2`, explicit `\N`),
RTL text "just renders." Three small to-dos:
- **Font coverage** — the chosen face must contain the script's glyphs. The picker is `fc-list` family
  names only; add a coverage hint / sane RTL default (e.g. Heebo, Noto Sans Hebrew, Noto Sans Arabic).
- **Base direction** — ASS has no RTL style flag; libass infers from content. For clean mixed lines, inject
  Unicode bidi marks (see §4).
- **Default alignment** — RTL wants right alignment. `\an` already supports it (3/6/9); this is a default
  flip, not new capability. The mock defaults RTL → `\an6`.

### 2. Data model & timing — **free (no change)**
This is the part that could have been scary and isn't:
- Words stay stored in **logical (reading) order**; canonical indices stay stable (keyed by `nwords`).
- Every fade trigger is **temporal** ("first member word's start", "line's first word") — direction-agnostic.
- No reconcile / reindex needed. RTL does **not** touch the immutable-word model.

### 3. Per-word fade-in technique — **fine, but test it**
The architecture relies on all words being present from event start (alpha-hidden) and animated in place via
inline `\alpha`/`\t` tags. Those override blocks are state changes; libass bidi-processes the concatenated
**visible** text as one paragraph, so per-word alpha tags don't break reordering. **Verify early** with a
real Hebrew line — edge cases live where an override block lands mid-bidi-run.

### 4. Mixed-direction lines — **medium (the nasty case)**
Hebrew/Arabic with embedded numbers or Latin is the hard part. Numbers stay **LTR** inside an RTL run
(`הגרסה 2024 שלנו` → "2024" reads left-to-right but sits in RTL flow). Add a **"insert bidi marks"**
project option (mock: on by default) that wraps numbers/Latin with **LRM/RLM** (or LRE…PDF) so they don't
reorder unexpectedly. Test: Hebrew + number + Latin word in one line.

### 5. Directional animations — **medium**
Channels that *move* should mirror for RTL: slide-in x-offset and `clip_rect` wipe **direction** flip
("enter from left" → "from right"). Per-channel mirroring, additive — no architectural change. Non-spatial
channels (alpha, scale, blur) are unaffected.

### 6. Live preview & selection — **THE cost; depends on one fact**
**Does the live preview render through libass, or through a hand-rolled per-word layout?**
- **Through libass** (libass-in-wasm, or the desktop app's exact-render path): RTL works in preview for free
  — same bidi engine as the burn. Whole feature drops to **Small–Medium**.
- **Through the fast hand-rolled canvas** (measuring widths left-to-right — the draggable approximation):
  this path positions and hit-tests words in **visual LTR order**. Making it correct means honoring bidi in
  our own layout: reorder to visual order, right-align, and — critically — **map visual→logical for
  selection/drag** (see the trap below). This is where "Medium" becomes the bulk of the work.

---

## The hit-testing trap (see mockup, middle panel)

Words are stored #1…#5 in **reading order**; `direction: rtl` flips only the *visuals*, so **logical word
#1 is the visually-rightmost**. A naive "leftmost click = first word" maps to the **wrong** word. Any code
that:
- converts a click coordinate → word index,
- drag-selects a contiguous run,
- draws the per-word selection box / placement handles,

must map **visual position → logical index** (and back). If the preview goes through libass this is handled;
if it's the hand-rolled layout, this mapping is the single most important thing to get right and to test.

---

## What to build (summary)
| Item | Effort | Notes |
|---|---|---|
| `Text direction` project setting (Auto / LTR / RTL) | S | Persist on project; drives default `\an` + base dir. |
| Default-alignment flip on RTL | S | `\an6`; user-overridable. |
| Bidi-mark insertion for mixed lines (toggle) | S–M | LRM/RLM around numbers & Latin. |
| Font-coverage hint + RTL default face | S | Extend the `fc-list` picker. |
| Directional-animation mirroring | M | Slide / `clip_rect` direction only. |
| Bidi-correct preview layout + visual→logical hit-testing | **S if preview = libass, else M–L** | The real variable. |

**Test matrix:** a pure Hebrew line; Hebrew + number (`הגרסה 2024 שלנו`); Hebrew + embedded Latin word; a
two-line `\N` event; per-word fade-in on all of the above; drag-select a contiguous run and confirm the
**logical** words selected match the visual run.

---

## Files added to this package
```
handoff/
├─ RTL.md                         ← this file
└─ preview/
   └─ rtl-support.html            ← RTL mockup: direction setting, Hebrew stage,
                                     visual↔logical map, mixed-bidi case
```
(Shares `colors_and_type.css`, `fonts.css`, `fonts/`, and `preview/card.css` already in this package.)
