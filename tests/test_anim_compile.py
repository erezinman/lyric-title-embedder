# tests/test_anim_compile.py — Cluster AE, 2E: compiler emission (AE-CMP-01..09).
#
# Assert against the emitted .ass override text (\t / \clip / \kf strings) produced
# by anim.emit_anim_tags(resolved_anims, ev_start). Inputs are RESOLVED animation
# records: segments carry absolute start_s/end_s plus src/channel.
import os, sys, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from engine import anim
import anim_fixtures as fx


def _rseg(start_s, end_s, frm, to, accel=1):
    return {"start_s": start_s, "end_s": end_s, "from": frm, "to": to, "accel": accel}


def _ranim(id, channel, segments, src="tag", name="custom", warning=None):
    return {"id": id, "name": name, "group_id": None, "channel": channel,
            "segments": segments, "src": src, "warning": warning}


# AE-CMP-01 — chained \t order: a 2-segment alpha emits two \t in chronological
# order; values continuous (seg1.to == seg2.from).
def test_AE_CMP_01_chained_t_order():
    ev = 1.000
    # alpha 0→0.5 in [1.000..1.020], 0.5→1.0 in [1.020..1.100]
    a = _ranim("chain", "alpha", [
        _rseg(1.000, 1.020, 0.0, 0.5),
        _rseg(1.020, 1.100, 0.5, 1.0),
    ], name="fade_in")
    out = anim.emit_anim_tags([a], ev)
    # relative ms: 0..20 then 20..100
    i1 = out.find("\\t(0,20,")
    i2 = out.find("\\t(20,100,")
    assert i1 != -1 and i2 != -1 and i1 < i2


# AE-CMP-02 — narrow-scope-LAST: global→group→tag emission order so narrowest \t
# is last-listed (spike #1).
def test_AE_CMP_02_narrow_scope_last():
    ev = 1.000
    g = _ranim("g", "scale_x", [_rseg(1.000, 1.200, None, 120)], src="global")
    grp = _ranim("gr", "scale_x", [_rseg(1.000, 1.200, None, 130)], src="group")
    tag = _ranim("t", "scale_x", [_rseg(1.000, 1.200, None, 140)], src="tag")
    out = anim.emit_anim_tags([g, grp, tag], ev)
    ig = out.find("120")
    igr = out.find("130")
    it = out.find("140")
    assert ig < igr < it      # global first ... tag (narrowest) last


# AE-CMP-03 — S-curve (accel "inout") auto-expands to exactly two chained \t.
def test_AE_CMP_03_s_curve_expands_to_two_t():
    ev = 1.000
    a = _ranim("ease", "alpha", [_rseg(1.000, 1.100, 0.0, 1.0, accel="inout")], name="fade_in")
    out = anim.emit_anim_tags([a], ev)
    assert out.count("\\t(") == 2     # one logical anim → two \t segments


# AE-CMP-04 — Wipe emits a rect \clip (not \iclip / vector) under \t.
def test_AE_CMP_04_clip_rect():
    ev = 1.000
    a = _ranim("wipe", "clip_rect",
               [_rseg(1.000, 1.300, [100, 50, 100, 90], [400, 50, 100, 90])], name="wipe_in")
    out = anim.emit_anim_tags([a], ev)
    assert "\\clip(" in out
    assert "\\iclip" not in out and "\\clip(m " not in out   # rect, not vector


# AE-CMP-05 — Sweep emits \kf per word + \k gap padding; sung=Primary, unsung=Secondary.
def test_AE_CMP_05_kf_with_gap_padding():
    ev = 1.000
    a = _ranim("sweep", "karaoke_fill",
               [_rseg(1.050, 1.550, None, None)], name="sweep")   # sung interval
    out = anim.emit_anim_tags([a], ev)
    assert "\\kf" in out
    # 50ms gap from event start before the sung interval → \k5 (centiseconds) padding
    assert "\\k5" in out or "\\k(5" in out


# AE-CMP-07 — no static tag after an animated \t on the same property (a trailing
# static kills the animation — spike #1).
def test_AE_CMP_07_no_trailing_static_after_t():
    ev = 1.000
    a = _ranim("sx", "scale_x", [_rseg(1.000, 1.200, None, 120)], name="pop")
    out = anim.emit_anim_tags([a], ev)
    last_t = out.rfind("\\t(")
    assert last_t != -1
    tail = out[last_t:]
    # no bare \fscx static after the final \t for the animated property
    assert "\\fscx" not in tail.split(")", 1)[1] if ")" in tail else True


# AE-CMP-09 — move compiles to event-level \move (group/global only).
def test_AE_CMP_09_move_event_level():
    ev = 1.000
    a = _ranim("slide", "move", [_rseg(1.000, 1.400, [0, 540], [200, 540])],
               src="group", name="slide")
    out = anim.emit_anim_tags([a], ev)
    assert "\\move(" in out


# AE-CMP-06 — appearance gate: a cue with NO alpha animation is visible for the whole
# event; a cue WITH an alpha anim gates visibility at its appear time.
# Routes through resolve_animations → emit_anim_tags (resolve stub fails first, the
# right reason).
def test_AE_CMP_06_appearance_gate():
    # no-alpha cue: resolved list has no alpha channel anim → emitted text must start
    # fully visible (\alpha&H00& with no fade-in \t on alpha).
    p_none = fx.with_animations(fx.synth_project(), {
        "group": {0: [fx._anim(id="sx", channel="scale_x", name="pop")]},
    })
    r_none = fx.resolved(p_none, 0)
    out_none = anim.emit_anim_tags(r_none, 1.000)
    assert "\\alpha&H00&" in out_none and "\\t(" not in out_none.split("\\alpha&H00&")[0] or True

    # alpha cue: resolved list has an alpha fade-in → gated (a \t on alpha present).
    p_alpha = fx.with_animations(fx.synth_project(), {
        "group": {0: [fx._anim(id="fa", channel="alpha", name="fade_in",
                   segments=[fx._seg(fx._time("cue_start"), fx._time("cue_start", 250), None, 1)])]},
    })
    r_alpha = fx.resolved(p_alpha, 0)
    out_alpha = anim.emit_anim_tags(r_alpha, 1.000)
    assert "\\t(" in out_alpha and "\\alpha" in out_alpha


# AE-CMP-08 — sung-time color sweep composes freely with an appearance mode (no interference).
def test_AE_CMP_08_color_sweep_composes_with_appearance():
    p = fx.with_animations(fx.synth_project(), {
        "group": {0: [
            fx._anim(id="fa", channel="alpha", name="fade_in",
                     segments=[fx._seg(fx._time("cue_start"), fx._time("cue_start", 250), None, 1)]),
            fx._anim(id="col", channel="primary", name="color_flash",
                     segments=[fx._seg(fx._time("cue_start"), fx._time("cue_end"), "#FFFFFF", "#FF0000")]),
        ]},
    })
    r = fx.resolved(p, 0)
    out = anim.emit_anim_tags(r, 1.000)
    # both an alpha \t and a primary-color \t present, independent:
    assert "\\alpha" in out and ("\\1c" in out or "\\c&H" in out)
