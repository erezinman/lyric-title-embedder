# Daemon `get_project` addendum (Spec A.1) — serve the full project to the web UI

**Date:** 2026-06-03
**Status:** Approved for planning (pending user review)
**Branch:** `feat/react-ui`
**Parent:** `2026-06-03-engine-daemon-design.md` (Spec A). **Unblocks:** Spec B (React/Vite v3 UI).
**Driver:** `design-system/HANDOFF_daemon-contract.md` — the contract the v3 kit now wires against
(designer round-trip complete; kit is a 1:1 wire to the payload below).

## Context

Spec A's daemon pushes a **summary** (`tools.get_state`) over `/ws` and `GET /api/state`:
`{n_events, n_words, globals, fade_defaults, events:[{gi,label,win,accumulate,style_overrides,n_words}]}`.
The v3 web UI (`design-system/ui_kits/desktop-app/model.jsx`) drives entirely off the **full project
dict** — `words`, `layout[].lines[].toks[]`, `fin_tags`/`fout_tags`, `palette`, `global_style`,
`placement`. The summary is lossy in four ways (no per-token/line/cue detail, no fade-tag
`color/trigger/dur`, merged tokens collapsed to their first word, no palette). This addendum closes
that gap so a single push drives the whole UI.

This is **daemon + engine only**. No UI code (that's Spec B). The CTk app and MCP surface are
untouched except for the shared, additive `get_project` tool and the palette constant.

## Decisions (locked — from the agreed contract)

| Topic | Decision |
|---|---|
| New read tool | Add **`tools.get_project(ctx)`** returning the project **verbatim** + `global_style` + `placement` + `palette`. JSON-safe (tag `ids` listified). |
| State channel | `GET /api/state` and the `/ws` push (`DaemonContext._fire`, plus the on-connect send) switch from `get_state` to **`get_project`**. Payload stays `{type:"state", state:<get_project>}`. |
| `get_state` | **Kept** (still used by the MCP surface / existing tests); no longer the web state channel. |
| Merged-token fix | `_event_view` line words use **`core.token_text`** for `text` and include the token's **`ids`** and **`sep`** (detail tools `get_group`/`list_groups` stop collapsing merges). |
| Palette | Adopt the **10 brand band-colors** (designer decision (a)) as `engine.model.PALETTE`. |
| GLOBAL split | `get_globals()` is split into `global_style` (the 10 `STYLE_KEYS`) and `placement` (the rest). Writes still go through `set_globals`. |

## The `get_project` payload (authoritative)

```jsonc
{
  "words":  [ {"text":"Caught","start":0.30,"end":0.70}, ... ],          // verbatim; id = index
  "layout": [ { "label":"Verse 1", "accumulate":"words",
                "win_start":null, "win_end":null, "linger":null, "del":false,
                "style": {...},                                          // group overrides
                "lines": [ { "toks": [
                  {"ids":[0],   "sep":"",  "del":false, "style":{}},
                  {"ids":[6,7], "sep":" ", "del":false, "style":{}}      // merged token, verbatim
                ] } ] } ],
  "fin_tags":  [ {"ids":[0,1,2], "color":0, "trigger":null,  "dur":null} ],   // ids = sorted list
  "fout_tags": [ {"ids":[3,4],   "color":1, "trigger":15.40, "dur":600 } ],
  "globals":      {"fade_in_ms":250,"fade_out_ms":1000,"linger":0.0},        // timing (project)
  "global_style": {"font":"...","fontsize":64,"bold":true,"primary":"#FFFFFF","outline":"#000000",
                   "back":"#000000","back_alpha":"80","outline_w":3,"shadow":0,"border_style":1},
  "placement":    {"align":2,"play_w":1920,"play_h":1080,
                   "margin_l":80,"margin_r":80,"margin_v":60,"use_pos":true,"pos":null},
  "palette": [ "#7A3A5A", "#5A4A7A", ... ]                                    // exactly 10
}
```

**Key derivations:**
- `global_style` = `{k: get_globals()[k] for k in STYLE_KEYS}` (the 10 style keys — names already
  `primary/outline/back` in `get_globals`).
- `placement` = `{k: get_globals()[k] for k in ["align","play_w","play_h","margin_l","margin_r","margin_v","use_pos","pos"]}`
  (`pos` may be absent in `get_globals` when unset → default `None`).
- `globals` = `project["globals"]` (timing only).
- `words`/`layout` = the live project's, deep-copied so the response is JSON-safe and never aliases
  session state.
- `fin_tags`/`fout_tags` = each tag copied with `ids` as a **sorted list** (project may hold sets;
  sets are not JSON-serializable) and `color`/`trigger`/`dur` passed through.
- `palette` = `project["palette"]`.

## The brand palette (engine.model.PALETTE)

Replace the current muted 10-entry `PALETTE` with (order = `--cue-1 … --cue-10`):
```
#7A3A5A  #5A4A7A  #3A5A7A  #5A7A3A  #7A6A3A  #3A7A7A  #7A4A4A  #6A3A7A  #3A6A7A  #7A5A3A
```
`make_project` already copies `list(PALETTE)` into each project, so new projects pick this up; the
web UI reads `state.palette`, so every client (web, CTk via render, MCP-driven burns) matches.

## Files

- **Modify** `engine/model.py` — replace `PALETTE` with the 10 brand hexes.
- **Modify** `mcp_server/tools.py` — add `get_project(ctx)`; fix `_event_view` to use
  `core.token_text` and include `ids`/`sep`.
- **Modify** `daemon/api.py` — `state` handler + the `/ws` on-connect send use `get_project`.
- **Modify** `daemon/context.py` — `DaemonContext._fire` broadcasts `get_project` (not `get_state`).
- **Modify** `mcp_server/server.py` — register `get_project` as an MCP tool (parity with the rest).
- **Test** `tests/test_mcp.py` (headless) — `get_project` shape; merged-token detail fix; palette.
- **Test** `tests/test_daemon.py` — `GET /api/state` is the full project; `/ws` push after an edit
  carries the full project; tag `ids` are JSON lists.

## Testing

Headless (`tests/test_mcp.py`, fast — per the defer-UI-tests workflow these run per task):
- After `load_lyrics`, `get_project` returns a dict with keys
  `words, layout, fin_tags, fout_tags, globals, global_style, placement, palette`.
- `global_style` has exactly the 10 `STYLE_KEYS`; `placement` has `align/play_w/play_h/margin_*/use_pos`.
- `layout[0]["lines"][0]["toks"][0]` has `ids`/`sep`/`del`/`style`.
- After `make_fade_tag("in", [0,1,2])` then `set_fade_tag_props("in",[0,1,2],trigger=2.0,dur=300)`,
  `get_project()["fin_tags"][0]` is `{"ids":[0,1,2],"color":0,"trigger":2.0,"dur":300}` and
  `ids` is a `list` (JSON round-trips via `json.dumps`).
- Merged-token: after `merge_words` joining two adjacent words, `get_group(gi)` shows the merged
  line word's `text` as the joined string and its `ids` length 2 (regression for the collapse).
- `engine.model.PALETTE[0] == "#7A3A5A"` and a fresh `make_project` yields
  `project["palette"][0] == "#7A3A5A"`.

Daemon (`tests/test_daemon.py`, `starlette.TestClient`):
- `GET /api/state` body has `"words"` and `"layout"` (i.e., it's the full project, not the summary).
- A `/ws` client, after a `POST /api/call set_group_style`, receives `{type:"state"}` whose
  `state` has `"layout"` and the edited group's `style`.
- `json.dumps(get_project)` succeeds (no set leakage).

## Verification

1. `python -m daemon --port 8770`; `curl 127.0.0.1:8770/api/state | python -m json.tool` shows the
   full project (words/layout/fin_tags/global_style/placement/palette).
2. A fade group edited via `/api/call set_fade_tag_props` is reflected in the next `/ws` push with
   `color/trigger/dur`.
3. Existing headless + daemon suites stay green; UI/MCP-UI suites deferred to the batch gate.

## Out of scope

The React/Vite UI (Spec B), placement-editing UX, diff-based pushes, the Tauri shell (Spec C), and
the self-contained word model / manual word edits (Spec 2).
