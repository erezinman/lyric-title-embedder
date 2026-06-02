# Per-cue/group Style + Merged Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `global < group < cue` style waterfall, merge the pop-out cue editor into one window, and unify save/load — on top of a newly extracted UI-free engine so a future Tauri front-end is a view-only rewrite.

**Architecture:** Pure `engine/` package (model, render, ass, mutations, io, ffmpeg) + UI-free `controller.Session` (project + undo/redo) ← the durable plain-dict contract. CTk `app_base.App` (widgets/preview/dock) + `karaoke_subtitle_gui.AppV2` (binding only) are the only front-end layer. `old/` (v1) untouched.

**Tech Stack:** Python 3.10, CustomTkinter 5.2.2, Tk 8.6, ffmpeg+libass, Pillow (font metrics). Tests are stdlib scripts run with `python3 tests/<name>.py` (no pytest). Spec: `docs/superpowers/specs/2026-06-02-per-cue-group-style-merged-editor-design.md`.

**Conventions:**
- Branch `feat/per-cue-group-style` already exists and is checked out.
- Run all commands from the repo root `/home/erez/karaoke-subtitle-studio`.
- UI tests need a display; if headless, prefix with `xvfb-run -a `.
- Commit after every task with the shown message.

---

## File Structure

| File | Responsibility |
|---|---|
| `engine/__init__.py` | Re-export the engine's public API (one import surface). |
| `engine/model.py` | Project shape, `STYLE_KEYS`/`CUE_STYLE_KEYS`/`BUILTIN`, `make_project`, `resolve_style`, `_tag_of`. |
| `engine/render.py` | `project_to_render` (project → render-groups, carries raw `group_style` + per-word `style`). |
| `engine/ass.py` | `build_ass` (Styles-by-box-mode + per-word inline running deltas). |
| `engine/mutations.py` | Pure `(project, …) -> None` edits (tags, layout, delete, break/merge, **group/cue style**). |
| `engine/io.py` | `serialize_project` / `apply_project` (portable file; backward-compatible). |
| `engine/ffmpeg.py` | `burn_cmd`, `frame_cmd`, `probe_duration`, headless `run(cmd, progress_cb)`. |
| `controller.py` | `Session`: holds project + undo/redo, `do()/undo()/redo()`, `on_change` callback. UI-free. |
| `core.py` | Unchanged pure helpers (engine builds on these). |
| `app_base.py` | CTk view engine: merged window, per-cue preview, dock, ffmpeg polling. |
| `karaoke_subtitle_gui.py` | `AppV2` binding + the dissolved cue dock (`CueDock`) + inspector. |
| `tests/test_engine.py` | NEW headless unit tests for engine + controller (no display). |
| `tests/test_v2_ui.py` | Existing UI suite; extended + adapted to the embedded dock. |

---

## Phase 1 — Engine extraction (no behaviour change)

Characterization-test first, then move code so outputs are byte-identical. The app stays two-window through this phase.

### Task 1: Characterization tests for current pure functions

**Files:**
- Create: `tests/test_engine.py`

- [ ] **Step 1: Write the characterization test (headless, stdlib)**

```python
# tests/test_engine.py — headless engine/controller unit tests (no Tk display).
import os, sys, json, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

CFG = {"json_path": "aligned_lyrics.json", "skip_dashes": True, "group_by": "section",
       "font": "DejaVu Sans", "fontsize": 64, "bold": True, "align": 2, "fade_ms": 250,
       "play_w": 1920, "play_h": 1080, "margin_l": 80, "margin_r": 80, "margin_v": 60,
       "primary_color": "#FFFFFF", "outline_color": "#000000", "back_color": "#000000",
       "back_alpha": "80", "border_style": 1, "outline_w": 3, "shadow": 0, "wrap_style": 2}

results = []
def check(name, fn):
    try:
        ok, detail = fn(); results.append((ok, name, detail))
    except Exception as e:
        results.append((False, name, f"EXC {type(e).__name__}: {e}"))

# Import the CURRENT location for the baseline; later tasks repoint these imports.
import karaoke_subtitle_gui as m

def t_make_project():
    p = m.make_project_v2(CFG)
    return (len(p["words"]) > 50 and len(p["layout"]) > 0), f"words={len(p['words'])} layout={len(p['layout'])}"

def t_render_groups():
    p = m.make_project_v2(CFG); g = m.project_to_render_v2(p)
    return (len(g) > 0 and all("lines" in x for x in g)), f"groups={len(g)}"

def t_build_events():
    p = m.make_project_v2(CFG); g = m.project_to_render_v2(p)
    text, n = m.build_ass_v2(CFG, g)
    return (n == len(g) and "[V4+ Styles]" in text and "Dialogue:" in text), f"n={n}"

def t_serialize_roundtrip():
    p = m.make_project_v2(CFG); d = m.serialize_cues_v2(p)
    p2 = m.make_project_v2(CFG); ok = m.apply_cues_v2(p2, d)
    return (ok and len(p2["layout"]) == len(p["layout"])), f"applied={ok}"

for name, fn in list(globals().items()):
    if name.startswith("t_"): check(name, fn)
npass = sum(1 for ok, *_ in results if ok)
for ok, name, detail in results:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + ("" if ok else f"   -> {detail}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
```

- [ ] **Step 2: Run — verify it passes against current code**

Run: `python3 tests/test_engine.py`
Expected: `4/4 passed`

- [ ] **Step 3: Commit**

```bash
git add tests/test_engine.py
git commit -m "test: characterization tests for v2 engine functions"
```

### Task 2: Create `engine/` package and move `model.py`

**Files:**
- Create: `engine/__init__.py`, `engine/model.py`
- Modify: `karaoke_subtitle_gui.py:25-77` (remove moved defs, import shims)

- [ ] **Step 1: Create `engine/model.py`**

Move `BUILTIN` (currently `karaoke_subtitle_gui.py:27`), `make_project_v2` (46-70) renamed `make_project`, and `_tag_of` (73-77) verbatim. Add the style constants and resolver. New file:

```python
# engine/model.py — project shape, style keys, resolution. UI-free.
import json
import core

BUILTIN = {"fade_in_ms": 250, "fade_out_ms": 1000, "linger": 0.0}
PALETTE = ["#7a4a4a", "#4a7a4a", "#4a5a7a", "#7a6a3a", "#6a4a7a",
           "#3a7a7a", "#7a3a5a", "#5a7a3a", "#3a5a7a", "#7a5a3a"]

STYLE_KEYS = ["font", "fontsize", "bold", "primary", "outline", "back",
              "back_alpha", "outline_w", "shadow", "border_style"]
CUE_STYLE_KEYS = [k for k in STYLE_KEYS if k != "border_style"]   # C1: box-mode group-only

def make_project(cfg):
    data = json.load(open(cfg["json_path"], encoding="utf-8"))
    real = core.reconstruct_lines(data.get("aligned_lyrics") or [])
    words, line_specs = [], []
    for l in real:
        if cfg.get("skip_dashes", True) and core.is_dashes(l["text"]):
            continue
        flat = []
        for e in l["_entries"]:
            flat.extend(e.get("words") or [])
        toks = []
        for w in core.merge_subwords(flat):
            words.append({"text": w["text"], "start": w["start_s"], "end": w["end_s"]})
            toks.append({"ids": [len(words) - 1], "sep": "", "del": False, "style": {}})
        if toks:
            line_specs.append((l.get("section") or "Unknown", {"toks": toks}))
    layout = []
    for sec, line in line_specs:
        if cfg.get("group_by") == "section" and layout and layout[-1]["label"] == sec:
            layout[-1]["lines"].append(line)
        else:
            layout.append({"label": sec, "lines": [line], "accumulate": "words",
                           "win_start": None, "win_end": None, "linger": None,
                           "del": False, "style": {}})
    return {"words": words, "layout": layout, "fin_tags": [], "fout_tags": [],
            "globals": dict(BUILTIN), "palette": list(PALETTE)}

def _tag_of(tags, wid):
    for ti, t in enumerate(tags):
        if wid in t["ids"]:
            return ti, t
    return None, None

def resolve_style(token, group, gctx):
    """Resolve effective style for a token: cue -> group -> global (gctx).
    border_style resolves group -> global only (cue cannot override it, C1)."""
    ts = (token or {}).get("style") or {}
    gs = (group or {}).get("style") or {}
    out = {}
    for k in STYLE_KEYS:
        if k != "border_style" and ts.get(k) is not None:
            out[k] = ts[k]
        elif gs.get(k) is not None:
            out[k] = gs[k]
        else:
            out[k] = gctx.get(k)
    return out
```

Note: `make_project` adds `"style": {}` to every token and event vs. the original — this is additive and does not change render/build output yet.

- [ ] **Step 2: Create `engine/__init__.py`**

```python
# engine — UI-free core. Public API surface.
from engine.model import (BUILTIN, PALETTE, STYLE_KEYS, CUE_STYLE_KEYS,
                          make_project, resolve_style, _tag_of)
```

- [ ] **Step 3: Repoint `karaoke_subtitle_gui.py` (compat shims)**

Delete the moved defs (`BUILTIN` line 27, `PALETTE` 25-26, `make_project_v2` 46-70, `_tag_of` 73-77). Near the top imports add:

```python
import engine
from engine.model import make_project, _tag_of, BUILTIN, PALETTE
make_project_v2 = make_project          # back-compat name used elsewhere/tests
```

- [ ] **Step 4: Run both suites**

Run: `python3 tests/test_engine.py && xvfb-run -a python3 tests/test_v2_ui.py`
Expected: engine `4/4 passed`; UI `23/23 passed`.

- [ ] **Step 5: Commit**

```bash
git add engine/__init__.py engine/model.py karaoke_subtitle_gui.py
git commit -m "refactor: extract engine/model (make_project, resolve_style, style keys)"
```

### Task 3: Move `project_to_render` → `engine/render.py`

**Files:**
- Create: `engine/render.py`
- Modify: `karaoke_subtitle_gui.py` (remove `project_to_render_v2` 80-153, add shim), `engine/__init__.py`

- [ ] **Step 1: Create `engine/render.py`**

Move `project_to_render_v2` (80-153) verbatim as `project_to_render`, change `base.token_text` → `core.token_text`, `_tag_of` import from model, and add the two style passthroughs (marked NEW):

```python
# engine/render.py — derive render-groups from a project. UI-free.
import core
from engine.model import BUILTIN, _tag_of

def project_to_render(project):
    words = project["words"]
    G = project["globals"]
    g_fin = G.get("fade_in_ms", BUILTIN["fade_in_ms"])
    g_fout = G.get("fade_out_ms", BUILTIN["fade_out_ms"])
    g_ling = G.get("linger", BUILTIN["linger"])
    fin, fout = project["fin_tags"], project["fout_tags"]
    out = []
    for g in project["layout"]:
        if g.get("del"):
            continue
        acc = g.get("accumulate", "words")
        rlines, allspans, fade_ends = [], [], []
        line_tokens = []
        for line in g["lines"]:
            line_tokens.append([t for t in line["toks"] if not t.get("del")])
        all_ids = [i for toks in line_tokens for t in toks for i in t["ids"]]
        if not all_ids:
            continue
        base_s = min(words[i]["start"] for i in all_ids)
        base_e = max(words[i]["end"] for i in all_ids)
        win_s = g["win_start"] if g.get("win_start") is not None else base_s
        ling = g["linger"] if g.get("linger") is not None else g_ling
        win_e = g["win_end"] if g.get("win_end") is not None else base_e + ling
        for toks in line_tokens:
            if not toks:
                continue
            line_first = min(words[i]["start"] for t in toks for i in t["ids"])
            rws = []
            for tok in toks:
                tstart = min(words[i]["start"] for i in tok["ids"])
                tend = max(words[i]["end"] for i in tok["ids"])
                wid0 = tok["ids"][0]
                if acc == "off":
                    appear = win_s
                elif acc == "lines":
                    appear = line_first
                else:
                    appear = tstart
                fin_ms = g_fin
                ti, ftag = _tag_of(fin, wid0)
                if ftag is not None:
                    appear = ftag["trigger"] if ftag.get("trigger") is not None \
                        else min(words[i]["start"] for i in ftag["ids"] if i < len(words))
                    fin_ms = ftag["dur"] if ftag.get("dur") is not None else g_fin
                fo_at, fo_ms = None, g_fout
                oi, otag = _tag_of(fout, wid0)
                if otag is not None:
                    fo_at = otag["trigger"] if otag.get("trigger") is not None \
                        else max(words[i]["end"] for i in otag["ids"] if i < len(words))
                    fo_ms = otag["dur"] if otag.get("dur") is not None else g_fout
                    fade_ends.append(fo_at + fo_ms / 1000.0)
                rws.append({"text": core.token_text(words, tok), "start_s": appear, "end_s": tend,
                            "fin_ms": fin_ms, "fout_at": fo_at, "fout_ms": fo_ms,
                            "style": dict(tok.get("style") or {})})        # NEW: per-cue style
                allspans.append((tstart, tend))
            if rws:
                rlines.append({"words": rws})
        if not rlines:
            continue
        ev_e = win_e
        if fade_ends:
            ev_e = max(ev_e, max(fade_ends))
        out.append({"start": win_s, "end": ev_e, "accumulate": "words", "lines": rlines,
                    "group_style": dict(g.get("style") or {})})           # NEW: group style
    out.sort(key=lambda r: r["start"])
    return out
```

- [ ] **Step 2: Repoint + export**

In `karaoke_subtitle_gui.py` remove `project_to_render_v2` (80-153); add `from engine.render import project_to_render` and `project_to_render_v2 = project_to_render`. Add to `engine/__init__.py`: `from engine.render import project_to_render`.

- [ ] **Step 3: Run suites**

Run: `python3 tests/test_engine.py && xvfb-run -a python3 tests/test_v2_ui.py`
Expected: engine `4/4`; UI `23/23`.

- [ ] **Step 4: Commit**

```bash
git add engine/render.py engine/__init__.py karaoke_subtitle_gui.py
git commit -m "refactor: extract engine/render; carry group/cue style through render-groups"
```

### Task 4: Move `build_ass` → `engine/ass.py` (logic unchanged for now)

**Files:**
- Create: `engine/ass.py`
- Modify: `karaoke_subtitle_gui.py` (remove `build_ass_v2` 156-197 + `ESC` 24, add shim), `engine/__init__.py`

- [ ] **Step 1: Create `engine/ass.py`**

Move `build_ass_v2` (156-197) verbatim as `build_ass`, replacing `base.*` with `core.*` and the module `ESC` with `core.esc`:

```python
# engine/ass.py — render-groups -> ASS text. UI-free.
import core
ESC = core.esc

def build_ass(cfg, groups):
    pos = cfg.get("pos")
    pos_tag = f"{{\\pos({int(pos[0])},{int(pos[1])})}}" if pos else ""

    def ev_text(g):
        ev = g["start"]; parts = [pos_tag]
        for li, line in enumerate(g["lines"]):
            if li:
                parts.append("\\N")
            for w in line["words"]:
                fin = max(0, int(round((w["start_s"] - ev) * 1000)))
                fdur = int(w.get("fin_ms", 250) or 0)
                tags = ["\\alpha&HFF&"] if fdur > 0 else ["\\alpha&H00&"]
                if fdur > 0:
                    tags.append(f"\\t({fin},{fin + fdur},\\alpha&H00&)")
                fo = w.get("fout_at")
                if fo is not None:
                    ro = max(0, int(round((fo - ev) * 1000)))
                    od = int(w.get("fout_ms", 1000) or 0)
                    tags.append(f"\\t({ro},{ro + (od if od > 0 else 1)},\\alpha&HFF&)")
                parts.append("{" + "".join(tags) + "}" + ESC(w["text"]))
        return "".join(parts)

    primary = core.rgb_to_ass(cfg["primary_color"]); outline = core.rgb_to_ass(cfg["outline_color"])
    back = core.rgb_to_ass(cfg["back_color"], cfg["back_alpha"]); bold = -1 if cfg["bold"] else 0
    header = (
        "[Script Info]\n; Karaoke Subtitle Studio\nScriptType: v4.00+\n"
        f"PlayResX: {cfg['play_w']}\nPlayResY: {cfg['play_h']}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
        "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, "
        "Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Default,{cfg['font']},{cfg['fontsize']},{primary},&H000000FF,{outline},{back},"
        f"{bold},0,0,0,100,100,0,0,{cfg['border_style']},{cfg['outline_w']},{cfg['shadow']},"
        f"{cfg['align']},{cfg['margin_l']},{cfg['margin_r']},{cfg['margin_v']},1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
    out = [header]
    for g in groups:
        out.append(f"Dialogue: 0,{core.ass_time(g['start'])},{core.ass_time(g['end'])},Default,,0,0,0,,{ev_text(g)}\n")
    return "".join(out), len(groups)
```

- [ ] **Step 2: Repoint + export**

In `karaoke_subtitle_gui.py` remove `build_ass_v2` (156-197) and module-level `ESC` (24); add `from engine.ass import build_ass` and `build_ass_v2 = build_ass`. Add to `engine/__init__.py`: `from engine.ass import build_ass`.

- [ ] **Step 3: Run suites** — `python3 tests/test_engine.py && xvfb-run -a python3 tests/test_v2_ui.py` → engine `4/4`, UI `23/23`.

- [ ] **Step 4: Commit**

```bash
git add engine/ass.py engine/__init__.py karaoke_subtitle_gui.py
git commit -m "refactor: extract engine/ass (build_ass) unchanged"
```

### Task 5: Move serialize/apply → `engine/io.py`

**Files:**
- Create: `engine/io.py`
- Modify: `karaoke_subtitle_gui.py` (remove `serialize_cues_v2` 200-211, `apply_cues_v2` 214-230, add shims), `engine/__init__.py`

- [ ] **Step 1: Create `engine/io.py`** — move both functions, adding `style` round-trip (NEW lines) for groups and tokens:

```python
# engine/io.py — project (cue model) serialization. UI-free. Backward-compatible.
from engine.model import BUILTIN, PALETTE

def serialize_cues(p):
    return {"nwords": len(p["words"]), "globals": dict(p["globals"]), "palette": list(p["palette"]),
            "layout": [{"label": g["label"], "accumulate": g.get("accumulate", "words"),
                        "win_start": g.get("win_start"), "win_end": g.get("win_end"),
                        "linger": g.get("linger"), "del": g.get("del", False),
                        "style": dict(g.get("style") or {}),                       # NEW
                        "lines": [{"toks": [{"ids": list(t["ids"]), "sep": t.get("sep", ""),
                                             "del": t.get("del", False),
                                             "style": dict(t.get("style") or {})}   # NEW
                                            for t in ln["toks"]]} for ln in g["lines"]]}
                       for g in p["layout"]],
            "fin_tags": [{"ids": sorted(t["ids"]), "color": t["color"], "trigger": t.get("trigger"),
                          "dur": t.get("dur")} for t in p["fin_tags"]],
            "fout_tags": [{"ids": sorted(t["ids"]), "color": t["color"], "trigger": t.get("trigger"),
                           "dur": t.get("dur")} for t in p["fout_tags"]]}

def apply_cues(project, d):
    if not d or d.get("nwords") != len(project["words"]):
        return False
    project["globals"] = {**BUILTIN, **(d.get("globals") or {})}
    if d.get("palette"):
        project["palette"] = list(d["palette"])
    project["layout"] = [{"label": g.get("label", ""), "accumulate": g.get("accumulate", "words"),
                          "win_start": g.get("win_start"), "win_end": g.get("win_end"),
                          "linger": g.get("linger"), "del": g.get("del", False),
                          "style": dict(g.get("style") or {}),                      # NEW
                          "lines": [{"toks": [{"ids": list(t["ids"]), "sep": t.get("sep", ""),
                                               "del": t.get("del", False),
                                               "style": dict(t.get("style") or {})}  # NEW
                                              for t in ln["toks"]]} for ln in g["lines"]]}
                         for g in d.get("layout", [])]
    project["fin_tags"] = [{"ids": set(t["ids"]), "color": t["color"], "trigger": t.get("trigger"),
                            "dur": t.get("dur")} for t in d.get("fin_tags", [])]
    project["fout_tags"] = [{"ids": set(t["ids"]), "color": t["color"], "trigger": t.get("trigger"),
                             "dur": t.get("dur")} for t in d.get("fout_tags", [])]
    return True
```

- [ ] **Step 2: Repoint + export** — remove originals; add `from engine.io import serialize_cues, apply_cues` and `serialize_cues_v2 = serialize_cues; apply_cues_v2 = apply_cues`. Add both to `engine/__init__.py`.

- [ ] **Step 3: Add a style round-trip characterization test** to `tests/test_engine.py` (insert before the loop):

```python
def t_style_roundtrip():
    p = m.make_project_v2(CFG)
    p["layout"][0]["style"] = {"font": "Arial", "fontsize": 80}
    p["layout"][0]["lines"][0]["toks"][0]["style"] = {"primary": "#FF0000"}
    d = m.serialize_cues_v2(p)
    p2 = m.make_project_v2(CFG); m.apply_cues_v2(p2, d)
    g_ok = p2["layout"][0]["style"] == {"font": "Arial", "fontsize": 80}
    c_ok = p2["layout"][0]["lines"][0]["toks"][0]["style"] == {"primary": "#FF0000"}
    return (g_ok and c_ok), f"group={g_ok} cue={c_ok}"
```

- [ ] **Step 4: Run suites** — `python3 tests/test_engine.py && xvfb-run -a python3 tests/test_v2_ui.py` → engine `5/5`, UI `23/23`.

- [ ] **Step 5: Commit**

```bash
git add engine/io.py engine/__init__.py karaoke_subtitle_gui.py tests/test_engine.py
git commit -m "refactor: extract engine/io with group/cue style round-trip"
```

### Task 6: Extract ffmpeg helpers → `engine/ffmpeg.py`

**Files:**
- Create: `engine/ffmpeg.py`
- Modify: `app_base.py` (`_probe_duration` 613-622, `on_burn` 728-762 use the new helpers), `engine/__init__.py`

- [ ] **Step 1: Create `engine/ffmpeg.py`** (pure command builders + headless runner, no tkinter):

```python
# engine/ffmpeg.py — ffmpeg command construction + headless progress runner. UI-free.
import subprocess
from core import FFMPEG, FFPROBE

def _escape_ass(path):
    return path.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")

def burn_cmd(video_in, ass_path, out_path):
    return [FFMPEG, "-y", "-hide_banner", "-i", video_in,
            "-vf", f"ass='{_escape_ass(ass_path)}'", "-c:a", "copy",
            "-progress", "pipe:1", "-nostats", out_path]

def probe_duration(path):
    import os
    if not os.path.isfile(FFPROBE):
        return None
    try:
        out = subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration",
                              "-of", "default=nokey=1:noprint_wrappers=1", path],
                             capture_output=True, text=True, timeout=10).stdout.strip()
        return float(out)
    except Exception:
        return None

def run(cmd, total, progress_cb):
    """Run an ffmpeg -progress command; call progress_cb(frac in 0..0.999) as it
    advances. Returns (ok, err_text). No Tk — caller adapts to its event loop."""
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    except Exception as e:
        return False, str(e)
    for line in proc.stdout:
        line = line.strip()
        if line.startswith("out_time_us=") or line.startswith("out_time_ms="):
            try:
                secs = int(line.split("=")[1]) / 1_000_000
                if total:
                    progress_cb(min(secs / total, 0.999))
            except (ValueError, ZeroDivisionError):
                pass
    err = proc.stderr.read(); rc = proc.wait()
    return (rc == 0), (None if rc == 0 else err)
```

- [ ] **Step 2: Use helpers in `app_base.py`**

Replace `_probe_duration` body (613-622) with `return engine.ffmpeg.probe_duration(path)` (add `import engine.ffmpeg` at top). In `on_burn` (728-762), build the command via `engine.ffmpeg.burn_cmd(self.vid_var.get(), self.ass_var.get(), self.out_var.get())`, set `total = engine.ffmpeg.probe_duration(...) or total_duration(self._groups) or 1.0`, and in the worker thread call `ok, err = engine.ffmpeg.run(cmd, total, lambda f: self._burn_state.__setitem__("frac", f))` then `self._burn_state.update(done=True, err=(None if ok else err))`. Keep the existing `_poll_burn` main-thread loop unchanged.

- [ ] **Step 3: Export + run UI suite** — add `from engine import ffmpeg` to `engine/__init__.py`. Run: `xvfb-run -a python3 tests/test_v2_ui.py` → `23/23`. (Burn isn't exercised headlessly; verify import + a manual burn in Phase 5 smoke.)

- [ ] **Step 4: Commit**

```bash
git add engine/ffmpeg.py engine/__init__.py app_base.py
git commit -m "refactor: extract engine/ffmpeg (cmd builders + headless run)"
```

---

## Phase 2 — Controller + pure mutations

### Task 7: Pure mutations module

**Files:**
- Create: `engine/mutations.py`
- Modify: `engine/__init__.py`

Move the *logic* of the current `AppV2` mutation methods (`karaoke_subtitle_gui.py:347-452`) into pure functions that take `project` first and **do not** call `push_undo`/`_rebuild_render` (the controller will). Signatures below are the contract used by later tasks.

- [ ] **Step 1: Create `engine/mutations.py`**

```python
# engine/mutations.py — pure project edits: (project, ...) -> None (mutate in place).
# The controller snapshots for undo and triggers rebuild; these never touch UI.
from engine.model import STYLE_KEYS, CUE_STYLE_KEYS

def _next_color(project, lane):
    used = {t["color"] for t in project[lane]}
    pal = project["palette"]
    for c in range(len(pal)):
        if c not in used:
            return c
    return len(project[lane]) % len(pal)

def make_tag(project, lane, ids):
    ids = set(ids)
    if not ids:
        return
    for t in project[lane]:
        t["ids"] -= ids
    project[lane][:] = [t for t in project[lane] if t["ids"]]
    project[lane].append({"ids": ids, "color": _next_color(project, lane),
                          "trigger": None, "dur": None})

def clear_tag(project, lane, ids):
    for t in project[lane]:
        t["ids"] -= set(ids)
    project[lane][:] = [t for t in project[lane] if t["ids"]]

def set_tag_props(project, lane, ti, trigger, dur):
    project[lane][ti]["trigger"] = trigger
    project[lane][ti]["dur"] = dur

def set_global(project, key, val):
    project["globals"][key] = val

def set_layout_props(project, gi, win_start, win_end, linger, accumulate):
    g = project["layout"][gi]
    g["win_start"] = win_start; g["win_end"] = win_end
    g["linger"] = linger; g["accumulate"] = accumulate

def _clean(style, allowed):
    return {k: v for k, v in style.items() if k in allowed and v is not None}

def set_group_style(project, gi, partial):
    """Merge partial into layout[gi]['style']; keys mapped to None are cleared (inherit)."""
    st = dict(project["layout"][gi].get("style") or {})
    for k, v in partial.items():
        if k not in STYLE_KEYS:
            continue
        if v is None:
            st.pop(k, None)
        else:
            st[k] = v
    project["layout"][gi]["style"] = _clean(st, STYLE_KEYS)

def set_cue_style(project, ids, partial):
    """Apply partial to every token covered by `ids` (a set of word ids).
    None value clears that key (inherit). border_style is ignored (C1)."""
    idset = set(ids)
    for g in project["layout"]:
        for ln in g["lines"]:
            for tok in ln["toks"]:
                if any(i in idset for i in tok["ids"]):
                    st = dict(tok.get("style") or {})
                    for k, v in partial.items():
                        if k not in CUE_STYLE_KEYS:
                            continue
                        if v is None:
                            st.pop(k, None)
                        else:
                            st[k] = v
                    tok["style"] = _clean(st, CUE_STYLE_KEYS)

def toggle_word_del(project, ids, value):
    idset = set(ids)
    for g in project["layout"]:
        for ln in g["lines"]:
            for tok in ln["toks"]:
                if any(i in idset for i in tok["ids"]):
                    tok["del"] = value

def add_break(project, gi, li, ti, after=True):
    ln = project["layout"][gi]["lines"][li]; toks = ln["toks"]
    pos = ti + 1 if after else ti
    if 0 < pos < len(toks):
        project["layout"][gi]["lines"][li:li + 1] = [{"toks": toks[:pos]}, {"toks": toks[pos:]}]

def merge_prev_word(project, gi, li, ti, sep=""):
    toks = project["layout"][gi]["lines"][li]["toks"]
    if ti > 0:
        ids = toks[ti - 1]["ids"] + toks[ti]["ids"]
        toks[ti - 1:ti + 1] = [{"ids": ids, "sep": sep, "del": toks[ti - 1].get("del", False),
                                "style": dict(toks[ti - 1].get("style") or {})}]

def layout_merge(project, gidxs):
    idx = sorted(set(gidxs))
    if len(idx) < 2 or idx != list(range(idx[0], idx[-1] + 1)):
        return False
    L = project["layout"]; first = L[idx[0]]
    lines = [ln for gi in idx for ln in L[gi]["lines"]]
    merged = {**first, "lines": lines, "win_start": None, "win_end": None}
    project["layout"] = L[:idx[0]] + [merged] + L[idx[-1] + 1:]
    return True

def layout_ungroup(project, gi):
    L = project["layout"]; g = L[gi]
    new = [{"label": g["label"], "lines": [ln], "accumulate": g["accumulate"],
            "win_start": None, "win_end": None, "linger": g.get("linger"),
            "del": False, "style": dict(g.get("style") or {})} for ln in g["lines"]]
    project["layout"] = L[:gi] + new + L[gi + 1:]

def layout_split_event(project, gi, li):
    L = project["layout"]; g = L[gi]
    if 0 < li < len(g["lines"]):
        a = {**g, "lines": g["lines"][:li], "win_start": None, "win_end": None}
        b = {**g, "lines": g["lines"][li:], "win_start": None, "win_end": None}
        project["layout"] = L[:gi] + [a, b] + L[gi + 1:]
```

- [ ] **Step 2: Export** — add `from engine import mutations` to `engine/__init__.py`.

- [ ] **Step 3: Add mutation unit tests** to `tests/test_engine.py`:

```python
from engine import mutations as mut

def t_set_group_style():
    p = m.make_project_v2(CFG)
    mut.set_group_style(p, 0, {"font": "Arial", "fontsize": 90})
    mut.set_group_style(p, 0, {"font": None})            # clear -> inherit
    return (p["layout"][0]["style"] == {"fontsize": 90}), f"{p['layout'][0]['style']}"

def t_set_cue_style_border_ignored():
    p = m.make_project_v2(CFG)
    wid = p["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    mut.set_cue_style(p, {wid}, {"primary": "#00FF00", "border_style": 3})
    st = p["layout"][0]["lines"][0]["toks"][0]["style"]
    return (st == {"primary": "#00FF00"}), f"{st}"   # border_style dropped (C1)
```

- [ ] **Step 4: Run** — `python3 tests/test_engine.py` → `7/7 passed`.

- [ ] **Step 5: Commit**

```bash
git add engine/mutations.py engine/__init__.py tests/test_engine.py
git commit -m "feat(engine): pure mutations incl. set_group_style / set_cue_style"
```

### Task 8: `controller.Session` + rewire `AppV2`

**Files:**
- Create: `controller.py`
- Modify: `karaoke_subtitle_gui.py` (AppV2 undo/redo 280-296 + mutation methods 347-452 become pass-throughs)

- [ ] **Step 1: Create `controller.py`**

```python
# controller.py — UI-free session: project + undo/redo + change notification.
import copy
from engine import mutations
from engine.render import project_to_render

class Session:
    def __init__(self, project=None, on_change=None):
        self.project = project
        self.on_change = on_change      # callable(); fired after every applied edit
        self._undo, self._redo = [], []

    def set_project(self, project):
        self.project = project
        self._undo, self._redo = [], []
        self._fire()

    def render(self):
        return project_to_render(self.project) if self.project else []

    def _fire(self):
        if self.on_change:
            self.on_change()

    def do(self, fn_name, *args, **kw):
        """Snapshot, apply engine.mutations.<fn_name>, fire change. Returns the
        mutation's return value (e.g. layout_merge -> bool)."""
        if self.project is None:
            return None
        self._undo.append(copy.deepcopy(self.project))
        if len(self._undo) > 100:
            self._undo.pop(0)
        self._redo.clear()
        rv = getattr(mutations, fn_name)(self.project, *args, **kw)
        self._fire()
        return rv

    def undo(self):
        if self._undo:
            self._redo.append(copy.deepcopy(self.project))
            self.project = self._undo.pop(); self._fire()

    def redo(self):
        if self._redo:
            self._undo.append(copy.deepcopy(self.project))
            self.project = self._redo.pop(); self._fire()
```

- [ ] **Step 2: Rewire `AppV2`**

In `AppV2.__init__`, create `self.session = controller.Session(on_change=self._rebuild_render)`. Replace the `_project` attribute with a property backed by the session:

```python
@property
def _project(self):
    return self.session.project
@_project.setter
def _project(self, v):
    self.session.set_project(v)
```

Replace `push_undo/undo/redo` (280-296) with delegations to `self.session`. Replace each mutation method (337-452) with a thin pass-through, e.g.:

```python
def set_global(self, key, val):        self.session.do("set_global", key, val)
def make_tag(self, lane, ids):         self.session.do("make_tag", lane, set(ids))
def set_group_style(self, gi, partial): self.session.do("set_group_style", gi, partial)
def set_cue_style(self, ids, partial):  self.session.do("set_cue_style", set(ids), partial)
def layout_merge(self, gidxs):
    if not self.session.do("layout_merge", set(gidxs)):
        self.log("Merge events: select adjacent layout groups")
# ...same pattern for clear_tag, set_tag_props, set_layout_props, toggle_word_del,
#    add_break, merge_prev_word, layout_ungroup, layout_split_event
```

Note: `set_project` fires `on_change`→`_rebuild_render`; ensure `_rebuild_render` tolerates being called before the preview canvas exists (it already guards with `hasattr(self, "time_scale")`).

- [ ] **Step 3: Run suites** — `python3 tests/test_engine.py && xvfb-run -a python3 tests/test_v2_ui.py` → engine `7/7`, UI `23/23` (the suite reads `app._project` and calls `app.make_tag`, `app.undo`, etc. — all preserved).

- [ ] **Step 4: Commit**

```bash
git add controller.py karaoke_subtitle_gui.py
git commit -m "refactor: AppV2 delegates project + mutations to controller.Session"
```

### Task 9: Engine isolation smoke (no Tk)

**Files:** Modify `tests/test_engine.py`

- [ ] **Step 1: Add a Tk-absent import test** (proves the engine + controller don't import tkinter):

```python
def t_engine_no_tk():
    import importlib, engine, controller
    importlib.reload(engine)
    bad = [n for n in list(sys.modules) if n == "tkinter" or n.startswith("tkinter.")]
    # engine/controller themselves must not pull tkinter at import time:
    src_ok = True
    for modname in ("engine.model", "engine.render", "engine.ass", "engine.io",
                    "engine.mutations", "engine.ffmpeg", "controller"):
        mod = sys.modules.get(modname)
        if mod and "tkinter" in getattr(mod, "__dict__", {}):
            src_ok = False
    return (src_ok), f"tkinter_in_engine_ns={not src_ok} (loaded elsewhere ok)"
```

- [ ] **Step 2: Run** — `python3 tests/test_engine.py` → `8/8 passed`.

- [ ] **Step 3: Commit**

```bash
git add tests/test_engine.py
git commit -m "test: assert engine/controller carry no tkinter in their namespace"
```

---

## Phase 3 — Per-cue/group style in build + preview

### Task 10: Style-aware `build_ass` (Styles-by-box-mode + inline deltas)

**Files:**
- Modify: `engine/ass.py`
- Modify: `tests/test_engine.py`

- [ ] **Step 1: Write failing build tests** (append to `tests/test_engine.py`):

```python
def t_build_two_styles_for_boxmode():
    p = m.make_project_v2(CFG)
    mut.set_group_style(p, 1, {"border_style": 3})     # second event = opaque box
    g = m.project_to_render_v2(p); text, n = m.build_ass_v2(CFG, g)
    n_styles = text.count("\nStyle: ")
    return (n_styles == 2 and "Style: Box," in text), f"n_styles={n_styles}"

def t_build_inline_cue_color():
    p = m.make_project_v2(CFG)
    wid = p["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    mut.set_cue_style(p, {wid}, {"primary": "#FF0000"})
    g = m.project_to_render_v2(p); text, n = m.build_ass_v2(CFG, g)
    # #FF0000 -> ASS &H0000FF& on \1c
    return ("\\1c&H0000FF&" in text), "missing inline 1c override"
```

- [ ] **Step 2: Run — verify FAIL** — `python3 tests/test_engine.py` → the two new tests FAIL (single Style, no inline color).

- [ ] **Step 3: Implement style resolution in `build_ass`**

Rewrite `engine/ass.py` so it (a) computes, per render-group, the resolved box-mode and emits one Style per distinct value; (b) emits per-word inline tags via running deltas. Replace the file body with:

```python
# engine/ass.py — render-groups -> ASS text with global<group<cue style. UI-free.
import core
ESC = core.esc

_STYLE_FOR_BORDER = {1: "Default", 3: "Box"}   # box-mode -> style name (C1)

def _gctx(cfg):
    return {"font": cfg["font"], "fontsize": cfg["fontsize"], "bold": cfg["bold"],
            "primary": cfg["primary_color"], "outline": cfg["outline_color"],
            "back": cfg["back_color"], "back_alpha": cfg["back_alpha"],
            "outline_w": cfg["outline_w"], "shadow": cfg["shadow"],
            "border_style": cfg["border_style"]}

def _resolve(word_style, group_style, gctx):
    out = {}
    for k in gctx:
        if k != "border_style" and (word_style or {}).get(k) is not None:
            out[k] = word_style[k]
        elif (group_style or {}).get(k) is not None:
            out[k] = group_style[k]
        else:
            out[k] = gctx[k]
    return out

def _style_tags(prev, cur):
    """Emit inline tags for properties that changed prev->cur (running delta)."""
    t = []
    if cur["font"] != prev["font"]:           t.append(f"\\fn{cur['font']}")
    if cur["fontsize"] != prev["fontsize"]:   t.append(f"\\fs{int(cur['fontsize'])}")
    if cur["bold"] != prev["bold"]:           t.append(f"\\b{1 if cur['bold'] else 0}")
    if cur["primary"] != prev["primary"]:     t.append(f"\\1c{core.rgb_to_ass(cur['primary'])}")
    if cur["outline"] != prev["outline"]:     t.append(f"\\3c{core.rgb_to_ass(cur['outline'])}")
    if cur["back"] != prev["back"]:           t.append(f"\\4c{core.rgb_to_ass(cur['back'])}")
    if cur["back_alpha"] != prev["back_alpha"]: t.append(f"\\4a&H{str(cur['back_alpha']).upper()[:2]}&")
    if cur["outline_w"] != prev["outline_w"]: t.append(f"\\bord{cur['outline_w']}")
    if cur["shadow"] != prev["shadow"]:       t.append(f"\\shad{cur['shadow']}")
    return "".join(t)

def _group_border(group_style, gctx):
    bs = (group_style or {}).get("border_style")
    return bs if bs is not None else gctx["border_style"]

def build_ass(cfg, groups):
    pos = cfg.get("pos")
    pos_tag = f"{{\\pos({int(pos[0])},{int(pos[1])})}}" if pos else ""
    gctx = _gctx(cfg)

    def ev_text(g):
        ev = g["start"]; parts = [pos_tag]
        baseline = dict(gctx)            # Style provides global; reset per event
        cur = dict(baseline)
        for li, line in enumerate(g["lines"]):
            if li:
                parts.append("\\N")
            for w in line["words"]:
                res = _resolve(w.get("style"), g.get("group_style"), gctx)
                fin = max(0, int(round((w["start_s"] - ev) * 1000)))
                fdur = int(w.get("fin_ms", 250) or 0)
                tags = [_style_tags(cur, res)]; cur = res
                tags.append("\\alpha&HFF&" if fdur > 0 else "\\alpha&H00&")
                if fdur > 0:
                    tags.append(f"\\t({fin},{fin + fdur},\\alpha&H00&)")
                fo = w.get("fout_at")
                if fo is not None:
                    ro = max(0, int(round((fo - ev) * 1000)))
                    od = int(w.get("fout_ms", 1000) or 0)
                    tags.append(f"\\t({ro},{ro + (od if od > 0 else 1)},\\alpha&HFF&)")
                parts.append("{" + "".join(tags) + "}" + ESC(w["text"]))
        return "".join(parts)

    # distinct box-modes actually used (group-resolved)
    borders = sorted({_group_border(g.get("group_style"), gctx) for g in groups} | {gctx["border_style"]})
    primary = core.rgb_to_ass(cfg["primary_color"]); outline = core.rgb_to_ass(cfg["outline_color"])
    back = core.rgb_to_ass(cfg["back_color"], cfg["back_alpha"]); bold = -1 if cfg["bold"] else 0
    style_lines = []
    for bs in borders:
        name = _STYLE_FOR_BORDER.get(bs, f"B{bs}")
        style_lines.append(
            f"Style: {name},{cfg['font']},{cfg['fontsize']},{primary},&H000000FF,{outline},{back},"
            f"{bold},0,0,0,100,100,0,0,{bs},{cfg['outline_w']},{cfg['shadow']},"
            f"{cfg['align']},{cfg['margin_l']},{cfg['margin_r']},{cfg['margin_v']},1")
    header = (
        "[Script Info]\n; Karaoke Subtitle Studio\nScriptType: v4.00+\n"
        f"PlayResX: {cfg['play_w']}\nPlayResY: {cfg['play_h']}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
        "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, "
        "Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        + "\n".join(style_lines) + "\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
    out = [header]
    for g in groups:
        bs = _group_border(g.get("group_style"), gctx)
        sname = _STYLE_FOR_BORDER.get(bs, f"B{bs}")
        out.append(f"Dialogue: 0,{core.ass_time(g['start'])},{core.ass_time(g['end'])},{sname},,0,0,0,,{ev_text(g)}\n")
    return "".join(out), len(groups)
```

- [ ] **Step 4: Run — verify PASS** — `python3 tests/test_engine.py` → all pass (now `12/12`). Then `xvfb-run -a python3 tests/test_v2_ui.py` → `23/23` (its `t_build_valid` still holds: one Style when no overrides).

- [ ] **Step 5: Commit**

```bash
git add engine/ass.py tests/test_engine.py
git commit -m "feat(engine): style-aware build_ass (box-mode Styles + inline deltas)"
```

### Task 11: Per-cue live preview (word-by-word)

**Files:**
- Modify: `app_base.py` (`_draw_text_approx` 428-472; add a font-cache + style-resolve helper)

- [ ] **Step 1: Add a preview style resolver + font cache to `app_base.App`**

Add near `_font_px_factor`:

```python
def _pv_gctx(self):
    return {"font": self.font_var.get(), "fontsize": self.size_var.get(),
            "bold": self.bold_var.get(), "primary": self._color["primary"],
            "outline": self._color["outline"]}

def _pv_resolve(self, word_style, group_style):
    g = self._pv_gctx(); out = {}
    for k in g:
        if (word_style or {}).get(k) is not None:    out[k] = word_style[k]
        elif (group_style or {}).get(k) is not None: out[k] = group_style[k]
        else:                                        out[k] = g[k]
    return out

def _pv_font(self, family, size, bold):
    import tkinter.font as tkfont
    px = max(8, round(size * self._font_px_factor(family) / self.sy()))
    key = (family, px, bool(bold))
    f = getattr(self, "_pv_fonts", None)
    if f is None:
        f = self._pv_fonts = {}
    if key not in f:
        f[key] = tkfont.Font(family=family, size=-px, weight="bold" if bold else "normal")
    return f[key]
```

- [ ] **Step 2: Rewrite `_draw_text_approx` to render word-by-word**

Replace the method body (428-472) with per-word layout. Each line: measure ALL words (appeared + pending) in their resolved fonts to fix positions; draw only appeared words, each in its own font/colors; line height = max linespace.

```python
def _draw_text_approx(self):
    self.canvas.delete("tx")
    if not self._groups:
        return
    t = self.time_var.get()
    ev = next((g for g in self._groups if g["start"] <= t <= g["end"]), None)
    if ev is None:
        return
    al = ALIGN_LABELS[self.align_var.get()]
    l, top, r, b = self.box
    ax = l if al in (1, 4, 7) else r if al in (3, 6, 9) else (l + r) / 2
    ay = b if al in (1, 2, 3) else top if al in (7, 8, 9) else (top + b) / 2
    gstyle = ev.get("group_style") or {}
    mode = ev.get("accumulate", "words")
    # build per-line word layouts (text, x, font, colors, appeared)
    rows = []
    for line in ev["lines"]:
        ws = line["words"]
        items, widths, fonts = [], [], []
        for w in ws:
            res = self._pv_resolve(w.get("style"), gstyle)
            f = self._pv_font(res["font"], res["fontsize"], res["bold"])
            wtxt = w["text"]
            widths.append(f.measure(wtxt)); fonts.append(f)
            if mode == "words":
                appeared = w["start_s"] <= t
            elif mode == "lines":
                appeared = bool(ws) and ws[0]["start_s"] <= t
            else:
                appeared = True
            items.append((wtxt, res, appeared))
        rows.append((items, widths, fonts))
    n = len(rows)
    # vertical block placement (same anchoring rule as before)
    lhs = [max((fnt.metrics("linespace") for fnt in fonts), default=0) or 1 for _, _, fonts in rows]
    total_h = sum(lhs)
    block_top = ay - total_h if al in (1, 2, 3) else ay if al in (7, 8, 9) else ay - total_h / 2
    y = block_top
    for (items, widths, fonts), lh in zip(rows, lhs):
        full_w = sum(widths)
        lx = ax if al in (1, 4, 7) else ax - full_w if al in (3, 6, 9) else ax - full_w / 2
        x = lx
        for (wtxt, res, appeared), wbw, fnt in zip(items, widths, fonts):
            if appeared and wtxt.strip():
                for ox, oy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    self.canvas.create_text(x + ox, y + oy, text=wtxt, fill=res["outline"],
                                            font=fnt, anchor="nw", tags="tx")
                self.canvas.create_text(x, y, text=wtxt, fill=res["primary"],
                                        font=fnt, anchor="nw", tags="tx")
            x += wbw
        y += lh
```

- [ ] **Step 3: Manual + automated verify**

Run `xvfb-run -a python3 tests/test_v2_ui.py` → `23/23` (preview-couple + render tests still pass). Then a manual smoke (Phase 5 covers visual): with a real display, `python3 karaoke_subtitle_gui.py`, scrub the timeline — words appear in their final positions exactly as before when no per-cue style is set.

- [ ] **Step 4: Commit**

```bash
git add app_base.py
git commit -m "feat(view): per-cue word-by-word live preview (mixed fonts/sizes/colors)"
```

---

## Phase 4 — Merged window + dock

### Task 12: Rename `CueTableEditor` → `CueDock`; keep compat accessors

**Files:**
- Modify: `karaoke_subtitle_gui.py` (class 488-993; `open_editor` 301-306; tests rely on `app._editor`, `app.open_editor`, `ed.*`)

- [ ] **Step 1: Rename the class** `CueTableEditor` → `CueDock` (keep it a `ctk.CTkToplevel` for THIS task — only the name changes). Keep all methods/attributes identical (`rows`, `_click`, `_range_click`, `_drag_release`, `_group`, `reload`, `collapsed`, panes `L/I/O`, etc.).

- [ ] **Step 2: Update `open_editor`** to instantiate `CueDock` and keep `self._editor` pointing at it (compat for the suite):

```python
def open_editor(self):
    if self._project is None:
        self.log("Load a lyrics JSON first."); return
    if self._editor is not None and self._editor.winfo_exists():
        self._editor.lift(); return
    self._editor = CueDock(self)
```

- [ ] **Step 3: Run UI suite** — `xvfb-run -a python3 tests/test_v2_ui.py` → `23/23` (pure rename).

- [ ] **Step 4: Commit**

```bash
git add karaoke_subtitle_gui.py
git commit -m "refactor: rename CueTableEditor -> CueDock (no behaviour change)"
```

### Task 13: Make `CueDock` embeddable (frame parent) + Detach toggle

**Files:**
- Modify: `karaoke_subtitle_gui.py` (`CueDock.__init__`, `_build`), `app_base.py` (`_build` adds a dock container + separator)

- [ ] **Step 1: Parameterize `CueDock` to mount into any parent**

Change `CueDock.__init__(self, app)` to `__init__(self, app, parent=None)`. If `parent is None`, behave as today (Toplevel: `super().__init__(app)`, set title/geometry/transient). If `parent` is given, build the same widgets inside `parent` instead of `self` — extract the widget-building body of `_build` into `_build_into(container)` and call it with either `self` (Toplevel) or the given `parent`. The toolbar's Theme menu and Close button are omitted when embedded (theme lives in the main toolbar; there's nothing to close). Add a **Detach** button to the cue toolbar that calls `self.app.toggle_dock_detached()`.

- [ ] **Step 2: Add the dock container + adjustable separator to the main window**

In `app_base.App._build`, below `main` and above the action `bar`, add a vertical layout: the existing `main` (rail+preview) on top, a draggable separator, then `self.dock_holder = ctk.CTkFrame(self)` packed `fill="x"`. Provide height adjustment by binding `<B1-Motion>` on the separator to change `dock_holder`'s requested height (`configure(height=…)` + `pack_propagate(False)`), clamped to `[120, screenheight//2]`.

- [ ] **Step 3: Implement embed/detach in `AppV2`**

```python
def _mount_dock(self):
    if self._editor is not None and self._editor.winfo_exists():
        self._editor.destroy()
    self._editor = CueDock(self, parent=self.dock_holder)   # embedded
    self._dock_detached = False

def toggle_dock_detached(self):
    detached = not getattr(self, "_dock_detached", False)
    if self._editor is not None and self._editor.winfo_exists():
        self._editor.destroy()
    self._editor = CueDock(self, parent=None) if detached else CueDock(self, parent=self.dock_holder)
    self._dock_detached = detached
```

Call `self._mount_dock()` once after the first project loads (in `_on_project_loaded` or right after `_reload_groups`). Keep `open_editor()` as a compat shim:

```python
def open_editor(self):
    if self._editor is None or not self._editor.winfo_exists():
        self._mount_dock()
    return self._editor
```

- [ ] **Step 4: Adapt the test harness**

`tests/test_v2_ui.py` calls `app.open_editor(); ed = app._editor`. With the dock auto-mounted, `open_editor()` returns the embedded dock; `ed` keeps the same interface. Run `xvfb-run -a python3 tests/test_v2_ui.py` → `23/23`. If a test asserted a Toplevel-only attribute, switch it to the embedded equivalent (none expected — all used attributes are preserved).

- [ ] **Step 5: Commit**

```bash
git add karaoke_subtitle_gui.py app_base.py
git commit -m "feat(view): embed cue dock in main window with adjustable height + Detach"
```

### Task 14: Left rail — Style | Inspector tabview; move globals/props

**Files:**
- Modify: `app_base.py` (`_build`/`_build_io`/`_build_style` 73-208 → into a Style tab), `karaoke_subtitle_gui.py` (`CueDock`: move its Properties + Global-defaults panels into a rail Inspector tab)

- [ ] **Step 1: Add a left-rail `CTkTabview`** in `app_base.App._build`: replace the single scrollable `controls` with a `CTkTabview` having tabs `"Style"` and `"Inspector"`. Put the existing IO + Style controls (`_build_io`, `_build_style`) inside a scrollable frame on the **Style** tab. Expose `self.inspector_tab` (the Inspector tab frame) for the app/dock to populate.

- [ ] **Step 2: Relocate the dock's inspector** — move `CueDock`'s `_build_props`/`_refresh_props` and the Global-defaults entries to render into `self.app.inspector_tab` instead of inside the dock. `CueDock` keeps owning selection state and calls `self.app._refresh_inspector()` on selection; the inspector reads `app._editor` selection (`sel_lane`, `sel_ids`, `sel_word`, `sel_group`). Keep method names so existing flows (`_after_select` → `_refresh_props`) still fire; `_refresh_props` now targets the rail.

- [ ] **Step 3: Run UI suite** — `xvfb-run -a python3 tests/test_v2_ui.py` → `23/23`. The suite drives selection via the dock and reads `app._project`; the inspector relocation doesn't change those. Verify `t_tag_override_and_clear` and `t_layout_linger_extends_window` still pass (they exercise `_apply_tag`/`_apply_layout`, which now live in the rail).

- [ ] **Step 4: Commit**

```bash
git add app_base.py karaoke_subtitle_gui.py
git commit -m "feat(view): left-rail Style | Inspector tabs; inspector hosts cue/group props"
```

---

## Phase 5 — Style editing UI (the feature surface)

### Task 15: Inspector style controls — GROUP tier

**Files:**
- Modify: `karaoke_subtitle_gui.py` (`_refresh_props` GROUP branch ~927-940)

- [ ] **Step 1: Add per-group style widgets** to the GROUP branch of `_refresh_props`. For each of the 10 group style keys render: a label, a control, and a grey-italic inherited hint showing the global value. Controls: size/outline_w/shadow → `CTkEntry` (blank = inherit); font → `CTkComboBox` with an `"(inherit)"` sentinel + a Choose… button reusing `self.app._choose_font` into a temp var; bold & border_style → `CTkOptionMenu` values `["(inherit)", "on/off"]` / `["(inherit)", "outline", "box"]`; colors (primary/outline/back) → a swatch `CTkButton` that shows the override color or a faint global with an "×" to clear; back_alpha → entry. An **Apply** button calls:

```python
def _apply_group_style(self):
    partial = {}
    partial["font"] = None if self._gs_font.get() in ("", "(inherit)") else self._gs_font.get()
    partial["fontsize"] = self._opt_int(self._gs_size)         # helper: "" -> None else int
    partial["bold"] = self._opt_bool(self._gs_bold)            # "(inherit)"->None
    partial["border_style"] = self._opt_border(self._gs_border)
    partial["outline_w"] = self._opt_int(self._gs_obord)
    partial["shadow"] = self._opt_int(self._gs_oshad)
    partial["back_alpha"] = None if self._gs_balpha.get() == "" else self._gs_balpha.get().upper()[:2]
    partial.update(self._gs_color_overrides)   # {primary/outline/back: hex or None}
    self.app.set_group_style(self.sel_group, partial)
```

Add the small `_opt_int/_opt_bool/_opt_border` helpers (return `None` for the inherit sentinel/blank). Colors are tracked in `self._gs_color_overrides` updated by the swatch buttons (set on pick, `None` on clear).

- [ ] **Step 2: Verify reactivity** — `xvfb-run -a python3 tests/test_v2_ui.py` → `23/23`. Add a UI test `t_group_style_apply` (see Task 17). Manual: select an event header, set font/size/box-mode, Apply → preview + Render now change for that event only.

- [ ] **Step 3: Commit**

```bash
git add karaoke_subtitle_gui.py
git commit -m "feat(view): GROUP-tier style overrides in the inspector"
```

### Task 16: Inspector style controls — CUE (word) tier

**Files:**
- Modify: `karaoke_subtitle_gui.py` (`_refresh_props` WORD branch ~958-963)

- [ ] **Step 1: Add per-cue style widgets** to the WORD branch — same controls as Task 15 **minus border_style** (C1), with inherited hints showing the resolved GROUP value (which itself falls back to global). The target id set = the current word/selection:

```python
def _apply_cue_style(self):
    ids = set(self.sel_ids) if self.sel_ids else ({self.sel_word[3]} if self.sel_word else set())
    if not ids:
        return
    partial = {}
    partial["font"] = None if self._cs_font.get() in ("", "(inherit)") else self._cs_font.get()
    partial["fontsize"] = self._opt_int(self._cs_size)
    partial["bold"] = self._opt_bool(self._cs_bold)
    partial["outline_w"] = self._opt_int(self._cs_obord)
    partial["shadow"] = self._opt_int(self._cs_oshad)
    partial["back_alpha"] = None if self._cs_balpha.get() == "" else self._cs_balpha.get().upper()[:2]
    partial.update(self._cs_color_overrides)
    self.app.set_cue_style(ids, partial)
```

Show the resolved-group hint with a helper that computes `resolve_style(token={}, group=layout[gi], gctx=app_globals)` per key (import `engine.model.resolve_style`; build `gctx` from `self.app.cfg()`-style globals).

- [ ] **Step 2: Verify** — `xvfb-run -a python3 tests/test_v2_ui.py` → `23/23`. Manual: select one word, set a red fill + bigger size → only that word changes in the line; a neighbor stays group/global.

- [ ] **Step 3: Commit**

```bash
git add karaoke_subtitle_gui.py
git commit -m "feat(view): CUE-tier style overrides (multi-select aware) in the inspector"
```

### Task 17: Unified Save/Load project + UI tests for style

**Files:**
- Modify: `karaoke_subtitle_gui.py` (`_preset_dict` 309-314, `on_load_preset` 316-332; rename buttons in `app_base.py` action bar 94-95), `tests/test_v2_ui.py`

- [ ] **Step 1: Rename actions** in `app_base.App._build` (94-95): `"Save preset"`→`"Save project"`, `"Load preset"`→`"Load project"` (commands unchanged: `on_save_preset`/`on_load_preset`). Initial filename → `"karaoke_project.json"`.

- [ ] **Step 2: `_preset_dict`/load already serialize cues_v2** — confirm they now carry `style` (they call `serialize_cues_v2`/`apply_cues_v2`, updated in Task 5). No path keys added (decision: omit). Ensure `apply_cues_v2` mismatch still logs the existing warning.

- [ ] **Step 3: Add UI tests** to `tests/test_v2_ui.py` (append before the results print):

```python
def t_group_style_apply():
    # select first event header, push a group style via the app API, check render+build
    app.set_group_style(0, {"fontsize": 96, "border_style": 3}); pump(2)
    g = app._groups[0].get("group_style", {})
    text, n = v2.build_ass_v2(app.cfg(), app._groups)
    return (g.get("fontsize") == 96 and "Style: Box," in text), f"gstyle={g}"

def t_cue_style_apply():
    wid = app._project["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    app.set_cue_style({wid}, {"primary": "#FF0000"}); pump(2)
    text, n = v2.build_ass_v2(app.cfg(), app._groups)
    return ("\\1c&H0000FF&" in text), "missing inline cue color"

def t_project_style_roundtrip():
    app.set_group_style(0, {"font": "Arial"}); pump(1)
    d = app._preset_dict()
    app._reload_groups(); pump(2)
    ok = v2.apply_cues_v2(app._project, d["cues_v2"]); app._rebuild_render(); pump(1)
    return (ok and app._project["layout"][0]["style"].get("font") == "Arial"), "roundtrip lost style"
```

Register them by appending three tuples to the existing `tests = [...]` list (around line 251, before the `for name, fn in tests:` loop):

```python
    ("group style apply -> render+build", t_group_style_apply),
    ("cue style apply -> inline color", t_cue_style_apply),
    ("project style roundtrip", t_project_style_roundtrip),
```

- [ ] **Step 4: Run full suites** — `python3 tests/test_engine.py` → all pass; `xvfb-run -a python3 tests/test_v2_ui.py` → `26/26`.

- [ ] **Step 5: Commit**

```bash
git add karaoke_subtitle_gui.py app_base.py tests/test_v2_ui.py
git commit -m "feat: unified Save/Load project (style-aware) + UI tests for style overrides"
```

---

## Phase 6 — Copy/voice + docs + final verify

### Task 18: Copy conventions (sentence case, no emoji, mono)

**Files:**
- Modify: `app_base.py` (log strings + labels), `karaoke_subtitle_gui.py` (log strings + labels)

- [ ] **Step 1: Replace emoji log glyphs** — in both files swap `✓`→`OK:`, `✗`→`Error:`, `⚠`→`Warning:` in `self.log(...)` strings, and ensure status text color already conveys success/error (it does, green). Sentence-case any Title-Case button/label not already sentence case (leave the product name). Timecodes already use the mono `ass_time`/numeric format — no change.

- [ ] **Step 2: Verify** — `xvfb-run -a python3 tests/test_v2_ui.py` → `26/26` (no test asserts on emoji). Grep check: `grep -RnE "✓|✗|⚠" app_base.py karaoke_subtitle_gui.py` returns nothing.

- [ ] **Step 3: Commit**

```bash
git add app_base.py karaoke_subtitle_gui.py
git commit -m "chore: adopt design-system copy (sentence case, no emoji in log)"
```

### Task 19: Update README + CLAUDE.md

**Files:**
- Modify: `README.md`, `CLAUDE.md`

- [ ] **Step 1: Document** the new architecture (engine/controller/view + dict contract), the `global<group<cue` style waterfall (and C1: box-mode group-only), the merged single-window layout (adjustable + Detach dock, left-rail Style|Inspector), and the unified Save/Load project file. In CLAUDE.md, replace the deferred-roadmap note about layout/fade unification with the now-shipped style waterfall, and note `engine/` is the v3-portable core per `design-system/HANDOFF_v3.md`.

- [ ] **Step 2: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: README/CLAUDE for engine extraction + style waterfall + merged editor"
```

### Task 20: Final end-to-end verification

- [ ] **Step 1: Headless engine** — `python3 tests/test_engine.py` → all pass; confirms engine works with no display.
- [ ] **Step 2: UI suite** — `xvfb-run -a python3 tests/test_v2_ui.py` → `26/26`.
- [ ] **Step 3: v1 still runs** — `xvfb-run -a python3 -c "import old.karaoke_subtitle_gui"` imports without error (v1 untouched, uses core only).
- [ ] **Step 4: Manual smoke (real display)** — run `python3 karaoke_subtitle_gui.py`; walk the spec's Verification list items 1–6 (merged window; per-group + per-cue style live + Render now; waterfall reactivity; build Styles; Save/Load round-trip; load an old preset = all inherit).
- [ ] **Step 5: Burn smoke** — with `Clip.mp4` set as input video, Generate + Burn a few seconds; confirm progress bar advances and output plays with styled captions.
- [ ] **Step 6: Final commit (if any doc/test tweaks)**

```bash
git add -A && git commit -m "test: final verification pass for per-cue/group style + merged editor"
```

---

## Self-review notes (coverage map)

- Spec §1 model → Tasks 2,5,7. §2 render → Task 3. §3 build (Styles+deltas) → Tasks 4,10. §4 mutations → Task 7. §5 io → Task 5. §6 ffmpeg → Task 6. §7 controller → Task 8. §8 preview → Task 11. §9 merged window/dock (adjustable+Detach, preserve list) → Tasks 12–14. §10 inspector tiers → Tasks 14–16. §11 copy → Task 18. Engine isolation (verify §7) → Task 9. Unified file (§ io / decisions) → Task 17. Docs → Task 19. Final verify → Task 20.
- Constraint C1 enforced in `model.CUE_STYLE_KEYS`, `mutations.set_cue_style`, `ass._group_border`, and tested (`t_set_cue_style_border_ignored`, `t_build_two_styles_for_boxmode`). C2 unchanged (per-cue tk preview is approximate; Render now authoritative).
