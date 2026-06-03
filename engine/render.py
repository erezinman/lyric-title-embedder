# engine/render.py — derive render-groups from a project. UI-free.
import core
from engine.model import BUILTIN, _tag_of, resolve_fade

def project_to_render(project):
    words = project["words"]
    G = project["globals"]
    g_fin = G.get("fade_in_ms", BUILTIN["fade_in_ms"])
    g_fout = G.get("fade_out_ms", BUILTIN["fade_out_ms"])
    g_ling = G.get("linger", BUILTIN["linger"])
    fin, fout = project["fin_tags"], project["fout_tags"]
    out = []
    for g in project["layout"]:
        if g.get("del"):
            continue
        acc = g.get("accumulate", "words")
        gf = resolve_fade(g, {"fade_in_ms": g_fin, "fade_out_ms": g_fout})
        rlines, allspans, fade_ends = [], [], []
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
        for toks in line_tokens:
            if not toks:
                continue
            line_first = min(words[i]["start"] for t in toks for i in t["ids"])
            rws = []
            for tok in toks:
                tstart = min(words[i]["start"] for i in tok["ids"])
                tend = max(words[i]["end"] for i in tok["ids"])
                wid0 = tok["ids"][0]
                if acc == "off":
                    appear = win_s
                elif acc == "lines":
                    appear = line_first
                else:
                    appear = tstart
                fin_ms = gf["fade_in_ms"]
                ti, ftag = _tag_of(fin, wid0)
                if ftag is not None:
                    appear = ftag["trigger"] if ftag.get("trigger") is not None \
                        else min(words[i]["start"] for i in ftag["ids"] if i < len(words))
                fo_at, fo_ms = None, gf["fade_out_ms"]
                oi, otag = _tag_of(fout, wid0)
                if otag is not None:
                    fo_at = otag["trigger"] if otag.get("trigger") is not None \
                        else max(words[i]["end"] for i in otag["ids"] if i < len(words))
                    fade_ends.append(fo_at + fo_ms / 1000.0)
                rws.append({"text": core.token_text(words, tok), "start_s": appear, "end_s": tend,
                            "fin_ms": fin_ms, "fout_at": fo_at, "fout_ms": fo_ms,
                            "style": dict(tok.get("style") or {})})        # NEW: per-cue style
                allspans.append((tstart, tend))
            if rws:
                rlines.append({"words": rws})
        if not rlines:
            continue
        ev_e = win_e
        if fade_ends:
            ev_e = max(ev_e, max(fade_ends))
        out.append({"start": win_s, "end": ev_e, "accumulate": "words", "lines": rlines,
                    "group_style": dict(g.get("style") or {})})           # NEW: group style
    out.sort(key=lambda r: r["start"])
    return out
