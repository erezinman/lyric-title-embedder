# tests/test_event_fields.py — section/color group fields + label/section/color setters.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine import io, mutations, model

results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))

def _proj():
    # minimal 2-word, 1-group project
    p = {"words": [{"text":"a","start":0.0,"end":1.0},{"text":"b","start":1.0,"end":2.0}],
         "globals": dict(model.BUILTIN) if hasattr(model, "BUILTIN") else {},
         "layout": [{"label":"G0","win_start":None,"win_end":None,"linger":None,"del":False,
                     "style":{},"animations":[],"suppress":[],
                     "lines":[{"toks":[{"ids":[0],"sep":"","del":False,"style":{}},
                                       {"ids":[1],"sep":"","del":False,"style":{}}]}]}]}
    return p

def t_setters_set_fields():
    p = _proj()
    mutations.set_event_label(p, 0, "Chorus")
    mutations.set_event_section(p, 0, "Chorus")
    mutations.set_event_color(p, 0, "#36E2FF")
    g = p["layout"][0]
    return (g["label"]=="Chorus" and g["section"]=="Chorus" and g["color"]=="#36E2FF"), str(g.get("section"))

def t_label_section_strip_newlines():
    p = _proj()
    mutations.set_event_label(p, 0, "two\nlines")
    mutations.set_event_section(p, 0, "x\r\ny")
    g = p["layout"][0]
    return ("\n" not in g["label"] and "\n" not in g["section"] and g["label"]=="two lines"), repr(g["label"])

def t_roundtrip_persists():
    p = _proj()
    mutations.set_event_section(p, 0, "Verse"); mutations.set_event_color(p, 0, "#FF3DA6")
    ser = io._ser_group(p["layout"][0]); back = io._apply_group(ser)
    return (back["section"]=="Verse" and back["color"]=="#FF3DA6"), str(ser.get("section"))

def t_roundtrip_absent_when_unset():
    p = _proj()
    ser = io._ser_group(p["layout"][0])
    # unset → emitted as "" (or omitted); apply yields "" not a crash
    back = io._apply_group(ser)
    return (back.get("section","")=="" and back.get("color","")==""), str({k:ser.get(k) for k in ("section","color")})

def t_ungroup_carries_fields():
    p = _proj()
    mutations.set_event_section(p, 0, "Bridge"); mutations.set_event_color(p, 0, "#FFC24B")
    # ungroup the single 2-tok line group → still one line, but exercises the copy path
    mutations.layout_ungroup(p, 0)
    g0 = p["layout"][0]
    return (g0.get("section")=="Bridge" and g0.get("color")=="#FFC24B"), str(g0.get("section"))

def t_bad_gi_noop():
    p = _proj()
    mutations.set_event_label(p, 9, "x")  # out of range → no raise, no change
    return (p["layout"][0]["label"]=="G0"), "ok"

# ── Daemon round-trip (Step 8): drive the tools through a real DaemonContext, assert
# serialize_cues→apply_cues preserves section/color and that _event_view/get_project
# expose them. Mirrors tests/test_anim_daemon.py's harness.

def _daemon_ctx():
    from daemon.hub import Hub
    from daemon.context import DaemonContext
    from mcp_server import tools as T
    hub = Hub(); ctx = DaemonContext(hub)
    ctx.session.set_project(_proj())
    return ctx, T

def t_daemon_tools_set_and_view():
    ctx, T = _daemon_ctx()
    T.set_event_label(ctx, 0, "Hook")
    T.set_event_section(ctx, 0, "Verse")
    v = T.set_event_color(ctx, 0, "#36E2FF")
    return (v["label"]=="Hook" and v["section"]=="Verse" and v["color"]=="#36E2FF"), str(v.get("section"))

def t_daemon_get_project_exposes():
    ctx, T = _daemon_ctx()
    T.set_event_section(ctx, 0, "Bridge"); T.set_event_color(ctx, 0, "#FFC24B")
    gp = T.get_project(ctx)
    g0 = gp["layout"][0]
    return (g0.get("section")=="Bridge" and g0.get("color")=="#FFC24B"), str(g0.get("section"))

def t_daemon_serialize_roundtrip():
    ctx, T = _daemon_ctx()
    T.set_event_section(ctx, 0, "Chorus"); T.set_event_color(ctx, 0, "#FF3DA6")
    ser = io.serialize_cues(ctx.session.project)
    # apply onto a fresh project of matching nwords
    p2 = _proj()
    ok = io.apply_cues(p2, ser)
    g0 = p2["layout"][0]
    return (ok and g0.get("section")=="Chorus" and g0.get("color")=="#FF3DA6"), str(g0.get("section"))

_active = {n: f for n, f in list(globals().items()) if n.startswith("t_") and callable(f)}
for n, f in sorted(_active.items()): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, dd in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"\n       -> {dd}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
