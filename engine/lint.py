# engine/lint.py — export-readiness lint: aggregate engine-computed issues into a
# flat list the UI/export can surface. UI-free; imports engine.anim + core only.
#
# Each issue is {"level": "warn"|"error", "code": str, "msg": str, "where": dict}.
# `where` locates the issue (e.g. {"scope","ref"} for animations, {"placement":True}
# for the global \pos, {"gi","li","ti"} for a cue's resolved animation).
#
# Aggregated checks:
#   - anim_invalid  (error): a persisted animation fails engine.anim.validate
#   - anim_overlap  (warn):  same-scope same-channel time overlap (resolve sets
#                            ResolvedAnim.warning == "overlap")
#   - anim_clamped  (warn):  a resolved animation segment falls (partly) outside the
#                            cue's event window — a trigger that will be clamped
#   - pos_off_canvas(warn):  global \pos lies outside [0,play_w] x [0,play_h]
from engine import anim


def _issue(level, code, msg, where):
    return {"level": level, "code": code, "msg": msg, "where": where}


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


def _validate_issues(project):
    out = []
    for scope, ref, a in _persisted_anim_lists(project):
        try:
            anim.validate_animation(project, scope, ref, a)
        except ValueError as e:
            out.append(_issue("error", "anim_invalid",
                              f"invalid animation {a.get('id', '?')!r} ({a.get('channel', '?')}): {e}",
                              {"scope": scope, "ref": ref, "anim_id": a.get("id")}))
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
                            out.append(_issue(
                                "warn", "anim_overlap",
                                f"{ra.get('src', '?')}-scope animations overlap on "
                                f"channel {ra['channel']!r}",
                                {"scope": ra.get("src"), "channel": ra["channel"],
                                 "gi": gi, "li": li, "ti": ti}))
                    if win_s is None:
                        continue
                    segs = ra.get("segments") or []
                    if not segs:
                        continue
                    lo = min(s["start_s"] for s in segs)
                    hi = max(s["end_s"] for s in segs)
                    # a small epsilon avoids flagging float-noise at the window edge
                    if lo < win_s - 1e-6 or hi > win_e + 1e-6:
                        out.append(_issue(
                            "warn", "anim_clamped",
                            f"animation {ra['id']!r} ({ra['channel']}) extends outside the "
                            f"event window [{win_s:.3f},{win_e:.3f}] and will be clamped",
                            {"gi": gi, "li": li, "ti": ti, "anim_id": ra["id"],
                             "window": [win_s, win_e], "span": [lo, hi]}))
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
