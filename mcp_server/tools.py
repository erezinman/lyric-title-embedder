# mcp_server/tools.py — tool implementations over an EngineContext. No `mcp` import.
import copy, json, os, tempfile, threading, uuid
import engine
import core
from engine.model import resolve_style, STYLE_KEYS

_PLACE_KEYS = ["align", "play_w", "play_h", "margin_l", "margin_r", "margin_v", "use_pos", "pos"]


def _gctx_for_resolve(ctx):
    c = ctx.cfg()
    return {"font": c["font"], "fontsize": c["fontsize"], "bold": c["bold"],
            "primary": c["primary_color"], "outline": c["outline_color"], "back": c["back_color"],
            "back_alpha": c["back_alpha"], "outline_w": c["outline_w"], "shadow": c["shadow"],
            "border_style": c["border_style"]}


def _require_project(ctx):
    if ctx.session.project is None:
        raise ValueError("no project loaded — call load_lyrics or load_project first")


def _event_view(ctx, gi):
    p = ctx.session.project; g = p["layout"][gi]; words = p["words"]
    gd = _gctx_for_resolve(ctx)
    ids = [i for ln in g["lines"] for t in ln["toks"] for i in t["ids"]]
    s = g["win_start"] if g.get("win_start") is not None else (min(words[i]["start"] for i in ids) if ids else 0.0)
    e = g["win_end"] if g.get("win_end") is not None else (max(words[i]["end"] for i in ids) if ids else 0.0)
    return {"gi": gi, "label": g["label"], "win": [s, e],
            "linger": g.get("linger"), "deleted": g.get("del", False),
            "style_overrides": dict(g.get("style") or {}),
            "animations": list(g.get("animations") or []),
            "suppress": list(g.get("suppress") or []),
            "resolved_style": resolve_style(None, g, gd),
            "lines": [{"li": li, "words": [{"wid": t["ids"][0], "ids": list(t["ids"]),
                        "sep": t.get("sep", ""), "text": core.token_text(words, t),
                        "start": min(words[i]["start"] for i in t["ids"]),
                        "end": max(words[i]["end"] for i in t["ids"]),
                        "deleted": t.get("del", False),
                        "style": dict(t.get("style") or {})} for t in ln["toks"]]}
                      for li, ln in enumerate(g["lines"])]}


def get_state(ctx):
    def f():
        _require_project(ctx); p = ctx.session.project
        ev = []
        for gi, g in enumerate(p["layout"]):
            v = _event_view(ctx, gi)
            ev.append({"gi": gi, "label": v["label"], "win": v["win"],
                       "style_overrides": v["style_overrides"],
                       "animations": v["animations"], "suppress": v["suppress"],
                       "n_words": sum(len(ln["toks"]) for ln in g["lines"])})
        return {"n_events": len(p["layout"]), "n_words": len(p["words"]),
                "globals": ctx.get_globals(), "events": ev}
    return ctx.run(f)


def list_groups(ctx):
    return ctx.run(lambda: (_require_project(ctx), [_event_view(ctx, gi) for gi in range(len(ctx.session.project["layout"]))])[1])


def get_group(ctx, gi):
    return ctx.run(lambda: (_require_project(ctx), _event_view(ctx, gi))[1])


def _word_view(ctx, wid):
    p = ctx.session.project; w = p["words"][wid]
    loc = None; tok = None
    for gi, g in enumerate(p["layout"]):
        for li, ln in enumerate(g["lines"]):
            for ti, t in enumerate(ln["toks"]):
                if wid in t["ids"]: loc = (gi, li, ti); tok = t
    grp = p["layout"][loc[0]] if loc else None
    return {"wid": wid, "text": w["text"], "start": w["start"], "end": w["end"],
            "location": loc,
            "cue_style": dict((tok or {}).get("style") or {}),
            "resolved_style": resolve_style(tok, grp, _gctx_for_resolve(ctx))}


def get_word(ctx, wid):
    return ctx.run(lambda: (_require_project(ctx), _word_view(ctx, wid))[1])


def list_words(ctx):
    return ctx.run(lambda: (_require_project(ctx), [_word_view(ctx, i) for i in range(len(ctx.session.project["words"]))])[1])


def get_render(ctx):
    return ctx.run(lambda: (_require_project(ctx), engine.project_to_render(ctx.session.project))[1])


def get_project(ctx):
    def f():
        _require_project(ctx)
        p = ctx.session.project; g = ctx.get_globals()
        # Animations replace the legacy fade model; a migrated project carries
        # globals.animations / layout[].animations + suppress / anim_tags instead
        # of fin_tags/fout_tags/group.fade/accumulate. Tolerate either shape.
        layout = [{"label": grp["label"],
                   "win_start": grp.get("win_start"), "win_end": grp.get("win_end"),
                   "linger": grp.get("linger"), "del": grp.get("del", False),
                   "style": dict(grp.get("style") or {}),
                   "animations": copy.deepcopy(grp.get("animations", [])),
                   "suppress": list(grp.get("suppress") or []),
                   "lines": [{"toks": [{"ids": list(t["ids"]), "sep": t.get("sep", ""),
                                        "del": t.get("del", False),
                                        "style": dict(t.get("style") or {}),
                                        "anims_resolved":
                                            engine.anim.resolve_animations(p, gi, li, ti)}
                                       for ti, t in enumerate(ln["toks"])]}
                             for li, ln in enumerate(grp["lines"])]}
                  for gi, grp in enumerate(p["layout"])]
        # Animations replace the legacy fade model: never surface the legacy globals
        # fade keys in the project payload (post-migration shape — AD-OLD-06).
        gl = {k: v for k, v in p["globals"].items() if k not in ("fade_in_ms", "fade_out_ms")}
        return {"words": [dict(w) for w in p["words"]], "layout": layout,
                "anim_tags": copy.deepcopy(p.get("anim_tags", [])),
                "globals": gl,
                "global_style": {k: g[k] for k in STYLE_KEYS},
                "placement": {k: g.get(k) for k in _PLACE_KEYS},
                "video": ctx.video_path()}
    return ctx.run(f)


def get_ass(ctx):
    return ctx.run(lambda: (_require_project(ctx), engine.build_ass(ctx.cfg(), engine.project_to_render(ctx.session.project))[0])[1])


def get_srt(ctx):
    return ctx.run(lambda: (_require_project(ctx), engine.srt.to_srt(ctx.session.project))[1])


def get_vtt(ctx):
    return ctx.run(lambda: (_require_project(ctx), engine.srt.to_vtt(ctx.session.project))[1])


def _do(ctx, fn_name, *args):
    return ctx.run(lambda: ctx.session.do(fn_name, *args))

def set_group_style(ctx, gi, partial):
    _do(ctx, "set_group_style", gi, partial); return ctx.run(lambda: _event_view(ctx, gi))

def set_cue_style(ctx, word_ids, partial):
    _do(ctx, "set_cue_style", set(word_ids), partial)
    return ctx.run(lambda: [_word_view(ctx, w) for w in word_ids])

def set_word_times(ctx, updates):
    _do(ctx, "set_word_times", updates); return get_state(ctx)

def set_word_text(ctx, wid, text):
    _do(ctx, "set_word_text", wid, text); return get_state(ctx)

def set_layout_props(ctx, gi, win_start=None, win_end=None, linger=None):
    _do(ctx, "set_layout_props", gi, win_start, win_end, linger); return ctx.run(lambda: _event_view(ctx, gi))

def merge_events(ctx, gidxs):
    ok = _do(ctx, "layout_merge", set(gidxs))
    if ok is False: raise ValueError("merge_events needs >=2 adjacent event indices")
    return list_groups(ctx)

def ungroup_event(ctx, gi):
    _do(ctx, "layout_ungroup", gi); return list_groups(ctx)

def split_event(ctx, gi, line_index):
    _do(ctx, "layout_split_event", gi, line_index); return list_groups(ctx)

def break_line(ctx, gi, li, ti, after=True):
    _do(ctx, "add_break", gi, li, ti, after); return ctx.run(lambda: _event_view(ctx, gi))

def merge_words(ctx, gi, li, ti, sep=""):
    _do(ctx, "merge_prev_word", gi, li, ti, sep); return ctx.run(lambda: _event_view(ctx, gi))

def join_lines(ctx, gi, li):
    _do(ctx, "remove_break", gi, li); return ctx.run(lambda: _event_view(ctx, gi))


def merge_word_span(ctx, gi, li, ti_first, ti_last, sep=""):
    _do(ctx, "merge_token_span", gi, li, ti_first, ti_last, sep)
    return ctx.run(lambda: _event_view(ctx, gi))

def unmerge_words(ctx, gi, li, ti):
    _do(ctx, "unmerge_token", gi, li, ti)
    return ctx.run(lambda: _event_view(ctx, gi))

def merge_words_run(ctx, gi, ids):
    _do(ctx, "merge_word_run", gi, list(ids))
    return ctx.run(lambda: _event_view(ctx, gi))

def delete_words(ctx, word_ids):
    _do(ctx, "toggle_word_del", set(word_ids), True); return ctx.run(lambda: [_word_view(ctx, w) for w in word_ids])

def restore_words(ctx, word_ids):
    _do(ctx, "toggle_word_del", set(word_ids), False); return ctx.run(lambda: [_word_view(ctx, w) for w in word_ids])

# ── animations ────────────────────────────────────────────────────────────────
# The four animation tools wrap the engine mutations through the same _do/session
# rails (snapshot → mutate → on_change → broadcast → autosave). scope ∈
# {"global","group","tag"}; ref = None | gi | [word_ids]. Engine validation errors
# surface as ValueError (→ 422 at /api/call); a bad scope is also a ValueError.

def _anim_view(ctx, scope, ref):
    """The updated entity view after an animation edit. For group/tag scopes this is
    the carrier's animations+suppress; for global the globals' list."""
    p = ctx.session.project
    if scope == "group":
        return _event_view(ctx, ref)
    if scope == "tag":
        idset = set(ref)
        for t in (p.get("anim_tags") or []):
            if set(t["ids"]) == idset:
                return {"scope": "tag", "ids": list(t["ids"]),
                        "animations": list(t.get("anims") or []),
                        "suppress": list(t.get("suppress") or [])}
        return {"scope": "tag", "ids": list(ref or []), "animations": [], "suppress": []}
    return {"scope": "global",
            "animations": list((p.get("globals") or {}).get("animations") or [])}

def _norm_scope(scope):
    # The UI/selection scope name is "cue" (test design §3: scope ∈ {global, group,
    # cue}, where "cue"/selection == the tag carrier). The engine's canonical name is
    # "tag"; accept both at the tool boundary so the Inspector/strip dispatches (which
    # send "cue") and the OpsToolbar fade shortcuts (which send "tag") both work.
    if scope == "cue":
        return "tag"
    if scope not in ("global", "group", "tag"):
        raise ValueError(f"unknown scope {scope!r}")
    return scope

def add_animation(ctx, scope, ref=None, anim=None):
    scope = _norm_scope(scope)
    _do(ctx, "anim_add", scope, ref, anim)
    return ctx.run(lambda: _anim_view(ctx, scope, ref))

def remove_animation(ctx, scope, ref=None, anim_id=None):
    scope = _norm_scope(scope)
    _do(ctx, "anim_remove", scope, ref, anim_id)
    return ctx.run(lambda: _anim_view(ctx, scope, ref))

def restore_animation(ctx, scope, ref=None, anim_id=None):
    scope = _norm_scope(scope)
    _do(ctx, "anim_restore", scope, ref, anim_id)
    return ctx.run(lambda: _anim_view(ctx, scope, ref))

def set_animation_props(ctx, scope, ref=None, anim_id=None, partial=None):
    scope = _norm_scope(scope)
    _do(ctx, "anim_set_props", scope, ref, anim_id, partial or {})
    return ctx.run(lambda: _anim_view(ctx, scope, ref))


def undo(ctx): ctx.run(lambda: ctx.session.undo()); return get_state(ctx)

def redo(ctx): ctx.run(lambda: ctx.session.redo()); return get_state(ctx)


def get_globals(ctx): return ctx.get_globals()
def set_globals(ctx, partial): ctx.set_globals(partial); return ctx.get_globals()

def _project_doc(ctx):
    g = ctx.get_globals()
    return {"globals_style": g, "cues_v2": engine.serialize_cues(ctx.session.project)}

def save_project(ctx, path):
    def f():
        _require_project(ctx)
        with open(path, "w", encoding="utf-8") as fh: json.dump(_project_doc(ctx), fh, indent=2)
        return {"saved": path}
    return ctx.run(f)

def load_project(ctx, path):
    def f():
        _require_project(ctx)   # need a base project with matching nwords (load_lyrics first)
        d = json.load(open(path, encoding="utf-8"))
        cues = d.get("cues_v2") or {}
        nw = cues.get("nwords")
        cur = len(ctx.session.project["words"])
        if nw is not None and nw != cur:
            raise ValueError(f"project nwords mismatch: file has {nw}, current project has {cur} "
                             f"— load the matching lyrics first")
        ok = engine.apply_cues(ctx.session.project, cues)
        if d.get("globals_style"):
            ctx.set_globals(d["globals_style"])
        ctx.session.set_project(ctx.session.project)   # fire on_change / reset undo
        return {"loaded": path, "applied": bool(ok)}
    return ctx.run(f)

def generate_ass(ctx, path=None):
    def f():
        _require_project(ctx)
        text, n = engine.build_ass(ctx.cfg(), engine.project_to_render(ctx.session.project))
        if path:
            with open(path, "w", encoding="utf-8") as fh: fh.write(text)
            return {"wrote": path, "events": n}
        return text
    return ctx.run(f)


_BURN_JOBS = {}        # job_id -> {"frac","done","ok","err","out"}
_BURN_LOCK = threading.Lock()

def render_frame(ctx, time_s):
    def build():
        _require_project(ctx)
        cfg = ctx.cfg()
        ass = os.path.join(tempfile.gettempdir(), f"_mcp_frame_{uuid.uuid4().hex}.ass")
        text, _ = engine.build_ass(cfg, engine.project_to_render(ctx.session.project))
        with open(ass, "w", encoding="utf-8") as fh: fh.write(text)
        return cfg, ass
    cfg, ass = ctx.run(build)
    out = os.path.join(tempfile.gettempdir(), f"_mcp_frame_{uuid.uuid4().hex}.png")
    cmd = engine.ffmpeg.frame_cmd(ctx.video_path(), ass, time_s, cfg["play_w"], cfg["play_h"], out)
    import subprocess
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0 or not os.path.isfile(out):
        raise RuntimeError("frame render failed: " + (p.stderr or "")[-300:])
    with open(out, "rb") as fh: return fh.read()

def burn(ctx, out_path, video_in=None):
    def build():
        _require_project(ctx)
        a = os.path.join(tempfile.gettempdir(), f"_mcp_burn_{uuid.uuid4().hex}.ass")
        text, _ = engine.build_ass(ctx.cfg(), engine.project_to_render(ctx.session.project))
        with open(a, "w", encoding="utf-8") as fh: fh.write(text)
        return a
    ass = ctx.run(build)
    src = video_in or ctx.video_path()
    if not src:
        raise ValueError("burn needs a video: pass video_in or set the input video")
    jid = uuid.uuid4().hex
    with _BURN_LOCK:
        _BURN_JOBS[jid] = {"frac": 0.0, "done": False, "ok": False, "err": None, "out": out_path}
    total = engine.ffmpeg.probe_duration(src) or 1.0
    cmd = engine.ffmpeg.burn_cmd(src, ass, out_path)
    def worker():
        ok, err = engine.ffmpeg.run(cmd, total, lambda fr: _BURN_JOBS[jid].__setitem__("frac", fr))
        with _BURN_LOCK:
            _BURN_JOBS[jid].update(done=True, ok=ok, err=(None if ok else str(err)[-400:]), frac=1.0)
    threading.Thread(target=worker, daemon=True).start()
    return {"job_id": jid}

def burn_status(ctx, job_id):
    with _BURN_LOCK:
        st = _BURN_JOBS.get(job_id)
        if st is None:
            raise ValueError(f"unknown burn job_id {job_id}")
        return dict(st)
