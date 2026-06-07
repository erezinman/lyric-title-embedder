# engine/anim_migrate.py — legacy-project conversion. UI-free.
#
# Converts the legacy fade machinery (fin/fout tags, group.fade, globals
# fade_*_ms, accumulate) into the settled animation carriers, then removes the
# legacy keys. Idempotent; called on project load. The gold test (AE-MIG-07)
# requires the migrated project to compile byte-identically to the legacy engine.
from engine.model import BUILTIN, resolve_fade

# alpha values: 0.0 = fully transparent (&HFF&), 1.0 = fully opaque (&H00&).
_INVISIBLE, _VISIBLE = 0.0, 1.0

# accumulate value -> the appearance animation's (mode, appearance anchor).
_ACC_MODE = {"words": ("percue", "cue_start"),
             "lines": ("perline", "line_start"),
             "off": ("together", "event_start")}


def _t(anchor, offset=0, unit="ms"):
    return {"anchor": anchor, "offset": offset, "unit": unit}


def _alpha_seg(anchor, dur_ms, frm, to):
    return {"t0": _t(anchor, 0), "t1": _t(anchor, dur_ms), "from": frm, "to": to, "accel": 1}


def _appearance_anim(aid, mode, anchor, dur_ms):
    return {"id": aid, "name": "appearance", "group_id": None, "channel": "alpha",
            "mode": mode, "segments": [_alpha_seg(anchor, dur_ms, _INVISIBLE, _VISIBLE)],
            "enabled": True}


def is_migrated(project):
    """True once the legacy keys are gone — the idempotency gate."""
    if "fin_tags" in project or "fout_tags" in project:
        return False
    G = project.get("globals", {})
    if "fade_in_ms" in G or "fade_out_ms" in G:
        return False
    for g in project["layout"]:
        if "fade" in g or "accumulate" in g:
            return False
    return True


def migrate_project(project):
    """Convert legacy fade fields into animation carriers. Return True if anything
    changed; idempotent."""
    if is_migrated(project):
        return False

    G = project.setdefault("globals", {})
    g_fin = G.get("fade_in_ms", BUILTIN["fade_in_ms"])
    g_fout = G.get("fade_out_ms", BUILTIN["fade_out_ms"])
    gtiming = {"fade_in_ms": g_fin, "fade_out_ms": g_fout}

    project.setdefault("anim_tags", [])

    # ── global-scope appearance (the project default fade-in) ──────────────────
    ganims = G.setdefault("animations", [])
    if g_fin and not any(a.get("name") == "appearance" for a in ganims):
        ganims.append(_appearance_anim("a_glob_appear", "percue", "cue_start", g_fin))

    # Per-word resolved fades depend on each group's fade override, so capture
    # them BEFORE the group.fade keys are stripped below.
    word_fade = {}
    for g in project["layout"]:
        gf = resolve_fade(g, gtiming)
        for line in g["lines"]:
            for tok in line["toks"]:
                for i in tok["ids"]:
                    word_fade[i] = gf

    # ── per-group appearance (accumulate -> mode; group.fade -> duration) ───────
    # Each group's appearance overrides the global default fade, so the group
    # suppresses the inherited global appearance (the designed mute mechanism).
    has_global_appear = any(a.get("name") == "appearance" for a in ganims)
    for gi, g in enumerate(project["layout"]):
        acc = g.get("accumulate", "words")
        mode, anchor = _ACC_MODE.get(acc, _ACC_MODE["words"])
        gf = resolve_fade(g, gtiming)
        fin_ms = gf["fade_in_ms"]
        anims = g.setdefault("animations", [])
        if fin_ms and not any(a.get("name") == "appearance" for a in anims):
            anims.append(_appearance_anim(f"a_g{gi}_appear", mode, anchor, fin_ms))
        if has_global_appear:
            supp = g.setdefault("suppress", [])
            if "a_glob_appear" not in supp:
                supp.append("a_glob_appear")
        g.pop("fade", None)
        g.pop("accumulate", None)

    # ── fin_tags / fout_tags -> anim_tags (alpha fade-in / fade-out) ───────────
    words = project["words"]
    for ti, tag in enumerate(project.get("fin_tags", [])):
        ids = sorted(tag["ids"])
        fin_ms = word_fade.get(ids[0], gtiming)["fade_in_ms"]
        if tag.get("trigger") is not None:
            # absolute trigger -> cue_end-anchored offset (now follows retiming).
            anchor, off = _trigger_offset(words, ids, tag["trigger"])
            seg = {"t0": _t(anchor, off), "t1": _t(anchor, off + fin_ms),
                   "from": _INVISIBLE, "to": _VISIBLE, "accel": 1}
        else:
            seg = _alpha_seg("cue_start", fin_ms, _INVISIBLE, _VISIBLE)
        _append_tag(project, ids, {"id": f"a_fin{ti}", "name": "fade_in",
                                   "group_id": None, "channel": "alpha",
                                   "segments": [seg], "enabled": True})

    for ti, tag in enumerate(project.get("fout_tags", [])):
        ids = sorted(tag["ids"])
        fout_ms = word_fade.get(ids[-1], gtiming)["fade_out_ms"]
        if tag.get("trigger") is not None:
            anchor, off = _trigger_offset(words, ids, tag["trigger"])
            seg = {"t0": _t(anchor, off), "t1": _t(anchor, off + fout_ms),
                   "from": _VISIBLE, "to": _INVISIBLE, "accel": 1}
        else:
            seg = _alpha_seg("cue_end", fout_ms, _VISIBLE, _INVISIBLE)
        _append_tag(project, ids, {"id": f"a_fout{ti}", "name": "fade_out",
                                   "group_id": None, "channel": "alpha",
                                   "segments": [seg], "enabled": True})

    # ── strip the legacy keys ──────────────────────────────────────────────────
    project.pop("fin_tags", None)
    project.pop("fout_tags", None)
    G.pop("fade_in_ms", None)
    G.pop("fade_out_ms", None)
    return True


def _trigger_offset(words, ids, trigger):
    """An absolute-seconds trigger becomes a cue_end-anchored ms offset (so it now
    FOLLOWS the words when retimed): t0 = cue_end + (trigger - cue_end). The
    reference cue_end is the latest end over the tag's ids."""
    ref = max(words[i]["end"] for i in ids if i < len(words))
    return "cue_end", round((trigger - ref) * 1000)


def _append_tag(project, ids, anim):
    """Append `anim` to the anim_tag covering exactly `ids` (creating it)."""
    idset = set(ids)
    for t in project["anim_tags"]:
        if set(t["ids"]) == idset:
            t.setdefault("anims", []).append(anim)
            return
    project["anim_tags"].append({"ids": list(ids), "anims": [anim], "suppress": []})
