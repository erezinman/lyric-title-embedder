import os, sys, json, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # so aligned_lyrics.json default resolves
import karaoke_subtitle_gui as v2
import time

app = v2.AppV2()
def pump(n=8):
    for _ in range(n):
        app.update(); time.sleep(0.02)
pump(14)
app.open_editor(); pump(6)
ed = app._editor

class Ev: pass
def line_of(pred):
    for i, r in enumerate(ed.rows):
        if pred(r): return i + 1   # 1-based text line
    return None
def click(pane, lane, line, x=30, ctrl=False):
    pane.see(f"{line}.0"); pane.update_idletasks()
    bb = pane.bbox(f"{line}.0")
    if not bb: raise RuntimeError(f"line {line} not visible")
    e = Ev(); e.x = x; e.y = bb[1] + 2; e.x_root = 0; e.y_root = 0
    ed._click(e, pane, lane, add=ctrl); pump(2)

def drag(pane, lane, lines):
    """Press on lines[0] then drag (B1-Motion, no modifiers) across the rest,
    then release — mirrors the real event flow (light motion + heavy release)."""
    click(pane, lane, lines[0])
    for ln in lines[1:]:
        pane.see(f"{ln}.0"); pane.update_idletasks()
        bb = pane.bbox(f"{ln}.0")
        e = Ev(); e.x = 20; e.y = bb[1] + 2; e.x_root = 0; e.y_root = 0
        ed._range_click(e, pane, lane, light=True); pump(1)
    ed._drag_release(); pump(1)

def reset():
    app._reload_groups(); pump(4); ed.collapsed.clear(); ed.reload(); pump(2)

results = []
def check(name, fn):
    try:
        reset()
        ok, detail = fn()
        results.append((ok, name, detail))
    except Exception as e:
        results.append((False, name, f"EXC {type(e).__name__}: {e}"))

def render_words():
    return [w for g in app._groups for ln in g["lines"] for w in ln["words"]]

# ── LOAD/SAVE PROJECT & GLOBAL REACTIVITY & THEME tests ──

def t_preset_dict_has_cues_v2_and_theme():
    """_preset_dict() must contain 'cues_v2' and 'theme'."""
    d = app._preset_dict()
    has_cues = "cues_v2" in d and d["cues_v2"] is not None
    has_theme = "theme" in d and isinstance(d["theme"], str)
    return (has_cues and has_theme), f"keys={list(d.keys())}"


def t_preset_dict_no_path_keys():
    """_preset_dict() must NOT contain source-path or output-path keys."""
    d = app._preset_dict()
    forbidden = {"json_path", "video_path", "output_path", "source", "video", "output"}
    found = forbidden & set(d.keys())
    return (len(found) == 0), f"forbidden keys found: {found}"


def t_preset_dict_cues_v2_structure():
    """cues_v2 inside _preset_dict has 'layout' with events that have 'style' key,
    and tokens also have 'style' key."""
    d = app._preset_dict()
    cv2 = d["cues_v2"]
    has_nwords = "nwords" in cv2
    layout = cv2.get("layout", [])
    events_have_style = all("style" in g for g in layout)
    tokens_have_style = all(
        "style" in tok
        for g in layout
        for ln in g.get("lines", [])
        for tok in ln.get("toks", [])
    )
    ok = has_nwords and events_have_style and tokens_have_style
    return ok, (f"nwords={has_nwords} ev_style={events_have_style} tok_style={tokens_have_style}")


def t_preset_dict_json_serializable():
    """json.dumps(_preset_dict()) must succeed — no sets leaking (fin_tags ids are lists)."""
    d = app._preset_dict()
    try:
        s = json.dumps(d)
        ok = isinstance(s, str) and len(s) > 10
    except (TypeError, ValueError) as e:
        return False, f"json.dumps failed: {e}"
    # Also verify fin/fout ids are lists (not sets) in cues_v2
    cv2 = d["cues_v2"]
    ids_are_lists = all(
        isinstance(t["ids"], list)
        for key in ("fin_tags", "fout_tags")
        for t in cv2.get(key, [])
    )
    return (ok and ids_are_lists), f"ok={ok} ids_are_lists={ids_are_lists}"


def t_full_file_roundtrip_via_tmp():
    """Set group style + cue style + fout tag + linger -> save to /tmp/kss_rt.json
    -> reload fresh project -> apply_cues_v2 -> rebuild -> assert all survived."""
    # Set group style on group 0
    app.set_group_style(0, {"fontsize": 72, "border_style": 3}); pump(2)
    # Set a cue style on first token of group 0
    tok0 = app._project["layout"][0]["lines"][0]["toks"][0]
    wid0 = tok0["ids"][0]
    app.set_cue_style({wid0}, {"primary": "#FF00FF"}); pump(2)
    # Add fout tag on words 0..2
    app.make_tag("fout_tags", {0, 1, 2}); pump(2)
    # Set linger on group 0
    app.set_layout_props(0, None, None, 3.0, "words"); pump(2)
    # Remember build output before save
    pre_build, _ = v2.build_ass_v2(app.cfg(), app._groups)
    # Save to /tmp
    d = app._preset_dict()
    with open("/tmp/kss_rt.json", "w", encoding="utf-8") as f:
        json.dump(d, f, indent=2)
    # Fresh reload, then apply from file
    app._reload_groups(); pump(4)
    d2 = json.load(open("/tmp/kss_rt.json", encoding="utf-8"))
    ok = v2.apply_cues_v2(app._project, d2["cues_v2"]); pump(1)
    app._rebuild_render(); pump(2)
    # Verify
    g0_style = app._project["layout"][0].get("style", {})
    g0_linger = app._project["layout"][0].get("linger")
    fout_count = len(app._project["fout_tags"])
    post_build, _ = v2.build_ass_v2(app.cfg(), app._groups)
    tok0_after = app._project["layout"][0]["lines"][0]["toks"][0]
    cue_style = tok0_after.get("style", {})
    style_ok = g0_style.get("fontsize") == 72 and g0_style.get("border_style") == 3
    linger_ok = g0_linger == 3.0
    fout_ok = fout_count == 1
    cue_ok = cue_style.get("primary") == "#FF00FF"
    build_match = pre_build == post_build
    all_ok = ok and style_ok and linger_ok and fout_ok and cue_ok and build_match
    return all_ok, (f"ok={ok} style={style_ok} linger={linger_ok} fout={fout_ok} "
                    f"cue={cue_ok} build_match={build_match}")


def t_nwords_guard_rejects_corrupt():
    """Corrupting nwords in cues_v2 causes apply_cues_v2 to return False
    and leaves the project layout unchanged."""
    d = app._preset_dict()
    n_before = len(app._project["layout"])
    d_bad = copy.deepcopy(d["cues_v2"])
    d_bad["nwords"] = d_bad["nwords"] + 999  # corrupt
    ok = v2.apply_cues_v2(app._project, d_bad)
    n_after = len(app._project["layout"])
    return (ok is False and n_after == n_before), f"ok={ok} layout_len {n_before}->{n_after}"


def t_backward_compat_strip_style_keys():
    """Strip all 'style' keys from cues_v2 (events + tokens) -> apply_cues_v2 still returns True
    and all group/cue styles are empty dicts; build_ass produces single Default style."""
    # First set a group style so we have something to strip
    app.set_group_style(0, {"fontsize": 96}); pump(2)
    d = app._preset_dict()
    cv2 = copy.deepcopy(d["cues_v2"])
    # Strip 'style' from layout events and tokens
    for g in cv2.get("layout", []):
        g.pop("style", None)
        for ln in g.get("lines", []):
            for tok in ln.get("toks", []):
                tok.pop("style", None)
    app._reload_groups(); pump(4)
    ok = v2.apply_cues_v2(app._project, cv2)
    app._rebuild_render(); pump(2)
    # All group styles should be {} (inherit)
    all_empty = all(g.get("style", {}) == {} for g in app._project["layout"])
    # Build should succeed and not have a "Box," style (no box override)
    txt, _ = v2.build_ass_v2(app.cfg(), app._groups)
    no_box_style = "Style: Box," not in txt
    all_ok = ok and all_empty and no_box_style
    return all_ok, f"ok={ok} all_empty={all_empty} no_box={no_box_style}"


def t_global_font_reactivity_inherited_word():
    """Changing app.font_var then rebuild -> build output for an inherited word reflects
    the new font; a word with a cue override of fontsize is still unaffected by font change."""
    orig_font = app.font_var.get()
    # Make sure group 0 tok 0 has NO cue style (inherit)
    app._project["layout"][0]["lines"][0]["toks"][0]["style"] = {}
    app._rebuild_render(); pump(2)
    txt_before, _ = v2.build_ass_v2(app.cfg(), app._groups)
    # Change global font
    app.font_var.set("Courier New"); pump(1)
    app._rebuild_render(); pump(2)
    txt_after, _ = v2.build_ass_v2(app.cfg(), app._groups)
    # The style line in the ASS header should use the new font
    font_in_style = "Courier New" in txt_after
    font_changed = "Courier New" not in txt_before
    # Restore
    app.font_var.set(orig_font); pump(1)
    return (font_in_style and font_changed), f"in_after={font_in_style} not_in_before={font_changed}"


def t_global_size_reactivity():
    """Changing app.size_var then rebuild -> build output contains updated fontsize."""
    orig_size = app.size_var.get()
    app.size_var.set(128); pump(1)
    app._rebuild_render(); pump(2)
    txt, _ = v2.build_ass_v2(app.cfg(), app._groups)
    has_128 = ",128," in txt or ",128," in txt
    # Restore
    app.size_var.set(orig_size); pump(1)
    return has_128, f"fontsize 128 present={has_128}"


def t_global_primary_color_reactivity():
    """Changing app._color['primary'] then rebuild -> inherited words use new primary in build."""
    orig_color = app._color["primary"]
    # Make sure group 0 tok 0 has no override
    app._project["layout"][0]["lines"][0]["toks"][0]["style"] = {}
    app._rebuild_render(); pump(2)
    txt_before, _ = v2.build_ass_v2(app.cfg(), app._groups)
    app._color["primary"] = "#AABBCC"; pump(1)
    app._rebuild_render(); pump(2)
    txt_after, _ = v2.build_ass_v2(app.cfg(), app._groups)
    # #AABBCC in ASS is BBGGRR -> CCBBAA -> inline tag would be &HCCBBAA& or Style uses it
    # In Style line the primary color is in ASS &HBBGGRR& format
    # #AABBCC -> R=AA, G=BB, B=CC -> ASS &H00CCBBAA&
    color_in_style = "CCBBAA" in txt_after.upper()
    color_changed = "CCBBAA" not in txt_before.upper()
    # Restore
    app._color["primary"] = orig_color; pump(1)
    return (color_in_style and color_changed), f"in_after={color_in_style} not_in_before={color_changed}"


def t_cue_override_not_affected_by_global_font():
    """A word with a cue-level fontsize override retains its override after global font change."""
    tok0 = app._project["layout"][0]["lines"][0]["toks"][0]
    wid0 = tok0["ids"][0]
    app.set_cue_style({wid0}, {"fontsize": 48}); pump(2)
    orig_font = app.font_var.get()
    app.font_var.set("Impact"); pump(1)
    app._rebuild_render(); pump(2)
    # The render word's style should still have fontsize=48
    rw = render_words()[0]
    override_intact = rw.get("style", {}).get("fontsize") == 48
    # Restore
    app.font_var.set(orig_font); pump(1)
    return override_intact, f"cue style after global font change: {rw.get('style')}"


def t_fade_out_default_reactivity():
    """set_global('fade_out_ms', X) -> a group without fade override uses X;
    a group with an explicit fade_out_ms override is unaffected.
    (dur is now a group-level fade override, not a tag-level field.)"""
    # Set a per-group fade_out_ms override on group 1 -> 333 ms
    app.set_group_fade(1, {"fade_out_ms": 333}); pump(2)
    # Tag words from group 0 (inherits global) and group 1 (has override)
    # Get word ids from each group
    g0_toks = [t for l in app._project["layout"][0]["lines"] for t in l["toks"]]
    g1_toks = [t for l in app._project["layout"][1]["lines"] for t in l["toks"]]
    g0_ids = {g0_toks[0]["ids"][0]} if g0_toks else set()
    g1_ids = {g1_toks[0]["ids"][0]} if g1_toks else set()
    if g0_ids:
        app.make_tag("fout_tags", g0_ids); pump(2)
    if g1_ids:
        app.make_tag("fout_tags", g1_ids); pump(2)
    # Change global fade_out_ms
    app.set_global("fade_out_ms", 1500); pump(2)
    app._rebuild_render(); pump(2)
    rws = render_words()
    all_fout = [(w["fout_ms"], w["fout_at"]) for w in rws if w["fout_at"] is not None]
    # Group 0 inherits global -> fout_ms should be 1500
    inherited_ok = any(ms == 1500 for ms, _ in all_fout)
    # Group 1 override -> fout_ms should still be 333
    override_ok = any(abs(ms - 333.0) < 1e-3 for ms, _ in all_fout)
    return (inherited_ok and override_ok), f"fout pairs={all_fout}"


def t_linger_global_vs_per_group():
    """set_global('linger', L) extends event windows for groups without per-group linger;
    a per-group linger override is unaffected by the global change."""
    # Group 0: set explicit linger
    app.set_layout_props(0, None, None, 5.0, "words"); pump(2)
    end0_before = app._groups[0]["end"]
    base_e0 = max(app._project["words"][i]["end"]
                  for g in [app._project["layout"][0]]
                  for ln in g["lines"] for tok in ln["toks"] for i in tok["ids"])
    expected_end0 = base_e0 + 5.0
    # Group 1: no override, inherits global (default 0.0)
    app.set_layout_props(1, None, None, None, "words"); pump(2)
    end1_before = app._groups[1]["end"] if len(app._groups) > 1 else None
    # Change global linger
    app.set_global("linger", 2.5); pump(2)
    app._rebuild_render(); pump(2)
    end0_after = app._groups[0]["end"]
    end1_after = app._groups[1]["end"] if len(app._groups) > 1 else None
    # Group 0 override (5.0) should be unchanged
    g0_unchanged = abs(end0_after - expected_end0) < 1e-3
    # Group 1 should have changed (if it has tokens and no override)
    g1_changed = (end1_before is None or end1_after != end1_before) if end1_before is not None else True
    g1_b_str = f"{end1_before:.2f}" if end1_before is not None else "None"
    g1_a_str = f"{end1_after:.2f}" if end1_after is not None else "None"
    return (g0_unchanged and g1_changed), (f"g0 unchanged={g0_unchanged} "
                                            f"g1_before={g1_b_str} g1_after={g1_a_str}")


def t_group_by_reload_changes_event_count():
    """Switching group_var to 'line' and reloading changes number of layout events."""
    n_section = len(app._project["layout"])
    # Switch to line grouping
    app.group_var.set("line"); pump(1)
    app._reload_groups(); pump(4)
    n_line = len(app._project["layout"])
    # Restore
    app.group_var.set("section"); pump(1)
    app._reload_groups(); pump(4)
    n_restored = len(app._project["layout"])
    # Line grouping should give >= as many or more events than section grouping
    more_or_equal = n_line >= n_section
    restored_ok = n_restored == n_section
    return (more_or_equal and restored_ok), f"section={n_section} line={n_line} restored={n_restored}"


def t_skip_dashes_changes_word_count():
    """Toggling skip_var (skip '---' lines) then _reload_groups() changes word count if source has dashes."""
    # Get current word count
    n_before = len(app._project["words"])
    orig_skip = app.skip_var.get()
    # Toggle
    app.skip_var.set(not orig_skip); pump(1)
    app._reload_groups(); pump(4)
    n_after = len(app._project["words"])
    # Restore
    app.skip_var.set(orig_skip); pump(1)
    app._reload_groups(); pump(4)
    n_restored = len(app._project["words"])
    # Either count changed (source has dashes) or it didn't (no dashes) — either is valid.
    # What we assert: after restore, count is back to original.
    restored_ok = n_restored == n_before
    return restored_ok, f"n_before={n_before} n_after={n_after} n_restored={n_restored}"


def t_theme_set_and_reflected_in_preset():
    """app.set_theme('Light') sets app._theme=='Light' and _preset_dict()['theme']=='Light'.
    set_theme('Dark') restores. Idempotent: calling twice is fine."""
    app.set_theme("Light"); pump(2)
    theme_attr = app._theme
    d_light = app._preset_dict()
    # Call again (idempotence)
    app.set_theme("Light"); pump(2)
    theme_attr2 = app._theme
    d_light2 = app._preset_dict()
    # Restore
    app.set_theme("Dark"); pump(2)
    theme_restored = app._theme
    ok = (theme_attr == "Light" and d_light["theme"] == "Light"
          and theme_attr2 == "Light" and d_light2["theme"] == "Light"
          and theme_restored == "Dark")
    return ok, f"theme={theme_attr} dict={d_light['theme']} restored={theme_restored}"


def t_load_preset_applies_theme():
    """Loading a dict with theme='Light' via on_load_preset path applies the theme.
    We call _apply_style_preset + set_theme directly (as on_load_preset does) to test."""
    # Build a minimal valid preset dict
    d = app._preset_dict()
    d["theme"] = "Light"
    app._apply_style_preset(d)
    app.set_theme(d["theme"]); pump(2)
    current_theme = app._theme
    # Restore
    app.set_theme("Dark"); pump(2)
    return current_theme == "Light", f"after load theme={current_theme}"


def t_apply_style_preset_restores_font():
    """Change font_var, get _preset_dict, reset, call _apply_style_preset -> font restored."""
    orig_font = app.font_var.get()
    app.font_var.set("FreeMono"); pump(1)
    d = app._preset_dict()
    # Now reset font to something else
    app.font_var.set("DejaVu Sans"); pump(1)
    # Apply the preset dict
    app._apply_style_preset(d); pump(2)
    restored_font = app.font_var.get()
    # Restore original
    app.font_var.set(orig_font); pump(1)
    return restored_font == "FreeMono", f"restored font={restored_font}"


def t_preset_dict_cues_v2_nwords_matches_words():
    """cues_v2['nwords'] matches len(app._project['words'])."""
    d = app._preset_dict()
    nwords_in_serial = d["cues_v2"]["nwords"]
    nwords_actual = len(app._project["words"])
    return nwords_in_serial == nwords_actual, f"serial={nwords_in_serial} actual={nwords_actual}"


# ── test registry ──
tests = [
    ("_preset_dict has cues_v2 and theme keys", t_preset_dict_has_cues_v2_and_theme),
    ("_preset_dict lacks path keys", t_preset_dict_no_path_keys),
    ("_preset_dict cues_v2 has layout+style structure", t_preset_dict_cues_v2_structure),
    ("_preset_dict is JSON-serializable (no sets)", t_preset_dict_json_serializable),
    ("full file roundtrip via /tmp (group+cue+fout+linger)", t_full_file_roundtrip_via_tmp),
    ("nwords guard rejects corrupt nwords", t_nwords_guard_rejects_corrupt),
    ("backward-compat: strip style keys -> apply works", t_backward_compat_strip_style_keys),
    ("global font change -> build style updated", t_global_font_reactivity_inherited_word),
    ("global size change -> build fontsize updated", t_global_size_reactivity),
    ("global primary color -> ASS color updated", t_global_primary_color_reactivity),
    ("cue fontsize override not affected by global font", t_cue_override_not_affected_by_global_font),
    ("fade_out global change -> inherited fout_ms updates", t_fade_out_default_reactivity),
    ("linger global vs per-group override", t_linger_global_vs_per_group),
    ("group_by reload changes event count", t_group_by_reload_changes_event_count),
    ("skip_dashes toggle -> word count restored on revert", t_skip_dashes_changes_word_count),
    ("set_theme sets _theme + _preset_dict['theme']", t_theme_set_and_reflected_in_preset),
    ("load preset dict with theme applies it", t_load_preset_applies_theme),
    ("_apply_style_preset restores font_var", t_apply_style_preset_restores_font),
    ("cues_v2 nwords matches project words", t_preset_dict_cues_v2_nwords_matches_words),
]

SUSPECTED_BUGS = []
# (add entries here as: ("test_name", "1-line rationale") if a real bug is discovered)

for name, fn in tests:
    check(name, fn)

print("\n==== UI PERSISTENCE TEST RESULTS ====")
npass = sum(1 for ok, *_ in results if ok)
for ok, name, detail in results:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + ("" if ok else f"   -> {detail}"))
if SUSPECTED_BUGS:
    print("\nSUSPECTED_BUGS:")
    for bname, rationale in SUSPECTED_BUGS:
        print(f"  {bname}: {rationale}")
print(f"\n{npass}/{len(results)} passed")
app.destroy()

sys.exit(0 if npass == len(results) else 1)
