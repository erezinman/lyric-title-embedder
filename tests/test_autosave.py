# tests/test_autosave.py — daemon autosaves the open project after edits (debounced).
import os, sys, json, time, shutil, tempfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from starlette.testclient import TestClient
from daemon.hub import Hub
from daemon.context import DaemonContext
from daemon.app import build_app

results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))

def _client():
    d = tempfile.mkdtemp(prefix="kss_autosave_")
    app = build_app(DaemonContext(Hub()), Hub(), token=None, projects_dir=d)
    c = TestClient(app)
    r = c.post("/api/projects/new", json={"name": "p", "lyrics_path": os.path.abspath("aligned_lyrics.json")})
    assert r.status_code == 200, r.text
    return c, d

def _wait_saved(check_fn, timeout=3.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if check_fn(): return True
        time.sleep(0.1)
    return False

def t_edit_autosaves_to_disk():
    c, d = _client()
    try:
        pj = os.path.join(d, "p", "project.json")
        c.post("/api/call", json={"tool": "set_group_style", "args": {"gi": 0, "partial": {"fontsize": 90}}})
        ok = _wait_saved(lambda: json.load(open(pj)).get("cues_v2", {}).get("layout", [{}])[0].get("style", {}).get("fontsize") == 90)
        return (ok, "autosaved fontsize=90")
    finally: shutil.rmtree(d, ignore_errors=True)

def t_break_line_survives_reopen():
    c, d = _client()
    try:
        n0 = len(json.loads(c.get("/api/state").content)["layout"][0]["lines"])
        c.post("/api/call", json={"tool": "break_line", "args": {"gi": 0, "li": 1, "ti": 2, "after": True}})
        pj = os.path.join(d, "p", "project.json")
        ok1 = _wait_saved(lambda: len(json.load(open(pj))["cues_v2"]["layout"][0]["lines"]) == n0 + 1)
        c.post("/api/projects/open", json={"name": "p"})
        n2 = len(json.loads(c.get("/api/state").content)["layout"][0]["lines"])
        return (ok1 and n2 == n0 + 1, f"lines {n0} -> {n2} after reopen")
    finally: shutil.rmtree(d, ignore_errors=True)

def t_globals_edit_autosaves():
    c, d = _client()
    try:
        pj = os.path.join(d, "p", "project.json")
        c.post("/api/call", json={"tool": "set_globals", "args": {"partial": {"align": 8}}})
        ok = _wait_saved(lambda: json.load(open(pj)).get("globals_style", {}).get("align") == 8)
        c.post("/api/projects/open", json={"name": "p"})
        st = json.loads(c.get("/api/state").content)
        return (ok and st["placement"]["align"] == 8, f"align={st['placement']['align']}")
    finally: shutil.rmtree(d, ignore_errors=True)

def t_no_project_open_no_crash():
    d = tempfile.mkdtemp(prefix="kss_autosave_")
    try:
        ctx = DaemonContext(Hub()); ctx.load_lyrics("aligned_lyrics.json")
        app = build_app(ctx, Hub(), token=None, projects_dir=d)
        c = TestClient(app)
        # lyrics loaded but NO named project bound; edits must not write or crash
        r = c.post("/api/call", json={"tool": "set_fade_defaults", "args": {"fade_in_ms": 300}})
        time.sleep(0.8)
        return (r.status_code == 200 and os.listdir(d) == [], "no stray writes, no crash")
    finally: shutil.rmtree(d, ignore_errors=True)

def t_rapid_edits_debounce_single_consistent_save():
    c, d = _client()
    try:
        pj = os.path.join(d, "p", "project.json")
        for fs in (70, 72, 74, 76, 78):
            c.post("/api/call", json={"tool": "set_group_style", "args": {"gi": 0, "partial": {"fontsize": fs}}})
        ok = _wait_saved(lambda: json.load(open(pj)).get("cues_v2", {}).get("layout", [{}])[0].get("style", {}).get("fontsize") == 78)
        return (ok, "final state saved")
    finally: shutil.rmtree(d, ignore_errors=True)

_active = {n: f for n, f in list(globals().items()) if n.startswith("t_") and callable(f)}
for n, f in sorted(_active.items()): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, dd in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"\n       -> {dd}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
