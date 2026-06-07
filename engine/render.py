# engine/render.py — derive render-groups from a project. UI-free.
import copy
import core
from engine import anim
from engine.anim_migrate import migrate_project, is_migrated
from engine.model import BUILTIN

def project_to_render(project):
    """Render-groups for a project. Appearance/fades are now ordinary animations:
    each render-word carries its resolved animation list (\"anims\"); the event
    window is widened to cover the latest animation end so fade-outs aren't clipped.

    Legacy (unmigrated) projects render through a migrated COPY — the caller's dict
    is never mutated here; migration-on-load owns the in-place conversion."""
    if not is_migrated(project):
        project = copy.deepcopy(project)
        migrate_project(project)
    words = project["words"]
    G = project["globals"]
    g_ling = G.get("linger", BUILTIN["linger"])
    out = []
    for gi, g in enumerate(project["layout"]):
        if g.get("del"):
            continue
        rlines, anim_ends = [], []
        line_tokens = []
        for line in g["lines"]:
            line_tokens.append([t for t in line["toks"] if not t.get("del")])
        all_ids = [i for toks in line_tokens for t in toks for i in t["ids"]]
        if not all_ids:
            continue
        base_s = min(words[i]["start"] for i in all_ids)
        base_e = max(words[i]["end"] for i in all_ids)
        win_s = g["win_start"] if g.get("win_start") is not None else base_s
        ling = g["linger"] if g.get("linger") is not None else g_ling
        win_e = g["win_end"] if g.get("win_end") is not None else base_e + ling
        for li, line in enumerate(g["lines"]):
            toks = [t for t in line["toks"] if not t.get("del")]
            if not toks:
                continue
            rws = []
            for ti, tok in enumerate(line["toks"]):
                if tok.get("del") or not tok["ids"]:
                    continue
                tend = max(words[i]["end"] for i in tok["ids"])
                anims = anim.resolve_animations(project, gi, li, ti)
                # Only fade-OUTs extend the event window past its natural end
                # (legacy parity: appearance fade-ins never lengthened the event).
                for a in anims:
                    if _is_fade_out(a):
                        anim_ends.append(max(s["end_s"] for s in a["segments"]))
                rws.append({"text": core.token_text(words, tok), "start_s": win_s,
                            "end_s": tend, "anims": anims,
                            "style": dict(tok.get("style") or {})})        # NEW: per-cue style
            if rws:
                rlines.append({"words": rws})
        if not rlines:
            continue
        ev_e = win_e
        if anim_ends:
            ev_e = max(ev_e, max(anim_ends))
        out.append({"start": win_s, "end": ev_e, "accumulate": "words", "lines": rlines,
                    "group_style": dict(g.get("style") or {})})           # NEW: group style
    out.sort(key=lambda r: r["start"])
    return out


def _is_fade_out(a):
    """An alpha animation whose final segment moves toward transparency — the only
    animation kind that should extend the rendered event window (a trailing fade)."""
    if a["channel"] != "alpha":
        return False
    if a.get("name") == "fade_out":
        return True
    last = a["segments"][-1]
    frm, to = last.get("from"), last.get("to")
    try:
        return frm is not None and float(to) < float(frm)
    except (TypeError, ValueError):
        return False
