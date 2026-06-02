# Engine MCP Server (Spec 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An MCP server that exposes the karaoke engine's full current surface (inspect / edit+undo / globals / build / render / burn) so an AI can perform ad-hoc edits — headless (stdio) or bound to a live GUI session (HTTP/SSE) where edits update the dock/preview in real time.

**Architecture:** One tool layer (`mcp_server/tools.py`) written over an `EngineContext` bridge (`mcp_server/context.py`) that is mode-agnostic: `HeadlessContext` owns a standalone `controller.Session` + a globals dict and runs synchronously; `UIContext` wraps the live `AppV2` (shares its `_session`, reads/writes tk-vars, and marshals every op onto the Tk main loop via `app.after` + `threading.Event` so `on_change` fires → live UI). `mcp_server/server.py` registers the tools on a `FastMCP` instance and serves stdio or HTTP.

**Tech Stack:** Python 3.10, `mcp` SDK 1.27 (FastMCP), `uvicorn`/`starlette` (pulled by `mcp`), Tk/customtkinter, ffmpeg/libass. Spec: `docs/superpowers/specs/2026-06-02-engine-mcp-server-design.md`.

**Conventions:**
- Repo root `/home/erez/karaoke-subtitle-studio`, branch `feat/engine-mcp-server` (checked out). Run from root.
- Python = **`.venv/bin/python`** (has `mcp`, `customtkinter`, `pillow`). DISPLAY=:1 is set (Tk renders); no xvfb.
- Tests are stdlib scripts run as `.venv/bin/python tests/<name>.py` (exit 0 = pass), matching `tests/test_engine.py`.
- Tools are plain functions over `EngineContext` → testable **without** the MCP transport. Only `server.py`/`__main__.py`/`serve_http` import `mcp`.
- Commit after each task with the shown message.

---

## File Structure

| File | Responsibility |
|---|---|
| `engine/ffmpeg.py` (modify) | Add `frame_cmd(...)` — exact-frame ffmpeg command (shared by UI preview + MCP `render_frame`). |
| `mcp_server/__init__.py` | Package marker + lazy version note. No `mcp` import at top level. |
| `mcp_server/context.py` | `EngineContext` base + `HeadlessContext` + `UIContext` + `run_on_main`. Default globals. No `mcp` import. |
| `mcp_server/tools.py` | All tool/resource IMPLEMENTATIONS as functions `(ctx, ...) -> dict/str/bytes`. A `BurnJobs` registry. No `mcp` import. |
| `mcp_server/server.py` | `build_server(ctx)->FastMCP`, `serve_stdio(ctx)`, `serve_http(ctx, host, port, token)`. Imports `mcp` (lazy-friendly). |
| `mcp_server/__main__.py` | Headless entrypoint: parse args → `HeadlessContext` → `serve_stdio`. |
| `app_base.py` / `karaoke_subtitle_gui.py` (modify) | `_render_exact` uses `frame_cmd`; `AppV2` `--mcp`/`--mcp-port` → `UIContext` + `serve_http` daemon thread + shutdown. |
| `tests/test_mcp.py` | Headless tool tests (no transport/Tk). |
| `tests/test_mcp_ui.py` | UI-marshal test (live AppV2, non-main-thread tool call → live update + shared undo). |
| `tests/test_mcp_server.py` | Transport smoke: stdio + http handshake (skips if `mcp` absent). |
| `pyproject.toml` (modify) | Declare `mcp` as an optional dependency group. |

---

## Phase 1 — Engine: shared frame command

### Task 1: `engine.ffmpeg.frame_cmd`

**Files:** Modify `engine/ffmpeg.py`; modify `app_base.py` (`_render_exact`); add a test to `tests/test_engine_build_io.py`.

- [ ] **Step 1: Write the failing test** — append to `tests/test_engine_build_io.py` (among the `t_` defs):

```python
def t_frame_cmd_shape():
    import engine.ffmpeg as f, core
    # with a video input
    c = f.frame_cmd("/tmp/in.mp4", "/tmp/x.ass", 13.0, 1920, 1080, "/tmp/o.png")
    assert c[0] == core.FFMPEG and "/tmp/o.png" == c[-1]
    assert "-ss" in c and "13.000" in c and any("ass='" in a for a in c)
    assert "/tmp/in.mp4" in c and "-frames:v" in c
    # without a video input -> solid color source (lavfi)
    c2 = f.frame_cmd(None, "/tmp/x.ass", 0.0, 640, 360, "/tmp/o2.png")
    return (any("lavfi" in a for a in c2) and any("color=" in a for a in c2)
            and any("640x360" in a for a in c2)), f"len(c)={len(c)} len(c2)={len(c2)}"
```

- [ ] **Step 2: Run — verify it fails.** `.venv/bin/python tests/test_engine_build_io.py` → `t_frame_cmd_shape` FAILS (`frame_cmd` undefined).

- [ ] **Step 3: Implement** — add to `engine/ffmpeg.py` (uses the existing `_escape_ass`, `FFMPEG`):

```python
def frame_cmd(video_in, ass_path, time_s, w, h, out_png):
    """Render one exact libass frame at time_s to out_png. If video_in is None,
    use a solid dark canvas of w x h (so a preview works without footage)."""
    af = _escape_ass(ass_path)
    if video_in:
        src = ["-ss", f"{time_s:.3f}", "-copyts", "-i", video_in]
    else:
        src = ["-ss", f"{time_s:.3f}", "-copyts", "-f", "lavfi",
               "-i", f"color=c=#202024:s={int(w)}x{int(h)}:d={max(time_s + 1, 1):.1f}"]
    return [FFMPEG, "-y", "-hide_banner", "-loglevel", "error", *src,
            "-vf", f"ass='{af}'", "-frames:v", "1", out_png]
```

- [ ] **Step 4: Refactor `app_base._render_exact` to use it (no behavior change).** In `app_base.py`, inside `_render_exact`, replace the inline `src=[...]` + `vf=...` command construction that builds the preview PNG with:

```python
        ass_f = tmp_ass            # frame_cmd escapes internally
        cmd = engine.ffmpeg.frame_cmd(self.vid_var.get() or None, ass_f, t,
                                      cfg["play_w"], cfg["play_h"], out_png)
        cmd[ -3:-3] = []           # (no-op placeholder; keep scale below)
```

Then keep the existing `scale={PREVIEW_W}:{self.canvas_h}` step by appending it to the `-vf` filter: change the produced cmd's `-vf` value from `ass='...'` to `ass='...',scale=...`. Concretely, after `cmd = engine.ffmpeg.frame_cmd(...)`, do:

```python
        vi = cmd.index("-vf")
        cmd[vi + 1] = cmd[vi + 1] + f",scale={PREVIEW_W}:{self.canvas_h}"
```

(Confirm `import engine.ffmpeg` exists in app_base — it does.) Leave the rest of `_render_exact` (writing tmp_ass, running cmd, loading PhotoImage) unchanged.

- [ ] **Step 5: Run** `.venv/bin/python tests/test_engine_build_io.py` (frame_cmd test passes) and `.venv/bin/python tests/test_v2_ui.py` (23/27 era → still all pass; `_render_exact` unchanged in behavior). Expect both green.

- [ ] **Step 6: Commit**
```bash
git add engine/ffmpeg.py app_base.py tests/test_engine_build_io.py
git commit -m "feat(engine): frame_cmd for exact-frame render; reuse in app preview"
```

---

## Phase 2 — Context bridge

### Task 2: `HeadlessContext`

**Files:** Create `mcp_server/__init__.py`, `mcp_server/context.py`; create `tests/test_mcp.py`.

- [ ] **Step 1: Write the failing test** — create `tests/test_mcp.py`:

```python
# tests/test_mcp.py — headless MCP tool/context tests (no transport, no Tk).
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
results = []
def check(name, fn):
    try:
        ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}"))

from mcp_server.context import HeadlessContext, DEFAULT_GLOBALS

def t_headless_loads_and_cfg():
    ctx = HeadlessContext()
    ctx.load_lyrics("aligned_lyrics.json")
    cfg = ctx.cfg()
    return (ctx.session.project is not None and cfg["fontsize"] == DEFAULT_GLOBALS["fontsize"]
            and "play_w" in cfg), f"events={len(ctx.session.project['layout'])}"

def t_headless_globals_get_set():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    ctx.set_globals({"fontsize": 90, "primary": "#FF0000"})
    g = ctx.get_globals()
    return (g["fontsize"] == 90 and g["primary"] == "#FF0000" and ctx.cfg()["primary_color"] == "#FF0000"), f"g={g['fontsize']}"

def t_headless_run_is_direct():
    ctx = HeadlessContext()
    return (ctx.run(lambda: 41 + 1) == 42), "run direct"

for n, f in list(globals().items()):
    if n.startswith("t_"): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, d in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"  -> {d}"))
print(f"\n{npass}/{len(results)} passed"); sys.exit(0 if npass == len(results) else 1)
```

- [ ] **Step 2: Run — verify it fails** (`mcp_server.context` missing).

- [ ] **Step 3: Implement** — create `mcp_server/__init__.py`:
```python
# mcp_server — MCP server exposing the karaoke engine. Transport code imports the
# optional `mcp` SDK lazily; context/tools are pure (engine + controller only).
```
and `mcp_server/context.py`:
```python
# mcp_server/context.py — mode-aware bridge. No `mcp`, no tkinter at import time.
import threading
import core
import engine
import controller

# Style/placement globals (build_ass cfg minus the load-time keys). align is an int.
DEFAULT_GLOBALS = {
    "font": "DejaVu Sans", "fontsize": 64, "bold": True, "align": 2,
    "primary_color": "#FFFFFF", "outline_color": "#000000", "back_color": "#000000",
    "back_alpha": "80", "border_style": 1, "outline_w": 3, "shadow": 0,
    "play_w": 1920, "play_h": 1080, "margin_l": 80, "margin_r": 80, "margin_v": 60,
    "fade_ms": 250, "wrap_style": 2, "use_pos": True,
}
# get_globals/set_globals operate on these friendly keys; cfg() maps to build_ass keys.
GLOBAL_KEYS = ["font", "fontsize", "bold", "align", "primary", "outline", "back",
               "back_alpha", "border_style", "outline_w", "shadow", "play_w", "play_h",
               "margin_l", "margin_r", "margin_v", "fade_ms", "use_pos", "pos"]

def run_on_main(app, fn, timeout=15.0):
    """Run fn() on the Tk main loop from another thread; return its result or re-raise."""
    box = {}; ev = threading.Event()
    def task():
        try: box["r"] = fn()
        except BaseException as e: box["e"] = e
        finally: ev.set()
    app.after(0, task)
    if not ev.wait(timeout):
        raise TimeoutError("MCP op timed out waiting for the UI main loop")
    if "e" in box: raise box["e"]
    return box.get("r")

class EngineContext:
    session = None
    def run(self, fn): raise NotImplementedError
    def get_globals(self): raise NotImplementedError
    def set_globals(self, partial): raise NotImplementedError
    def cfg(self): raise NotImplementedError
    def video_path(self): return None
    def fonts(self): return core.list_font_families()

class HeadlessContext(EngineContext):
    def __init__(self):
        self.session = controller.Session()
        self._g = dict(DEFAULT_GLOBALS)
        self._g["primary"] = self._g.pop("primary_color")
        self._g["outline"] = self._g.pop("outline_color")
        self._g["back"] = self._g.pop("back_color")
        self._g["pos"] = None
        self._video = None
    def run(self, fn): return fn()
    def get_globals(self): return dict(self._g)
    def set_globals(self, partial):
        for k, v in partial.items():
            if k in GLOBAL_KEYS: self._g[k] = v
    def set_video(self, path): self._video = path or None
    def video_path(self): return self._video
    def cfg(self):
        g = self._g
        c = {"font": g["font"], "fontsize": g["fontsize"], "bold": g["bold"], "align": g["align"],
             "fade_ms": g["fade_ms"], "play_w": g["play_w"], "play_h": g["play_h"],
             "margin_l": g["margin_l"], "margin_r": g["margin_r"], "margin_v": g["margin_v"],
             "primary_color": g["primary"], "outline_color": g["outline"], "back_color": g["back"],
             "back_alpha": g["back_alpha"], "border_style": g["border_style"],
             "outline_w": g["outline_w"], "shadow": g["shadow"], "wrap_style": g["wrap_style"]}
        if g.get("use_pos") and g.get("pos"): c["pos"] = g["pos"]
        return c
    def load_lyrics(self, json_path, group_by="section", skip_dashes=True):
        p = engine.make_project({"json_path": json_path, "group_by": group_by,
                                 "skip_dashes": skip_dashes})
        self.session.set_project(p); return p
```

- [ ] **Step 4: Run** `.venv/bin/python tests/test_mcp.py` → `3/3 passed`.

- [ ] **Step 5: Commit**
```bash
git add mcp_server/__init__.py mcp_server/context.py tests/test_mcp.py
git commit -m "feat(mcp): HeadlessContext + globals/cfg bridge"
```

### Task 3: `UIContext` + main-loop marshaling

**Files:** Modify `mcp_server/context.py`; create `tests/test_mcp_ui.py`.

- [ ] **Step 1: Write the failing test** — create `tests/test_mcp_ui.py`:

```python
# tests/test_mcp_ui.py — UIContext marshaling + live update (needs DISPLAY).
import os, sys, threading, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import karaoke_subtitle_gui as v2
from mcp_server.context import UIContext

app = v2.AppV2()
def pump(n=10):
    for _ in range(n): app.update(); time.sleep(0.02)
pump(14); time.sleep(0.3); pump(8)
ed = app.open_editor(); pump(4)
ctx = UIContext(app)
results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e: results.append((False, name, f"EXC {type(e).__name__}: {e}"))

def t_ui_run_marshals_and_updates():
    # call a mutation from a NON-main thread; pump the main loop so after() fires.
    rows_before = len(ed.rows)
    box = {}
    def worker():
        box["style"] = ctx.run(lambda: (ctx.session.do("set_group_style", 0, {"fontsize": 99}),
                                          ctx.session.project["layout"][0]["style"])[1])
    th = threading.Thread(target=worker); th.start()
    for _ in range(60):
        app.update(); time.sleep(0.02)
        if not th.is_alive(): break
    th.join(2)
    applied = app._project["layout"][0]["style"].get("fontsize") == 99
    return (applied and box.get("style", {}).get("fontsize") == 99), f"style={box.get('style')}"

def t_ui_globals_write_tkvars():
    ctx.run(lambda: None)
    ctx.set_globals({"fontsize": 72})
    pump(3)
    return (app.size_var.get() == 72 and ctx.cfg()["fontsize"] == 72), f"size={app.size_var.get()}"

for n, f in [("ui_run_marshals_and_updates", t_ui_run_marshals_and_updates),
             ("ui_globals_write_tkvars", t_ui_globals_write_tkvars)]:
    check(n, f); pump(3)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, d in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"  -> {d}"))
print(f"\n{npass}/{len(results)} passed"); app.destroy(); sys.exit(0 if npass == len(results) else 1)
```

- [ ] **Step 2: Run — verify it fails** (`UIContext` undefined).

- [ ] **Step 3: Implement** — add `UIContext` to `mcp_server/context.py`. It binds to a live `AppV2`, reads/writes its tk-vars, and marshals via `run_on_main`. Global key ↔ tk-var mapping below; `set_globals` writes vars then triggers `_rebuild_render`/`_resync_canvas` on the main loop.

```python
class UIContext(EngineContext):
    def __init__(self, app):
        self.app = app
        self.session = app._session
    def run(self, fn): return run_on_main(self.app, fn)
    def video_path(self): return self.app.vid_var.get() or None
    def cfg(self): return self.run(lambda: self.app.cfg())
    def fonts(self):
        from core import list_font_families
        return list_font_families()
    def get_globals(self):
        def read():
            from app_base import ALIGN_LABELS
            a = self.app
            return {"font": a.font_var.get(), "fontsize": a.size_var.get(), "bold": a.bold_var.get(),
                    "align": ALIGN_LABELS[a.align_var.get()], "primary": a._color["primary"],
                    "outline": a._color["outline"], "back": a._color["back"],
                    "back_alpha": a.backa_var.get(), "border_style": a.border_var.get(),
                    "outline_w": a.outline_var.get(), "shadow": a.shadow_var.get(),
                    "play_w": a.pw_var.get(), "play_h": a.ph_var.get(),
                    "margin_l": a.ml_var.get(), "margin_r": a.mr_var.get(), "margin_v": a.mv_var.get(),
                    "fade_ms": a.fade_var.get(), "use_pos": a.pos_var.get()}
        return self.run(read)
    def set_globals(self, partial):
        def write():
            from app_base import ALIGN_LABELS
            a = self.app
            inv = {v: k for k, v in ALIGN_LABELS.items()}
            m = {"font": a.font_var, "fontsize": a.size_var, "bold": a.bold_var,
                 "back_alpha": a.backa_var, "border_style": a.border_var, "outline_w": a.outline_var,
                 "shadow": a.shadow_var, "play_w": a.pw_var, "play_h": a.ph_var,
                 "margin_l": a.ml_var, "margin_r": a.mr_var, "margin_v": a.mv_var,
                 "fade_ms": a.fade_var, "use_pos": a.pos_var}
            for k, v in partial.items():
                if k in m: m[k].set(v)
                elif k in ("primary", "outline", "back"): a._color[k] = v
                elif k == "align" and v in inv: a.align_var.set(inv[v])
            if any(k in ("play_w", "play_h") for k in partial): a._resync_canvas()
            a._rebuild_render()
        return self.run(write)
```

(`ALIGN_LABELS` maps the dropdown label → int; we invert for writes. The tk-var names — `pw_var/ph_var/ml_var/mr_var/mv_var/fade_var/size_var/...` — match `app_base._build_style`; verify against the file and adjust any that differ.)

- [ ] **Step 4: Run** `.venv/bin/python tests/test_mcp_ui.py` → `2/2 passed` (proves a non-main-thread MCP op mutates the shared session AND the GUI reflects it). Also confirm `.venv/bin/python tests/test_v2_ui.py` still green.

- [ ] **Step 5: Commit**
```bash
git add mcp_server/context.py tests/test_mcp_ui.py
git commit -m "feat(mcp): UIContext with Tk main-loop marshaling + live update"
```

---

## Phase 3 — Tools (pure, over EngineContext)

### Task 4: Read/inspect tools

**Files:** Create `mcp_server/tools.py`; extend `tests/test_mcp.py`.

- [ ] **Step 1: Write failing tests** — add to `tests/test_mcp.py`:

```python
from mcp_server import tools

def t_get_state():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    s = tools.get_state(ctx)
    return (s["n_events"] == len(ctx.session.project["layout"]) and "globals" in s
            and isinstance(s["events"], list) and "win" in s["events"][0]), f"n={s['n_events']}"

def t_get_group_and_word():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    g = tools.get_group(ctx, 0)
    wid = g["lines"][0]["words"][0]["wid"]
    w = tools.get_word(ctx, wid)
    return (g["gi"] == 0 and "resolved_style" in g and w["wid"] == wid and "start" in w), f"wid={wid}"

def t_get_render_and_ass():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    r = tools.get_render(ctx); a = tools.get_ass(ctx)
    return (len(r) > 0 and "start" in r[0] and "[V4+ Styles]" in a and "Dialogue:" in a), f"groups={len(r)}"
```

- [ ] **Step 2: Run — verify fail** (`mcp_server.tools` missing).

- [ ] **Step 3: Implement** — create `mcp_server/tools.py` (read section + shared helpers). Reads go through `ctx.run` so UI mode is race-free.

```python
# mcp_server/tools.py — tool implementations over an EngineContext. No `mcp` import.
import json, os, tempfile, threading, uuid
import engine
from engine.model import resolve_style, _tag_of

def _gctx_for_resolve(ctx):
    c = ctx.cfg()
    return {"font": c["font"], "fontsize": c["fontsize"], "bold": c["bold"],
            "primary": c["primary_color"], "outline": c["outline_color"], "back": c["back_color"],
            "back_alpha": c["back_alpha"], "outline_w": c["outline_w"], "shadow": c["shadow"],
            "border_style": c["border_style"]}

def _require_project(ctx):
    if ctx.session.project is None:
        raise ValueError("no project loaded — call load_lyrics or load_project first")

def _event_view(ctx, gi):
    p = ctx.session.project; g = p["layout"][gi]; words = p["words"]
    gd = _gctx_for_resolve(ctx)
    ids = [i for ln in g["lines"] for t in ln["toks"] for i in t["ids"]]
    s = g["win_start"] if g.get("win_start") is not None else (min(words[i]["start"] for i in ids) if ids else 0.0)
    e = g["win_end"] if g.get("win_end") is not None else (max(words[i]["end"] for i in ids) if ids else 0.0)
    return {"gi": gi, "label": g["label"], "win": [s, e], "accumulate": g.get("accumulate", "words"),
            "linger": g.get("linger"), "deleted": g.get("del", False),
            "style_overrides": dict(g.get("style") or {}),
            "lines": [{"li": li, "words": [{"wid": t["ids"][0], "text": words[t["ids"][0]]["text"],
                        "start": min(words[i]["start"] for i in t["ids"]),
                        "end": max(words[i]["end"] for i in t["ids"]),
                        "deleted": t.get("del", False),
                        "style": dict(t.get("style") or {})} for t in ln["toks"]]}
                      for li, ln in enumerate(g["lines"])]}

def get_state(ctx):
    def f():
        _require_project(ctx); p = ctx.session.project
        return {"n_events": len(p["layout"]), "n_words": len(p["words"]),
                "globals": ctx.get_globals(),
                "fade_defaults": dict(p["globals"]),
                "events": [{k: _event_view(ctx, gi)[k] for k in ("gi", "label", "win", "accumulate", "style_overrides")}
                           | {"n_words": sum(len(ln["toks"]) for ln in g["lines"])}
                           for gi, g in enumerate(p["layout"])]}
    return ctx.run(f)

def list_groups(ctx): return ctx.run(lambda: (_require_project(ctx), [_event_view(ctx, gi) for gi in range(len(ctx.session.project["layout"]))])[1])
def get_group(ctx, gi): return ctx.run(lambda: (_require_project(ctx), _event_view(ctx, gi))[1])

def _word_view(ctx, wid):
    p = ctx.session.project; w = p["words"][wid]
    loc = None; tok = None
    for gi, g in enumerate(p["layout"]):
        for li, ln in enumerate(g["lines"]):
            for ti, t in enumerate(ln["toks"]):
                if wid in t["ids"]: loc = (gi, li, ti); tok = t
    fin = _tag_of(p["fin_tags"], wid)[1]; fout = _tag_of(p["fout_tags"], wid)[1]
    grp = p["layout"][loc[0]] if loc else None
    return {"wid": wid, "text": w["text"], "start": w["start"], "end": w["end"],
            "location": loc, "fade_in_group": sorted(fin["ids"]) if fin else None,
            "fade_out_group": sorted(fout["ids"]) if fout else None,
            "cue_style": dict((tok or {}).get("style") or {}),
            "resolved_style": resolve_style(tok, grp, _gctx_for_resolve(ctx))}

def get_word(ctx, wid): return ctx.run(lambda: (_require_project(ctx), _word_view(ctx, wid))[1])
def list_words(ctx): return ctx.run(lambda: (_require_project(ctx), [_word_view(ctx, i) for i in range(len(ctx.session.project["words"]))])[1])

def get_render(ctx): return ctx.run(lambda: (_require_project(ctx), engine.project_to_render(ctx.session.project))[1])
def get_ass(ctx): return ctx.run(lambda: (_require_project(ctx), engine.build_ass(ctx.cfg(), engine.project_to_render(ctx.session.project))[0])[1])
```

- [ ] **Step 4: Run** `.venv/bin/python tests/test_mcp.py` → all pass (6/6).

- [ ] **Step 5: Commit**
```bash
git add mcp_server/tools.py tests/test_mcp.py
git commit -m "feat(mcp): inspect tools (state/group/word/render/ass)"
```

### Task 5: Edit + undo/redo tools

**Files:** Modify `mcp_server/tools.py`; extend `tests/test_mcp.py`.

- [ ] **Step 1: Write failing tests** — add to `tests/test_mcp.py`:

```python
def t_edit_group_style_and_undo():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    tools.set_group_style(ctx, 0, {"fontsize": 88, "border_style": 3})
    assert ctx.session.project["layout"][0]["style"]["fontsize"] == 88
    a = tools.get_ass(ctx); assert "Style: Box," in a
    tools.undo(ctx)
    return (ctx.session.project["layout"][0]["style"] == {}), "undo cleared group style"

def t_edit_cue_style_border_dropped():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    wid = ctx.session.project["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    tools.set_cue_style(ctx, [wid], {"primary": "#00FF00", "border_style": 3})
    st = tools.get_word(ctx, wid)["cue_style"]
    return (st == {"primary": "#00FF00"}), f"st={st}"

def t_fade_tag_make_and_props():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    tools.make_fade_tag(ctx, "out", [0, 1, 2])
    tools.set_fade_tag_props(ctx, "out", [0], trigger=99.0, dur=500)
    r = engine.project_to_render(ctx.session.project)
    foats = [w["fout_at"] for g in r for ln in g["lines"] for w in ln["words"] if w["fout_at"] is not None]
    return (any(abs(x - 99.0) < 1e-6 for x in foats)), f"foats~{[round(x,1) for x in foats][:4]}"

def t_layout_merge_split_redo():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    n0 = len(ctx.session.project["layout"])
    tools.merge_events(ctx, [0, 1]); n1 = len(ctx.session.project["layout"])
    tools.undo(ctx); n2 = len(ctx.session.project["layout"])
    tools.redo(ctx); n3 = len(ctx.session.project["layout"])
    return (n1 == n0 - 1 and n2 == n0 and n3 == n0 - 1), f"{n0},{n1},{n2},{n3}"

def t_delete_restore_words():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    tools.delete_words(ctx, [0]); d1 = tools.get_word(ctx, 0)["location"]
    tok_deleted = ctx.session.project["layout"][d1[0]]["lines"][d1[1]]["toks"][d1[2]]["del"]
    tools.restore_words(ctx, [0])
    tok_restored = ctx.session.project["layout"][d1[0]]["lines"][d1[1]]["toks"][d1[2]]["del"]
    return (tok_deleted is True and tok_restored is False), "delete/restore ok"
```

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement** — add the edit wrappers to `mcp_server/tools.py`. Each runs through `ctx.run(lambda: ctx.session.do(...))` and returns an affected-entity view (so UI mode updates live + the AI sees the result).

```python
_LANE = {"in": "fin_tags", "out": "fout_tags"}

def _do(ctx, fn_name, *args):
    return ctx.run(lambda: ctx.session.do(fn_name, *args))

def set_group_style(ctx, gi, partial):
    _do(ctx, "set_group_style", gi, partial); return ctx.run(lambda: _event_view(ctx, gi))
def set_cue_style(ctx, word_ids, partial):
    _do(ctx, "set_cue_style", set(word_ids), partial)
    return ctx.run(lambda: [_word_view(ctx, w) for w in word_ids])
def make_fade_tag(ctx, kind, word_ids):
    _do(ctx, "make_tag", _LANE[kind], set(word_ids)); return get_state(ctx)
def clear_fade_tag(ctx, kind, word_ids):
    _do(ctx, "clear_tag", _LANE[kind], set(word_ids)); return get_state(ctx)
def set_fade_tag_props(ctx, kind, word_ids, trigger=None, dur=None):
    def f():
        lane = _LANE[kind]; ti, _ = _tag_of(ctx.session.project[lane], next(iter(word_ids)))
        if ti is None: raise ValueError("those words are not in a fade group; make_fade_tag first")
        return ctx.session.do("set_tag_props", lane, ti, trigger, dur)
    ctx.run(f); return get_state(ctx)
def set_layout_props(ctx, gi, win_start=None, win_end=None, linger=None, accumulate="words"):
    _do(ctx, "set_layout_props", gi, win_start, win_end, linger, accumulate); return ctx.run(lambda: _event_view(ctx, gi))
def merge_events(ctx, gidxs):
    ok = _do(ctx, "layout_merge", set(gidxs))
    if ok is False: raise ValueError("merge_events needs >=2 adjacent event indices")
    return list_groups(ctx)
def ungroup_event(ctx, gi):
    _do(ctx, "layout_ungroup", gi); return list_groups(ctx)
def split_event(ctx, gi, line_index):
    _do(ctx, "layout_split_event", gi, line_index); return list_groups(ctx)
def break_line(ctx, gi, li, ti, after=True):
    _do(ctx, "add_break", gi, li, ti, after); return ctx.run(lambda: _event_view(ctx, gi))
def merge_words(ctx, gi, li, ti, sep=""):
    _do(ctx, "merge_prev_word", gi, li, ti, sep); return ctx.run(lambda: _event_view(ctx, gi))
def delete_words(ctx, word_ids):
    _do(ctx, "toggle_word_del", set(word_ids), True); return ctx.run(lambda: [_word_view(ctx, w) for w in word_ids])
def restore_words(ctx, word_ids):
    _do(ctx, "toggle_word_del", set(word_ids), False); return ctx.run(lambda: [_word_view(ctx, w) for w in word_ids])
def set_fade_defaults(ctx, fade_in_ms=None, fade_out_ms=None, linger=None):
    def f():
        for k, v in (("fade_in_ms", fade_in_ms), ("fade_out_ms", fade_out_ms), ("linger", linger)):
            if v is not None: ctx.session.do("set_global", k, v)
    ctx.run(f); return ctx.run(lambda: dict(ctx.session.project["globals"]))
def undo(ctx): ctx.run(lambda: ctx.session.undo()); return get_state(ctx)
def redo(ctx): ctx.run(lambda: ctx.session.redo()); return get_state(ctx)
```

- [ ] **Step 4: Run** `.venv/bin/python tests/test_mcp.py` → all pass (11/11).

- [ ] **Step 5: Commit**
```bash
git add mcp_server/tools.py tests/test_mcp.py
git commit -m "feat(mcp): edit + undo/redo tools over the shared session"
```

### Task 6: Globals + project/build tools

**Files:** Modify `mcp_server/tools.py`; extend `tests/test_mcp.py`.

- [ ] **Step 1: Write failing tests** — add to `tests/test_mcp.py`:

```python
def t_globals_tools():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    tools.set_globals(ctx, {"font": "Arial", "fontsize": 50})
    g = tools.get_globals(ctx)
    return (g["font"] == "Arial" and g["fontsize"] == 50), f"g={g['font']}/{g['fontsize']}"

def t_project_save_load_roundtrip():
    import json as _j
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    tools.set_group_style(ctx, 0, {"font": "Arial"}); tools.set_globals(ctx, {"fontsize": 77})
    path = "/tmp/_mcp_proj.json"; tools.save_project(ctx, path)
    ctx2 = HeadlessContext(); ctx2.load_lyrics("aligned_lyrics.json")
    tools.load_project(ctx2, path)
    return (ctx2.session.project["layout"][0]["style"].get("font") == "Arial"
            and tools.get_globals(ctx2)["fontsize"] == 77), "roundtrip ok"

def t_generate_ass_to_file_and_text():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    txt = tools.generate_ass(ctx)             # returns text when no path
    p = "/tmp/_mcp.ass"; tools.generate_ass(ctx, p)
    return ("Dialogue:" in txt and os.path.isfile(p) and open(p).read().count("Dialogue:") > 0), "ass ok"
```

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement** — add to `mcp_server/tools.py`. The project file is the same dict shape the GUI's `_preset_dict` saves (style/placement + `cues_v2`); headless we assemble it from `ctx.get_globals()` + `engine.serialize_cues`.

```python
def get_globals(ctx): return ctx.get_globals()
def set_globals(ctx, partial): ctx.set_globals(partial); return ctx.get_globals()

def _project_doc(ctx):
    g = ctx.get_globals()
    return {"globals_style": g, "cues_v2": engine.serialize_cues(ctx.session.project)}

def save_project(ctx, path):
    def f():
        _require_project(ctx)
        with open(path, "w", encoding="utf-8") as fh: json.dump(_project_doc(ctx), fh, indent=2)
        return {"saved": path}
    return ctx.run(f)

def load_project(ctx, path):
    def f():
        _require_project(ctx)   # need a base project with matching nwords (load_lyrics first)
        d = json.load(open(path, encoding="utf-8"))
        if d.get("globals_style"): ctx.set_globals(d["globals_style"])
        ok = engine.apply_cues(ctx.session.project, d.get("cues_v2") or {})
        ctx.session.set_project(ctx.session.project)   # fire on_change / reset undo
        return {"loaded": path, "applied": bool(ok)}
    return ctx.run(f)

def generate_ass(ctx, path=None):
    def f():
        _require_project(ctx)
        text, n = engine.build_ass(ctx.cfg(), engine.project_to_render(ctx.session.project))
        if path:
            with open(path, "w", encoding="utf-8") as fh: fh.write(text)
            return {"wrote": path, "events": n}
        return text
    return ctx.run(f)
```

Note: `set_globals` in `UIContext` must accept `align` as an int (it does, via the inverse map) and the friendly color keys `primary/outline/back`. `get_globals` returns the same friendly keys in both contexts (HeadlessContext already does; UIContext.get_globals returns them). Keep them consistent.

- [ ] **Step 4: Run** `.venv/bin/python tests/test_mcp.py` → all pass (14/14).

- [ ] **Step 5: Commit**
```bash
git add mcp_server/tools.py tests/test_mcp.py
git commit -m "feat(mcp): globals + project save/load + generate_ass tools"
```

### Task 7: render_frame + burn (job model)

**Files:** Modify `mcp_server/tools.py`; extend `tests/test_mcp.py`.

- [ ] **Step 1: Write failing tests** — add to `tests/test_mcp.py`:

```python
def t_render_frame_png():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    ctx.set_globals({"play_w": 480, "play_h": 270})
    png = tools.render_frame(ctx, 13.0)               # bytes (PNG)
    return (isinstance(png, (bytes, bytearray)) and png[:8] == b"\x89PNG\r\n\x1a\n"), f"len={len(png)}"

def t_burn_job_completes():
    import subprocess, core, time as _t
    subprocess.run([core.FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
                    "-i", "color=c=navy:s=320x180:d=1", "/tmp/_mcp_in.mp4"], check=True)
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json"); ctx.set_globals({"play_w": 320, "play_h": 180})
    job = tools.burn(ctx, "/tmp/_mcp_out.mp4", video_in="/tmp/_mcp_in.mp4")
    jid = job["job_id"]
    st = None
    for _ in range(200):
        st = tools.burn_status(ctx, jid)
        if st["done"]: break
        _t.sleep(0.1)
    import os as _o
    return (st and st["done"] and st["ok"] and _o.path.isfile("/tmp/_mcp_out.mp4")), f"st={st}"
```

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement** — add to `mcp_server/tools.py` a burn-job registry + render_frame:

```python
_BURN_JOBS = {}        # job_id -> {"frac","done","ok","err","out"}
_BURN_LOCK = threading.Lock()

def render_frame(ctx, time_s):
    def build():
        _require_project(ctx)
        cfg = ctx.cfg()
        ass = os.path.join(tempfile.gettempdir(), "_mcp_frame.ass")
        text, _ = engine.build_ass(cfg, engine.project_to_render(ctx.session.project))
        with open(ass, "w", encoding="utf-8") as fh: fh.write(text)
        return cfg, ass
    cfg, ass = ctx.run(build)
    out = os.path.join(tempfile.gettempdir(), f"_mcp_frame_{uuid.uuid4().hex}.png")
    cmd = engine.ffmpeg.frame_cmd(ctx.video_path(), ass, time_s, cfg["play_w"], cfg["play_h"], out)
    import subprocess
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0 or not os.path.isfile(out):
        raise RuntimeError("frame render failed: " + (p.stderr or "")[-300:])
    with open(out, "rb") as fh: return fh.read()

def burn(ctx, out_path, video_in=None):
    cfg, ass = (lambda: None), None
    def build():
        _require_project(ctx)
        a = os.path.join(tempfile.gettempdir(), f"_mcp_burn_{uuid.uuid4().hex}.ass")
        text, _ = engine.build_ass(ctx.cfg(), engine.project_to_render(ctx.session.project))
        with open(a, "w", encoding="utf-8") as fh: fh.write(text)
        return a
    ass = ctx.run(build)
    src = video_in or ctx.video_path()
    if not src: raise ValueError("burn needs a video: pass video_in or set globals video")
    jid = uuid.uuid4().hex
    with _BURN_LOCK: _BURN_JOBS[jid] = {"frac": 0.0, "done": False, "ok": False, "err": None, "out": out_path}
    total = engine.ffmpeg.probe_duration(src) or 1.0
    cmd = engine.ffmpeg.burn_cmd(src, ass, out_path)
    def worker():
        ok, err = engine.ffmpeg.run(cmd, total, lambda fr: _BURN_JOBS[jid].__setitem__("frac", fr))
        with _BURN_LOCK: _BURN_JOBS[jid].update(done=True, ok=ok, err=(None if ok else str(err)[-400:]), frac=1.0)
    threading.Thread(target=worker, daemon=True).start()
    return {"job_id": jid}

def burn_status(ctx, job_id):
    with _BURN_LOCK:
        st = _BURN_JOBS.get(job_id)
        if st is None: raise ValueError(f"unknown burn job_id {job_id}")
        return dict(st)
```

(`render_frame`/`burn` build the ASS on the right thread via `ctx.run`, but the ffmpeg subprocess runs off the main loop — it touches no Tk — so UI stays responsive.)

- [ ] **Step 4: Run** `.venv/bin/python tests/test_mcp.py` → all pass (16/16).

- [ ] **Step 5: Commit**
```bash
git add mcp_server/tools.py tests/test_mcp.py
git commit -m "feat(mcp): render_frame (PNG) + burn job + burn_status"
```

---

## Phase 4 — Server + transports

### Task 8: `build_server` + stdio entrypoint

**Files:** Create `mcp_server/server.py`, `mcp_server/__main__.py`; create `tests/test_mcp_server.py`.

- [ ] **Step 1: Write the failing test** — create `tests/test_mcp_server.py`:

```python
# tests/test_mcp_server.py — transport handshake smoke (skips if `mcp` SDK absent).
import os, sys, asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e: results.append((False, name, f"EXC {type(e).__name__}: {e}"))

try:
    import mcp  # noqa
    HAVE = True
except Exception:
    HAVE = False

def t_build_server_lists_tools():
    if not HAVE: return True, "SKIP: mcp not installed"
    from mcp_server.context import HeadlessContext
    from mcp_server.server import build_server
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    srv = build_server(ctx)
    names = asyncio.get_event_loop().run_until_complete(srv.list_tools())
    tnames = {t.name for t in names}
    needed = {"get_state", "set_group_style", "set_cue_style", "make_fade_tag", "set_globals",
              "generate_ass", "render_frame", "burn", "burn_status", "undo", "redo", "load_lyrics"}
    return (needed <= tnames), f"missing={needed - tnames}"

for n, f in [("build_server_lists_tools", t_build_server_lists_tools)]:
    check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, d in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"  -> {d}"))
print(f"\n{npass}/{len(results)} passed"); sys.exit(0 if npass == len(results) else 1)
```

- [ ] **Step 2: Run — verify fail** (`mcp_server.server` missing).

- [ ] **Step 3: Implement** — create `mcp_server/server.py`. Register each `tools.*` function as a FastMCP tool (closing over `ctx`), plus two resources. `Image` wraps `render_frame` bytes.

```python
# mcp_server/server.py — FastMCP registration + transports. Imports `mcp` (SDK).
from mcp.server.fastmcp import FastMCP, Image
from mcp_server import tools

def build_server(ctx, name="karaoke-subtitle-studio"):
    mcp = FastMCP(name, instructions="Edit a word-timed karaoke subtitle project: inspect, "
                  "style groups/cues, fade groups, layout, globals, build/render/burn.")

    # ---- inspect ----
    @mcp.tool()
    def get_state() -> dict: return tools.get_state(ctx)
    @mcp.tool()
    def list_groups() -> list: return tools.list_groups(ctx)
    @mcp.tool()
    def get_group(gi: int) -> dict: return tools.get_group(ctx, gi)
    @mcp.tool()
    def list_words() -> list: return tools.list_words(ctx)
    @mcp.tool()
    def get_word(wid: int) -> dict: return tools.get_word(ctx, wid)
    @mcp.tool()
    def get_render() -> list: return tools.get_render(ctx)
    @mcp.tool()
    def get_ass() -> str: return tools.get_ass(ctx)

    # ---- edit ----
    @mcp.tool()
    def set_group_style(gi: int, partial: dict) -> dict: return tools.set_group_style(ctx, gi, partial)
    @mcp.tool()
    def set_cue_style(word_ids: list[int], partial: dict) -> list: return tools.set_cue_style(ctx, word_ids, partial)
    @mcp.tool()
    def make_fade_tag(kind: str, word_ids: list[int]) -> dict: return tools.make_fade_tag(ctx, kind, word_ids)
    @mcp.tool()
    def clear_fade_tag(kind: str, word_ids: list[int]) -> dict: return tools.clear_fade_tag(ctx, kind, word_ids)
    @mcp.tool()
    def set_fade_tag_props(kind: str, word_ids: list[int], trigger: float | None = None, dur: float | None = None) -> dict:
        return tools.set_fade_tag_props(ctx, kind, word_ids, trigger, dur)
    @mcp.tool()
    def set_layout_props(gi: int, win_start: float | None = None, win_end: float | None = None,
                         linger: float | None = None, accumulate: str = "words") -> dict:
        return tools.set_layout_props(ctx, gi, win_start, win_end, linger, accumulate)
    @mcp.tool()
    def merge_events(gidxs: list[int]) -> list: return tools.merge_events(ctx, gidxs)
    @mcp.tool()
    def ungroup_event(gi: int) -> list: return tools.ungroup_event(ctx, gi)
    @mcp.tool()
    def split_event(gi: int, line_index: int) -> list: return tools.split_event(ctx, gi, line_index)
    @mcp.tool()
    def break_line(gi: int, li: int, ti: int, after: bool = True) -> dict: return tools.break_line(ctx, gi, li, ti, after)
    @mcp.tool()
    def merge_words(gi: int, li: int, ti: int, sep: str = "") -> dict: return tools.merge_words(ctx, gi, li, ti, sep)
    @mcp.tool()
    def delete_words(word_ids: list[int]) -> list: return tools.delete_words(ctx, word_ids)
    @mcp.tool()
    def restore_words(word_ids: list[int]) -> list: return tools.restore_words(ctx, word_ids)
    @mcp.tool()
    def set_fade_defaults(fade_in_ms: float | None = None, fade_out_ms: float | None = None, linger: float | None = None) -> dict:
        return tools.set_fade_defaults(ctx, fade_in_ms, fade_out_ms, linger)
    @mcp.tool()
    def undo() -> dict: return tools.undo(ctx)
    @mcp.tool()
    def redo() -> dict: return tools.redo(ctx)

    # ---- globals ----
    @mcp.tool()
    def get_globals() -> dict: return tools.get_globals(ctx)
    @mcp.tool()
    def set_globals(partial: dict) -> dict: return tools.set_globals(ctx, partial)

    # ---- project / build / render / burn ----
    @mcp.tool()
    def load_lyrics(json_path: str, group_by: str = "section", skip_dashes: bool = True) -> dict:
        ctx.load_lyrics(json_path, group_by, skip_dashes); return tools.get_state(ctx)
    @mcp.tool()
    def load_project(path: str) -> dict: return tools.load_project(ctx, path)
    @mcp.tool()
    def save_project(path: str) -> dict: return tools.save_project(ctx, path)
    @mcp.tool()
    def generate_ass(path: str | None = None) -> str: return tools.generate_ass(ctx, path) if path else tools.generate_ass(ctx)
    @mcp.tool()
    def render_frame(time_s: float) -> Image:
        return Image(data=tools.render_frame(ctx, time_s), format="png")
    @mcp.tool()
    def burn(out_path: str, video_in: str | None = None) -> dict: return tools.burn(ctx, out_path, video_in)
    @mcp.tool()
    def burn_status(job_id: str) -> dict: return tools.burn_status(ctx, job_id)

    # ---- resources ----
    @mcp.resource("karaoke://project")
    def res_project() -> str:
        import json
        return json.dumps({"globals": tools.get_globals(ctx), "cues": __import__("engine").serialize_cues(ctx.session.project)})
    @mcp.resource("karaoke://ass")
    def res_ass() -> str: return tools.get_ass(ctx)

    return mcp

def serve_stdio(ctx):
    build_server(ctx).run(transport="stdio")
```

Then create `mcp_server/__main__.py`:
```python
# Headless MCP entrypoint:  python -m mcp_server [--json PATH] [--project PATH] [--video PATH]
import argparse, sys
from mcp_server.context import HeadlessContext

def main(argv=None):
    ap = argparse.ArgumentParser(prog="mcp_server")
    ap.add_argument("--json", default="aligned_lyrics.json")
    ap.add_argument("--project")
    ap.add_argument("--video")
    a = ap.parse_args(argv)
    ctx = HeadlessContext()
    ctx.load_lyrics(a.json)
    if a.video: ctx.set_video(a.video)
    if a.project:
        from mcp_server import tools; tools.load_project(ctx, a.project)
    from mcp_server.server import serve_stdio
    serve_stdio(ctx)

if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run** `.venv/bin/python tests/test_mcp_server.py` → `1/1 passed` (tools registered). Also re-run `tests/test_mcp.py` (16/16) to ensure no regressions.

- [ ] **Step 5: Commit**
```bash
git add mcp_server/server.py mcp_server/__main__.py tests/test_mcp_server.py
git commit -m "feat(mcp): FastMCP server (all tools+resources) + stdio entrypoint"
```

### Task 9: HTTP transport (loopback + token)

**Files:** Modify `mcp_server/server.py`; extend `tests/test_mcp_server.py`.

- [ ] **Step 1: Write the failing test** — add to `tests/test_mcp_server.py` (start the HTTP server in a thread, connect via the MCP SSE client, list tools, stop):

```python
def t_http_serve_and_connect():
    if not HAVE: return True, "SKIP: mcp not installed"
    import threading, time, asyncio
    from mcp_server.context import HeadlessContext
    from mcp_server.server import serve_http
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    port = 8791
    stop = serve_http(ctx, host="127.0.0.1", port=port, token=None, in_thread=True)
    time.sleep(1.2)
    try:
        from mcp.client.sse import sse_client
        from mcp.client.session import ClientSession
        async def go():
            async with sse_client(f"http://127.0.0.1:{port}/sse") as (r, w):
                async with ClientSession(r, w) as s:
                    await s.initialize()
                    tl = await s.list_tools()
                    return {t.name for t in tl.tools}
        names = asyncio.new_event_loop().run_until_complete(go())
        ok = "get_state" in names and "set_group_style" in names
        return (ok), f"tools={len(names)}"
    finally:
        stop()

# register it
check("http_serve_and_connect", t_http_serve_and_connect)
```

(Place the `check(...)` call into the existing registration block; keep the file exiting 0.)

- [ ] **Step 2: Run — verify fail** (`serve_http` missing / no `in_thread`).

- [ ] **Step 3: Implement** — add `serve_http` to `mcp_server/server.py`. Run uvicorn in a daemon thread without installing signal handlers (off-main-thread safe); return a `stop()` callable. Enforce loopback + optional bearer token via a small ASGI middleware.

```python
def serve_http(ctx, host="127.0.0.1", port=8765, token=None, in_thread=False):
    import uvicorn
    if host not in ("127.0.0.1", "localhost", "::1"):
        raise ValueError("MCP HTTP endpoint is loopback-only")
    mcp = build_server(ctx)
    app = mcp.sse_app()                       # Starlette ASGI app exposing /sse + /messages
    if token:
        from starlette.middleware.base import BaseHTTPMiddleware
        from starlette.responses import PlainTextResponse
        class Auth(BaseHTTPMiddleware):
            async def dispatch(self, request, call_next):
                if request.headers.get("authorization") != f"Bearer {token}":
                    return PlainTextResponse("unauthorized", status_code=401)
                return await call_next(request)
        app.add_middleware(Auth)
    config = uvicorn.Config(app, host=host, port=port, log_level="warning")
    server = uvicorn.Server(config)
    server.install_signal_handlers = lambda: None      # safe to run off the main thread
    if not in_thread:
        server.run(); return lambda: None
    import threading
    th = threading.Thread(target=server.run, daemon=True); th.start()
    def stop():
        server.should_exit = True; th.join(timeout=5)
    return stop
```

(If this SDK build lacks `sse_app()`, use `mcp.streamable_http_app()` and connect with `mcp.client.streamable_http` instead; adjust the test's client import to match. Verify which app factory exists: `print([m for m in dir(mcp) if m.endswith('_app')])`.)

- [ ] **Step 4: Run** `.venv/bin/python tests/test_mcp_server.py` → both pass (2/2). If the SSE path name differs, fix the URL/client per the note and re-run.

- [ ] **Step 5: Commit**
```bash
git add mcp_server/server.py tests/test_mcp_server.py
git commit -m "feat(mcp): loopback HTTP/SSE transport (threaded) with optional token"
```

---

## Phase 5 — UI integration

### Task 10: `AppV2 --mcp` launches the live endpoint

**Files:** Modify `karaoke_subtitle_gui.py` (CLI + start/stop); extend `tests/test_mcp_ui.py`.

- [ ] **Step 1: Write the failing test** — add to `tests/test_mcp_ui.py` (start the endpoint bound to the LIVE app, connect from a client thread, edit, confirm the GUI updated):

```python
def t_ui_http_live_update():
    import time, asyncio, threading
    from mcp_server.context import UIContext
    from mcp_server.server import serve_http
    uctx = UIContext(app)
    port = 8792
    stop = serve_http(uctx, host="127.0.0.1", port=port, in_thread=True)
    out = {}
    def client():
        from mcp.client.sse import sse_client
        from mcp.client.session import ClientSession
        async def go():
            async with sse_client(f"http://127.0.0.1:{port}/sse") as (r, w):
                async with ClientSession(r, w) as s:
                    await s.initialize()
                    await s.call_tool("set_group_style", {"gi": 0, "partial": {"fontsize": 123}})
        asyncio.new_event_loop().run_until_complete(go()); out["done"] = True
    th = threading.Thread(target=client); th.start()
    for _ in range(150):                       # pump main loop so marshaled op runs
        app.update(); time.sleep(0.02)
        if out.get("done"): break
    th.join(3); stop()
    return (app._project["layout"][0]["style"].get("fontsize") == 123), f"style={app._project['layout'][0]['style']}"

check("ui_http_live_update", t_ui_http_live_update)
```

- [ ] **Step 2: Run — verify fail** if `serve_http` import path or app wiring is off; otherwise this already exercises the existing pieces — if it passes pre-implementation that's fine (the CLI wiring below is still needed for real use). The CLI test is manual (Step 4).

- [ ] **Step 3: Implement** — in `karaoke_subtitle_gui.py`, replace the `if __name__ == "__main__": AppV2().mainloop()` block with arg parsing that optionally starts the endpoint, and add start/stop methods to `AppV2`:

```python
    def start_mcp(self, port=8765, token=None):
        try:
            from mcp_server.context import UIContext
            from mcp_server.server import serve_http
        except Exception as e:
            self.log(f"Error: MCP server unavailable (install the 'mcp' extra): {e}"); return
        self._mcp_stop = serve_http(UIContext(self), host="127.0.0.1", port=port, token=token, in_thread=True)
        self.log(f"OK: MCP endpoint on http://127.0.0.1:{port}/sse")

    def destroy(self):
        stop = getattr(self, "_mcp_stop", None)
        if stop:
            try: stop()
            except Exception: pass
        super().destroy()
```

and the entrypoint:
```python
if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--mcp", action="store_true", help="serve a live MCP endpoint")
    ap.add_argument("--mcp-port", type=int, default=8765)
    args, _ = ap.parse_known_args()
    app = AppV2()
    if args.mcp:
        import os
        app.after(400, lambda: app.start_mcp(args.mcp_port, os.environ.get("KSS_MCP_TOKEN")))
    app.mainloop()
```

- [ ] **Step 4: Run + manual check.**
  - `.venv/bin/python tests/test_mcp_ui.py` → all pass (now 3/3 incl `ui_http_live_update`).
  - Manual: `.venv/bin/python karaoke_subtitle_gui.py --mcp` opens the GUI and logs `OK: MCP endpoint on http://127.0.0.1:8765/sse`; connecting a client and calling `set_cue_style`/`set_globals` visibly updates the dock + preview; `undo` from the GUI reverts an MCP edit (shared history).
  - Regression: `.venv/bin/python tests/test_v2_ui.py` → 27/27 (entrypoint change doesn't affect the suite, which imports the module).

- [ ] **Step 5: Commit**
```bash
git add karaoke_subtitle_gui.py tests/test_mcp_ui.py
git commit -m "feat(ui): --mcp flag starts a live MCP endpoint bound to the session"
```

---

## Phase 6 — Packaging, docs, final

### Task 11: Declare optional `mcp` dependency + docs

**Files:** Modify `pyproject.toml`, `README.md`, `CLAUDE.md`.

- [ ] **Step 1:** In `pyproject.toml`, add `mcp` and `uvicorn` as an OPTIONAL group so the core app/tests don't require them:
```toml
[tool.poetry.group.mcp]
optional = true

[tool.poetry.group.mcp.dependencies]
mcp = ">=1.2"
uvicorn = ">=0.27"
```
(Install with `poetry install --with mcp`; the `.venv` already has them via pip for development.)

- [ ] **Step 2:** README/CLAUDE: add an "MCP server" section — headless (`python -m mcp_server --json aligned_lyrics.json`, stdio; client config snippet) and live (`python karaoke_subtitle_gui.py --mcp`, HTTP/SSE on `127.0.0.1:8765/sse`); the tool catalog summary; the shared-undo behavior; loopback-only + `KSS_MCP_TOKEN`; and a note that the manual word-level edits + generic patch are Spec 2. In CLAUDE.md note `mcp_server/` layers on `engine`+`controller` via `EngineContext` (headless dict-globals/direct-run; UI tk-var-globals/main-loop-marshal).

- [ ] **Step 3: Commit**
```bash
git add pyproject.toml README.md CLAUDE.md
git commit -m "docs+build: optional mcp dependency group; MCP server docs"
```

### Task 12: Final verification

- [ ] **Step 1:** Headless engine/MCP (no Tk): `.venv/bin/python tests/test_engine.py` + `test_engine_*.py` + `.venv/bin/python tests/test_mcp.py` (16/16) + `.venv/bin/python tests/test_mcp_server.py` (2/2). Also confirm `env -u DISPLAY .venv/bin/python -c "import mcp_server.tools, mcp_server.context; print('mcp_server headless import ok')"` (no Tk).
- [ ] **Step 2:** UI suites: `.venv/bin/python tests/test_v2_ui.py` (27/27) + the new `test_ui_*.py` files + `.venv/bin/python tests/test_mcp_ui.py` (3/3).
- [ ] **Step 3:** Lazy-import guard: temporarily rename the installed `mcp` (or run in a venv without it) and confirm `python karaoke_subtitle_gui.py` (no `--mcp`) still launches and `start_mcp` logs the helpful "install the 'mcp' extra" error rather than crashing. (If you can't easily hide the package, code-review the `try/except ImportError` path instead.)
- [ ] **Step 4:** Manual end-to-end per the spec's Verification (headless stdio client; live `--mcp` with visible dock/preview update; `render_frame` PNG; `burn` to done/ok).
- [ ] **Step 5: Final commit (if any tweaks)**
```bash
git add -A && git commit -m "test: final verification for engine MCP server (Spec 1)"
```

---

## Self-review notes (coverage map)
- Spec §Architecture/EngineContext → Tasks 2,3. §Transports (stdio/http) → Tasks 8,9. §UI integration (--mcp) → Task 10.
- Tool catalog: inspect → Task 4; edit+undo → Task 5; globals+project+build → Task 6; render_frame+burn → Task 7. All registered as MCP tools in Task 8.
- §Engine addition `frame_cmd` → Task 1. §Packaging (optional dep) + docs → Task 11. §Testing (headless tools, UI-marshal, transport smoke, frame_cmd) → Tasks 1–10; final sweep Task 12.
- Decisions enforced: shared-undo (UIContext shares `app._session`; tested in test_mcp_ui), burn job-poll (Task 7), render PNG (Task 7), loopback-only + token (Task 9), optional SDK + lazy import (Tasks 10,11,12), all-`ctx.run`-marshaled (context.py).
- Out of scope (Spec 2): word timing/text/add/remove, generic `apply_patch`, model hardening — not present in any task here.
