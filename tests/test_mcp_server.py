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
    # REWRITE (animations migration): make_fade_tag is removed from the tool surface
    # (the new animation tools land in a later phase); assert a surviving editing tool.
    needed = {"get_state", "set_group_style", "set_cue_style", "set_layout_props", "set_globals",
              "generate_ass", "render_frame", "burn", "burn_status", "undo", "redo", "load_lyrics"}
    return (needed <= tnames), f"missing={needed - tnames}"

def t_http_serve_and_connect():
    if not HAVE: return True, "SKIP: mcp not installed"
    import time, asyncio
    from mcp_server.context import HeadlessContext
    from mcp_server.server import serve_http
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    port = 8791
    stop = serve_http(ctx, host="127.0.0.1", port=port, token=None, in_thread=True)
    time.sleep(1.5)
    try:
        from mcp.client.sse import sse_client
        from mcp.client.session import ClientSession
        async def go():
            async with sse_client(f"http://127.0.0.1:{port}/sse") as (r, w):
                async with ClientSession(r, w) as s:
                    await s.initialize()
                    tl = await s.list_tools()
                    return {t.name for t in tl.tools}
        names = asyncio.new_event_loop().run_until_complete(go())
        return ("get_state" in names and "set_group_style" in names), f"tools={len(names)}"
    finally:
        stop()

for n, f in [("build_server_lists_tools", t_build_server_lists_tools),
             ("http_serve_and_connect", t_http_serve_and_connect)]:
    check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, d in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"  -> {d}"))
print(f"\n{npass}/{len(results)} passed"); sys.exit(0 if npass == len(results) else 1)
