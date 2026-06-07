# tests/test_anim_model.py — Cluster AE, 2A: model validation (AE-MOD-01..08).
# TDD RED PHASE: engine/anim.py raises NotImplementedError; these must FAIL there
# (never on collection). Pytest-style (the existing t_* script files are not
# pytest-collectable; the verification command runs `python -m pytest`).
import os, sys, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from engine import anim
import anim_fixtures as fx


def _validate(p, scope, ref, a):
    return anim.validate_animation(p, scope, ref, a)


# AE-MOD-01 — `move` rejected at tag scope, accepted at group/global. [A,G]
def test_AE_MOD_01_move_rejected_at_tag_scope():
    p = fx.synth_project()
    mv = fx._anim(id="m1", name="slide", channel="move")
    with pytest.raises(ValueError):
        _validate(p, "tag", [0], mv)
    # accepted at group/global (no raise once implemented):
    _validate(p, "group", 0, mv)
    _validate(p, "global", None, mv)


# AE-MOD-02 — segments must be non-overlapping within one animation. [G]
def test_AE_MOD_02_overlapping_segments_rejected():
    p = fx.synth_project()
    a = fx._anim(id="ov", channel="alpha", segments=[
        fx._seg(fx._time("cue_start", 0), fx._time("cue_start", 100), None, 0.5),
        fx._seg(fx._time("cue_start", 50), fx._time("cue_start", 150), 0.5, 1.0),  # overlaps 50..100
    ])
    with pytest.raises(ValueError):
        _validate(p, "tag", [0], a)


# AE-MOD-03 — out-of-order segment t0s rejected (SPEC-GAP-3 RULED: reject). [G]
def test_AE_MOD_03_out_of_order_segments_rejected():
    p = fx.synth_project()
    a = fx._anim(id="oo", channel="alpha", segments=[
        fx._seg(fx._time("cue_start", 100), fx._time("cue_start", 200), None, 0.5),
        fx._seg(fx._time("cue_start", 0), fx._time("cue_start", 50), 0.5, 1.0),  # earlier than seg0
    ])
    with pytest.raises(ValueError):
        _validate(p, "tag", [0], a)


# AE-MOD-04 — frac offset outside 0..1 rejected; ms unbounded-signed accepted. [G]
def test_AE_MOD_04_frac_out_of_range_rejected_ms_unbounded():
    p = fx.synth_project()
    bad = fx._anim(id="fr", channel="alpha", segments=[
        fx._seg(fx._time("cue_start", 0, "frac"), fx._time("cue_start", 1.5, "frac"), None, 1)])
    with pytest.raises(ValueError):
        _validate(p, "tag", [0], bad)
    # negative & large ms offsets are legal (no raise once implemented):
    ok = fx._anim(id="ms", channel="alpha", segments=[
        fx._seg(fx._time("cue_start", -5000, "ms"), fx._time("cue_end", 99999, "ms"), None, 1)])
    _validate(p, "tag", [0], ok)


# AE-MOD-05 — unknown anchor / unknown channel rejected. [G]
def test_AE_MOD_05_unknown_anchor_or_channel_rejected():
    p = fx.synth_project()
    bad_ch = fx._anim(id="bc", channel="wobble")
    bad_anchor = fx._anim(id="ba", channel="alpha", segments=[
        fx._seg(fx._time("middle_of_cue"), fx._time("cue_end"), None, 1)])
    with pytest.raises(ValueError):
        _validate(p, "tag", [0], bad_ch)
    with pytest.raises(ValueError):
        _validate(p, "tag", [0], bad_anchor)


# AE-MOD-06 — karaoke_fill rejects anchors/segments other than its sung interval. [G]
def test_AE_MOD_06_karaoke_fill_rejects_custom_anchors():
    p = fx.synth_project()
    bad = fx._anim(id="kf", name="sweep", channel="karaoke_fill", segments=[
        fx._seg(fx._time("line_start"), fx._time("event_end"), None, 1)])
    with pytest.raises(ValueError):
        _validate(p, "tag", [0], bad)


# AE-MOD-07 — stagger on a single-member scope is accepted-but-inert (SPEC-GAP-4 RULED). [G]
def test_AE_MOD_07_stagger_single_member_inert_not_rejected():
    p = fx.synth_project()
    a = fx._anim(id="st", channel="alpha",
                 stagger={"order": "index", "step": {"value": 80, "unit": "ms"}})
    # single-id tag = single member: must validate without raising (inert, not error).
    _validate(p, "tag", [0], a)


# AE-MOD-08 — enabled:false validates fine (dropped only at resolution time). [A]
def test_AE_MOD_08_disabled_validates():
    p = fx.synth_project()
    a = fx._anim(id="off", channel="alpha", enabled=False)
    _validate(p, "tag", [0], a)
