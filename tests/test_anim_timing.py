# tests/test_anim_timing.py — Cluster AE, 2D: timing modes / stagger (AE-TM-01..11).
#
# These assert the OBSERVABLE per-member timing of a resolved animation (the start_s
# of each member's first segment), which the mode/stagger compiles into. The synth
# project clock (see test_anim_anchors.py header) gives round numbers.
import os, sys, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from engine import anim
import anim_fixtures as fx

APPROX = 1e-9


def _member_starts(p, wids, anim_id):
    """Resolved first-segment start_s for `anim_id` on each cue in `wids`."""
    out = []
    for wid in wids:
        r = fx.resolved(p, wid)
        a = next(x for x in r if x["id"] == anim_id)
        out.append(a["segments"][0]["start_s"])
    return out


# AE-TM-01 — Per cue (cue_*, no stagger): each member on its own clock.
def test_AE_TM_01_percue_own_clock():
    p = fx.with_animations(fx.synth_project(), {
        "group": {0: [fx._anim(id="ap", channel="alpha", mode="percue",
                   segments=[fx._seg(fx._time("cue_start"), fx._time("cue_start", 100), None, 1)])]},
    })
    # w0 cue_start 1.000, w1 1.500, w2 2.000, w3 2.500
    assert _member_starts(p, [0, 1, 2, 3], "ap") == pytest.approx([1.000, 1.500, 2.000, 2.500], abs=APPROX)


# AE-TM-02 — Per line (line_*): each line animates as a unit (its first word).
def test_AE_TM_02_perline_unit():
    p = fx.with_animations(fx.synth_project(), {
        "group": {0: [fx._anim(id="al", channel="alpha", mode="perline",
                   segments=[fx._seg(fx._time("line_start"), fx._time("line_start", 100), None, 1)])]},
    })
    # line0 (w0,w1) start 1.000 ; line1 (w2,w3) start 2.000
    assert _member_starts(p, [0, 1, 2, 3], "al") == pytest.approx([1.000, 1.000, 2.000, 2.000], abs=APPROX)


# AE-TM-03 — Together (span_*/event_*): all members share one moment.
def test_AE_TM_03_together_shared():
    p = fx.with_animations(fx.synth_project(), {
        "group": {0: [fx._anim(id="at", channel="alpha", mode="together",
                   segments=[fx._seg(fx._time("span_start"), fx._time("span_start", 100), None, 1)])]},
    })
    # group event window start = 1.000 for all
    assert _member_starts(p, [0, 1, 2, 3], "at") == pytest.approx([1.000, 1.000, 1.000, 1.000], abs=APPROX)


# AE-TM-04 — Cascade (step): member i starts i*step after the first, in reading order.
def test_AE_TM_04_cascade_reading_order():
    p = fx.with_animations(fx.synth_project(), {
        "group": {0: [fx._anim(id="ac", channel="alpha", mode="cascade", step=80, step_unit="ms",
                   segments=[fx._seg(fx._time("span_start"), fx._time("span_start", 100), None, 1)])]},
    })
    # base = span_start 1.000 ; +0, +0.080, +0.160, +0.240 in reading order (w0..w3)
    assert _member_starts(p, [0, 1, 2, 3], "ac") == pytest.approx([1.000, 1.080, 1.160, 1.240], abs=APPROX)


# AE-TM-05 — Cascade stability under retiming: reordering word TIMES doesn't change order. [R]
def test_AE_TM_05_cascade_stable_under_retiming():
    p = fx.with_animations(fx.synth_project(), {
        "group": {0: [fx._anim(id="ac", channel="alpha", mode="cascade", step=80, step_unit="ms",
                   segments=[fx._seg(fx._time("span_start"), fx._time("span_start", 100), None, 1)])]},
    })
    # invert word times within the group (w0 latest, w3 earliest) — reading order unchanged
    p["words"][0]["start"], p["words"][3]["start"] = 2.500, 1.000
    p["words"][0]["end"], p["words"][3]["end"] = 3.000, 1.500
    starts = _member_starts(p, [0, 1, 2, 3], "ac")
    # cascade offsets still follow reading order (monotonic +step), not time:
    base = starts[0]
    assert starts == pytest.approx([base, base + 0.080, base + 0.160, base + 0.240], abs=APPROX)


# AE-TM-06 — Reverse: last member first.
def test_AE_TM_06_reverse():
    p = fx.with_animations(fx.synth_project(), {
        "group": {0: [fx._anim(id="ar", channel="alpha", mode="reverse", step=80, step_unit="ms",
                   segments=[fx._seg(fx._time("span_start"), fx._time("span_start", 100), None, 1)])]},
    })
    # reading order w0..w3 ; reverse → w3 offset 0, w2 +0.080, w1 +0.160, w0 +0.240
    base = 1.000
    assert _member_starts(p, [0, 1, 2, 3], "ar") == pytest.approx(
        [base + 0.240, base + 0.160, base + 0.080, base + 0.000], abs=APPROX)


# AE-TM-07 — Center-out: ordered by index distance from the member-list midpoint.
# Verify even (4 members) and odd (3 members) counts.
def test_AE_TM_07_center_out_even_and_odd():
    # EVEN: 4 members (w0..w3). Midpoint between idx1 and idx2 → distances [1.5,0.5,0.5,1.5]
    # rank by distance (smaller first): idx1,idx2 = step0 ; idx0,idx3 = step1
    p_even = fx.with_animations(fx.synth_project(), {
        "group": {0: [fx._anim(id="ce", channel="alpha", mode="centerout", step=80, step_unit="ms",
                   segments=[fx._seg(fx._time("span_start"), fx._time("span_start", 100), None, 1)])]},
    })
    base = 1.000
    assert _member_starts(p_even, [0, 1, 2, 3], "ce") == pytest.approx(
        [base + 0.080, base + 0.000, base + 0.000, base + 0.080], abs=APPROX)

    # ODD: 3 members in group 0 line 0 (w0,w1,w2 only). midpoint = idx1.
    # distances [1,0,1] → idx1 step0 ; idx0,idx2 step1
    p_odd = fx.synth_project()
    p_odd["layout"][0]["lines"] = [{"toks": [
        {"ids": [0], "sep": "", "del": False, "style": {}},
        {"ids": [1], "sep": "", "del": False, "style": {}},
        {"ids": [2], "sep": "", "del": False, "style": {}},
    ]}]
    p_odd = fx.with_animations(p_odd, {
        "group": {0: [fx._anim(id="co", channel="alpha", mode="centerout", step=80, step_unit="ms",
                   segments=[fx._seg(fx._time("span_start"), fx._time("span_start", 100), None, 1)])]},
    })
    assert _member_starts(p_odd, [0, 1, 2], "co") == pytest.approx(
        [base + 0.080, base + 0.000, base + 0.080], abs=APPROX)


# AE-TM-08 — Chained (typewriter): step = previous member's animation duration.
def test_AE_TM_08_chained_typewriter():
    # each member's anim is 100ms long (span_start..span_start+100ms); chained → each
    # member starts 100ms after the previous, overriding any step value.
    p = fx.with_animations(fx.synth_project(), {
        "group": {0: [fx._anim(id="tw", channel="alpha", mode="typewriter",
                   stagger={"order": "index", "step": {"value": 999, "unit": "ms"}, "chained": True},
                   segments=[fx._seg(fx._time("span_start"), fx._time("span_start", 100), None, 1)])]},
    })
    base = 1.000
    assert _member_starts(p, [0, 1, 2, 3], "tw") == pytest.approx(
        [base, base + 0.100, base + 0.200, base + 0.300], abs=APPROX)


# AE-TM-09 — Jitter: offset within ±step, seeded by word id → deterministic across runs;
# the offset travels with the word id, not the slot.
def test_AE_TM_09_jitter_deterministic_by_word_id():
    def build(p):
        return fx.with_animations(p, {
            "group": {0: [fx._anim(id="jt", channel="alpha", mode="jitter",
                       stagger={"order": "random", "step": {"value": 80, "unit": "ms"}},
                       segments=[fx._seg(fx._time("span_start"), fx._time("span_start", 100), None, 1)])]},
        })
    p1 = build(fx.synth_project())
    p2 = build(copy.deepcopy(fx.synth_project()))
    s1 = _member_starts(p1, [0, 1, 2, 3], "jt")
    s2 = _member_starts(p2, [0, 1, 2, 3], "jt")
    assert s1 == pytest.approx(s2, abs=APPROX)                # determinism across runs
    base = 1.000
    for v in s1:                                              # within ±80ms of base
        assert base - 0.080 - APPROX <= v <= base + 0.080 + APPROX
    # offset is a pure function of word id: swap w0/w1 reading slots → offsets travel
    p3 = build(fx.synth_project())
    line0 = p3["layout"][0]["lines"][0]
    line0["toks"][0], line0["toks"][1] = line0["toks"][1], line0["toks"][0]   # swap slots
    off_w0_before = s1[0] - base
    r = fx.resolved(p3, 0)
    a = next(x for x in r if x["id"] == "jt")
    off_w0_after = a["segments"][0]["start_s"] - base
    assert off_w0_after == pytest.approx(off_w0_before, abs=APPROX)


# AE-TM-10 — step.unit frac = fraction of span; ms = absolute.
def test_AE_TM_10_step_unit_frac_vs_ms():
    # span = group event window = 1.000..3.000 → span length 2.000 s.
    # cascade frac step 0.1 → per-member +0.1*2.000 = +0.200 s.
    p = fx.with_animations(fx.synth_project(), {
        "group": {0: [fx._anim(id="cf", channel="alpha", mode="cascade", step=0.1, step_unit="frac",
                   segments=[fx._seg(fx._time("span_start"), fx._time("span_start", 100), None, 1)])]},
    })
    base = 1.000
    assert _member_starts(p, [0, 1, 2, 3], "cf") == pytest.approx(
        [base, base + 0.200, base + 0.400, base + 0.600], abs=APPROX)


# AE-TM-11 — Non-contiguous / multi-line selection cascade is well-defined by reading order.
def test_AE_TM_11_multiline_cascade_reading_order():
    # a tag spanning w0 (line0) and w3 (line1) — reading order w0 then w3.
    p = fx.with_animations(fx.synth_project(), {
        "tags": [{"ids": [0, 3], "anims": [fx._anim(id="nc", channel="alpha",
                  mode="cascade", step=120, step_unit="ms",
                  segments=[fx._seg(fx._time("span_start"), fx._time("span_start", 100), None, 1)])],
                  "suppress": []}],
    })
    base = 1.000   # span over [0,3] = 1.000..3.000 → span_start 1.000
    assert _member_starts(p, [0, 3], "nc") == pytest.approx([base, base + 0.120], abs=APPROX)
