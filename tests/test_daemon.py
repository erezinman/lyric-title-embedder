# tests/test_daemon.py — unified daemon tests (TestClient; no real sockets / websockets lib).
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}"))

from daemon.hub import Hub
from daemon.context import DaemonContext

class _StubHub(Hub):
    def __init__(self): super().__init__(); self.scheduled = []
    def schedule(self, msg): self.scheduled.append(msg)

def t_context_fires_hub_on_change():
    hub = _StubHub(); ctx = DaemonContext(hub)
    ctx.load_lyrics("aligned_lyrics.json")
    n0 = len(hub.scheduled)
    from mcp_server import tools
    tools.set_group_style(ctx, 0, {"fontsize": 80})
    last = hub.scheduled[-1]
    return (n0 >= 1 and len(hub.scheduled) > n0 and last["type"] == "state"
            and "layout" in last["state"] and len(last["state"]["layout"]) >= 1), f"scheduled={len(hub.scheduled)}"

def t_context_is_synchronous_headless():
    hub = _StubHub(); ctx = DaemonContext(hub)
    return (ctx.run(lambda: 7) == 7 and "fontsize" in ctx.get_globals()), "sync ok"

from starlette.testclient import TestClient
from daemon.app import build_app

def _client():
    hub = Hub(); ctx = DaemonContext(hub); ctx.load_lyrics("aligned_lyrics.json")
    app = build_app(ctx, hub, token=None, projects_dir="/tmp/_kss_projects")
    return TestClient(app), ctx

def t_api_call_and_state():
    c, ctx = _client()
    r = c.post("/api/call", json={"tool": "set_group_style", "args": {"gi": 0, "partial": {"fontsize": 96}}})
    assert r.status_code == 200, r.text
    st = c.get("/api/state").json()
    return (st["layout"][0]["style"].get("fontsize") == 96), f"r={r.json()}"

def t_api_call_unknown_tool_400():
    c, _ = _client()
    r = c.post("/api/call", json={"tool": "no_such_tool", "args": {}})
    return (r.status_code >= 400 and "error" in r.json()), f"status={r.status_code}"

def t_ws_pushes_state_on_edit():
    c, ctx = _client()
    with c.websocket_connect("/ws") as ws:
        first = ws.receive_json()
        assert first["type"] == "state"
        c.post("/api/call", json={"tool": "set_group_style", "args": {"gi": 0, "partial": {"fontsize": 70}}})
        msg = ws.receive_json()
    return (msg["type"] == "state" and msg["state"]["layout"][0]["style"].get("fontsize") == 70), f"msg_type={msg['type']}"

def t_mcp_mounted():
    hub = Hub(); ctx = DaemonContext(hub); ctx.load_lyrics("aligned_lyrics.json")
    app = build_app(ctx, hub)
    paths = [getattr(r, "path", getattr(r, "path_format", "")) for r in app.routes]
    return (any(p == "/mcp" for p in paths)), f"paths={paths}"

def t_shared_session_mcp_edit_pushes_ws():
    c, ctx = _client()
    with c.websocket_connect("/ws") as ws:
        ws.receive_json()                                   # initial
        from mcp_server import tools
        wid = ctx.session.project["layout"][0]["lines"][0]["toks"][0]["ids"][0]
        tools.set_cue_style(ctx, [wid], {"primary": "#FF0000"})   # MCP-side edit on the shared ctx
        msg = ws.receive_json()
    return (msg["type"] == "state"), "shared-session push ok"

def t_api_frame_png():
    c, ctx = _client(); ctx.set_globals({"play_w": 320, "play_h": 180})
    r = c.get("/api/frame?t=13")
    return (r.status_code == 200 and r.headers["content-type"].startswith("image/png")
            and r.content[:4] == b"\x89PNG"), f"status={r.status_code} ct={r.headers.get('content-type')}"

def t_api_burn_job():
    import subprocess, core, time
    subprocess.run([core.FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
                    "-i", "color=c=navy:s=320x180:d=1", "/tmp/_kss_din.mp4"], check=True)
    c, ctx = _client(); ctx.set_globals({"play_w": 320, "play_h": 180})
    r = c.post("/api/burn", json={"out": "/tmp/_kss_dout.mp4", "video_in": "/tmp/_kss_din.mp4"})
    jid = r.json()["job_id"]; st = None
    for _ in range(200):
        st = c.get(f"/api/burn/{jid}").json()
        if st["done"]: break
        time.sleep(0.1)
    import os
    return (st and st["done"] and st["ok"] and os.path.isfile("/tmp/_kss_dout.mp4")), f"st={st}"

def t_library_roundtrip():
    import shutil, os
    pdir = "/tmp/_kss_projects"; shutil.rmtree(pdir, ignore_errors=True); os.makedirs(pdir)
    c, ctx = _client()                      # _client uses projects_dir=/tmp/_kss_projects
    c.post("/api/projects/new", json={"name": "demo", "lyrics_path": "aligned_lyrics.json"})
    c.post("/api/call", json={"tool": "set_group_style", "args": {"gi": 0, "partial": {"font": "Arial"}}})
    c.post("/api/projects/save", json={"name": "demo"})
    lst = c.get("/api/projects").json()
    assert "demo" in lst, lst
    c2, ctx2 = _client()
    c2.post("/api/projects/open", json={"name": "demo"})
    st = c2.get("/api/state").json()
    return (st["layout"][0]["style"].get("font") == "Arial"), f"lst={lst}"

def t_token_guard():
    hub = Hub(); ctx = DaemonContext(hub); ctx.load_lyrics("aligned_lyrics.json")
    app = build_app(ctx, hub, token="secret", projects_dir="/tmp/_kss_projects")
    c = TestClient(app)
    r1 = c.get("/api/state")
    r2 = c.get("/api/state", headers={"authorization": "Bearer secret"})
    return (r1.status_code == 401 and r2.status_code == 200), f"{r1.status_code},{r2.status_code}"

def t_mcp_token_guarded():
    # with a token set, /mcp must be guarded too (not just /api)
    hub = Hub(); ctx = DaemonContext(hub); ctx.load_lyrics("aligned_lyrics.json")
    app = build_app(ctx, hub, token="secret", projects_dir="/tmp/_kss_projects")
    c = TestClient(app)
    r = c.get("/mcp/sse")                     # no auth -> must be 401 (guard covers /mcp)
    return (r.status_code == 401), f"/mcp/sse no-auth status={r.status_code}"

def t_library_rejects_bad_name():
    c, _ = _client()
    r = c.post("/api/projects/open", json={"name": "../escape"})
    return (r.status_code == 400 and "error" in r.json()), f"status={r.status_code}"

def t_set_globals_pushes_ws():
    c, ctx = _client()
    with c.websocket_connect("/ws") as ws:
        ws.receive_json()                      # initial
        c.post("/api/call", json={"tool": "set_globals", "args": {"partial": {"fontsize": 53}}})
        msg = ws.receive_json()                # must receive a pushed state after a globals edit
    return (msg["type"] == "state" and msg["state"]["global_style"]["fontsize"] == 53), f"msg={msg.get('type')}"

def t_api_state_is_full_project():
    c, ctx = _client()
    r = c.get("/api/state")
    body = r.json()
    return (r.status_code == 200 and "words" in body and "layout" in body
            and "palette" not in body, sorted(body.keys()))

def t_ws_push_after_edit_carries_animation_model():
    # REWRITE (animations migration): the legacy set_group_fade tool is gone; fades are
    # now alpha animations produced by migration. Assert an edit still broadcasts a state
    # push and that the pushed project carries the new animation carriers (group.animations
    # / anim_tags), not the removed group.fade field.
    c, ctx = _client()
    with c.websocket_connect("/ws") as ws:
        ws.receive_json()  # initial state push
        c.post("/api/call", json={"tool": "set_layout_props", "args": {"gi": 0, "linger": 0.5}})
        msg = ws.receive_json()
        g0 = msg["state"]["layout"][0]
        ok = (msg["type"] == "state" and g0.get("linger") == 0.5
              and "fade" not in g0 and "animations" in g0
              and "anim_tags" in msg["state"])
        return (ok, {"linger": g0.get("linger"), "anims": len(g0.get("animations", []))})

def t_new_project_is_immediately_listable():
    import shutil, os
    pdir = "/tmp/_kss_projects"; shutil.rmtree(pdir, ignore_errors=True); os.makedirs(pdir)
    c, ctx = _client()
    c.post("/api/projects/new", json={"name": "fresh", "lyrics_path": "aligned_lyrics.json"})
    lst = c.get("/api/projects").json()    # listable WITHOUT an explicit save
    return ("fresh" in lst, lst)

def t_ws_echo_carries_cid():
    c, ctx = _client()
    with c.websocket_connect("/ws") as ws:
        init = ws.receive_json()                 # initial push (cid null)
        assert init.get("cid") is None, init
        r = c.post("/api/call", json={"tool": "set_group_style",
                                      "args": {"gi": 0, "partial": {"fontsize": 71}}, "cid": "abc123"})
        assert r.json().get("cid") == "abc123", r.json()
        msg = ws.receive_json()
    return (msg["type"] == "state" and msg.get("cid") == "abc123"), f"cid={msg.get('cid')}"

def t_ws_external_mutation_cid_null():
    c, ctx = _client()
    with c.websocket_connect("/ws") as ws:
        ws.receive_json()                        # initial
        # a side-channel mutation on the shared ctx (no /api/call, no cid)
        from mcp_server import tools
        tools.set_group_style(ctx, 0, {"fontsize": 72})
        msg = ws.receive_json()
    return (msg["type"] == "state" and msg.get("cid") is None), f"cid={msg.get('cid')}"

def t_ws_cid_resets_between_calls():
    # a cid'd call then an external mutation: the second broadcast must be cid null
    c, ctx = _client()
    with c.websocket_connect("/ws") as ws:
        ws.receive_json()
        c.post("/api/call", json={"tool": "set_group_style",
                                  "args": {"gi": 0, "partial": {"fontsize": 73}}, "cid": "X"})
        m1 = ws.receive_json()
        from mcp_server import tools
        tools.set_group_style(ctx, 0, {"fontsize": 74})
        m2 = ws.receive_json()
    return (m1.get("cid") == "X" and m2.get("cid") is None), f"m1={m1.get('cid')} m2={m2.get('cid')}"

def t_api_state_carries_undo_flags():
    c, ctx = _client()
    b0 = c.get("/api/state").json()
    c.post("/api/call", json={"tool": "set_group_style", "args": {"gi": 0, "partial": {"fontsize": 88}}})
    b1 = c.get("/api/state").json()
    return ("can_undo" in b0 and "can_redo" in b0 and b0["can_undo"] is False
            and b1["can_undo"] is True), f"b0={b0.get('can_undo')} b1={b1.get('can_undo')}"

def _client_mode(mode):
    hub = Hub(); ctx = DaemonContext(hub); ctx.load_lyrics("aligned_lyrics.json")
    app = build_app(ctx, hub, token=None, projects_dir="/tmp/_kss_projects", file_access=mode)
    return TestClient(app)

def t_env_reports_capabilities():
    n = _client_mode("native").get("/api/env").json()
    t = _client_mode("transfer").get("/api/env").json()
    return (n["file_access"] == "native" and n["can_use_server_paths"] and n["can_burn_video"]
            and t["file_access"] == "transfer" and not t["can_use_server_paths"]
            and not t["can_burn_video"] and "same_host" not in n), f"{n} / {t}"

def t_transfer_rejects_server_paths():
    import shutil, os
    pdir = "/tmp/_kss_projects"; shutil.rmtree(pdir, ignore_errors=True); os.makedirs(pdir)
    _client_mode("native").post("/api/projects/new", json={"name": "p", "lyrics_path": "aligned_lyrics.json"})
    c = _client_mode("transfer")
    c.post("/api/projects/open", json={"name": "p"})         # project open → past the 409 guard
    rv = c.post("/api/video", json={"path": "/x.mp4"})        # server-path video → 403 (transfer)
    rc = c.post("/api/projects/create", data={"name": "p2", "lyrics_path": "aligned_lyrics.json"})
    return (rv.status_code == 403 and rc.status_code == 403), f"video={rv.status_code} create={rc.status_code}"

def t_transfer_disables_burn():
    c = _client_mode("transfer")
    r = c.post("/api/burn", json={"out": "x.mp4"})
    return (r.status_code == 403), f"burn={r.status_code}"

def t_native_does_not_gate_server_paths():
    # In native mode the gate must NOT reject; these fail later (missing file) but never 403.
    c = _client_mode("native")
    rv = c.post("/api/video", json={"path": "/nope.mp4"})
    rb = c.post("/api/burn", json={"out": "/tmp/_kss_x.mp4", "video_in": "/nope.mp4"})
    return (rv.status_code != 403 and rb.status_code != 403), f"video={rv.status_code} burn={rb.status_code}"

def _client_webdist():
    import tempfile, os
    d = tempfile.mkdtemp(prefix="kss_webdist_")
    with open(os.path.join(d, "index.html"), "w") as fh: fh.write("<!doctype html><title>KSS</title>")
    os.makedirs(os.path.join(d, "assets"), exist_ok=True)
    with open(os.path.join(d, "assets", "app.js"), "w") as fh: fh.write("console.log('kss')")
    hub = Hub(); ctx = DaemonContext(hub); ctx.load_lyrics("aligned_lyrics.json")
    app = build_app(ctx, hub, token=None, projects_dir="/tmp/_kss_projects", web_dist=d)
    return TestClient(app), d

def t_spa_index_served_at_root():
    c, _ = _client_webdist()
    r = c.get("/")
    return (r.status_code == 200 and "<title>KSS</title>" in r.text), f"status={r.status_code}"

def t_spa_asset_served():
    c, _ = _client_webdist()
    r = c.get("/assets/app.js")
    return (r.status_code == 200 and "kss" in r.text), f"status={r.status_code}"

def t_spa_deep_route_falls_back_to_index():
    c, _ = _client_webdist()
    r = c.get("/some/editor/route")
    return (r.status_code == 200 and "<title>KSS</title>" in r.text), f"status={r.status_code}"

def t_spa_does_not_shadow_api():
    c, _ = _client_webdist()
    r = c.get("/api/state")
    body = r.json()
    return (r.status_code == 200 and "layout" in body), f"status={r.status_code}"

def t_spa_unknown_api_not_index():
    c, _ = _client_webdist()
    r = c.get("/api/no_such_route")
    return (r.status_code == 404 and "<title>" not in r.text), f"status={r.status_code} body={r.text[:40]!r}"

def t_no_spa_without_web_dist():
    c, _ = _client()   # default: web_dist=None
    r = c.get("/")
    return (r.status_code == 404), f"status={r.status_code}"

for n, f in list(globals().items()):
    if n.startswith("t_"): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, d in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"  -> {d}"))
print(f"\n{npass}/{len(results)} passed"); sys.exit(0 if npass == len(results) else 1)
