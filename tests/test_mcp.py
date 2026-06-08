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
    # REWRITE (animations migration): the make_fade_tag / set_fade_tag_props MCP tools
    # are removed. Fades are now animations: a legacy fout-tag + trigger migrates (on
    # render) into a fade_out alpha animation that begins at the trigger time. Same
    # intent, but the legacy tag is now planted on the project model directly and the
    # assertion reads the resolved per-word "anims".
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    ctx.session.project["fout_tags"] = [{"ids": {0, 1, 2}, "trigger": 99.0}]
    r = engine.project_to_render(ctx.session.project)
    foats = [a["segments"][0]["start_s"]
             for g in r for ln in g["lines"] for w in ln["words"]
             for a in w.get("anims", [])
             if a["channel"] == "alpha" and a["name"] == "fade_out"]
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

def t_group_fade_migrates_to_group_alpha_anim():
    # REWRITE (animations migration): the set_group_fade tool and fade_overrides view
    # field are removed. A legacy group.fade override migrates (on render) into a
    # group-scope alpha "appearance" animation. Assert that equivalent.
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    ctx.session.project["layout"][0]["fade"] = {"fade_in_ms": 400}
    engine.migrate_project(ctx.session.project)     # in-place conversion (load path)
    anims = ctx.session.project["layout"][0].get("animations", [])
    appear = [a for a in anims if a["channel"] == "alpha" and a.get("name") == "appearance"]
    dur = (appear[0]["segments"][0]["t1"]["offset"] - appear[0]["segments"][0]["t0"]["offset"]) if appear else None
    return (bool(appear) and dur == 400, {"n": len(appear), "dur": dur})

def t_get_state_event_includes_animations():
    # REWRITE (animations migration): get_state events no longer carry fade_overrides;
    # they expose the new per-group animations carrier instead.
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    ctx.session.project["layout"][0]["fade"] = {"fade_in_ms": 400}
    engine.migrate_project(ctx.session.project)     # in-place conversion (load path)
    st = tools.get_state(ctx)
    ev0 = st["events"][0]
    return ("animations" in ev0 and "fade_overrides" not in ev0, sorted(ev0.keys()))

def t_get_project_minimal_shape():
    import json
    from engine.model import STYLE_KEYS
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    engine.migrate_project(ctx.session.project)     # migrate to the new carriers
    pj = tools.get_project(ctx)
    keys = set(pj.keys())
    # REWRITE (animations migration): get_project now exposes anim_tags + per-group
    # animations/suppress instead of fin_tags/fout_tags/group.fade.
    ok = (keys == {"words", "layout", "anim_tags", "globals", "global_style", "placement", "video",
                   "can_undo", "can_redo"}
          and set(pj["global_style"].keys()) == set(STYLE_KEYS)
          and "use_pos" in pj["placement"]   # exposed so clients can't misreport \pos state
          and "pos" in pj["placement"]
          and "animations" in pj["layout"][0] and "suppress" in pj["layout"][0]
          and "fade" not in pj["layout"][0] and "style" in pj["layout"][0]
          # REWRITE (animations AD-GET-01): each token now also carries its per-cue
          # flat resolved animation list for the UI/strips.
          and set(pj["layout"][0]["lines"][0]["toks"][0].keys())
              == {"ids", "sep", "del", "style", "anims_resolved"})
    json.dumps(pj)
    return (ok, sorted(keys))

def t_event_view_merged_token_text():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    tools.merge_words(ctx, 0, 0, 1, sep=" ")    # merge token ti=1 into ti=0 on line 0 of group 0
    grp = tools.get_group(ctx, 0)
    w0 = grp["lines"][0]["words"][0]
    return (len(w0["ids"]) == 2 and " " in w0["text"], w0)

def t_headless_globals_have_no_fade_ms_or_wrap_style():
    g = HeadlessContext().get_globals()
    return ("fade_ms" not in g and "wrap_style" not in g, sorted(g.keys()))

def t_headless_cfg_has_no_fade_ms_or_wrap_style():
    c = HeadlessContext().cfg()
    return ("fade_ms" not in c and "wrap_style" not in c, sorted(c.keys()))

def t_set_word_times_tool():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    tools.set_word_times(ctx, [{"wid": 0, "start": 3.0, "end": 3.5}])
    w = ctx.session.project["words"][0]
    return (abs(w["start"] - 3.0) < 1e-9 and abs(w["end"] - 3.5) < 1e-9, w)

def t_set_word_text_tool():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    tools.set_word_text(ctx, 0, "Zzz")
    return (ctx.session.project["words"][0]["text"] == "Zzz", ctx.session.project["words"][0]["text"])

def t_set_video_sets_and_shows_in_project():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    tools.set_video(ctx, "/tmp/clip.mp4")
    # `video` is now an object {path,w,h,duration_s} (probe meta rides alongside the
    # path); meta is null here since /tmp/clip.mp4 isn't a real file to probe.
    v = tools.get_project(ctx)["video"]
    return (ctx.video_path() == "/tmp/clip.mp4"
            and isinstance(v, dict) and v["path"] == "/tmp/clip.mp4"
            and set(v) == {"path", "w", "h", "duration_s"}), ctx.video_path()

def t_set_video_undo_reverts():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    tools.set_video(ctx, "/tmp/clip.mp4")
    tools.undo(ctx)
    return (ctx.video_path() is None), ctx.video_path()

def t_set_video_clear_with_none():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    tools.set_video(ctx, "/tmp/clip.mp4")
    tools.set_video(ctx, None)
    return (ctx.video_path() is None and tools.get_project(ctx)["video"] is None), "cleared"

def t_set_video_redo_restores():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    tools.set_video(ctx, "/tmp/clip.mp4")
    tools.undo(ctx); tools.redo(ctx)
    return (ctx.video_path() == "/tmp/clip.mp4"), ctx.video_path()

def t_set_video_bad_type_raises():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    try:
        tools.set_video(ctx, 123); return (False, "no raise")
    except ValueError:
        return (True, "raised")

def t_set_video_no_undo_step_on_noop():
    # clearing an already-clear video must not create a history step
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    before = len(ctx.session._undo)
    tools.set_video(ctx, None)
    return (len(ctx.session._undo) == before), f"undo depth {len(ctx.session._undo)}"

for n, f in list(globals().items()):
    if n.startswith("t_"): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, d in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"  -> {d}"))
print(f"\n{npass}/{len(results)} passed"); sys.exit(0 if npass == len(results) else 1)
