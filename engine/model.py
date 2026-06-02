# engine/model.py — project shape, style keys, resolution. UI-free.
import json
import core

BUILTIN = {"fade_in_ms": 250, "fade_out_ms": 1000, "linger": 0.0}
PALETTE = ["#7a4a4a", "#4a7a4a", "#4a5a7a", "#7a6a3a", "#6a4a7a",
           "#3a7a7a", "#7a3a5a", "#5a7a3a", "#3a5a7a", "#7a5a3a"]

STYLE_KEYS = ["font", "fontsize", "bold", "primary", "outline", "back",
              "back_alpha", "outline_w", "shadow", "border_style"]
CUE_STYLE_KEYS = [k for k in STYLE_KEYS if k != "border_style"]   # C1: box-mode group-only


def make_project(cfg):
    with open(cfg["json_path"], encoding="utf-8") as fh:
        data = json.load(fh)
    real = core.reconstruct_lines(data.get("aligned_lyrics") or [])
    words, line_specs = [], []
    for l in real:
        if cfg.get("skip_dashes", True) and core.is_dashes(l["text"]):
            continue
        flat = []
        for e in l["_entries"]:
            flat.extend(e.get("words") or [])
        toks = []
        for w in core.merge_subwords(flat):
            words.append({"text": w["text"], "start": w["start_s"], "end": w["end_s"]})
            toks.append({"ids": [len(words) - 1], "sep": "", "del": False, "style": {}})
        if toks:
            line_specs.append((l.get("section") or "Unknown", {"toks": toks}))
    layout = []
    for sec, line in line_specs:
        if cfg.get("group_by") == "section" and layout and layout[-1]["label"] == sec:
            layout[-1]["lines"].append(line)
        else:
            layout.append({"label": sec, "lines": [line], "accumulate": "words",
                           "win_start": None, "win_end": None, "linger": None,
                           "del": False, "style": {}})
    return {"words": words, "layout": layout, "fin_tags": [], "fout_tags": [],
            "globals": dict(BUILTIN), "palette": list(PALETTE)}

def _tag_of(tags, wid):
    for ti, t in enumerate(tags):
        if wid in t["ids"]:
            return ti, t
    return None, None

def resolve_style(token, group, gctx):
    """Resolve effective style for a token: cue -> group -> global (gctx).
    border_style resolves group -> global only (cue cannot override it, C1)."""
    ts = (token or {}).get("style") or {}
    gs = (group or {}).get("style") or {}
    out = {}
    for k in STYLE_KEYS:
        if k != "border_style" and ts.get(k) is not None:
            out[k] = ts[k]
        elif gs.get(k) is not None:
            out[k] = gs[k]
        else:
            out[k] = gctx.get(k)
    return out
