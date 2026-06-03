# Engine UI-decoupling + fade-duration waterfall + `get_project` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the engine a UI-agnostic backend that serves a minimal functional `get_project` over the daemon WS, and promote fade-in/out duration to a `global < group` waterfall.

**Architecture:** Engine drops presentation data (`palette`, fade-tag `color`, dead `fade_ms`/`wrap_style`). Fade duration moves off fade tags (now `{ids, trigger}`) into a per-group `fade` override dict resolved against `project["globals"]`. A new `get_project` tool returns the project verbatim + `global_style` + `placement` and becomes the `/api/state` + `/ws` payload. Native CTk and web clients own their colors and adapt as views.

**Tech Stack:** Python 3 (stdlib), `engine/` package, `mcp_server/` (FastMCP), `daemon/` (Starlette), CustomTkinter (CTk client). Tests are stdlib scripts run via `.venv/bin/python tests/<file>.py` (exit 0 = pass), registered in each file's `ACTIVE` list.

**Conventions for every task:**
- Tests use the project idiom: write a `def t_<name>(): ... return (ok, detail)` function and append it to the file's `ACTIVE` list. Run with `.venv/bin/python tests/<file>.py`; expect `N/N passed` and exit 0.
- Per the defer-UI-tests workflow, run only the **headless** suites per task: `test_engine.py`, `test_engine_model.py`, `test_engine_mutations.py`, `test_engine_build_io.py`, `test_mcp.py`, `test_mcp_server.py`, `test_daemon.py`. The Tk UI suites (`test_v2_ui.py`, `test_ui_*.py`, `test_mcp_ui.py`) are run **once** in Task 10.
- "Once a test is written, do not alter it unless failure means a bad test." Where this plan updates an existing assertion, it is a deliberate model change (e.g. tags no longer have `color`/`dur`) — that is a valid reason to change the test.

---

### Task 1: Fade-waterfall primitives in the engine model

**Files:**
- Modify: `engine/model.py` (add `FADE_KEYS`, `resolve_fade`; `make_project` adds `"fade": {}` per group)
- Test: `tests/test_engine_model.py`

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_engine_model.py` (and append both names to `ACTIVE`):

```python
def t_resolve_fade_group_overrides_global():
    from engine.model import resolve_fade
    gt = {"fade_in_ms": 250, "fade_out_ms": 1000}
    got = resolve_fade({"fade": {"fade_out_ms": 50}}, gt)
    return (got == {"fade_in_ms": 250, "fade_out_ms": 50}, got)

def t_make_project_groups_have_empty_fade():
    p = fresh()
    ok = all(g.get("fade") == {} for g in p["layout"])
    return (ok, [g.get("fade") for g in p["layout"]][:3])
```

(If `fresh()` is not already defined in this file, add the same helper used in `tests/test_engine_mutations.py`: `def fresh(): return engine.make_project(CFG)` with the CFG dict copied from that file.)

- [ ] **Step 2: Run to verify they fail**

Run: `.venv/bin/python tests/test_engine_model.py`
Expected: FAIL — `resolve_fade` import error / groups have no `fade` key.

- [ ] **Step 3: Implement in `engine/model.py`**

After the `CUE_STYLE_KEYS = ...` line, add:

```python
FADE_KEYS = ["fade_in_ms", "fade_out_ms"]


def resolve_fade(group, gtiming):
    """Effective fade durations for a layout group: group['fade'] override falls
    back to the global timing defaults. Group-only (no cue tier)."""
    gf = (group or {}).get("fade") or {}
    return {k: (gf[k] if gf.get(k) is not None else gtiming[k]) for k in FADE_KEYS}
```

In `make_project`, change the `layout.append({...})` call to include `"fade": {}`:

```python
            layout.append({"label": sec, "lines": [line], "accumulate": "words",
                           "win_start": None, "win_end": None, "linger": None,
                           "del": False, "style": {}, "fade": {}})
```

- [ ] **Step 4: Run to verify they pass**

Run: `.venv/bin/python tests/test_engine_model.py`
Expected: PASS (`N/N passed`).

- [ ] **Step 5: Commit**

```bash
git add engine/model.py tests/test_engine_model.py
git commit -m "engine: add fade-duration waterfall primitives (FADE_KEYS, resolve_fade, group fade dict)"
```

---

### Task 2: `render.py` uses the group fade waterfall (stops reading tag `dur`)

**Files:**
- Modify: `engine/render.py` (import `resolve_fade`; compute per-group fade; use it for `fin_ms`/`fout_ms`; stop reading `ftag["dur"]`/`otag["dur"]`)
- Test: `tests/test_engine.py`

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_engine.py` (append names to its `ACTIVE`/run list; match the file's existing test idiom):

```python
def t_render_group_fade_in_override():
    p = engine.make_project(CFG)
    p["layout"][0]["fade"] = {"fade_in_ms": 400}
    groups = engine.project_to_render(p)
    w = groups[0]["lines"][0]["words"][0]
    return (w["fin_ms"] == 400, w["fin_ms"])

def t_render_group_fade_falls_back_to_global():
    p = engine.make_project(CFG)          # no group override
    groups = engine.project_to_render(p)
    w = groups[0]["lines"][0]["words"][0]
    return (w["fin_ms"] == p["globals"]["fade_in_ms"], w["fin_ms"])
```

(Use the same `CFG`/import style already present in `tests/test_engine.py`.)

- [ ] **Step 2: Run to verify they fail**

Run: `.venv/bin/python tests/test_engine.py`
Expected: FAIL — `fin_ms` is the global default, not 400 (no group-fade support yet).

- [ ] **Step 3: Implement in `engine/render.py`**

Change the import line:

```python
from engine.model import BUILTIN, _tag_of, resolve_fade
```

Inside `for g in project["layout"]:`, just after `acc = g.get("accumulate", "words")`, add:

```python
        gf = resolve_fade(g, {"fade_in_ms": g_fin, "fade_out_ms": g_fout})
```

Replace the per-token fade block (currently the `fin_ms = g_fin` ... `fo_ms = otag["dur"] ...` section) with:

```python
                fin_ms = gf["fade_in_ms"]
                ti, ftag = _tag_of(fin, wid0)
                if ftag is not None:
                    appear = ftag["trigger"] if ftag.get("trigger") is not None \
                        else min(words[i]["start"] for i in ftag["ids"] if i < len(words))
                fo_at, fo_ms = None, gf["fade_out_ms"]
                oi, otag = _tag_of(fout, wid0)
                if otag is not None:
                    fo_at = otag["trigger"] if otag.get("trigger") is not None \
                        else max(words[i]["end"] for i in otag["ids"] if i < len(words))
                    fade_ends.append(fo_at + fo_ms / 1000.0)
```

(Duration now comes only from `gf`; tags contribute the trigger only. `fade_ends.append(...)` stays inside the `if otag` block.)

- [ ] **Step 4: Run to verify they pass**

Run: `.venv/bin/python tests/test_engine.py`
Then the full headless render/io suite: `.venv/bin/python tests/test_engine_build_io.py`
Expected: PASS for both (`N/N passed`).

- [ ] **Step 5: Commit**

```bash
git add engine/render.py tests/test_engine.py
git commit -m "engine(render): resolve fade duration from the group waterfall, not tag dur"
```

---

### Task 3: `set_group_fade` mutation + tool + MCP registration

**Files:**
- Modify: `engine/mutations.py` (import `FADE_KEYS`; add `set_group_fade`)
- Modify: `mcp_server/tools.py` (add `set_group_fade`; add `fade_overrides` to `_event_view`)
- Modify: `mcp_server/server.py` (register `set_group_fade`)
- Test: `tests/test_engine_mutations.py`, `tests/test_mcp.py`

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_engine_mutations.py` (append to `ACTIVE`):

```python
def t_set_group_fade_set_and_clear():
    p = fresh()
    mut.set_group_fade(p, 0, {"fade_in_ms": 400, "fade_out_ms": 600})
    a = dict(p["layout"][0]["fade"])
    mut.set_group_fade(p, 0, {"fade_in_ms": None})
    b = dict(p["layout"][0]["fade"])
    return (a == {"fade_in_ms": 400, "fade_out_ms": 600} and b == {"fade_out_ms": 600}, (a, b))
```

Add to `tests/test_mcp.py` (append to its run list):

```python
def t_set_group_fade_tool_returns_fade_overrides():
    ctx = headless_with_project()      # use the file's existing helper to build a HeadlessContext + loaded project
    view = tools.set_group_fade(ctx, 0, {"fade_in_ms": 400})
    return (view["fade_overrides"] == {"fade_in_ms": 400}, view.get("fade_overrides"))
```

(Use the same helper `tests/test_mcp.py` already uses to create a context with a project loaded; if its name differs, match it.)

- [ ] **Step 2: Run to verify they fail**

Run: `.venv/bin/python tests/test_engine_mutations.py` then `.venv/bin/python tests/test_mcp.py`
Expected: FAIL — `set_group_fade` undefined; `_event_view` has no `fade_overrides`.

- [ ] **Step 3: Implement**

In `engine/mutations.py`, change the import line to include `FADE_KEYS`:

```python
from engine.model import STYLE_KEYS, CUE_STYLE_KEYS, FADE_KEYS
```

Add this function (next to `set_group_style`):

```python
def set_group_fade(project, gi, partial):
    """Merge partial into layout[gi]['fade']; None clears a key (inherit). Group-only."""
    gf = dict(project["layout"][gi].get("fade") or {})
    for k, v in partial.items():
        if k not in FADE_KEYS:
            continue
        if v is None:
            gf.pop(k, None)
        else:
            gf[k] = v
    project["layout"][gi]["fade"] = gf
```

In `mcp_server/tools.py`, add `"fade_overrides"` to the dict returned by `_event_view` (right after the `"style_overrides": dict(g.get("style") or {}),` line):

```python
            "fade_overrides": dict(g.get("fade") or {}),
```

And add the tool wrapper (next to `set_group_style`):

```python
def set_group_fade(ctx, gi, partial):
    _do(ctx, "set_group_fade", gi, partial); return ctx.run(lambda: _event_view(ctx, gi))
```

In `mcp_server/server.py`, register it (next to the `set_group_style` tool):

```python
    @mcp.tool()
    def set_group_fade(gi: int, partial: dict) -> dict: return tools.set_group_fade(ctx, gi, partial)
```

- [ ] **Step 4: Run to verify they pass**

Run: `.venv/bin/python tests/test_engine_mutations.py` then `.venv/bin/python tests/test_mcp.py`
Expected: PASS for both.

- [ ] **Step 5: Commit**

```bash
git add engine/mutations.py mcp_server/tools.py mcp_server/server.py tests/test_engine_mutations.py tests/test_mcp.py
git commit -m "engine: add set_group_fade mutation + tool; expose fade_overrides in event view"
```

---

### Task 4: Narrow fade tags to `{ids, trigger}` (drop `color` + `dur`)

**Files:**
- Modify: `engine/mutations.py` (`make_tag` → `{ids, trigger}`; remove `_next_color`; `set_tag_props` trigger-only)
- Modify: `mcp_server/tools.py` (`set_fade_tag_props` drops `dur`)
- Modify: `mcp_server/server.py` (`set_fade_tag_props` signature drops `dur`)
- Test: `tests/test_engine_mutations.py`, `tests/test_mcp.py`

- [ ] **Step 1: Update/add the tests (deliberate model change)**

In `tests/test_engine_mutations.py`, find any test asserting a tag has a `color` or `dur` key (e.g. in `t_complex_tag_lifecycle`) and change those assertions to the new shape. Add a focused regression:

```python
def t_make_tag_has_no_color_or_dur():
    p = fresh()
    wid = first_wid(p)
    mut.make_tag(p, "fin_tags", {wid})
    t = p["fin_tags"][0]
    return (set(t.keys()) == {"ids", "trigger"} and t["trigger"] is None, sorted(t.keys()))

def t_set_tag_props_sets_trigger_only():
    p = fresh(); wid = first_wid(p)
    mut.make_tag(p, "fin_tags", {wid})
    mut.set_tag_props(p, "fin_tags", 0, 2.5)
    t = p["fin_tags"][0]
    return (t["trigger"] == 2.5 and "dur" not in t, t)
```

In `tests/test_mcp.py`, update any `set_fade_tag_props(..., trigger=, dur=)` call to drop `dur`, and add:

```python
def t_set_fade_tag_props_trigger_only():
    ctx = headless_with_project()
    wid = 0
    tools.make_fade_tag(ctx, "in", [wid])
    tools.set_fade_tag_props(ctx, "in", [wid], trigger=1.5)
    t = ctx.session.project["fin_tags"][0]
    return (t["trigger"] == 1.5 and "dur" not in t, t)
```

- [ ] **Step 2: Run to verify they fail**

Run: `.venv/bin/python tests/test_engine_mutations.py` then `.venv/bin/python tests/test_mcp.py`
Expected: FAIL — tags still carry `color`/`dur`; `set_fade_tag_props`/`set_tag_props` still take `dur`.

- [ ] **Step 3: Implement**

In `engine/mutations.py`: delete `_next_color` entirely, and change `make_tag` + `set_tag_props`:

```python
def make_tag(project, lane, ids):
    ids = set(ids)
    if not ids:
        return
    for t in project[lane]:
        t["ids"] -= ids
    project[lane][:] = [t for t in project[lane] if t["ids"]]
    project[lane].append({"ids": ids, "trigger": None})

def set_tag_props(project, lane, ti, trigger):
    project[lane][ti]["trigger"] = trigger
```

In `mcp_server/tools.py`, change `set_fade_tag_props` to drop `dur`:

```python
def set_fade_tag_props(ctx, kind, word_ids, trigger=None):
    def f():
        lane = _LANE[kind]; tags = ctx.session.project[lane]
        tis = {_tag_of(tags, w)[0] for w in word_ids}
        if None in tis or len(tis) != 1:
            raise ValueError("set_fade_tag_props: all word_ids must belong to ONE fade group "
                             "(make_fade_tag them first)")
        return ctx.session.do("set_tag_props", lane, next(iter(tis)), trigger)
    ctx.run(f); return get_state(ctx)
```

In `mcp_server/server.py`, change the registration:

```python
    @mcp.tool()
    def set_fade_tag_props(kind: str, word_ids: list, trigger: Optional[float] = None) -> dict:
        return tools.set_fade_tag_props(ctx, kind, word_ids, trigger)
```

- [ ] **Step 4: Run to verify they pass**

Run all headless suites:
```
for f in test_engine test_engine_model test_engine_mutations test_engine_build_io test_mcp test_mcp_server test_daemon; do .venv/bin/python tests/$f.py || echo "FAILED $f"; done
```
Expected: every suite prints `N/N passed`. (`test_engine_build_io`/`test_daemon` may still assert tag `color`/`dur` in serialization — if so, those are addressed in Task 5/8; for now only confirm the four touched suites and that nothing else regressed unexpectedly. If `test_engine_build_io` fails on tag shape, proceed to Task 5 which owns it.)

- [ ] **Step 5: Commit**

```bash
git add engine/mutations.py mcp_server/tools.py mcp_server/server.py tests/test_engine_mutations.py tests/test_mcp.py
git commit -m "engine: narrow fade tags to {ids, trigger}; drop color/dur from make_tag/set_tag_props"
```

---

### Task 5: `io.py` — drop palette + tag color/dur, serialize group `fade`, back-compat reads; `make_project` drops `palette`

**Files:**
- Modify: `engine/io.py` (`serialize_cues`, `apply_cues`)
- Modify: `engine/model.py` (`make_project` return drops `"palette"`)
- Test: `tests/test_engine_build_io.py`

- [ ] **Step 1: Update/add the tests**

In `tests/test_engine_build_io.py`, update any round-trip assertions that expect `palette` or tag `color`/`dur`. Add:

```python
def t_serialize_drops_palette_and_tag_color_dur():
    import json
    p = engine.make_project(CFG)
    wid = p["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    engine.mutations.make_tag(p, "fin_tags", {wid})
    p["layout"][0]["fade"] = {"fade_in_ms": 333}
    d = engine.serialize_cues(p)
    ok = ("palette" not in d
          and d["fin_tags"][0] == {"ids": [wid], "trigger": None}
          and d["layout"][0]["fade"] == {"fade_in_ms": 333})
    json.dumps(d)  # must be JSON-safe
    return (ok, d["fin_tags"][0])

def t_apply_ignores_legacy_palette_color_dur():
    p = engine.make_project(CFG)
    legacy = engine.serialize_cues(p)
    legacy["palette"] = ["#abcdef"] * 10
    legacy["fin_tags"] = [{"ids": [0], "color": 3, "trigger": 1.0, "dur": 200}]
    ok = engine.apply_cues(p, legacy)
    t = p["fin_tags"][0]
    return (ok and set(t.keys()) == {"ids", "trigger"} and t["trigger"] == 1.0, t)
```

(Use this file's existing `CFG`/import idiom. `engine.mutations` is importable; if the file imports it differently, match it.)

- [ ] **Step 2: Run to verify they fail**

Run: `.venv/bin/python tests/test_engine_build_io.py`
Expected: FAIL — serialize still emits `palette`/`color`/`dur`; no group `fade`.

- [ ] **Step 3: Implement in `engine/io.py`**

Replace `serialize_cues` and `apply_cues` with:

```python
def serialize_cues(p):
    return {"nwords": len(p["words"]), "globals": dict(p["globals"]),
            "layout": [{"label": g["label"], "accumulate": g.get("accumulate", "words"),
                        "win_start": g.get("win_start"), "win_end": g.get("win_end"),
                        "linger": g.get("linger"), "del": g.get("del", False),
                        "style": dict(g.get("style") or {}),
                        "fade": dict(g.get("fade") or {}),
                        "lines": [{"toks": [{"ids": list(t["ids"]), "sep": t.get("sep", ""),
                                             "del": t.get("del", False),
                                             "style": dict(t.get("style") or {})}
                                            for t in ln["toks"]]} for ln in g["lines"]]}
                       for g in p["layout"]],
            "fin_tags": [{"ids": sorted(t["ids"]), "trigger": t.get("trigger")} for t in p["fin_tags"]],
            "fout_tags": [{"ids": sorted(t["ids"]), "trigger": t.get("trigger")} for t in p["fout_tags"]]}

def apply_cues(project, d):
    if not d or d.get("nwords") != len(project["words"]):
        return False
    project["globals"] = {**BUILTIN, **(d.get("globals") or {})}
    project["layout"] = [{"label": g.get("label", ""), "accumulate": g.get("accumulate", "words"),
                          "win_start": g.get("win_start"), "win_end": g.get("win_end"),
                          "linger": g.get("linger"), "del": g.get("del", False),
                          "style": dict(g.get("style") or {}),
                          "fade": dict(g.get("fade") or {}),
                          "lines": [{"toks": [{"ids": list(t["ids"]), "sep": t.get("sep", ""),
                                               "del": t.get("del", False),
                                               "style": dict(t.get("style") or {})}
                                              for t in ln["toks"]]} for ln in g["lines"]]}
                         for g in d.get("layout", [])]
    project["fin_tags"] = [{"ids": set(t["ids"]), "trigger": t.get("trigger")}
                           for t in d.get("fin_tags", [])]
    project["fout_tags"] = [{"ids": set(t["ids"]), "trigger": t.get("trigger")}
                            for t in d.get("fout_tags", [])]
    return True
```

In `engine/model.py`, change the `make_project` return to drop `palette`:

```python
    return {"words": words, "layout": layout, "fin_tags": [], "fout_tags": [],
            "globals": dict(BUILTIN)}
```

- [ ] **Step 4: Run to verify they pass**

Run the full headless set:
```
for f in test_engine test_engine_model test_engine_mutations test_engine_build_io test_mcp test_mcp_server; do .venv/bin/python tests/$f.py || echo "FAILED $f"; done
```
Expected: all `N/N passed`. (If any older test still reads `p["palette"]`, update it to the new model — palette is gone from the project.)

- [ ] **Step 5: Commit**

```bash
git add engine/io.py engine/model.py tests/test_engine_build_io.py
git commit -m "engine(io): drop palette + tag color/dur from (de)serialization, persist group fade, ignore legacy keys"
```

---

### Task 6: `get_project` tool + merged-token `_event_view` fix

**Files:**
- Modify: `mcp_server/tools.py` (`import core`; add `get_project`; fix `_event_view` line words)
- Modify: `mcp_server/server.py` (register `get_project`)
- Test: `tests/test_mcp.py`

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_mcp.py`:

```python
def t_get_project_minimal_shape():
    import json
    ctx = headless_with_project()
    pj = tools.get_project(ctx)
    keys = set(pj.keys())
    from engine.model import STYLE_KEYS
    ok = (keys == {"words", "layout", "fin_tags", "fout_tags", "globals", "global_style", "placement"}
          and set(pj["global_style"].keys()) == set(STYLE_KEYS)
          and "use_pos" not in pj["placement"]
          and "pos" in pj["placement"]
          and "fade" in pj["layout"][0] and "style" in pj["layout"][0]
          and set(pj["layout"][0]["lines"][0]["toks"][0].keys()) == {"ids", "sep", "del", "style"})
    json.dumps(pj)  # JSON-safe (no sets)
    return (ok, sorted(keys))

def t_get_project_fade_tags_have_no_color_dur():
    ctx = headless_with_project()
    tools.make_fade_tag(ctx, "in", [0, 1])
    pj = tools.get_project(ctx)
    t = pj["fin_tags"][0]
    return (set(t.keys()) == {"ids", "trigger"} and isinstance(t["ids"], list), t)

def t_event_view_merged_token_text():
    ctx = headless_with_project()
    # merge token at gi=0,li=0,ti=1 into ti=0 -> a 2-id token
    tools.merge_words(ctx, 0, 0, 1, sep=" ")
    grp = tools.get_group(ctx, 0)
    w0 = grp["lines"][0]["words"][0]
    return (len(w0["ids"]) == 2 and " " in w0["text"], w0)
```

- [ ] **Step 2: Run to verify they fail**

Run: `.venv/bin/python tests/test_mcp.py`
Expected: FAIL — `get_project` undefined; merged word `text` is only the first word and lacks `ids`.

- [ ] **Step 3: Implement in `mcp_server/tools.py`**

Add `import core` to the top imports (it currently imports `engine` only):

```python
import json, os, tempfile, threading, uuid
import core
import engine
```

Fix the `_event_view` line-word dict to use `core.token_text` and include `ids`/`sep`:

```python
            "lines": [{"li": li, "words": [{"wid": t["ids"][0], "ids": list(t["ids"]),
                        "sep": t.get("sep", ""), "text": core.token_text(words, t),
                        "start": min(words[i]["start"] for i in t["ids"]),
                        "end": max(words[i]["end"] for i in t["ids"]),
                        "deleted": t.get("del", False),
                        "style": dict(t.get("style") or {})} for t in ln["toks"]]}
                      for li, ln in enumerate(g["lines"])]}
```

Add the `get_project` tool (e.g. just after `get_render`):

```python
_PLACE_KEYS = ["align", "play_w", "play_h", "margin_l", "margin_r", "margin_v", "pos"]

def get_project(ctx):
    def f():
        from engine.model import STYLE_KEYS
        _require_project(ctx)
        p = ctx.session.project; g = ctx.get_globals()
        layout = [{"label": grp["label"], "accumulate": grp.get("accumulate", "words"),
                   "win_start": grp.get("win_start"), "win_end": grp.get("win_end"),
                   "linger": grp.get("linger"), "del": grp.get("del", False),
                   "style": dict(grp.get("style") or {}), "fade": dict(grp.get("fade") or {}),
                   "lines": [{"toks": [{"ids": list(t["ids"]), "sep": t.get("sep", ""),
                                        "del": t.get("del", False),
                                        "style": dict(t.get("style") or {})}
                                       for t in ln["toks"]]} for ln in grp["lines"]]}
                  for grp in p["layout"]]
        mk = lambda lane: [{"ids": sorted(t["ids"]), "trigger": t.get("trigger")} for t in p[lane]]
        return {"words": [dict(w) for w in p["words"]], "layout": layout,
                "fin_tags": mk("fin_tags"), "fout_tags": mk("fout_tags"),
                "globals": dict(p["globals"]),
                "global_style": {k: g[k] for k in STYLE_KEYS},
                "placement": {k: g.get(k) for k in _PLACE_KEYS}}
    return ctx.run(f)
```

In `mcp_server/server.py`, register it (next to `get_render`):

```python
    @mcp.tool()
    def get_project() -> dict: return tools.get_project(ctx)
```

- [ ] **Step 4: Run to verify they pass**

Run: `.venv/bin/python tests/test_mcp.py` then `.venv/bin/python tests/test_mcp_server.py`
Expected: PASS for both.

- [ ] **Step 5: Commit**

```bash
git add mcp_server/tools.py mcp_server/server.py tests/test_mcp.py
git commit -m "mcp: add get_project (minimal functional payload); fix merged-token text in event view"
```

---

### Task 7: `context.py` — remove dead `fade_ms`/`wrap_style`; decouple `UIContext` from `fade_var`

**Files:**
- Modify: `mcp_server/context.py` (`DEFAULT_GLOBALS`, `GLOBAL_KEYS`, `HeadlessContext.cfg`, `UIContext.get_globals`/`set_globals`)
- Test: `tests/test_mcp.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_mcp.py`:

```python
def t_headless_globals_have_no_fade_ms_or_wrap_style():
    from mcp_server.context import HeadlessContext
    g = HeadlessContext().get_globals()
    return ("fade_ms" not in g and "wrap_style" not in g, sorted(g.keys()))

def t_headless_cfg_has_no_fade_ms_or_wrap_style():
    from mcp_server.context import HeadlessContext
    c = HeadlessContext().cfg()
    return ("fade_ms" not in c and "wrap_style" not in c, sorted(c.keys()))
```

- [ ] **Step 2: Run to verify they fail**

Run: `.venv/bin/python tests/test_mcp.py`
Expected: FAIL — `fade_ms`/`wrap_style` still present.

- [ ] **Step 3: Implement in `mcp_server/context.py`**

In `DEFAULT_GLOBALS`, delete the `"fade_ms": 250, "wrap_style": 2,` entries (keep `"use_pos": True,`):

```python
DEFAULT_GLOBALS = {
    "font": "DejaVu Sans", "fontsize": 64, "bold": True, "align": 2,
    "primary_color": "#FFFFFF", "outline_color": "#000000", "back_color": "#000000",
    "back_alpha": "80", "border_style": 1, "outline_w": 3, "shadow": 0,
    "play_w": 1920, "play_h": 1080, "margin_l": 80, "margin_r": 80, "margin_v": 60,
    "use_pos": True,
}
```

In `GLOBAL_KEYS`, remove `"fade_ms"` (keep `"use_pos"`, `"pos"`):

```python
GLOBAL_KEYS = ["font", "fontsize", "bold", "align", "primary", "outline", "back",
               "back_alpha", "border_style", "outline_w", "shadow", "play_w", "play_h",
               "margin_l", "margin_r", "margin_v", "use_pos", "pos"]
```

In `HeadlessContext.cfg`, remove the `"fade_ms": g["fade_ms"],` and `"wrap_style": g["wrap_style"]` entries:

```python
    def cfg(self):
        g = self._g
        c = {"font": g["font"], "fontsize": g["fontsize"], "bold": g["bold"], "align": g["align"],
             "play_w": g["play_w"], "play_h": g["play_h"],
             "margin_l": g["margin_l"], "margin_r": g["margin_r"], "margin_v": g["margin_v"],
             "primary_color": g["primary"], "outline_color": g["outline"], "back_color": g["back"],
             "back_alpha": g["back_alpha"], "border_style": g["border_style"],
             "outline_w": g["outline_w"], "shadow": g["shadow"]}
        if g.get("use_pos") and g.get("pos"): c["pos"] = g["pos"]
        return c
```

In `UIContext.get_globals`, drop the `"fade_ms": a.fade_var.get(),` entry (keep `"use_pos": a.pos_var.get()`):

```python
                    "play_w": a.pw_var.get(), "play_h": a.ph_var.get(),
                    "margin_l": a.ml_var.get(), "margin_r": a.mr_var.get(), "margin_v": a.mv_var.get(),
                    "use_pos": a.pos_var.get()}
```

In `UIContext.set_globals`, remove `"fade_ms": a.fade_var` from the `m` mapping:

```python
            m = {"font": a.font_var, "fontsize": a.size_var, "bold": a.bold_var,
                 "back_alpha": a.backa_var, "border_style": a.border_var, "outline_w": a.outline_var,
                 "shadow": a.shadow_var, "play_w": a.pw_var, "play_h": a.ph_var,
                 "margin_l": a.ml_var, "margin_r": a.mr_var, "margin_v": a.mv_var,
                 "use_pos": a.pos_var}
```

- [ ] **Step 4: Run to verify they pass**

Run the full headless set:
```
for f in test_engine test_engine_model test_engine_mutations test_engine_build_io test_mcp test_mcp_server test_daemon; do .venv/bin/python tests/$f.py || echo "FAILED $f"; done
```
Expected: all `N/N passed`. (`ass.py` never reads `fade_ms`/`wrap_style`, so the build/io suite is unaffected.)

- [ ] **Step 5: Commit**

```bash
git add mcp_server/context.py tests/test_mcp.py
git commit -m "engine(config): remove dead fade_ms/wrap_style; decouple UIContext from fade_var"
```

---

### Task 8: Daemon serves `get_project` over `/api/state` + `/ws`

**Files:**
- Modify: `daemon/api.py` (`state` handler + `/ws` on-connect send → `get_project`)
- Modify: `daemon/context.py` (`_fire` broadcasts `get_project`)
- Test: `tests/test_daemon.py`

- [ ] **Step 1: Write/Update the tests**

In `tests/test_daemon.py`, add (and update any existing assertion that expected the summary shape from `/api/state`):

```python
def t_api_state_is_full_project():
    with client() as c:                 # use the file's existing TestClient helper
        r = c.get("/api/state")
        body = r.json()
        return (r.status_code == 200 and "words" in body and "layout" in body
                and "palette" not in body, sorted(body.keys()))

def t_ws_push_after_set_group_fade_carries_fade():
    with client() as c:
        with c.websocket_connect("/ws") as ws:
            ws.receive_json()  # initial state
            c.post("/api/call", json={"tool": "set_group_fade", "args": {"gi": 0, "partial": {"fade_in_ms": 400}}})
            msg = ws.receive_json()
            g0 = msg["state"]["layout"][0]
            return (msg["type"] == "state" and g0["fade"].get("fade_in_ms") == 400, g0.get("fade"))
```

(Match the file's existing helpers for building the app/TestClient and loading a project; if the project must be loaded first via an `/api/call load_lyrics` or a fixture, do that exactly as the existing daemon tests do.)

- [ ] **Step 2: Run to verify they fail**

Run: `.venv/bin/python tests/test_daemon.py`
Expected: FAIL — `/api/state` returns the summary (no `words`/`layout`); WS pushes summary.

- [ ] **Step 3: Implement**

In `daemon/api.py`, change the `state` handler and the `/ws` initial send to use `get_project`:

```python
    async def state(request):  return JSONResponse(tools.get_project(ctx))
```

```python
            await websocket.send_json({"type": "state", "state": tools.get_project(ctx)})
```

In `daemon/context.py`, change `_fire`:

```python
    def _fire(self):
        from mcp_server import tools
        try:
            state = tools.get_project(self)
        except Exception:
            return
        self.hub.schedule({"type": "state", "state": state})
```

- [ ] **Step 4: Run to verify they pass**

Run: `.venv/bin/python tests/test_daemon.py`
Expected: PASS (`N/N passed`).

- [ ] **Step 5: Commit**

```bash
git add daemon/api.py daemon/context.py tests/test_daemon.py
git commit -m "daemon: serve get_project over /api/state and /ws (full functional project feed)"
```

---

### Task 9: Native CTk client adaptation (own colors, drop dead fade slider, group-fade UI)

**Files:**
- Modify: `engine/model.py` (remove the `PALETTE` constant)
- Modify: `engine/__init__.py` (drop `PALETTE` from the re-export)
- Modify: `karaoke_subtitle_gui.py` (own dark palette; color by index; drop `PALETTE` import; group-fade editing; per-tag editor trigger-only)
- Modify: `app_base.py` (remove `fade_var` slider + `fade_ms`/`wrap_style` from cfg/save/load)

> UI suites are deferred to Task 10. This task ends with an import/smoke check only.

- [ ] **Step 1: Remove the engine `PALETTE` constant and its re-export**

In `engine/model.py`, delete the `PALETTE = [...]` constant (the two-line list near the top). In `engine/__init__.py`, remove `PALETTE` from the `from engine.model import (...)` line.

- [ ] **Step 2: Give the CTk client its own dark palette and color-by-index**

In `karaoke_subtitle_gui.py`:
- In the import at line ~25, remove `PALETTE`: `from engine.model import make_project, _tag_of, BUILTIN, resolve_style`.
- Near the theme block (~line 33-39), add a local constant and use it for the Dark theme:

```python
_DARK_PALETTE = ["#7a4a4a", "#4a7a4a", "#4a5a7a", "#7a6a3a", "#6a4a7a",
                 "#3a7a7a", "#7a3a5a", "#5a7a3a", "#3a5a7a", "#7a5a3a"]
```

Change the Dark theme's `"palette": PALETTE` to `"palette": _DARK_PALETTE`.
- In `fin_disp`/`fout_disp` (~lines 435-451), return the tag's **index** instead of `t["color"]`. Each closure already has `ti, t = _tag_of(...)`; change the two `return f"@{trig:.2f}/{int(dur)}", style, t["color"]` lines to `return f"@{trig:.2f}/{int(dur)}", style, ti`. The `dur` shown is now the group-resolved value: compute it once per group via `resolve_fade(g, {"fade_in_ms": G["fade_in_ms"], "fade_out_ms": G["fade_out_ms"]})` and use `gf["fade_in_ms"]`/`gf["fade_out_ms"]` where the closures currently read a per-tag `dur` (tags no longer carry `dur`). Import `resolve_fade` (already imported above).
- At line ~463, change `gcol = gi % len(p["palette"])` to `gcol = gi % 10` (palette length is fixed at 10; `p["palette"]` no longer exists).
- In the cue/tag property editor where the per-tag duration was edited (the panel that called `set_tag_props` with trigger+dur, ~lines 746-758/804), remove the duration field for the tag and keep only the **trigger** control (calls `set_fade_tag_props(kind, ids, trigger)`). Add a group-level fade override control in the layout/event property panel (the panel shown when a layout group is selected) with two numeric fields that call the app's session: `self._session.do("set_group_fade", gi, {"fade_in_ms": <val or None>})` and likewise `fade_out_ms`. Mirror the existing `g_fin`/`g_fout` global fields' widget style.

- [ ] **Step 3: Remove the dead fade slider + `fade_ms`/`wrap_style` from `app_base.py`**

In `app_base.py`:
- Delete `self.fade_var = tk.IntVar(value=250)` (line ~160).
- Delete the `L("Fade-in (ms/word)", r); S(self.fade_var, 0, 3000, r); r += 1` line (~190).
- In the cfg-building dict (~658), remove `"fade_ms": self.fade_var.get(),`; in the same/adjacent dict (~668) remove `"wrap_style": 2,`.
- In the settings-save dict (~693), remove `"fade_ms": self.fade_var.get(),` and `"use_pos": self.pos_var.get(),` stays.
- In the settings-load (~709), remove `self.fade_var.set(d.get("fade_ms", self.fade_var.get()))`.

- [ ] **Step 4: Smoke check (no Tk display needed)**

Run:
```
.venv/bin/python -c "import engine; import app_base; import karaoke_subtitle_gui; print('import ok')"
.venv/bin/python -c "import engine; assert not hasattr(engine, 'PALETTE'); print('PALETTE gone')"
```
Expected: `import ok` and `PALETTE gone` with no traceback.

- [ ] **Step 5: Commit**

```bash
git add engine/model.py engine/__init__.py karaoke_subtitle_gui.py app_base.py
git commit -m "client(ctk): own dark palette + color-by-index; drop dead fade slider; add group-fade editing"
```

---

### Task 10: Full verification — headless + daemon green, then batch the UI suites

**Files:** none (verification + any fixups surfaced)

- [ ] **Step 1: Run all headless + daemon suites**

```
for f in test_engine test_engine_model test_engine_mutations test_engine_build_io test_mcp test_mcp_server test_daemon; do echo "== $f =="; .venv/bin/python tests/$f.py || echo "FAILED $f"; done
```
Expected: every suite prints `N/N passed`.

- [ ] **Step 2: Run the Tk UI suites once (display :1)**

```
DISPLAY=:1 .venv/bin/python tests/test_v2_ui.py
DISPLAY=:1 .venv/bin/python tests/test_ui_selection.py
DISPLAY=:1 .venv/bin/python tests/test_ui_undo.py
DISPLAY=:1 .venv/bin/python tests/test_ui_persistence.py
DISPLAY=:1 .venv/bin/python tests/test_ui_style.py
DISPLAY=:1 .venv/bin/python tests/test_mcp_ui.py
```
Expected: each prints `N/N passed`. If a UI test asserts the old per-tag `dur`, the removed fade slider, or reads `p["palette"]`/`t["color"]`, update it to the new model (deliberate change) — fade duration is a group override; colors are derived by index; the global fade slider is gone.

- [ ] **Step 3: Smoke-run the daemon end to end**

```
.venv/bin/python -m daemon --port 8770 &
sleep 2
curl -s 127.0.0.1:8770/api/state | .venv/bin/python -m json.tool | head -40
kill %1
```
Expected: JSON with `words`, `layout` (groups carry `style` + `fade`), `fin_tags`/`fout_tags` as `{ids, trigger}`, `global_style`, `placement` (with `pos`, without `use_pos`), and no `palette`.

- [ ] **Step 4: Commit any test fixups**

```bash
git add tests/
git commit -m "test: align UI suites with the decoupled engine model (group fade, derived colors)"
```

---

## Self-Review

**Spec coverage:**
- Remove `palette` + fade `color` → Tasks 4 (color), 5 (palette in io + make_project), 9 (engine constant + CTk). ✓
- Remove dead `fade_ms` + `wrap_style` → Task 7 (config), Task 9 (app_base slider). ✓
- `use_pos` kept internal, excluded from feed → Task 6 (`_PLACE_KEYS` omits it), Task 7 (kept in globals). ✓
- Fade-duration `global<group` waterfall (`fade` dict + `resolve_fade`, render uses it) → Tasks 1, 2, 3. ✓
- Fade tags → `{ids, trigger}` → Task 4; serialized so → Task 5; fed so → Task 6/8. ✓
- `get_project` minimal feed + becomes `/api/state` + `/ws` → Tasks 6, 8. ✓
- Merged-token detail fix → Task 6. ✓
- Back-compat reads → Task 5. ✓
- Client adaptation (CTk colors, group-fade UI, drop slider) → Task 9. ✓
- `set_group_fade` mutation/tool/registration → Task 3; `set_fade_tag_props` trigger-only → Task 4. ✓

**Type/name consistency:** `FADE_KEYS`, `resolve_fade(group, gtiming)`, `set_group_fade(project, gi, partial)` / `tools.set_group_fade(ctx, gi, partial)`, group key `"fade"`, tool view key `"fade_overrides"`, `get_project` keys `{words, layout, fin_tags, fout_tags, globals, global_style, placement}`, `_PLACE_KEYS` (no `use_pos`), tags `{ids, trigger}` — used consistently across tasks.

**Placeholder scan:** none — every code step shows full code; test helpers reference each file's existing `CFG`/context/TestClient idioms with an explicit instruction to match them.

**Ordering note (kept the suite green at each commit):** render stops reading tag `dur` (Task 2) *before* tags lose `dur` (Task 4); `_next_color`/palette reads removed (Task 4) *before* `make_project`/io stop emitting `palette` (Task 5); `UIContext` stops referencing `fade_var` (Task 7) *before* the `fade_var` widget is removed (Task 9); the `PALETTE` constant lives until all importers are migrated (Task 9).
