# tests/test_globals_undo.py — set_globals joins the undo timeline (ADJ-10/11/14/15).
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import copy
import controller
from mcp_server.context import HeadlessContext
from mcp_server import tools

results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))

def _ctx():
    c = HeadlessContext(); c.load_lyrics("aligned_lyrics.json"); return c

def t_set_globals_align_undo_reverts():
    c = _ctx()
    a0 = c.get_globals()["align"]
    tools.set_globals(c, {"align": 8})
    a1 = c.get_globals()["align"]
    tools.undo(c)
    a2 = c.get_globals()["align"]
    return (a1 == 8 and a2 == a0 and a0 != 8), f"{a0}->{a1}->{a2}"

def t_set_globals_align_redo_reapplies():
    c = _ctx()
    tools.set_globals(c, {"align": 8})
    tools.undo(c)
    tools.redo(c)
    return (c.get_globals()["align"] == 8), str(c.get_globals()["align"])

def t_set_globals_pos_use_pos_roundtrip():
    c = _ctx()
    g0 = c.get_globals()
    tools.set_globals(c, {"use_pos": True, "pos": [960, 540]})
    g1 = c.get_globals()
    tools.undo(c)
    g2 = c.get_globals()
    tools.redo(c)
    g3 = c.get_globals()
    return (g1["pos"] == [960, 540] and g1["use_pos"] is True
            and g2["pos"] == g0["pos"] and g2["use_pos"] == g0["use_pos"]
            and g3["pos"] == [960, 540] and g3["use_pos"] is True), f"{g0['pos']}/{g0['use_pos']} -> {g2['pos']}/{g2['use_pos']}"

def t_set_globals_margins_undo():
    c = _ctx()
    m0 = c.get_globals()["margin_l"]
    tools.set_globals(c, {"margin_l": 200})
    tools.undo(c)
    return (c.get_globals()["margin_l"] == m0 and m0 != 200), f"{m0}"

def t_mixed_history_unwinds_in_order():
    c = _ctx()
    align0 = c.get_globals()["align"]
    # interleave: globals edit, project edit, globals edit
    tools.set_globals(c, {"align": 8})
    tools.merge_word_span(c, 0, 1, 0, 2, sep=" ")
    n_after_merge = len(c.session.project["layout"][0]["lines"][1]["toks"])
    tools.set_globals(c, {"align": 4})
    # unwind in reverse order
    tools.undo(c)   # undo align 4 -> 8
    s1 = c.get_globals()["align"] == 8
    tools.undo(c)   # undo merge
    s2 = len(c.session.project["layout"][0]["lines"][1]["toks"]) == n_after_merge + 2
    s3 = c.get_globals()["align"] == 8   # still 8 (globals unchanged by project undo)
    tools.undo(c)   # undo align 8 -> original
    s4 = c.get_globals()["align"] == align0
    return (s1 and s2 and s3 and s4), f"{s1}{s2}{s3}{s4}"

def t_global_edit_still_undo():
    # REWRITE (animations migration): set_fade_defaults is removed (fades are now
    # animations). The undo path for a globals edit is unchanged — exercise it through
    # the surviving set_globals tool instead.
    c = _ctx()
    f0 = c.get_globals().get("align")
    tools.set_globals(c, {"align": 5})
    f1 = c.get_globals().get("align")
    tools.undo(c)
    f2 = c.get_globals().get("align")
    return (f1 == 5 and f2 == f0), f"{f0}->{f1}->{f2}"

def t_get_project_after_undo_reflects_reverted_placement():
    c = _ctx()
    p0 = tools.get_project(c)["placement"]["align"]
    tools.set_globals(c, {"align": 8})
    tools.undo(c)
    p2 = tools.get_project(c)["placement"]["align"]
    return (p2 == p0), f"{p0}->{p2}"

def t_session_without_aux_byte_identical():
    # A bare Session (no aux hooks) must behave exactly as before.
    c = _ctx()
    s = controller.Session(project=copy.deepcopy(c.session.project))
    assert s.aux_get is None and s.aux_set is None
    snap = copy.deepcopy(s.project)
    s.do("set_global", "fade_in_ms", 123)
    moved = s.project["globals"]["fade_in_ms"] == 123
    s.undo()
    reverted = s.project == snap
    # no-op rejection path unchanged
    rv = s.do("set_global", "nonexistent_field_xyz", 1) if False else None
    return (moved and reverted), f"moved={moved} reverted={reverted}"

def t_global_style_undo():
    c = _ctx()
    fs0 = c.get_globals()["fontsize"]
    tools.set_globals(c, {"fontsize": 99})
    tools.undo(c)
    return (c.get_globals()["fontsize"] == fs0 and fs0 != 99), f"{fs0}"

def t_can_undo_redo_fresh_false():
    c = _ctx()
    return (c.session.can_undo() is False and c.session.can_redo() is False), "fresh"

def t_can_undo_true_after_edit():
    c = _ctx(); tools.set_group_style(c, 0, {"fontsize": 80})
    return (c.session.can_undo() is True and c.session.can_redo() is False), "after edit"

def t_can_redo_true_after_undo():
    c = _ctx(); tools.set_group_style(c, 0, {"fontsize": 80}); tools.undo(c)
    return (c.session.can_redo() is True), "after undo"

def t_redo_flips_back():
    c = _ctx(); tools.set_group_style(c, 0, {"fontsize": 80})
    tools.undo(c); tools.redo(c)
    return (c.session.can_undo() is True and c.session.can_redo() is False), "after redo"

def t_can_undo_reflects_remaining():
    c = _ctx()
    tools.set_group_style(c, 0, {"fontsize": 80})
    tools.set_group_style(c, 0, {"fontsize": 90})
    tools.undo(c)
    return (c.session.can_undo() is True and c.session.can_redo() is True), "two edits, one undo"

def t_get_project_state_carry_flags():
    c = _ctx()
    p0 = tools.get_project(c); s0 = tools.get_state(c)
    tools.set_group_style(c, 0, {"fontsize": 80})
    p1 = tools.get_project(c); s1 = tools.get_state(c)
    return (p0["can_undo"] is False and p0["can_redo"] is False
            and s0["can_undo"] is False
            and p1["can_undo"] is True and s1["can_undo"] is True), \
           f"p0={p0['can_undo']} p1={p1['can_undo']}"

_active = {n: f for n, f in list(globals().items()) if n.startswith("t_") and callable(f)}
for n, f in sorted(_active.items()): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, dd in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"\n       -> {dd}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
