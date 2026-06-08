# tests/test_connect.py — /api/connect and /api/fonts (TestClient; stdlib script style).
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))

from starlette.testclient import TestClient
from daemon.hub import Hub
from daemon.context import DaemonContext
from daemon.app import build_app

def _client():
    hub = Hub(); ctx = DaemonContext(hub); ctx.load_lyrics("aligned_lyrics.json")
    app = build_app(ctx, hub, token=None, projects_dir="/tmp/_kss_projects")
    return TestClient(app), ctx

def t_connect_shape():
    c, _ = _client()
    b = c.get("/api/connect").json()
    keys = {"host", "port", "api_url", "ws_url", "mcp_url", "token_required"}
    ok = (keys <= set(b)
          and b["api_url"].endswith("/api/call")
          and b["mcp_url"].endswith("/mcp")
          and b["ws_url"].startswith("ws") and b["ws_url"].endswith("/ws")
          and isinstance(b["token_required"], bool))
    return (ok, b)

def t_connect_host_port_from_request():
    c, _ = _client()
    b = c.get("/api/connect").json()
    # TestClient uses testserver / port 80 by default; both should be derived (not hard-coded 8137).
    return (b["host"] == "testserver" and isinstance(b["port"], int), b)

def t_connect_token_required_false_without_env():
    os.environ.pop("KSS_MCP_TOKEN", None)
    c, _ = _client()
    b = c.get("/api/connect").json()
    return (b["token_required"] is False, b)

def t_connect_token_required_flips_with_env():
    os.environ["KSS_MCP_TOKEN"] = "secret-xyz"
    try:
        c, _ = _client()
        b = c.get("/api/connect").json()
    finally:
        os.environ.pop("KSS_MCP_TOKEN", None)
    return (b["token_required"] is True, b)

def t_connect_never_leaks_token():
    os.environ["KSS_MCP_TOKEN"] = "super-secret-token-value"
    try:
        c, _ = _client()
        raw = c.get("/api/connect").text
    finally:
        os.environ.pop("KSS_MCP_TOKEN", None)
    return ("super-secret-token-value" not in raw, "token not present in body")

def t_fonts_shape():
    c, _ = _client()
    b = c.get("/api/fonts").json()
    ok = ("fonts" in b and isinstance(b["fonts"], list)
          and all(isinstance(f, str) for f in b["fonts"]))
    return (ok, f"n={len(b.get('fonts', []))}")

def t_fonts_sorted_unique():
    c, _ = _client()
    fonts = c.get("/api/fonts").json()["fonts"]
    return (fonts == sorted(set(fonts)), "sorted + unique")

def t_fonts_empty_when_no_fc_list():
    import core
    saved = core.FC_LIST
    core.FC_LIST = None
    try:
        c, _ = _client()
        b = c.get("/api/fonts").json()
    finally:
        core.FC_LIST = saved
    # /api/fonts now returns {system, custom, fonts}; fc-list off -> system/fonts empty,
    # and no project is open in this harness so custom is empty too.
    return (b.get("system") == [] and b.get("fonts") == [] and b.get("custom") == [], b)

for n, f in list(globals().items()):
    if n.startswith("t_"): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, d in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"  -> {d}"))
print(f"\n{npass}/{len(results)} passed"); sys.exit(0 if npass == len(results) else 1)
