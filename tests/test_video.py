# tests/test_video.py — Feature A: video attach/swap/clear end-to-end.
# Covers: engine.ffmpeg.probe_video parsing, ctx.set_video stores probed meta,
# set_video tool round-trip (attach/swap/clear/undo/probe-failure), and the
# daemon POST/DELETE /api/video routes (upload bytes, server path, clear, persist).
import os, sys, io, json, tempfile, shutil
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))

import engine
from engine import ffmpeg
from mcp_server import tools
from mcp_server.context import HeadlessContext


# ---------------------------------------------------------------------------
# 1. engine.ffmpeg.probe_video — parses ffprobe stream output to {w,h,duration_s}.
# ---------------------------------------------------------------------------
# ffprobe JSON shape probe_video must parse (one video stream + format duration).
_PROBE_JSON = json.dumps({
    "streams": [{"codec_type": "audio"},
                {"codec_type": "video", "width": 1920, "height": 1080}],
    "format": {"duration": "42.18"},
})

class _FakeRun:
    """Monkeypatch seam for subprocess.run inside engine.ffmpeg."""
    def __init__(self, stdout="", rc=0, raise_exc=None):
        self.stdout = stdout; self.returncode = rc; self._raise = raise_exc
    def __call__(self, *a, **k):
        if self._raise: raise self._raise
        return self

def _patch_run(monkey):
    orig_run = ffmpeg.subprocess.run
    orig_isfile = ffmpeg.os.path.isfile
    ffmpeg.subprocess.run = monkey
    ffmpeg.os.path.isfile = lambda p: True   # pretend ffprobe binary + path exist
    return orig_run, orig_isfile

def _unpatch_run(orig):
    ffmpeg.subprocess.run, ffmpeg.os.path.isfile = orig

def t_probe_video_parses_wh_and_duration():
    orig = _patch_run(_FakeRun(stdout=_PROBE_JSON))
    try:
        meta = ffmpeg.probe_video("/x/clip.mp4")
    finally:
        _unpatch_run(orig)
    return (meta == {"w": 1920, "h": 1080, "duration_s": 42.18}), f"meta={meta}"

def t_probe_video_failure_returns_none():
    orig = _patch_run(_FakeRun(raise_exc=OSError("boom")))
    try:
        meta = ffmpeg.probe_video("/x/clip.mp4")
    finally:
        _unpatch_run(orig)
    return (meta is None), f"meta={meta}"

def t_probe_video_missing_binary_returns_none():
    orig_isfile = ffmpeg.os.path.isfile
    ffmpeg.os.path.isfile = lambda p: False
    try:
        meta = ffmpeg.probe_video("/x/clip.mp4")
    finally:
        ffmpeg.os.path.isfile = orig_isfile
    return (meta is None), f"meta={meta}"


# ---------------------------------------------------------------------------
# 2. ctx.set_video stores probed meta; clear nulls it; undo reverts.
# ---------------------------------------------------------------------------
def _ctx_with_probe(meta_for):
    """HeadlessContext with engine.ffmpeg.probe_video stubbed to meta_for(path)."""
    ctx = HeadlessContext()
    ctx.load_lyrics("aligned_lyrics.json")
    orig = ffmpeg.probe_video
    ffmpeg.probe_video = meta_for
    return ctx, orig

def t_set_video_stores_meta():
    ctx, orig = _ctx_with_probe(lambda p: {"w": 1280, "h": 720, "duration_s": 12.5})
    try:
        tools.set_video(ctx, "/abs/clip.mp4")
        proj = tools.get_project(ctx)
    finally:
        ffmpeg.probe_video = orig
    v = proj["video"]
    return (isinstance(v, dict) and v["path"] == "/abs/clip.mp4" and v["w"] == 1280
            and v["h"] == 720 and v["duration_s"] == 12.5), f"video={v}"

def t_set_video_clear_nulls_both():
    ctx, orig = _ctx_with_probe(lambda p: {"w": 1280, "h": 720, "duration_s": 12.5})
    try:
        tools.set_video(ctx, "/abs/clip.mp4")
        tools.set_video(ctx, None)
        proj = tools.get_project(ctx)
    finally:
        ffmpeg.probe_video = orig
    return (proj["video"] is None and ctx.video_path() is None), f"video={proj['video']}"

def t_set_video_undo_reverts():
    ctx, orig = _ctx_with_probe(lambda p: {"w": 1280, "h": 720, "duration_s": 12.5})
    try:
        tools.set_video(ctx, "/abs/clip.mp4")
        tools.undo(ctx)
        proj = tools.get_project(ctx)
    finally:
        ffmpeg.probe_video = orig
    return (proj["video"] is None), f"after undo video={proj['video']}"

def t_set_video_swap_reprobes():
    seen = {}
    def probe(p):
        seen[p] = True
        return {"/a.mp4": {"w": 640, "h": 480, "duration_s": 5.0},
                "/b.mov": {"w": 3840, "h": 2160, "duration_s": 99.0}}[p]
    ctx, orig = _ctx_with_probe(probe)
    try:
        tools.set_video(ctx, "/a.mp4")
        tools.set_video(ctx, "/b.mov")
        proj = tools.get_project(ctx)
    finally:
        ffmpeg.probe_video = orig
    v = proj["video"]
    return (v["path"] == "/b.mov" and v["w"] == 3840 and v["duration_s"] == 99.0), f"video={v}"

def t_set_video_probe_failure_keeps_path_null_meta():
    ctx, orig = _ctx_with_probe(lambda p: None)   # probe degrades to None
    try:
        tools.set_video(ctx, "/abs/clip.mp4")
        proj = tools.get_project(ctx)
    finally:
        ffmpeg.probe_video = orig
    v = proj["video"]
    return (isinstance(v, dict) and v["path"] == "/abs/clip.mp4"
            and v["w"] is None and v["h"] is None and v["duration_s"] is None), f"video={v}"


# ---------------------------------------------------------------------------
# 3. daemon POST/DELETE /api/video — upload bytes, server path, clear, persist.
# ---------------------------------------------------------------------------
from starlette.testclient import TestClient
from daemon.hub import Hub
from daemon.context import DaemonContext
from daemon.app import build_app

def _daemon():
    """A TestClient + projects dir with one created project open, probe stubbed."""
    tmp = tempfile.mkdtemp(prefix="kss_video_")
    hub = Hub(); ctx = DaemonContext(hub)
    app = build_app(ctx, hub, token=None, projects_dir=tmp)
    c = TestClient(app, client=("127.0.0.1", 12345))   # loopback so server-path mode is allowed
    # create a project (multipart) with lyrics only — no video yet
    with open("aligned_lyrics.json", "rb") as fh:
        c.post("/api/projects/create", files={"lyrics_file": ("lyrics.json", fh.read())},
               data={"name": "vid_proj", "source": "suno_json"})
    return c, ctx, tmp

def _stub_probe(meta=None):
    orig = ffmpeg.probe_video
    ffmpeg.probe_video = lambda p: (meta if meta is not None
                                    else {"w": 1920, "h": 1080, "duration_s": 7.5})
    return orig

def t_api_video_upload_sets_video_and_meta():
    c, ctx, tmp = _daemon()
    orig = _stub_probe()
    try:
        r = c.post("/api/video", files={"video_file": ("clip.mp4", b"\x00\x00fakevid")})
        assert r.status_code == 200, r.text
        st = c.get("/api/state").json()
    finally:
        ffmpeg.probe_video = orig; shutil.rmtree(tmp, ignore_errors=True)
    v = st["video"]
    return (isinstance(v, dict) and v["w"] == 1920 and v["h"] == 1080
            and v["duration_s"] == 7.5 and v["path"].endswith(".mp4")), f"video={v}"

def t_api_video_path_mode():
    c, ctx, tmp = _daemon()
    orig = _stub_probe()
    # a real same-host file to point at
    p = os.path.join(tmp, "external.mp4")
    with open(p, "wb") as fh: fh.write(b"x")
    try:
        r = c.post("/api/video", json={"path": p})
        assert r.status_code == 200, r.text
        st = c.get("/api/state").json()
    finally:
        ffmpeg.probe_video = orig; shutil.rmtree(tmp, ignore_errors=True)
    v = st["video"]
    return (isinstance(v, dict) and v["path"] == os.path.abspath(p)), f"video={v}"

def t_api_video_clear_detaches():
    c, ctx, tmp = _daemon()
    orig = _stub_probe()
    try:
        c.post("/api/video", files={"video_file": ("clip.mp4", b"\x00abc")})
        r = c.delete("/api/video")
        assert r.status_code == 200, r.text
        st = c.get("/api/state").json()
    finally:
        ffmpeg.probe_video = orig; shutil.rmtree(tmp, ignore_errors=True)
    return (st["video"] is None), f"video={st['video']}"

def t_api_video_path_mode_missing_400():
    c, ctx, tmp = _daemon()
    orig = _stub_probe()
    try:
        r = c.post("/api/video", json={"path": "/no/such/file.mp4"})
    finally:
        ffmpeg.probe_video = orig; shutil.rmtree(tmp, ignore_errors=True)
    return (r.status_code >= 400), f"status={r.status_code} body={r.text}"

def t_api_video_reload_persists():
    c, ctx, tmp = _daemon()
    orig = _stub_probe()
    try:
        c.post("/api/video", files={"video_file": ("clip.mp4", b"\x00abc")})
        # reopen the project — video pointer must survive (project.json round-trip)
        c.post("/api/projects/open", json={"name": "vid_proj"})
        st = c.get("/api/state").json()
    finally:
        ffmpeg.probe_video = orig; shutil.rmtree(tmp, ignore_errors=True)
    v = st["video"]
    return (isinstance(v, dict) and v["path"].endswith(".mp4")), f"video={v}"

def t_api_video_clear_keeps_lyrics():
    c, ctx, tmp = _daemon()
    orig = _stub_probe()
    try:
        c.post("/api/video", files={"video_file": ("clip.mp4", b"\x00abc")})
        before = c.get("/api/state").json()
        c.delete("/api/video")
        after = c.get("/api/state").json()
    finally:
        ffmpeg.probe_video = orig; shutil.rmtree(tmp, ignore_errors=True)
    return (after["video"] is None and after["words"] == before["words"]
            and len(after["layout"]) == len(before["layout"])), "lyrics preserved"


for n, f in list(globals().items()):
    if n.startswith("t_"): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, d in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"  -> {d}"))
print(f"\n{npass}/{len(results)} passed"); sys.exit(0 if npass == len(results) else 1)
