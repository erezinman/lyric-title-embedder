# Engine UI-decoupling + fade-duration waterfall + `get_project` (Spec A.1)

**Date:** 2026-06-03
**Status:** Approved for planning (pending user review)
**Branch:** `feat/react-ui`
**Parent:** `2026-06-03-engine-daemon-design.md` (Spec A). **Unblocks:** Spec B (React/Vite v3 UI).
**Driver:** the v3 kit contract (`design-system/HANDOFF_daemon-contract.md`) + a UI-leakage audit of
the engine.

## Context

The daemon must feed a web UI off **one shared session**, and the engine must be a clean backend:
it serves the WebSocket state and **carries no UI-only data**. A three-layer audit (engine, CTk app,
web kit) found the engine leaks several presentation concerns into its model/config, none of which
the `.ass`/render path consumes. Separately, the user wants **fade-in/out durations to be
overridable** — today they're only global or bound to a fade *group*.

This addendum does three things, engine-first:
1. **Decouple UI from the engine** — remove color/palette and dead/ignored config so the engine is
   purely functional.
2. **Promote fade duration to a `global < group` waterfall** — a first-class, inheritable override.
3. **Add `get_project`** — the minimal, fully-functional payload that drives the web UI over `/ws`.

Clients (native CTk, web) own all presentation, including colors, and adapt as thin views.

## UI-leakage audit (engine → verdict)

| Field | Where | Read by `.ass`/render? | Verdict |
|---|---|---|---|
| `project["palette"]` (10 hexes) | model.py:40, io.py:5/24, mutations.py:7 | No (only `len()` for tint cycling) | Remove — UI-owned |
| fade-tag `color` | mutations `_next_color`, io.py:15/17 | No | Remove — UI-owned |
| fade-tag `dur` | io.py:15/17, render.py:49/55 | Yes, but **superseded** by the new fade waterfall | Replace with waterfall |
| `cfg["fade_ms"]` (+ `fade_var` slider) | context.py:12/46, app_base.py:160/190/658 | **No** — render uses `project["globals"]["fade_in_ms"/"fade_out_ms"]` | Remove — ignored override (dead control) |
| `cfg["wrap_style"]` | context.py:12/50 | **No** — `ass.py:82` hardcodes `WrapStyle: 2` | Remove — dead |
| `get_globals()["use_pos"]` | context.py:12/51 | Indirect (gates `pos`) | **Keep internal**, derivable from `pos`; **excluded from the WS feed** (see below) |
| tool `resolved_style` | tools.py:29/73 | No (render recomputes; kit has its own resolver) | Keep on detail tools; **excluded from the WS feed** |

`app_base.App._build_ass` is abstract (app_base.py:253); the only concrete renderer is
`AppV2._build_ass` → the engine, which reads `project["globals"]` for fade defaults. So `fade_ms` is
read by **no** renderer product-wide. Removing it (and its orphan slider) is a bug-fix: the working
global fade controls are the cue dock's `g_fin`/`g_fout` → `set_fade_defaults` → `project["globals"]`.

## Decisions (locked)

| Topic | Decision |
|---|---|
| Color | Engine stores **no** colors. Remove `project["palette"]` and fade-tag `color`. Each client maps a fade-group/event **index** → a hex from its own palette. |
| Dead config | Remove `cfg["fade_ms"]` (+ the `fade_var` slider) and `cfg["wrap_style"]` from the engine config and the CTk app. |
| `use_pos` | Stays as live CTk widget state; **not** exposed on the WS feed. Web derives free-placement from `pos != null`. (Full `use_pos`→`pos` collapse deferred — entangled with CTk box-drag.) |
| Fade duration | New **`global < group`** waterfall. Layout groups gain an optional **`fade`** dict `{fade_in_ms?, fade_out_ms?}`; absent ⇒ inherit `project["globals"]`. **No cue tier** (group-only, like `border_style`). |
| Fade tags | Narrowed to **`{ids, trigger}`** — synchronize start/fire time only. `dur` → waterfall; `color` → UI. |
| New tool | `get_project(ctx)` = project verbatim (incl. group `style` + `fade`) + `global_style` + `placement`. JSON-safe (tag `ids` listified). The `/api/state` + `/ws` payload. |
| `get_state` | Kept for the MCP surface / existing tests; no longer the web channel. |
| Merged tokens | `_event_view` uses `core.token_text` and includes `ids`/`sep` (detail tools stop collapsing merges). |
| Back-compat | `apply_cues` ignores any `palette`, tag `color`, tag `dur`, `fade_ms`, `use_pos` present in old saved projects. |

## Fade-duration waterfall

New, in `engine/model.py`:
```python
FADE_KEYS = ["fade_in_ms", "fade_out_ms"]

def resolve_fade(group, gtiming):
    """group['fade'] override, else the global timing defaults. group-only (no cue tier)."""
    gf = (group or {}).get("fade") or {}
    return {k: (gf[k] if gf.get(k) is not None else gtiming[k]) for k in FADE_KEYS}
```
`render.py` (`project_to_render`): for each layout group, compute
`gf = resolve_fade(g, {"fade_in_ms": g_fin, "fade_out_ms": g_fout})` once, then use
`gf["fade_in_ms"]` / `gf["fade_out_ms"]` for every token's fade-in / fade-out duration **instead of**
the per-tag `dur`. Fade tags still set the *trigger* (appearance/fire time); fade-out is still opt-in
via a `fout_tag`. `make_project` adds `"fade": {}` to each group.

New mutation + tools:
- `engine/mutations.py`: `set_group_fade(project, gi, partial)` (mirrors `set_group_style`; a `None`
  value clears a key). `make_tag` → `{"ids": ids, "trigger": None}` (no `color`/`dur`); remove
  `_next_color`. `set_tag_props` sets **trigger only** (drop `dur`).
- `mcp_server/tools.py`: `set_group_fade(ctx, gi, partial)`; `set_fade_tag_props(ctx, kind, word_ids,
  trigger)` (drop `dur`).
- `mcp_server/server.py`: register `set_group_fade`; update `set_fade_tag_props` signature.

## The `get_project` payload (authoritative — the WS feed)

```jsonc
{
  "words":  [ {"text":"Caught","start":0.30,"end":0.70}, ... ],          // verbatim; id = index
  "layout": [ { "label":"Verse 1", "accumulate":"words",
                "win_start":null, "win_end":null, "linger":null, "del":false,
                "style": {...},                                          // group style overrides (≤10)
                "fade":  {"fade_in_ms":400},                             // group fade overrides (0–2 keys)
                "lines": [ { "toks": [
                  {"ids":[0],   "sep":"",  "del":false, "style":{}},
                  {"ids":[6,7], "sep":" ", "del":false, "style":{}}      // merged token, verbatim
                ] } ] } ],
  "fin_tags":  [ {"ids":[0,1,2], "trigger":null } ],                     // ids sorted list; NO color/dur
  "fout_tags": [ {"ids":[3,4],   "trigger":15.40} ],
  "globals":      {"fade_in_ms":250,"fade_out_ms":1000,"linger":0.0},    // timing (the global fade tier)
  "global_style": {"font":"...","fontsize":64,"bold":true,"primary":"#FFFFFF","outline":"#000000",
                   "back":"#000000","back_alpha":"80","outline_w":3,"shadow":0,"border_style":1},
  "placement":    {"align":2,"play_w":1920,"play_h":1080,
                   "margin_l":80,"margin_r":80,"margin_v":60,"pos":null} // NO use_pos
}
```
Excluded from the feed (UI-owned or derived): `palette`, tag `color`/`dur`, `resolved_style`,
`fade_ms`, `wrap_style`, `use_pos`.

**Derivations:** `global_style` = `{k: get_globals()[k] for k in STYLE_KEYS}`;
`placement` = `{k: get_globals().get(k) for k in ["align","play_w","play_h","margin_l","margin_r","margin_v","pos"]}`;
`globals` = `project["globals"]`; `words`/`layout` deep-copied (JSON-safe); tags =
`{"ids": sorted(t["ids"]), "trigger": t.get("trigger")}`.

## Files

**Engine:**
- `engine/model.py` — remove `PALETTE`; add `FADE_KEYS`, `resolve_fade`; `make_project` drops
  `"palette"`, adds `"fade": {}` per group.
- `engine/mutations.py` — remove `_next_color`; `make_tag` → `{ids, trigger}`; `set_tag_props`
  trigger-only; add `set_group_fade`.
- `engine/render.py` — use `resolve_fade` per group; stop reading tag `dur`.
- `engine/io.py` — `serialize_cues`: drop `palette`; groups include `fade`; tags `{ids, trigger}`.
  `apply_cues`: drop `palette`; read group `fade`; tags with `.get("trigger")`; ignore legacy
  `color`/`dur`/`fade_ms`/`use_pos`.

**Daemon / tools:**
- `mcp_server/tools.py` — add `get_project`; add `set_group_fade`; `set_fade_tag_props` trigger-only;
  fix `_event_view` (use `core.token_text`, include `ids`/`sep`).
- `mcp_server/server.py` — register `get_project`, `set_group_fade`; update `set_fade_tag_props`.
- `mcp_server/context.py` — `DEFAULT_GLOBALS`/`GLOBAL_KEYS`/`cfg()`: remove `fade_ms`, `wrap_style`;
  `cfg()` injects `pos` on `if g.get("pos")`. `UIContext.get_globals`/`set_globals`: drop `fade_ms`
  (and its `fade_var` ref).
- `daemon/api.py` — `state` handler + `/ws` on-connect send use `get_project`.
- `daemon/context.py` — `DaemonContext._fire` broadcasts `get_project`.

**Native client (owns its colors; loses the dead fade slider):**
- `app_base.py` — remove the `fade_var` slider + `fade_ms`/`wrap_style` from `cfg`/save/load.
- `karaoke_subtitle_gui.py` — color fade rows by tag **index** in `fin_tags`/`fout_tags` into
  `th["palette"]` (was `t["color"]`, ~442/451); events by `gi % len(th["palette"])` (was
  `len(p["palette"])`, ~463); move the dark-theme hexes into the CTk theme (was
  `engine.model.PALETTE`, gui:39); surface the new group `fade` override in the editor; the per-tag
  duration control now edits the group `fade` override (tag keeps only `trigger`).

## Testing

Headless (fast, per task — `tests/test_engine_*`, `tests/test_mcp.py`):
- **Mutations:** `make_tag("fin_tags",{0,1,2})` → `{"ids":{0,1,2},"trigger":None}` with **no `color`/`dur`**.
  `set_group_fade(p,0,{"fade_in_ms":400})` sets `p["layout"][0]["fade"]["fade_in_ms"]==400`;
  `{"fade_in_ms":None}` clears it.
- **resolve_fade:** group override wins; absent ⇒ global. `resolve_fade({"fade":{"fade_out_ms":50}},
  {"fade_in_ms":250,"fade_out_ms":1000}) == {"fade_in_ms":250,"fade_out_ms":50}`.
- **render:** a token in a group with `fade.fade_in_ms=400` gets `fin_ms==400`; siblings without
  override get the global. A fade tag with only `trigger` set still drives appearance; durations come
  from the waterfall (no `dur` anywhere in render-group output beyond `fin_ms`/`fout_ms`).
- **io round-trip:** `serialize_cues` has no `palette`, tags have no `color`/`dur`, groups carry
  `fade`; `apply_cues(p, json.loads(json.dumps(serialize_cues(p))))` restores layout+tags+style+fade.
  **Back-compat:** `apply_cues` succeeds on a dict still carrying `palette`, tag `color`/`dur`,
  `fade_ms` (all ignored).
- **get_project:** keys exactly `{words, layout, fin_tags, fout_tags, globals, global_style,
  placement}` — no `palette`/`resolved_style`. `global_style` has the 10 `STYLE_KEYS`; `placement`
  has `align/play_w/play_h/margin_*/pos` and **no `use_pos`**. `layout[0]` has `style` + `fade` +
  `lines[].toks[]` with `ids/sep/del/style`. Fade tags are `{ids:list, trigger}`. `json.dumps`
  succeeds.
- **Merged-token:** after `merge_words`, `get_group(gi)` shows the merged line word `text` joined,
  `ids` length 2.

Daemon (`starlette.TestClient`):
- `GET /api/state` body has `"words"`+`"layout"`, no `"palette"`.
- A `/ws` client, after `POST /api/call set_group_fade`, receives `{type:"state"}` whose `state`'s
  group carries the new `fade` override.

CTk (batched at end per the defer-UI-tests workflow): editor launches; fades/events color from the
theme palette by index (no `KeyError` on removed `color`/`palette`); the global fade slider is gone;
group fade override is editable.

## Verification

1. `python -m daemon --port 8770`; `curl 127.0.0.1:8770/api/state | python -m json.tool` → full
   project, no `palette`/`use_pos`, fade tags `{ids,trigger}`, groups carry `fade`.
2. `POST /api/call set_group_fade {gi,partial}` → next `/ws` push reflects it; a frame at a fade
   boundary shows the overridden duration.
3. CTk app launches, colors groups/fades from its own theme palette, no dead fade slider.
4. Headless + daemon suites green; UI suites at the batch gate.

## Designer follow-up (not blocking)

Web kit: drop `color` from the fade-tag model (derive band color from fade-group index into the kit's
own `PALETTE`); drop `palette` from `INITIAL_PROJECT` (use the kit constant); read the new group
`fade` override and show `fade_in_ms`/`fade_out_ms` as group-tier rows (no cue tier) — reuse the
existing `PropRow`/`Tier`; the per-tag duration control moves to the group fade override (tag keeps
only `trigger`); derive `use_pos` from `pos != null`.

## Out of scope

The React/Vite UI (Spec B), per-cue fade overrides, placement-editing UX + the full `use_pos`→`pos`
collapse, diff-based pushes, the Tauri shell (Spec C), the self-contained word model / manual word
edits (Spec 2).
