# tests/test_mcp_server.py — transport handshake smoke (skips if `mcp` SDK absent).
import os, sys, asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e: results.append((False, name, f"EXC {type(e).__name__}: {e}"))

try:
    import mcp  # noqa
    HAVE = True
except Exception:
    HAVE = False

def t_build_server_lists_tools():
    if not HAVE: return True, "SKIP: mcp not installed"
    from mcp_server.context import HeadlessContext
    from mcp_server.server import build_server
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    srv = build_server(ctx)
    tl = asyncio.run(srv.list_tools())
    tnames = {t.name for t in tl}
    needed = {"get_state", "set_group_style", "set_cue_style", "make_fade_tag", "set_globals",
              "generate_ass", "render_frame", "burn", "burn_status", "undo", "redo", "load_lyrics"}
    return (needed <= tnames), f"missing={needed - tnames}"

for n, f in [("build_server_lists_tools", t_build_server_lists_tools)]:
    check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, d in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"  -> {d}"))
print(f"\n{npass}/{len(results)} passed"); sys.exit(0 if npass == len(results) else 1)
