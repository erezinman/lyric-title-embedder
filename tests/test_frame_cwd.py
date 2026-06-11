# tests/test_frame_cwd.py — exact-frame render must be cwd-safe.
# Repro for the blank EXACT preview: the Electron daemon runs with a cwd != repo,
# so a relative projects_dir made ctx.video_path() relative (e.g. projects/demo/video.mp4)
# and ffmpeg could not open the input → RuntimeError "frame render failed" (empty stderr).
# These tests open a project with a real video from a DIFFERENT cwd and assert
# tools.render_frame returns PNG bytes. They run real ffmpeg (skip if unavailable).
import os, sys, tempfile, shutil
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(REPO)
results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))

import engine
from engine import ffmpeg
from mcp_server import tools
from daemon.hub import Hub
from daemon.context import DaemonContext
from daemon import library

_HAVE_FFMPEG = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None

def _project_with_video(projects_dir):
    """Create a project (relative projects_dir on purpose) with a tiny real video."""
    hub = Hub(); ctx = DaemonContext(hub)
    library.create_project(ctx, projects_dir, "cwdproj", source="suno_json",
                           lyrics_path=os.path.join(REPO, "aligned_lyrics.json"))
    # generate a 1s solid-color test clip with ffmpeg so frame_cmd has a real input
    folder = os.path.join(projects_dir, "cwdproj")
    vpath = os.path.join(folder, "video.mp4")
    import subprocess
    subprocess.run([ffmpeg.FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
                    "-f", "lavfi", "-i", "color=c=blue:s=320x240:d=1",
                    "-pix_fmt", "yuv420p", vpath], check=True)
    library.set_project_video(ctx, projects_dir, "cwdproj", video_path=vpath)
    return ctx

def t_render_frame_from_foreign_cwd_returns_png():
    # Reproduces the production bug: the daemon's projects_dir is RELATIVE ("projects")
    # and its cwd != repo. open_project resolves the persisted basename video against
    # the relative projects_dir -> a relative path -> ffmpeg can't open the input.
    # render_frame must still produce a PNG (it must resolve the input to absolute).
    if not _HAVE_FFMPEG: return True, "skipped (no ffmpeg)"
    rel = os.path.join("projects", "_cwdtest")     # like the daemon default "projects"
    abs_proj = os.path.join(REPO, rel)
    shutil.rmtree(abs_proj, ignore_errors=True)
    os.makedirs(abs_proj, exist_ok=True)
    _project_with_video(rel)                       # creates + saves project.json
    # Fresh context that OPENS the persisted project via the relative projects_dir,
    # exactly as the daemon does on /api/projects/open.
    hub = Hub(); ctx = DaemonContext(hub)
    library.open_project(ctx, rel, "cwdproj")
    here = os.getcwd()
    try:
        os.chdir(tempfile.gettempdir())            # daemon's cwd != repo
        png = tools.render_frame(ctx, 0.2)
        magic = b"\x89PNG\r\n\x1a\n"
        ok = isinstance(png, (bytes, bytearray)) and png[:8] == magic
        return ok, f"vpath={ctx.video_path()!r} len={len(png) if png else 0} magic_ok={png[:8]==magic}"
    finally:
        os.chdir(here)
        shutil.rmtree(abs_proj, ignore_errors=True)

def t_render_frame_from_repo_cwd_returns_png():
    if not _HAVE_FFMPEG: return True, "skipped (no ffmpeg)"
    tmp = tempfile.mkdtemp(prefix="kss_cwd_")
    try:
        ctx = _project_with_video(tmp)   # absolute projects dir
        png = tools.render_frame(ctx, 0.2)   # from repo cwd
        ok = isinstance(png, (bytes, bytearray)) and png[:8] == b"\x89PNG\r\n\x1a\n"
        return ok, f"len={len(png) if png else 0}"
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

for n, f in list(globals().items()):
    if n.startswith("t_"): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, d in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"  -> {d}"))
print(f"\n{npass}/{len(results)} passed"); sys.exit(0 if npass == len(results) else 1)
