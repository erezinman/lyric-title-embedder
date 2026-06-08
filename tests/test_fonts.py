# tests/test_fonts.py — custom-font upload + burn-time fontsdir resolution.
# Engine: frame_cmd/burn_cmd append :fontsdir=<dir>. Library: save/list/delete per project.
# Daemon: POST /api/fonts/upload, GET /api/fonts/file/{family}, GET /api/fonts (system+custom),
# DELETE /api/fonts/{family}; persists across reopen.
import os, sys, io, shutil, tempfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))

import engine
from engine import ffmpeg
from daemon import library
from starlette.testclient import TestClient
from daemon.hub import Hub
from daemon.context import DaemonContext
from daemon.app import build_app

# a tiny non-empty payload standing in for a font file (we never shape it)
FONT_BYTES = b"OTTO\x00\x00fake-font-bytes"

# ── engine: fontsdir wiring ─────────────────────────────────────────────────
def t_frame_cmd_no_fontsdir_default():
    cmd = ffmpeg.frame_cmd(None, "/t/x.ass", 1.0, 1920, 1080, "/t/o.png")
    vf = cmd[cmd.index("-vf") + 1]
    return ("fontsdir" not in vf), vf

def t_frame_cmd_with_fontsdir():
    cmd = ffmpeg.frame_cmd(None, "/t/x.ass", 1.0, 1920, 1080, "/t/o.png", fonts_dir="/proj/fonts")
    vf = cmd[cmd.index("-vf") + 1]
    return ("fontsdir=" in vf and "/proj/fonts" in vf), vf

def t_burn_cmd_with_fontsdir():
    cmd = ffmpeg.burn_cmd("/in.mp4", "/t/x.ass", "/out.mp4", fonts_dir="/proj/fonts")
    vf = cmd[cmd.index("-vf") + 1]
    return ("fontsdir=" in vf and "/proj/fonts" in vf), vf

def t_burn_cmd_no_fontsdir_default():
    cmd = ffmpeg.burn_cmd("/in.mp4", "/t/x.ass", "/out.mp4")
    vf = cmd[cmd.index("-vf") + 1]
    return ("fontsdir" not in vf), vf

# ── library: save / list / delete / family derivation ───────────────────────
def t_lib_save_font_derives_family():
    folder = tempfile.mkdtemp(prefix="kss_f_")
    try:
        fam, url = library.save_font(folder, FONT_BYTES, "My_Cool Font.otf")
        on_disk = os.path.join(library.fonts_dir(folder), "My Cool Font.otf")
        return (fam == "My Cool Font" and os.path.isfile(on_disk)
                and url.endswith("My%20Cool%20Font") or url.endswith("My Cool Font")), f"{fam} {url}"
    finally: shutil.rmtree(folder, ignore_errors=True)

def t_lib_save_font_explicit_family():
    folder = tempfile.mkdtemp(prefix="kss_f_")
    try:
        fam, _ = library.save_font(folder, FONT_BYTES, "whatever.ttf", family="Branded")
        return (fam == "Branded" and os.path.isfile(os.path.join(library.fonts_dir(folder), "Branded.ttf"))), fam
    finally: shutil.rmtree(folder, ignore_errors=True)

def t_lib_rejects_bad_ext():
    folder = tempfile.mkdtemp(prefix="kss_f_")
    try:
        try:
            library.save_font(folder, FONT_BYTES, "evil.exe")
            return False, "should have raised"
        except ValueError:
            return True, "rejected"
    finally: shutil.rmtree(folder, ignore_errors=True)

def t_lib_list_and_delete():
    folder = tempfile.mkdtemp(prefix="kss_f_")
    try:
        library.save_font(folder, FONT_BYTES, "Alpha.ttf")
        library.save_font(folder, FONT_BYTES, "Beta.woff2")
        fams = {f["family"] for f in library.list_custom_fonts(folder)}
        library.delete_font(folder, "Alpha")
        fams2 = {f["family"] for f in library.list_custom_fonts(folder)}
        return (fams == {"Alpha", "Beta"} and fams2 == {"Beta"}), f"{fams} -> {fams2}"
    finally: shutil.rmtree(folder, ignore_errors=True)

# ── daemon end-to-end ───────────────────────────────────────────────────────
def _client_with_project():
    d = tempfile.mkdtemp(prefix="kss_fproj_")
    ctx = DaemonContext(Hub())
    app = build_app(ctx, Hub(), token=None, projects_dir=d)
    c = TestClient(app)
    with open("aligned_lyrics.json", "rb") as fh: blob = fh.read()
    r = c.post("/api/projects/create", data={"name": "p1", "source": "suno_json"},
               files={"lyrics_file": ("aligned_lyrics.json", io.BytesIO(blob), "application/json")})
    assert r.status_code == 200, r.text
    return c, ctx, d

def t_upload_returns_family_url_and_saves():
    c, ctx, d = _client_with_project()
    try:
        r = c.post("/api/fonts/upload",
                   files={"font_file": ("Display_One.otf", io.BytesIO(FONT_BYTES), "font/otf")})
        j = r.json()
        on_disk = os.path.join(d, "p1", "fonts", "Display One.otf")
        return (r.status_code == 200 and j["family"] == "Display One"
                and isinstance(j["url"], str) and os.path.isfile(on_disk)), r.text
    finally: shutil.rmtree(d, ignore_errors=True)

def t_file_route_serves_bytes():
    c, ctx, d = _client_with_project()
    try:
        c.post("/api/fonts/upload",
               files={"font_file": ("Serve_Me.ttf", io.BytesIO(FONT_BYTES), "font/ttf")})
        r = c.get("/api/fonts/file/Serve Me")
        return (r.status_code == 200 and r.content == FONT_BYTES), f"{r.status_code} {len(r.content)}"
    finally: shutil.rmtree(d, ignore_errors=True)

def t_list_includes_system_and_custom():
    c, ctx, d = _client_with_project()
    try:
        c.post("/api/fonts/upload",
               files={"font_file": ("Cust_A.ttf", io.BytesIO(FONT_BYTES), "font/ttf")})
        j = c.get("/api/fonts").json()
        customs = {f["family"] for f in j.get("custom", [])}
        return ("system" in j and isinstance(j["system"], list)
                and "custom" in j and "Cust A" in customs), str(j.get("custom"))
    finally: shutil.rmtree(d, ignore_errors=True)

def t_delete_removes():
    c, ctx, d = _client_with_project()
    try:
        c.post("/api/fonts/upload",
               files={"font_file": ("Gone.ttf", io.BytesIO(FONT_BYTES), "font/ttf")})
        r = c.delete("/api/fonts/Gone")
        customs = {f["family"] for f in c.get("/api/fonts").json().get("custom", [])}
        return (r.status_code == 200 and "Gone" not in customs
                and not os.path.isfile(os.path.join(d, "p1", "fonts", "Gone.ttf"))), r.text
    finally: shutil.rmtree(d, ignore_errors=True)

def t_persists_across_reopen():
    c, ctx, d = _client_with_project()
    try:
        c.post("/api/fonts/upload",
               files={"font_file": ("Persist.otf", io.BytesIO(FONT_BYTES), "font/otf")})
        # reopen the project (fresh ctx) and the on-disk font is still listed
        c.post("/api/projects/open", json={"name": "p1"})
        customs = {f["family"] for f in c.get("/api/fonts").json().get("custom", [])}
        return ("Persist" in customs), str(customs)
    finally: shutil.rmtree(d, ignore_errors=True)

# ── burn-time wiring: tools pass the open project's fonts dir ───────────────
def t_ctx_fonts_dir_after_create():
    c, ctx, d = _client_with_project()
    try:
        fd = ctx.fonts_dir()
        return (fd is not None and os.path.basename(fd) == "fonts"
                and os.path.normpath(fd) == os.path.normpath(os.path.join(d, "p1", "fonts"))), str(fd)
    finally: shutil.rmtree(d, ignore_errors=True)

def t_burn_cmd_uses_project_fonts_dir():
    # an uploaded family selected as the global font flows to Fontname AND the burn
    # cmd carries fontsdir pointing at the project fonts dir (integration check).
    c, ctx, d = _client_with_project()
    try:
        c.post("/api/fonts/upload",
               files={"font_file": ("Burned_Face.otf", io.BytesIO(FONT_BYTES), "font/otf")})
        from mcp_server import tools
        tools.set_globals(ctx, {"font": "Burned Face"})
        ass = tools.get_ass(ctx)
        # capture the burn cmd without actually burning: monkeypatch ffmpeg.run
        captured = {}
        orig_run = engine.ffmpeg.run
        engine.ffmpeg.run = lambda cmd, total, cb: (captured.setdefault("cmd", cmd), (True, None))[1]
        # also avoid probe spawning ffprobe
        orig_probe = engine.ffmpeg.probe_duration
        engine.ffmpeg.probe_duration = lambda p: 1.0
        try:
            tools.burn(ctx, os.path.join(d, "out.mp4"), video_in="/nonexistent.mp4")
            import time; time.sleep(0.2)
        finally:
            engine.ffmpeg.run = orig_run; engine.ffmpeg.probe_duration = orig_probe
        cmd = captured.get("cmd", [])
        vf = cmd[cmd.index("-vf") + 1] if "-vf" in cmd else ""
        fonts_dir = os.path.join(d, "p1", "fonts")
        # the uploaded family flows into the [V4+ Styles] Style line as Fontname (2nd col)
        style_line = next((l for l in ass.splitlines() if l.startswith("Style: Default,")), "")
        return (style_line.split(",")[1] == "Burned Face"
                and "fontsdir=" in vf and fonts_dir in vf), f"vf={vf!r} style={style_line!r}"
    finally: shutil.rmtree(d, ignore_errors=True)

_active = {n: f for n, f in list(globals().items()) if n.startswith("t_") and callable(f)}
for n, f in sorted(_active.items()): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, dd in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"\n       -> {dd}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
