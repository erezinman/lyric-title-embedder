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

import engine
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

from mcp_server import tools

def t_get_state():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    s = tools.get_state(ctx)
    return (s["n_events"] == len(ctx.session.project["layout"]) and "globals" in s
            and isinstance(s["events"], list) and "win" in s["events"][0]), f"n={s['n_events']}"

def t_get_group_and_word():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    g = tools.get_group(ctx, 0)
    wid = g["lines"][0]["words"][0]["wid"]
    w = tools.get_word(ctx, wid)
    return (g["gi"] == 0 and "resolved_style" in g and w["wid"] == wid and "start" in w), f"wid={wid}"

def t_get_render_and_ass():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    r = tools.get_render(ctx); a = tools.get_ass(ctx)
    return (len(r) > 0 and "start" in r[0] and "[V4+ Styles]" in a and "Dialogue:" in a), f"groups={len(r)}"

def t_edit_group_style_and_undo():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    tools.set_group_style(ctx, 0, {"fontsize": 88, "border_style": 3})
    assert ctx.session.project["layout"][0]["style"]["fontsize"] == 88
    a = tools.get_ass(ctx); assert "Style: Box," in a
    tools.undo(ctx)
    return (ctx.session.project["layout"][0]["style"] == {}), "undo cleared group style"

def t_edit_cue_style_border_dropped():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    wid = ctx.session.project["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    tools.set_cue_style(ctx, [wid], {"primary": "#00FF00", "border_style": 3})
    st = tools.get_word(ctx, wid)["cue_style"]
    return (st == {"primary": "#00FF00"}), f"st={st}"

def t_fade_tag_make_and_props():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    tools.make_fade_tag(ctx, "out", [0, 1, 2])
    tools.set_fade_tag_props(ctx, "out", [0], trigger=99.0, dur=500)
    r = engine.project_to_render(ctx.session.project)
    foats = [w["fout_at"] for g in r for ln in g["lines"] for w in ln["words"] if w["fout_at"] is not None]
    return (any(abs(x - 99.0) < 1e-6 for x in foats)), f"foats~{[round(x,1) for x in foats][:4]}"

def t_layout_merge_split_redo():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    n0 = len(ctx.session.project["layout"])
    tools.merge_events(ctx, [0, 1]); n1 = len(ctx.session.project["layout"])
    tools.undo(ctx); n2 = len(ctx.session.project["layout"])
    tools.redo(ctx); n3 = len(ctx.session.project["layout"])
    return (n1 == n0 - 1 and n2 == n0 and n3 == n0 - 1), f"{n0},{n1},{n2},{n3}"

def t_delete_restore_words():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    tools.delete_words(ctx, [0]); d1 = tools.get_word(ctx, 0)["location"]
    tok_deleted = ctx.session.project["layout"][d1[0]]["lines"][d1[1]]["toks"][d1[2]]["del"]
    tools.restore_words(ctx, [0])
    tok_restored = ctx.session.project["layout"][d1[0]]["lines"][d1[1]]["toks"][d1[2]]["del"]
    return (tok_deleted is True and tok_restored is False), "delete/restore ok"

def t_globals_tools():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    tools.set_globals(ctx, {"font": "Arial", "fontsize": 50})
    g = tools.get_globals(ctx)
    return (g["font"] == "Arial" and g["fontsize"] == 50), f"g={g['font']}/{g['fontsize']}"

def t_project_save_load_roundtrip():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    tools.set_group_style(ctx, 0, {"font": "Arial"}); tools.set_globals(ctx, {"fontsize": 77})
    path = "/tmp/_mcp_proj.json"; tools.save_project(ctx, path)
    ctx2 = HeadlessContext(); ctx2.load_lyrics("aligned_lyrics.json")
    tools.load_project(ctx2, path)
    return (ctx2.session.project["layout"][0]["style"].get("font") == "Arial"
            and tools.get_globals(ctx2)["fontsize"] == 77), "roundtrip ok"

def t_generate_ass_to_file_and_text():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    txt = tools.generate_ass(ctx)
    p = "/tmp/_mcp.ass"; tools.generate_ass(ctx, p)
    return ("Dialogue:" in txt and os.path.isfile(p) and open(p).read().count("Dialogue:") > 0), "ass ok"

def t_render_frame_png():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    ctx.set_globals({"play_w": 480, "play_h": 270})
    png = tools.render_frame(ctx, 13.0)
    return (isinstance(png, (bytes, bytearray)) and bytes(png[:8]) == b"\x89PNG\r\n\x1a\n"), f"len={len(png)}"

def t_burn_job_completes():
    import subprocess, core, time as _t
    subprocess.run([core.FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
                    "-i", "color=c=navy:s=320x180:d=1", "/tmp/_mcp_in.mp4"], check=True)
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json"); ctx.set_globals({"play_w": 320, "play_h": 180})
    job = tools.burn(ctx, "/tmp/_mcp_out.mp4", video_in="/tmp/_mcp_in.mp4")
    jid = job["job_id"]; st = None
    for _ in range(200):
        st = tools.burn_status(ctx, jid)
        if st["done"]: break
        _t.sleep(0.1)
    return (st and st["done"] and st["ok"] and os.path.isfile("/tmp/_mcp_out.mp4")), f"st={st}"

def t_regress_load_project_atomic_mismatch():
    import json
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json"); ctx.set_globals({"fontsize": 64})
    d = {"globals_style": {"fontsize": 999},
         "cues_v2": {"nwords": 123456789, "layout": [], "fin_tags": [], "fout_tags": [],
                     "globals": {}, "palette": []}}
    p = "/tmp/_regress_bad_proj.json"; json.dump(d, open(p, "w"))
    before = ctx.get_globals()["fontsize"]; raised = False
    try: tools.load_project(ctx, p)
    except Exception: raised = True
    after = ctx.get_globals()["fontsize"]
    return (raised and before == 64 and after == 64), f"raised={raised} {before}->{after}"

def t_set_group_fade_tool_returns_fade_overrides():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    view = tools.set_group_fade(ctx, 0, {"fade_in_ms": 400})
    return (view["fade_overrides"] == {"fade_in_ms": 400}, view.get("fade_overrides"))

def t_regress_fade_tag_props_rejects_cross_and_ungrouped():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    tools.make_fade_tag(ctx, "out", [0, 1]); tools.make_fade_tag(ctx, "out", [5, 6])
    def raises(ids):
        try: tools.set_fade_tag_props(ctx, "out", ids, dur=100); return False
        except ValueError: return True
    return (raises([0, 5]) and raises([99])), "cross+ungrouped rejected"

for n, f in list(globals().items()):
    if n.startswith("t_"): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, d in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"  -> {d}"))
print(f"\n{npass}/{len(results)} passed"); sys.exit(0 if npass == len(results) else 1)
