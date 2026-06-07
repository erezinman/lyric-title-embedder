# tests/test_anim_anchors.py — Cluster AE, 2C: anchor math (AE-ANC-01..16).
#
# All expected seconds are computed BY HAND from the synth_project() clock:
#   group 0 "Verse":  line0 w0[1.000..1.500] w1[1.500..2.000]
#                     line1 w2[2.000..2.500] w3[2.500..3.000]
#   group 1 "Chorus": line0 w4[4.000..4.500] w5[4.500..5.000]
# Event window of a group (no win override, linger 0):
#   group 0: win_start = min start = 1.000 ; win_end = max end = 3.000
#   group 1: win_start = 4.000 ; win_end = 5.000
import os, sys, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from engine import anim
import anim_fixtures as fx

APPROX = 1e-9


def _cue_loc(p, wid):
    for gi, g in enumerate(p["layout"]):
        for li, line in enumerate(g["lines"]):
            for ti, tok in enumerate(line["toks"]):
                if tok["ids"] and tok["ids"][0] == wid:
                    return gi, li, ti
    raise KeyError(wid)


def _sec(p, wid, anchor, offset=0, unit="ms", scope_span=None):
    gi, li, ti = _cue_loc(p, wid)
    t = fx._time(anchor, offset, unit)
    return anim.anchor_seconds(p, gi, li, ti, t, scope_span)


# AE-ANC-01..08 — the 8 anchors resolve to correct absolute seconds for cue 0
# (group 0, line 0, first token). scope_span here = the group event window
# (1.000..3.000) which is also span_* for a group/global scope.
def test_AE_ANC_01_cue_start():
    # cue 0 sung start = 1.000
    assert _sec(fx.synth_project(), 0, "cue_start") == pytest.approx(1.000, abs=APPROX)


def test_AE_ANC_02_cue_end():
    # cue 0 sung end = 1.500
    assert _sec(fx.synth_project(), 0, "cue_end") == pytest.approx(1.500, abs=APPROX)


def test_AE_ANC_03_line_start():
    # cue 0 is in line 0 (w0,w1): line sung start = 1.000
    assert _sec(fx.synth_project(), 0, "line_start") == pytest.approx(1.000, abs=APPROX)


def test_AE_ANC_04_line_end():
    # line 0 sung end = w1.end = 2.000
    assert _sec(fx.synth_project(), 0, "line_end") == pytest.approx(2.000, abs=APPROX)


def test_AE_ANC_05_span_start_group_scope():
    # group scope span = event window start = 1.000
    span = (1.000, 3.000)
    assert _sec(fx.synth_project(), 0, "span_start", scope_span=span) == pytest.approx(1.000, abs=APPROX)


def test_AE_ANC_06_span_end_group_scope():
    span = (1.000, 3.000)
    assert _sec(fx.synth_project(), 0, "span_end", scope_span=span) == pytest.approx(3.000, abs=APPROX)


def test_AE_ANC_07_event_start():
    # group 0 render event window start = 1.000
    assert _sec(fx.synth_project(), 0, "event_start") == pytest.approx(1.000, abs=APPROX)


def test_AE_ANC_08_event_end():
    # group 0 render event window end = 3.000 (linger 0)
    assert _sec(fx.synth_project(), 0, "event_end") == pytest.approx(3.000, abs=APPROX)


# AE-ANC-09 — ms offset shifts by offset/1000 s (signed).
def test_AE_ANC_09_ms_offset_signed():
    # cue_start 1.000 + (-200ms) = 0.800 ; cue_end 1.500 + 300ms = 1.800
    assert _sec(fx.synth_project(), 0, "cue_start", -200, "ms") == pytest.approx(0.800, abs=APPROX)
    assert _sec(fx.synth_project(), 0, "cue_end", 300, "ms") == pytest.approx(1.800, abs=APPROX)


# AE-ANC-10 — frac offset = fraction of the anchor pair's own span.
def test_AE_ANC_10_frac_offset_half_cue():
    # cue span = cue_end - cue_start = 1.500 - 1.000 = 0.500
    # cue_start + 0.5*0.500 = 1.000 + 0.250 = 1.250
    assert _sec(fx.synth_project(), 0, "cue_start", 0.5, "frac") == pytest.approx(1.250, abs=APPROX)


# AE-ANC-11 — merged-cue span uses earliest start / latest end of its ids.
def test_AE_ANC_11_merged_cue_span():
    p = fx.synth_project()
    # merge w0+w1 into one token in line 0 → cue span = 1.000 .. 2.000
    line0 = p["layout"][0]["lines"][0]
    line0["toks"] = [{"ids": [0, 1], "sep": " ", "del": False, "style": {}}]
    gi, li, ti = 0, 0, 0
    s = anim.anchor_seconds(p, gi, li, ti, fx._time("cue_start"), None)
    e = anim.anchor_seconds(p, gi, li, ti, fx._time("cue_end"), None)
    assert s == pytest.approx(1.000, abs=APPROX)
    assert e == pytest.approx(2.000, abs=APPROX)


# AE-ANC-12 — span_* tag anchor = min start / max end over the tag's ids
# (members animate in unison: same absolute window).
def test_AE_ANC_12_span_tag_anchor_unison():
    p = fx.synth_project()
    # tag over ids [0,3] → span = 1.000 .. 3.000
    span = (1.000, 3.000)
    s0 = _sec(p, 0, "span_start", scope_span=span)
    s3 = _sec(p, 3, "span_start", scope_span=span)
    assert s0 == pytest.approx(1.000, abs=APPROX)
    assert s3 == pytest.approx(1.000, abs=APPROX)   # identical window for both members


# AE-ANC-13 — span_* group anchor = the event window (win_start/win_end).
def test_AE_ANC_13_span_group_anchor_event_window():
    p = fx.synth_project()
    # group 1 event window = 4.000..5.000
    span = (4.000, 5.000)
    assert _sec(p, 4, "span_start", scope_span=span) == pytest.approx(4.000, abs=APPROX)
    assert _sec(p, 4, "span_end", scope_span=span) == pytest.approx(5.000, abs=APPROX)


# AE-ANC-14 — hybrid endpoints: t0=span_start, t1=cue_end → start together, end per cue.
def test_AE_ANC_14_hybrid_endpoints():
    p = fx.synth_project()
    span = (1.000, 3.000)              # group 0 event window
    # cue 0: start = span_start 1.000, end = cue_end 1.500
    # cue 3: start = span_start 1.000, end = cue_end 3.000
    assert _sec(p, 0, "span_start", scope_span=span) == pytest.approx(1.000, abs=APPROX)
    assert _sec(p, 0, "cue_end") == pytest.approx(1.500, abs=APPROX)
    assert _sec(p, 3, "span_start", scope_span=span) == pytest.approx(1.000, abs=APPROX)
    assert _sec(p, 3, "cue_end") == pytest.approx(3.000, abs=APPROX)


# AE-ANC-15 — multi-group tag clamping: a span-anchored animation begins before a
# member cue's event exists → that cue is clamped (member start <= its event start).
def test_AE_ANC_15_multi_group_tag_clamping():
    p = fx.with_multi_group_tag()      # tag ids [0,1,4,5] span groups 0 and 1
    # span over the tag = min start 1.000 .. max end 5.000
    span = (1.000, 5.000)
    # group-1 cue (w4) event window starts at 4.000; a span_start at 1.000 precedes it.
    raw = _sec(p, 4, "span_start", scope_span=span)
    ev_start = _sec(p, 4, "event_start")     # 4.000
    # the resolved span_start (1.000) precedes the event; clamp keeps it <= event start.
    assert raw == pytest.approx(1.000, abs=APPROX)
    assert ev_start == pytest.approx(4.000, abs=APPROX)
    assert raw <= ev_start


# AE-ANC-16 — retiming follows anchors: shifting a word's time shifts its
# anchor-derived animation times. [R]
def test_AE_ANC_16_retiming_follows_anchors():
    p = fx.synth_project()
    before = _sec(p, 0, "cue_start")          # 1.000
    p["words"][0]["start"] = 1.250            # retime cue 0 start +250ms
    after = _sec(p, 0, "cue_start")
    assert before == pytest.approx(1.000, abs=APPROX)
    assert after == pytest.approx(1.250, abs=APPROX)
