# tests/test_remove_break.py — engine.mutations.remove_break (join two lines).
import os, sys, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import engine
from engine import mutations as mut
import controller

results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))

def _proj():
    return engine.make_project({"json_path": "aligned_lyrics.json",
                                "group_by": "section", "skip_dashes": True})

def t_join_two_lines():
    p = _proj(); lines = p["layout"][0]["lines"]
    n0 = len(lines); a, b = len(lines[0]["toks"]), len(lines[1]["toks"])
    mut.remove_break(p, 0, 0)
    lines = p["layout"][0]["lines"]
    return (len(lines) == n0 - 1 and len(lines[0]["toks"]) == a + b), str([len(l["toks"]) for l in lines])

def t_join_roundtrips_with_add_break():
    p = _proj()
    before = copy.deepcopy(p["layout"][0]["lines"])
    cut_ti = len(before[0]["toks"]) - 1
    mut.add_break(p, 0, 0, cut_ti - 1, after=True)   # split line 0
    mut.remove_break(p, 0, 0)                         # join it back
    return (p["layout"][0]["lines"] == before), "round-trip"

def t_join_last_line_raises():
    p = _proj(); last = len(p["layout"][0]["lines"]) - 1
    try: mut.remove_break(p, 0, last); return (False, "no raise")
    except ValueError: return (True, "raised")

def t_join_negative_raises():
    p = _proj()
    try: mut.remove_break(p, 0, -1); return (False, "no raise")
    except ValueError: return (True, "raised")

def t_one_undo_step():
    p = _proj(); s = controller.Session(p)
    before = copy.deepcopy(s.project["layout"][0]["lines"])
    s.do("remove_break", 0, 0)
    joined = len(s.project["layout"][0]["lines"]) == len(before) - 1
    s.undo()
    return (joined and s.project["layout"][0]["lines"] == before), "undo restored"

def t_tool_join_lines():
    from mcp_server.context import HeadlessContext
    from mcp_server import tools
    c = HeadlessContext(); c.load_lyrics("aligned_lyrics.json")
    n0 = len(c.session.project["layout"][0]["lines"])
    view = tools.join_lines(c, 0, 0)
    return (len(c.session.project["layout"][0]["lines"]) == n0 - 1 and isinstance(view, dict)), "tool ok"

_active = {n: f for n, f in list(globals().items()) if n.startswith("t_") and callable(f)}
for n, f in sorted(_active.items()): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, dd in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"\n       -> {dd}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
