# engine/model.py — project shape, style keys, resolution. UI-free.
import json
import core

BUILTIN = {"fade_in_ms": 250, "fade_out_ms": 1000, "linger": 0.0}

STYLE_KEYS = ["font", "fontsize", "bold", "primary", "outline", "back",
              "back_alpha", "outline_w", "shadow", "border_style", "align"]
# Group-only keys (cue cannot override): border_style has no inline per-cue tag
# within one Dialogue (C1); align (\an) applies to a whole event, so a per-cue
# value is physically meaningless.
GROUP_ONLY_STYLE_KEYS = ("border_style", "align")
CUE_STYLE_KEYS = [k for k in STYLE_KEYS if k not in GROUP_ONLY_STYLE_KEYS]

FADE_KEYS = ["fade_in_ms", "fade_out_ms"]


def resolve_fade(group, gtiming):
    """Effective fade durations for a layout group: group['fade'] override falls
    back to the global timing defaults. Group-only (no cue tier)."""
    gf = (group or {}).get("fade") or {}
    return {k: (gf[k] if gf.get(k) is not None else gtiming[k]) for k in FADE_KEYS}


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
                           "del": False, "style": {}, "fade": {}})
    return {"words": words, "layout": layout, "fin_tags": [], "fout_tags": [],
            "globals": dict(BUILTIN)}

def _tag_of(tags, wid):
    for ti, t in enumerate(tags):
        if wid in t["ids"]:
            return ti, t
    return None, None

def resolve_style(token, group, gctx):
    """Resolve effective style for a token: cue -> group -> global (gctx).
    Group-only keys (border_style C1, align) resolve group -> global only."""
    ts = (token or {}).get("style") or {}
    gs = (group or {}).get("style") or {}
    out = {}
    for k in STYLE_KEYS:
        if k not in GROUP_ONLY_STYLE_KEYS and ts.get(k) is not None:
            out[k] = ts[k]
        elif gs.get(k) is not None:
            out[k] = gs[k]
        else:
            out[k] = gctx.get(k)
    return out
