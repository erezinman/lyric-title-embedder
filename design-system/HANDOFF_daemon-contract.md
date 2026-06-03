# Reply to the v3 kit hand-off — discrepancies + the daemon contract to wire against

Thanks — the kit now mirrors the real model well. `model.jsx` matches the engine's `project` dict
almost exactly, the 3-tier waterfall / two fade lanes / accumulate badges / locked timing / AI
presence all map to real concepts, and all 7 open questions are answered in-brand.

**The one real problem is on our side, not yours:** the daemon's current read surface is *lossy* — it
cannot reproduce the model your kit consumes. So the kit is built against the right shape, but the
backend doesn't yet hand that shape over. This doc lists the exact discrepancies and then specifies
the **corrected daemon contract** to wire `model.jsx` against. Nothing in your kit's *shape* needs to
change; the changes are (1) we extend the daemon, (2) you point the resolvers/edit-fns at it.

---

## Part 1 — Actual discrepancies (kit expectation → engine reality)

### 1.1 🔴 The `/ws` push and `GET /api/state` send a *summary*, not the project
What's pushed today (`get_state`):
```jsonc
{ "n_events": 2, "n_words": 11,
  "globals": { /* full global style+placement */ },
  "fade_defaults": { "fade_in_ms":250, "fade_out_ms":1000, "linger":0.0 },
  "events": [ { "gi":0, "label":"Verse 1", "win":[0.30,3.10], "accumulate":"words",
                "style_overrides": {"fontsize":72}, "n_words":5 }, ... ] }
```
Your kit needs `words[]`, `layout[].lines[].toks[]`, `fin_tags`/`fout_tags`, `palette`,
`globalStyle`. None of `toks`, fade groups, or palette appear above. **A single push can't drive the
UI today.**

### 1.2 🔴 Fade groups expose only `ids` — no `color`, `trigger`, or `dur`
`get_word` returns:
```jsonc
{ "fade_in_group": [0,1,2], "fade_out_group": null, ... }   // ids only
```
Your `FadeCell` needs **`color`** (the palette band), **`trigger`** + **`dur`** (the `@trig / dur`
text and the inherited-grey vs overridden-solid styling), and your `FadeGroupPanel` needs
trigger/dur to *edit*. There is **no read tool that returns `fin_tags`/`fout_tags`** with their
props at all.

### 1.3 🔴 Merged tokens are collapsed to their first word
The event view builds a line word as `text = words[ids[0]].text` and drops `sep` + the extra ids. A
merged token `{ids:[6,7], sep:" "}` ("up in") comes back as just **"up"**. Your "merged" glyph +
joined text have no source. (Internal fix is trivial — the renderer already has `token_text()` — but
flagging so you know today's `get_group`/`get_state` *cannot* show merges.)

### 1.4 🔴 `palette` is never returned by any tool
`project["palette"]` (the 10 group/fade-band colors) isn't in `get_state`, `get_group`, or anywhere.
Your fade bands and per-event group color have no source.

### 1.5 🟡 Global style lives in `cfg`, not in the project
You folded `globalStyle` into the project object. In the engine the global style+placement is **not
part of `project`** — it's the daemon's `get_globals()` (a.k.a. the build `cfg`). This is fine, but
the GLOBAL tier must **read from / write to `get_globals`/`set_globals`**, *not* persist into project
state. Mapping is clean (see §2.2).

### 1.6 🟡 Edit-tool shape mismatches (wiring translations, not redesigns)
- `merge_words` is **`merge_words(gi, li, ti, sep)`** — merges token `ti` with its left neighbor.
  Your kit merges an arbitrary multi-selection. Wire "merge selection" → a sequence of adjacent
  merges (left-to-right over the contiguous run).
- `split_event(gi, line_index)` and `break_line(gi, li, ti, after)` **exist** in the engine but your
  `OpsToolbar` doesn't expose them. Add buttons if you want full structural parity.
- `ungroup_event(gi)` is governed by the engine; don't assume the kit's `accumulate:"off"` solo
  behavior — call the tool and re-render from the push.

### 1.7 ⚪ Cosmetic
- Fade-in default trigger: engine uses `min(raw start)` of members; kit uses `min(appearance)`.
  Differs only under `accumulate:"lines"/"off"`. Safe to ignore.
- `resolveStyle` in the kit checks `tok.style` for **all** keys incl. `border_style`; the engine
  resolves `border_style` group→global only. Harmless (CUE keys exclude it) — optionally add the
  guard to match exactly.
- **Palette values differ** (your saturated synthwave set vs. the engine's muted set). Open decision
  in §3.

---

## Part 2 — The daemon contract to wire against (what *will* be supported)

We add **one read tool, `get_project()`**, and make it the **`/ws` push payload + `GET /api/state`
body**. It returns the project **verbatim** (so your `model.jsx` shape is a 1:1 wire) plus the global
style, placement, and palette. Everything your kit needs comes from this one message; detail tools
(`get_group`, `get_word`) stay available but become optional.

### 2.1 `GET /api/state`  ·  `/ws` push  →  full project
`/ws` connect + every change pushes `{ "type":"state", "state": <below> }`. `GET /api/state` returns
`<below>` directly.
```jsonc
{
  "words": [ { "text":"Caught", "start":0.30, "end":0.70 }, ... ],   // immutable; id = index (wid)

  "layout": [
    { "label":"Verse 1", "accumulate":"words",
      "win_start": null, "win_end": null, "linger": null, "del": false,
      "style": { "fontsize":72 },                                    // group overrides (≤10 keys)
      "lines": [ { "toks": [
        { "ids":[0],   "sep":"",  "del":false, "style": {} },
        { "ids":[6,7], "sep":" ", "del":false, "style": {} }         // merged token; join ids with sep
      ] } ] }
  ],

  "fin_tags":  [ { "ids":[0,1,2], "color":0, "trigger":null,  "dur":null } ],   // fade-IN groups
  "fout_tags": [ { "ids":[3,4],   "color":1, "trigger":15.40, "dur":600  } ],   // fade-OUT groups
  //   color = index into palette; trigger (sec)|null=auto; dur (ms)|null=inherit global default

  "globals":      { "fade_in_ms":250, "fade_out_ms":1000, "linger":0.0 },       // TIMING defaults
  "global_style": { "font":"Space Grotesk", "fontsize":64, "bold":true,
                    "primary":"#FFFFFF", "outline":"#000000", "back":"#000000",
                    "back_alpha":"80", "outline_w":3, "shadow":0, "border_style":1 },
  "placement":    { "align":2, "play_w":1920, "play_h":1080,
                    "margin_l":60, "margin_r":60, "margin_v":60,
                    "use_pos":false, "pos":null },                              // pos:[x,y]|null
  "palette": [ "#7a4a4a", "#4a7a4a", ... ]                                       // exactly 10
}
```
This is **identical to `INITIAL_PROJECT` in `model.jsx`** except: `globalStyle` is renamed
`global_style`, and two engine-authoritative blocks are added — `placement` (you already show these
statically in `ControlsRail`) and `palette`. Your `tokText`, `resolveStyle`, `eventWindow`,
`wordSchedule`, `fadeTagOf` all consume this with **no shape change**.

### 2.2 GLOBAL-tier mapping (read & write)
| Kit field | Source in push | Edit tool |
|---|---|---|
| `globalStyle.*` (10 style keys) | `state.global_style` | `set_globals({ <key>: value })` |
| timing (`fade_in_ms` etc.) | `state.globals` | `set_fade_defaults({ ... })` |
| placement (align/canvas/margins/pos) | `state.placement` | `set_globals({ <key>: value })` |
`get_globals()` returns the union of `global_style` + `placement` + a couple of extras (`fade_ms`,
`wrap_style`) using these exact key names (`primary/outline/back`, not `*_color`). **Write GLOBAL
edits via `set_globals`** — do not keep them in project state.

### 2.3 Edit-tool surface (each mutates the shared session → triggers a full `/ws` push)
Call as `POST /api/call { "tool": "<name>", "args": { ... } }`. After the call, **discard local
optimistic state and re-render from the next `/ws` push** (one shared undo/redo timeline; an AI agent
edits the same session).

| Kit edit fn | Tool call |
|---|---|
| `setStyle("group", k, v)` | `set_group_style(gi, { [k]: v })` |
| `setStyle("cue", k, v)` | `set_cue_style(word_ids, { [k]: v })` |
| `setStyle("global", k, v)` | `set_globals({ [k]: v })` |
| `clearStyle("group", k)` | `set_group_style(gi, { [k]: null })` |
| `clearStyle("cue", k)` | `set_cue_style(word_ids, { [k]: null })` |
| `groupFade("in"\|"out")` | `make_fade_tag(kind, word_ids)` |
| `clearFade(kind)` | `clear_fade_tag(kind, word_ids)` |
| `setFadeProps(kind, {trigger,dur})` | `set_fade_tag_props(kind, word_ids, trigger?, dur?)` — ids must be ONE group |
| `setLayoutProp(patch)` | `set_layout_props(gi, win_start?, win_end?, linger?, accumulate)` |
| `mergeWords(selection)` | one or more `merge_words(gi, li, ti, sep)` over the contiguous run |
| `mergeEvents` | `merge_events([gi, gi+1])` |
| `ungroupEvent` | `ungroup_event(gi)` |
| *(new)* split event | `split_event(gi, line_index)` |
| *(new)* break line | `break_line(gi, li, ti, after)` |
| `deleteSel` | `delete_words(word_ids)` / `restore_words(word_ids)` |
| undo / redo | `undo()` / `redo()` |

**`null` clears an override** (back to inherit). Style override dicts: group accepts all 10 keys; cue
accepts 9 (no `border_style` — box-mode is a group decision, exactly as your CUE tier already omits).

### 2.4 Preview / export (already aligned with your Live/Exact design)
- `GET /api/render` → render-groups (your `wordSchedule`/`eventWindow` already match this shape:
  `start_s, end_s, fin_ms, fout_at|null, fout_ms, style` per word). Use for the **Live (CSS approx)**
  overlay.
- `GET /api/frame?t=<sec>` → **PNG** (libass). Use for **Exact** + "Render exact frame @ t".
- `GET /api/ass` → the `.ass` text.
- `POST /api/burn {out, video_in?}` → `{job_id}`; `GET /api/burn/{job_id}` →
  `{frac, done, ok, err, out}`. Progress also arrives on `/ws` as `{type:"burn", job}`.

### 2.5 Project library (unchanged — your shape maps directly)
`GET /api/projects` → names · `POST /api/projects/new {name, lyrics_path}` ·
`POST /api/projects/open {name}` · `POST /api/projects/save {name}`. Each project is a self-contained
folder; opening triggers a full `/ws` push.

### 2.6 Auth / origin
Loopback bind (`127.0.0.1`). Optional `Authorization: Bearer <KSS_MCP_TOKEN>` on `/api` + `/mcp`.
CORS allows the Vite dev origin (`127.0.0.1:5173`).

---

## Part 3 — One decision we need from you

**Palette.** The group/fade-band colors live in `project.palette` (engine-authored, 10 entries). Your
kit ships a more saturated synthwave set. Pick one:
- **(a)** We update the engine `PALETTE` to your 10 brand hexes — every client gets brand colors. *(Recommended.)*
- **(b)** UI ignores `state.palette` and uses its own constant — engine palette stays muted, only the
  web UI shows brand colors (CTk app + MCP-driven renders won't match).

Send the 10 hexes (in order) if (a).

---

## TL;DR
- Your kit's **model shape is correct** — keep it.
- We add **`get_project()`** = the full project verbatim + `global_style` + `placement` + `palette`,
  and make it the **`/ws` push + `GET /api/state`** body. That single message drives the whole UI.
- We fix the **merged-token text** and surface **fade-tag `color/trigger/dur`** + **palette** (all
  folded into `get_project`).
- You: point `model.jsx` resolvers at the push, swap the edit fns for `POST /api/call` per §2.3, read
  the GLOBAL tier from `global_style`/`placement` and write via `set_globals`, and (optionally) add
  split-event / break-line buttons.
- Answer the **palette** decision in Part 3.
