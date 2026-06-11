# engine/mutations.py — pure project edits: (project, ...) -> None (mutate in place).
# The controller snapshots for undo and triggers rebuild; these never touch UI.
import copy
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

def set_layout_props(project, gi, win_start, win_end, linger):
    g = project["layout"][gi]
    g["win_start"] = win_start; g["win_end"] = win_end
    g["linger"] = linger

def _one_line(s):
    return (s or "").replace("\r", " ").replace("\n", " ").strip()

def set_event_label(project, gi, label):
    L = project["layout"]
    if 0 <= gi < len(L): L[gi]["label"] = _one_line(label)

def set_event_section(project, gi, section):
    L = project["layout"]
    if 0 <= gi < len(L): L[gi]["section"] = _one_line(section)

def set_event_color(project, gi, color):
    L = project["layout"]
    if 0 <= gi < len(L): L[gi]["color"] = (color or "").strip()

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


def break_after_each(project, gi, li, tis):
    """Split a single line `li` of event `gi` AFTER each given token index, in ONE
    step (one undo reverts every cut). `tis` are token positions within line `li`;
    a break is placed after token ti (i.e. ti+1 starts a new line) for each ti in
    `tis`. Boundary positions (after the last token / before the first) are inert,
    matching add_break. Empty / single-element `tis` behave exactly like the
    equivalent add_break calls. ValueError on an out-of-range gi/li/ti."""
    lines = project["layout"][gi]["lines"]
    if not (0 <= li < len(lines)):
        raise ValueError(f"break_after_each: line {li} out of range for {len(lines)} lines")
    toks = lines[li]["toks"]
    n = len(toks)
    for ti in tis:
        if not (0 <= ti < n):
            raise ValueError(f"break_after_each: token index {ti} out of range for {n} tokens")
    # cut positions = token boundaries strictly inside the line (after ti => ti+1)
    cuts = sorted({ti + 1 for ti in tis if 0 < ti + 1 < n})
    if not cuts:
        return
    bounds = [0] + cuts + [n]
    new_lines = [{"toks": toks[a:b]} for a, b in zip(bounds, bounds[1:])]
    lines[li:li + 1] = new_lines


def join_lines_multi(project, gi, lis):
    """Collapse the given line indices of event `gi` into ONE line, in ONE step
    (one undo reverts the whole join). `lis` must be a contiguous run of line
    indices; their tokens concatenate in line order onto the first line and the
    rest are removed. A single-element `lis` is a no-op (nothing to join).
    ValueError if indices are out of range or not contiguous."""
    lines = project["layout"][gi]["lines"]
    idx = sorted(set(lis))
    if not idx:
        return
    for li in idx:
        if not (0 <= li < len(lines)):
            raise ValueError(f"join_lines_multi: line {li} out of range for {len(lines)} lines")
    if idx != list(range(idx[0], idx[-1] + 1)):
        raise ValueError(f"join_lines_multi: line indices {idx} are not contiguous")
    if len(idx) < 2:
        return
    lo, hi = idx[0], idx[-1]
    merged = [t for li in range(lo, hi + 1) for t in lines[li]["toks"]]
    lines[lo:hi + 1] = [{"toks": merged}]


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

def unmerge_token(project, gi, li, ti):
    """Split a merged token [gi][li][ti] into one token per word id. Each split
    token inherits an independent COPY of the merged token's style and del flag;
    sep resets to "" (split words carry no glue). One call = one undo step.
    ValueError if the token is not merged (< 2 ids)."""
    toks = project["layout"][gi]["lines"][li]["toks"]
    if not (0 <= ti < len(toks)):
        raise ValueError(f"unmerge_token: ti {ti} out of range for {len(toks)} tokens")
    tok = toks[ti]
    if len(tok["ids"]) < 2:
        raise ValueError(f"unmerge_token: token at [{gi}][{li}][{ti}] is not merged")
    solos = [{"ids": [i], "sep": "", "del": tok.get("del", False),
              "style": dict(tok.get("style") or {})} for i in tok["ids"]]
    toks[ti:ti + 1] = solos


def merge_word_run(project, gi, ids):
    """Merge a contiguous run of word ids within group `gi` into a single token.
    The run must be layout-contiguous (consecutive in the group's flattened token
    order); it MAY span line breaks — the \\N's strictly INSIDE the run are dropped
    while breaks outside are preserved. ids may belong to >1 token (already-merged
    toks included). Keeps the LEFT-most token's style and del flag (same semantics
    as merge_token_span). One call = one undo step.

    ValueError if any id is missing, lives in another group, or the selected
    tokens are not a contiguous run."""
    idset = set(ids)
    if not idset:
        raise ValueError("merge_word_run: empty id set")
    # reject ids that live outside this group
    for ogi, g in enumerate(project["layout"]):
        if ogi == gi:
            continue
        for ln in g["lines"]:
            for t in ln["toks"]:
                if idset & set(t["ids"]):
                    raise ValueError("merge_word_run: ids span more than one group")
    g = project["layout"][gi]
    # flatten the group's tokens with their owning line index, in layout order
    flat = [(li, ti, t) for li, ln in enumerate(g["lines"])
            for ti, t in enumerate(ln["toks"])]
    sel_pos = [k for k, (_, _, t) in enumerate(flat) if idset & set(t["ids"])]
    if not sel_pos:
        raise ValueError("merge_word_run: no selected ids found in group")
    lo, hi = sel_pos[0], sel_pos[-1]
    # contiguity: every flattened token between the first and last selected must be selected
    if sel_pos != list(range(lo, hi + 1)):
        raise ValueError("merge_word_run: selected words are not a contiguous run")
    if lo == hi:
        return  # single token already covers the run — nothing to merge
    merged_ids = [i for _, _, t in flat[lo:hi + 1] for i in t["ids"]]
    left = flat[lo][2]
    run_first_line = flat[lo][0]
    run_last_line = flat[hi][0]
    new_tok = {"ids": merged_ids, "sep": " ",
               "del": left.get("del", False),
               "style": dict(left.get("style") or {})}
    # The run collapses lines [run_first_line..run_last_line] into one: every \N
    # strictly inside the run is dropped, outer breaks kept. The merged token lands
    # on run_first_line; tokens that trailed on run_last_line (after `hi`) join it.
    def _relabel(li):
        return run_first_line if run_first_line <= li <= run_last_line else li
    rebuilt = [(li, t) for li, _, t in flat[:lo]]
    rebuilt.append((run_first_line, new_tok))         # merged tok lives on the run's first line
    rebuilt += [(_relabel(li), t) for li, _, t in flat[hi + 1:]]
    lines = []
    cur = []
    for k, (li, t) in enumerate(rebuilt):
        cur.append(t)
        nxt = rebuilt[k + 1][0] if k + 1 < len(rebuilt) else None
        if nxt is not None and nxt != li:
            lines.append({"toks": cur}); cur = []
    if cur:
        lines.append({"toks": cur})
    g["lines"] = lines


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
    new = [{"label": g["label"], "lines": [ln], "accumulate": g.get("accumulate", "words"),
            "win_start": None, "win_end": None, "linger": g.get("linger"),
            "del": False, "style": dict(g.get("style") or {}),
            "section": g.get("section", ""), "color": g.get("color", ""),
            "fade": dict(g.get("fade") or {})} for ln in g["lines"]]  # copies parent group's style and fade (legacy AppV2 dropped it)
    project["layout"] = L[:gi] + new + L[gi + 1:]

def layout_split_event(project, gi, li):
    L = project["layout"]; g = L[gi]
    if 0 < li < len(g["lines"]):
        a = {**g, "lines": g["lines"][:li], "win_start": None, "win_end": None}
        b = {**g, "lines": g["lines"][li:], "win_start": None, "win_end": None}
        project["layout"] = L[:gi] + [a, b] + L[gi + 1:]

# ── animations ───────────────────────────────────────────────────────────────
# Session-recorded mutations matching engine/anim.py's spec. Same style as the
# other mutations: plain functions mutating the project dict in place.
from engine import anim as _anim


def _anim_list(project, scope, ref):
    """The carrier list an animation lives in for scope/ref (created if absent)."""
    if scope == "global":
        return project.setdefault("globals", {}).setdefault("animations", [])
    if scope == "group":
        g = project["layout"][ref]
        return g.setdefault("animations", [])
    if scope == "tag":
        idset = set(ref)
        for t in project.setdefault("anim_tags", []):
            if set(t["ids"]) == idset:
                return t.setdefault("anims", [])
        t = {"ids": list(ref), "anims": [], "suppress": []}
        project["anim_tags"].append(t)
        return t["anims"]
    raise ValueError(f"unknown scope {scope!r}")


def _suppress_list(project, scope, ref):
    if scope == "group":
        return project["layout"][ref].setdefault("suppress", [])
    if scope == "tag":
        idset = set(ref)
        for t in project.setdefault("anim_tags", []):
            if set(t["ids"]) == idset:
                return t.setdefault("suppress", [])
        t = {"ids": list(ref), "anims": [], "suppress": []}
        project["anim_tags"].append(t)
        return t["suppress"]
    raise ValueError(f"cannot suppress at scope {scope!r}")


def _owns(project, scope, ref, anim_id):
    """True if anim_id is an OWN animation of scope/ref (vs inherited)."""
    return any(a["id"] == anim_id for a in _anim_list(project, scope, ref))


def anim_add(project, scope, ref, anim):
    """Validate and append an animation at scope/ref (multi-channel presets arrive
    as sibling records sharing group_id — added one call each)."""
    _anim.validate_animation(project, scope, ref, anim)
    _anim_list(project, scope, ref).append(copy.deepcopy(anim))


def anim_remove(project, scope, ref, anim_id):
    """Own anim → delete it (and its group_id siblings). Inherited id at a narrower
    scope → tombstone (append to suppress). Idempotent no-op otherwise (ruling 5)."""
    lst = _anim_list(project, scope, ref)
    owned = [a for a in lst if a["id"] == anim_id]
    if owned:
        gids = {a.get("group_id") for a in owned if a.get("group_id")}
        lst[:] = [a for a in lst
                  if a["id"] != anim_id and not (a.get("group_id") and a.get("group_id") in gids)]
        return
    if scope in ("group", "tag"):
        supp = _suppress_list(project, scope, ref)
        if anim_id not in supp:
            supp.append(anim_id)


def anim_restore(project, scope, ref, anim_id):
    """Remove a tombstone (suppress entry); idempotent no-op."""
    if scope not in ("group", "tag"):
        return
    supp = _suppress_list(project, scope, ref)
    if anim_id in supp:
        supp[:] = [s for s in supp if s != anim_id]


def anim_set_props(project, scope, ref, anim_id, partial):
    """Merge a partial prop update onto an animation; validates the merged result.
    Settable: mode, step, step_unit, segments, enabled, name. Plus the drag-retime
    path: a {"t0": {"offset": ms}} / {"t1": {"offset": ms}} partial writes the offset
    onto every segment's matching endpoint (against its existing anchor)."""
    lst = _anim_list(project, scope, ref)
    target = next((a for a in lst if a["id"] == anim_id), None)
    if target is None:
        return

    def apply_to(a, seg_only):
        merged = copy.deepcopy(a)
        for k, v in partial.items():
            if k == "segments" or (not seg_only and k in ("mode", "step", "step_unit", "enabled", "name")):
                merged[k] = v
        for ep in ("t0", "t1"):                  # drag-retime: offset delta vs anchor
            if ep in partial and isinstance(partial[ep], dict):
                d = partial[ep]
                for s in merged["segments"]:
                    t = s[ep]
                    if "anchor" in d:
                        t["anchor"] = d["anchor"]
                    if "unit" in d:
                        t["unit"] = d["unit"]
                    if "offset" in d:                # delta against the existing offset
                        t["offset"] = t.get("offset", 0) + d["offset"]
        _anim.validate_animation(project, scope, ref, merged)
        a.clear()
        a.update(merged)

    apply_to(target, seg_only=False)
    # segments/t0/t1 writes propagate to own records sharing the target's group_id;
    # mode/step/step_unit/enabled/name stay target-only.
    gid = target.get("group_id")
    has_seg = "segments" in partial or "t0" in partial or "t1" in partial
    if gid and has_seg:
        for a in lst:
            if a["id"] != anim_id and a.get("group_id") == gid:
                apply_to(a, seg_only=True)


def anim_edit_custom(project, scope, ref, anim_id, anims):
    """Replace an own animation (and its group_id siblings) at scope/ref with the
    provided record set, in place at the lead's slot. The client rebuilds the
    records (preserving the lead id); the engine validates + splices. No-op if
    anim_id isn't an own record here."""
    lst = _anim_list(project, scope, ref)
    lead = next((a for a in lst if a["id"] == anim_id), None)
    if lead is None:
        return
    gid = lead.get("group_id")
    replaced = {a["id"] for a in lst
                if a["id"] == anim_id or (gid and a.get("group_id") == gid)}
    for rec in (anims or []):
        _anim.validate_animation(project, scope, ref, rec)
    out, inserted = [], False
    for a in lst:
        if a["id"] in replaced:
            if not inserted:
                out.extend(copy.deepcopy(r) for r in (anims or []))
                inserted = True
        else:
            out.append(a)
    if not inserted:
        out.extend(copy.deepcopy(r) for r in (anims or []))
    lst[:] = out
