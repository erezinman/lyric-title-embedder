# tests/test_mcp_ui.py — UIContext marshaling + live update (needs DISPLAY).
import os, sys, threading, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import karaoke_subtitle_gui as v2
from mcp_server.context import UIContext

app = v2.AppV2()
app.withdraw()  # headless: keep the window off-screen during test runs
def pump(n=10):
    for _ in range(n): app.update(); time.sleep(0.02)
pump(14); time.sleep(0.3); pump(8)
ed = app.open_editor(); pump(4)
ctx = UIContext(app)
results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e: results.append((False, name, f"EXC {type(e).__name__}: {e}"))

def t_ui_run_marshals_and_updates():
    box = {}
    def worker():
        box["style"] = ctx.run(lambda: (ctx.session.do("set_group_style", 0, {"fontsize": 99}),
                                          ctx.session.project["layout"][0]["style"])[1])
    th = threading.Thread(target=worker); th.start()
    for _ in range(60):
        app.update(); time.sleep(0.02)
        if not th.is_alive(): break
    th.join(2)
    applied = app._project["layout"][0]["style"].get("fontsize") == 99
    return (applied and box.get("style", {}).get("fontsize") == 99), f"style={box.get('style')}"

def t_ui_globals_write_tkvars():
    ctx.set_globals({"fontsize": 72})
    pump(3)
    return (app.size_var.get() == 72 and ctx.cfg()["fontsize"] == 72), f"size={app.size_var.get()}"

def t_ui_http_live_update():
    import time, asyncio, threading
    from mcp_server.context import UIContext
    from mcp_server.server import serve_http
    uctx = UIContext(app)
    port = 8792
    stop = serve_http(uctx, host="127.0.0.1", port=port, in_thread=True)
    out = {}
    def client():
        from mcp.client.sse import sse_client
        from mcp.client.session import ClientSession
        async def go():
            async with sse_client(f"http://127.0.0.1:{port}/sse") as (r, w):
                async with ClientSession(r, w) as s:
                    await s.initialize()
                    await s.call_tool("set_group_style", {"gi": 0, "partial": {"fontsize": 123}})
        asyncio.new_event_loop().run_until_complete(go()); out["done"] = True
    th = threading.Thread(target=client); th.start()
    for _ in range(200):                       # pump main loop so the marshaled op runs
        app.update(); time.sleep(0.02)
        if out.get("done"): break
    th.join(3); stop()
    return (app._project["layout"][0]["style"].get("fontsize") == 123), f"style={app._project['layout'][0]['style']}"

def t_ui_render_frame_marshaled():
    import threading, time
    from mcp_server import tools
    uctx = UIContext(app)
    out = {}
    def worker():
        try: out["png"] = tools.render_frame(uctx, 13.0)
        except BaseException as e: out["err"] = f"{type(e).__name__}: {e}"
    th = threading.Thread(target=worker); th.start()
    for _ in range(150):
        app.update(); time.sleep(0.02)
        if not th.is_alive(): break
    th.join(3)
    png = out.get("png")
    return (isinstance(png, (bytes, bytearray)) and bytes(png[:4]) == b"\x89PNG"), f"err={out.get('err')} got={type(png).__name__}"

for n, f in [("ui_run_marshals_and_updates", t_ui_run_marshals_and_updates),
             ("ui_globals_write_tkvars", t_ui_globals_write_tkvars),
             ("ui_http_live_update", t_ui_http_live_update),
             ("ui_render_frame_marshaled", t_ui_render_frame_marshaled)]:
    check(n, f); pump(3)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, d in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"  -> {d}"))
print(f"\n{npass}/{len(results)} passed"); app.destroy(); sys.exit(0 if npass == len(results) else 1)
