# tests/test_rtl.py — RTL engine support (script-style, no Tk, no transport).
# Covers: two new globals (text_direction/bidi_marks), resolve_direction detection,
# alignment mirroring, bidi-mark insertion, directional-animation mirroring.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
results = []
def check(name, fn):
    try:
        ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}"))

import engine
from engine import ass, anim
from mcp_server.context import HeadlessContext, DEFAULT_GLOBALS, GLOBAL_KEYS
from mcp_server import tools

HE = "שלום"   # Hebrew "shalom"
AR = "سلام"   # Arabic "salam"
LRM = "‎"


# ── 1. globals ────────────────────────────────────────────────────────────────

def t_defaults_present():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    g = ctx.get_globals()
    return (g["text_direction"] == "auto" and g["bidi_marks"] is True), f"{g.get('text_direction')},{g.get('bidi_marks')}"

def t_set_globals_roundtrip():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    ctx.set_globals({"text_direction": "rtl", "bidi_marks": False})
    g = ctx.get_globals()
    return (g["text_direction"] == "rtl" and g["bidi_marks"] is False), f"{g['text_direction']},{g['bidi_marks']}"

def t_set_globals_via_tool():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    out = tools.set_globals(ctx, {"text_direction": "ltr"})
    return (out["text_direction"] == "ltr"), f"{out['text_direction']}"

def t_get_state_exposes():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    s = tools.get_state(ctx)
    return ("text_direction" in s["globals"] and "bidi_marks" in s["globals"]), "exposed"

def t_get_project_exposes():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    ctx.set_globals({"text_direction": "rtl"})
    p = tools.get_project(ctx)
    # canonical home is the globals payload block (not duplicated into placement)
    gl = p["globals"]
    return (gl.get("text_direction") == "rtl" and "bidi_marks" in gl), f"{gl.get('text_direction')}"

def t_invalid_direction_rejected():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    try:
        ctx.set_globals({"text_direction": "sideways"})
        return (False, "no raise")
    except ValueError:
        return (True, "rejected")

def t_cfg_carries_keys():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    ctx.set_globals({"text_direction": "rtl", "bidi_marks": False})
    c = ctx.cfg()
    return (c["text_direction"] == "rtl" and c["bidi_marks"] is False), "cfg"


# ── 2. resolve_direction ────────────────────────────────────────────────────────

def t_resolve_explicit_wins():
    return (ass.resolve_direction({"text_direction": "rtl"}, "hello") == "rtl"
            and ass.resolve_direction({"text_direction": "ltr"}, HE) == "ltr"), "explicit"

def t_resolve_auto_hebrew():
    return (ass.resolve_direction({"text_direction": "auto"}, HE) == "rtl"), "he->rtl"

def t_resolve_auto_arabic():
    return (ass.resolve_direction({"text_direction": "auto"}, AR) == "rtl"), "ar->rtl"

def t_resolve_auto_latin():
    return (ass.resolve_direction({"text_direction": "auto"}, "hello world") == "ltr"), "latin->ltr"

def t_resolve_auto_leading_number():
    return (ass.resolve_direction({"text_direction": "auto"}, "2024 " + HE) == "rtl"), "num then he->rtl"

def t_resolve_auto_empty():
    return (ass.resolve_direction({"text_direction": "auto"}, "") == "ltr"), "empty->ltr"

def t_resolve_default_missing_key():
    # missing key behaves as auto
    return (ass.resolve_direction({}, HE) == "rtl"), "missing=auto"


# ── 3. alignment mirroring ──────────────────────────────────────────────────────

def _mk_groups(text=HE):
    return [{"start": 0.0, "end": 2.0, "group_style": None,
             "lines": [{"words": [{"text": text}]}]}]

def _style_align(a):
    for line in a.splitlines():
        if line.startswith("Style:"):
            cols = line.split(",")
            return int(cols[18])   # Alignment column (0-based index 18 incl. "Style: Name")
    return None

def t_mirror_rtl_align1_to_3():
    cfg = ctx_cfg(text_direction="rtl", align=1)
    a, _ = ass.build_ass(cfg, _mk_groups("hi"))
    return (_style_align(a) == 3), f"align={_style_align(a)}"

def t_mirror_rtl_align4_to_6():
    cfg = ctx_cfg(text_direction="rtl", align=4)
    a, _ = ass.build_ass(cfg, _mk_groups("hi"))
    return (_style_align(a) == 6), f"align={_style_align(a)}"

def t_mirror_rtl_align5_unchanged():
    cfg = ctx_cfg(text_direction="rtl", align=5)
    a, _ = ass.build_ass(cfg, _mk_groups("hi"))
    return (_style_align(a) == 5), f"align={_style_align(a)}"

def t_mirror_rtl_align7_to_9():
    cfg = ctx_cfg(text_direction="rtl", align=7)
    a, _ = ass.build_ass(cfg, _mk_groups("hi"))
    return (_style_align(a) == 9), f"align={_style_align(a)}"

def t_mirror_ltr_unchanged():
    cfg = ctx_cfg(text_direction="ltr", align=1)
    a, _ = ass.build_ass(cfg, _mk_groups("hi"))
    return (_style_align(a) == 1), f"align={_style_align(a)}"

def t_mirror_auto_hebrew_mirrors():
    # auto + hebrew content => rtl => mirror
    cfg = ctx_cfg(text_direction="auto", align=1)
    a, _ = ass.build_ass(cfg, _mk_groups(HE))
    return (_style_align(a) == 3), f"align={_style_align(a)}"

def t_mirror_group_an_override():
    # group align override 4 under rtl => \an6 in event text
    cfg = ctx_cfg(text_direction="rtl", align=2)
    groups = [{"start": 0.0, "end": 2.0, "group_style": {"align": 4},
               "lines": [{"words": [{"text": "hi"}]}]}]
    a, _ = ass.build_ass(cfg, groups)
    return ("\\an6" in a), "an6 in text"


# ── 4. bidi marks ───────────────────────────────────────────────────────────────

def _event_text(a):
    for line in a.splitlines():
        if line.startswith("Dialogue:"):
            return line.split(",", 9)[9]
    return ""

def t_bidi_wraps_number():
    cfg = ctx_cfg(text_direction="rtl", bidi_marks=True, align=2)
    a, _ = ass.build_ass(cfg, _mk_groups("2024"))
    txt = _event_text(a)
    return (LRM + "2024" + LRM in txt), repr(txt)

def t_bidi_pure_hebrew_unchanged():
    cfg = ctx_cfg(text_direction="rtl", bidi_marks=True, align=2)
    a, _ = ass.build_ass(cfg, _mk_groups(HE))
    txt = _event_text(a)
    return (LRM not in txt and HE in txt), repr(txt)

def t_bidi_off_no_marks():
    cfg = ctx_cfg(text_direction="rtl", bidi_marks=False, align=2)
    a, _ = ass.build_ass(cfg, _mk_groups("2024"))
    return (LRM not in _event_text(a)), "no marks"

def t_bidi_ltr_no_marks():
    cfg = ctx_cfg(text_direction="ltr", bidi_marks=True, align=2)
    a, _ = ass.build_ass(cfg, _mk_groups("2024"))
    return (LRM not in _event_text(a)), "no marks ltr"

def t_bidi_mixed_word():
    # "abc123" is one ascii run -> wrapped once around whole run
    cfg = ctx_cfg(text_direction="rtl", bidi_marks=True, align=2)
    a, _ = ass.build_ass(cfg, _mk_groups("abc"))
    return (LRM + "abc" + LRM in _event_text(a)), repr(_event_text(a))


# ── 5. directional animation mirroring ──────────────────────────────────────────

def _move_anim(x1, y1, x2, y2, src="tag"):
    return {"id": "m", "name": "custom", "group_id": None, "channel": "move",
            "segments": [{"start_s": 0.0, "end_s": 1.0, "from": [x1, y1], "to": [x2, y2], "accel": 1}],
            "src": src, "warning": None}

def _clip_anim(x1, y1, x2, y2, src="tag"):
    return {"id": "c", "name": "custom", "group_id": None, "channel": "clip_rect",
            "segments": [{"start_s": 0.0, "end_s": 1.0, "from": None,
                          "to": [x1, y1, x2, y2], "accel": 1}],
            "src": src, "warning": None}

def _scale_anim():
    return {"id": "s", "name": "custom", "group_id": None, "channel": "scale_x",
            "segments": [{"start_s": 0.0, "end_s": 1.0, "from": 0, "to": 100, "accel": 1}],
            "src": "tag", "warning": None}

def t_move_mirrored_rtl():
    # play_w=1920: move from x=100 to x=300 mirrors to from 1820 to 1620 (swap dir)
    out = anim.emit_anim_tags([_move_anim(100, 50, 300, 50)], 0.0,
                              play_w=1920, direction="rtl")
    return ("\\move(1820,50,1620,50," in out), repr(out)

def t_move_unchanged_ltr():
    out = anim.emit_anim_tags([_move_anim(100, 50, 300, 50)], 0.0,
                              play_w=1920, direction="ltr")
    return ("\\move(100,50,300,50," in out), repr(out)

def t_clip_mirrored_swapped_rtl():
    # clip 100,0,300,1080 mirrors x: 100->1820, 300->1620, then swap x1<x2 => 1620,0,1820,1080
    out = anim.emit_anim_tags([_clip_anim(100, 0, 300, 1080)], 0.0,
                              play_w=1920, direction="rtl")
    return ("\\clip(1620,0,1820,1080)" in out), repr(out)

def t_clip_unchanged_ltr():
    out = anim.emit_anim_tags([_clip_anim(100, 0, 300, 1080)], 0.0,
                              play_w=1920, direction="ltr")
    return ("\\clip(100,0,300,1080)" in out), repr(out)

def t_scale_identical_rtl_ltr():
    a = anim.emit_anim_tags([_scale_anim()], 0.0, play_w=1920, direction="rtl")
    b = anim.emit_anim_tags([_scale_anim()], 0.0, play_w=1920, direction="ltr")
    return (a == b), f"{a!r} vs {b!r}"

def t_emit_default_args_ltr():
    # backward-compatible call without play_w/direction => ltr, no mirror
    out = anim.emit_anim_tags([_move_anim(100, 50, 300, 50)], 0.0)
    return ("\\move(100,50,300,50," in out), repr(out)

def t_build_ass_mirrors_move_rtl():
    cfg = ctx_cfg(text_direction="rtl", align=2, play_w=1920)
    groups = [{"start": 0.0, "end": 2.0, "group_style": None,
               "lines": [{"words": [{"text": HE, "anims": [_move_anim(100, 50, 300, 50)]}]}]}]
    a, _ = ass.build_ass(cfg, groups)
    return ("\\move(1820,50,1620,50," in _event_text(a)), repr(_event_text(a))


# ── cfg helper ──────────────────────────────────────────────────────────────────

def ctx_cfg(**over):
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    part = {}
    for k in ("text_direction", "bidi_marks", "align", "play_w"):
        if k in over: part[k] = over[k]
    if part: ctx.set_globals(part)
    return ctx.cfg()


for n, f in list(globals().items()):
    if n.startswith("t_"): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, d in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"  -> {d}"))
print(f"\n{npass}/{len(results)} passed"); sys.exit(0 if npass == len(results) else 1)
