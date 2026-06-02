# tests/test_mcp.py — headless MCP tool/context tests (no transport, no Tk).
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
results = []
def check(name, fn):
    try:
        ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}"))

from mcp_server.context import HeadlessContext, DEFAULT_GLOBALS

def t_headless_loads_and_cfg():
    ctx = HeadlessContext()
    ctx.load_lyrics("aligned_lyrics.json")
    cfg = ctx.cfg()
    return (ctx.session.project is not None and cfg["fontsize"] == DEFAULT_GLOBALS["fontsize"]
            and "play_w" in cfg), f"events={len(ctx.session.project['layout'])}"

def t_headless_globals_get_set():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    ctx.set_globals({"fontsize": 90, "primary": "#FF0000"})
    g = ctx.get_globals()
    return (g["fontsize"] == 90 and g["primary"] == "#FF0000" and ctx.cfg()["primary_color"] == "#FF0000"), f"g={g['fontsize']}"

def t_headless_run_is_direct():
    ctx = HeadlessContext()
    return (ctx.run(lambda: 41 + 1) == 42), "run direct"

for n, f in list(globals().items()):
    if n.startswith("t_"): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, d in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"  -> {d}"))
print(f"\n{npass}/{len(results)} passed"); sys.exit(0 if npass == len(results) else 1)
