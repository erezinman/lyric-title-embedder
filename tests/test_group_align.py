# tests/test_group_align.py — alignment as a group-overridable style (global < group, NO cue).
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import engine
from engine import mutations as mut
from engine.model import STYLE_KEYS, CUE_STYLE_KEYS, resolve_style

results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))

CFG = {"json_path": "aligned_lyrics.json", "group_by": "section", "skip_dashes": True,
       "font": "DejaVu Sans", "fontsize": 64, "bold": True, "align": 2,
       "play_w": 1920, "play_h": 1080, "margin_l": 80, "margin_r": 80, "margin_v": 60,
       "primary_color": "#FFFFFF", "outline_color": "#000000", "back_color": "#000000",
       "back_alpha": "80", "border_style": 1, "outline_w": 3, "shadow": 0}

GCTX = {"font": "x", "fontsize": 64, "bold": True, "primary": "#fff", "outline": "#000",
        "back": "#000", "back_alpha": "80", "outline_w": 3, "shadow": 0, "border_style": 1,
        "align": 2}

def t_align_in_style_keys_not_cue():
    return ("align" in STYLE_KEYS and "align" not in CUE_STYLE_KEYS), str(CUE_STYLE_KEYS)

def t_resolve_group_overrides_global():
    out = resolve_style({"style": {}}, {"style": {"align": 8}}, GCTX)
    return (out["align"] == 8), str(out["align"])

def t_resolve_global_when_group_absent():
    out = resolve_style({"style": {}}, {"style": {}}, GCTX)
    return (out["align"] == 2), str(out["align"])

def t_resolve_cue_align_ignored():
    out = resolve_style({"style": {"align": 5}}, {"style": {"align": 8}}, GCTX)
    return (out["align"] == 8), str(out["align"])

def t_set_group_style_accepts_align():
    p = engine.make_project(CFG)
    mut.set_group_style(p, 0, {"align": 8})
    return (p["layout"][0]["style"].get("align") == 8), str(p["layout"][0]["style"])

def t_set_cue_style_rejects_align():
    p = engine.make_project(CFG)
    wid = p["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    mut.set_cue_style(p, [wid], {"align": 5, "fontsize": 99})
    st = p["layout"][0]["lines"][0]["toks"][0]["style"]
    return ("align" not in st and st.get("fontsize") == 99), str(st)

def t_ass_emits_an_only_when_group_overrides():
    p = engine.make_project(CFG)
    groups = engine.project_to_render(p)
    ass0, _ = engine.build_ass(CFG, groups)
    mut.set_group_style(p, 0, {"align": 8})
    groups = engine.project_to_render(p)
    ass1, _ = engine.build_ass(CFG, groups)
    # baseline: no inline \an anywhere; override: exactly the overridden event carries \an8
    an_base = "\\an" in ass0; an_count = ass1.count("\\an8")
    return (not an_base and an_count == 1), f"an in base={an_base}, count={an_count}"

def t_ass_an_same_as_global_not_emitted():
    p = engine.make_project(CFG)
    mut.set_group_style(p, 0, {"align": 2})   # same as global -> redundant, no tag needed
    groups = engine.project_to_render(p)
    ass, _ = engine.build_ass(CFG, groups)
    return ("\\an" not in ass), "no redundant tag"

_active = {n: f for n, f in list(globals().items()) if n.startswith("t_") and callable(f)}
for n, f in sorted(_active.items()): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, dd in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"\n       -> {dd}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
