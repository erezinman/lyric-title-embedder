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

for name, fn in list(globals().items()):
    if name.startswith("t_"): check(name, fn)
npass = sum(1 for ok, *_ in results if ok)
for ok, name, detail in results:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + ("" if ok else f"   -> {detail}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
