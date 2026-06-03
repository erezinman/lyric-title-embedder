import os, sys
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

# ── tests ──
def t_click_selects_word():
    ln = line_of(lambda r: r[0] == "word")
    wid = ed.rows[ln - 1][4]
    click(ed.I, "fin_tags", ln)
    return (ed.sel_lane == "fin_tags" and ed.sel_ids == {wid}), f"sel_ids={ed.sel_ids}"

def t_ctrl_multiselect():
    wrows = [i + 1 for i, r in enumerate(ed.rows) if r[0] == "word"][:3]
    ids = [ed.rows[l - 1][4] for l in wrows]
    click(ed.I, "fin_tags", wrows[0])
    click(ed.I, "fin_tags", wrows[1], ctrl=True)
    click(ed.I, "fin_tags", wrows[2], ctrl=True)
    return (ed.sel_ids == set(ids)), f"sel_ids={sorted(ed.sel_ids)} want {sorted(ids)}"

def t_group_fadein():
    wrows = [i + 1 for i, r in enumerate(ed.rows) if r[0] == "word"][:3]
    ids = {ed.rows[l - 1][4] for l in wrows}
    click(ed.I, "fin_tags", wrows[0])
    click(ed.I, "fin_tags", wrows[1], ctrl=True)
    click(ed.I, "fin_tags", wrows[2], ctrl=True)
    ed._group(); pump(2)
    t = app._project["fin_tags"]
    return (len(t) == 1 and t[0]["ids"] == ids), f"tags={[sorted(x['ids']) for x in t]}"

def t_drag_group_fadein():
    wrows = [i + 1 for i, r in enumerate(ed.rows) if r[0] == "word"][:4]
    ids = {ed.rows[l - 1][4] for l in wrows}
    drag(ed.I, "fin_tags", wrows)          # plain click-drag, no modifiers
    sel_ok = ed.sel_ids == ids
    ed._group(); pump(2)
    t = app._project["fin_tags"]
    return (sel_ok and len(t) == 1 and t[0]["ids"] == ids), \
        f"sel_ok={sel_ok} tags={[sorted(x['ids']) for x in t]}"

def t_click_group_then_drill():
    wrows = [i + 1 for i, r in enumerate(ed.rows) if r[0] == "word"][:3]
    ids = {ed.rows[l - 1][4] for l in wrows}
    for k, l in enumerate(wrows):
        click(ed.O, "fout_tags", l, ctrl=(k > 0))
    ed._group(); pump(2)
    # click once -> whole group
    click(ed.O, "fout_tags", wrows[1])
    whole = ed.sel_ids == ids
    # click again same word -> drill to one
    click(ed.O, "fout_tags", wrows[1])
    drilled = ed.sel_ids == {ed.rows[wrows[1] - 1][4]}
    return (whole and drilled), f"whole={whole} drilled={drilled} sel={sorted(ed.sel_ids)}"

def t_collapse_hides_rows():
    n0 = len([r for r in ed.rows if r[0] == "word"])
    hdr = line_of(lambda r: r[0] == "hdr")
    click(ed.L, "layout", hdr, x=5)   # arrow zone
    n1 = len([r for r in ed.rows if r[0] == "word"])
    expanded_again = False
    if 0 in ed.collapsed:
        click(ed.L, "layout", line_of(lambda r: r[0] == "hdr"), x=5)
        expanded_again = (0 not in ed.collapsed)
    return (n1 < n0 and expanded_again), f"n0={n0} n1={n1} reexpanded={expanded_again}"

def t_layout_merge_adjacent():
    n0 = len(app._project["layout"])
    ed.sel_lane = "layout"; ed.sel_groups = {1, 2}; ed.sel_group = 1
    ed._group(); pump(2)
    return (len(app._project["layout"]) == n0 - 1), f"{n0}->{len(app._project['layout'])}"

def t_layout_merge_nonadjacent_rejected():
    n0 = len(app._project["layout"])
    ed.sel_lane = "layout"; ed.sel_groups = {0, 2}; ed.sel_group = 0
    ed._group(); pump(2)
    return (len(app._project["layout"]) == n0), f"{n0}->{len(app._project['layout'])} (should be unchanged)"

def t_delete_word_reversible():
    ln = line_of(lambda r: r[0] == "word")
    _, gi, li, ti, wid = ed.rows[ln - 1]
    before = len(render_words())
    ed.sel_lane = "word"; ed.sel_word = (gi, li, ti, wid); ed.sel_group = gi
    ed._toggle_del(); pump(2)
    after = len(render_words())
    # restore
    ed.sel_word = (gi, li, ti, wid)
    ed._toggle_del(); pump(2)
    restored = len(render_words())
    return (after == before - 1 and restored == before), f"{before}->{after}->{restored}"

def t_break_after():
    gi = 1
    nl0 = len(app._project["layout"][gi]["lines"])
    # find a word row in group gi with >1 token line
    row = next(r for r in ed.rows if r[0] == "word" and r[1] == gi and r[3] == 0)
    _, g, li, ti, wid = row
    ed.sel_word = (g, li, ti, wid); ed.sel_lane = "word"
    ed._break(True); pump(2)
    nl1 = len(app._project["layout"][gi]["lines"])
    return (nl1 == nl0 + 1), f"lines {nl0}->{nl1}"

def t_merge_prev():
    gi = 1
    line = app._project["layout"][gi]["lines"][0]
    nt0 = len(line["toks"])
    ed.sel_word = (gi, 0, 1, line["toks"][1]["ids"][0]); ed.sel_lane = "word"
    ed._merge(""); pump(2)
    nt1 = len(app._project["layout"][gi]["lines"][0]["toks"])
    return (nt1 == nt0 - 1), f"toks {nt0}->{nt1}"

def t_global_reactivity_render():
    # tag a fade-out (inherits global dur), then change global -> render dur changes
    ids = {0, 1, 2}
    app.make_tag("fout_tags", ids); pump(2)
    dur0 = next(w["fout_ms"] for w in render_words() if w["fout_at"] is not None)
    ed.g_fout.set("1750"); ed._set_global("fade_out_ms", ed.g_fout); pump(2)
    dur1 = next(w["fout_ms"] for w in render_words() if w["fout_at"] is not None)
    return (dur0 == 1000 and dur1 == 1750), f"{dur0}->{dur1}"

def t_tag_override_and_clear():
    # Tags now only carry {ids, trigger}; dur is a group-level fade override.
    # Test: set trigger override -> render reflects it; clear -> back to word-end default.
    ids = {3, 4, 5}
    app.make_tag("fout_tags", ids); pump(2)
    ti = len(app._project["fout_tags"]) - 1
    app.set_tag_props("fout_tags", ti, 99.0); pump(2)
    foats0 = [w["fout_at"] for w in render_words() if w["fout_at"] is not None]
    ov = any(abs(x - 99.0) < 1e-6 for x in foats0)
    # clear trigger override -> back to last-word-end default
    app.set_tag_props("fout_tags", ti, None); pump(2)
    foats = [w["fout_at"] for w in render_words() if w["fout_at"] is not None]
    reverted = all(abs(x - 99.0) > 1e-6 for x in foats)
    return (ov and reverted), f"override={ov} reverted={reverted}"

def t_layout_linger_extends_window():
    e0 = app._groups[0]["end"]
    app.set_layout_props(0, None, None, 2.0, "words"); pump(2)
    e1 = app._groups[0]["end"]
    return (abs(e1 - (e0 + 2.0)) < 1e-6), f"end {e0:.2f}->{e1:.2f}"

def t_accumulate_off_starts_at_window():
    app.set_layout_props(0, None, None, None, "off"); pump(2)
    g = app._groups[0]
    starts = {round(w["start_s"], 3) for ln in g["lines"] for w in ln["words"]}
    return (len(starts) == 1 and abs(min(starts) - g["start"]) < 1e-6), f"distinct starts={len(starts)}"

def t_undo_redo():
    n0 = len(app._project["layout"])
    ed.sel_lane = "layout"; ed.sel_groups = {1, 2}; ed.sel_group = 1; ed._group(); pump(2)
    n1 = len(app._project["layout"])
    app.undo(); pump(2); n2 = len(app._project["layout"])
    app.redo(); pump(2); n3 = len(app._project["layout"])
    return (n1 == n0 - 1 and n2 == n0 and n3 == n0 - 1), f"{n0},{n1},{n2},{n3}"

def t_one_tag_per_word():
    app.make_tag("fin_tags", {0, 1}); pump(2)
    app.make_tag("fin_tags", {1, 2}); pump(2)
    tags = app._project["fin_tags"]
    # word 1 should be only in the second tag
    has1 = [sorted(t["ids"]) for t in tags if 1 in t["ids"]]
    return (len(has1) == 1 and set(has1[0]) >= {1, 2}), f"tags={[sorted(t['ids']) for t in tags]}"

def t_tags_have_no_color_distinct_ids():
    # palette / per-tag color was removed; CTk colors by group index.
    # Tags only have {ids, trigger}.  Assert: tags are structurally correct
    # (no 'color' key, no 'dur' key) and each tag covers distinct ids.
    app.make_tag("fin_tags", {0}); app.make_tag("fin_tags", {1}); app.make_tag("fin_tags", {2}); pump(2)
    tags = app._project["fin_tags"]
    no_color = all("color" not in t for t in tags)
    no_dur   = all("dur"   not in t for t in tags)
    all_ids  = [wid for t in tags for wid in t["ids"]]
    distinct = len(all_ids) == len(set(all_ids))
    return (no_color and no_dur and distinct), \
        f"no_color={no_color} no_dur={no_dur} distinct={distinct} tags={[dict(t) for t in tags]}"

def t_serialize_roundtrip():
    app.make_tag("fout_tags", {0, 1, 2}); pump(2)
    app.set_layout_props(0, None, None, 1.0, "lines"); pump(2)
    ser = v2.serialize_cues_v2(app._project)
    cfg = app.cfg()
    p2 = v2.make_project_v2(cfg); ok = v2.apply_cues_v2(p2, ser)
    same = (len(p2["fout_tags"]) == 1 and p2["layout"][0]["accumulate"] == "lines"
            and p2["layout"][0]["linger"] == 1.0)
    return (ok and same), f"ok={ok} same={same}"

def t_build_valid():
    app.make_tag("fout_tags", {0, 1, 2}); pump(2)
    txt, n = v2.build_ass_v2(app.cfg(), app._groups)
    diff = txt.count("{") - txt.count("}")
    has_dialogue = "Dialogue:" in txt
    return (diff == 0 and has_dialogue and n == len(app._groups)), f"braces_diff={diff} events={n}"

def t_split_event_no_crash():
    row = next(r for r in ed.rows if r[0] == "word" and r[1] == 1 and r[2] == 2)
    _, gi, li, ti, wid = row
    ed.sel_word = (gi, li, ti, wid); ed.sel_lane = "word"
    n0 = len(app._project["layout"])
    ed._split_event(); pump(2)
    return (len(app._project["layout"]) == n0 + 1), f"{n0}->{len(app._project['layout'])}"

def t_empty_ops_noop():
    ed.sel_lane = None; ed.sel_ids = set(); ed.sel_word = None; ed.sel_groups = set()
    ed._group(); ed._ungroup(); ed._toggle_del(); ed._break(True); ed._merge(""); ed._split_event()
    pump(2)
    return (True, "no crash on empty selection")

def t_preview_couple():
    ed.couple.set(True)
    row = next(r for r in ed.rows if r[0] == "word" and r[1] == 1)
    ln = ed.rows.index(row) + 1
    click(ed.O, "fout_tags", ln)
    t = app.time_var.get()
    ed.couple.set(False)
    return (t > 0), f"time scrubbed to {t:.2f}"

def t_group_style_apply():
    app.set_group_style(0, {"fontsize": 96, "border_style": 3}); pump(2)
    g = app._groups[0].get("group_style", {})
    text, n = v2.build_ass_v2(app.cfg(), app._groups)
    return (g.get("fontsize") == 96 and "Style: Box," in text), f"gstyle={g}"

def t_cue_style_apply():
    wid = app._project["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    app.set_cue_style({wid}, {"primary": "#FF0000"}); pump(2)
    text, n = v2.build_ass_v2(app.cfg(), app._groups)
    return ("\\1c&H0000FF&" in text), "missing inline cue color"

def t_project_style_roundtrip():
    app.set_group_style(0, {"font": "Arial"}); pump(1)
    d = app._preset_dict()
    app._reload_groups(); pump(2)
    ok = v2.apply_cues_v2(app._project, d["cues_v2"]); app._rebuild_render(); pump(1)
    return (ok and app._project["layout"][0]["style"].get("font") == "Arial"), "roundtrip lost style"

def t_cue_preview_recolors():
    wid = app._project["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    app.set_cue_style({wid}, {"primary": "#00FF00"}); pump(2)
    g0 = app._groups[0]
    app.time_var.set((g0["start"] + g0["end"]) / 2); app._refresh_preview(); pump(2)
    fills = {app.canvas.itemcget(i, "fill").lower() for i in app.canvas.find_withtag("tx")}
    return ("#00ff00" in fills), f"fills={sorted(fills)}"

tests = [
    ("click selects word (fade-in)", t_click_selects_word),
    ("ctrl-click multi-select", t_ctrl_multiselect),
    ("group fade-in tag", t_group_fadein),
    ("drag-select fade-in group (no modifiers)", t_drag_group_fadein),
    ("click group then drill to word", t_click_group_then_drill),
    ("collapse/expand hides rows", t_collapse_hides_rows),
    ("layout merge adjacent", t_layout_merge_adjacent),
    ("layout merge non-adjacent rejected", t_layout_merge_nonadjacent_rejected),
    ("delete word reversible + render", t_delete_word_reversible),
    ("break after adds line", t_break_after),
    ("merge prev word", t_merge_prev),
    ("global reactivity -> render", t_global_reactivity_render),
    ("tag override + clear", t_tag_override_and_clear),
    ("layout linger extends window", t_layout_linger_extends_window),
    ("accumulate=off shares window start", t_accumulate_off_starts_at_window),
    ("undo/redo", t_undo_redo),
    ("one tag per word invariant", t_one_tag_per_word),
    ("tags have no color/dur, distinct ids", t_tags_have_no_color_distinct_ids),
    ("serialize roundtrip after edits", t_serialize_roundtrip),
    ("build valid (balanced braces)", t_build_valid),
    ("split event no crash", t_split_event_no_crash),
    ("empty-selection ops are no-ops", t_empty_ops_noop),
    ("preview-couple scrubs time", t_preview_couple),
    ("group style apply -> render+build", t_group_style_apply),
    ("cue style apply -> inline color", t_cue_style_apply),
    ("project style roundtrip", t_project_style_roundtrip),
    ("cue style recolors live preview", t_cue_preview_recolors),
]
for name, fn in tests:
    check(name, fn)

print("\n==== UI TEST RESULTS ====")
npass = sum(1 for ok, *_ in results if ok)
for ok, name, detail in results:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + ("" if ok else f"   -> {detail}"))
print(f"\n{npass}/{len(results)} passed")
app.destroy()

sys.exit(0 if npass == len(results) else 1)
