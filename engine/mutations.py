# engine/mutations.py — pure project edits: (project, ...) -> None (mutate in place).
# The controller snapshots for undo and triggers rebuild; these never touch UI.
from engine.model import STYLE_KEYS, CUE_STYLE_KEYS, FADE_KEYS

def make_tag(project, lane, ids):
    ids = set(ids)
    if not ids:
        return
    for t in project[lane]:
        t["ids"] -= ids
    project[lane][:] = [t for t in project[lane] if t["ids"]]
    project[lane].append({"ids": ids, "trigger": None})

def clear_tag(project, lane, ids):
    for t in project[lane]:
        t["ids"] -= set(ids)
    project[lane][:] = [t for t in project[lane] if t["ids"]]

def set_tag_props(project, lane, ti, trigger):
    project[lane][ti]["trigger"] = trigger

def set_global(project, key, val):
    project["globals"][key] = val

def set_layout_props(project, gi, win_start, win_end, linger, accumulate):
    g = project["layout"][gi]
    g["win_start"] = win_start; g["win_end"] = win_end
    g["linger"] = linger; g["accumulate"] = accumulate

def _clean(style, allowed):
    return {k: v for k, v in style.items() if k in allowed and v is not None}

def set_group_style(project, gi, partial):
    """Merge partial into layout[gi]['style']; keys mapped to None are cleared (inherit)."""
    st = dict(project["layout"][gi].get("style") or {})
    for k, v in partial.items():
        if k not in STYLE_KEYS:
            continue
        if v is None:
            st.pop(k, None)
        else:
            st[k] = v
    project["layout"][gi]["style"] = _clean(st, STYLE_KEYS)

def set_group_fade(project, gi, partial):
    """Merge partial into layout[gi]['fade']; None clears a key (inherit). Group-only."""
    gf = dict(project["layout"][gi].get("fade") or {})
    for k, v in partial.items():
        if k not in FADE_KEYS:
            continue
        if v is None:
            gf.pop(k, None)
        else:
            gf[k] = v
    project["layout"][gi]["fade"] = gf

def set_cue_style(project, ids, partial):
    """Apply partial to every token covered by `ids` (a set of word ids).
    None value clears that key (inherit). border_style is ignored (C1)."""
    idset = set(ids)
    for g in project["layout"]:
        for ln in g["lines"]:
            for tok in ln["toks"]:
                if any(i in idset for i in tok["ids"]):
                    st = dict(tok.get("style") or {})
                    for k, v in partial.items():
                        if k not in CUE_STYLE_KEYS:
                            continue
                        if v is None:
                            st.pop(k, None)
                        else:
                            st[k] = v
                    tok["style"] = _clean(st, CUE_STYLE_KEYS)

def toggle_word_del(project, ids, value):
    idset = set(ids)
    for g in project["layout"]:
        for ln in g["lines"]:
            for tok in ln["toks"]:
                if any(i in idset for i in tok["ids"]):
                    tok["del"] = value

def set_word_times(project, updates):
    """Atomically retime words. updates: list of {wid, start, end}.
    Validates all entries first (0 <= start < end, wid in range); applies none on any error."""
    clean = []
    n = len(project["words"])
    for u in updates:
        wid = u["wid"]; s = u["start"]; e = u["end"]
        if not isinstance(wid, int) or wid < 0 or wid >= n:
            raise ValueError(f"set_word_times: wid {wid!r} out of range")
        if s is None or e is None or s < 0 or s >= e:
            raise ValueError(f"set_word_times: invalid span for wid {wid}: start={s} end={e}")
        clean.append((wid, s, e))
    for wid, s, e in clean:
        project["words"][wid]["start"] = s
        project["words"][wid]["end"] = e

def set_word_text(project, wid, text):
    if not isinstance(wid, int) or wid < 0 or wid >= len(project["words"]):
        raise ValueError(f"set_word_text: wid {wid!r} out of range")
    project["words"][wid]["text"] = text

def add_break(project, gi, li, ti, after=True):
    ln = project["layout"][gi]["lines"][li]; toks = ln["toks"]
    pos = ti + 1 if after else ti
    if 0 < pos < len(toks):
        project["layout"][gi]["lines"][li:li + 1] = [{"toks": toks[:pos]}, {"toks": toks[pos:]}]

def remove_break(project, gi, li):
    """Join line li with line li+1 of one event (the inverse of add_break)."""
    lines = project["layout"][gi]["lines"]
    if not (0 <= li < len(lines) - 1):
        raise ValueError(f"no line break after line {li}")
    lines[li]["toks"] += lines[li + 1]["toks"]
    del lines[li + 1]


def merge_prev_word(project, gi, li, ti, sep=""):
    toks = project["layout"][gi]["lines"][li]["toks"]
    if ti > 0:
        ids = toks[ti - 1]["ids"] + toks[ti]["ids"]
        toks[ti - 1:ti + 1] = [{"ids": ids, "sep": sep, "del": toks[ti - 1].get("del", False),
                                "style": dict(toks[ti - 1].get("style") or {})}]  # preserves left token's style (legacy AppV2 dropped it)

def merge_token_span(project, gi, li, ti_first, ti_last, sep=""):
    """Collapse tokens [ti_first..ti_last] of one line into a single token.
    ids concatenate in order; keeps the LEFT token's style and del flag
    (same semantics as merge_prev_word). One call = one undo step."""
    toks = project["layout"][gi]["lines"][li]["toks"]
    if not (0 <= ti_first < ti_last < len(toks)):
        raise ValueError(f"invalid token span [{ti_first}..{ti_last}] "
                         f"for a line of {len(toks)} tokens")
    ids = [i for t in toks[ti_first:ti_last + 1] for i in t["ids"]]
    toks[ti_first:ti_last + 1] = [{"ids": ids, "sep": sep,
                                   "del": toks[ti_first].get("del", False),
                                   "style": dict(toks[ti_first].get("style") or {})}]

def layout_merge(project, gidxs):
    idx = sorted(set(gidxs))
    if len(idx) < 2 or idx != list(range(idx[0], idx[-1] + 1)):
        return False
    L = project["layout"]; first = L[idx[0]]
    lines = [ln for gi in idx for ln in L[gi]["lines"]]
    merged = {**first, "lines": lines, "win_start": None, "win_end": None}
    project["layout"] = L[:idx[0]] + [merged] + L[idx[-1] + 1:]
    return True

def layout_ungroup(project, gi):
    L = project["layout"]; g = L[gi]
    new = [{"label": g["label"], "lines": [ln], "accumulate": g["accumulate"],
            "win_start": None, "win_end": None, "linger": g.get("linger"),
            "del": False, "style": dict(g.get("style") or {}),
            "fade": dict(g.get("fade") or {})} for ln in g["lines"]]  # copies parent group's style and fade (legacy AppV2 dropped it)
    project["layout"] = L[:gi] + new + L[gi + 1:]

def layout_split_event(project, gi, li):
    L = project["layout"]; g = L[gi]
    if 0 < li < len(g["lines"]):
        a = {**g, "lines": g["lines"][:li], "win_start": None, "win_end": None}
        b = {**g, "lines": g["lines"][li:], "win_start": None, "win_end": None}
        project["layout"] = L[:gi] + [a, b] + L[gi + 1:]
