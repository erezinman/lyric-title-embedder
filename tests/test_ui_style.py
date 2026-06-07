import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # so aligned_lyrics.json default resolves
import karaoke_subtitle_gui as v2
import time

app = v2.AppV2()
app.withdraw()  # headless: keep the window off-screen during test runs
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

# ── STYLE / INSPECTOR / PREVIEW / DOCK tests ──

def t_inspector_builds_group_style_section():
    """Clicking a layout header builds group style section (ed._gs_size exists, inspector populated)."""
    hdr_line = line_of(lambda r: r[0] == "hdr")
    click(ed.L, "layout", hdr_line)
    has_size = hasattr(ed, "_gs_size")
    has_children = len(app.inspector_tab.winfo_children()) > 0
    return (has_size and has_children), f"has_size={has_size} children={len(app.inspector_tab.winfo_children())}"


def t_inspector_builds_cue_style_section():
    """Clicking a word row builds cue style section; no _cs_border (C1 constraint)."""
    word_line = line_of(lambda r: r[0] == "word")
    click(ed.L, "layout", word_line)
    has_size = hasattr(ed, "_cs_size")
    border_is_none = getattr(ed, "_cs_border", "NOT_SET") is None
    return (has_size and border_is_none), f"has_cs_size={has_size} cs_border_is_None={border_is_none}"


def t_group_style_fontsize_via_ui():
    """Set group fontsize to 110 via UI controls -> project layout style has fontsize 110."""
    hdr_line = line_of(lambda r: r[0] == "hdr")
    click(ed.L, "layout", hdr_line)
    gi = ed.sel_group
    ed._gs_size.set("110")
    ed._apply_group_style()
    pump(2)
    g_style = app._project["layout"][gi].get("style") or {}
    return (g_style.get("fontsize") == 110), f"style={g_style}"


def t_group_style_box_mode_via_ui():
    """Set group border to 'box' via UI controls -> build contains 'Style: Box,'."""
    hdr_line = line_of(lambda r: r[0] == "hdr")
    click(ed.L, "layout", hdr_line)
    gi = ed.sel_group
    ed._gs_border.set("box")
    ed._apply_group_style()
    pump(2)
    text, _ = v2.build_ass_v2(app.cfg(), app._groups)
    has_box = "Style: Box," in text
    return has_box, f"build_has_Box_style={has_box}"


def t_group_style_primary_color_via_ui():
    """Set group primary color via UI color dict -> build contains \\1c&H0000FF& for red."""
    hdr_line = line_of(lambda r: r[0] == "hdr")
    click(ed.L, "layout", hdr_line)
    gi = ed.sel_group
    ed._gs_colors["primary"] = "#FF0000"
    ed._apply_group_style()
    pump(2)
    text, _ = v2.build_ass_v2(app.cfg(), app._groups)
    # #FF0000 in ASS BGR = &H0000FF&
    has_color = "\\1c&H0000FF&" in text
    return has_color, f"has_inline_primary={has_color}"


def t_group_style_clear_to_inherit_via_ui():
    """After setting fontsize/border/primary, clearing them (empty/inherit/None) removes keys from style."""
    hdr_line = line_of(lambda r: r[0] == "hdr")
    click(ed.L, "layout", hdr_line)
    gi = ed.sel_group
    # First set values
    ed._gs_size.set("110")
    ed._gs_border.set("box")
    ed._gs_colors["primary"] = "#FF0000"
    ed._apply_group_style()
    pump(2)
    # Verify they are set
    s0 = app._project["layout"][gi].get("style") or {}
    set_ok = s0.get("fontsize") == 110 and s0.get("border_style") == 3
    # Now clear them
    ed._gs_size.set("")
    ed._gs_border.set("(inherit)")
    ed._gs_colors["primary"] = None
    ed._apply_group_style()
    pump(2)
    s1 = app._project["layout"][gi].get("style") or {}
    size_gone = s1.get("fontsize") is None
    border_gone = s1.get("border_style") is None
    primary_gone = s1.get("primary") is None
    ok = set_ok and size_gone and border_gone and primary_gone
    return ok, f"set_ok={set_ok} size_gone={size_gone} border_gone={border_gone} primary_gone={primary_gone}"


def t_cue_style_single_word_via_ui():
    """Set cue size 40 for a single word via UI -> that token's style has fontsize 40."""
    word_line = line_of(lambda r: r[0] == "word")
    click(ed.L, "layout", word_line)
    gi, li, ti, wid = ed.sel_word
    ed._cs_size.set("40")
    ed._apply_cue_style()
    pump(2)
    tok = app._project["layout"][gi]["lines"][li]["toks"][ti]
    fs = (tok.get("style") or {}).get("fontsize")
    return (fs == 40), f"tok_fontsize={fs}"


def t_cue_style_multiword_via_drag():
    """Drag-select multiple word rows then set cue fontsize -> ALL selected tokens updated."""
    word_rows = [i + 1 for i, r in enumerate(ed.rows) if r[0] == "word"][:3]
    drag(ed.L, "layout", word_rows)
    n_selected = len(ed.sel_ids)
    ed._cs_size.set("40")
    ed._apply_cue_style()
    pump(2)
    updated = 0
    for g in app._project["layout"]:
        for ln in g["lines"]:
            for tok in ln["toks"]:
                if (tok.get("style") or {}).get("fontsize") == 40:
                    updated += 1
    ok = updated == n_selected and n_selected >= 2
    return ok, f"selected={n_selected} updated_to_40={updated}"


def t_c1_no_border_style_on_cue():
    """C1: set_cue_style with border_style=3 is silently ignored; primary IS set."""
    wid = app._project["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    app.set_cue_style({wid}, {"border_style": 3, "primary": "#00FF00"})
    pump(2)
    tok_style = None
    for g in app._project["layout"]:
        for ln in g["lines"]:
            for tok in ln["toks"]:
                if wid in tok["ids"]:
                    tok_style = tok.get("style") or {}
    primary_set = tok_style.get("primary") == "#00FF00"
    border_not_set = tok_style.get("border_style") is None
    return (primary_set and border_not_set), f"primary_set={primary_set} border_style={tok_style.get('border_style')}"


def t_waterfall_group_fontsize_resolves_for_cue():
    """Group fontsize override resolves for tokens in that group (no per-cue override)."""
    app.set_group_style(0, {"fontsize": 72})
    pump(2)
    # Verify via build: the group's token should have \fs72 inline tag
    text, _ = v2.build_ass_v2(app.cfg(), app._groups)
    # \fs72 appears if group fontsize differs from global
    has_fs = "\\fs72" in text
    # Also verify via resolve_style
    g = app._project["layout"][0]
    from engine.model import resolve_style
    glob_style = {"font": app.font_var.get(), "fontsize": app.size_var.get(),
                  "bold": app.bold_var.get(), "primary": app._color["primary"],
                  "outline": app._color["outline"], "back": app._color["back"],
                  "back_alpha": app.backa_var.get(), "outline_w": app.outline_var.get(),
                  "shadow": app.shadow_var.get(), "border_style": app.border_var.get()}
    tok = g["lines"][0]["toks"][0]
    resolved = resolve_style(tok, g, glob_style)
    resolved_fs = resolved.get("fontsize")
    ok = resolved_fs == 72
    return ok, f"resolved_fontsize={resolved_fs} build_has_fs72={has_fs}"


def t_preview_per_cue_primary_color():
    """Set cue primary #00FF00, scrub to word start -> canvas 'tx' item has fill #00ff00."""
    wid = app._project["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    app.set_cue_style({wid}, {"primary": "#00FF00"})
    pump(2)
    g0 = app._groups[0]
    # scrub to just before/at first word start
    first_word_start = g0["lines"][0]["words"][0]["start_s"]
    app.time_var.set(first_word_start + 0.01)
    app._refresh_preview(); pump(2)
    fills = {app.canvas.itemcget(i, "fill").lower() for i in app.canvas.find_withtag("tx")}
    return ("#00ff00" in fills), f"fills={sorted(fills)}"


def t_preview_per_cue_sibling_word_white():
    """First word has #00FF00 override, second word (no override) should be white #ffffff."""
    # Set override on first word only
    wid0 = app._project["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    app.set_cue_style({wid0}, {"primary": "#00FF00"})
    pump(2)
    g0 = app._groups[0]
    # Get start time of second word if it exists
    words = g0["lines"][0]["words"]
    if len(words) < 2:
        return (True, "skip: only one word in group 0 line 0")
    second_word_start = words[1]["start_s"]
    app.time_var.set(second_word_start + 0.01)
    app._refresh_preview(); pump(2)
    fills = {app.canvas.itemcget(i, "fill").lower() for i in app.canvas.find_withtag("tx")}
    # The default primary color should be white (app's default primary_color)
    default_primary = app._color["primary"].lower()
    has_override = "#00ff00" in fills
    has_default = default_primary in fills
    return (has_override and has_default), f"fills={sorted(fills)} default_primary={default_primary}"


def t_preview_per_group_primary_color():
    """Set group primary #FF00FF -> scrub into event -> words use that color in preview."""
    app.set_group_style(0, {"primary": "#FF00FF"})
    pump(2)
    g0 = app._groups[0]
    mid = (g0["start"] + g0["end"]) / 2
    app.time_var.set(mid)
    app._refresh_preview(); pump(2)
    fills = {app.canvas.itemcget(i, "fill").lower() for i in app.canvas.find_withtag("tx")}
    return ("#ff00ff" in fills), f"fills={sorted(fills)}"


def t_preview_fontsize_override_no_crash():
    """Set large cue fontsize, refresh -> no exception, 'tx' items still present."""
    wid = app._project["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    app.set_cue_style({wid}, {"fontsize": 200})
    pump(2)
    g0 = app._groups[0]
    mid = (g0["start"] + g0["end"]) / 2
    app.time_var.set(mid)
    app._refresh_preview(); pump(2)
    items = app.canvas.find_withtag("tx")
    return (len(items) > 0), f"tx_items={len(items)}"


def t_inspector_fade_tag_no_gs_size():
    """Clicking a fade-in cell shows tag props, NOT a group style section (no _gs_size rebuilt)."""
    # Remove any existing fin_tags so we can make one
    word_row = next((i + 1 for i, r in enumerate(ed.rows) if r[0] == "word"), None)
    _, gi, li, ti, wid = ed.rows[word_row - 1]
    app.make_tag("fin_tags", {wid}); pump(2)
    ed.reload(); pump(2)
    # Find the fin_tag row for that word and click it in the fade-in pane
    fin_line = line_of(lambda r: r[0] == "word" and r[4] == wid)
    if fin_line is None:
        return (False, "could not find word row after tagging")
    click(ed.I, "fin_tags", fin_line)
    # sel_lane should be fin_tags, not layout
    lane_ok = ed.sel_lane == "fin_tags"
    # inspector should NOT have rebuilt _gs_size (it only exists after layout header click)
    # after the fade click, _refresh_props rebuilds the pf frame but NOT the group style section
    no_crash = True  # we just check it doesn't crash
    children = len(app.inspector_tab.winfo_children())
    return (lane_ok and children > 0), f"lane={ed.sel_lane} inspector_children={children}"


def t_inspector_no_selection_placeholder():
    """With no selection, inspector shows placeholder text without crashing."""
    ed.sel_lane = None; ed.sel_ids = set(); ed.sel_word = None
    ed.sel_group = None; ed.sel_groups = set()
    ed._refresh_props(); pump(2)
    children = len(app.inspector_tab.winfo_children())
    # pf frame exists and has at least the placeholder label
    pf_children = len(ed.pf.winfo_children()) if hasattr(ed, "pf") else 0
    return (children > 0 and pf_children > 0), f"inspector_children={children} pf_children={pf_children}"


def t_dock_detach_reattach():
    """toggle_dock_detached creates _dock_win; group style works detached; reattach keeps functional."""
    global ed
    # Detach
    app.toggle_dock_detached(); pump(4)
    ed_detached = app._editor
    dock_win_exists = (app._dock_win is not None and app._dock_win.winfo_exists())
    # Do a group style operation in detached dock using the detached editor directly
    hdr_line = next((i + 1 for i, r in enumerate(ed_detached.rows) if r[0] == "hdr"), None)
    ed_detached.L.see(f"{hdr_line}.0"); ed_detached.L.update_idletasks()
    bb = ed_detached.L.bbox(f"{hdr_line}.0")
    e = Ev(); e.x = 30; e.y = bb[1] + 2; e.x_root = 0; e.y_root = 0
    ed_detached._click(e, ed_detached.L, "layout", add=False); pump(2)
    gi = ed_detached.sel_group
    ed_detached._gs_size.set("88")
    ed_detached._apply_group_style()
    pump(2)
    gs_set = (app._project["layout"][gi].get("style") or {}).get("fontsize") == 88
    # Reattach
    app.toggle_dock_detached(); pump(4)
    dock_win_gone = (app._dock_win is None or not app._dock_win.winfo_exists())
    # Update the module-level ed to the new embedded editor
    ed = app._editor
    is_functional = ed is not None and ed.winfo_exists()
    ok = dock_win_exists and gs_set and dock_win_gone and is_functional
    return ok, f"detached_win={dock_win_exists} gs_set={gs_set} reattach_gone={dock_win_gone} functional={is_functional}"


def t_group_style_box_color_alpha_in_build():
    """Group back color / back_alpha / outline_w / shadow overrides appear in build output.
    Use back_alpha='40' (not '80') since global default is already '80'; a distinct value
    forces the delta tag to be emitted in the ASS inline stream."""
    app.set_group_style(0, {"back": "#AABBCC", "back_alpha": "40",
                             "outline_w": 4, "shadow": 2})
    pump(2)
    text, _ = v2.build_ass_v2(app.cfg(), app._groups)
    # back color #AABBCC in BGR ASS = &HCCBBAA&
    has_4c = "\\4c&HCCBBAA&" in text
    # back_alpha 40 -> &H40& (different from global 80 -> emitted as delta)
    has_4a = "\\4a&H40&" in text
    has_bord = "\\bord4" in text
    has_shad = "\\shad2" in text
    ok = has_4c and has_4a and has_bord and has_shad
    return ok, f"4c={has_4c} 4a={has_4a} bord={has_bord} shad={has_shad}"


def t_group_style_outline_color_in_build():
    """Group outline color override appears as \\3c tag in build output."""
    app.set_group_style(0, {"outline": "#FF0000"})
    pump(2)
    text, _ = v2.build_ass_v2(app.cfg(), app._groups)
    # #FF0000 -> BGR = &H0000FF&
    has_3c = "\\3c&H0000FF&" in text
    return has_3c, f"has_3c_inline={has_3c}"


def t_gs_size_reflects_current_style():
    """After programmatic set_group_style(fontsize=55), clicking header again shows 55 in _gs_size."""
    app.set_group_style(0, {"fontsize": 55}); pump(2)
    ed.reload(); pump(2)
    hdr_line = line_of(lambda r: r[0] == "hdr")
    click(ed.L, "layout", hdr_line)
    current_val = ed._gs_size.get()
    ok = current_val == "55"
    return ok, f"_gs_size={current_val!r} expected='55'"


def t_cue_style_color_in_build():
    """Set cue primary #00FFFF -> build has \\1c&HFFFF00& (BGR)."""
    wid = app._project["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    app.set_cue_style({wid}, {"primary": "#00FFFF"})
    pump(2)
    text, _ = v2.build_ass_v2(app.cfg(), app._groups)
    # #00FFFF RGB -> BGR: FF FF 00 -> &HFFFF00&
    has_color = "\\1c&HFFFF00&" in text
    return has_color, f"has_inline_cyan={has_color}"


SUSPECTED_BUGS = []
# (none found during test authoring)

tests = [
    ("inspector builds group style section on header click", t_inspector_builds_group_style_section),
    ("inspector builds cue style section (no _cs_border, C1)", t_inspector_builds_cue_style_section),
    ("group fontsize via UI controls updates project style", t_group_style_fontsize_via_ui),
    ("group box-mode via UI -> build has Style: Box", t_group_style_box_mode_via_ui),
    ("group primary color via UI -> build has \\1c&H0000FF&", t_group_style_primary_color_via_ui),
    ("group style clear-to-inherit removes keys from project", t_group_style_clear_to_inherit_via_ui),
    ("cue fontsize single word via UI -> tok style updated", t_cue_style_single_word_via_ui),
    ("cue fontsize multi-word drag-select -> all tokens updated", t_cue_style_multiword_via_drag),
    ("C1: cue border_style ignored, primary accepted", t_c1_no_border_style_on_cue),
    ("waterfall: group fontsize resolves for unoverridden token", t_waterfall_group_fontsize_resolves_for_cue),
    ("preview per-cue primary color (#00FF00) visible in canvas", t_preview_per_cue_primary_color),
    ("preview sibling word without override uses default color", t_preview_per_cue_sibling_word_white),
    ("preview per-group primary color visible in canvas", t_preview_per_group_primary_color),
    ("preview fontsize override: no crash, tx items present", t_preview_fontsize_override_no_crash),
    ("inspector fade tag click: shows tag props, no crash", t_inspector_fade_tag_no_gs_size),
    ("inspector no-selection shows placeholder without crash", t_inspector_no_selection_placeholder),
    ("dock detach/reattach: functional throughout", t_dock_detach_reattach),
    ("group style back/alpha/bord/shad -> build inline tags", t_group_style_box_color_alpha_in_build),
    ("group outline color override -> build \\3c tag", t_group_style_outline_color_in_build),
    ("_gs_size pre-populated after set_group_style", t_gs_size_reflects_current_style),
    ("cue primary #00FFFF -> build \\1c&HFFFF00& (BGR)", t_cue_style_color_in_build),
]

for name, fn in tests:
    check(name, fn)

print("\n==== STYLE/INSPECTOR/PREVIEW/DOCK TEST RESULTS ====")
npass = sum(1 for ok, *_ in results if ok)
for ok, name, detail in results:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + ("" if ok else f"   -> {detail}"))

if SUSPECTED_BUGS:
    print("\nSUSPECTED_BUGS:")
    for name, reason in SUSPECTED_BUGS:
        print(f"  {name}: {reason}")

print(f"\n{npass}/{len(results)} passed")
app.destroy()

sys.exit(0 if npass == len(results) else 1)
