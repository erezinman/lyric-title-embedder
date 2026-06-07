# tests/test_anim_undo.py — Cluster AE, 2G: undo/redo through Session (AE-UNDO-01..06).
#
# Each of the four anim_* mutations: do → undo restores baseline (deep-equal) → redo
# reapplies; each is ONE undo step. Run through controller.Session (the same rails the
# existing mutation tests use).
import os, sys, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import controller
import anim_fixtures as fx


def _sx_anim():
    return fx._anim(id="newpop", name="pop", channel="scale_x",
                    segments=[fx._seg(fx._time("cue_start"), fx._time("cue_start", 150), None, 120)])


# AE-UNDO-01 — add_animation ↔ undo. [R]
def test_AE_UNDO_01_add_then_undo():
    p = fx.synth_project()
    s = controller.Session(p)
    baseline = copy.deepcopy(s.project)
    s.do("anim_add", "global", None, _sx_anim())
    added = any(a["id"] == "newpop" for a in s.project["globals"]["animations"])
    s.undo()
    assert added and s.project == baseline
    s.redo()
    assert any(a["id"] == "newpop" for a in s.project["globals"]["animations"])


# AE-UNDO-02 — remove_animation (own anim delete) ↔ undo. [R]
def test_AE_UNDO_02_remove_own_then_undo():
    p = fx.with_animations(fx.synth_project(), {
        "global": [fx._anim(id="g_fade", name="fade_in", channel="alpha")],
    })
    s = controller.Session(p)
    baseline = copy.deepcopy(s.project)
    s.do("anim_remove", "global", None, "g_fade")
    gone = not any(a["id"] == "g_fade" for a in s.project["globals"]["animations"])
    s.undo()
    assert gone and s.project == baseline


# AE-UNDO-03 — remove_animation (inherited → tombstone) ↔ undo (tombstone removed). [R]
def test_AE_UNDO_03_remove_inherited_tombstone_then_undo():
    p = fx.with_animations(fx.synth_project(), {
        "global": [fx._anim(id="g_fade", name="fade_in", channel="alpha")],
    })
    s = controller.Session(p)
    baseline = copy.deepcopy(s.project)
    s.do("anim_remove", "group", 0, "g_fade")
    tomb = "g_fade" in s.project["layout"][0].get("suppress", [])
    src_intact = any(a["id"] == "g_fade" for a in s.project["globals"]["animations"])
    s.undo()
    assert tomb and src_intact and s.project == baseline


# AE-UNDO-04 — restore_animation (clear tombstone) ↔ undo (tombstone re-added). [R]
def test_AE_UNDO_04_restore_then_undo():
    p = fx.with_tombstone()    # global g_fade, group-0 suppress ["g_fade"]
    s = controller.Session(p)
    baseline = copy.deepcopy(s.project)
    s.do("anim_restore", "group", 0, "g_fade")
    cleared = "g_fade" not in s.project["layout"][0].get("suppress", [])
    s.undo()
    re_added = "g_fade" in s.project["layout"][0].get("suppress", [])
    assert cleared and re_added and s.project == baseline


# AE-UNDO-05 — set_animation_props ↔ undo; set_props(original) is itself a valid inverse. [R]
def test_AE_UNDO_05_set_props_then_undo_and_manual_inverse():
    p = fx.with_animations(fx.synth_project(), {
        "global": [fx._anim(id="g_fade", name="fade_in", channel="alpha", enabled=True)],
    })
    s = controller.Session(p)
    baseline = copy.deepcopy(s.project)
    s.do("anim_set_props", "global", None, "g_fade", {"enabled": False})
    flipped = s.project["globals"]["animations"][0]["enabled"] is False
    s.undo()
    assert flipped and s.project == baseline
    # manual inverse: set to new, then set back to original → back to square one
    s.do("anim_set_props", "global", None, "g_fade", {"enabled": False})
    s.do("anim_set_props", "global", None, "g_fade", {"enabled": True})
    assert s.project == baseline


# AE-UNDO-06 — add → remove → undo → undo restores baseline (two-step history). [R,D]
def test_AE_UNDO_06_two_step_history():
    p = fx.synth_project()
    s = controller.Session(p)
    baseline = copy.deepcopy(s.project)
    s.do("anim_add", "global", None, _sx_anim())
    after_add = copy.deepcopy(s.project)
    s.do("anim_remove", "global", None, "newpop")
    s.undo()                      # undo remove → back to after_add
    assert s.project == after_add
    s.undo()                      # undo add → back to baseline
    assert s.project == baseline
