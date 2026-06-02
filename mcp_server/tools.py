# mcp_server/tools.py — tool implementations over an EngineContext. No `mcp` import.
import json, os, tempfile, threading, uuid
import engine
from engine.model import resolve_style, _tag_of


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
    return {"gi": gi, "label": g["label"], "win": [s, e], "accumulate": g.get("accumulate", "words"),
            "linger": g.get("linger"), "deleted": g.get("del", False),
            "style_overrides": dict(g.get("style") or {}),
            "resolved_style": resolve_style(None, g, gd),
            "lines": [{"li": li, "words": [{"wid": t["ids"][0], "text": words[t["ids"][0]]["text"],
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
            ev.append({"gi": gi, "label": v["label"], "win": v["win"], "accumulate": v["accumulate"],
                       "style_overrides": v["style_overrides"],
                       "n_words": sum(len(ln["toks"]) for ln in g["lines"])})
        return {"n_events": len(p["layout"]), "n_words": len(p["words"]),
                "globals": ctx.get_globals(), "fade_defaults": dict(p["globals"]), "events": ev}
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
    fin = _tag_of(p["fin_tags"], wid)[1]; fout = _tag_of(p["fout_tags"], wid)[1]
    grp = p["layout"][loc[0]] if loc else None
    return {"wid": wid, "text": w["text"], "start": w["start"], "end": w["end"],
            "location": loc, "fade_in_group": sorted(fin["ids"]) if fin else None,
            "fade_out_group": sorted(fout["ids"]) if fout else None,
            "cue_style": dict((tok or {}).get("style") or {}),
            "resolved_style": resolve_style(tok, grp, _gctx_for_resolve(ctx))}


def get_word(ctx, wid):
    return ctx.run(lambda: (_require_project(ctx), _word_view(ctx, wid))[1])


def list_words(ctx):
    return ctx.run(lambda: (_require_project(ctx), [_word_view(ctx, i) for i in range(len(ctx.session.project["words"]))])[1])


def get_render(ctx):
    return ctx.run(lambda: (_require_project(ctx), engine.project_to_render(ctx.session.project))[1])


def get_ass(ctx):
    return ctx.run(lambda: (_require_project(ctx), engine.build_ass(ctx.cfg(), engine.project_to_render(ctx.session.project))[0])[1])
