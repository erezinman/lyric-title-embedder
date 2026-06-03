# HANDOFF — Real engine model vs. v3 UI (diffs, ground-truth model, design decisions)

This is the single source of truth for wiring the v3 UI kit (`ui_kits/desktop-app/`) to the **real
Python engine**, served by a local daemon over HTTP `/api` + WebSocket `/ws`. Brand/voice/tokens are
unchanged (see `README.md`); this doc covers the **model**, the **gaps** the prototype glossed, and
the **in-brand design decisions** now implemented in the kit.

> Companion: `HANDOFF_v3.md` covers the stack/architecture (Tauri shell over the Python core). This
> doc is specifically about representing the *real model* faithfully in the UI.

---

## 1. The two data models (why the kit was a fiction)

**Kit v1 (the original prototype):** `groups:[{id,label,solo,words:[{text,s,e,fadeOut?}]}]` — flat
words, fade as a single boolean, editable text/bounds, static inspector values. This was a
*presentational* mock and is now replaced.

**Kit v2 (current — in `model.jsx`):** a faithful (if simplified) mirror of the real model below —
immutable word atoms, layout events → lines(`\N`) → tokens(cues), fade-in/out **grouping tags**,
a **style waterfall** (cue→group→global), accumulate modes, window/linger, and live AI edits.

**Real engine (the daemon):**
- **Cue = a token** = one or more *merged* immutable Suno word-atoms. **Word text & timing are
  immutable for now** (editing is deferred). A "solo cue" is a single-token event.
- **Layout = ordered events → multiple lines (`\N`) → tokens.** Events: merge / ungroup / split;
  lines: break / merge words; tokens: soft delete/restore.
- Each event has an **`accumulate`** mode (`words` | `lines` | `off`), optional **window start/end**
  override, and **linger**.
- **Fades are GROUPS, not a boolean** — two independent lanes (`fin_tags` / `fout_tags`). Each group
  has optional **trigger** + **duration**; unset ⇒ inherits global defaults + the boundary word time.
- **Style = `global < group < cue` waterfall** over ~10 props; **box-mode is group-level only**.
- **Shared live session:** an AI agent edits the same project over MCP; `/ws` pushes full state;
  **undo/redo is one shared timeline**.
- **Preview truth = libass** (exact PNG at any `t`); a CSS overlay approximates for smooth scrubbing.
- **Animation presets are not in the engine yet** (aspirational).

---

## 2. Per-component reconciliation (kit → real)

| Component | Was (kit v1) | Now (kit v2, real-aware) |
|---|---|---|
| **CueLanes** | one `fadeOut` bool → 3 read-only columns | collapsible **events** w/ **accumulate badge** + window/linger; **two fade lanes** showing `@trigger / dur` (grey=inherited, solid=overridden) + **color bands** for group membership; line-break dividers; merged-token glyph; soft-delete strike-through. |
| **Inspector** | static GROUP/GLOBAL values + text/bounds editor | **3-tier waterfall** GLOBAL · GROUP · CUE; per-prop inherit-grey vs override-solid w/ **× clear**; ~10 editable props/tier; **Border mode on GROUP only**. |
| **WordTrack** | `s/e` + `fadeOut` flag | per-token blocks w/ **fade-in/out membership marks**, accumulate in tooltip, multi-select. |
| **PreviewStage** | faked single caption | **Live/Exact toggle**; Live = CSS approx, Exact = libass frame + "Render exact frame". |
| **CueEditor (text/bounds)** | editable | **locked** (read-only Timing panel + "editing coming soon"). |
| **Animation presets** | selectable | **disabled + "Coming soon"** badge. |
| **TopBar / session** | — | **"AI agent · live"** pill; AI edits show a transient highlight + toast w/ Undo. |
| **ProjectLibrary** | static | unchanged shape; maps to `/api/projects`. |

---

## 3. Design decisions (answers to the 7 open questions)

1. **Two fade lanes.** Separate FADE-IN / FADE-OUT columns. Group membership = a **palette color
   band** down the cell; each shows **`@trigger / dur`** with *inherited = grey italic*, *overridden
   = solid mono*. Create via multi-select → **Group fade-in / Group fade-out**; a selected grouped
   word exposes **Clear** + a **Fade group panel** to edit trigger/dur (each independently
   reset-to-auto).
2. **Waterfall in the rail.** Three stacked tiers **GLOBAL · GROUP · CUE**, each ~10 rows. Inherited
   props render grey + a small `grp`/`glob` source chip; overrides go solid in the tier accent with a
   **× to clear**. The GLOBAL tier shows `base` chips (no clear). **Box mode appears only on GROUP.**
   Click a tier (or its entity) to focus it; edit in place.
3. **Layout richness without clutter.** Events are **collapsible** with an **accumulate badge** and
   window/linger summary; line breaks are thin dividers; merged tokens get a glyph + "merged" tag.
   Structural ops (merge/ungroup/split/break/merge-words/delete-restore) live in a **contextual
   toolbar**; per-event accumulate/linger/window live in a slim **event strip** under the lanes.
4. **Locked / aspirational.** Text+bounds → **read-only Timing panel** with a "locked to source —
   editing coming soon" note. Animation presets → **disabled section** with a "Coming soon" badge.
5. **AI presence.** A cyan **"AI agent · live"** pill in the top bar; AI-originated edits get a
   **transient magenta pulse** on the affected entity + a toast ("AI agent toggled Bold on Chorus")
   with **Undo** — all on the shared timeline.
6. **Preview.** A **Live / Exact** segmented toggle. Live = CSS overlay ("CSS approx" badge), Exact =
   libass ("libass" badge) with a **Render exact frame @ t** affordance.
7. **New treatments introduced.** the inherit-grey/override-solid prop system; fade color bands;
   accumulate badges; AI-change pulse; Live/Exact preview badges; the locked/coming-soon disabled
   style. All use existing tokens — no new brand colors.

### Rendering caveat carried from the engine
Per-span **font/size/bold/color/animation** are inline ASS tags; **border mode + box/back colour live
in `[V4+ Styles]`** and cannot vary per span — so box-mode is a **group decision** (selects a Style),
reflected by putting `border_style` only on the GROUP tier. See `HANDOFF_v3.md §6b`.

---

## 4. Daemon API surface (target)

**HTTP**
- `POST /api/call {tool,args}` → `{result}` | `{error}` — the full tool surface (§ below).
- `GET /api/state` → `get_state` (also the `/ws` push payload).
- `GET /api/render` → render-groups (§5.4) · `GET /api/ass` → text · `GET /api/frame?t=<sec>` → PNG.
- `POST /api/burn {out,video_in?}` → `{job_id}` · `GET /api/burn/{job_id}` → `{frac,done,ok,err,out}`.
- `GET /api/projects` · `POST /api/projects/new|open|save`.

**WebSocket** `/ws` → on connect and after **every** change: `{type:"state", state:<get_state>}`.

**Read tools** (`/api/call`): `get_group(gi)`, `get_word(wid)`, `list_groups`, `list_words`,
`get_render`, `get_ass`, `get_globals`, `get_state`.

**Edit tools** (each returns the affected entity; all on one shared undo/redo timeline):
`set_group_style(gi,partial)` · `set_cue_style(word_ids,partial)` · `make_fade_tag(kind,word_ids)` ·
`clear_fade_tag(kind,word_ids)` · `set_fade_tag_props(kind,word_ids,trigger?,dur?)` (ids must be in ONE
group) · `set_layout_props(gi,win_start?,win_end?,linger?,accumulate)` · `merge_events(gidxs)` ·
`ungroup_event(gi)` · `split_event(gi,line_index)` · `break_line(gi,li,ti,after)` ·
`merge_words(gi,li,ti,sep)` · `delete_words(word_ids)` · `restore_words(word_ids)` ·
`set_fade_defaults(...)` · `set_globals(partial)` · `undo()` · `redo()` ·
`load_lyrics(json_path,group_by,skip_dashes)` · `load_project(path)` · `save_project(path)` ·
`generate_ass(path?)` · `render_frame(time_s)` → PNG · `burn(out,video_in?)` / `burn_status(job_id)`.

---

## 5. Full data model (ground truth)

### 5.1 `project` dict
```jsonc
{
  "words": [ { "text":"Caught", "start":0.30, "end":0.70 }, ... ],   // immutable; id = index (wid)
  "layout": [                                   // ordered EVENTS
    { "label":"Verse 1",
      "lines": [ { "toks": [                     // tok = a CUE (1+ merged word ids)
        { "ids":[3], "sep":"", "del":false, "style": { /* cue overrides */ } },
        { "ids":[4,5], "sep":" ", "del":false, "style": {} }
      ] } ],
      "accumulate":"words",                      // "words" | "lines" | "off"
      "win_start":null, "win_end":null, "linger":null,   // null = auto / inherit
      "del":false, "style": { /* group overrides */ } }
  ],
  "fin_tags":  [ { "ids":[0,1,2], "color":0, "trigger":null,  "dur":null } ],  // fade-IN groups
  "fout_tags": [ { "ids":[3,4],   "color":1, "trigger":15.40, "dur":600  } ],  // fade-OUT groups
  "globals": { "fade_in_ms":250, "fade_out_ms":1000, "linger":0.0 },
  "palette": [ "#7a4a4a", ... ]                  // 10 group/fade-band colors
}
```

### 5.2 Style override dicts (`style` on groups & cues)
Key absent/`null` ⇒ inherit. Resolution **cue → group → global** (most specific wins).
- **Group keys (10):** `font`(str) `fontsize`(int) `bold`(bool) `primary`(#hex) `outline`(#hex)
  `back`(#hex) `back_alpha`(2-char hex e.g. `"80"`) `outline_w`(int) `shadow`(int)
  `border_style`(int: 1=outline, 3=opaque box).
- **Cue keys (9):** same **minus `border_style`** (box-mode group-only).

### 5.3 Global style/placement
`font, fontsize, bold, align`(1–9 numpad anchor)`, primary, outline, back, back_alpha, outline_w,
shadow, border_style, play_w, play_h, margin_l, margin_r, margin_v, fade_ms, use_pos, pos`(`[x,y]`|null).
Timing defaults live in `project.globals` (`fade_in_ms/fade_out_ms/linger`).

### 5.4 Render-group (derived; `GET /api/render`)
```jsonc
[ { "start":1.40, "end":6.85, "accumulate":"words", "group_style": { /* resolved */ },
    "lines": [ { "words": [
      { "text":"bleating", "start_s":1.40, "end_s":2.00, "fin_ms":250,
        "fout_at":15.40, "fout_ms":600,   // fout_at:null = no fade-out
        "style": { /* cue overrides */ } } ] } ] } ]
```

### 5.5 Kit ↔ engine mapping
The kit's `model.jsx` mirrors §5.1 exactly: `global_style` (renamed from the earlier `globalStyle`),
`globals` (timing), `placement`, and `palette`. Resolvers in `model.jsx` — `resolveStyle`,
`eventWindow`, `wordSchedule`, `fadeTagOf` — implement §5.2 and §5.4 (`border_style` resolves
group→global only). The edit functions (`setStyle`, `groupFade`, `mergeWords`, `mergeEvents`,
`splitEvent`, `breakLine`, `ungroupEvent`, `setLayoutProp`, `deleteSel`) are 1:1 stand-ins for the §4
edit tools; swap each for a `POST /api/call` and drive state from the `/ws` push.

---

## 6. Daemon-contract reconciliation (backend reply, accepted)

The backend confirmed the **kit shape is correct** and is extending the daemon so a single
`get_project()` message (= `/ws` push = `GET /api/state` body) returns the project **verbatim** plus
`global_style`, `placement`, and `palette`. See `uploads/HANDOFF_daemon-contract.md` for the full
backend reply. What this means here:

- **Wire 1:1.** `model.jsx`'s `INITIAL_PROJECT` is the `get_project` shape (only rename:
  `globalStyle` → **`global_style`**, done). `placement` + `palette` are now in the model too.
- **GLOBAL tier I/O.** The GLOBAL style tier reads from `state.global_style` and writes via
  `set_globals({key:value})`; timing defaults via `set_fade_defaults`; placement (canvas/align/pos,
  shown read-only in the Project rail) via `set_globals`. **Do not** persist GLOBAL edits into project
  state — they're engine-authoritative (`cfg`). The Project-rail note says exactly this.
- **Fade tags now carry `color`/`trigger`/`dur`.** Backend will surface these (today's `get_word`
  returned ids only) — `FadeCell` + `FadeGroupPanel` already consume them.
- **Merged tokens** keep `sep` + all `ids` (backend fix to return `token_text()`), so the kit's
  "merged" glyph + joined text resolve.
- **Edit-fn translation** (kit → tool) per the backend's §2.3 table — notably `mergeWords(selection)`
  becomes a left-to-right sequence of `merge_words(gi,li,ti,sep)` over the contiguous run, and
  `set_*_style(..., {key:null})` clears an override. `splitEvent`/`breakLine` map to
  `split_event(gi,line_index)` / `break_line(gi,li,ti,after)` (buttons now in the kit).

### Palette decision (Part 3) → **(a)**: update the engine `PALETTE` to the brand hexes
So every client (web UI, CTk app, MCP-driven renders) matches. The 10 group/fade-band colors, in
order (also `--cue-1…10` in `colors_and_type.css`):
```
0 #7A3A5A   1 #5A4A7A   2 #3A5A7A   3 #5A7A3A   4 #7A6A3A
5 #3A7A7A   6 #7A4A4A   7 #6A3A7A   8 #3A6A7A   9 #7A5A3A
```
These are intentionally **muted** (they sit as bands *behind* grouped words and must not fight the
white/accent caption text) — brand-aligned but readability-first. If you'd rather the bands read more
vivid, say so and I'll supply a higher-chroma alternate set.
