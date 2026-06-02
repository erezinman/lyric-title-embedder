# tests/test_mcp_ui.py — UIContext marshaling + live update (needs DISPLAY).
import os, sys, threading, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import karaoke_subtitle_gui as v2
from mcp_server.context import UIContext

app = v2.AppV2()
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

for n, f in [("ui_run_marshals_and_updates", t_ui_run_marshals_and_updates),
             ("ui_globals_write_tkvars", t_ui_globals_write_tkvars)]:
    check(n, f); pump(3)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, d in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"  -> {d}"))
print(f"\n{npass}/{len(results)} passed"); app.destroy(); sys.exit(0 if npass == len(results) else 1)
