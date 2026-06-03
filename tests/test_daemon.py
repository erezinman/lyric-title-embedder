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
            and last["state"]["n_events"] >= 1), f"scheduled={len(hub.scheduled)}"

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
    return (st["events"][0]["style_overrides"].get("fontsize") == 96), f"r={r.json()}"

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
    return (msg["type"] == "state" and msg["state"]["events"][0]["style_overrides"].get("fontsize") == 70), f"msg_type={msg['type']}"

for n, f in list(globals().items()):
    if n.startswith("t_"): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, d in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"  -> {d}"))
print(f"\n{npass}/{len(results)} passed"); sys.exit(0 if npass == len(results) else 1)
