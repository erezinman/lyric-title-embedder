# tests/test_engine_model.py — MODEL & STYLE RESOLUTION tests (headless, TDD)
import os, sys, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import engine
from engine import mutations as mut

# ---------------------------------------------------------------------------
# Base configs
# ---------------------------------------------------------------------------
CFG = {
    "json_path": "aligned_lyrics.json", "skip_dashes": True, "group_by": "section",
    "font": "DejaVu Sans", "fontsize": 64, "bold": True, "align": 2, "fade_ms": 250,
    "play_w": 1920, "play_h": 1080, "margin_l": 80, "margin_r": 80, "margin_v": 60,
    "primary_color": "#FFFFFF", "outline_color": "#000000", "back_color": "#000000",
    "back_alpha": "80", "border_style": 1, "outline_w": 3, "shadow": 0, "wrap_style": 2,
}
# Second config: group_by=line, skip_dashes=False
CFG2 = dict(CFG, group_by="line", skip_dashes=False)

# Canonical gctx used in resolve_style tests
GCTX = {
    "font": "Arial", "fontsize": 12, "bold": False, "primary": "#FF0000",
    "outline": "#000000", "back": "#000000", "back_alpha": "80",
    "outline_w": 2, "shadow": 0, "border_style": 1,
}

# ---------------------------------------------------------------------------
# Test harness
# ---------------------------------------------------------------------------
results = []

def check(name, fn):
    try:
        ok, detail = fn()
        results.append((ok, name, detail))
    except Exception as e:
        import traceback
        results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))


# ===========================================================================
# STYLE_KEYS / CUE_STYLE_KEYS membership
# ===========================================================================

def t_style_keys_exact_10():
    """STYLE_KEYS has exactly 10 entries, all expected names present."""
    expected = {"font", "fontsize", "bold", "primary", "outline", "back",
                "back_alpha", "outline_w", "shadow", "border_style"}
    ok = set(engine.STYLE_KEYS) == expected and len(engine.STYLE_KEYS) == 10
    return ok, f"got {engine.STYLE_KEYS}"


def t_cue_style_keys_exact_9():
    """CUE_STYLE_KEYS has exactly 9 entries; border_style is absent."""
    ok = (len(engine.CUE_STYLE_KEYS) == 9
          and "border_style" not in engine.CUE_STYLE_KEYS
          and set(engine.CUE_STYLE_KEYS) == set(engine.STYLE_KEYS) - {"border_style"})
    return ok, f"CUE={engine.CUE_STYLE_KEYS}"


def t_cue_keys_subset_of_style_keys():
    """Every key in CUE_STYLE_KEYS is in STYLE_KEYS (subset relationship)."""
    ok = all(k in engine.STYLE_KEYS for k in engine.CUE_STYLE_KEYS)
    return ok, f"CUE_STYLE_KEYS must be a strict subset of STYLE_KEYS"


def t_builtin_defaults():
    """BUILTIN has exactly fade_in_ms=250, fade_out_ms=1000, linger=0.0."""
    b = engine.BUILTIN
    ok = (b.get("fade_in_ms") == 250
          and b.get("fade_out_ms") == 1000
          and b.get("linger") == 0.0
          and len(b) == 3)
    return ok, f"BUILTIN={b}"


# ===========================================================================
# resolve_style — inheritance chain
# ===========================================================================

def t_resolve_style_all_from_gctx():
    """When token and group styles are empty, all 10 keys come from gctx."""
    tok = {"style": {}}
    grp = {"style": {}}
    r = engine.resolve_style(tok, grp, GCTX)
    ok = r == GCTX
    return ok, f"got {r}"


def t_resolve_style_cue_wins_over_group_and_gctx():
    """Cue-level font overrides both group and gctx."""
    tok = {"style": {"font": "Courier"}}
    grp = {"style": {"font": "Helvetica"}}
    r = engine.resolve_style(tok, grp, dict(GCTX, font="Arial"))
    ok = r["font"] == "Courier"
    return ok, f"font={r['font']}"


def t_resolve_style_group_wins_over_gctx():
    """Group fontsize overrides gctx when cue has no fontsize."""
    tok = {"style": {}}
    grp = {"style": {"fontsize": 50}}
    r = engine.resolve_style(tok, grp, dict(GCTX, fontsize=12))
    ok = r["fontsize"] == 50
    return ok, f"fontsize={r['fontsize']}"


def t_resolve_style_border_style_cue_ignored():
    """border_style set at cue level is silently ignored; group or gctx is used."""
    tok = {"style": {"border_style": 99}}
    grp = {"style": {}}
    gctx = dict(GCTX, border_style=1)
    r = engine.resolve_style(tok, grp, gctx)
    # cue value 99 must NOT appear; gctx fallback 1 is used
    ok = r["border_style"] == 1
    return ok, f"border_style={r['border_style']}"


def t_resolve_style_border_style_group_wins_over_gctx():
    """border_style set at group level overrides gctx."""
    tok = {"style": {"border_style": 99}}  # should be ignored
    grp = {"style": {"border_style": 3}}
    gctx = dict(GCTX, border_style=1)
    r = engine.resolve_style(tok, grp, gctx)
    ok = r["border_style"] == 3
    return ok, f"border_style={r['border_style']}"


def t_resolve_style_none_token_and_group_uses_gctx():
    """resolve_style(None, None, gctx) returns a copy of gctx for all keys."""
    r = engine.resolve_style(None, None, GCTX)
    ok = r == GCTX
    return ok, f"got {r}"


def t_resolve_style_style_none_treated_as_empty():
    """token/group with style=None behave like style={} (inherit from gctx)."""
    tok = {"style": None}
    grp = {"style": None}
    r = engine.resolve_style(tok, grp, GCTX)
    ok = r == GCTX
    return ok, f"got {r}"


def t_resolve_style_falsy_fontsize_zero_not_unset():
    """fontsize=0 is falsy but valid: cue-level 0 wins over group and gctx."""
    gctx = dict(GCTX, fontsize=12)
    tok = {"style": {"fontsize": 0}}
    grp = {"style": {"fontsize": 50}}
    r = engine.resolve_style(tok, grp, gctx)
    ok = r["fontsize"] == 0
    return ok, f"fontsize={r['fontsize']} (should be 0, not 12 or 50)"


def t_resolve_style_falsy_bold_false_not_unset():
    """bold=False is falsy but valid: cue-level False wins over gctx True."""
    gctx = dict(GCTX, bold=True)
    tok = {"style": {"bold": False}}
    grp = {"style": {}}
    r = engine.resolve_style(tok, grp, gctx)
    ok = r["bold"] is False
    return ok, f"bold={r['bold']!r} (should be False, not True)"


def t_resolve_style_falsy_shadow_zero_not_unset():
    """shadow=0 at cue-level overrides a non-zero gctx value."""
    gctx = dict(GCTX, shadow=5)
    tok = {"style": {"shadow": 0}}
    grp = {"style": {}}
    r = engine.resolve_style(tok, grp, gctx)
    ok = r["shadow"] == 0
    return ok, f"shadow={r['shadow']} (should be 0, not 5)"


def t_resolve_style_partial_override_others_inherited():
    """Setting only font at cue level leaves all other keys from gctx."""
    tok = {"style": {"font": "Mono"}}
    grp = {"style": {}}
    r = engine.resolve_style(tok, grp, GCTX)
    # font overridden, rest inherited from gctx
    other_ok = all(r[k] == GCTX[k] for k in GCTX if k != "font")
    ok = r["font"] == "Mono" and other_ok
    return ok, f"font={r['font']} fontsize={r['fontsize']}"


def t_resolve_style_primary_black_not_unset():
    """primary='#000000' is a non-empty string and must not be treated as unset."""
    gctx = dict(GCTX, primary="#FFFFFF")
    tok = {"style": {"primary": "#000000"}}
    grp = {"style": {}}
    r = engine.resolve_style(tok, grp, gctx)
    ok = r["primary"] == "#000000"
    return ok, f"primary={r['primary']} (should be #000000, not #FFFFFF)"


# ===========================================================================
# make_project structure
# ===========================================================================

def t_make_project_words_are_atoms():
    """Every word in project['words'] has text, start, end; no sub-lists."""
    p = engine.make_project(CFG)
    for i, w in enumerate(p["words"]):
        assert isinstance(w["text"], str), f"words[{i}].text not str"
        assert isinstance(w["start"], (int, float)), f"words[{i}].start"
        assert isinstance(w["end"], (int, float)), f"words[{i}].end"
    return True, f"words={len(p['words'])} all atoms"


def t_make_project_every_tok_has_style_dict():
    """Every token in every layout group has style:{}."""
    p = engine.make_project(CFG)
    for gi, g in enumerate(p["layout"]):
        for li, ln in enumerate(g["lines"]):
            for ti, tok in enumerate(ln["toks"]):
                assert isinstance(tok.get("style"), dict), \
                    f"layout[{gi}].lines[{li}].toks[{ti}].style not dict"
    return True, "all tokens have style:{}"


def t_make_project_every_layout_event_has_style_dict():
    """Every layout event has style:{}."""
    p = engine.make_project(CFG)
    for gi, g in enumerate(p["layout"]):
        assert isinstance(g.get("style"), dict), f"layout[{gi}].style not dict"
    return True, f"all {len(p['layout'])} events have style:{{}}"


def t_make_project_section_grouping():
    """group_by='section' groups consecutive same-section lines into one event."""
    p = engine.make_project(CFG)
    # 8 unique sections in the data -> 8 groups, each with multiple lines
    n_events = len(p["layout"])
    multi_line = sum(1 for g in p["layout"] if len(g["lines"]) > 1)
    ok = n_events == 8 and multi_line > 0
    return ok, f"events={n_events} multi_line_groups={multi_line}"


def t_make_project_line_grouping_one_event_per_line():
    """group_by='line' yields one layout event per non-skipped line."""
    p = engine.make_project(dict(CFG, group_by="line"))
    # Each event has exactly 1 line
    ok = all(len(g["lines"]) == 1 for g in p["layout"])
    return ok, f"events={len(p['layout'])} all_single_line={ok}"


def t_make_project_skip_dashes_true_fewer_words():
    """skip_dashes=True excludes dash-only lines; fewer words than skip_dashes=False."""
    p_skip = engine.make_project(dict(CFG, skip_dashes=True))
    p_all = engine.make_project(dict(CFG, skip_dashes=False))
    ok = len(p_skip["words"]) < len(p_all["words"])
    return ok, f"skip={len(p_skip['words'])} vs no_skip={len(p_all['words'])}"


def t_make_project_skip_dashes_false_more_events():
    """skip_dashes=False includes dash-only lines, producing more layout events."""
    p_skip = engine.make_project(dict(CFG, group_by="line", skip_dashes=True))
    p_all = engine.make_project(dict(CFG, group_by="line", skip_dashes=False))
    ok = len(p_all["layout"]) > len(p_skip["layout"])
    return ok, f"with_dashes={len(p_all['layout'])} vs no_dashes={len(p_skip['layout'])}"


def t_make_project_tokens_reference_valid_word_ids():
    """Every token id is a valid index into project['words']."""
    p = engine.make_project(CFG)
    n = len(p["words"])
    for gi, g in enumerate(p["layout"]):
        for li, ln in enumerate(g["lines"]):
            for ti, tok in enumerate(ln["toks"]):
                for wid in tok["ids"]:
                    assert 0 <= wid < n, f"invalid wid {wid} in layout[{gi}][{li}][{ti}]"
    return True, f"words={n} all ids valid"


def t_make_project_globals_contains_builtin_keys():
    """project['globals'] starts with BUILTIN values."""
    p = engine.make_project(CFG)
    g = p["globals"]
    ok = (g.get("fade_in_ms") == engine.BUILTIN["fade_in_ms"]
          and g.get("fade_out_ms") == engine.BUILTIN["fade_out_ms"]
          and g.get("linger") == engine.BUILTIN["linger"])
    return ok, f"globals={g}"


# ===========================================================================
# project_to_render — timing math
# ===========================================================================

def t_render_groups_sorted_by_start():
    """project_to_render output is sorted ascending by start time."""
    p = engine.make_project(CFG)
    g = engine.project_to_render(p)
    starts = [r["start"] for r in g]
    ok = starts == sorted(starts)
    return ok, f"starts={starts}"


def t_render_accumulate_words_distinct_starts():
    """accumulate='words': tokens in a multi-word line get distinct start_s values."""
    p = engine.make_project(CFG)
    # group 0 has 3 lines with multiple words — use accumulate='words' (default)
    p["layout"][0]["accumulate"] = "words"
    g = engine.project_to_render(p)
    starts = [w["start_s"] for ln in g[0]["lines"] for w in ln["words"]]
    ok = len(set(starts)) > 1  # not all the same
    return ok, f"distinct_starts={len(set(starts))} total={len(starts)}"


def t_render_accumulate_lines_same_start_within_line():
    """accumulate='lines': all tokens in a line share the same start_s."""
    p = engine.make_project(CFG)
    p["layout"][0]["accumulate"] = "lines"
    g = engine.project_to_render(p)
    r0 = g[0]
    # every line's words must all have the same start_s
    ok = True
    for ln in r0["lines"]:
        s = {w["start_s"] for w in ln["words"]}
        if len(s) > 1:
            ok = False
            break
    return ok, f"accumulate=lines line-internal start equality holds={ok}"


def t_render_accumulate_off_all_same_start_equals_win_s():
    """accumulate='off': every token in the event gets start_s = win_s."""
    p = engine.make_project(CFG)
    p["layout"][0]["accumulate"] = "off"
    g = engine.project_to_render(p)
    r0 = g[0]
    win_s = r0["start"]
    starts = [w["start_s"] for ln in r0["lines"] for w in ln["words"]]
    ok = all(s == win_s for s in starts)
    return ok, f"win_s={win_s} starts_set={set(starts)}"


def t_render_window_end_equals_max_word_end_plus_global_linger():
    """With linger=0 (default), event end = max word end."""
    p = engine.make_project(CFG)
    # group 0, linger=0 (default)
    all_ids = [i for ln in p["layout"][0]["lines"] for t in ln["toks"] for i in t["ids"]]
    max_end = max(p["words"][i]["end"] for i in all_ids)
    g = engine.project_to_render(p)
    ok = abs(g[0]["end"] - max_end) < 1e-9
    return ok, f"end={g[0]['end']} max_word_end={max_end}"


def t_render_per_group_linger_overrides_global():
    """Per-group linger overrides global linger for that event's end time."""
    p = engine.make_project(CFG)
    p["globals"]["linger"] = 1.0   # global
    p["layout"][0]["linger"] = 5.0  # per-group override
    all_ids = [i for ln in p["layout"][0]["lines"] for t in ln["toks"] for i in t["ids"]]
    max_end = max(p["words"][i]["end"] for i in all_ids)
    g = engine.project_to_render(p)
    expected = max_end + 5.0
    ok = abs(g[0]["end"] - expected) < 1e-9
    return ok, f"end={g[0]['end']} expected={expected}"


def t_render_deleted_tokens_excluded():
    """Tokens with del=True are excluded from render output."""
    p = engine.make_project(CFG)
    # Delete all but first token in first line of group 0
    first_line_toks = p["layout"][0]["lines"][0]["toks"]
    for tok in first_line_toks[1:]:
        tok["del"] = True
    g = engine.project_to_render(p)
    # First line in render should have exactly 1 word
    ok = len(g[0]["lines"][0]["words"]) == 1
    return ok, f"rendered_words_in_line0={len(g[0]['lines'][0]['words'])}"


def t_render_all_deleted_event_dropped():
    """A layout event where ALL tokens are deleted is omitted from render output."""
    p = engine.make_project(CFG)
    original_count = len(engine.project_to_render(p))
    for ln in p["layout"][0]["lines"]:
        for tok in ln["toks"]:
            tok["del"] = True
    g = engine.project_to_render(p)
    ok = len(g) == original_count - 1
    return ok, f"before={original_count} after={len(g)}"


def t_render_event_end_extended_by_fout_tail():
    """fout_tag with large trigger+dur extends event end beyond natural end."""
    p = engine.make_project(CFG)
    wid0 = p["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    mut.make_tag(p, "fout_tags", [wid0])
    # Set trigger far beyond win_e and dur=2000ms -> fade_end = 25.0 + 2.0 = 27.0
    mut.set_tag_props(p, "fout_tags", 0, 25.0, 2000)
    g = engine.project_to_render(p)
    ok = abs(g[0]["end"] - 27.0) < 1e-9
    return ok, f"end={g[0]['end']} expected=27.0"


def t_render_fout_tag_no_trigger_uses_word_end():
    """fout_tag with trigger=None defaults fout_at to the tagged word's end time."""
    p = engine.make_project(CFG)
    wid0 = p["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    word_end = p["words"][wid0]["end"]
    mut.make_tag(p, "fout_tags", [wid0])
    # trigger=None, dur=None
    g = engine.project_to_render(p)
    w0 = g[0]["lines"][0]["words"][0]
    ok = abs(w0["fout_at"] - word_end) < 1e-9
    return ok, f"fout_at={w0['fout_at']} word_end={word_end}"


def t_render_fin_tag_trigger_and_dur_explicit():
    """fin_tag with explicit trigger overrides start_s; explicit dur overrides fin_ms."""
    p = engine.make_project(CFG)
    wid0 = p["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    mut.make_tag(p, "fin_tags", [wid0])
    mut.set_tag_props(p, "fin_tags", 0, 10.0, 500)
    g = engine.project_to_render(p)
    w0 = g[0]["lines"][0]["words"][0]
    ok = abs(w0["start_s"] - 10.0) < 1e-9 and w0["fin_ms"] == 500
    return ok, f"start_s={w0['start_s']} fin_ms={w0['fin_ms']}"


def t_render_group_style_passed_through():
    """group_style in render-group reflects the layout event's style dict."""
    p = engine.make_project(CFG)
    p["layout"][0]["style"] = {"font": "TestFont", "fontsize": 99}
    g = engine.project_to_render(p)
    ok = g[0]["group_style"] == {"font": "TestFont", "fontsize": 99}
    return ok, f"group_style={g[0]['group_style']}"


def t_render_win_start_win_end_explicit_override():
    """win_start and win_end on a layout event are honoured in render output."""
    p = engine.make_project(CFG)
    p["layout"][0]["win_start"] = 1.0
    p["layout"][0]["win_end"] = 100.0
    g = engine.project_to_render(p)
    ok = abs(g[0]["start"] - 1.0) < 1e-9 and abs(g[0]["end"] - 100.0) < 1e-9
    return ok, f"start={g[0]['start']} end={g[0]['end']}"


def t_render_deleted_layout_event_skipped():
    """Layout event with del=True is skipped entirely by project_to_render."""
    p = engine.make_project(CFG)
    n_before = len(engine.project_to_render(p))
    p["layout"][0]["del"] = True
    g = engine.project_to_render(p)
    ok = len(g) == n_before - 1
    return ok, f"before={n_before} after={len(g)}"


# ===========================================================================
# Discovery loop
# ===========================================================================
SUSPECTED_BUGS = []
# (none found — all engine behaviours matched expectations)

active_tests = {name: fn for name, fn in globals().items()
                if name.startswith("t_") and name not in SUSPECTED_BUGS}

for name, fn in active_tests.items():
    check(name, fn)

npass = sum(1 for ok, *_ in results if ok)
for ok, name, detail in results:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + ("" if ok else f"\n       -> {detail}"))

print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
