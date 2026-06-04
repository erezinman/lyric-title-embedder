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

SRT = ("1\n00:00:01,000 --> 00:00:03,000\nHello world\n\n"
       "2\n00:00:03,000 --> 00:00:05,000\nsecond line now\n")

def t_create_suno_upload():
    c, d = _client()
    try:
        with open("aligned_lyrics.json", "rb") as fh: blob = fh.read()
        r = c.post("/api/projects/create",
                   data={"name": "u1", "source": "suno_json"},
                   files={"lyrics_file": ("aligned_lyrics.json", io.BytesIO(blob), "application/json")})
        return (r.status_code == 200 and r.json().get("opened") == "u1"
                and "u1" in c.get("/api/projects").json()), r.text
    finally: shutil.rmtree(d, ignore_errors=True)

def t_create_srt_upload():
    c, d = _client()
    try:
        r = c.post("/api/projects/create",
                   data={"name": "srt1", "source": "srt", "line_break": "per_cue"},
                   files={"lyrics_file": ("x.srt", io.BytesIO(SRT.encode()), "text/plain")})
        return (r.status_code == 200 and "srt1" in c.get("/api/projects").json()), r.text
    finally: shutil.rmtree(d, ignore_errors=True)

def t_create_same_host_path():
    c, d = _client()
    try:
        r = c.post("/api/projects/create",
                   data={"name": "p2", "source": "suno_json",
                         "lyrics_path": os.path.abspath("aligned_lyrics.json")})
        return (r.status_code == 200 and "p2" in c.get("/api/projects").json()), r.text
    finally: shutil.rmtree(d, ignore_errors=True)

def t_create_collision_409():
    c, d = _client()
    try:
        c.post("/api/projects/create", data={"name": "dup", "source": "srt"},
               files={"lyrics_file": ("x.srt", io.BytesIO(SRT.encode()), "text/plain")})
        r = c.post("/api/projects/create", data={"name": "dup", "source": "srt"},
                   files={"lyrics_file": ("x.srt", io.BytesIO(SRT.encode()), "text/plain")})
        return (r.status_code == 409 and "error" in r.json()), r.text
    finally: shutil.rmtree(d, ignore_errors=True)

def t_create_bad_srt_400():
    c, d = _client()
    try:
        r = c.post("/api/projects/create", data={"name": "z", "source": "srt"},
                   files={"lyrics_file": ("x.srt", io.BytesIO(b"   "), "text/plain")})
        return (r.status_code == 400 and "error" in r.json()), r.text
    finally: shutil.rmtree(d, ignore_errors=True)

def t_legacy_new_still_works():
    c, d = _client()
    try:
        r = c.post("/api/projects/new",
                   json={"name": "leg", "lyrics_path": os.path.abspath("aligned_lyrics.json")})
        return (r.status_code == 200 and "leg" in c.get("/api/projects").json()), r.text
    finally: shutil.rmtree(d, ignore_errors=True)

_active = {n: f for n, f in list(globals().items()) if n.startswith("t_") and callable(f)}
for n, f in sorted(_active.items()): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, dd in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"\n       -> {dd}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
