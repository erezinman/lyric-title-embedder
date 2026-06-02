"""UNDO / REDO & COMPLEX OPERATION CHAINS — known end states.

Category: each test starts from reset() and checks exact deep-equality against
recorded project snapshots, or asserts precise undo/redo stack semantics.
"""
import os, sys, copy, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import karaoke_subtitle_gui as v2

app = v2.AppV2()
def pump(n=8):
    for _ in range(n):
        app.update(); time.sleep(0.02)
pump(14)
app.open_editor(); pump(6)
ed = app._editor

class Ev: pass
def click(pane, lane, line, x=30, ctrl=False):
    pane.see(f"{line}.0"); pane.update_idletasks()
    bb = pane.bbox(f"{line}.0")
    if not bb: raise RuntimeError(f"line {line} not visible")
    e = Ev(); e.x = x; e.y = bb[1] + 2; e.x_root = 0; e.y_root = 0
    ed._click(e, pane, lane, add=ctrl); pump(2)

def drag(pane, lane, lines):
    click(pane, lane, lines[0])
    for ln in lines[1:]:
        pane.see(f"{ln}.0"); pane.update_idletasks()
        bb = pane.bbox(f"{ln}.0")
        e = Ev(); e.x = 20; e.y = bb[1] + 2; e.x_root = 0; e.y_root = 0
        ed._range_click(e, pane, lane, light=True); pump(1)
    ed._drag_release(); pump(1)

def reset():
    app._reload_groups(); pump(4); ed.collapsed.clear(); ed.reload(); pump(2)

def render_words():
    return [w for g in app._groups for ln in g["lines"] for w in ln["words"]]

results = []
def check(name, fn):
    try:
        reset()
        ok, detail = fn()
        results.append((ok, name, detail))
    except Exception as e:
        import traceback
        results.append((False, name, f"EXC {type(e).__name__}: {e}"))

# ──────────────────────────────────────────────────────────────────────────────
# Helper: snapshot project deep-copy
# ──────────────────────────────────────────────────────────────────────────────
def snap():
    return copy.deepcopy(app._project)


# ══════════════════════════════════════════════════════════════════════════════
# 1. Single edit → undo → redo (MAKE_TAG)
# ══════════════════════════════════════════════════════════════════════════════
def t_undo_redo_make_tag():
    s0 = snap()
    app.make_tag("fin_tags", {0, 1, 2}); pump(2)
    s1 = snap()
    app.undo(); pump(2)
    after_undo = snap()
    app.redo(); pump(2)
    after_redo = snap()
    ok = (after_undo == s0 and after_redo == s1
          and len(s1["fin_tags"]) == 1
          and s0["fin_tags"] == [])
    return ok, f"tags_after_redo={len(after_redo['fin_tags'])}"


# ══════════════════════════════════════════════════════════════════════════════
# 2. Single edit → undo → redo (SET_GLOBAL)
# ══════════════════════════════════════════════════════════════════════════════
def t_undo_redo_set_global():
    s0 = snap()
    app.set_global("fade_in_ms", 999); pump(2)
    s1 = snap()
    app.undo(); pump(2)
    after_undo = snap()
    app.redo(); pump(2)
    after_redo = snap()
    ok = (after_undo == s0 and after_redo == s1
          and s1["globals"]["fade_in_ms"] == 999
          and s0["globals"]["fade_in_ms"] != 999)
    return ok, f"fin_ms_after_redo={after_redo['globals']['fade_in_ms']}"


# ══════════════════════════════════════════════════════════════════════════════
# 3. Single edit → undo → redo (SET_GROUP_STYLE)
# ══════════════════════════════════════════════════════════════════════════════
def t_undo_redo_set_group_style():
    s0 = snap()
    app.set_group_style(0, {"fontsize": 72}); pump(2)
    s1 = snap()
    app.undo(); pump(2)
    after_undo = snap()
    app.redo(); pump(2)
    after_redo = snap()
    ok = (after_undo == s0 and after_redo == s1
          and s1["layout"][0]["style"].get("fontsize") == 72)
    return ok, f"fontsize_after_redo={after_redo['layout'][0]['style'].get('fontsize')}"


# ══════════════════════════════════════════════════════════════════════════════
# 4. Single edit → undo → redo (SET_CUE_STYLE)
# ══════════════════════════════════════════════════════════════════════════════
def t_undo_redo_set_cue_style():
    wid = app._project["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    s0 = snap()
    app.set_cue_style({wid}, {"primary": "#AABBCC"}); pump(2)
    s1 = snap()
    app.undo(); pump(2)
    after_undo = snap()
    app.redo(); pump(2)
    after_redo = snap()
    tok0 = after_redo["layout"][0]["lines"][0]["toks"][0]
    ok = (after_undo == s0 and after_redo == s1
          and tok0.get("style", {}).get("primary") == "#AABBCC")
    return ok, f"primary_after_redo={tok0.get('style', {}).get('primary')}"


# ══════════════════════════════════════════════════════════════════════════════
# 5. Single edit → undo → redo (TOGGLE_WORD_DEL)
# ══════════════════════════════════════════════════════════════════════════════
def t_undo_redo_toggle_word_del():
    wid = app._project["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    s0 = snap()
    app.toggle_word_del({wid}, True); pump(2)
    s1 = snap()
    app.undo(); pump(2)
    after_undo = snap()
    app.redo(); pump(2)
    after_redo = snap()
    tok = after_redo["layout"][0]["lines"][0]["toks"][0]
    ok = (after_undo == s0 and after_redo == s1 and tok.get("del") is True)
    return ok, f"del_after_redo={tok.get('del')}"


# ══════════════════════════════════════════════════════════════════════════════
# 6. Single edit → undo → redo (ADD_BREAK)
# ══════════════════════════════════════════════════════════════════════════════
def t_undo_redo_add_break():
    # group 1 line 0 has 6 toks; insert break after tok 2
    gi, li, ti = 1, 0, 2
    nl0 = len(app._project["layout"][gi]["lines"])
    s0 = snap()
    app.add_break(gi, li, ti, after=True); pump(2)
    s1 = snap()
    nl1 = len(app._project["layout"][gi]["lines"])
    app.undo(); pump(2)
    after_undo = snap()
    nl2 = len(app._project["layout"][gi]["lines"])
    app.redo(); pump(2)
    after_redo = snap()
    nl3 = len(app._project["layout"][gi]["lines"])
    ok = (after_undo == s0 and after_redo == s1
          and nl1 == nl0 + 1 and nl2 == nl0 and nl3 == nl1)
    return ok, f"lines: {nl0}->{nl1}->{nl2}->{nl3}"


# ══════════════════════════════════════════════════════════════════════════════
# 7. Single edit → undo → redo (SET_LAYOUT_PROPS)
# ══════════════════════════════════════════════════════════════════════════════
def t_undo_redo_set_layout_props():
    s0 = snap()
    app.set_layout_props(0, None, None, 3.5, "lines"); pump(2)
    s1 = snap()
    app.undo(); pump(2)
    after_undo = snap()
    app.redo(); pump(2)
    after_redo = snap()
    g = after_redo["layout"][0]
    ok = (after_undo == s0 and after_redo == s1
          and g["linger"] == 3.5 and g["accumulate"] == "lines")
    return ok, f"linger={g['linger']} acc={g['accumulate']}"


# ══════════════════════════════════════════════════════════════════════════════
# 8. Single edit → undo → redo (LAYOUT_SPLIT_EVENT)
# ══════════════════════════════════════════════════════════════════════════════
def t_undo_redo_layout_split_event():
    gi = 1   # group with 8 lines
    nl0 = len(app._project["layout"])
    s0 = snap()
    app.layout_split_event(gi, 4); pump(2)
    s1 = snap()
    nl1 = len(app._project["layout"])
    app.undo(); pump(2)
    after_undo = snap()
    nl2 = len(app._project["layout"])
    app.redo(); pump(2)
    after_redo = snap()
    nl3 = len(app._project["layout"])
    ok = (after_undo == s0 and after_redo == s1
          and nl1 == nl0 + 1 and nl2 == nl0 and nl3 == nl1)
    return ok, f"groups: {nl0}->{nl1}->{nl2}->{nl3}"


# ══════════════════════════════════════════════════════════════════════════════
# 9. Multi-step chain: 5 edits, snapshot each; undo 5 times, check intermediates;
#    redo 5 times back to final.
# ══════════════════════════════════════════════════════════════════════════════
def t_multi_step_chain_and_full_undo_redo():
    s0 = snap()

    app.set_global("fade_in_ms", 300); pump(2)
    s1 = snap()
    app.make_tag("fin_tags", {0, 1}); pump(2)
    s2 = snap()
    app.set_group_style(0, {"fontsize": 60}); pump(2)
    s3 = snap()
    app.toggle_word_del({2}, True); pump(2)
    s4 = snap()
    app.set_layout_props(0, None, None, 1.5, "words"); pump(2)
    s5 = snap()

    # undo 5 times — must match recorded intermediates in reverse
    app.undo(); pump(2); u5 = snap()
    app.undo(); pump(2); u4 = snap()
    app.undo(); pump(2); u3 = snap()
    app.undo(); pump(2); u2 = snap()
    app.undo(); pump(2); u1 = snap()

    # redo 5 times — must reach s5 again
    app.redo(); pump(2); r1 = snap()
    app.redo(); pump(2); r2 = snap()
    app.redo(); pump(2); r3 = snap()
    app.redo(); pump(2); r4 = snap()
    app.redo(); pump(2); r5 = snap()

    ok = (u5 == s4 and u4 == s3 and u3 == s2 and u2 == s1 and u1 == s0
          and r1 == s1 and r2 == s2 and r3 == s3 and r4 == s4 and r5 == s5)
    fails = []
    if u5 != s4: fails.append("u5!=s4")
    if u4 != s3: fails.append("u4!=s3")
    if u3 != s2: fails.append("u3!=s2")
    if u2 != s1: fails.append("u2!=s1")
    if u1 != s0: fails.append("u1!=s0")
    if r1 != s1: fails.append("r1!=s1")
    if r2 != s2: fails.append("r2!=s2")
    if r3 != s3: fails.append("r3!=s3")
    if r4 != s4: fails.append("r4!=s4")
    if r5 != s5: fails.append("r5!=s5")
    return ok, ("ok" if ok else "failed: " + ", ".join(fails))


# ══════════════════════════════════════════════════════════════════════════════
# 10. Redo invalidation: A, B, undo (→A), new edit C → redo does nothing (B gone)
# ══════════════════════════════════════════════════════════════════════════════
def t_redo_invalidated_by_new_edit():
    s0 = snap()
    app.set_global("fade_in_ms", 111); pump(2)   # A
    sA = snap()
    app.set_global("fade_out_ms", 222); pump(2)  # B
    sB = snap()

    app.undo(); pump(2)  # back to A
    assert snap() == sA

    app.set_global("linger", 9.9); pump(2)       # C
    sC = snap()

    # redo must be a no-op (B is gone)
    app.redo(); pump(2)
    after_redo = snap()

    ok = (after_redo == sC                        # redo did nothing → still C
          and after_redo["globals"]["linger"] == 9.9
          and after_redo["globals"]["fade_out_ms"] != 222)  # B not applied
    return ok, f"linger={after_redo['globals'].get('linger')} fout={after_redo['globals'].get('fade_out_ms')}"


# ══════════════════════════════════════════════════════════════════════════════
# 11. Rejected op (layout_merge non-adjacent) doesn't pollute undo/redo stacks
# ══════════════════════════════════════════════════════════════════════════════
def t_rejected_op_doesnt_touch_undo_redo():
    # do a real edit first (makes redo stack empty)
    app.make_tag("fin_tags", {10, 11}); pump(2)
    app.undo(); pump(2)  # redo now has 1 entry
    redo_len_before = len(app._session._redo)

    # attempt non-adjacent merge (rejected → should NOT clear redo)
    app.layout_merge({0, 2}); pump(2)   # non-adjacent → returns False
    redo_len_after = len(app._session._redo)

    ok = (redo_len_before == 1 and redo_len_after == 1)
    return ok, f"redo_before={redo_len_before} redo_after={redo_len_after}"


# ══════════════════════════════════════════════════════════════════════════════
# 12. No-op detection: set_group_style with no effective change → no undo step
# ══════════════════════════════════════════════════════════════════════════════
def t_noop_set_group_style_no_undo_step():
    # layout[0] initially has no "font" key → clearing it is a no-op
    undo_before = len(app._session._undo)
    app.set_group_style(0, {"font": None}); pump(2)
    undo_after = len(app._session._undo)

    # also verify: real edit → undo still undoes the real edit, not phantom no-op
    app.set_group_style(0, {"fontsize": 80}); pump(2)
    s_real = snap()
    app.undo(); pump(2)
    after_undo = snap()

    ok = (undo_before == undo_after                # no-op added no step
          and after_undo["layout"][0]["style"].get("fontsize") is None)  # real edit undone
    return ok, f"undo_stack_delta={undo_after - undo_before} fontsize_after_undo={after_undo['layout'][0]['style'].get('fontsize')}"


# ══════════════════════════════════════════════════════════════════════════════
# 13. Empty make_tag is a no-op → undo after it still undoes the prior real edit
# ══════════════════════════════════════════════════════════════════════════════
def t_empty_make_tag_noop_preserves_undo():
    app.set_global("fade_in_ms", 400); pump(2)
    s_real = snap()

    # empty make_tag → no-op
    app.make_tag("fin_tags", set()); pump(2)

    # undo should revert the set_global, not the (never-recorded) make_tag
    app.undo(); pump(2)
    after_undo = snap()
    # should now be the state before set_global
    ok = (after_undo["globals"]["fade_in_ms"] != 400)
    return ok, f"fade_in_ms_after_undo={after_undo['globals']['fade_in_ms']}"


# ══════════════════════════════════════════════════════════════════════════════
# 14. Undo with empty stack is safe (no crash, no change)
# ══════════════════════════════════════════════════════════════════════════════
def t_undo_empty_stack_safe():
    s0 = snap()
    # undo stack should be empty after reset
    assert len(app._session._undo) == 0
    app.undo(); pump(2)
    app.undo(); pump(2)
    after = snap()
    ok = (after == s0)
    return ok, f"project_unchanged={ok}"


# ══════════════════════════════════════════════════════════════════════════════
# 15. Redo with empty stack is safe (no crash, no change)
# ══════════════════════════════════════════════════════════════════════════════
def t_redo_empty_stack_safe():
    s0 = snap()
    assert len(app._session._redo) == 0
    app.redo(); pump(2)
    app.redo(); pump(2)
    after = snap()
    ok = (after == s0)
    return ok, f"project_unchanged={ok}"


# ══════════════════════════════════════════════════════════════════════════════
# 16. Style override → clear → undo fontsize → undo again restores no-override
# ══════════════════════════════════════════════════════════════════════════════
def t_style_override_clear_undo_chain():
    s0 = snap()
    # set fontsize override
    app.set_group_style(0, {"fontsize": 88}); pump(2)
    s1 = snap()
    # clear it (back to inherit)
    app.set_group_style(0, {"fontsize": None}); pump(2)
    s2 = snap()

    # undo → fontsize override restored
    app.undo(); pump(2)
    after_undo1 = snap()
    # undo again → original (no override)
    app.undo(); pump(2)
    after_undo2 = snap()

    fontsize_after_undo1 = after_undo1["layout"][0]["style"].get("fontsize")
    fontsize_after_undo2 = after_undo2["layout"][0]["style"].get("fontsize")
    ok = (after_undo1 == s1
          and after_undo2 == s0
          and fontsize_after_undo1 == 88
          and fontsize_after_undo2 is None)
    return ok, f"fs_u1={fontsize_after_undo1} fs_u2={fontsize_after_undo2}"


# ══════════════════════════════════════════════════════════════════════════════
# 17. Interleaved 6-op scenario → full undo to original
# ══════════════════════════════════════════════════════════════════════════════
def t_interleaved_6ops_full_undo():
    s0 = snap()

    app.set_global("fade_out_ms", 500); pump(2)               # op1: global
    app.make_tag("fout_tags", {5, 6, 7}); pump(2)             # op2: fade-out tag
    app.set_group_style(1, {"fontsize": 55}); pump(2)         # op3: group style
    wid = app._project["layout"][1]["lines"][0]["toks"][0]["ids"][0]
    app.set_cue_style({wid}, {"primary": "#FF00FF"}); pump(2) # op4: cue style
    app.toggle_word_del({8, 9}, True); pump(2)                 # op5: word del
    app.set_layout_props(1, None, None, 2.0, "lines"); pump(2) # op6: layout props

    s6 = snap()

    # fully undo all 6 ops
    for _ in range(6):
        app.undo(); pump(2)

    after_full_undo = snap()
    ok = (after_full_undo == s0)
    fails = []
    if after_full_undo["globals"]["fade_out_ms"] != s0["globals"]["fade_out_ms"]:
        fails.append("globals differ")
    if len(after_full_undo["fout_tags"]) != len(s0["fout_tags"]):
        fails.append("fout_tags differ")
    return ok, ("ok" if ok else "failed: " + ", ".join(fails))


# ══════════════════════════════════════════════════════════════════════════════
# 18. Undo across fade-tag group + prop override (make_tag then set_tag_props)
# ══════════════════════════════════════════════════════════════════════════════
def t_undo_make_tag_then_set_tag_props():
    s0 = snap()
    app.make_tag("fin_tags", {3, 4, 5}); pump(2)
    s1 = snap()
    ti = len(app._project["fin_tags"]) - 1
    app.set_tag_props("fin_tags", ti, 12.5, 750.0); pump(2)
    s2 = snap()

    # undo set_tag_props
    app.undo(); pump(2)
    after_undo1 = snap()
    # undo make_tag
    app.undo(); pump(2)
    after_undo2 = snap()

    ok = (after_undo1 == s1 and after_undo2 == s0
          and s2["fin_tags"][-1]["trigger"] == 12.5
          and s2["fin_tags"][-1]["dur"] == 750.0
          and s1["fin_tags"][-1]["trigger"] is None
          and s1["fin_tags"][-1]["dur"] is None)
    return ok, f"trigger_s2={s2['fin_tags'][-1]['trigger'] if s2['fin_tags'] else 'N/A'}"


# ══════════════════════════════════════════════════════════════════════════════
# 19. Redo after multiple undos replays in correct order to the same final state
# ══════════════════════════════════════════════════════════════════════════════
def t_redo_replays_correct_order():
    app.set_global("fade_in_ms", 111); pump(2); s1 = snap()
    app.set_global("fade_in_ms", 222); pump(2); s2 = snap()
    app.set_global("fade_in_ms", 333); pump(2); s3 = snap()

    # undo twice
    app.undo(); pump(2)
    app.undo(); pump(2)
    assert snap() == s1

    # redo twice must give s2 then s3
    app.redo(); pump(2); r2 = snap()
    app.redo(); pump(2); r3 = snap()

    ok = (r2 == s2 and r3 == s3
          and r2["globals"]["fade_in_ms"] == 222
          and r3["globals"]["fade_in_ms"] == 333)
    return ok, f"r2_ms={r2['globals']['fade_in_ms']} r3_ms={r3['globals']['fade_in_ms']}"


# ══════════════════════════════════════════════════════════════════════════════
# 20. layout_merge adjacent → undo → redo (deep-equal at each stage)
# ══════════════════════════════════════════════════════════════════════════════
def t_undo_redo_layout_merge():
    n0 = len(app._project["layout"])
    s0 = snap()
    app.layout_merge({1, 2}); pump(2)
    s1 = snap()
    n1 = len(app._project["layout"])

    app.undo(); pump(2)
    after_undo = snap()
    n2 = len(app._project["layout"])

    app.redo(); pump(2)
    after_redo = snap()
    n3 = len(app._project["layout"])

    ok = (n1 == n0 - 1 and n2 == n0 and n3 == n1
          and after_undo == s0 and after_redo == s1)
    return ok, f"groups: {n0}->{n1}->{n2}->{n3}"


# ══════════════════════════════════════════════════════════════════════════════
# 21. layout_ungroup → undo → redo
# ══════════════════════════════════════════════════════════════════════════════
def t_undo_redo_layout_ungroup():
    n0 = len(app._project["layout"])
    lines_in_g1 = len(app._project["layout"][1]["lines"])
    s0 = snap()
    app.layout_ungroup(1); pump(2)
    s1 = snap()
    n1 = len(app._project["layout"])

    app.undo(); pump(2)
    after_undo = snap()
    n2 = len(app._project["layout"])

    app.redo(); pump(2)
    after_redo = snap()
    n3 = len(app._project["layout"])

    ok = (n1 == n0 + lines_in_g1 - 1
          and n2 == n0 and n3 == n1
          and after_undo == s0 and after_redo == s1)
    return ok, f"groups: {n0}->{n1}->{n2}->{n3} (g1 had {lines_in_g1} lines)"


# ══════════════════════════════════════════════════════════════════════════════
# 22. Merge-prev-word → undo → redo
# ══════════════════════════════════════════════════════════════════════════════
def t_undo_redo_merge_prev_word():
    gi, li, ti = 1, 0, 1   # second tok in first line of group 1
    ntoks0 = len(app._project["layout"][gi]["lines"][li]["toks"])
    s0 = snap()
    app.merge_prev_word(gi, li, ti, sep=" "); pump(2)
    s1 = snap()
    ntoks1 = len(app._project["layout"][gi]["lines"][li]["toks"])

    app.undo(); pump(2)
    after_undo = snap()
    ntoks2 = len(app._project["layout"][gi]["lines"][li]["toks"])

    app.redo(); pump(2)
    after_redo = snap()
    ntoks3 = len(app._project["layout"][gi]["lines"][li]["toks"])

    ok = (ntoks1 == ntoks0 - 1 and ntoks2 == ntoks0 and ntoks3 == ntoks1
          and after_undo == s0 and after_redo == s1)
    return ok, f"toks: {ntoks0}->{ntoks1}->{ntoks2}->{ntoks3}"


# ══════════════════════════════════════════════════════════════════════════════
# 23. clear_tag → undo → redo
# ══════════════════════════════════════════════════════════════════════════════
def t_undo_redo_clear_tag():
    app.make_tag("fout_tags", {20, 21, 22}); pump(2)
    s_after_make = snap()
    n0 = len(app._project["fout_tags"])

    app.clear_tag("fout_tags", {20, 21, 22}); pump(2)
    s_after_clear = snap()
    n1 = len(app._project["fout_tags"])

    app.undo(); pump(2)
    after_undo = snap()
    n2 = len(app._project["fout_tags"])

    app.redo(); pump(2)
    after_redo = snap()
    n3 = len(app._project["fout_tags"])

    ok = (n1 == n0 - 1 and n2 == n0 and n3 == n1
          and after_undo == s_after_make
          and after_redo == s_after_clear)
    return ok, f"tags: {n0}->{n1}->{n2}->{n3}"


# ══════════════════════════════════════════════════════════════════════════════
# TESTS LIST
# ══════════════════════════════════════════════════════════════════════════════
tests = [
    ("undo/redo make_tag (deep-equal snapshots)", t_undo_redo_make_tag),
    ("undo/redo set_global (deep-equal snapshots)", t_undo_redo_set_global),
    ("undo/redo set_group_style (deep-equal snapshots)", t_undo_redo_set_group_style),
    ("undo/redo set_cue_style (deep-equal snapshots)", t_undo_redo_set_cue_style),
    ("undo/redo toggle_word_del (deep-equal snapshots)", t_undo_redo_toggle_word_del),
    ("undo/redo add_break (deep-equal snapshots)", t_undo_redo_add_break),
    ("undo/redo set_layout_props (deep-equal snapshots)", t_undo_redo_set_layout_props),
    ("undo/redo layout_split_event (deep-equal snapshots)", t_undo_redo_layout_split_event),
    ("multi-step 5-op chain: undo all intermediates + redo back", t_multi_step_chain_and_full_undo_redo),
    ("redo invalidated by new edit C (B gone)", t_redo_invalidated_by_new_edit),
    ("rejected layout_merge non-adjacent does not clear redo stack", t_rejected_op_doesnt_touch_undo_redo),
    ("no-op set_group_style adds no undo step", t_noop_set_group_style_no_undo_step),
    ("empty make_tag is noop; prior undo still undoes real edit", t_empty_make_tag_noop_preserves_undo),
    ("undo with empty stack is safe", t_undo_empty_stack_safe),
    ("redo with empty stack is safe", t_redo_empty_stack_safe),
    ("style override → clear → undo×2 restores intermediate and original", t_style_override_clear_undo_chain),
    ("interleaved 6-op scenario: full undo to original", t_interleaved_6ops_full_undo),
    ("undo make_tag then set_tag_props reverts in order", t_undo_make_tag_then_set_tag_props),
    ("redo after multiple undos replays in correct order", t_redo_replays_correct_order),
    ("undo/redo layout_merge adjacent (deep-equal snapshots)", t_undo_redo_layout_merge),
    ("undo/redo layout_ungroup (deep-equal snapshots)", t_undo_redo_layout_ungroup),
    ("undo/redo merge_prev_word (deep-equal snapshots)", t_undo_redo_merge_prev_word),
    ("undo/redo clear_tag (deep-equal snapshots)", t_undo_redo_clear_tag),
]

SUSPECTED_BUGS = []  # (name, rationale) — populated if any test reveals a suspected real bug

for name, fn in tests:
    check(name, fn)

print("\n==== UNDO/REDO UI TEST RESULTS ====")
npass = sum(1 for ok, *_ in results if ok)
for ok, name, detail in results:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + ("" if ok else f"   -> {detail}"))
print(f"\n{npass}/{len(results)} passed")

if SUSPECTED_BUGS:
    print("\nSUSPECTED_BUGS:")
    for name, rationale in SUSPECTED_BUGS:
        print(f"  {name}: {rationale}")

app.destroy()
sys.exit(0 if npass == len(results) else 1)
