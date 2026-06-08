# tests/test_typography.py — italic/underline as FULL style keys (global<group<cue),
# legacy-project tolerance (absent => false), and ASS emission (Style columns + inline tags).
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import engine
from engine import mutations as mut
from engine.model import STYLE_KEYS, CUE_STYLE_KEYS, GROUP_ONLY_STYLE_KEYS, resolve_style

results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))

CFG = {"json_path": "aligned_lyrics.json", "group_by": "section", "skip_dashes": True,
       "font": "DejaVu Sans", "fontsize": 64, "bold": True, "italic": False, "underline": False,
       "align": 2, "play_w": 1920, "play_h": 1080, "margin_l": 80, "margin_r": 80, "margin_v": 60,
       "primary_color": "#FFFFFF", "outline_color": "#000000", "back_color": "#000000",
       "back_alpha": "80", "border_style": 1, "outline_w": 3, "shadow": 0}

GCTX = {"font": "x", "fontsize": 64, "bold": True, "italic": False, "underline": False,
        "primary": "#fff", "outline": "#000", "back": "#000", "back_alpha": "80",
        "outline_w": 3, "shadow": 0, "border_style": 1, "align": 2}

def _first_wid(p): return p["layout"][0]["lines"][0]["toks"][0]["ids"][0]

# ── model: keys present, cue-allowed (not group-only) ───────────────────────
def t_keys_in_style_keys():
    return ("italic" in STYLE_KEYS and "underline" in STYLE_KEYS), str(STYLE_KEYS)

def t_keys_after_bold():
    bi = STYLE_KEYS.index("bold")
    return (STYLE_KEYS[bi + 1] == "italic" and STYLE_KEYS[bi + 2] == "underline"), str(STYLE_KEYS)

def t_keys_cue_allowed():
    return ("italic" in CUE_STYLE_KEYS and "underline" in CUE_STYLE_KEYS
            and "italic" not in GROUP_ONLY_STYLE_KEYS and "underline" not in GROUP_ONLY_STYLE_KEYS), \
           str(CUE_STYLE_KEYS)

# ── resolution ──────────────────────────────────────────────────────────────
def t_resolve_global():
    out = resolve_style({"style": {}}, {"style": {}}, {**GCTX, "italic": True})
    return (out["italic"] is True and out["underline"] is False), str(out)

def t_resolve_group_overrides():
    out = resolve_style({"style": {}}, {"style": {"italic": True}}, GCTX)
    return (out["italic"] is True), str(out["italic"])

def t_resolve_cue_overrides():
    out = resolve_style({"style": {"underline": True}}, {"style": {}}, GCTX)
    return (out["underline"] is True), str(out["underline"])

def t_resolve_absent_defaults_false():
    # gctx WITHOUT italic/underline (legacy global) → resolves to false, not None
    legacy = {k: v for k, v in GCTX.items() if k not in ("italic", "underline")}
    out = resolve_style({"style": {}}, {"style": {}}, legacy)
    return (out["italic"] is False and out["underline"] is False), str(out)

# ── ASS Style line columns ──────────────────────────────────────────────────
def t_style_line_italic_underline_columns():
    p = engine.make_project(CFG)
    cfg = {**CFG, "italic": True, "underline": True}
    ass, _ = engine.build_ass(cfg, engine.project_to_render(p))
    line = next(l for l in ass.splitlines() if l.startswith("Style: Default,"))
    # …Bold,Italic,Underline,StrikeOut… → bold=-1,italic=-1,underline=-1,0
    cols = line.split(",")
    bold_i = 7  # Name,Font,Size,Primary,Secondary,Outline,Back,Bold,Italic,Underline,StrikeOut
    return (cols[bold_i] == "-1" and cols[bold_i + 1] == "-1" and cols[bold_i + 2] == "-1"
            and cols[bold_i + 3] == "0"), line

def t_style_line_defaults_zero():
    p = engine.make_project(CFG)
    ass, _ = engine.build_ass(CFG, engine.project_to_render(p))  # italic/underline false
    line = next(l for l in ass.splitlines() if l.startswith("Style: Default,"))
    cols = line.split(",")
    return (cols[7] == "-1" and cols[8] == "0" and cols[9] == "0"), line  # bold -1, italic 0, underline 0

# ── inline running-delta tags ───────────────────────────────────────────────
def t_group_italic_emits_i1():
    p = engine.make_project(CFG)
    mut.set_group_style(p, 0, {"italic": True})
    ass, _ = engine.build_ass(CFG, engine.project_to_render(p))
    # group 0 overrides global italic=false → first event carries \i1
    return ("\\i1" in ass and ass.count("\\i1") == 1), f"i1 count={ass.count(chr(92)+'i1')}"

def t_cue_underline_emits_u1():
    p = engine.make_project(CFG)
    mut.set_cue_style(p, {_first_wid(p)}, {"underline": True})
    ass, _ = engine.build_ass(CFG, engine.project_to_render(p))
    return ("\\u1" in ass), "missing \\u1 for cue underline override"

def t_no_typo_tags_when_unset():
    p = engine.make_project(CFG)
    ass, _ = engine.build_ass(CFG, engine.project_to_render(p))
    return ("\\i" not in ass and "\\u" not in ass), "spurious \\i/\\u in baseline"

def t_bold_still_works():
    # regression: per-cue bold=False against global bold=True still emits \b0
    p = engine.make_project(CFG)
    mut.set_cue_style(p, {_first_wid(p)}, {"bold": False})
    ass, _ = engine.build_ass(CFG, engine.project_to_render(p))
    return ("\\b0" in ass), "missing \\b0 regression"

# ── legacy project (no italic/underline keys) loads + renders clean ─────────
def t_legacy_project_renders():
    p = engine.make_project(CFG)
    # legacy cfg lacks italic/underline entirely (pre-feature serialized globals)
    legacy_cfg = {k: v for k, v in CFG.items() if k not in ("italic", "underline")}
    ass, _ = engine.build_ass(legacy_cfg, engine.project_to_render(p))
    line = next(l for l in ass.splitlines() if l.startswith("Style: Default,"))
    cols = line.split(",")
    return (cols[8] == "0" and cols[9] == "0" and "\\i" not in ass and "\\u" not in ass), line

# ── round-trip through mutations (partial {italic:true}) ────────────────────
def t_set_group_style_italic_roundtrip():
    p = engine.make_project(CFG)
    mut.set_group_style(p, 0, {"italic": True})
    return (p["layout"][0]["style"].get("italic") is True), str(p["layout"][0]["style"])

def t_set_cue_style_underline_roundtrip():
    p = engine.make_project(CFG)
    wid = _first_wid(p)
    mut.set_cue_style(p, {wid}, {"underline": True})
    st = p["layout"][0]["lines"][0]["toks"][0]["style"]
    return (st.get("underline") is True), str(st)

_active = {n: f for n, f in list(globals().items()) if n.startswith("t_") and callable(f)}
for n, f in sorted(_active.items()): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, dd in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"\n       -> {dd}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
