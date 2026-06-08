# tests/test_lint.py — engine.lint.lint_project: export-readiness issue aggregation.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import copy
import engine
from engine import lint
import anim_fixtures as fx


def _codes(issues):
    return sorted({i["code"] for i in issues})


def test_clean_project_no_issues():
    p = fx.synth_project()
    assert lint.lint_project(p) == []


def test_same_scope_overlap_warns():
    p = fx.with_same_scope_overlap()
    issues = lint.lint_project(p)
    over = [i for i in issues if i["code"] == "anim_overlap"]
    assert over, issues
    assert over[0]["level"] == "warn"
    assert over[0]["where"]["channel"] == "scale_x"


def test_cross_scope_overlap_not_flagged_as_same_scope():
    # cross-scope conflict drops the wider scope (no same-scope "overlap" warning)
    p = fx.with_overlap_conflict()
    issues = lint.lint_project(p)
    assert [i for i in issues if i["code"] == "anim_overlap"] == [], issues


def test_off_canvas_pos_warns():
    p = fx.synth_project()
    placement = {"use_pos": True, "pos": [5000, 200], "play_w": 1920, "play_h": 1080}
    issues = lint.lint_project(p, placement)
    pc = [i for i in issues if i["code"] == "pos_off_canvas"]
    assert pc and pc[0]["level"] == "warn", issues
    assert pc[0]["where"]["pos"] == [5000.0, 200.0]


def test_pos_inside_canvas_clean():
    p = fx.synth_project()
    placement = {"use_pos": True, "pos": [960, 540], "play_w": 1920, "play_h": 1080}
    assert [i for i in lint.lint_project(p, placement) if i["code"] == "pos_off_canvas"] == []


def test_pos_ignored_when_use_pos_false():
    p = fx.synth_project()
    placement = {"use_pos": False, "pos": [5000, 5000], "play_w": 1920, "play_h": 1080}
    assert lint.lint_project(p, placement) == []


def test_invalid_persisted_anim_errors():
    p = fx.with_animations(fx.synth_project(),
                           {"global": [fx._anim(id="bad", channel="not_a_channel")]})
    issues = lint.lint_project(p)
    inv = [i for i in issues if i["code"] == "anim_invalid"]
    assert inv and inv[0]["level"] == "error", issues
    assert inv[0]["where"]["anim_id"] == "bad"


def test_off_window_anim_clamped_warns():
    # an animation that ends far past the event end (cue_end + 100s) extends outside
    # the window -> anim_clamped warning.
    p = fx.with_animations(fx.synth_project(), {"group": {0: [
        fx._anim(id="late", channel="alpha",
                 segments=[fx._seg(fx._time("cue_end"), fx._time("cue_end", 100000), None, 0)])]}})
    issues = lint.lint_project(p)
    cl = [i for i in issues if i["code"] == "anim_clamped"]
    assert cl and cl[0]["level"] == "warn", issues


def test_in_window_anim_not_clamped():
    p = fx.with_animations(fx.synth_project(), {"group": {0: [
        fx._anim(id="ok", channel="alpha",
                 segments=[fx._seg(fx._time("cue_start"), fx._time("cue_start", 100), None, 1)])]}})
    assert [i for i in lint.lint_project(p) if i["code"] == "anim_clamped"] == []


def test_issue_shape():
    p = fx.with_same_scope_overlap()
    for i in lint.lint_project(p):
        assert set(i.keys()) == {"level", "code", "msg", "where"}
        assert i["level"] in ("warn", "error")
        assert isinstance(i["msg"], str) and isinstance(i["where"], dict)


def test_tool_lint_returns_list():
    from mcp_server.context import HeadlessContext
    from mcp_server import tools
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    out = tools.lint(ctx)
    assert isinstance(out, list)
    # plant an off-canvas pos and re-lint
    ctx.set_globals({"use_pos": True, "pos": [99999, 99999]})
    out2 = tools.lint(ctx)
    assert any(i["code"] == "pos_off_canvas" for i in out2), out2
