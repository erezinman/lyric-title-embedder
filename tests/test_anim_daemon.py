# tests/test_anim_daemon.py — Cluster AD (HTTP/WS layer): the four animation tools
# dispatched through /api/call, WS state broadcast, autosave, resolved lists in
# /api/state + /api/render, and the 400 unknown-tool path for the removed fade tools.
# Script style with the same check()/t_* runner as test_daemon.py / test_autosave.py.
import os, sys, json, time, shutil, tempfile, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from starlette.testclient import TestClient
from daemon.hub import Hub
from daemon.context import DaemonContext
from daemon.app import build_app
import anim_fixtures as fx

results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))


def _client(project=None):
    """TestClient over a DaemonContext whose session.project is the synth fixture."""
    hub = Hub(); ctx = DaemonContext(hub)
    ctx.session.set_project(project if project is not None else fx.synth_project())
    app = build_app(ctx, hub, token=None, projects_dir="/tmp/_kss_anim_projects")
    return TestClient(app), ctx


def _alpha(aid="g_fade", name="fade_in"):
    return fx._anim(id=aid, name=name, channel="alpha",
                    segments=[fx._seg(fx._time("cue_start"), fx._time("cue_start", 250), None, 1)])


def _call(c, tool, **args):
    return c.post("/api/call", json={"tool": tool, "args": args})


# ── 3A — add_animation over /api/call ─────────────────────────────────────────

def t_AD_ADD_01_global_add_200_and_state():
    c, _ = _client()
    r = _call(c, "add_animation", scope="global", ref=None, anim=_alpha())
    assert r.status_code == 200, r.text
    st = c.get("/api/state").json()
    return (any(a["id"] == "g_fade" for a in st["globals"].get("animations", []))), f"r={r.json()}"

def t_AD_ADD_02_group_add():
    c, _ = _client()
    r = _call(c, "add_animation", scope="group", ref=0,
              anim=fx._anim(id="grp_pop", name="pop", channel="scale_x",
                            segments=[fx._seg(fx._time("cue_start"), fx._time("cue_start", 150), None, 120)]))
    assert r.status_code == 200, r.text
    st = c.get("/api/state").json()
    return (any(a["id"] == "grp_pop" for a in st["layout"][0].get("animations", []))), "group add"

def t_AD_ADD_03_cue_tag_add():
    c, _ = _client()
    r = _call(c, "add_animation", scope="tag", ref=[0], anim=_alpha(aid="t_a"))
    assert r.status_code == 200, r.text
    st = c.get("/api/state").json()
    tags = [t for t in st["anim_tags"] if set(t["ids"]) == {0}]
    return (len(tags) == 1 and any(a["id"] == "t_a" for a in tags[0]["anims"])), f"tags={st['anim_tags']}"

def t_AD_ADD_04_bad_scope_4xx():
    c, _ = _client()
    r = _call(c, "add_animation", scope="bogus", ref=None, anim=_alpha())
    return (r.status_code >= 400 and "error" in r.json()), f"status={r.status_code}"

def t_AD_ADD_04b_engine_validation_422():
    c, _ = _client()
    bad = fx._anim(id="x", name="bad", channel="not_a_channel")
    r = _call(c, "add_animation", scope="global", ref=None, anim=bad)
    return (r.status_code == 422 and "error" in r.json()), f"status={r.status_code} body={r.text}"

def t_AD_ADD_05_move_at_cue_scope_422():
    c, _ = _client()
    bad = fx._anim(id="mv", name="slide", channel="move",
                   segments=[fx._seg(fx._time("event_start"), fx._time("event_end"), [0, 0], [100, 0])])
    r = _call(c, "add_animation", scope="tag", ref=[0], anim=bad)
    return (r.status_code == 422 and "move" in r.text.lower()), f"status={r.status_code} body={r.text}"

def t_AD_ADD_06_broadcast_one_state_frame():
    c, _ = _client()
    with c.websocket_connect("/ws") as ws:
        first = ws.receive_json()
        assert first["type"] == "state"
        _call(c, "add_animation", scope="global", ref=None, anim=_alpha())
        msg = ws.receive_json()
    return (msg["type"] == "state"
            and any(a["id"] == "g_fade" for a in msg["state"]["globals"].get("animations", []))), \
           f"msg_type={msg['type']}"


# ── 3B/3C — remove + restore over /api/call ───────────────────────────────────

def t_AD_RM_02_inherited_tombstone_via_api():
    c, _ = _client(fx.with_animations(fx.synth_project(), {"global": [_alpha()]}))
    r = _call(c, "remove_animation", scope="group", ref=0, anim_id="g_fade")
    assert r.status_code == 200, r.text
    st = c.get("/api/state").json()
    src = any(a["id"] == "g_fade" for a in st["globals"]["animations"])
    return (st["layout"][0].get("suppress") == ["g_fade"] and src), f"st_layout0={st['layout'][0].get('suppress')}"

def t_AD_RM_04_broadcast():
    c, _ = _client(fx.with_animations(fx.synth_project(), {"global": [_alpha()]}))
    with c.websocket_connect("/ws") as ws:
        ws.receive_json()
        _call(c, "remove_animation", scope="group", ref=0, anim_id="g_fade")
        msg = ws.receive_json()
    return (msg["type"] == "state" and msg["state"]["layout"][0].get("suppress") == ["g_fade"]), "broadcast"

def t_AD_RS_03_roundtrip_via_api():
    base = fx.with_animations(fx.synth_project(), {"global": [_alpha()]})
    c, _ = _client(copy.deepcopy(base))
    _call(c, "remove_animation", scope="group", ref=0, anim_id="g_fade")
    _call(c, "restore_animation", scope="group", ref=0, anim_id="g_fade")
    st = c.get("/api/state").json()
    return (st["globals"]["animations"] and not st["layout"][0].get("suppress")), \
           f"supp={st['layout'][0].get('suppress')}"


# ── 3D — set_animation_props over /api/call ───────────────────────────────────

def t_AD_SP_01_partial_merge_via_api():
    c, _ = _client(fx.with_animations(fx.synth_project(), {"global": [_alpha()]}))
    r = _call(c, "set_animation_props", scope="global", ref=None, anim_id="g_fade",
              partial={"enabled": False})
    assert r.status_code == 200, r.text
    st = c.get("/api/state").json()
    a = [x for x in st["globals"]["animations"] if x["id"] == "g_fade"][0]
    return (a["enabled"] is False), f"a={a}"

def t_AD_SP_03_invalid_partial_422():
    c, _ = _client(fx.with_animations(fx.synth_project(), {"global": [_alpha()]}))
    bad = [fx._seg(fx._time("cue_start"), fx._time("cue_start", 200), None, 1),
           fx._seg(fx._time("cue_start", 100), fx._time("cue_start", 300), None, 1)]
    r = _call(c, "set_animation_props", scope="global", ref=None, anim_id="g_fade",
              partial={"segments": bad})
    return (r.status_code == 422 and "error" in r.json()), f"status={r.status_code}"


# ── edit_custom_animation over /api/call ──────────────────────────────────────

def t_AD_EC_01_edit_custom_replaces_in_place_via_api():
    lead = fx._anim(id="cust1", name="fill", channel="primary",
                    segments=[fx._seg(fx._time("cue_end", -30), fx._time("cue_end", -30), None, "#FF3DA6")])
    lead["custom"] = True
    c, _ = _client(fx.with_animations(fx.synth_project(),
                                      {"tags": [{"ids": [0], "anims": [lead], "suppress": []}]}))
    newrec = fx._anim(id="cust1", name="fill", channel="blur",
                      segments=[fx._seg(fx._time("cue_end", -30), fx._time("cue_end", -30), None, 6)])
    newrec["custom"] = True
    r = _call(c, "edit_custom_animation", scope="cue", ref=[0], anim_id="cust1", anims=[newrec])
    assert r.status_code == 200, r.text
    view = [a for a in r.json()["result"].get("animations", []) if a["id"] == "cust1"]
    st = c.get("/api/state").json()
    tag = next(t for t in st["anim_tags"] if set(t["ids"]) == {0})
    sa = [a for a in tag["anims"] if a["id"] == "cust1"]
    return (len(view) == 1 and view[0]["channel"] == "blur"
            and len(sa) == 1 and sa[0]["channel"] == "blur"), f"view={r.json()} state={tag['anims']}"


# ── 3E — resolved lists in /api/state and /api/render ─────────────────────────

def t_AD_GET_01_state_carries_resolved():
    c, ctx = _client(fx.with_inherited_stack())
    st = c.get("/api/state").json()
    eng = [a["id"] for a in fx.resolved(ctx.session.project, 0)]
    got = _word_resolved_ids(st, 0)
    return (got == eng and len(eng) >= 1), f"got={got} eng={eng}"

def t_AD_GET_02_render_carries_resolved():
    from engine.anim_migrate import migrate_project
    c, ctx = _client(fx.with_inherited_stack())
    groups = c.get("/api/render").json()
    w0 = groups[0]["lines"][0]["words"][0]
    mp = copy.deepcopy(ctx.session.project); migrate_project(mp)
    eng = [a["id"] for a in fx.resolved(mp, 0)]
    got = [a["id"] for a in (w0.get("anims") or [])]
    return (got == eng and "grp_pop" in got and "t_color" in got), f"got={got} eng={eng}"

def t_AD_GET_03_conflict_warning_in_state():
    c, _ = _client(fx.with_same_scope_overlap())
    st = c.get("/api/state").json()
    res = _word_resolved(st, 0)
    warned = [a for a in res if a.get("warning") == "overlap"]
    return (len(warned) == 2), f"warned={len(warned)}"


def _word_resolved(st, wid):
    for grp in st["layout"]:
        for ln in grp["lines"]:
            for t in ln["toks"]:
                if t["ids"] and t["ids"][0] == wid:
                    return t.get("anims_resolved") or []
    raise KeyError(f"no cue {wid}")

def _word_resolved_ids(st, wid):
    return [a["id"] for a in _word_resolved(st, wid)]


# ── autosave: an animation edit persists to disk ──────────────────────────────

def t_AD_ADD_07_autosaves_to_disk():
    d = tempfile.mkdtemp(prefix="kss_anim_autosave_")
    try:
        app = build_app(DaemonContext(Hub()), Hub(), token=None, projects_dir=d)
        c = TestClient(app)
        r = c.post("/api/projects/new", json={"name": "p", "lyrics_path": os.path.abspath("aligned_lyrics.json")})
        assert r.status_code == 200, r.text
        pj = os.path.join(d, "p", "project.json")
        _call(c, "add_animation", scope="global", ref=None, anim=_alpha())
        def saved():
            try:
                doc = json.load(open(pj))
                return any(a["id"] == "g_fade"
                           for a in doc.get("cues_v2", {}).get("globals", {}).get("animations", []))
            except Exception:
                return False
        t0 = time.time(); ok = False
        while time.time() - t0 < 3.0:
            if saved(): ok = True; break
            time.sleep(0.1)
        return (ok, "animation autosaved to project.json")
    finally:
        shutil.rmtree(d, ignore_errors=True)


# ── 3F — old fade tools return 400 unknown-tool via /api/call ─────────────────

def t_AD_OLD_01_make_fade_tag_unknown():
    c, _ = _client()
    r = _call(c, "make_fade_tag", lane="fin_tags", ids=[0])
    return (r.status_code == 400 and "unknown" in r.text.lower()), f"status={r.status_code} body={r.text}"

def t_AD_OLD_02_clear_fade_tag_unknown():
    c, _ = _client()
    r = _call(c, "clear_fade_tag", lane="fin_tags", ids=[0])
    return (r.status_code == 400 and "unknown" in r.text.lower()), f"status={r.status_code}"

def t_AD_OLD_03_set_fade_tag_props_unknown():
    c, _ = _client()
    r = _call(c, "set_fade_tag_props", lane="fin_tags", ti=0, trigger=1.0)
    return (r.status_code == 400 and "unknown" in r.text.lower()), f"status={r.status_code}"

def t_AD_OLD_04_set_fade_defaults_unknown():
    c, _ = _client()
    r = _call(c, "set_fade_defaults", partial={"fade_in_ms": 300})
    return (r.status_code == 400 and "unknown" in r.text.lower()), f"status={r.status_code}"

def t_AD_OLD_05_set_group_fade_unknown():
    c, _ = _client()
    r = _call(c, "set_group_fade", gi=0, partial={"fade_in_ms": 300})
    return (r.status_code == 400 and "unknown" in r.text.lower()), f"status={r.status_code}"


_active = {n: f for n, f in list(globals().items()) if n.startswith("t_") and callable(f)}
for n, f in sorted(_active.items()): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, dd in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"\n       -> {dd}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
