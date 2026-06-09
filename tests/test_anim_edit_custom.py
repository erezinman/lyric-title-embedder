# tests/test_anim_edit_custom.py — anim_edit_custom mutation + anim_set_props
# group-sibling segment sync (zip-13 animation panel rework). TDD RED: anim_edit_custom
# does not exist yet and set_props does not sync siblings, so these must FAIL first.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest
from engine import mutations as M
import anim_fixtures as fx


def _custom(id, ch="primary", gid=None, to="#FF3DA6"):
    a = fx._anim(id=id, name="fill", channel=ch, segments=[
        fx._seg(fx._time("cue_end", -30), fx._time("cue_end", -30), None, to, 1)])
    a["custom"] = True
    a["group_id"] = gid
    a["mode"] = "percue"
    return a


# replace a single-channel custom in place, preserving lead id + slot
def test_edit_custom_replaces_in_place_preserving_id():
    p = fx.synth_project()
    M.anim_add(p, "global", None, _custom("a1"))
    M.anim_add(p, "global", None, fx._anim(id="z9", channel="alpha"))   # a later sibling row
    newrec = _custom("a1", ch="blur")
    newrec["segments"][0]["to"] = 6
    M.anim_edit_custom(p, "global", None, "a1", [newrec])
    lst = p["globals"]["animations"]
    assert [a["id"] for a in lst] == ["a1", "z9"]          # slot + order preserved
    assert lst[0]["channel"] == "blur" and lst[0]["custom"] is True


# single -> paired (Scale) adds a sibling sharing group_id; lead id kept
def test_edit_custom_single_to_paired_adds_sibling():
    p = fx.synth_project()
    M.anim_add(p, "global", None, _custom("a1"))
    sx = _custom("a1", ch="scale_x", gid="a1")
    sy = _custom("a2", ch="scale_y", gid="a1")
    M.anim_edit_custom(p, "global", None, "a1", [sx, sy])
    lst = p["globals"]["animations"]
    assert [a["channel"] for a in lst] == ["scale_x", "scale_y"]
    assert lst[0]["id"] == "a1" and lst[0]["group_id"] == "a1" and lst[1]["group_id"] == "a1"


# paired -> single drops the sibling
def test_edit_custom_paired_to_single_drops_sibling():
    p = fx.synth_project()
    M.anim_add(p, "group", 0, _custom("a1", ch="scale_x", gid="a1"))
    M.anim_add(p, "group", 0, _custom("a2", ch="scale_y", gid="a1"))
    M.anim_edit_custom(p, "group", 0, "a1", [_custom("a1", ch="primary")])
    lst = p["layout"][0]["animations"]
    assert [a["id"] for a in lst] == ["a1"] and lst[0]["channel"] == "primary"


# no-op when the id isn't an own record at that scope
def test_edit_custom_noop_on_missing():
    p = fx.synth_project()
    M.anim_edit_custom(p, "global", None, "nope", [_custom("nope")])
    assert p["globals"]["animations"] == []


# validation: a bad incoming record raises (and nothing is spliced)
def test_edit_custom_validates():
    p = fx.synth_project()
    M.anim_add(p, "global", None, _custom("a1"))
    bad = _custom("a1")
    bad["channel"] = "bogus"
    with pytest.raises(ValueError):
        M.anim_edit_custom(p, "global", None, "a1", [bad])


# sibling-sync: a segments write to a group_id lead updates all siblings
def test_set_props_segments_sync_group_siblings():
    p = fx.synth_project()
    M.anim_add(p, "group", 0, _custom("a1", ch="scale_x", gid="a1"))
    M.anim_add(p, "group", 0, _custom("a2", ch="scale_y", gid="a1"))
    newseg = [fx._seg(fx._time("cue_start", 0), fx._time("cue_start", 120), 1, 1.2, 1)]
    M.anim_set_props(p, "group", 0, "a1", {"segments": newseg})
    lst = p["layout"][0]["animations"]
    assert lst[0]["segments"][0]["t1"]["offset"] == 120
    assert lst[1]["segments"][0]["t1"]["offset"] == 120     # sibling synced


# the t0/t1 delta path also syncs siblings
def test_set_props_offset_delta_syncs_siblings():
    p = fx.synth_project()
    M.anim_add(p, "group", 0, _custom("a1", ch="scale_x", gid="a1"))
    M.anim_add(p, "group", 0, _custom("a2", ch="scale_y", gid="a1"))
    # base offsets are -30 (cue_end -30); a +10 delta -> -20
    M.anim_set_props(p, "group", 0, "a1", {"t1": {"offset": 10}})
    lst = p["layout"][0]["animations"]
    assert lst[0]["segments"][0]["t1"]["offset"] == -20
    assert lst[1]["segments"][0]["t1"]["offset"] == -20


# sibling-sync does NOT touch non-segment props (mode stays per-record)
def test_set_props_mode_not_synced():
    p = fx.synth_project()
    M.anim_add(p, "group", 0, _custom("a1", ch="scale_x", gid="a1"))
    M.anim_add(p, "group", 0, _custom("a2", ch="scale_y", gid="a1"))
    M.anim_set_props(p, "group", 0, "a1", {"mode": "cascade", "step": 80, "step_unit": "ms"})
    lst = p["layout"][0]["animations"]
    assert lst[0]["mode"] == "cascade" and lst[1]["mode"] == "percue"
