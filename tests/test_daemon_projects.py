# tests/test_daemon_projects.py — /api/env + /api/projects/create + legacy /new shim.
import os, sys, io, json, shutil, tempfile
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
    d = tempfile.mkdtemp(prefix="kss_dproj_")
    app = build_app(DaemonContext(Hub()), Hub(), token=None, projects_dir=d)
    return TestClient(app), d

def t_env_same_host_loopback():
    c, d = _client()
    try:
        r = c.get("/api/env")
        return (r.status_code == 200 and r.json().get("same_host") is True), r.text
    finally: shutil.rmtree(d, ignore_errors=True)

_active = {n: f for n, f in list(globals().items()) if n.startswith("t_") and callable(f)}
for n, f in sorted(_active.items()): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, dd in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"\n       -> {dd}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
