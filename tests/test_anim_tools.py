# tests/test_anim_tools.py — Cluster AD (tool layer): the four animation MCP tools
# over a HeadlessContext, plus resolved lists and old-tool removal. Script style with
# the same check()/t_* runner as test_mcp.py / test_globals_undo.py.
#
# Tools under test (engine spec §mcp_server/tools.py):
#   add_animation(ctx, scope, ref=None, anim=None)        -> updated entity view
#   remove_animation(ctx, scope, ref=None, anim_id=None)
#   restore_animation(ctx, scope, ref=None, anim_id=None)
#   set_animation_props(ctx, scope, ref=None, anim_id=None, partial=None)
# get_project gains per-word "anims_resolved"; get_render carries resolved lists.
import os, sys, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mcp_server.context import HeadlessContext
from mcp_server import tools
import anim_fixtures as fx

results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))


def _ctx(project=None):
    """A HeadlessContext whose session.project is the synthetic engine fixture (or a
    caller-supplied project). Synth ids/locations match anim_fixtures."""
    c = HeadlessContext()
    c.session.set_project(project if project is not None else fx.synth_project())
    return c


def _alpha(aid="g_fade", name="fade_in"):
    return fx._anim(id=aid, name=name, channel="alpha",
                    segments=[fx._seg(fx._time("cue_start"), fx._time("cue_start", 250), None, 1)])


def _scale(aid="grp_pop", name="pop"):
    return fx._anim(id=aid, name=name, channel="scale_x",
                    segments=[fx._seg(fx._time("cue_start"), fx._time("cue_start", 150), None, 120)])


# ── 3A — add_animation ────────────────────────────────────────────────────────

def t_AD_ADD_01_global_appends_and_returns_view():
    c = _ctx()
    view = tools.add_animation(c, "global", None, _alpha())
    in_dict = any(a["id"] == "g_fade" for a in c.session.project["globals"]["animations"])
    in_view = any(a["id"] == "g_fade" for a in (view.get("animations") or []))
    return (in_dict and in_view), f"dict={in_dict} view={in_view}"

def t_AD_ADD_02_group_appends_to_layout():
    c = _ctx()
    tools.add_animation(c, "group", 0, _scale())
    return (any(a["id"] == "grp_pop" for a in c.session.project["layout"][0]["animations"])), "group add"

def t_AD_ADD_03_cue_creates_anim_tag():
    c = _ctx()
    tools.add_animation(c, "tag", [0], _alpha(aid="t_a", name="fade_in"))
    tags = c.session.project["anim_tags"]
    one = [t for t in tags if set(t["ids"]) == {0}]
    return (len(one) == 1 and any(a["id"] == "t_a" for a in one[0]["anims"])), f"tags={tags}"

def t_AD_ADD_05_move_at_cue_scope_rejected():
    c = _ctx()
    bad = fx._anim(id="mv", name="slide", channel="move",
                   segments=[fx._seg(fx._time("event_start"), fx._time("event_end"),
                                     [0, 0], [100, 0])])
    try:
        tools.add_animation(c, "tag", [0], bad)
        return (False, "expected ValueError for move at tag scope")
    except ValueError as e:
        return ("move" in str(e).lower(), str(e))

def t_AD_ADD_group_id_siblings_atomic():
    # multi-channel preset arrives as sibling records sharing group_id; one add per
    # record but the group_id linkage is preserved on the carrier.
    c = _ctx()
    sx = fx._anim(id="pop_x", name="pop", channel="scale_x", group_id="pop1",
                  segments=[fx._seg(fx._time("cue_start"), fx._time("cue_start", 150), None, 120)])
    sy = fx._anim(id="pop_y", name="pop", channel="scale_y", group_id="pop1",
                  segments=[fx._seg(fx._time("cue_start"), fx._time("cue_start", 150), None, 120)])
    tools.add_animation(c, "global", None, sx)
    tools.add_animation(c, "global", None, sy)
    gids = {a.get("group_id") for a in c.session.project["globals"]["animations"]}
    return ({"pop1"} <= gids and len(c.session.project["globals"]["animations"]) == 2), f"gids={gids}"


# ── 3B — remove_animation (tombstone semantics) ───────────────────────────────

def t_AD_RM_01_own_anim_deleted():
    c = _ctx(fx.with_animations(fx.synth_project(), {"global": [_alpha()]}))
    tools.remove_animation(c, "global", None, "g_fade")
    return (not any(a["id"] == "g_fade" for a in c.session.project["globals"]["animations"])), "own deleted"

def t_AD_RM_01b_own_group_id_siblings_deleted():
    sx = fx._anim(id="pop_x", name="pop", channel="scale_x", group_id="pop1",
                  segments=[fx._seg(fx._time("cue_start"), fx._time("cue_start", 150), None, 120)])
    sy = fx._anim(id="pop_y", name="pop", channel="scale_y", group_id="pop1",
                  segments=[fx._seg(fx._time("cue_start"), fx._time("cue_start", 150), None, 120)])
    c = _ctx(fx.with_animations(fx.synth_project(), {"group": {0: [sx, sy]}}))
    tools.remove_animation(c, "group", 0, "pop_x")
    return (c.session.project["layout"][0]["animations"] == []), "siblings gone"

def t_AD_RM_02_inherited_writes_tombstone():
    c = _ctx(fx.with_animations(fx.synth_project(), {"global": [_alpha()]}))
    tools.remove_animation(c, "group", 0, "g_fade")
    supp = c.session.project["layout"][0].get("suppress", [])
    src_intact = any(a["id"] == "g_fade" for a in c.session.project["globals"]["animations"])
    # resolved list for a cue in group 0 omits g_fade; a cue in group 1 still has it
    r0 = [a["id"] for a in fx.resolved(c.session.project, 0)]
    r4 = [a["id"] for a in fx.resolved(c.session.project, 4)]
    return (supp == ["g_fade"] and src_intact and "g_fade" not in r0 and "g_fade" in r4), \
           f"supp={supp} src={src_intact} r0={r0} r4={r4}"

def t_AD_RM_03_idempotent_noop():
    c = _ctx(fx.with_animations(fx.synth_project(), {"global": [_alpha()]}))
    tools.remove_animation(c, "group", 0, "g_fade")
    before = copy.deepcopy(c.session.project)
    tools.remove_animation(c, "group", 0, "g_fade")     # already tombstoned → no-op
    return (c.session.project == before
            and c.session.project["layout"][0]["suppress"] == ["g_fade"]), "idempotent"


# ── 3C — restore_animation ────────────────────────────────────────────────────

def t_AD_RS_01_clears_tombstone():
    c = _ctx(fx.with_animations(fx.synth_project(), {"global": [_alpha()], "suppress": {0: ["g_fade"]}}))
    tools.restore_animation(c, "group", 0, "g_fade")
    supp = c.session.project["layout"][0].get("suppress", [])
    r0 = [a["id"] for a in fx.resolved(c.session.project, 0)]
    return (supp == [] and "g_fade" in r0), f"supp={supp} r0={r0}"

def t_AD_RS_02_non_tombstoned_noop():
    c = _ctx(fx.with_animations(fx.synth_project(), {"global": [_alpha()]}))
    before = copy.deepcopy(c.session.project)
    tools.restore_animation(c, "group", 0, "g_fade")    # nothing to restore → no-op
    return (c.session.project == before), "no-op"

def t_AD_RS_03_roundtrip_deep_equal():
    base = fx.with_animations(fx.synth_project(), {"global": [_alpha()]})
    c = _ctx(copy.deepcopy(base))
    tools.remove_animation(c, "group", 0, "g_fade")     # inherited → tombstone
    tools.restore_animation(c, "group", 0, "g_fade")    # clear it
    # suppress key may exist as [] vs absent; compare on the meaningful carriers
    after = c.session.project
    eq = (after["globals"]["animations"] == base["globals"]["animations"]
          and not after["layout"][0].get("suppress"))
    return (eq), f"supp={after['layout'][0].get('suppress')}"


# ── 3D — set_animation_props ──────────────────────────────────────────────────

def t_AD_SP_01_partial_merge_segments_and_enabled():
    c = _ctx(fx.with_animations(fx.synth_project(), {"global": [_alpha()]}))
    new_segs = [fx._seg(fx._time("cue_start"), fx._time("cue_start", 400), None, 1)]
    tools.set_animation_props(c, "global", None, "g_fade", {"segments": new_segs, "enabled": False})
    a = [x for x in c.session.project["globals"]["animations"] if x["id"] == "g_fade"][0]
    return (a["segments"] == new_segs and a["enabled"] is False), f"a={a}"

def t_AD_SP_01b_literal_mode_step_fields():
    c = _ctx(fx.with_animations(fx.synth_project(), {"group": {0: [_scale()]}}))
    tools.set_animation_props(c, "group", 0, "grp_pop",
                              {"mode": "cascade", "step": 80, "step_unit": "ms"})
    a = [x for x in c.session.project["layout"][0]["animations"] if x["id"] == "grp_pop"][0]
    return (a["mode"] == "cascade" and a["step"] == 80 and a["step_unit"] == "ms"), f"a={a}"

def t_AD_SP_02_retime_via_t0_t1_offsets():
    c = _ctx(fx.with_animations(fx.synth_project(), {"global": [_alpha()]}))
    # drag-retime: shift t0 by +50ms and t1 by +50ms against existing anchors
    tools.set_animation_props(c, "global", None, "g_fade",
                              {"t0": {"offset": 50}, "t1": {"offset": 50}})
    a = [x for x in c.session.project["globals"]["animations"] if x["id"] == "g_fade"][0]
    s = a["segments"][0]
    return (s["t0"]["offset"] == 50 and s["t1"]["offset"] == 300
            and s["t0"]["anchor"] == "cue_start" and s["t1"]["anchor"] == "cue_start"), f"seg={s}"

def t_AD_SP_03_invalid_partial_raises():
    c = _ctx(fx.with_animations(fx.synth_project(), {"global": [_alpha()]}))
    # overlapping segments within one animation → ValueError on the merged result
    bad = [fx._seg(fx._time("cue_start"), fx._time("cue_start", 200), None, 1),
           fx._seg(fx._time("cue_start", 100), fx._time("cue_start", 300), None, 1)]
    try:
        tools.set_animation_props(c, "global", None, "g_fade", {"segments": bad})
        return (False, "expected ValueError on overlapping segments")
    except ValueError as e:
        return (True, str(e))

def t_AD_SP_04_roundtrip_deep_equal():
    base = fx.with_animations(fx.synth_project(), {"global": [_alpha()]})
    c = _ctx(copy.deepcopy(base))
    orig = copy.deepcopy([a for a in base["globals"]["animations"] if a["id"] == "g_fade"][0]["segments"])
    tools.set_animation_props(c, "global", None, "g_fade",
                              {"segments": [fx._seg(fx._time("cue_start"), fx._time("cue_start", 999), None, 1)]})
    tools.set_animation_props(c, "global", None, "g_fade", {"segments": orig})
    return (c.session.project == base), "set_props(x) then set_props(original) == baseline"


# ── 3E — resolved lists in get_project / get_render ───────────────────────────

def t_AD_GET_01_get_project_has_resolved_lists():
    c = _ctx(fx.with_inherited_stack())
    p = tools.get_project(c)
    # carriers present
    has_carriers = ("anim_tags" in p and p["layout"][0].get("animations")
                    and p["globals"].get("animations"))
    # per-word resolved list matches engine resolve for cue 0 (in group 0 + tag)
    eng = [a["id"] for a in fx.resolved(c.session.project, 0)]
    got = _word_resolved_ids(p, 0)
    return (bool(has_carriers) and got == eng and len(eng) >= 1), f"got={got} eng={eng}"

def t_AD_GET_01b_resolved_reflects_tombstone():
    c = _ctx(fx.with_animations(fx.synth_project(), {"global": [_alpha()]}))
    tools.remove_animation(c, "group", 0, "g_fade")
    p = tools.get_project(c)
    r0 = _word_resolved_ids(p, 0)
    r4 = _word_resolved_ids(p, 4)
    return ("g_fade" not in r0 and "g_fade" in r4), f"r0={r0} r4={r4}"

def t_AD_GET_02_get_render_carries_resolved():
    # get_render carries the flat resolved list per cue. The render pipeline resolves
    # through the migration path, so compare against resolve on the migrated project
    # (what render actually emits) — not the raw fixture.
    import copy as _copy
    from engine.anim_migrate import migrate_project
    c = _ctx(fx.with_inherited_stack())
    groups = tools.get_render(c)
    w0 = groups[0]["lines"][0]["words"][0]
    mp = _copy.deepcopy(c.session.project); migrate_project(mp)
    eng = [a["id"] for a in fx.resolved(mp, 0)]
    got = [a["id"] for a in (w0.get("anims") or [])]
    return (got == eng and "grp_pop" in got and "t_color" in got), f"got={got} eng={eng}"

def t_AD_GET_03_conflict_warning_surfaces():
    c = _ctx(fx.with_same_scope_overlap())
    p = tools.get_project(c)
    res = _word_resolved(p, 0)
    warned = [a for a in res if a.get("warning") == "overlap"]
    return (len(warned) == 2), f"warned={[a.get('id') for a in warned]}"


def _word_resolved(p, wid):
    """Find a render-word's resolved animation list inside a get_project payload."""
    for grp in p["layout"]:
        for ln in grp["lines"]:
            for t in ln["toks"]:
                if t["ids"] and t["ids"][0] == wid:
                    return t.get("anims_resolved") or []
    raise KeyError(f"no cue {wid}")

def _word_resolved_ids(p, wid):
    return [a["id"] for a in _word_resolved(p, wid)]


# ── 3F — removal of old fade tools (no backward compat) ───────────────────────

def t_AD_OLD_tools_absent_from_module():
    gone = [n for n in ("make_fade_tag", "clear_fade_tag", "set_fade_tag_props",
                        "set_group_fade", "set_fade_defaults")
            if hasattr(tools, n)]
    return (gone == []), f"still present: {gone}"

def t_AD_OLD_06_payload_no_legacy_fields():
    c = _ctx(fx.with_inherited_stack())
    p = tools.get_project(c)
    bad = []
    if "fin_tags" in p or "fout_tags" in p: bad.append("fin/fout")
    if "fade_in_ms" in p.get("globals", {}) or "fade_out_ms" in p.get("globals", {}):
        bad.append("globals.fade")
    for grp in p["layout"]:
        if "fade" in grp: bad.append("group.fade")
        if "accumulate" in grp: bad.append("accumulate")
    return (bad == []), f"legacy fields present: {bad}"


_active = {n: f for n, f in list(globals().items()) if n.startswith("t_") and callable(f)}
for n, f in sorted(_active.items()): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, dd in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"\n       -> {dd}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
