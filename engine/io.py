# engine/io.py — project (cue model) serialization. UI-free. Backward-compatible.
from engine.model import BUILTIN

def serialize_cues(p):
    return {"nwords": len(p["words"]), "globals": dict(p["globals"]),
            "layout": [{"label": g["label"], "accumulate": g.get("accumulate", "words"),
                        "win_start": g.get("win_start"), "win_end": g.get("win_end"),
                        "linger": g.get("linger"), "del": g.get("del", False),
                        "style": dict(g.get("style") or {}),
                        "fade": dict(g.get("fade") or {}),
                        "lines": [{"toks": [{"ids": list(t["ids"]), "sep": t.get("sep", ""),
                                             "del": t.get("del", False),
                                             "style": dict(t.get("style") or {})}
                                            for t in ln["toks"]]} for ln in g["lines"]]}
                       for g in p["layout"]],
            "fin_tags": [{"ids": sorted(t["ids"]), "trigger": t.get("trigger")} for t in p["fin_tags"]],
            "fout_tags": [{"ids": sorted(t["ids"]), "trigger": t.get("trigger")} for t in p["fout_tags"]]}

def apply_cues(project, d):
    if not d or d.get("nwords") != len(project["words"]):
        return False
    project["globals"] = {**BUILTIN, **(d.get("globals") or {})}
    project["layout"] = [{"label": g.get("label", ""), "accumulate": g.get("accumulate", "words"),
                          "win_start": g.get("win_start"), "win_end": g.get("win_end"),
                          "linger": g.get("linger"), "del": g.get("del", False),
                          "style": dict(g.get("style") or {}),
                          "fade": dict(g.get("fade") or {}),
                          "lines": [{"toks": [{"ids": list(t["ids"]), "sep": t.get("sep", ""),
                                               "del": t.get("del", False),
                                               "style": dict(t.get("style") or {})}
                                              for t in ln["toks"]]} for ln in g["lines"]]}
                         for g in d.get("layout", [])]
    project["fin_tags"] = [{"ids": set(t["ids"]), "trigger": t.get("trigger")}
                           for t in d.get("fin_tags", [])]
    project["fout_tags"] = [{"ids": set(t["ids"]), "trigger": t.get("trigger")}
                            for t in d.get("fout_tags", [])]
    return True
