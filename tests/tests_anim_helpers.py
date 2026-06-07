# tests/tests_anim_helpers.py — tiny assertion helpers shared by the AE test files.
# Operate on the flat resolved animation list (anim.resolve_animations output).

def ids_of(resolved_list):
    return [a["id"] for a in resolved_list]


def src_of(resolved_list):
    return [a.get("src") for a in resolved_list]


def by_id(resolved_list, anim_id):
    for a in resolved_list:
        if a["id"] == anim_id:
            return a
    raise KeyError(anim_id)


def seg_window(resolved_anim, idx=0):
    """(start_s, end_s) of segment `idx` of a resolved animation."""
    s = resolved_anim["segments"][idx]
    return s["start_s"], s["end_s"]
