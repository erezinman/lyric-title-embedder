# tests/test_engine_build_io.py — build_ass + serialize/apply (io) category tests.
# Category: build_ass + io.  Does NOT overlap t_build_* / t_style_roundtrip in test_engine.py.
import os, sys, copy, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import engine
from engine import mutations as mut
import core

CFG = {"json_path": "aligned_lyrics.json", "skip_dashes": True, "group_by": "section",
       "font": "DejaVu Sans", "fontsize": 64, "bold": True, "align": 2, "fade_ms": 250,
       "play_w": 1920, "play_h": 1080, "margin_l": 80, "margin_r": 80, "margin_v": 60,
       "primary_color": "#FFFFFF", "outline_color": "#000000", "back_color": "#000000",
       "back_alpha": "80", "border_style": 1, "outline_w": 3, "shadow": 0, "wrap_style": 2}

SUSPECTED_BUGS = {}  # name -> 1-line rationale

results = []
def check(name, fn):
    try:
        ok, detail = fn()
        results.append((ok, name, detail))
    except Exception as e:
        import traceback
        results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))

def fresh():
    """Return a fresh project + render-groups pair."""
    p = engine.make_project(CFG)
    g = engine.project_to_render(p)
    return p, g

# ─── build_ass tests ───────────────────────────────────────────────────────────

def t_default_cfg_exactly_one_style():
    """Default CFG → exactly 1 Style: line named 'Default'; Dialogue count == group count."""
    p, groups = fresh()
    text, n = engine.build_ass(CFG, groups)
    n_styles = text.count("\nStyle: ")
    has_default = "Style: Default," in text
    n_dialogues = text.count("Dialogue:")
    ok = (n_styles == 1 and has_default and n_dialogues == n and n == len(groups))
    return ok, f"n_styles={n_styles} has_default={has_default} n_dialogues={n_dialogues} n_groups={len(groups)}"

def t_balanced_braces():
    """Every Dialogue text has balanced { } brackets (no orphan inline tags)."""
    p, groups = fresh()
    text, _ = engine.build_ass(CFG, groups)
    bad = []
    for line in text.splitlines():
        if not line.startswith("Dialogue:"):
            continue
        # Text is the 10th comma-separated field (0-indexed 9)
        parts = line.split(",", 9)
        ev_text = parts[9] if len(parts) > 9 else ""
        opens = ev_text.count("{")
        closes = ev_text.count("}")
        if opens != closes:
            bad.append(f"open={opens} close={closes}")
    ok = len(bad) == 0
    return ok, f"unbalanced_events={bad[:3]}"

def t_group_border_style_3_emits_box_style():
    """Setting border_style=3 on one group → 2 Style: lines including 'Style: Box,'
    and that Dialogue line references 'Box' style, others reference 'Default'."""
    p, _ = fresh()
    # Make sure there are at least 2 groups
    if len(p["layout"]) < 2:
        return False, "too few groups to test"
    mut.set_group_style(p, 1, {"border_style": 3})
    groups = engine.project_to_render(p)
    text, n = engine.build_ass(CFG, groups)
    n_styles = text.count("\nStyle: ")
    has_box = "Style: Box," in text
    has_default = "Style: Default," in text
    # Dialogue format: "Dialogue: Layer,Start,End,StyleName,Name,..."
    # Style name is the 4th comma-separated field (index 3)
    diag_lines = [l for l in text.splitlines() if l.startswith("Dialogue:")]
    def _diag_style(line):
        return line.split(",", 9)[3]
    box_event_exists = any(_diag_style(l) == "Box" for l in diag_lines)
    default_event_exists = any(_diag_style(l) == "Default" for l in diag_lines)
    ok = (n_styles == 2 and has_box and has_default and box_event_exists and default_event_exists)
    return ok, f"n_styles={n_styles} has_box={has_box} has_default={has_default} box_ev={box_event_exists}"

def t_non_standard_border_style_emits_Bn():
    """Setting border_style=2 on a group → a 'B2' style line emitted and Dialogue references it."""
    p, _ = fresh()
    mut.set_group_style(p, 0, {"border_style": 2})
    groups = engine.project_to_render(p)
    text, _ = engine.build_ass(CFG, groups)
    has_b2 = "Style: B2," in text
    diag_lines = [l for l in text.splitlines() if l.startswith("Dialogue:")]
    ev_uses_b2 = any(l.split(",", 9)[3] == "B2" for l in diag_lines)
    ok = has_b2 and ev_uses_b2
    return ok, f"has_B2_style={has_b2} dialogue_ref_B2={ev_uses_b2}"

def t_inline_color_red_bgr_conversion():
    """Cue primary=#FF0000 → inline tag \\1c&H0000FF& (red→BGR)."""
    p, _ = fresh()
    wid = p["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    mut.set_cue_style(p, {wid}, {"primary": "#FF0000"})
    groups = engine.project_to_render(p)
    text, _ = engine.build_ass(CFG, groups)
    ok = "\\1c&H0000FF&" in text
    return ok, "missing \\1c&H0000FF& for #FF0000"

def t_inline_color_green_bgr_conversion():
    """Cue primary=#00FF00 → inline tag \\1c&H00FF00& (green is symmetric)."""
    p, _ = fresh()
    wid = p["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    mut.set_cue_style(p, {wid}, {"primary": "#00FF00"})
    groups = engine.project_to_render(p)
    text, _ = engine.build_ass(CFG, groups)
    ok = "\\1c&H00FF00&" in text
    return ok, "missing \\1c&H00FF00& for #00FF00"

def t_inline_color_arbitrary_bgr():
    """Cue primary=#112233 → inline tag \\1c&H332211& (full channel swap)."""
    p, _ = fresh()
    wid = p["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    mut.set_cue_style(p, {wid}, {"primary": "#112233"})
    groups = engine.project_to_render(p)
    text, _ = engine.build_ass(CFG, groups)
    ok = "\\1c&H332211&" in text
    return ok, "missing \\1c&H332211& for #112233"

def t_running_delta_reset_after_override():
    """word0 overrides primary, word1 has no override in same event → word1 must re-emit
    the baseline primary (delta reset). Both override and reset colors appear in that Dialogue."""
    p, _ = fresh()
    g0 = p["layout"][0]
    lines = g0["lines"]
    # Get first two tokens in the first group (may span lines)
    toks_flat = [tok for ln in lines for tok in ln["toks"]]
    if len(toks_flat) < 2:
        return False, "group 0 has fewer than 2 tokens"
    wid0 = toks_flat[0]["ids"][0]
    # Set word0 override to red
    mut.set_cue_style(p, {wid0}, {"primary": "#FF0000"})
    # word1 gets no override → should reset to baseline (#FFFFFF → &HFFFFFF&)
    groups = engine.project_to_render(p)
    text, _ = engine.build_ass(CFG, groups)
    # Find the Dialogue for group 0 (first one)
    diag_lines = [l for l in text.splitlines() if l.startswith("Dialogue:")]
    first_diag = diag_lines[0]
    has_override = "\\1c&H0000FF&" in first_diag    # #FF0000 -> BGR 0000FF
    has_reset = "\\1c&HFFFFFF&" in first_diag       # #FFFFFF -> BGR FFFFFF
    ok = has_override and has_reset
    return ok, f"has_override={has_override} has_reset={has_reset}"

def t_running_delta_no_reemit_when_same():
    """Two consecutive words with the same override → tag only emitted once (delta suppressed)."""
    p, _ = fresh()
    g0 = p["layout"][0]
    toks_flat = [tok for ln in g0["lines"] for tok in ln["toks"]]
    if len(toks_flat) < 2:
        return False, "group 0 has fewer than 2 tokens"
    wid0 = toks_flat[0]["ids"][0]
    wid1 = toks_flat[1]["ids"][0]
    # Both words get the same non-default color
    mut.set_cue_style(p, {wid0, wid1}, {"primary": "#FF0000"})
    groups = engine.project_to_render(p)
    text, _ = engine.build_ass(CFG, groups)
    diag_lines = [l for l in text.splitlines() if l.startswith("Dialogue:")]
    first_diag = diag_lines[0]
    # Should appear exactly once (word0 emits it, word1 does not since same as prev)
    count = first_diag.count("\\1c&H0000FF&")
    ok = count == 1
    return ok, f"\\1c&H0000FF& appeared {count} times in first Dialogue (expected 1)"

def t_per_cue_fontsize_tag():
    """Per-cue fontsize override emits \\fsN inline tag."""
    p, _ = fresh()
    toks_flat = [tok for ln in p["layout"][0]["lines"] for tok in ln["toks"]]
    wid = toks_flat[0]["ids"][0]
    mut.set_cue_style(p, {wid}, {"fontsize": 99})
    groups = engine.project_to_render(p)
    text, _ = engine.build_ass(CFG, groups)
    ok = "\\fs99" in text
    return ok, "missing \\fs99 for fontsize=99 cue override"

def t_per_cue_bold_tag():
    """Per-cue bold=False override emits \\b0 tag (toggling off the global bold=True)."""
    p, _ = fresh()
    toks_flat = [tok for ln in p["layout"][0]["lines"] for tok in ln["toks"]]
    wid = toks_flat[0]["ids"][0]
    mut.set_cue_style(p, {wid}, {"bold": False})
    groups = engine.project_to_render(p)
    text, _ = engine.build_ass(CFG, groups)
    ok = "\\b0" in text
    return ok, "missing \\b0 for bold=False cue override against global bold=True"

def t_per_cue_outline_w_tag():
    """Per-cue outline_w override emits \\bordN inline tag."""
    p, _ = fresh()
    toks_flat = [tok for ln in p["layout"][0]["lines"] for tok in ln["toks"]]
    wid = toks_flat[0]["ids"][0]
    mut.set_cue_style(p, {wid}, {"outline_w": 7})
    groups = engine.project_to_render(p)
    text, _ = engine.build_ass(CFG, groups)
    ok = "\\bord7" in text
    return ok, "missing \\bord7 for outline_w=7 cue override"

def t_per_cue_shadow_tag():
    """Per-cue shadow override emits \\shadN inline tag."""
    p, _ = fresh()
    toks_flat = [tok for ln in p["layout"][0]["lines"] for tok in ln["toks"]]
    wid = toks_flat[0]["ids"][0]
    # CFG has shadow=0; override to 2 to differ from baseline
    mut.set_cue_style(p, {wid}, {"shadow": 2})
    groups = engine.project_to_render(p)
    text, _ = engine.build_ass(CFG, groups)
    ok = "\\shad2" in text
    return ok, "missing \\shad2 for shadow=2 cue override"

def t_fade_in_emits_alpha_and_transform():
    """Default fade_in_ms=250 → each word event contains both \\alpha&HFF& and \\t(...\\alpha&H00&)."""
    p, groups = fresh()
    text, _ = engine.build_ass(CFG, groups)
    # Check the first Dialogue line
    diag_lines = [l for l in text.splitlines() if l.startswith("Dialogue:")]
    first = diag_lines[0]
    has_alpha_ff = "\\alpha&HFF&" in first
    has_alpha_00 = "\\alpha&H00&" in first
    has_t_transform = "\\t(" in first and "\\alpha&H00&" in first
    ok = has_alpha_ff and has_alpha_00 and has_t_transform
    return ok, f"alpha_FF={has_alpha_ff} alpha_00={has_alpha_00} t_transform={has_t_transform}"

def t_fade_out_emits_fout_transform():
    """Adding a fout_tag → Dialogue contains \\t(...\\alpha&HFF&) (fade-out transform)."""
    p, _ = fresh()
    g0 = p["layout"][0]
    toks_flat = [tok for ln in g0["lines"] for tok in ln["toks"]]
    wid = toks_flat[0]["ids"][0]
    mut.make_tag(p, "fout_tags", {wid})
    # Set explicit trigger (no dur — tags no longer carry dur)
    mut.set_tag_props(p, "fout_tags", 0, trigger=5.0)
    groups = engine.project_to_render(p)
    text, _ = engine.build_ass(CFG, groups)
    diag_lines = [l for l in text.splitlines() if l.startswith("Dialogue:")]
    first = diag_lines[0]
    # The transform should fade TO opaque (HFF)
    has_fout = "\\alpha&HFF&" in first and "\\t(" in first
    ok = has_fout
    return ok, f"fout_transform_present={has_fout} in first dialogue"

def t_no_pos_tag_by_default():
    """No cfg['pos'] → no \\pos( in output."""
    p, groups = fresh()
    text, _ = engine.build_ass(CFG, groups)
    ok = "\\pos(" not in text
    return ok, "\\pos( appeared in output without cfg['pos']"

def t_pos_tag_when_cfg_pos_set():
    """cfg with 'pos' key → every Dialogue text starts with {\\pos(x,y)}."""
    cfg2 = {**CFG, "pos": (100, 200)}
    p = engine.make_project(cfg2)
    groups = engine.project_to_render(p)
    text, _ = engine.build_ass(cfg2, groups)
    diag_lines = [l for l in text.splitlines() if l.startswith("Dialogue:")]
    ok = all("{\\pos(100,200)}" in l for l in diag_lines)
    return ok, f"not all Dialogues have pos tag; first={diag_lines[0][:120] if diag_lines else 'none'}"

def t_multiline_event_emits_backslash_N():
    """A group with >1 line emits \\N between lines in the Dialogue text."""
    p, _ = fresh()
    # Find a group that has at least 2 lines; if none, create one by splitting
    target_gi = None
    for gi, g in enumerate(p["layout"]):
        if len(g["lines"]) >= 2:
            target_gi = gi
            break
    if target_gi is None:
        # Merge two groups so we have multiple lines
        if len(p["layout"]) >= 2:
            from engine.mutations import layout_merge
            layout_merge(p, [0, 1])
            target_gi = 0
    if target_gi is None:
        return False, "could not find/create a multi-line group"
    groups = engine.project_to_render(p)
    # Find the render group corresponding to the merged event (longest line count)
    text, _ = engine.build_ass(CFG, groups)
    ok = "\\N" in text
    return ok, f"\\N present in output = {ok}"

def t_header_contains_playres_and_wrapstyle():
    """Header contains PlayResX, PlayResY, WrapStyle lines with correct values."""
    p, groups = fresh()
    text, _ = engine.build_ass(CFG, groups)
    ok = ("PlayResX: 1920" in text and "PlayResY: 1080" in text and "WrapStyle: 2" in text)
    return ok, f"PlayResX_ok={'PlayResX: 1920' in text} PlayResY_ok={'PlayResY: 1080' in text} WrapStyle_ok={'WrapStyle: 2' in text}"

def t_ass_time_known_values():
    """core.ass_time produces correct h:mm:ss.cc for known inputs."""
    cases = [(0, "0:00:00.00"), (13.04, "0:00:13.04"), (60.0, "0:01:00.00"), (3599.99, "0:59:59.99")]
    bad = []
    for secs, expected in cases:
        got = core.ass_time(secs)
        if got != expected:
            bad.append(f"{secs}->{got!r} (expected {expected!r})")
    ok = len(bad) == 0
    return ok, f"failures={bad}"

def t_ass_time_from_dialogue_start():
    """A known first word start time appears formatted correctly in a Dialogue line."""
    p, groups = fresh()
    text, _ = engine.build_ass(CFG, groups)
    if not groups:
        return False, "no groups"
    g0 = groups[0]
    expected_start = core.ass_time(g0["start"])
    diag_lines = [l for l in text.splitlines() if l.startswith("Dialogue:")]
    # The Dialogue format: Layer,Start,End,...
    # "Dialogue: 0,<start>,<end>,..."
    ok = any(f",{expected_start}," in l for l in diag_lines)
    return ok, f"expected start time {expected_start!r} in Dialogue"

# ─── io tests ─────────────────────────────────────────────────────────────────

def t_serialize_cues_structure():
    """serialize_cues returns dict with expected top-level keys and correct types; no palette."""
    p, _ = fresh()
    d = engine.serialize_cues(p)
    has_nwords = isinstance(d.get("nwords"), int) and d["nwords"] == len(p["words"])
    has_globals = isinstance(d.get("globals"), dict)
    no_palette = "palette" not in d
    has_layout = isinstance(d.get("layout"), list) and len(d["layout"]) == len(p["layout"])
    has_fin = isinstance(d.get("fin_tags"), list)
    has_fout = isinstance(d.get("fout_tags"), list)
    ok = all([has_nwords, has_globals, no_palette, has_layout, has_fin, has_fout])
    return ok, f"nwords={has_nwords} globals={has_globals} no_palette={no_palette} layout={has_layout} fin={has_fin} fout={has_fout}"

def t_serialize_has_style_on_layout_and_toks():
    """serialize_cues includes 'style' key on each layout group and each tok."""
    p, _ = fresh()
    # Set some styles so they actually carry data
    mut.set_group_style(p, 0, {"fontsize": 72})
    wid = p["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    mut.set_cue_style(p, {wid}, {"primary": "#AABBCC"})
    d = engine.serialize_cues(p)
    g0 = d["layout"][0]
    has_group_style = "style" in g0 and g0["style"].get("fontsize") == 72
    tok0 = g0["lines"][0]["toks"][0]
    has_tok_style = "style" in tok0 and tok0["style"].get("primary") == "#AABBCC"
    ok = has_group_style and has_tok_style
    return ok, f"group_style_ok={has_group_style} tok_style_ok={has_tok_style}"

def t_apply_cues_roundtrip_rich_state():
    """Full rich-state roundtrip: set group style, cue style, linger, win_start/end,
    del flags, fin/fout tags with trigger, globals, group fade — serialize → apply to fresh
    project → deep compare. (palette and tag dur removed from new model.)"""
    p, _ = fresh()
    # group style
    mut.set_group_style(p, 0, {"fontsize": 88, "bold": False})
    # cue style
    wid0 = p["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    mut.set_cue_style(p, {wid0}, {"primary": "#AABBCC"})
    # layout props
    # REWRITE (animations migration): set_layout_props dropped its `accumulate` arg.
    # accumulate is still a valid pre-migration group field (it round-trips through
    # serialize/apply_cues until migration converts it), so set it on the group directly.
    mut.set_layout_props(p, 0, win_start=1.5, win_end=5.5, linger=0.75)
    p["layout"][0]["accumulate"] = "lines"
    # del flag on a tok
    p["layout"][0]["lines"][0]["toks"][0]["del"] = True
    # globals
    mut.set_global(p, "fade_in_ms", 300)
    mut.set_global(p, "linger", 0.5)
    # group fade override
    p["layout"][0]["fade"] = {"fade_in_ms": 150}
    # fin_tag (tags now only carry ids + trigger, no dur)
    mut.make_tag(p, "fin_tags", {wid0})
    mut.set_tag_props(p, "fin_tags", 0, trigger=2.0)
    # fout_tag
    mut.make_tag(p, "fout_tags", {wid0})
    mut.set_tag_props(p, "fout_tags", 0, trigger=4.0)

    d = engine.serialize_cues(p)
    p2 = engine.make_project(CFG)
    ok = engine.apply_cues(p2, d)
    if not ok:
        return False, "apply_cues returned False"

    g0 = p2["layout"][0]
    g0_orig = p["layout"][0]
    checks = {
        "group_style": g0.get("style") == g0_orig.get("style"),
        "tok_style": g0["lines"][0]["toks"][0].get("style") == g0_orig["lines"][0]["toks"][0].get("style"),
        "linger": abs((g0.get("linger") or 0) - 0.75) < 1e-9,
        "win_start": abs((g0.get("win_start") or 0) - 1.5) < 1e-9,
        "win_end": abs((g0.get("win_end") or 0) - 5.5) < 1e-9,
        "accumulate": g0.get("accumulate") == "lines",
        "tok_del": g0["lines"][0]["toks"][0].get("del") == True,
        "globals_fade_in": p2["globals"].get("fade_in_ms") == 300,
        "globals_linger": abs(p2["globals"].get("linger", 0) - 0.5) < 1e-9,
        "group_fade": g0.get("fade") == {"fade_in_ms": 150},
        "fin_tag_trigger": (p2["fin_tags"] and abs((p2["fin_tags"][0].get("trigger") or 0) - 2.0) < 1e-9),
        "fout_tag_trigger": (p2["fout_tags"] and abs((p2["fout_tags"][0].get("trigger") or 0) - 4.0) < 1e-9),
    }
    failed = [k for k, v in checks.items() if not v]
    return len(failed) == 0, f"failed_checks={failed}"

def t_apply_cues_nwords_guard():
    """apply_cues returns False when nwords in dict mismatches the project."""
    p, _ = fresh()
    d = engine.serialize_cues(p)
    d["nwords"] = d["nwords"] + 999   # corrupt nwords
    p2 = engine.make_project(CFG)
    ok_is_false = engine.apply_cues(p2, d) == False
    return ok_is_false, f"apply returned False when nwords mismatched = {ok_is_false}"

def t_apply_cues_nwords_none_guard():
    """apply_cues returns False when nwords key is missing entirely."""
    p, _ = fresh()
    d = engine.serialize_cues(p)
    del d["nwords"]
    p2 = engine.make_project(CFG)
    ok_is_false = engine.apply_cues(p2, d) == False
    return ok_is_false, f"apply returned False when nwords missing = {ok_is_false}"

def t_apply_cues_backward_compat_no_style_keys():
    """Deleting all 'style' keys from serialized dict → apply still works, styles become {}."""
    p, _ = fresh()
    mut.set_group_style(p, 0, {"fontsize": 72})
    d = engine.serialize_cues(p)
    # Remove all style keys from every group and tok
    for g in d["layout"]:
        g.pop("style", None)
        for ln in g["lines"]:
            for tok in ln["toks"]:
                tok.pop("style", None)
    p2 = engine.make_project(CFG)
    ok = engine.apply_cues(p2, d)
    # Should succeed; styles should all be empty dicts
    if not ok:
        return False, "apply_cues returned False on backward-compat dict"
    all_empty = all(
        p2["layout"][gi].get("style") == {}
        for gi in range(len(p2["layout"]))
    )
    return all_empty, f"apply_ok={ok} all_styles_empty={all_empty}"

def t_serialize_apply_build_ass_equivalence():
    """build_ass output is identical before and after a serialize/apply roundtrip."""
    p, _ = fresh()
    # Apply some mutations to make it interesting
    mut.set_group_style(p, 0, {"fontsize": 72})
    wid = p["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    mut.set_cue_style(p, {wid}, {"primary": "#FF0000"})
    groups1 = engine.project_to_render(p)
    text1, n1 = engine.build_ass(CFG, groups1)

    # Roundtrip
    d = engine.serialize_cues(p)
    p2 = engine.make_project(CFG)
    engine.apply_cues(p2, d)
    groups2 = engine.project_to_render(p2)
    text2, n2 = engine.build_ass(CFG, groups2)

    ok = (text1 == text2 and n1 == n2)
    if not ok:
        # Diff first difference for diagnosis
        lines1 = text1.splitlines(); lines2 = text2.splitlines()
        first_diff = next(((i, a, b) for i, (a, b) in enumerate(zip(lines1, lines2)) if a != b), None)
    else:
        first_diff = None
    return ok, f"identical={ok} first_diff={first_diff}"

def t_frame_cmd_shape():
    import engine.ffmpeg as f, core
    c = f.frame_cmd("/tmp/in.mp4", "/tmp/x.ass", 13.0, 1920, 1080, "/tmp/o.png")
    assert c[0] == core.FFMPEG and c[-1] == "/tmp/o.png"
    assert "-ss" in c and "13.000" in c and any("ass='" in a for a in c)
    assert "/tmp/in.mp4" in c and "-frames:v" in c
    c2 = f.frame_cmd(None, "/tmp/x.ass", 0.0, 640, 360, "/tmp/o2.png")
    return (any("lavfi" in a for a in c2) and any("color=" in a for a in c2)
            and any("640x360" in a for a in c2)), f"len={len(c)} len2={len(c2)}"

def t_fin_tag_ids_preserved_in_roundtrip():
    """fin_tag word IDs survive serialize → apply (as a set)."""
    p, _ = fresh()
    wid = p["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    mut.make_tag(p, "fin_tags", {wid})
    d = engine.serialize_cues(p)
    p2 = engine.make_project(CFG)
    engine.apply_cues(p2, d)
    ok = len(p2["fin_tags"]) == 1 and wid in p2["fin_tags"][0]["ids"]
    return ok, f"fin_tags={p2['fin_tags']}"

def t_fout_tag_ids_and_trigger_preserved():
    """fout_tag IDs and trigger survive serialize → apply (no color in new model)."""
    p, _ = fresh()
    wid = p["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    mut.make_tag(p, "fout_tags", {wid})
    mut.set_tag_props(p, "fout_tags", 0, trigger=3.5)
    d = engine.serialize_cues(p)
    p2 = engine.make_project(CFG)
    engine.apply_cues(p2, d)
    t = p2["fout_tags"][0] if p2["fout_tags"] else {}
    ok = (len(p2["fout_tags"]) == 1
          and wid in t.get("ids", set())
          and abs((t.get("trigger") or 0) - 3.5) < 1e-9
          and set(t.keys()) == {"ids", "trigger"})
    return ok, f"fout_tags={p2['fout_tags']}"


def t_serialize_drops_palette_and_tag_color_dur():
    import json
    p = engine.make_project(CFG)
    wid = p["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    engine.mutations.make_tag(p, "fin_tags", {wid})
    p["layout"][0]["fade"] = {"fade_in_ms": 333}
    d = engine.serialize_cues(p)
    ok = ("palette" not in d
          and d["fin_tags"][0] == {"ids": [wid], "trigger": None}
          and d["layout"][0]["fade"] == {"fade_in_ms": 333})
    json.dumps(d)
    return (ok, d["fin_tags"][0])

def t_apply_ignores_legacy_palette_color_dur():
    p = engine.make_project(CFG)
    legacy = engine.serialize_cues(p)
    legacy["palette"] = ["#abcdef"] * 10
    legacy["fin_tags"] = [{"ids": [0], "color": 3, "trigger": 1.0, "dur": 200}]
    ok = engine.apply_cues(p, legacy)
    t = p["fin_tags"][0]
    return (ok and set(t.keys()) == {"ids", "trigger"} and t["trigger"] == 1.0, t)

def t_serialize_persists_word_edits():
    import json
    p = engine.make_project(CFG)
    engine.mutations.set_word_times(p, [{"wid": 0, "start": 9.5, "end": 10.25}])
    engine.mutations.set_word_text(p, 0, "EDITED")
    d = engine.serialize_cues(p)
    ok_doc = (len(d["words"]) == len(p["words"]) and d["words"][0] == {"text": "EDITED", "start": 9.5, "end": 10.25})
    p2 = engine.make_project(CFG)
    applied = engine.apply_cues(p2, json.loads(json.dumps(d)))
    w0 = p2["words"][0]
    return (ok_doc and applied and w0["text"] == "EDITED" and abs(w0["start"] - 9.5) < 1e-9 and abs(w0["end"] - 10.25) < 1e-9, (ok_doc, w0))

def t_apply_without_words_is_backcompat():
    p = engine.make_project(CFG)
    d = engine.serialize_cues(p)
    del d["words"]
    p2 = engine.make_project(CFG)
    orig = dict(p2["words"][0])
    ok = engine.apply_cues(p2, d)
    return (ok and p2["words"][0] == orig, p2["words"][0])

# ─── run all ──────────────────────────────────────────────────────────────────

_active = {name: fn for name, fn in list(globals().items())
           if name.startswith("t_") and name not in SUSPECTED_BUGS and callable(fn)}

for name, fn in sorted(_active.items()):
    check(name, fn)

npass = sum(1 for ok, *_ in results if ok)
for ok, name, detail in results:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + ("" if ok else f"\n       -> {detail}"))

if SUSPECTED_BUGS:
    print("\nSUSPECTED_BUGS (excluded from run):")
    for name, reason in SUSPECTED_BUGS.items():
        print(f"  {name}: {reason}")

print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
