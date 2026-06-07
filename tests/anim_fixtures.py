# tests/anim_fixtures.py — Engine (Python) fixtures for the animations feature.
#
# Mirrors the TS builders from the test design §1.1–§1.4 (time / seg / anim /
# withAnimations / named convenience fixtures) but emits the *settled* project-dict
# shapes (questions §1.2, reconciliation §2) consumed by engine/anim.py.
#
# All builders are pure (return fresh dicts / deep copies) so a test can capture a
# baseline, mutate, and assert deep-equality for the roundtrip facet.
import os, sys, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import engine

# ── shared literal builders (the _anim / _time / _seg helpers, §1.4) ──────────

def _time(anchor, offset=0, unit="ms"):
    """AnimTime → {anchor, offset, unit}."""
    return {"anchor": anchor, "offset": offset, "unit": unit}


def _seg(t0, t1, frm=None, to=1, accel=1):
    """AnimSegment. `frm` maps to the schema field "from" (a Python keyword)."""
    return {"t0": t0, "t1": t1, "from": frm, "to": to, "accel": accel}


def _anim(**p):
    """Animation with sane defaults — mirrors the TS anim(partial) builder.

    Accepts mode/step/step_unit/group_id/stagger as optional keys; only emits the
    optional keys the caller passed (so deep-equality baselines stay tight)."""
    a = {
        "id": p.get("id", "a1"),
        "name": p.get("name", "custom"),
        "channel": p.get("channel", "alpha"),
        "segments": p.get("segments",
                          [_seg(_time("cue_start"), _time("cue_start", 250), None, 1)]),
        "enabled": p.get("enabled", True),
    }
    a["group_id"] = p.get("group_id")            # None unless a multi-channel preset
    if "mode" in p:
        a["mode"] = p["mode"]
    if "step" in p:
        a["step"] = p["step"]
    if "step_unit" in p:
        a["step_unit"] = p["step_unit"]
    if "stagger" in p:
        a["stagger"] = p["stagger"]
    return a


# ── synthetic engine project (hand-computable times for anchor math) ──────────
#
# A tiny two-group project whose word times are round numbers so AE-ANC-* can
# compute expected seconds by hand. Word ids and times:
#   group 0 "Verse"  line0: w0 [1.000..1.500]  w1 [1.500..2.000]
#                    line1: w2 [2.000..2.500]  w3 [2.500..3.000]
#   group 1 "Chorus" line0: w4 [4.000..4.500]  w5 [4.500..5.000]
def synth_project():
    words = [
        {"text": "aa", "start": 1.000, "end": 1.500},   # 0
        {"text": "bb", "start": 1.500, "end": 2.000},   # 1
        {"text": "cc", "start": 2.000, "end": 2.500},   # 2
        {"text": "dd", "start": 2.500, "end": 3.000},   # 3
        {"text": "ee", "start": 4.000, "end": 4.500},   # 4
        {"text": "ff", "start": 4.500, "end": 5.000},   # 5
    ]

    def tok(i):
        return {"ids": [i], "sep": "", "del": False, "style": {}}

    def grp(label, lines):
        return {"label": label, "lines": lines, "accumulate": "words",
                "win_start": None, "win_end": None, "linger": None,
                "del": False, "style": {}, "fade": {},
                "animations": [], "suppress": []}

    layout = [
        grp("Verse", [{"toks": [tok(0), tok(1)]}, {"toks": [tok(2), tok(3)]}]),
        grp("Chorus", [{"toks": [tok(4), tok(5)]}]),
    ]
    return {
        "words": words, "layout": layout,
        "fin_tags": [], "fout_tags": [],
        "globals": {**dict(engine.model.BUILTIN), "animations": []},
        "anim_tags": [],
    }


# ── withAnimations(p, spec) — the headline builder (§1.2) ─────────────────────
#
# spec keys (all optional):
#   global:   [Animation]                      -> p["globals"]["animations"]
#   group:    {gi: [Animation]}                -> p["layout"][gi]["animations"]
#   suppress: {gi: [anim_id]}                  -> p["layout"][gi]["suppress"]
#   tags:     [{ids, anims, suppress}]         -> p["anim_tags"]
def with_animations(p, spec):
    p = copy.deepcopy(p)
    p.setdefault("globals", {})
    p["globals"].setdefault("animations", [])
    p.setdefault("anim_tags", [])
    if "global" in spec:
        p["globals"]["animations"] = copy.deepcopy(spec["global"])
    for gi, anims in (spec.get("group") or {}).items():
        p["layout"][gi].setdefault("animations", [])
        p["layout"][gi]["animations"] = copy.deepcopy(anims)
    for gi, ids in (spec.get("suppress") or {}).items():
        p["layout"][gi].setdefault("suppress", [])
        p["layout"][gi]["suppress"] = list(ids)
    if "tags" in spec:
        p["anim_tags"] = copy.deepcopy(spec["tags"])
    return p


# ── named convenience fixtures (§1.3) ─────────────────────────────────────────

def with_inherited_stack():
    """Global fade-in + group-0 pop + a 2-cue tag color flash → a cue in group 0
    that is also in the tag resolves an Inherited(3) list."""
    return with_animations(synth_project(), {
        "global": [_anim(id="g_fade", name="fade_in", channel="alpha",
                         segments=[_seg(_time("cue_start"), _time("cue_start", 250), None, 1)])],
        "group": {0: [_anim(id="grp_pop", name="pop", channel="scale_x",
                            segments=[_seg(_time("cue_start"), _time("cue_start", 150), None, 120)])]},
        "tags": [{"ids": [0, 1],
                  "anims": [_anim(id="t_color", name="color_flash", channel="primary",
                                  segments=[_seg(_time("cue_start"), _time("cue_end"),
                                                 "#FFFFFF", "#FF0000")])],
                  "suppress": []}],
    })


def with_tombstone():
    """Global fade-in + group-0 suppress:["g_fade"] (tombstone)."""
    return with_animations(synth_project(), {
        "global": [_anim(id="g_fade", name="fade_in", channel="alpha")],
        "suppress": {0: ["g_fade"]},
    })


def with_overlap_conflict():
    """Cross-scope conflict: global scale_x pop (cue_start..+200ms) and a cue-tag
    scale_x stretch (cue_start+50..+250ms) overlapping on cue 0."""
    return with_animations(synth_project(), {
        "global": [_anim(id="pop", name="pop", channel="scale_x",
                         segments=[_seg(_time("cue_start"), _time("cue_start", 200), None, 120)])],
        "tags": [{"ids": [0],
                  "anims": [_anim(id="stretch", name="stretch", channel="scale_x",
                                  segments=[_seg(_time("cue_start", 50), _time("cue_start", 250),
                                                 None, 140)])],
                  "suppress": []}],
    })


def with_same_scope_overlap():
    """Same-scope overlap: group-0 pop + group-0 stretch on scale_x, overlapping
    → both emitted + warning."""
    return with_animations(synth_project(), {
        "group": {0: [
            _anim(id="pop", name="pop", channel="scale_x",
                  segments=[_seg(_time("cue_start"), _time("cue_start", 200), None, 120)]),
            _anim(id="stretch", name="stretch", channel="scale_x",
                  segments=[_seg(_time("cue_start", 50), _time("cue_start", 250), None, 140)]),
        ]},
    })


def with_multi_group_tag():
    """A tag whose ids span groups 0 and 1 (for span-clamping AE-ANC-15)."""
    return with_animations(synth_project(), {
        "tags": [{"ids": [0, 1, 4, 5],
                  "anims": [_anim(id="span_fade", name="fade_in", channel="alpha",
                                  segments=[_seg(_time("span_start"), _time("span_start", 300),
                                                 None, 1)])],
                  "suppress": []}],
    })


def with_chained_anim():
    """One alpha animation with two non-overlapping segments:
    0→50% in 20ms, 50→100% in 80ms (for compiler chained-\\t ordering)."""
    return with_animations(synth_project(), {
        "tags": [{"ids": [0],
                  "anims": [_anim(id="chain", name="fade_in", channel="alpha",
                                  segments=[
                                      _seg(_time("cue_start"), _time("cue_start", 20), None, 0.5),
                                      _seg(_time("cue_start", 20), _time("cue_start", 100), 0.5, 1.0),
                                  ])],
                  "suppress": []}],
    })


# ── legacy project for migration (§1.3 withMigratableLegacyProject) ───────────
#
# Built from the real aligned_lyrics.json via the CURRENT engine so the gold .ass
# can be captured by today's render+ass path (no golden file checked in). Carries
# fin_tags/fout_tags + group.fade + globals fade defaults + accumulate.
LEGACY_CFG = {
    "json_path": "aligned_lyrics.json", "skip_dashes": True, "group_by": "section",
    "font": "DejaVu Sans", "fontsize": 64, "bold": True, "align": 2,
    "play_w": 1920, "play_h": 1080, "margin_l": 80, "margin_r": 80, "margin_v": 60,
    "primary_color": "#FFFFFF", "outline_color": "#000000", "back_color": "#000000",
    "back_alpha": "80", "border_style": 1, "outline_w": 3, "shadow": 0, "wrap_style": 2,
    "pos": None,
}


def legacy_project():
    """A representative legacy project: fin/fout tags, a group.fade override, custom
    globals fade defaults, and a per-group accumulate. Pre-migration input only."""
    p = engine.make_project(LEGACY_CFG)
    p["globals"]["fade_in_ms"] = 300
    p["globals"]["fade_out_ms"] = 800
    # fade-in tag on the first word of group 0 (with explicit trigger -> absolute s)
    first_id = p["layout"][0]["lines"][0]["toks"][0]["ids"][0]
    last_line = p["layout"][0]["lines"][-1]["toks"]
    last_id = last_line[-1]["ids"][-1]
    p["fin_tags"] = [{"ids": [first_id], "trigger": None}]
    p["fout_tags"] = [{"ids": [last_id], "trigger": p["words"][last_id]["end"] + 0.5}]
    # group-scope fade override + accumulate variety
    p["layout"][0]["fade"] = {"fade_in_ms": 500, "fade_out_ms": None}
    p["layout"][0]["accumulate"] = "lines"
    if len(p["layout"]) > 1:
        p["layout"][1]["accumulate"] = "off"
    return p


def legacy_gold_ass():
    """Capture the .ass bytes the CURRENT (pre-migration) engine emits for
    legacy_project(). Computed at test time — no golden file checked in."""
    p = legacy_project()
    groups = engine.project_to_render(p)
    text, _n = engine.build_ass(LEGACY_CFG, groups)
    return text


# ── resolved-list helper (the function under test) ────────────────────────────

def resolved(project, wid):
    """Flat resolved animation list for the cue whose first id is `wid`.
    Locates (gi, li, ti) by scanning the layout, then calls anim.resolve_animations."""
    from engine import anim
    for gi, g in enumerate(project["layout"]):
        for li, line in enumerate(g["lines"]):
            for ti, tok in enumerate(line["toks"]):
                if tok["ids"] and tok["ids"][0] == wid:
                    return anim.resolve_animations(project, gi, li, ti)
    raise KeyError(f"no cue with first id {wid}")
