# Engineering Handoff — Video Control & Export Lint

**Project:** Karaoke Subtitle Studio · branch `feat/editor-iteration`
**Scope:** Two contained UI surfaces that expose engine capability already present in the backend.
**Design system:** synthwave (magenta `#FF3DA6` / violet `#8A5BFF` / cyan `#3DE0FF` on violet-black). All
tokens are in `colors_and_type.css` (loaded via `styles.css` in the real app). Use the CSS variables — do
not hard-code hex.

---

## How to view the mockups

Open these in a browser (they are self-contained — fonts + tokens travel with this folder):

- `preview/video-control.html` — the `set_video` control, four states.
- `preview/export-lint.html` — the pre-flight lint panel, three states.

The relative links (`../colors_and_type.css`, `card.css`, `fonts/…`) mirror the real project layout, so
the files render identically here and in-repo.

---

## Feature A — Attach / swap / clear video after creation (`set_video`)

### What already exists (do NOT rebuild)
- `ctx.set_video(...)` exists and is exercised by the library (`daemon/library.py:90,119`).
- Persistence is done — `video` is written into `project.json`.
- **Gap:** the method is not in the dispatchable tool table (`mcp_server/tools.py` has no `set_video`), and
  there is **no UI entry point** — video can only be chosen at create time.

### What to build
1. **Tool wrapper** — add `set_video` to `mcp_server/tools.py`, dispatching to `ctx.set_video`. Accept an
   absolute/needs-resolution path; support a **clear** path (empty/null → detach). Re-probe duration + frame
   size on attach/swap (the swapping state below depends on this).
2. **A `VideoControl` component in the ControlsRail** with the four states in `preview/video-control.html`.

### States (see mockup, left→right, top→bottom)
| State | Trigger | UI |
|---|---|---|
| **Empty** | no `video` on project | Dashed dropwell ("Drop a video or **browse…**", accepted ext hint) + primary **Attach video…** button. Accepts drag-drop and click-to-browse. |
| **Attached** | `video` set | Row: thumbnail glyph, **mono filename** (ellipsis on overflow), meta line `1920×1080 · 0:42.18 · linked`, and two icon buttons — **swap** (refresh glyph) and **clear** (✕, danger-tinted). |
| **Swapping** | swap/attach in flight | Same row with a cyan spinner in the thumb, `replacing… · re-probing duration`, and an indeterminate progress bar (`--grad-live`). Disable the action buttons while busy. |
| **Confirm clear** | clear pressed | Inline danger-tinted confirm: "Detach **{file}**? Cues & styling are kept." → `Cancel` / `Clear video`. **Must reassure that cue/animation work is preserved** (only the media pointer is removed). |

### Behaviors / acceptance criteria
- Attaching, swapping, and clearing all round-trip through the new `set_video` tool and persist to
  `project.json` (reload survives).
- Swap re-probes and updates the `WxH · duration` meta; the waveform/transport length updates to match.
- Clearing detaches the media pointer only — `words`, `layout`, tags, globals, palette are untouched.
- Filename is rendered in `--font-mono`; never let it wrap (ellipsis).
- The swap/clear buttons are 28px icon buttons (`--radius-sm`, `--border`); clear uses `--danger`.
- Busy state blocks re-entrancy (no double-swap).

### Token map
- Shell: `--surface-2` / `--border` / `--radius-lg`.
- Dropwell: `1.5px dashed --border-strong`.
- Attach button: `--grad-brand` fill, `--text-on-accent`, `--shadow-glow-accent`.
- Spinner / progress: `--cyan` / `--grad-live`. Meta accents: `--cyan` (dims) + `--success` (linked).

---

## Feature B — Export lint (pre-flight before burn)

### What already exists (do NOT rebuild)
- The engine already computes warnings: `anim.validate`, same-scope-overlap conflicts
  (`ResolvedAnim.warning` in `types.ts:48`), and silent clamps for off-window triggers and out-of-canvas
  `\pos` (README.md:402).
- **Gap:** these are **never surfaced** — there is no UI for them, and a long ffmpeg burn proceeds even when
  the result is silently degraded.

### What to build
A **Pre-flight panel** inside the existing export popover (`ExportMenu.tsx`). On open (or on a "Check"
press), collect the engine's warnings, classify by severity, render the list, and **gate the burn**
accordingly. See `preview/export-lint.html`.

### Severity model
| Severity | Color | Meaning | Gate |
|---|---|---|---|
| **Blocking** | `--danger` | Result would be wrong/broken (e.g. two animations in the **same scope** at the same time). | **Disables Burn** until resolved. |
| **Advisory** | `--warn` | Will render but likely not intended (e.g. fade-in trigger **clamped** to the event window; low caption-vs-video contrast). | Burn allowed → button reads **Burn anyway**. |
| **Info** | `--cyan` | Auto-corrected, FYI (e.g. `\pos` **clamped into frame**). | No gate. |

> The exact mapping of each existing engine warning → severity is a product call. Suggested default:
> same-scope overlap = **blocking**; all current silent clamps = **advisory/info**. Confirm with design.

### Panel anatomy (per row)
- Severity chip (18px, rounded, tinted bg + icon).
- Title (`--text-1`, 12.5px) + mono detail line naming the **scope** (`word "…"`, `Verse 1`,
  `\pos(960,1042)`) in `--violet-soft`.
- A **jump affordance** ("Jump to cue ›" / "Open placement ›", `--accent-soft`) that navigates the editor to
  the offending word/event/time. The rAF clock + selection model already exist, so "jump to cue at time" is
  cheap — wire each warning to its `word id` / `event` / placement.

### States (see mockup)
1. **Issues found, ≥1 blocking** — count badge `--warn`; footer note "**1 blocking** issue must be resolved
   before burn."; **Burn disabled** (40% opacity).
2. **Advisory only** — count badge `--warn`; footer "Advisories won't block — review or **burn anyway**.";
   **Burn anyway** enabled (ghost-accent button).
3. **Clean** — green check ring, "No issues found", `{n} words · {m} events validated`; footer "All checks
   passed."; **Burn MP4** primary (`--grad-brand`).

### Behaviors / acceptance criteria
- The panel reads the **already-computed** warnings — no new validation logic; just classify + present.
- Burn button is `disabled` iff any **blocking** warning is present.
- Each row's jump affordance selects the referenced atom and moves the playhead to its time (no new model
  needed; reuse existing selection + clock).
- Re-running after a fix updates the list and re-enables Burn without reopening the popover.
- Empty/clean state must be reachable and visually distinct (it's the success path that justifies the gate).

### Token map
- Popover: `--surface-1` / `--border-strong` / `--shadow-pop`.
- Severity tints: `color-mix(--danger | --warn | --cyan, …)`.
- Burn (clean): `--grad-brand` + `--shadow-glow-accent`. Burn-anyway: transparent w/ accent border.
- Clean ring: `--success` on tinted bg with a soft outer ring.

---

## Effort & divergence (context for scheduling)
| Feature | Backend | Design lift | Notes |
|---|---|---|---|
| A · `set_video` | done (method + persistence) | **Small — net-new control** | No entry point exists today; this is the only real surface. |
| B · Export lint | done (warnings computed) | **Small — net-new panel** | Pure presentation + a burn gate; no new validation. |

Both are "engine already does it, the design is the gap." Neither introduces a new design pattern — they
reuse existing rail-control, popover, icon-button, badge, and gradient-button conventions from the design
system (`preview/buttons.html`, `preview/form-controls.html`, `preview/transport.html`, `preview/chips.html`).

---

## Files in this package
```
handoff/
├─ HANDOFF.md                     ← this file
├─ colors_and_type.css            ← design tokens (single source of truth)
├─ fonts.css                      ← @font-face + family registry
├─ fonts/                         ← vendored variable .ttf (Space Grotesk, Hanken, JetBrains Mono)
└─ preview/
   ├─ video-control.html          ← Feature A mockup (4 states)
   ├─ export-lint.html            ← Feature B mockup (3 states)
   └─ card.css                    ← preview scaffolding (specimen layout only)
```
