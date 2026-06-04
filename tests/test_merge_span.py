# tests/test_merge_span.py — engine.mutations.merge_token_span (atomic multi-merge).
import os, sys, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import engine
from engine import mutations as mut
import core
import controller

results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))

def _proj():
    return engine.make_project({"json_path": "aligned_lyrics.json",
                                "group_by": "section", "skip_dashes": True})

def _line(p, gi=0, li=1):
    return p["layout"][gi]["lines"][li]["toks"]

def t_merge_three_tokens():
    p = _proj(); toks = _line(p)
    ids_expect = toks[0]["ids"] + toks[1]["ids"] + toks[2]["ids"]
    n0 = len(toks)
    mut.merge_token_span(p, 0, 1, 0, 2, sep=" ")
    toks = _line(p)
    return (len(toks) == n0 - 2 and toks[0]["ids"] == ids_expect
            and toks[0]["sep"] == " "), str(toks[0])

def t_merge_keeps_left_style_and_del():
    p = _proj(); toks = _line(p)
    toks[0]["style"] = {"fontsize": 90}; toks[0]["del"] = True
    toks[1]["style"] = {"fontsize": 10}
    mut.merge_token_span(p, 0, 1, 0, 1)
    t0 = _line(p)[0]
    return (t0["style"] == {"fontsize": 90} and t0["del"] is True), str(t0)

def t_merge_rendered_text_glued_vs_spaced():
    p = _proj()
    a = core.token_text(p["words"], _line(p)[0]).strip()
    b = core.token_text(p["words"], _line(p)[1]).strip()
    p2 = copy.deepcopy(p)
    mut.merge_token_span(p, 0, 1, 0, 1, sep=" ")
    mut.merge_token_span(p2, 0, 1, 0, 1, sep="")
    spaced = core.token_text(p["words"], _line(p)[0]).strip()
    glued = core.token_text(p2["words"], _line(p2)[0]).strip()
    return (spaced == f"{a} {b}" and glued == f"{a}{b}"), f"{spaced!r} / {glued!r}"

def t_merge_full_line():
    p = _proj(); n = len(_line(p))
    mut.merge_token_span(p, 0, 1, 0, n - 1, sep=" ")
    return (len(_line(p)) == 1 and len(_line(p)[0]["ids"]) >= n), str(len(_line(p)))

def t_merge_validation_errors():
    p = _proj(); n = len(_line(p)); errs = 0
    for args in ((0, 0), (2, 1), (-1, 1), (0, n)):   # no-op span, reversed, negative, out of range
        try: mut.merge_token_span(copy.deepcopy(p), 0, 1, *args)
        except ValueError: errs += 1
    return (errs == 4), f"{errs}/4 raised"

def t_merge_one_undo_step():
    p = _proj()
    s = controller.Session(p)
    before = copy.deepcopy(s.project["layout"][0]["lines"][1]["toks"])
    s.do("merge_token_span", 0, 1, 0, 2, " ")
    merged = len(s.project["layout"][0]["lines"][1]["toks"]) == len(before) - 2
    s.undo()
    return (merged and s.project["layout"][0]["lines"][1]["toks"] == before), "undo restored"

_active = {n: f for n, f in list(globals().items()) if n.startswith("t_") and callable(f)}
for n, f in sorted(_active.items()): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, dd in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"\n       -> {dd}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
