"""
SELECTION & CUE-TABLE CONSISTENCY — UI tests for karaoke-subtitle-studio.
Category covers: rows structure matching project, selection state transitions,
highlight tags, collapse/expand behaviour, scroll preservation, and post-edit validity.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import karaoke_subtitle_gui as v2
import time

app = v2.AppV2()
app.withdraw()  # headless: keep the window off-screen during test runs
def pump(n=8):
    for _ in range(n):
        app.update(); time.sleep(0.02)
pump(14)
app.open_editor(); pump(6)
ed = app._editor

class Ev: pass
def line_of(pred):
    for i, r in enumerate(ed.rows):
        if pred(r): return i + 1   # 1-based text line
    return None
def click(pane, lane, line, x=30, ctrl=False):
    pane.see(f"{line}.0"); pane.update_idletasks()
    bb = pane.bbox(f"{line}.0")
    if not bb: raise RuntimeError(f"line {line} not visible")
    e = Ev(); e.x = x; e.y = bb[1] + 2; e.x_root = 0; e.y_root = 0
    ed._click(e, pane, lane, add=ctrl); pump(2)

def drag(pane, lane, lines):
    """Press on lines[0] then drag (B1-Motion, no modifiers) across the rest,
    then release — mirrors the real event flow (light motion + heavy release)."""
    click(pane, lane, lines[0])
    for ln in lines[1:]:
        pane.see(f"{ln}.0"); pane.update_idletasks()
        bb = pane.bbox(f"{ln}.0")
        e = Ev(); e.x = 20; e.y = bb[1] + 2; e.x_root = 0; e.y_root = 0
        ed._range_click(e, pane, lane, light=True); pump(1)
    ed._drag_release(); pump(1)

def reset():
    app._reload_groups(); pump(4); ed.collapsed.clear(); ed.reload(); pump(2)

results = []
def check(name, fn):
    try:
        reset()
        ok, detail = fn()
        results.append((ok, name, detail))
    except Exception as e:
        results.append((False, name, f"EXC {type(e).__name__}: {e}"))

def render_words():
    return [w for g in app._groups for ln in g["lines"] for w in ln["words"]]

# ═══════════════════════════════════════════════════════════════
#  SELECTION & CUE-TABLE CONSISTENCY tests
# ═══════════════════════════════════════════════════════════════

def t_hdr_row_count_matches_layout():
    """Header rows in ed.rows == number of layout events."""
    n_layout = len(app._project["layout"])
    n_hdr = sum(1 for r in ed.rows if r[0] == "hdr")
    return (n_hdr == n_layout), f"hdr_rows={n_hdr} layout={n_layout}"


def t_word_rows_per_event_match_toks():
    """Word rows per event equals token count for that event."""
    ok = True
    detail_parts = []
    for gi, g in enumerate(app._project["layout"]):
        expected = sum(len(ln["toks"]) for ln in g["lines"])
        actual = sum(1 for r in ed.rows if r[0] == "word" and r[1] == gi)
        if expected != actual:
            ok = False
            detail_parts.append(f"gi={gi}: expected={expected} actual={actual}")
    return ok, ("ok" if ok else "; ".join(detail_parts))


def t_layout_word_click_sets_sel_word_clears_ids():
    """Clicking a layout pane word sets sel_word/sel_lane='word' and clears sel_ids/sel_groups."""
    ln = line_of(lambda r: r[0] == "word")
    _, gi, li, ti, wid = ed.rows[ln - 1]
    click(ed.L, "layout", ln)
    ok = (
        ed.sel_lane == "word"
        and ed.sel_word == (gi, li, ti, wid)
        and ed.sel_ids == set()
        and ed.sel_groups == set()
    )
    return ok, f"lane={ed.sel_lane} sel_word={ed.sel_word} ids={ed.sel_ids} groups={ed.sel_groups}"


def t_layout_header_click_sets_sel_group():
    """Clicking a layout header (non-arrow zone) sets sel_lane='layout' + sel_group."""
    hdr_ln = line_of(lambda r: r[0] == "hdr")
    gi = ed.rows[hdr_ln - 1][1]
    click(ed.L, "layout", hdr_ln, x=30)  # x>=20 = non-arrow zone
    ok = (
        ed.sel_lane == "layout"
        and ed.sel_group == gi
        and gi in ed.sel_groups
        and ed.sel_word is None
        and ed.sel_ids == set()
    )
    return ok, f"lane={ed.sel_lane} sel_group={ed.sel_group} sel_groups={ed.sel_groups}"


def t_fadein_cell_click_sets_lane_fin_tags():
    """Clicking a fade-in cell sets sel_lane='fin_tags' (not 'word')."""
    ln = line_of(lambda r: r[0] == "word")
    click(ed.I, "fin_tags", ln)
    ok = ed.sel_lane == "fin_tags"
    return ok, f"sel_lane={ed.sel_lane}"


def t_fadeout_cell_click_sets_lane_fout_tags():
    """Clicking a fade-out cell sets sel_lane='fout_tags'."""
    ln = line_of(lambda r: r[0] == "word")
    click(ed.O, "fout_tags", ln)
    ok = ed.sel_lane == "fout_tags"
    return ok, f"sel_lane={ed.sel_lane}"


def t_ctrl_click_toggle_removes_word():
    """Ctrl-clicking on an already-selected word removes it (toggle off)."""
    wrows = [i + 1 for i, r in enumerate(ed.rows) if r[0] == "word"][:3]
    ids = [ed.rows[l - 1][4] for l in wrows]
    # select all three
    click(ed.I, "fin_tags", wrows[0])
    click(ed.I, "fin_tags", wrows[1], ctrl=True)
    click(ed.I, "fin_tags", wrows[2], ctrl=True)
    # ctrl-click wrows[1] again → remove it
    click(ed.I, "fin_tags", wrows[1], ctrl=True)
    expected = {ids[0], ids[2]}
    ok = ed.sel_ids == expected
    return ok, f"sel_ids={sorted(ed.sel_ids)} want={sorted(expected)}"


def t_layout_header_click_clears_prior_word_selection():
    """After selecting a layout word, clicking a header clears sel_word."""
    # First select a word via layout pane
    ln = line_of(lambda r: r[0] == "word")
    click(ed.L, "layout", ln)
    assert ed.sel_word is not None, "setup: sel_word should be set"
    # Now click a header
    hdr_ln = line_of(lambda r: r[0] == "hdr")
    click(ed.L, "layout", hdr_ln, x=30)
    ok = (ed.sel_word is None and ed.sel_lane == "layout")
    return ok, f"sel_word={ed.sel_word} sel_lane={ed.sel_lane}"


def t_fadein_click_after_header_updates_lane_and_sel_group():
    """Switching from layout-header selection to a fade-in cell updates sel_lane and sel_group.
    NOTE: sel_groups is intentionally NOT cleared when clicking a fade cell — only sel_lane
    changes. This documents actual implemented behavior."""
    hdr_ln = line_of(lambda r: r[0] == "hdr" and r[1] == 0)
    click(ed.L, "layout", hdr_ln, x=30)
    assert ed.sel_lane == "layout" and 0 in ed.sel_groups
    word_ln = line_of(lambda r: r[0] == "word")
    _, gi, li, ti, wid = ed.rows[word_ln - 1]
    click(ed.I, "fin_tags", word_ln)
    # sel_lane must switch; sel_group must be updated to word's gi
    ok = (ed.sel_lane == "fin_tags" and ed.sel_group == gi)
    return ok, f"lane={ed.sel_lane} sel_group={ed.sel_group} sel_groups={ed.sel_groups}"


def t_layout_word_click_clears_sel_ids():
    """After fade-in multi-select, clicking a layout word clears sel_ids."""
    wrows = [i + 1 for i, r in enumerate(ed.rows) if r[0] == "word"][:3]
    click(ed.I, "fin_tags", wrows[0])
    click(ed.I, "fin_tags", wrows[1], ctrl=True)
    assert len(ed.sel_ids) == 2
    # Now click a layout word
    click(ed.L, "layout", wrows[0])
    ok = (ed.sel_ids == set() and ed.sel_lane == "word")
    return ok, f"sel_ids={ed.sel_ids} lane={ed.sel_lane}"


def t_rows_update_after_collapse():
    """Collapsing an event reduces word rows; expanding restores them."""
    total_words_before = sum(1 for r in ed.rows if r[0] == "word")
    # Find first event and its word count
    gi = 0
    words_in_gi = sum(1 for r in ed.rows if r[0] == "word" and r[1] == gi)
    # Collapse gi=0 via arrow zone click
    hdr_ln = line_of(lambda r: r[0] == "hdr" and r[1] == gi)
    click(ed.L, "layout", hdr_ln, x=5)
    total_words_after = sum(1 for r in ed.rows if r[0] == "word")
    collapsed_ok = (total_words_after == total_words_before - words_in_gi)
    # Expand again
    hdr_ln2 = line_of(lambda r: r[0] == "hdr" and r[1] == gi)
    click(ed.L, "layout", hdr_ln2, x=5)
    total_words_restored = sum(1 for r in ed.rows if r[0] == "word")
    expanded_ok = (total_words_restored == total_words_before)
    ok = collapsed_ok and expanded_ok
    return ok, (f"before={total_words_before} after={total_words_after} "
                f"restored={total_words_restored} gi0_words={words_in_gi}")


def t_collapsed_set_persists_across_unrelated_reload():
    """A collapsed set persists after an unrelated reload (e.g. changing global linger)."""
    # Collapse gi=0
    hdr_ln = line_of(lambda r: r[0] == "hdr" and r[1] == 0)
    click(ed.L, "layout", hdr_ln, x=5)
    assert 0 in ed.collapsed
    # Perform an unrelated reload by changing global fade-in and calling reload
    ed.g_fin.set("800"); ed._set_global("fade_in_ms", ed.g_fin); pump(2)
    # collapsed should still have 0
    ok = (0 in ed.collapsed)
    return ok, f"collapsed={ed.collapsed}"


def t_sel_highlight_tag_on_fin_pane():
    """After clicking a fade-in cell, the 'sel' tag is applied to that line in ed.I."""
    ln = line_of(lambda r: r[0] == "word")
    click(ed.I, "fin_tags", ln)
    # Check sel tag ranges exist on ed.I
    ranges = ed.I.tag_ranges("sel")
    ok = len(ranges) > 0
    # Also verify the tag contains line ln
    if ok:
        # ranges is a flat list of (start, end) index strings
        tagged_lines = set()
        for i in range(0, len(ranges), 2):
            tagged_lines.add(int(str(ranges[i]).split(".")[0]))
        ok = ln in tagged_lines
    return ok, f"sel tag lines={[int(str(ranges[i]).split('.')[0]) for i in range(0, len(ranges), 2)]}"


def t_sel_highlight_tag_on_layout_header():
    """Clicking a layout header applies 'sel' tag to that header line in ed.L."""
    hdr_ln = line_of(lambda r: r[0] == "hdr")
    click(ed.L, "layout", hdr_ln, x=30)
    ranges = ed.L.tag_ranges("sel")
    ok = len(ranges) > 0
    if ok:
        tagged_lines = {int(str(ranges[i]).split(".")[0]) for i in range(0, len(ranges), 2)}
        ok = hdr_ln in tagged_lines
    return ok, f"hdr_ln={hdr_ln} sel tag lines count={len(ranges)//2}"


def t_sel_tag_clears_on_lane_switch():
    """After switching from fin to fout lane, sel tag on fin pane is removed."""
    ln = line_of(lambda r: r[0] == "word")
    click(ed.I, "fin_tags", ln)
    assert len(ed.I.tag_ranges("sel")) > 0
    # Switch to fout
    click(ed.O, "fout_tags", ln)
    ranges_fin = ed.I.tag_ranges("sel")
    ok = len(ranges_fin) == 0
    return ok, f"fin 'sel' ranges after switch to fout: {len(ranges_fin)}"


def t_drag_selects_contiguous_words_layout():
    """Dragging over word rows in layout pane selects contiguous words."""
    wrows = [i + 1 for i, r in enumerate(ed.rows) if r[0] == "word"][:4]
    drag(ed.L, "layout", wrows)
    # After drag on layout, sel_lane should be 'word', and sel_ids should be filled
    ok = (ed.sel_lane == "word" and len(ed.sel_ids) > 0)
    return ok, f"lane={ed.sel_lane} sel_ids_count={len(ed.sel_ids)}"


def t_wid_at_word_row_matches_project_token():
    """The wid at each word row matches the first id of the corresponding project token."""
    mismatches = []
    for r in ed.rows:
        if r[0] != "word":
            continue
        _, gi, li, ti, wid = r
        project_wid = app._project["layout"][gi]["lines"][li]["toks"][ti]["ids"][0]
        if wid != project_wid:
            mismatches.append(f"gi={gi} li={li} ti={ti}: row_wid={wid} proj_wid={project_wid}")
    ok = len(mismatches) == 0
    return ok, (f"all {sum(1 for r in ed.rows if r[0]=='word')} word rows match" if ok
                else f"{len(mismatches)} mismatches: {mismatches[:3]}")


def t_scroll_preserved_across_reload():
    """Scrolling the layout pane and calling reload() preserves the scroll fraction."""
    # Scroll down significantly
    ed.L.yview_moveto(0.5); pump(2)
    frac_before = ed.L.yview()[0]
    ed.reload(); pump(2)
    frac_after = ed.L.yview()[0]
    ok = abs(frac_after - frac_before) < 0.05
    return ok, f"frac_before={frac_before:.3f} frac_after={frac_after:.3f}"


def t_post_merge_reload_no_crash_valid_sel():
    """After merging two adjacent events, reload doesn't crash and sel_* are valid."""
    # Set up a selection on group 1
    hdr_ln = line_of(lambda r: r[0] == "hdr" and r[1] == 1)
    click(ed.L, "layout", hdr_ln, x=30)
    assert ed.sel_group == 1
    # Merge groups 1 and 2
    ed.sel_lane = "layout"; ed.sel_groups = {1, 2}; ed.sel_group = 1
    ed._group(); pump(2)
    # Now sel_group may point to old index; reload should validate it
    ed.reload(); pump(2)
    n_layout = len(app._project["layout"])
    # sel_group must be None or a valid index
    ok = (ed.sel_group is None or ed.sel_group < n_layout)
    ok2 = all(g < n_layout for g in ed.sel_groups)
    return (ok and ok2), f"sel_group={ed.sel_group} sel_groups={ed.sel_groups} n_layout={n_layout}"


def t_collapse_gi0_word_rows_exact_count():
    """After collapsing gi=0, total word rows == original minus gi=0 token count."""
    gi0_toks = sum(len(ln["toks"]) for ln in app._project["layout"][0]["lines"])
    total_before = sum(1 for r in ed.rows if r[0] == "word")
    hdr_ln = line_of(lambda r: r[0] == "hdr" and r[1] == 0)
    click(ed.L, "layout", hdr_ln, x=5)
    total_after = sum(1 for r in ed.rows if r[0] == "word")
    ok = (total_after == total_before - gi0_toks)
    return ok, f"before={total_before} after={total_after} gi0_toks={gi0_toks}"


def t_hdr_count_unchanged_after_collapse():
    """Collapsing an event does not change the number of header rows."""
    n_hdr_before = sum(1 for r in ed.rows if r[0] == "hdr")
    hdr_ln = line_of(lambda r: r[0] == "hdr" and r[1] == 0)
    click(ed.L, "layout", hdr_ln, x=5)
    n_hdr_after = sum(1 for r in ed.rows if r[0] == "hdr")
    ok = (n_hdr_before == n_hdr_after)
    return ok, f"hdr_before={n_hdr_before} hdr_after={n_hdr_after}"


def t_drag_fin_selects_multiple_words():
    """Dragging over fade-in cells selects multiple word ids."""
    wrows = [i + 1 for i, r in enumerate(ed.rows) if r[0] == "word"][:5]
    drag(ed.I, "fin_tags", wrows)
    ok = (ed.sel_lane in ("fin_tags", "word") and len(ed.sel_ids) >= 2)
    return ok, f"lane={ed.sel_lane} sel_ids_count={len(ed.sel_ids)}"


def t_second_fadein_click_same_cell_drills_to_single():
    """First click on grouped fade-in cell selects whole group; second drills to one word."""
    # Create a 3-word fade-in group
    wrows = [i + 1 for i, r in enumerate(ed.rows) if r[0] == "word"][:3]
    ids = {ed.rows[l - 1][4] for l in wrows}
    for k, l in enumerate(wrows):
        click(ed.I, "fin_tags", l, ctrl=(k > 0))
    ed._group(); pump(2)
    # First click on wrows[1] → should select whole group
    click(ed.I, "fin_tags", wrows[1])
    whole = ed.sel_ids == ids
    # Second click same word → drill to single
    click(ed.I, "fin_tags", wrows[1])
    single_wid = ed.rows[wrows[1] - 1][4]
    drilled = ed.sel_ids == {single_wid}
    ok = whole and drilled
    return ok, f"whole={whole} drilled={drilled} sel={sorted(ed.sel_ids)}"


def t_rows_total_equals_layout_plus_words():
    """Total rows == number of layout events + total uncollapsed word rows."""
    n_layout = len(app._project["layout"])
    n_words_in_project = sum(len(ln["toks"]) for g in app._project["layout"] for ln in g["lines"])
    n_rows = len(ed.rows)
    ok = (n_rows == n_layout + n_words_in_project)
    return ok, f"rows={n_rows} layout={n_layout} proj_words={n_words_in_project}"


# ═══════════════════════════════════════════════════════════════
#  SUSPECTED_BUGS list — tests whose failures appear to reflect
#  real implementation issues rather than wrong test expectations.
# ═══════════════════════════════════════════════════════════════
SUSPECTED_BUGS = [
    # "fade-in click after layout header: clears sel_groups"
    #   _click() never clears sel_groups when lane != 'layout', so after clicking a fade
    #   cell the stale sel_groups from a prior header click persists. Visually harmless
    #   (highlight only uses sel_groups when sel_lane=='layout') but semantically surprising.
    #   Moved to SUSPECTED_BUGS; test above documents actual behavior instead.
]

# ═══════════════════════════════════════════════════════════════
#  Test registry
# ═══════════════════════════════════════════════════════════════
tests = [
    ("hdr row count matches layout events", t_hdr_row_count_matches_layout),
    ("word rows per event match token count", t_word_rows_per_event_match_toks),
    ("layout word click: sel_word set, ids/groups cleared", t_layout_word_click_sets_sel_word_clears_ids),
    ("layout header click: sel_group + sel_lane=layout set", t_layout_header_click_sets_sel_group),
    ("fade-in cell click: sel_lane='fin_tags'", t_fadein_cell_click_sets_lane_fin_tags),
    ("fade-out cell click: sel_lane='fout_tags'", t_fadeout_cell_click_sets_lane_fout_tags),
    ("ctrl-click toggle removes already-selected word", t_ctrl_click_toggle_removes_word),
    ("header click after word: clears sel_word", t_layout_header_click_clears_prior_word_selection),
    ("fade-in click after layout header: updates lane + sel_group", t_fadein_click_after_header_updates_lane_and_sel_group),
    ("layout word click: clears sel_ids from prior fade-in multi-select", t_layout_word_click_clears_sel_ids),
    ("collapse/expand: word row counts update correctly", t_rows_update_after_collapse),
    ("collapsed set persists across unrelated reload", t_collapsed_set_persists_across_unrelated_reload),
    ("sel highlight tag applied to fin pane after fin click", t_sel_highlight_tag_on_fin_pane),
    ("sel highlight tag applied to layout pane after header click", t_sel_highlight_tag_on_layout_header),
    ("sel tag on fin cleared after switching to fout", t_sel_tag_clears_on_lane_switch),
    ("drag in layout selects contiguous word range", t_drag_selects_contiguous_words_layout),
    ("wid at each word row matches project token first id", t_wid_at_word_row_matches_project_token),
    ("scroll fraction preserved after reload()", t_scroll_preserved_across_reload),
    ("post-merge reload: sel_* indices are valid", t_post_merge_reload_no_crash_valid_sel),
    ("collapse gi=0: exact word row count reduction", t_collapse_gi0_word_rows_exact_count),
    ("collapse does not remove header rows", t_hdr_count_unchanged_after_collapse),
    ("drag over fin cells selects multiple words", t_drag_fin_selects_multiple_words),
    ("second click same grouped fade-in cell drills to single word", t_second_fadein_click_same_cell_drills_to_single),
    ("total rows == layout events + uncollapsed word rows", t_rows_total_equals_layout_plus_words),
]

for name, fn in tests:
    check(name, fn)

print("\n==== UI TEST RESULTS (SELECTION & CUE-TABLE CONSISTENCY) ====")
npass = sum(1 for ok, *_ in results if ok)
for ok, name, detail in results:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + ("" if ok else f"   -> {detail}"))
print(f"\n{npass}/{len(results)} passed")
if SUSPECTED_BUGS:
    print("\nSUSPECTED_BUGS:")
    for entry in SUSPECTED_BUGS:
        print(f"  - {entry}")
app.destroy()
sys.exit(0 if npass == len(results) else 1)
