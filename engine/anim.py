# engine/anim.py — animation model constants, validation, resolution, emission.
# UI-free: imports core only. Semantics from HANDOFF Part 1 + §12 rulings, the
# reconciliation doc, and the libass spike verdicts (spikes/libass/FINDINGS.md).
import core

ANIM_CHANNELS = ["alpha", "fill_alpha", "outline_alpha", "shadow_alpha",
                 "primary", "outline", "back",
                 "scale_x", "scale_y", "fontsize",
                 "rot_x", "rot_y", "rot_z", "shear_x", "shear_y",
                 "spacing", "border_w", "shadow_depth", "blur",
                 "clip_rect", "karaoke_fill", "move"]
ANCHORS = ["cue_start", "cue_end", "line_start", "line_end",
           "span_start", "span_end", "event_start", "event_end"]
MODES = ["percue", "perline", "together", "cascade", "typewriter",
         "reverse", "centerout", "jitter", "custom"]
SEQUENCE_MODES = ["cascade", "typewriter", "reverse", "centerout", "jitter"]

# karaoke_fill timing is intrinsically the sung interval — its endpoints are not
# author-anchored. We accept exactly this canonical anchor pair (cue_start..cue_end).
_KFILL_ANCHORS = {"cue_start", "cue_end"}


# ── validation ────────────────────────────────────────────────────────────────

def validate_animation(project, scope, ref, anim):
    """Raise ValueError on an invalid animation for the given scope/ref.

    scope: "global" | "group" | "tag" ; ref: None | gi | [wid,...]."""
    ch = anim.get("channel")
    if ch not in ANIM_CHANNELS:
        raise ValueError(f"unknown channel {ch!r}")
    if ch == "move" and scope == "tag":
        raise ValueError("'move' is event-level: not allowed at tag (cue/selection) scope")
    mode = anim.get("mode")
    if mode is not None and mode not in MODES:
        raise ValueError(f"unknown mode {mode!r}")
    if anim.get("step") is not None and mode is not None and mode not in SEQUENCE_MODES:
        raise ValueError(f"step present on non-sequence mode {mode!r}")
    su = anim.get("step_unit")
    if su is not None and su not in ("ms", "frac"):
        raise ValueError(f"unknown step_unit {su!r}")

    segs = anim.get("segments") or []
    prev_end = None
    for s in segs:
        for ep in ("t0", "t1"):
            t = s[ep]
            if t["anchor"] not in ANCHORS:
                raise ValueError(f"unknown anchor {t['anchor']!r}")
            unit = t.get("unit", "ms")
            if unit not in ("ms", "frac"):
                raise ValueError(f"unknown unit {unit!r}")
            if unit == "frac" and not (0.0 <= float(t["offset"]) <= 1.0):
                raise ValueError(f"frac offset {t['offset']!r} out of range 0..1")
        if ch == "karaoke_fill":
            if (s["t0"]["anchor"] not in _KFILL_ANCHORS
                    or s["t1"]["anchor"] not in _KFILL_ANCHORS):
                raise ValueError("karaoke_fill animates the sung interval only")
        # ordering / overlap WITHIN one animation: reject, never sort (ruling 3).
        # Segments of one animation share a clock, so we compare on (anchor order,
        # offset) keys in nominal time order.
        a0 = _raw_key(s["t0"]); a1 = _raw_key(s["t1"])
        if a1 < a0:
            raise ValueError("segment t1 precedes t0")
        if prev_end is not None and a0 < prev_end:
            raise ValueError("segments out of order / overlapping within animation")
        prev_end = a1


def _raw_key(t):
    """A comparable scalar for a segment endpoint within one animation, using the
    anchor's nominal time order plus the offset."""
    return (ANCHORS.index(t["anchor"]), float(t.get("offset", 0)))


def new_id(existing_ids):
    """First free "aN" id not in existing_ids."""
    s = set(existing_ids)
    n = 1
    while f"a{n}" in s:
        n += 1
    return f"a{n}"


# ── anchor math ─────────────────────────────────────────────────────────────

def _cue_span(project, gi, li, ti):
    tok = project["layout"][gi]["lines"][li]["toks"][ti]
    words = project["words"]
    ids = [i for i in tok["ids"] if i < len(words)]
    return (min(words[i]["start"] for i in ids), max(words[i]["end"] for i in ids))


def _line_span(project, gi, li):
    words = project["words"]
    toks = [t for t in project["layout"][gi]["lines"][li]["toks"] if not t.get("del")]
    ids = [i for t in toks for i in t["ids"] if i < len(words)]
    return (min(words[i]["start"] for i in ids), max(words[i]["end"] for i in ids))


def event_window(project, gi):
    """The rendered event window (win_start .. win_end+linger) for a group — the
    same numbers render.py computes."""
    from engine.model import BUILTIN
    G = project["globals"]
    g = project["layout"][gi]
    words = project["words"]
    ids = [i for line in g["lines"] for t in line["toks"]
           if not t.get("del") for i in t["ids"] if i < len(words)]
    base_s = min(words[i]["start"] for i in ids)
    base_e = max(words[i]["end"] for i in ids)
    ling = g["linger"] if g.get("linger") is not None else G.get("linger", BUILTIN["linger"])
    win_s = g["win_start"] if g.get("win_start") is not None else base_s
    win_e = g["win_end"] if g.get("win_end") is not None else base_e + ling
    return win_s, win_e


def anchor_seconds(project, gi, li, ti, anim_time, scope_span):
    """Resolve an AnimTime to absolute seconds for the given cue.

    scope_span: the (start, end) span for span_* anchors (tag: min..max over ids;
    group/global: the event window). Pass None to derive the group event window."""
    anchor = anim_time["anchor"]
    base, pair = _anchor_pair(project, gi, li, ti, anchor, scope_span)
    offset = float(anim_time.get("offset", 0))
    unit = anim_time.get("unit", "ms")
    if unit == "frac":
        return base + offset * (pair[1] - pair[0])
    return base + offset / 1000.0


def _anchor_pair(project, gi, li, ti, anchor, scope_span):
    """(base_seconds, (span_start, span_end)) for an anchor; the pair scales frac."""
    if anchor in ("cue_start", "cue_end"):
        s, e = _cue_span(project, gi, li, ti)
        return (s if anchor == "cue_start" else e), (s, e)
    if anchor in ("line_start", "line_end"):
        s, e = _line_span(project, gi, li)
        return (s if anchor == "line_start" else e), (s, e)
    if anchor in ("span_start", "span_end"):
        s, e = scope_span if scope_span is not None else event_window(project, gi)
        return (s if anchor == "span_start" else e), (s, e)
    s, e = event_window(project, gi)
    return (s if anchor == "event_start" else e), (s, e)


# ── resolution ────────────────────────────────────────────────────────────────

def _member_cues(project, scope, ref):
    """Ordered member cues of a scope as (gi, li, ti, wid0), in layout reading
    order (group, line, token)."""
    out = []
    if scope == "tag":
        idset = set(ref)
        for gi, g in enumerate(project["layout"]):
            if g.get("del"):
                continue
            for li, line in enumerate(g["lines"]):
                for tok_i, tok in enumerate(line["toks"]):
                    if tok.get("del") or not tok["ids"]:
                        continue
                    if any(i in idset for i in tok["ids"]):
                        out.append((gi, li, tok_i, tok["ids"][0]))
        return out
    if scope == "group":
        g = project["layout"][ref]
        for li, line in enumerate(g["lines"]):
            for tok_i, tok in enumerate(line["toks"]):
                if tok.get("del") or not tok["ids"]:
                    continue
                out.append((ref, li, tok_i, tok["ids"][0]))
        return out
    for gi, g in enumerate(project["layout"]):       # global: every cue
        if g.get("del"):
            continue
        for li, line in enumerate(g["lines"]):
            for tok_i, tok in enumerate(line["toks"]):
                if tok.get("del") or not tok["ids"]:
                    continue
                out.append((gi, li, tok_i, tok["ids"][0]))
    return out


def _scope_span(project, scope, ref):
    """span_* base for a scope: tag = min..max over its ids; group/global resolve
    per-cue to that cue's event window (returned as None here)."""
    words = project["words"]
    if scope == "tag":
        ids = [i for i in ref if i < len(words)]
        return (min(words[i]["start"] for i in ids), max(words[i]["end"] for i in ids))
    return None


def _to_s(v, u, span_len):
    return v * span_len if u == "frac" else v / 1000.0


def _member_offset(mode, step, step_unit, stagger, idx, n, span_len, wid0, member_dur):
    """Per-member stagger delay (seconds) for a sequence mode."""
    if n <= 1:
        return 0.0   # stagger inert on single-member scopes (ruling 4)
    step_val, step_u = step, step_unit
    chained = bool(stagger and stagger.get("chained"))
    if stagger and step_val is None:
        st = stagger.get("step") or {}
        step_val = st.get("value")
        step_u = st.get("unit", step_u)

    if mode == "typewriter" or chained:
        return idx * member_dur                          # step = previous member's dur
    if mode == "cascade":
        return idx * _to_s(step_val, step_u, span_len)
    if mode == "reverse":
        return (n - 1 - idx) * _to_s(step_val, step_u, span_len)
    if mode == "centerout":
        mid = (n - 1) / 2.0
        # dense rank by distance from the midpoint: equal distances share a step.
        dists = sorted({abs(j - mid) for j in range(n)})
        rank = dists.index(abs(idx - mid))
        return rank * _to_s(step_val, step_u, span_len)
    if mode == "jitter":
        import random
        amp = _to_s(step_val, step_u, span_len)
        return random.Random(wid0).uniform(-amp, amp)
    return 0.0


def resolve_animations(project, gi, li, ti):
    """The cue's renderable (flat, resolved) animation list."""
    tok = project["layout"][gi]["lines"][li]["toks"][ti]
    if not tok["ids"]:
        return []
    wid0 = tok["ids"][0]
    group = project["layout"][gi]

    # 1. collect: global -> group -> tags (stored order), tagging src/scope/ref.
    collected = []
    for a in (project.get("globals", {}).get("animations") or []):
        collected.append((a, "global", "global", None))
    for a in (group.get("animations") or []):
        collected.append((a, "group", "group", gi))
    for t in (project.get("anim_tags") or []):
        if wid0 in t.get("ids", []):
            for a in (t.get("anims") or []):
                collected.append((a, "tag", "tag", t["ids"]))

    # 2. suppression: group.suppress hides global ids for the group; tag.suppress
    #    hides global+group ids for the tag's ids (this cue).
    g_supp = set(group.get("suppress") or [])
    tag_supp = set()
    for t in (project.get("anim_tags") or []):
        if wid0 in t.get("ids", []):
            tag_supp |= set(t.get("suppress") or [])

    survivors = []
    for a, src, scope, ref in collected:
        if not a.get("enabled", True):
            continue
        aid = a["id"]
        if src == "global" and (aid in g_supp or aid in tag_supp):
            continue
        if src == "group" and aid in tag_supp:
            continue
        survivors.append((a, src, scope, ref))

    # 3+4. expand mode -> member offset, resolve anchors -> absolute seconds.
    SRC_RANK = {"global": 0, "group": 1, "tag": 2}
    resolved = []
    for a, src, scope, ref in survivors:
        members = _member_cues(project, scope, ref)
        n = len(members)
        idx = next((k for k, m in enumerate(members) if m[3] == wid0), 0)
        span = _scope_span(project, scope, ref)
        span_pair = span if span is not None else event_window(project, gi)
        span_len = span_pair[1] - span_pair[0]
        mode = a.get("mode")
        off = 0.0
        if mode in SEQUENCE_MODES:
            member_dur = _anim_duration(project, gi, li, ti, a, span)
            off = _member_offset(mode, a.get("step"), a.get("step_unit"),
                                 a.get("stagger"), idx, n, span_len, wid0, member_dur)
        rsegs = []
        for s in a["segments"]:
            start_s = anchor_seconds(project, gi, li, ti, s["t0"], span) + off
            end_s = anchor_seconds(project, gi, li, ti, s["t1"], span) + off
            rsegs.append({"start_s": start_s, "end_s": end_s,
                          "from": s.get("from"), "to": s["to"], "accel": s.get("accel", 1)})
        resolved.append({"id": a["id"], "name": a.get("name", "custom"),
                         "group_id": a.get("group_id"), "channel": a["channel"],
                         "segments": rsegs, "src": src, "warning": None,
                         "_rank": SRC_RANK[src]})

    # 5. conflict rule (same channel + time-overlap).
    drop = set()
    for i in range(len(resolved)):
        for j in range(i + 1, len(resolved)):
            ai, aj = resolved[i], resolved[j]
            if ai["channel"] != aj["channel"] or not _overlap(ai, aj):
                continue
            if ai["_rank"] == aj["_rank"]:
                ai["warning"] = "overlap"
                aj["warning"] = "overlap"
            else:
                wider = i if ai["_rank"] < aj["_rank"] else j
                drop.add(id(resolved[wider]))

    out = [a for a in resolved if id(a) not in drop]
    for a in out:
        a.pop("_rank", None)
    return out


def _anim_duration(project, gi, li, ti, a, span):
    """Total resolved duration (seconds) of an animation's segments for this cue —
    the typewriter chained step (previous member's own duration)."""
    segs = a["segments"]
    s0 = anchor_seconds(project, gi, li, ti, segs[0]["t0"], span)
    s1 = anchor_seconds(project, gi, li, ti, segs[-1]["t1"], span)
    return s1 - s0


def _overlap(ai, aj):
    si0 = min(s["start_s"] for s in ai["segments"])
    si1 = max(s["end_s"] for s in ai["segments"])
    sj0 = min(s["start_s"] for s in aj["segments"])
    sj1 = max(s["end_s"] for s in aj["segments"])
    return si0 < sj1 and sj0 < si1


# ── emission (.ass override tags) ──────────────────────────────────────────────
#
# Spike #1: for one property the LAST-LISTED \t wins continuously → emit
# global→group→tag (narrowest scope last). Spike #2: rect \clip interpolates under
# \t. Spike #5: \kf with \k gap padding from event start (centiseconds).

_SRC_ORDER = {"global": 0, "group": 1, "tag": 2}

# Scalar channels: channel -> ASS override tag. Values emitted as-is.
_SCALAR_TAGS = {
    "scale_x": "\\fscx", "scale_y": "\\fscy", "fontsize": "\\fs",
    "rot_x": "\\frx", "rot_y": "\\fry", "rot_z": "\\frz",
    "shear_x": "\\fax", "shear_y": "\\fay",
    "spacing": "\\fsp", "border_w": "\\bord", "shadow_depth": "\\shad",
    "blur": "\\blur",
    "fill_alpha": "\\1a", "outline_alpha": "\\3a", "shadow_alpha": "\\4a",
}
_COLOR_TAGS = {"primary": "\\1c", "outline": "\\3c", "back": "\\4c"}


def _alpha_hex(v):
    return f"\\alpha&H{round((1 - max(0.0, min(1.0, float(v)))) * 255):02X}&"


def _color_hex(hex_color):
    h = str(hex_color).lstrip("#")
    return f"&H{h[4:6]}{h[2:4]}{h[0:2]}&".upper()


def _rel_ms(t, ev):
    return max(0, int(round((t - ev) * 1000)))


def _fmt_num(v):
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def _seg_from(seg, default):
    v = seg.get("from")
    return default if v is None else v


def _accel_tag(accel):
    """Leading accel argument of a \\t (empty for linear)."""
    if accel in (1, 1.0, None):
        return ""
    return f"{_fmt_num(accel)},"


def _midval(f, t):
    try:
        return (float(f) + float(t)) / 2.0
    except (TypeError, ValueError):
        return t


def _expand(segs):
    """Expand each segment, splitting accel=='inout' into two chained \\t (the
    compile-time S-curve), and attaching the leading accel_tag text."""
    out = []
    for s in segs:
        accel = s.get("accel", 1)
        if accel == "inout":
            mid_s = (s["start_s"] + s["end_s"]) / 2.0
            f, t = s.get("from"), s["to"]
            mid_v = _midval(f, t)
            out.append({"start_s": s["start_s"], "end_s": mid_s, "from": f,
                        "to": mid_v, "accel_tag": _accel_tag(2)})
            out.append({"start_s": mid_s, "end_s": s["end_s"], "from": mid_v,
                        "to": t, "accel_tag": _accel_tag(0.5)})
        else:
            out.append({"start_s": s["start_s"], "end_s": s["end_s"],
                        "from": s.get("from"), "to": s["to"],
                        "accel_tag": _accel_tag(accel)})
    return out


def _mirror_move_seg(seg, play_w):
    """Mirror a move segment's x endpoints around play_w and swap them so the
    motion DIRECTION flips for RTL. Spatial-only; y untouched."""
    frm, to = list(seg["from"]), list(seg["to"])
    frm[0] = play_w - frm[0]
    to[0] = play_w - to[0]
    return {**seg, "from": frm, "to": to}


def _mirror_clip_seg(seg, play_w):
    """Mirror a clip_rect segment's x1/x2 around play_w and swap them so x1<x2
    is preserved. Spatial-only; y untouched."""
    to = list(seg["to"])
    nx1, nx2 = play_w - to[0], play_w - to[2]
    to[0], to[2] = min(nx1, nx2), max(nx1, nx2)
    return {**seg, "to": to}


def _mirror_anim(a, play_w):
    """Return a copy of a spatial animation with its x-coordinates mirrored for
    RTL. Non-spatial channels are returned unchanged."""
    ch = a["channel"]
    if ch == "move":
        return {**a, "segments": [_mirror_move_seg(s, play_w) for s in a["segments"]]}
    if ch == "clip_rect":
        return {**a, "segments": [_mirror_clip_seg(s, play_w) for s in a["segments"]]}
    return a


def emit_anim_tags(word_anims, ev_start, play_w=1920, direction="ltr"):
    """Compile a cue's resolved animation list to its .ass override-tag string.

    Per channel, segments emit chained \\t in chronological order; across
    animations the narrowest scope is emitted LAST (spike #1). ev_start is the
    rendered event start in seconds.

    When direction == "rtl", SPATIAL channels are mirrored around play_w before
    emission — `move` x-endpoints flip (mirror + swap so the motion direction
    reverses) and `clip_rect` x1/x2 mirror+swap. Non-spatial channels
    (alpha/scale/rot/color/blur/spacing/...) are untouched."""
    if direction == "rtl":
        word_anims = [_mirror_anim(a, play_w) for a in word_anims]
    anims = sorted(word_anims, key=lambda a: _SRC_ORDER.get(a.get("src"), 1))
    alpha_anims = [a for a in anims if a["channel"] == "alpha"]

    init, chains, moves = [], [], []
    # Appearance gate: a cue with no alpha animation is visible for the whole
    # event; otherwise the initial opacity is the from-value of the earliest alpha
    # segment (one static \alpha for the whole cue — later \t take over).
    if not alpha_anims:
        init.append("\\alpha&H00&")
    else:
        first = min((s for a in alpha_anims for s in a["segments"]),
                    key=lambda s: s["start_s"])
        init.append(_alpha_hex(_seg_from(first, 0.0)))

    for a in anims:
        ch, segs = a["channel"], a["segments"]
        if ch == "alpha":
            for s in _expand(segs):
                chains.append(f"\\t({_rel_ms(s['start_s'], ev_start)},"
                              f"{_rel_ms(s['end_s'], ev_start)},"
                              f"{s['accel_tag']}{_alpha_hex(s['to'])})")
        elif ch in _SCALAR_TAGS:
            tag = _SCALAR_TAGS[ch]
            f = _seg_from(segs[0], None)
            if f is not None:
                init.append(f"{tag}{_fmt_num(f)}")
            for s in _expand(segs):
                chains.append(f"\\t({_rel_ms(s['start_s'], ev_start)},"
                              f"{_rel_ms(s['end_s'], ev_start)},"
                              f"{s['accel_tag']}{tag}{_fmt_num(s['to'])})")
        elif ch in _COLOR_TAGS:
            tag = _COLOR_TAGS[ch]
            f = _seg_from(segs[0], None)
            if f is not None:
                init.append(f"{tag}{_color_hex(f)}")
            for s in _expand(segs):
                chains.append(f"\\t({_rel_ms(s['start_s'], ev_start)},"
                              f"{_rel_ms(s['end_s'], ev_start)},"
                              f"{s['accel_tag']}{tag}{_color_hex(s['to'])})")
        elif ch == "clip_rect":
            for s in _expand(segs):
                x = s["to"]
                chains.append(f"\\t({_rel_ms(s['start_s'], ev_start)},"
                              f"{_rel_ms(s['end_s'], ev_start)},"
                              f"{s['accel_tag']}\\clip("
                              f"{int(x[0])},{int(x[1])},{int(x[2])},{int(x[3])}))")
        elif ch == "karaoke_fill":
            chains.append(_emit_kf(a, ev_start))
        elif ch == "move":
            s = segs[0]
            frm, to = s["from"], s["to"]
            moves.append(f"\\move({int(frm[0])},{int(frm[1])},{int(to[0])},{int(to[1])},"
                         f"{_rel_ms(s['start_s'], ev_start)},{_rel_ms(s['end_s'], ev_start)})")

    return "".join(p for p in (init + moves + chains) if p)


def _emit_kf(a, ev_start):
    """Karaoke sweep: \\k lead-in/gap padding + \\kf, centiseconds from event start
    (spike #5). One sung interval (start_s..end_s) per word here."""
    s = a["segments"][0]
    lead_cs = max(0, int(round((s["start_s"] - ev_start) * 100)))
    dur_cs = max(0, int(round((s["end_s"] - s["start_s"]) * 100)))
    return f"\\k{lead_cs}\\kf{dur_cs}"
