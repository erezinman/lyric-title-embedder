# engine/lint.py — export-readiness lint: aggregate engine-computed issues into a
# flat list the UI/export can surface. UI-free; imports engine.anim + core only.
#
# Each issue is {"level": "warn"|"error", "severity": str, "code": str, "msg": str,
# "where": dict}. `level` is kept for back-compat; `severity` is the designer's
# 3-tier export-gate model (blocking / advisory / info).
#
# `where` carries a consistent, UI-consumable JUMP TARGET so the web can do
# "select word_id + move playhead to its time" uniformly:
#   - cue/anim issues: {"word_id": int, "time": float, ...}  (representative word =
#                      first id of the offending cue's token; time = that word's start)
#   - placement (\pos): {"placement": True, "pos": [x, y], ...}
#
# Aggregated checks (code -> severity uses the designer's SUGGESTED DEFAULT mapping
# from HANDOFF Feature B; pre-approved as the default, tunable in SEVERITY below):
#   - anim_invalid  (error / blocking): a persisted animation fails engine.anim.validate
#   - anim_overlap  (warn  / blocking): same-scope same-channel time overlap (resolve
#                            sets ResolvedAnim.warning == "overlap")
#   - anim_clamped  (warn  / advisory): a resolved animation segment falls (partly)
#                            outside the cue's event window — a trigger that will clamp
#   - pos_off_canvas(warn  / info):     global \pos lies outside [0,play_w] x [0,play_h]
#                            (auto-clamped into frame)
from engine import anim

# Designer's default severity mapping (HANDOFF Feature B severity table). The
# handoff marks it "confirm with design"; the default is pre-approved as the
# default — tune here if product revises it.
SEVERITY = {
    "anim_invalid": "blocking",
    "anim_overlap": "blocking",
    "anim_clamped": "advisory",
    "pos_off_canvas": "info",
}


def _issue(level, code, msg, where):
    return {"level": level, "severity": SEVERITY.get(code, "advisory"),
            "code": code, "msg": msg, "where": where}


def _cue_jump(project, gi, li, ti):
    """Representative jump target for a cue at (gi, li, ti): the first word id of
    the token and that word's start time. Returns {} if it can't be resolved."""
    try:
        tok = project["layout"][gi]["lines"][li]["toks"][ti]
        wid = (tok.get("ids") or [None])[0]
        if wid is None:
            return {}
        start = project["words"][wid].get("start")
        return {"word_id": wid, "time": start}
    except (KeyError, IndexError, TypeError):
        return {}


def _persisted_anim_lists(project):
    """Yield (scope, ref, anim) for every persisted (authored) animation."""
    for a in (project.get("globals", {}).get("animations") or []):
        yield ("global", None, a)
    for gi, g in enumerate(project.get("layout", [])):
        for a in (g.get("animations") or []):
            yield ("group", gi, a)
    for t in (project.get("anim_tags") or []):
        for a in (t.get("anims") or []):
            yield ("tag", list(t.get("ids", [])), a)


def _scope_jump(project, scope, ref):
    """Best-effort jump target for a persisted (authored) animation by scope:
      - tag:   ref is a list of word ids -> first id + its start
      - group: ref is a gi -> first cue of that group (its first word)
      - global: no specific cue -> {}
    """
    if scope == "tag" and ref:
        wid = ref[0]
        try:
            return {"word_id": wid, "time": project["words"][wid].get("start")}
        except (KeyError, TypeError):
            return {}
    if scope == "group" and ref is not None:
        try:
            for li, line in enumerate(project["layout"][ref]["lines"]):
                for ti, tok in enumerate(line["toks"]):
                    if tok.get("ids"):
                        return _cue_jump(project, ref, li, ti)
        except (KeyError, IndexError, TypeError):
            return {}
    return {}


def _validate_issues(project):
    out = []
    for scope, ref, a in _persisted_anim_lists(project):
        try:
            anim.validate_animation(project, scope, ref, a)
        except ValueError as e:
            where = {"scope": scope, "ref": ref, "anim_id": a.get("id")}
            where.update(_scope_jump(project, scope, ref))
            out.append(_issue("error", "anim_invalid",
                              f"invalid animation {a.get('id', '?')!r} ({a.get('channel', '?')}): {e}",
                              where))
    return out


def _resolve_issues(project):
    """overlap + off-window (clamped) issues, derived from resolve_animations per cue."""
    out = []
    seen_overlap = set()        # (scope, channel) — collapse duplicate overlap reports
    for gi, g in enumerate(project.get("layout", [])):
        if g.get("del"):
            continue
        try:
            win_s, win_e = anim.event_window(project, gi)
        except (ValueError, KeyError):
            win_s = win_e = None
        for li, line in enumerate(g["lines"]):
            for ti, tok in enumerate(line["toks"]):
                if tok.get("del") or not tok.get("ids"):
                    continue
                try:
                    resolved = anim.resolve_animations(project, gi, li, ti)
                except (ValueError, KeyError, ZeroDivisionError):
                    continue
                for ra in resolved:
                    if ra.get("warning") == "overlap":
                        key = (ra.get("src"), ra["channel"])
                        if key not in seen_overlap:
                            seen_overlap.add(key)
                            where = {"scope": ra.get("src"), "channel": ra["channel"],
                                     "gi": gi, "li": li, "ti": ti}
                            where.update(_cue_jump(project, gi, li, ti))
                            out.append(_issue(
                                "warn", "anim_overlap",
                                f"{ra.get('src', '?')}-scope animations overlap on "
                                f"channel {ra['channel']!r}",
                                where))
                    if win_s is None:
                        continue
                    segs = ra.get("segments") or []
                    if not segs:
                        continue
                    lo = min(s["start_s"] for s in segs)
                    hi = max(s["end_s"] for s in segs)
                    # a small epsilon avoids flagging float-noise at the window edge
                    if lo < win_s - 1e-6 or hi > win_e + 1e-6:
                        where = {"gi": gi, "li": li, "ti": ti, "anim_id": ra["id"],
                                 "window": [win_s, win_e], "span": [lo, hi]}
                        where.update(_cue_jump(project, gi, li, ti))
                        out.append(_issue(
                            "warn", "anim_clamped",
                            f"animation {ra['id']!r} ({ra['channel']}) extends outside the "
                            f"event window [{win_s:.3f},{win_e:.3f}] and will be clamped",
                            where))
    return out


def _placement_issues(placement):
    out = []
    if not placement:
        return out
    pos = placement.get("pos")
    if not placement.get("use_pos") or not pos:
        return out
    try:
        x, y = float(pos[0]), float(pos[1])
    except (TypeError, ValueError, IndexError):
        return out
    pw = placement.get("play_w"); ph = placement.get("play_h")
    if pw is None or ph is None:
        return out
    if not (0.0 <= x <= float(pw) and 0.0 <= y <= float(ph)):
        out.append(_issue("warn", "pos_off_canvas",
                          f"position ({x:g},{y:g}) is outside the {pw}x{ph} canvas",
                          {"placement": True, "pos": [x, y], "play_w": pw, "play_h": ph}))
    return out


def lint_project(project, placement=None):
    """Return a flat list of lint issues for a project. `placement` (optional) carries
    {pos, use_pos, play_w, play_h} for the off-canvas \\pos check — those values live in
    the context globals, not the project dict."""
    issues = []
    issues += _validate_issues(project)
    issues += _resolve_issues(project)
    issues += _placement_issues(placement)
    return issues
