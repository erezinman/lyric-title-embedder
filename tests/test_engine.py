# tests/test_engine.py — headless engine/controller unit tests (no Tk display).
import os, sys, json, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

CFG = {"json_path": "aligned_lyrics.json", "skip_dashes": True, "group_by": "section",
       "font": "DejaVu Sans", "fontsize": 64, "bold": True, "align": 2, "fade_ms": 250,
       "play_w": 1920, "play_h": 1080, "margin_l": 80, "margin_r": 80, "margin_v": 60,
       "primary_color": "#FFFFFF", "outline_color": "#000000", "back_color": "#000000",
       "back_alpha": "80", "border_style": 1, "outline_w": 3, "shadow": 0, "wrap_style": 2}

results = []
def check(name, fn):
    try:
        ok, detail = fn(); results.append((ok, name, detail))
    except Exception as e:
        results.append((False, name, f"EXC {type(e).__name__}: {e}"))

# Import the CURRENT location for the baseline; later tasks repoint these imports.
import karaoke_subtitle_gui as m
from engine import mutations as mut
from controller import Session

def t_make_project():
    p = m.make_project_v2(CFG)
    return (len(p["words"]) > 50 and len(p["layout"]) > 0), f"words={len(p['words'])} layout={len(p['layout'])}"

def t_render_groups():
    p = m.make_project_v2(CFG); g = m.project_to_render_v2(p)
    return (len(g) > 0 and all("lines" in x for x in g)), f"groups={len(g)}"

def t_build_events():
    p = m.make_project_v2(CFG); g = m.project_to_render_v2(p)
    text, n = m.build_ass_v2(CFG, g)
    return (n == len(g) and "[V4+ Styles]" in text and text.count("Dialogue:") == len(g)), f"n={n}"

def t_serialize_roundtrip():
    p = m.make_project_v2(CFG)
    p["layout"][0]["linger"] = 3.14          # mutate so the roundtrip must carry something
    d = m.serialize_cues_v2(p)
    p2 = m.make_project_v2(CFG); ok = m.apply_cues_v2(p2, d)
    same = (ok and len(p2["layout"]) == len(p["layout"])
            and abs((p2["layout"][0].get("linger") or 0) - 3.14) < 1e-9)
    return same, f"applied={ok} linger={p2['layout'][0].get('linger')}"

def t_style_roundtrip():
    p = m.make_project_v2(CFG)
    p["layout"][0]["style"] = {"font": "Arial", "fontsize": 80}
    p["layout"][0]["lines"][0]["toks"][0]["style"] = {"primary": "#FF0000"}
    d = m.serialize_cues_v2(p)
    p2 = m.make_project_v2(CFG); m.apply_cues_v2(p2, d)
    g_ok = p2["layout"][0]["style"] == {"font": "Arial", "fontsize": 80}
    c_ok = p2["layout"][0]["lines"][0]["toks"][0]["style"] == {"primary": "#FF0000"}
    return (g_ok and c_ok), f"group={g_ok} cue={c_ok}"

def t_set_group_style():
    p = m.make_project_v2(CFG)
    mut.set_group_style(p, 0, {"font": "Arial", "fontsize": 90})
    mut.set_group_style(p, 0, {"font": None})            # clear -> inherit
    return (p["layout"][0]["style"] == {"fontsize": 90}), f"{p['layout'][0]['style']}"

def t_set_cue_style_border_ignored():
    p = m.make_project_v2(CFG)
    wid = p["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    mut.set_cue_style(p, {wid}, {"primary": "#00FF00", "border_style": 3})
    st = p["layout"][0]["lines"][0]["toks"][0]["style"]
    return (st == {"primary": "#00FF00"}), f"{st}"   # border_style dropped (C1)

def t_engine_no_tk():
    import importlib, engine, controller
    importlib.reload(engine)
    # engine/controller themselves must not pull tkinter into their namespace:
    src_ok = True
    for modname in ("engine.model", "engine.render", "engine.ass", "engine.io",
                    "engine.mutations", "engine.ffmpeg", "controller"):
        mod = sys.modules.get(modname)
        if mod and "tkinter" in getattr(mod, "__dict__", {}):
            src_ok = False
    return (src_ok), f"tkinter_in_engine_ns={not src_ok} (loaded elsewhere ok)"

def t_build_two_styles_for_boxmode():
    p = m.make_project_v2(CFG)
    mut.set_group_style(p, 1, {"border_style": 3})     # second event = opaque box
    g = m.project_to_render_v2(p); text, n = m.build_ass_v2(CFG, g)
    n_styles = text.count("\nStyle: ")
    return (n_styles == 2 and "Style: Box," in text), f"n_styles={n_styles}"

def t_build_inline_cue_color():
    p = m.make_project_v2(CFG)
    wid = p["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    mut.set_cue_style(p, {wid}, {"primary": "#FF0000"})
    g = m.project_to_render_v2(p); text, n = m.build_ass_v2(CFG, g)
    # #FF0000 -> ASS &H0000FF& on \1c
    return ("\\1c&H0000FF&" in text), "missing inline 1c override"

def t_regress_do_noop_preserves_redo():
    p = m.make_project_v2(CFG); s = Session(p)
    s.do("set_global", "linger", 1.5)       # real edit
    s.undo()                                 # redo stack now holds it
    s.do("layout_merge", {0, 2})             # rejected (non-adjacent) -> must not clear redo
    s.do("make_tag", "fin_tags", set())      # empty -> no-op -> must not clear redo
    s.redo()                                 # should restore the real edit
    return (abs(s.project["globals"]["linger"] - 1.5) < 1e-9), f"linger={s.project['globals']['linger']}"

def t_regress_build_delta_resets_baseline():
    p = m.make_project_v2(CFG)
    # Find an event that has >1 word so the reset-to-baseline is observable
    ev_idx = next(
        i for i, g in enumerate(p["layout"])
        if sum(len(tok["ids"]) for ln in g["lines"] for tok in ln["toks"]) > 1
    )
    wid = p["layout"][ev_idx]["lines"][0]["toks"][0]["ids"][0]
    mut.set_cue_style(p, {wid}, {"primary": "#FF0000"})
    g = m.project_to_render_v2(p); text, _ = m.build_ass_v2(CFG, g)
    # Find the Dialogue line for this event
    diag_lines = [l for l in text.splitlines() if l.startswith("Dialogue:")]
    ev_line = diag_lines[ev_idx]
    return ("1c&H0000FF&" in ev_line and "1c&HFFFFFF&" in ev_line), "override + reset both present"

for name, fn in list(globals().items()):
    if name.startswith("t_"): check(name, fn)
npass = sum(1 for ok, *_ in results if ok)
for ok, name, detail in results:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + ("" if ok else f"   -> {detail}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
