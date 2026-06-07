# tests/test_anim_resolve.py — Cluster AE, 2B: resolution semantics (AE-RES-01..10).
import os, sys, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import anim_fixtures as fx
from tests_anim_helpers import ids_of, src_of  # local helper module (below)


# AE-RES-01 — waterfall collect: global ∪ group ∪ tag, in global→group→tag order. [A]
def test_AE_RES_01_waterfall_collect_order():
    p = fx.with_inherited_stack()         # global g_fade, group-0 grp_pop, tag t_color over [0,1]
    r = fx.resolved(p, 0)                 # cue 0 is in group 0 and in the tag
    assert ids_of(r) == ["g_fade", "grp_pop", "t_color"]
    assert src_of(r) == ["global", "group", "tag"]


# AE-RES-02 — group suppress drops the inherited global for that group only;
# the global record stays present in the project dict. [A]
def test_AE_RES_02_group_suppression():
    p = fx.with_tombstone()               # global g_fade, group-0 suppress ["g_fade"]
    r0 = fx.resolved(p, 0)                # group 0 → suppressed
    r4 = fx.resolved(p, 4)               # group 1 → still inherits
    assert "g_fade" not in ids_of(r0)
    assert "g_fade" in ids_of(r4)
    # source-of-truth untouched:
    assert p["globals"]["animations"][0]["id"] == "g_fade"


# AE-RES-03 — tag.suppress mutes inherited global+group anims for the tag's ids only. [A]
def test_AE_RES_03_tag_suppression():
    p = fx.with_animations(fx.synth_project(), {
        "global": [fx._anim(id="g_fade", name="fade_in", channel="alpha")],
        "tags": [{"ids": [0], "anims": [], "suppress": ["g_fade"]}],
    })
    r0 = fx.resolved(p, 0)               # tag suppresses g_fade for cue 0
    r1 = fx.resolved(p, 1)               # cue 1 not in the tag → inherits
    assert "g_fade" not in ids_of(r0)
    assert "g_fade" in ids_of(r1)


# AE-RES-04 — additivity: non-conflicting animations all survive. [A]
def test_AE_RES_04_additivity():
    p = fx.with_animations(fx.synth_project(), {
        "global": [fx._anim(id="ga", name="fade_in", channel="alpha")],
        "group": {0: [fx._anim(id="gp", name="pop", channel="scale_x")]},
        "tags": [{"ids": [0], "anims": [fx._anim(id="tc", name="color", channel="primary",
                  segments=[fx._seg(fx._time("cue_start"), fx._time("cue_end"), "#FFF", "#F00")])],
                  "suppress": []}],
    })
    assert set(ids_of(fx.resolved(p, 0))) == {"ga", "gp", "tc"}


# AE-RES-05 — cross-scope conflict, narrowest wins, whole-animation drop. [A]
# Worked example: global pop (scale_x, cue_start..+200) vs cue-tag stretch
# (scale_x, cue_start+50..+250) overlap on cue 0 → drop global pop for cue 0 only.
def test_AE_RES_05_cross_scope_conflict_narrowest_wins():
    p = fx.with_overlap_conflict()
    assert ids_of(fx.resolved(p, 0)) == ["stretch"]      # global pop dropped whole
    assert "pop" in ids_of(fx.resolved(p, 1))            # cue not in tag keeps the global


# AE-RES-06 — non-overlapping same-channel cross-scope: both run (drop is overlap-gated). [A]
def test_AE_RES_06_non_overlapping_both_run():
    p = fx.with_animations(fx.synth_project(), {
        "global": [fx._anim(id="g_sx", channel="scale_x",
                   segments=[fx._seg(fx._time("cue_start"), fx._time("cue_start", 100), None, 120)])],
        "tags": [{"ids": [0], "anims": [fx._anim(id="t_sx", channel="scale_x",
                  segments=[fx._seg(fx._time("cue_start", 200), fx._time("cue_start", 300), None, 140)])],
                  "suppress": []}],
    })
    assert set(ids_of(fx.resolved(p, 0))) == {"g_sx", "t_sx"}


# AE-RES-07 — enabled:false excluded; suppressed != disabled (both excluded). [A]
def test_AE_RES_07_disabled_excluded():
    p = fx.with_animations(fx.synth_project(), {
        "group": {0: [fx._anim(id="on", channel="alpha", enabled=True),
                      fx._anim(id="off", channel="scale_x", enabled=False)]},
    })
    r = fx.resolved(p, 0)
    assert "on" in ids_of(r)
    assert "off" not in ids_of(r)


# AE-RES-08 — same-scope same-channel overlap: both emitted AND a warning surfaced. [A]
def test_AE_RES_08_same_scope_overlap_warns():
    p = fx.with_same_scope_overlap()      # group-0 pop + stretch on scale_x, overlapping
    r = fx.resolved(p, 0)
    assert set(ids_of(r)) == {"pop", "stretch"}
    warned = [a for a in r if a.get("warning") == "overlap"]
    assert {a["id"] for a in warned} == {"pop", "stretch"}


# AE-RES-09 — two custom-named anims on one channel do NOT suppress by name. [A]
def test_AE_RES_09_name_does_not_suppress():
    p = fx.with_animations(fx.synth_project(), {
        # both named "custom", non-overlapping → both survive (overlap rule, not name)
        "group": {0: [
            fx._anim(id="c1", name="custom", channel="alpha",
                     segments=[fx._seg(fx._time("cue_start"), fx._time("cue_start", 50), None, 1)]),
            fx._anim(id="c2", name="custom", channel="alpha",
                     segments=[fx._seg(fx._time("cue_start", 100), fx._time("cue_start", 150), None, 1)]),
        ]},
    })
    assert set(ids_of(fx.resolved(p, 0))) == {"c1", "c2"}


# AE-RES-10 — roundtrip: resolve, drop the tag, resolve again == pre-add baseline. [R]
def test_AE_RES_10_roundtrip_resolved_equals_baseline():
    base = fx.with_animations(fx.synth_project(), {
        "global": [fx._anim(id="pop", name="pop", channel="scale_x",
                   segments=[fx._seg(fx._time("cue_start"), fx._time("cue_start", 200), None, 120)])],
    })
    baseline_resolved = copy.deepcopy(fx.resolved(base, 0))
    # add an overriding cue-tag stretch that wins:
    p = fx.with_animations(base, {
        "tags": [{"ids": [0], "anims": [fx._anim(id="stretch", channel="scale_x",
                  segments=[fx._seg(fx._time("cue_start", 50), fx._time("cue_start", 250), None, 140)])],
                  "suppress": []}],
    })
    assert ids_of(fx.resolved(p, 0)) == ["stretch"]
    # remove the override (back to baseline project) → resolved deep-equals baseline:
    p["anim_tags"] = []
    assert fx.resolved(p, 0) == baseline_resolved
