# engine/io.py — project (cue model) serialization. UI-free. Backward-compatible.
# Carries both the legacy fade fields (fin/fout tags, group.fade, accumulate) when
# present AND the settled animation carriers (animations / anim_tags / suppress),
# so a project round-trips whether or not it has been migrated yet.
import copy
from engine.model import BUILTIN


def serialize_cues(p):
    return {"nwords": len(p["words"]), "globals": dict(p["globals"]),
            "words": [{"text": w["text"], "start": w["start"], "end": w["end"]} for w in p["words"]],
            "layout": [_ser_group(g) for g in p["layout"]],
            "fin_tags": [{"ids": sorted(t["ids"]), "trigger": t.get("trigger")}
                         for t in p.get("fin_tags", [])],
            "fout_tags": [{"ids": sorted(t["ids"]), "trigger": t.get("trigger")}
                          for t in p.get("fout_tags", [])],
            "anim_tags": copy.deepcopy(p.get("anim_tags", []))}


def _ser_group(g):
    out = {"label": g["label"], "win_start": g.get("win_start"), "win_end": g.get("win_end"),
           "linger": g.get("linger"), "del": g.get("del", False),
           "style": dict(g.get("style") or {}),
           "animations": copy.deepcopy(g.get("animations", [])),
           "suppress": list(g.get("suppress") or []),
           "lines": [{"toks": [{"ids": list(t["ids"]), "sep": t.get("sep", ""),
                                "del": t.get("del", False),
                                "style": dict(t.get("style") or {})}
                               for t in ln["toks"]]} for ln in g["lines"]]}
    # Legacy fade fields are only emitted while still present (pre-migration).
    if "accumulate" in g:
        out["accumulate"] = g["accumulate"]
    if "fade" in g:
        out["fade"] = dict(g.get("fade") or {})
    return out


def apply_cues(project, d):
    if not d or d.get("nwords") != len(project["words"]):
        return False
    project["globals"] = {**BUILTIN, **(d.get("globals") or {})}
    sw = d.get("words")
    if sw and len(sw) == len(project["words"]):
        for i, w in enumerate(sw):
            project["words"][i] = {"text": w["text"], "start": w["start"], "end": w["end"]}
    project["layout"] = [_apply_group(g) for g in d.get("layout", [])]
    if "fin_tags" in d:
        project["fin_tags"] = [{"ids": set(t["ids"]), "trigger": t.get("trigger")}
                               for t in d.get("fin_tags", [])]
    if "fout_tags" in d:
        project["fout_tags"] = [{"ids": set(t["ids"]), "trigger": t.get("trigger")}
                                for t in d.get("fout_tags", [])]
    if "anim_tags" in d:
        project["anim_tags"] = copy.deepcopy(d.get("anim_tags") or [])
    return True


def _apply_group(g):
    out = {"label": g.get("label", ""), "win_start": g.get("win_start"),
           "win_end": g.get("win_end"), "linger": g.get("linger"),
           "del": g.get("del", False), "style": dict(g.get("style") or {}),
           "animations": copy.deepcopy(g.get("animations", [])),
           "suppress": list(g.get("suppress") or []),
           "lines": [{"toks": [{"ids": list(t["ids"]), "sep": t.get("sep", ""),
                                "del": t.get("del", False),
                                "style": dict(t.get("style") or {})}
                               for t in ln["toks"]]} for ln in g["lines"]]}
    if "accumulate" in g:
        out["accumulate"] = g["accumulate"]
    if "fade" in g:
        out["fade"] = dict(g.get("fade") or {})
    return out
