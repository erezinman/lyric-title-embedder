# tests/test_atomic_breakjoin.py — atomic multi break/join (one gesture = one undo).
import os, sys, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import engine
from engine import mutations as mut
from mcp_server.context import HeadlessContext
from mcp_server import tools

results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))

def _single_line_proj(n=5):
    """A project whose group 0 has ONE line of n single-id tokens."""
    p = {"words": [{"text": f"w{i}", "start": float(i), "end": float(i) + 0.5} for i in range(n)],
         "globals": {"animations": []}, "anim_tags": [],
         "layout": [{"label": "L", "win_start": None, "win_end": None, "linger": None,
                     "del": False, "style": {}, "animations": [], "suppress": [],
                     "lines": [{"toks": [{"ids": [i], "sep": "", "del": False, "style": {}}
                                         for i in range(n)]}]}]}
    return p

def _lens(p):
    return [len(ln["toks"]) for ln in p["layout"][0]["lines"]]

# ── engine: break_after_each ──────────────────────────────────────────────────
def t_break_after_each_multiple_cuts():
    p = _single_line_proj(5)
    mut.break_after_each(p, 0, 0, [0, 2])   # break after tok0 and tok2
    return (_lens(p) == [1, 2, 2]), str(_lens(p))

def t_break_after_each_single_equals_add_break():
    a = _single_line_proj(5); b = _single_line_proj(5)
    mut.break_after_each(a, 0, 0, [2])
    mut.add_break(b, 0, 0, 2, after=True)
    return (_lens(a) == _lens(b) == [3, 2]), f"{_lens(a)} vs {_lens(b)}"

def t_break_after_each_boundary_inert():
    p = _single_line_proj(4)
    mut.break_after_each(p, 0, 0, [3])   # after last token -> no split
    return (_lens(p) == [4]), str(_lens(p))

def t_break_after_each_empty_noop():
    p = _single_line_proj(4)
    mut.break_after_each(p, 0, 0, [])
    return (_lens(p) == [4]), str(_lens(p))

def t_break_after_each_bad_ti_raises():
    p = _single_line_proj(4)
    try: mut.break_after_each(p, 0, 0, [9]); return (False, "no raise")
    except ValueError: return (True, "raised")

# ── engine: join_lines_multi ──────────────────────────────────────────────────
def _three_line_proj():
    p = _single_line_proj(6)
    # split into 3 lines of 2
    mut.break_after_each(p, 0, 0, [1, 3])
    return p

def t_join_lines_multi_collapses_run():
    p = _three_line_proj()
    assert _lens(p) == [2, 2, 2], _lens(p)
    mut.join_lines_multi(p, 0, [0, 1, 2])
    return (_lens(p) == [6]), str(_lens(p))

def t_join_lines_multi_partial_run():
    p = _three_line_proj()
    mut.join_lines_multi(p, 0, [1, 2])
    return (_lens(p) == [2, 4]), str(_lens(p))

def t_join_lines_multi_single_noop():
    p = _three_line_proj()
    mut.join_lines_multi(p, 0, [1])
    return (_lens(p) == [2, 2, 2]), str(_lens(p))

def t_join_lines_multi_noncontiguous_raises():
    p = _three_line_proj()
    try: mut.join_lines_multi(p, 0, [0, 2]); return (False, "no raise")
    except ValueError: return (True, "raised")

# ── one gesture = one undo (through the session) ──────────────────────────────
def _ctx():
    c = HeadlessContext()
    c.session.set_project(_single_line_proj(6))
    return c

def t_break_after_each_one_undo_reverts_all():
    c = _ctx()
    before = copy.deepcopy(c.session.project)
    tools.break_after_each(c, 0, 0, [1, 3])
    assert _lens(c.session.project) == [2, 2, 2], _lens(c.session.project)
    tools.undo(c)                       # ONE undo
    return (c.session.project == before and not c.session.can_undo()), str(_lens(c.session.project))

def t_join_lines_multi_one_undo_reverts_all():
    c = _ctx()
    tools.break_after_each(c, 0, 0, [1, 3])     # -> [2,2,2]
    mid = copy.deepcopy(c.session.project)
    tools.join_lines_multi(c, 0, [0, 1, 2])     # -> [6]
    assert _lens(c.session.project) == [6]
    tools.undo(c)                       # ONE undo back to [2,2,2]
    return (c.session.project == mid), str(_lens(c.session.project))

def t_break_join_undo_redo_roundtrip_deepequal():
    c = _ctx()
    before = copy.deepcopy(c.session.project)
    tools.break_after_each(c, 0, 0, [1, 3])
    after = copy.deepcopy(c.session.project)
    tools.undo(c); ok_undo = (c.session.project == before)
    tools.redo(c); ok_redo = (c.session.project == after)
    return (ok_undo and ok_redo), f"undo={ok_undo} redo={ok_redo}"

def t_break_after_each_noop_no_history():
    c = _ctx()
    d0 = len(c.session._undo)
    tools.break_after_each(c, 0, 0, [])   # no cuts -> no change -> no history step
    return (len(c.session._undo) == d0), f"depth {len(c.session._undo)}"

_active = {n: f for n, f in list(globals().items()) if n.startswith("t_") and callable(f)}
for n, f in sorted(_active.items()): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, dd in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"\n       -> {dd}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
