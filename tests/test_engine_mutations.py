# tests/test_engine_mutations.py — MUTATIONS & COMPLEX MULTI-OP SEQUENCES
# Category: known end states, TDD headless tests (no Tk display).
import os, sys, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import engine
from engine import mutations as mut
from engine.model import STYLE_KEYS, CUE_STYLE_KEYS
import controller as ctrl

CFG = {"json_path": "aligned_lyrics.json", "skip_dashes": True, "group_by": "section",
       "font": "DejaVu Sans", "fontsize": 64, "bold": True, "align": 2, "fade_ms": 250,
       "play_w": 1920, "play_h": 1080, "margin_l": 80, "margin_r": 80, "margin_v": 60,
       "primary_color": "#FFFFFF", "outline_color": "#000000", "back_color": "#000000",
       "back_alpha": "80", "border_style": 1, "outline_w": 3, "shadow": 0, "wrap_style": 2}

# ---------- helpers ----------------------------------------------------------

def fresh():
    """Return a fresh project for each test."""
    return engine.make_project(CFG)

def first_tok(p, gi=0, li=0, ti=0):
    return p["layout"][gi]["lines"][li]["toks"][ti]

def first_wid(p, gi=0, li=0, ti=0):
    return first_tok(p, gi, li, ti)["ids"][0]

# Suspected bugs / known deviations go here (skipped from active run):
SUSPECTED_BUGS = []

# ---------- test registry ----------------------------------------------------

results = []

def check(name, fn):
    try:
        ok, detail = fn()
        results.append((ok, name, detail))
    except Exception as e:
        import traceback
        results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))

# ============================================================
# 1. make_tag: one-tag-per-word invariant; overlap moves word
# ============================================================
def t_make_tag_overlap_moves_word():
    p = fresh()
    # Use line 1 which has 7 tokens — plenty to pick 4
    t0 = first_tok(p, 0, 1, 0); wid0 = t0["ids"][0]
    t1 = first_tok(p, 0, 1, 1); wid1 = t1["ids"][0]
    t2 = first_tok(p, 0, 1, 2); wid2 = t2["ids"][0]
    mut.make_tag(p, "fin_tags", {wid0, wid1, wid2})
    # first tag has all three
    assert len(p["fin_tags"]) == 1
    assert p["fin_tags"][0]["ids"] == {wid0, wid1, wid2}
    # make second tag stealing wid1 and a new wid3
    t3 = first_tok(p, 0, 1, 3); wid3 = t3["ids"][0]
    mut.make_tag(p, "fin_tags", {wid1, wid3})
    # Now exactly 2 tags; first = {wid0, wid2}, second = {wid1, wid3}
    assert len(p["fin_tags"]) == 2
    ids_first = p["fin_tags"][0]["ids"]
    ids_second = p["fin_tags"][1]["ids"]
    assert wid1 not in ids_first, f"wid1 still in first tag: {ids_first}"
    assert wid0 in ids_first and wid2 in ids_first, f"first tag wrong: {ids_first}"
    assert wid1 in ids_second and wid3 in ids_second, f"second tag wrong: {ids_second}"
    # union = all 4 words; no word in both tags
    assert ids_first & ids_second == set(), "words in two tags simultaneously"
    return True, f"first={ids_first} second={ids_second}"

# ============================================================
# 2. make_tag with empty set is a no-op
# ============================================================
def t_make_tag_empty_is_noop():
    p = fresh()
    before = copy.deepcopy(p["fin_tags"])
    mut.make_tag(p, "fin_tags", set())
    return (p["fin_tags"] == before), f"tags={p['fin_tags']}"

# ============================================================
# 3. clear_tag removes ids and deletes empty tags
# ============================================================
def t_clear_tag_empties_tag():
    p = fresh()
    wid0 = first_wid(p)
    wid1 = first_tok(p, 0, 0, 1)["ids"][0]
    mut.make_tag(p, "fin_tags", {wid0, wid1})
    assert len(p["fin_tags"]) == 1
    mut.clear_tag(p, "fin_tags", {wid0, wid1})
    # empty tag removed
    assert p["fin_tags"] == [], f"tags={p['fin_tags']}"
    return True, "tag cleared"

# ============================================================
# 4. set_tag_props stores trigger only (dur removed)
# ============================================================
def t_set_tag_props():
    p = fresh()
    wid0 = first_wid(p)
    mut.make_tag(p, "fin_tags", {wid0})
    mut.set_tag_props(p, "fin_tags", 0, 5.0)
    t = p["fin_tags"][0]
    assert t["trigger"] == 5.0 and "dur" not in t, f"tag={t}"
    return True, f"trigger={t['trigger']}"

# ============================================================
# 5. set_global stores value in globals dict
# ============================================================
def t_set_global():
    p = fresh()
    mut.set_global(p, "fade_in_ms", 999)
    assert p["globals"]["fade_in_ms"] == 999
    return True, "ok"

# ============================================================
# 6. set_layout_props reflected in project and project_to_render
# ============================================================
def t_set_layout_props_reflected_in_render():
    p = fresh()
    gi = 0
    # Pick a plausible window slightly before natural start
    mut.set_layout_props(p, gi, win_start=1.0, win_end=9.0, linger=2.5, accumulate="lines")
    g = p["layout"][gi]
    assert g["win_start"] == 1.0
    assert g["win_end"] == 9.0
    assert g["linger"] == 2.5
    assert g["accumulate"] == "lines"
    rgroups = engine.project_to_render(p)
    # first rendered group corresponds to gi=0 (sorted by start time; might not be index 0 after sort)
    # find the render group that covers win_start=1.0
    match = [r for r in rgroups if abs(r["start"] - 1.0) < 1e-9]
    assert match, f"no render group with start=1.0, starts={[r['start'] for r in rgroups]}"
    assert abs(match[0]["end"] - 9.0) < 1e-9, f"end={match[0]['end']}"
    return True, f"start={match[0]['start']} end={match[0]['end']} acc={g['accumulate']}"

# ============================================================
# 7. set_group_style filters STYLE_KEYS and clear with None
# ============================================================
def t_set_group_style_filters_and_clears():
    p = fresh()
    mut.set_group_style(p, 0, {"font": "Arial", "fontsize": 80, "NOT_A_KEY": "val"})
    st = p["layout"][0]["style"]
    assert st == {"font": "Arial", "fontsize": 80}, f"style={st}"
    # clear font
    mut.set_group_style(p, 0, {"font": None})
    st2 = p["layout"][0]["style"]
    assert st2 == {"fontsize": 80}, f"style after clear={st2}"
    return True, f"style={st2}"

# ============================================================
# 8. set_group_style idempotency
# ============================================================
def t_set_group_style_idempotent():
    p = fresh()
    partial = {"fontsize": 72, "bold": False}
    mut.set_group_style(p, 0, partial)
    after_first = copy.deepcopy(p["layout"][0]["style"])
    mut.set_group_style(p, 0, partial)
    after_second = p["layout"][0]["style"]
    assert after_first == after_second, f"first={after_first} second={after_second}"
    return True, f"idempotent style={after_second}"

# ============================================================
# 9. set_cue_style drops border_style (C1) but keeps other keys
# ============================================================
def t_set_cue_style_drops_border_style_keeps_others():
    p = fresh()
    wid = first_wid(p)
    mut.set_cue_style(p, {wid}, {"primary": "#AABBCC", "border_style": 5, "fontsize": 48})
    tok = first_tok(p)
    st = tok["style"]
    assert "border_style" not in st, f"border_style should be dropped, got {st}"
    assert st.get("primary") == "#AABBCC", f"primary missing: {st}"
    assert st.get("fontsize") == 48, f"fontsize missing: {st}"
    return True, f"style={st}"

# ============================================================
# 10. resolve_style: cue > group > global; clearing cue falls back to group
# ============================================================
def t_resolve_style_priority_chain():
    p = fresh()
    gi = 0
    wid = first_wid(p)
    # Set group-level fontsize
    mut.set_group_style(p, gi, {"fontsize": 80})
    # Set cue-level fontsize (should win)
    mut.set_cue_style(p, {wid}, {"fontsize": 32})
    tok = first_tok(p)
    group = p["layout"][gi]
    gctx = {"fontsize": 64}  # simulate global
    resolved = engine.resolve_style(tok, group, gctx)
    assert resolved["fontsize"] == 32, f"cue should win, got {resolved['fontsize']}"
    # Clear cue; group should now win
    mut.set_cue_style(p, {wid}, {"fontsize": None})
    tok2 = first_tok(p)
    resolved2 = engine.resolve_style(tok2, group, gctx)
    assert resolved2["fontsize"] == 80, f"group should win, got {resolved2['fontsize']}"
    # Clear group; global should win
    mut.set_group_style(p, gi, {"fontsize": None})
    resolved3 = engine.resolve_style(tok2, group, gctx)
    assert resolved3["fontsize"] == 64, f"global should win, got {resolved3['fontsize']}"
    return True, "cue>group>global chain verified"

# ============================================================
# 11. toggle_word_del True then False restores; all-del event skipped in render
# ============================================================
def t_toggle_word_del_roundtrip_and_render_skip():
    p = fresh()
    gi = 0
    # Collect all wids in event 0
    all_wids = [i for ln in p["layout"][gi]["lines"] for tok in ln["toks"] for i in tok["ids"]]
    mut.toggle_word_del(p, all_wids, True)
    # All tokens in gi should be deleted
    for ln in p["layout"][gi]["lines"]:
        for tok in ln["toks"]:
            assert tok.get("del") == True, "expected del=True"
    # render should skip this event
    rgroups = engine.project_to_render(p)
    starts = [r["start"] for r in rgroups]
    # The original start of gi=0 should NOT appear (event with all deleted words dropped)
    base_s_orig = min(p["words"][i]["start"] for i in all_wids)
    assert not any(abs(s - base_s_orig) < 1e-9 for s in starts), \
        f"deleted event still rendered at start={base_s_orig}"
    # restore
    mut.toggle_word_del(p, all_wids, False)
    for ln in p["layout"][gi]["lines"]:
        for tok in ln["toks"]:
            assert tok.get("del") == False, "expected del=False after restore"
    return True, "del roundtrip ok; render skips all-del events"

# ============================================================
# 12. add_break then merge_prev_word roundtrip
# ============================================================
def t_add_break_merge_roundtrip():
    p = fresh()
    gi = 0
    li = 0
    line = p["layout"][gi]["lines"][li]
    orig_tok_count = len(line["toks"])
    orig_ids = [tok["ids"][:] for tok in line["toks"]]  # snapshot

    if orig_tok_count < 3:
        return True, f"SKIP: not enough tokens ({orig_tok_count})"

    # add_break after token index 1 -> line splits into [0:2] and [2:]
    mut.add_break(p, gi, li, ti=1, after=True)
    new_line_count = len(p["layout"][gi]["lines"])
    assert new_line_count == 2, f"expected 2 lines after break, got {new_line_count}"
    line0_toks = len(p["layout"][gi]["lines"][0]["toks"])
    line1_toks = len(p["layout"][gi]["lines"][1]["toks"])
    assert line0_toks == 2, f"first line should have 2 toks, got {line0_toks}"
    assert line1_toks == orig_tok_count - 2, f"second line toks={line1_toks}"

    # merge_prev_word: merge ti=1 with ti=0 in line 0 (after break, li=0, ti=1)
    merged_left_ids = p["layout"][gi]["lines"][0]["toks"][0]["ids"][:]
    merged_right_ids = p["layout"][gi]["lines"][0]["toks"][1]["ids"][:]
    mut.merge_prev_word(p, gi, 0, ti=1, sep="")
    # line 0 now has 1 token with union of ids
    toks_after = p["layout"][gi]["lines"][0]["toks"]
    assert len(toks_after) == 1, f"expected 1 token after merge, got {len(toks_after)}"
    merged_ids = toks_after[0]["ids"]
    assert merged_ids == merged_left_ids + merged_right_ids, \
        f"merged ids={merged_ids}, expected {merged_left_ids + merged_right_ids}"
    return True, f"break+merge roundtrip ok; merged_ids={merged_ids}"

# ============================================================
# 13. merge_prev_word preserves left token's style
# ============================================================
def t_merge_prev_word_preserves_left_style():
    p = fresh()
    gi = 0; li = 0
    toks = p["layout"][gi]["lines"][li]["toks"]
    if len(toks) < 2:
        return True, "SKIP: not enough tokens"
    # set distinct styles
    toks[0]["style"] = {"fontsize": 55}
    toks[1]["style"] = {"fontsize": 99}
    mut.merge_prev_word(p, gi, li, ti=1, sep="-")
    merged_tok = p["layout"][gi]["lines"][li]["toks"][0]
    assert merged_tok["style"] == {"fontsize": 55}, f"expected left style, got {merged_tok['style']}"
    assert merged_tok["sep"] == "-", f"sep={merged_tok['sep']}"
    return True, f"style={merged_tok['style']}"

# ============================================================
# 14. layout_merge: non-adjacent returns False; adjacent merges lines
# ============================================================
def t_layout_merge_adjacent_and_nonadjacent():
    p = fresh()
    n = len(p["layout"])
    if n < 3:
        return True, f"SKIP: need >=3 groups, got {n}"
    lines_g0 = len(p["layout"][0]["lines"])
    lines_g1 = len(p["layout"][1]["lines"])

    # non-adjacent: 0 and 2 (skipping 1) -> False
    rv = mut.layout_merge(p, [0, 2])
    assert rv is False, f"expected False for non-adjacent, got {rv}"
    assert len(p["layout"]) == n, "project should be unchanged after rejected merge"

    # adjacent: 0 and 1
    rv2 = mut.layout_merge(p, [0, 1])
    assert rv2 is True, f"expected True for adjacent merge, got {rv2}"
    assert len(p["layout"]) == n - 1, f"layout count should drop by 1, got {len(p['layout'])}"
    assert len(p["layout"][0]["lines"]) == lines_g0 + lines_g1, \
        f"merged lines={len(p['layout'][0]['lines'])}, expected {lines_g0 + lines_g1}"
    return True, f"merged lines={lines_g0}+{lines_g1}={lines_g0+lines_g1}"

# ============================================================
# 15. layout_merge then layout_ungroup: line count preserved
# ============================================================
def t_layout_merge_then_ungroup_preserves_lines():
    p = fresh()
    if len(p["layout"]) < 2:
        return True, "SKIP: need >=2 groups"
    lines_g0 = len(p["layout"][0]["lines"])
    lines_g1 = len(p["layout"][1]["lines"])
    total_lines = lines_g0 + lines_g1
    rv = mut.layout_merge(p, [0, 1])
    assert rv is True
    # ungroup the merged event
    mut.layout_ungroup(p, 0)
    # layout should now have one event per line that was in the merged group
    # (plus remaining groups that were after index 1)
    # just verify the first `total_lines` events each have exactly 1 line
    for i in range(total_lines):
        assert len(p["layout"][i]["lines"]) == 1, \
            f"event {i} has {len(p['layout'][i]['lines'])} lines, expected 1"
    return True, f"ungroup produced {total_lines} single-line events"

# ============================================================
# 16. layout_ungroup copies parent style to each new event
# ============================================================
def t_layout_ungroup_copies_parent_style():
    p = fresh()
    gi = 0
    if len(p["layout"][gi]["lines"]) < 2:
        return True, "SKIP: need >=2 lines in group 0"
    parent_style = {"fontsize": 72, "bold": False}
    p["layout"][gi]["style"] = copy.deepcopy(parent_style)
    n_lines = len(p["layout"][gi]["lines"])
    mut.layout_ungroup(p, gi)
    for i in range(n_lines):
        st = p["layout"][gi + i]["style"]
        assert st == parent_style, f"event {i} style={st}, expected {parent_style}"
    return True, f"all {n_lines} ungrouped events have style={parent_style}"

# ============================================================
# 17. layout_split_event then layout_merge restores single event
# ============================================================
def t_layout_split_then_merge_roundtrip():
    p = fresh()
    gi = 0
    if len(p["layout"][gi]["lines"]) < 2:
        return True, "SKIP: need >=2 lines in group 0"
    total_lines = len(p["layout"][gi]["lines"])
    n_layout_before = len(p["layout"])
    # split at line index 1
    mut.layout_split_event(p, gi, 1)
    assert len(p["layout"]) == n_layout_before + 1, \
        f"expected {n_layout_before+1} events after split, got {len(p['layout'])}"
    lines_a = len(p["layout"][0]["lines"])
    lines_b = len(p["layout"][1]["lines"])
    assert lines_a == 1, f"first half should have 1 line, got {lines_a}"
    assert lines_b == total_lines - 1, f"second half lines={lines_b}"
    # merge back
    rv = mut.layout_merge(p, [0, 1])
    assert rv is True
    assert len(p["layout"]) == n_layout_before, f"after merge expected {n_layout_before}"
    assert len(p["layout"][0]["lines"]) == total_lines, \
        f"restored lines={len(p['layout'][0]['lines'])}, expected {total_lines}"
    return True, f"split+merge roundtrip; total_lines={total_lines}"

# ============================================================
# 18. Complex sequence: set_group_style then set_cue_style; cue wins on resolve
# ============================================================
def t_complex_group_then_cue_style():
    p = fresh()
    gi = 0; wid = first_wid(p)
    # Step 1: set group fontsize=80 and primary=#FF0000
    mut.set_group_style(p, gi, {"fontsize": 80, "primary": "#FF0000"})
    # Step 2: set cue fontsize=40 (overrides group for this token)
    mut.set_cue_style(p, {wid}, {"fontsize": 40})
    tok = first_tok(p)
    group = p["layout"][gi]
    resolved = engine.resolve_style(tok, group, {"fontsize": 64, "primary": "#FFFFFF"})
    # cue wins for fontsize; group wins for primary (no cue override)
    assert resolved["fontsize"] == 40, f"fontsize={resolved['fontsize']}"
    assert resolved["primary"] == "#FF0000", f"primary={resolved['primary']}"
    # Step 3: clear cue fontsize; group fontsize wins
    mut.set_cue_style(p, {wid}, {"fontsize": None})
    resolved2 = engine.resolve_style(first_tok(p), group, {"fontsize": 64})
    assert resolved2["fontsize"] == 80, f"after clear cue, fontsize={resolved2['fontsize']}"
    # Step 4: clear group fontsize; global wins
    mut.set_group_style(p, gi, {"fontsize": None})
    resolved3 = engine.resolve_style(first_tok(p), p["layout"][gi], {"fontsize": 64})
    assert resolved3["fontsize"] == 64, f"after clear group, fontsize={resolved3['fontsize']}"
    return True, "full cue>group>global sequence verified"

# ============================================================
# 19. Controller Session: do returns rv; no-op leaves stacks untouched
# ============================================================
def t_session_noop_no_snapshot():
    p = fresh()
    session = ctrl.Session(p, on_change=None)
    # empty make_tag is a no-op (no change to project)
    rv = session.do("make_tag", "fin_tags", set())
    assert rv is None, f"make_tag empty returned {rv}"
    assert len(session._undo) == 0, f"undo stack should be empty: {len(session._undo)}"
    assert len(session._redo) == 0, f"redo stack empty: {len(session._redo)}"
    return True, "no-op leaves undo/redo untouched"

# ============================================================
# 20. Controller Session: real edit undo/redo cycle
# ============================================================
def t_session_undo_redo_cycle():
    p = fresh()
    snap_before = copy.deepcopy(p)
    session = ctrl.Session(p, on_change=None)
    wid = first_wid(p)
    # real edit
    session.do("set_global", "fade_in_ms", 42)
    assert session.project["globals"]["fade_in_ms"] == 42
    assert len(session._undo) == 1
    # undo
    session.undo()
    assert session.project["globals"]["fade_in_ms"] == snap_before["globals"]["fade_in_ms"], \
        f"after undo={session.project['globals']['fade_in_ms']}"
    assert session.project == snap_before, "undo should restore exact prior state"
    assert len(session._redo) == 1
    # redo
    session.redo()
    assert session.project["globals"]["fade_in_ms"] == 42, "redo should re-apply"
    return True, "undo/redo cycle correct"

# ============================================================
# 21. Controller Session: new edit after undo clears redo
# ============================================================
def t_session_new_edit_clears_redo():
    p = fresh()
    session = ctrl.Session(p, on_change=None)
    session.do("set_global", "linger", 1.0)
    session.do("set_global", "linger", 2.0)
    session.undo()
    assert len(session._redo) == 1
    # new different edit clears redo
    session.do("set_global", "linger", 9.9)
    assert len(session._redo) == 0, f"redo should be cleared, got {len(session._redo)}"
    assert session.project["globals"]["linger"] == 9.9
    return True, "new edit after undo clears redo"

# ============================================================
# 22. Controller Session: rejected layout_merge leaves stacks untouched
# ============================================================
def t_session_rejected_layout_merge_no_snapshot():
    p = fresh()
    n = len(p["layout"])
    if n < 3:
        return True, "SKIP: need >=3 groups"
    session = ctrl.Session(p, on_change=None)
    snap_before = copy.deepcopy(session.project)
    # non-adjacent: False
    rv = session.do("layout_merge", [0, 2])
    assert rv is False, f"expected False, got {rv}"
    assert len(session._undo) == 0, "undo stack must stay empty for rejected op"
    assert session.project == snap_before, "project must be unchanged"
    return True, "rejected merge leaves stacks and project untouched"

# ============================================================
# 23. Complex 6-op sequence: make_tag -> tag props -> clear_tag -> verify
# ============================================================
def t_complex_tag_lifecycle():
    p = fresh()
    # line 1 of group 0 has 7 tokens; use indices 0,1,2,3
    w0 = first_tok(p, 0, 1, 0)["ids"][0]
    w1 = first_tok(p, 0, 1, 1)["ids"][0]
    w2 = first_tok(p, 0, 1, 2)["ids"][0]
    # Op1: make tag with w0, w1
    mut.make_tag(p, "fin_tags", {w0, w1})
    assert len(p["fin_tags"]) == 1
    # Op2: set trigger only (dur removed)
    mut.set_tag_props(p, "fin_tags", 0, 10.0)
    assert p["fin_tags"][0]["trigger"] == 10.0
    # Op3: make second tag stealing w1 and adding w2
    mut.make_tag(p, "fin_tags", {w1, w2})
    assert len(p["fin_tags"]) == 2
    # w1 moved to second tag
    assert w1 in p["fin_tags"][1]["ids"]
    assert w1 not in p["fin_tags"][0]["ids"]
    # first tag still has w0
    assert w0 in p["fin_tags"][0]["ids"]
    # Op4: set props on second tag
    mut.set_tag_props(p, "fin_tags", 1, 20.0)
    assert p["fin_tags"][1]["trigger"] == 20.0
    # Op5: clear first tag
    mut.clear_tag(p, "fin_tags", {w0})
    assert len(p["fin_tags"]) == 1, f"first tag should be gone (was single-element), tags={p['fin_tags']}"
    # Only second tag remains with w1, w2
    assert p["fin_tags"][0]["ids"] == {w1, w2}
    # Op6: clear all
    mut.clear_tag(p, "fin_tags", {w1, w2})
    assert p["fin_tags"] == []
    return True, "6-op tag lifecycle correct"

# ============================================================
# 24. layout_split_event at boundary is no-op (li=0 or li=len)
# ============================================================
def t_layout_split_boundary_noop():
    p = fresh()
    gi = 0
    n_before = len(p["layout"])
    # split at 0 -> should not change (0 < 0 is False)
    mut.layout_split_event(p, gi, 0)
    assert len(p["layout"]) == n_before, f"split at 0 should be no-op"
    return True, "split at boundary 0 is no-op"

# ============================================================
# 25. set_cue_style with only border_style: no style stored
# ============================================================
def t_set_cue_style_only_border_style_stores_nothing():
    p = fresh()
    wid = first_wid(p)
    mut.set_cue_style(p, {wid}, {"border_style": 3})
    tok = first_tok(p)
    assert tok["style"] == {}, f"expected empty style, got {tok['style']}"
    return True, f"style={tok['style']}"

# ============================================================
# 26. Complex sequence: add_break, set_group_style, layout_merge, verify style
# ============================================================
def t_complex_break_style_merge():
    p = fresh()
    gi = 0
    n_groups = len(p["layout"])
    if n_groups < 2:
        return True, "SKIP: need >=2 groups"
    lines_g0 = len(p["layout"][0]["lines"])
    lines_g1 = len(p["layout"][1]["lines"])

    # Op1: set distinct styles on g0 and g1
    mut.set_group_style(p, 0, {"fontsize": 70})
    mut.set_group_style(p, 1, {"fontsize": 80})
    # Op2: add break in g0 line 0 after token 0 (if >=2 tokens)
    toks_in_g0_l0 = len(p["layout"][0]["lines"][0]["toks"])
    if toks_in_g0_l0 >= 2:
        mut.add_break(p, 0, 0, 0, after=True)
        lines_g0 += 1  # break added a line to g0
    # Op3: merge g0 and g1
    rv = mut.layout_merge(p, [0, 1])
    assert rv is True
    # merged group takes first group's style (first in idx list)
    merged_style = p["layout"][0]["style"]
    assert merged_style.get("fontsize") == 70, f"merged style should be from g0, got {merged_style}"
    # total lines = updated lines_g0 + lines_g1
    expected_lines = lines_g0 + lines_g1
    actual_lines = len(p["layout"][0]["lines"])
    assert actual_lines == expected_lines, f"expected {expected_lines} lines, got {actual_lines}"
    return True, f"merged_style={merged_style} lines={actual_lines}"

# ============================================================
# 27. project_to_render excludes events where all tokens are deleted
# ============================================================
def t_render_excludes_all_del_event():
    p = fresh()
    gi = 0
    all_wids = [i for ln in p["layout"][gi]["lines"] for tok in ln["toks"] for i in tok["ids"]]
    rgroups_before = engine.project_to_render(p)
    count_before = len(rgroups_before)
    mut.toggle_word_del(p, all_wids, True)
    rgroups_after = engine.project_to_render(p)
    count_after = len(rgroups_after)
    assert count_after == count_before - 1, \
        f"before={count_before} after={count_after}, expected one fewer"
    return True, f"render count {count_before}->{count_after}"

# ============================================================
# 28. Controller: multiple edits; undo each in order; deep equality
# ============================================================
def t_session_multiple_undo_chain():
    p = fresh()
    snap0 = copy.deepcopy(p)
    session = ctrl.Session(p, on_change=None)
    session.do("set_global", "linger", 1.1)
    # snap after edit 1 (linger=1.1)
    snap_after_1 = copy.deepcopy(session.project)
    session.do("set_global", "linger", 2.2)
    # snap after edit 2 (linger=2.2)
    snap_after_2 = copy.deepcopy(session.project)
    session.do("set_global", "linger", 3.3)
    assert session.project["globals"]["linger"] == 3.3
    # undo edit 3 -> back to linger=2.2 (state == snap_after_2)
    session.undo()
    assert session.project["globals"]["linger"] == 2.2
    assert session.project == snap_after_2, \
        f"expected snap_after_2; linger={session.project['globals']['linger']}"
    # undo edit 2 -> back to linger=1.1 (state == snap_after_1)
    session.undo()
    assert session.project["globals"]["linger"] == 1.1
    assert session.project == snap_after_1
    # undo edit 1 -> back to original (snap0)
    session.undo()
    assert session.project == snap0, "should be back to original"
    return True, "multi-undo chain restores each prior state exactly"

# ============================================================
# 29. set_group_fade: set and clear
# ============================================================
def t_set_group_fade_set_and_clear():
    p = fresh()
    mut.set_group_fade(p, 0, {"fade_in_ms": 400, "fade_out_ms": 600})
    a = dict(p["layout"][0]["fade"])
    mut.set_group_fade(p, 0, {"fade_in_ms": None})
    b = dict(p["layout"][0]["fade"])
    return (a == {"fade_in_ms": 400, "fade_out_ms": 600} and b == {"fade_out_ms": 600}, (a, b))

# ============================================================
# 30. layout_ungroup preserves parent fade dict
# ============================================================
def t_layout_ungroup_preserves_fade_dict():
    p = fresh()
    mut.set_group_fade(p, 0, {"fade_in_ms": 333})
    nlines = len(p["layout"][0]["lines"])
    mut.layout_ungroup(p, 0)
    new = p["layout"][:nlines]
    ok = all("fade" in g for g in new) and new[0]["fade"] == {"fade_in_ms": 333}
    return (ok, [g.get("fade") for g in new])

# ============================================================
# 31. make_tag produces tag with only {ids, trigger}
# ============================================================
def t_make_tag_has_no_color_or_dur():
    p = fresh()
    wid = first_wid(p)
    mut.make_tag(p, "fin_tags", {wid})
    t = p["fin_tags"][0]
    return (set(t.keys()) == {"ids", "trigger"} and t["trigger"] is None, sorted(t.keys()))

# ============================================================
# 32. set_tag_props sets trigger only — no dur key
# ============================================================
def t_set_tag_props_sets_trigger_only():
    p = fresh(); wid = first_wid(p)
    mut.make_tag(p, "fin_tags", {wid})
    mut.set_tag_props(p, "fin_tags", 0, 2.5)
    t = p["fin_tags"][0]
    return (t["trigger"] == 2.5 and "dur" not in t, t)

# ============================================================
# Run all active tests
# ============================================================
ACTIVE = [
    t_make_tag_overlap_moves_word,
    t_make_tag_empty_is_noop,
    t_clear_tag_empties_tag,
    t_set_tag_props,
    t_set_global,
    t_set_layout_props_reflected_in_render,
    t_set_group_style_filters_and_clears,
    t_set_group_style_idempotent,
    t_set_cue_style_drops_border_style_keeps_others,
    t_resolve_style_priority_chain,
    t_toggle_word_del_roundtrip_and_render_skip,
    t_add_break_merge_roundtrip,
    t_merge_prev_word_preserves_left_style,
    t_layout_merge_adjacent_and_nonadjacent,
    t_layout_merge_then_ungroup_preserves_lines,
    t_layout_ungroup_copies_parent_style,
    t_layout_split_then_merge_roundtrip,
    t_complex_group_then_cue_style,
    t_session_noop_no_snapshot,
    t_session_undo_redo_cycle,
    t_session_new_edit_clears_redo,
    t_session_rejected_layout_merge_no_snapshot,
    t_complex_tag_lifecycle,
    t_layout_split_boundary_noop,
    t_set_cue_style_only_border_style_stores_nothing,
    t_complex_break_style_merge,
    t_render_excludes_all_del_event,
    t_session_multiple_undo_chain,
    t_set_group_fade_set_and_clear,
    t_layout_ungroup_preserves_fade_dict,
    t_make_tag_has_no_color_or_dur,
    t_set_tag_props_sets_trigger_only,
]

for fn in ACTIVE:
    check(fn.__name__, fn)

npass = sum(1 for ok, *_ in results if ok)
for ok, name, detail in results:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + ("" if ok else f"   -> {detail}"))

if SUSPECTED_BUGS:
    print("\nSUSPECTED_BUGS:")
    for entry in SUSPECTED_BUGS:
        print(f"  {entry}")

print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
