# engine/anim.py — animation model constants, validation, resolution. UI-free.
#
# RED-PHASE STUB: the spec'd surface only. Every function raises NotImplementedError
# so the AE tests fail for the right reason (not a collection/import error). Imports
# `core` only (no UI).
import core  # noqa: F401  (kept for parity with the real module's import surface)

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


def validate_animation(project, scope, ref, anim):
    """Raise ValueError on an invalid animation for the given scope/ref."""
    raise NotImplementedError("anim.validate_animation")


def new_id(existing_ids):
    """Return the first free "aN" id not in existing_ids."""
    raise NotImplementedError("anim.new_id")


def resolve_animations(project, gi, li, ti):
    """Return the cue's renderable (flat, resolved) animation list."""
    raise NotImplementedError("anim.resolve_animations")


def anchor_seconds(project, gi, li, ti, anim_time, scope_span):
    """Resolve an AnimTime to absolute seconds for the given cue."""
    raise NotImplementedError("anim.anchor_seconds")


def emit_anim_tags(word_anims, ev_start):
    """Compile a cue's resolved animation list to its .ass override-tag string
    (\\t chains / \\clip / \\kf), narrowest scope last; ev_start is the event
    start in seconds. Used by ass.ev_text. (Spike #1/#2/#5 emission rules.)"""
    raise NotImplementedError("anim.emit_anim_tags")
