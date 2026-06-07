# tests/test_unmerge.py — engine.mutations.unmerge_token + merge_word_run, and the
# matching MCP tools (unmerge_words / merge_words_run). Pytest-collectable (the
# verification command runs `python -m pytest`).
#
# Covers (scope §1, §2):
#   unmerge_token(project, gi, li, ti)  — split a merged tok into one tok per id,
#       each inheriting a COPY of the merged tok's style + del; ValueError if not merged.
#   merge_word_run(project, gi, ids)    — merge a layout-contiguous run of word ids
#       within one group (may span line breaks; inner \N dropped, outer preserved);
#       ValueError if non-contiguous or cross-group.
import os, sys, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import engine
from engine import mutations as mut
import core
import controller
from mcp_server.context import HeadlessContext
from mcp_server import tools


def _proj():
    return engine.make_project({"json_path": "aligned_lyrics.json",
                                "group_by": "section", "skip_dashes": True})


def _line(p, gi=0, li=1):
    return p["layout"][gi]["lines"][li]["toks"]


def _ctx(project):
    c = HeadlessContext()
    c.session.set_project(project)
    return c


# ── unmerge_token (§1) ────────────────────────────────────────────────────────

def test_unmerge_splits_into_one_tok_per_id():
    p = _proj()
    mut.merge_token_span(p, 0, 1, 0, 2, sep=" ")
    merged = _line(p)[0]
    ids = list(merged["ids"])
    assert len(ids) == 3
    n_before = len(_line(p))
    mut.unmerge_token(p, 0, 1, 0)
    toks = _line(p)
    assert len(toks) == n_before + 2                  # one tok replaced by three
    assert [t["ids"] for t in toks[:3]] == [[ids[0]], [ids[1]], [ids[2]]]
    assert all(len(t["ids"]) == 1 for t in toks[:3])


def test_unmerge_copies_style_and_del_to_each():
    p = _proj()
    toks = _line(p)
    toks[0]["style"] = {"fontsize": 90}; toks[0]["del"] = True
    mut.merge_token_span(p, 0, 1, 0, 1, sep=" ")
    mut.unmerge_token(p, 0, 1, 0)
    a, b = _line(p)[0], _line(p)[1]
    assert a["style"] == {"fontsize": 90} and b["style"] == {"fontsize": 90}
    assert a["del"] is True and b["del"] is True
    # each tok must own an independent copy (mutating one never bleeds to the other)
    a["style"]["fontsize"] = 10
    assert b["style"]["fontsize"] == 90


def test_unmerge_not_merged_raises():
    p = _proj()
    with pytest.raises(ValueError):
        mut.unmerge_token(p, 0, 1, 0)                  # a single-id tok is not merged


def test_merge_then_unmerge_roundtrip_deep_equal():
    p = _proj()
    before = copy.deepcopy(p["layout"][0]["lines"][1]["toks"])
    mut.merge_token_span(p, 0, 1, 0, 2, sep=" ")
    mut.unmerge_token(p, 0, 1, 0)
    after = p["layout"][0]["lines"][1]["toks"]
    # ids/structure restored; sep resets to "" (split words carry no glue) — compare ids+style+del
    assert [t["ids"] for t in after] == [t["ids"] for t in before]
    assert [t["style"] for t in after] == [t.get("style", {}) for t in before]


def test_unmerge_one_undo_step():
    p = _proj()
    s = controller.Session(p)
    s.do("merge_token_span", 0, 1, 0, 2, " ")
    snap = copy.deepcopy(s.project["layout"][0]["lines"][1]["toks"])
    s.do("unmerge_token", 0, 1, 0)
    assert len(s.project["layout"][0]["lines"][1]["toks"]) == len(snap) + 2
    s.undo()
    assert s.project["layout"][0]["lines"][1]["toks"] == snap


# ── merge_word_run (§2) ─────────────────────────────────────────────────────────

def test_merge_run_same_line_still_works():
    p = _proj()
    toks = _line(p)
    ids = toks[0]["ids"] + toks[1]["ids"]
    n0 = len(toks)
    mut.merge_word_run(p, 0, ids)
    toks = _line(p)
    assert len(toks) == n0 - 1
    assert toks[0]["ids"] == ids


def test_merge_run_crosses_line_drops_inner_break_only():
    # Build a group with two lines; merge the last tok of line 0 with the first of line 1.
    p = _proj()
    g = p["layout"][0]
    # ensure at least two lines with >1 tok each
    assert len(g["lines"]) >= 2 and len(g["lines"][0]["toks"]) >= 2 and len(g["lines"][1]["toks"]) >= 2
    last0 = g["lines"][0]["toks"][-1]["ids"][0]
    first1 = g["lines"][1]["toks"][0]["ids"][0]
    n_lines = len(g["lines"])
    mut.merge_word_run(p, 0, [last0, first1])
    g = p["layout"][0]
    # the break BETWEEN those two lines is gone → one fewer line
    assert len(g["lines"]) == n_lines - 1
    # the two ids now live in one tok
    merged = [t for ln in g["lines"] for t in ln["toks"] if last0 in t["ids"]]
    assert len(merged) == 1 and first1 in merged[0]["ids"]


def test_merge_run_non_contiguous_rejected():
    p = _proj()
    toks = _line(p)
    # skip the middle tok → non-contiguous run
    ids = toks[0]["ids"] + toks[2]["ids"]
    with pytest.raises(ValueError):
        mut.merge_word_run(p, 0, ids)


def test_merge_run_cross_group_rejected():
    p = _proj()
    assert len(p["layout"]) >= 2
    a = p["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    b = p["layout"][1]["lines"][0]["toks"][0]["ids"][0]
    with pytest.raises(ValueError):
        mut.merge_word_run(p, 0, [a, b])


def test_merge_run_undo_roundtrip():
    p = _proj()
    s = controller.Session(p)
    before = copy.deepcopy(s.project["layout"][0])
    toks = s.project["layout"][0]["lines"][1]["toks"]
    ids = toks[0]["ids"] + toks[1]["ids"]
    s.do("merge_word_run", 0, ids)
    assert s.project["layout"][0] != before
    s.undo()
    assert s.project["layout"][0] == before


# ── tool layer (HeadlessContext) ────────────────────────────────────────────────

def test_tool_unmerge_words():
    p = _proj()
    mut.merge_token_span(p, 0, 1, 0, 2, sep=" ")
    c = _ctx(p)
    n_before = len(c.session.project["layout"][0]["lines"][1]["toks"])
    view = tools.unmerge_words(c, 0, 1, 0)
    toks = c.session.project["layout"][0]["lines"][1]["toks"]
    assert len(toks) == n_before + 2
    assert view["gi"] == 0


def test_tool_merge_words_run_cross_line():
    p = _proj()
    c = _ctx(p)
    g = c.session.project["layout"][0]
    last0 = g["lines"][0]["toks"][-1]["ids"][0]
    first1 = g["lines"][1]["toks"][0]["ids"][0]
    n_lines = len(g["lines"])
    view = tools.merge_words_run(c, 0, [last0, first1])
    assert len(c.session.project["layout"][0]["lines"]) == n_lines - 1
    assert view["gi"] == 0


def test_tool_merge_words_run_non_contiguous_raises():
    p = _proj()
    c = _ctx(p)
    toks = c.session.project["layout"][0]["lines"][1]["toks"]
    ids = toks[0]["ids"] + toks[2]["ids"]
    with pytest.raises(ValueError):
        tools.merge_words_run(c, 0, ids)
