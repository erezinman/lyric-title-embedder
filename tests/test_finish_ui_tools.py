# tests/test_finish_ui_tools.py — merge_word_span tool + get_project.video field.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mcp_server.context import HeadlessContext
from mcp_server import tools

results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))

def _ctx():
    c = HeadlessContext(); c.load_lyrics("aligned_lyrics.json"); return c

def _toks(c, gi=0, li=1):
    return c.session.project["layout"][gi]["lines"][li]["toks"]

def t_merge_word_span_tool():
    c = _ctx()
    n0 = len(_toks(c))
    view = tools.merge_word_span(c, 0, 1, 0, 2, sep=" ")
    n1 = len(_toks(c))
    return (n1 == n0 - 2 and isinstance(view, dict)), f"{n0}->{n1}"

def t_merge_word_span_invalid_raises():
    c = _ctx()
    try: tools.merge_word_span(c, 0, 1, 2, 1); return (False, "no raise")
    except ValueError: return (True, "raised")

def t_get_project_video_null_then_set():
    c = _ctx()
    p0 = tools.get_project(c)
    c.set_video("/tmp/some_clip.mp4")
    p1 = tools.get_project(c)
    # `video` is now an object {path,w,h,duration_s}; check the path field.
    return ("video" in p0 and p0["video"] is None
            and isinstance(p1["video"], dict)
            and p1["video"]["path"] == "/tmp/some_clip.mp4"), str(p1.get("video"))

def t_get_project_exposes_use_pos():
    c = _ctx()
    p0 = tools.get_project(c)
    return ("use_pos" in p0["placement"]), str(sorted(p0["placement"].keys()))

def t_registered_in_server():
    import inspect
    from mcp_server import server
    src = inspect.getsource(server)
    return ("merge_word_span" in src), "registered"

_active = {n: f for n, f in list(globals().items()) if n.startswith("t_") and callable(f)}
for n, f in sorted(_active.items()): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, dd in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"\n       -> {dd}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
