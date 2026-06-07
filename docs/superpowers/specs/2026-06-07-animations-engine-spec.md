# Animations — Engine API Spec

The authoritative API surface the AE/AD tests are written against. Semantics come from
`design-system/HANDOFF_animations-questions.md` (Part 1 + Part 3 + §12 rulings recorded in the
test design), `HANDOFF_animations-reconciliation.md`, and the spike verdicts (`spikes/*/FINDINGS.md`).
This file fixes module layout, names and shapes only — no new semantics.

## Module layout

```
engine/anim.py          # model constants, validation, resolution (UI-free, imports core only)
engine/anim_migrate.py  # legacy-project conversion (fin/fout tags, group.fade, globals fades, accumulate)
engine/mutations.py     # + anim_add / anim_remove / anim_restore / anim_set_props
engine/render.py        # emits resolved animation list per render-word (replaces fade fields)
engine/ass.py           # emits \t chains / \kf from resolved animations (replaces hardcoded fade tags)
mcp_server/tools.py     # + add_animation / remove_animation / restore_animation / set_animation_props
                        # − make_fade_tag / clear_fade_tag / set_fade_tag_props / set_group_fade /
                        #   set_fade_defaults  (REMOVED — no backward compat)
```

## Stored shapes (project dict)

```python
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

anim_time = {"anchor": str, "offset": float, "unit": "ms" | "frac"}
segment   = {"t0": anim_time, "t1": anim_time,
             "from": value | None,     # None: first seg = static waterfall value; seg k>0 = prev "to"
             "to": value,
             "accel": float | "inout"} # "inout" auto-expands to 2 segments at compile
animation = {"id": str, "name": str, "group_id": str | None,
             "channel": str, "mode": str | None,       # stored literal (ruling 1)
             "step": float | None, "step_unit": "ms" | "frac" | None,
             "segments": [segment], "stagger": dict | None, "enabled": bool}
# carriers:
#   project["globals"]["animations"]   : [animation]
#   project["layout"][gi]["animations"]: [animation]
#   project["layout"][gi]["suppress"]  : [anim_id]
#   project["anim_tags"]               : [{"ids":[wid], "anims":[animation], "suppress":[anim_id]}]
# REMOVED from the model: fin_tags, fout_tags, layout[gi]["fade"], layout[gi]["accumulate"],
#   globals fade_in_ms / fade_out_ms (linger STAYS — it is windowing, not animation).
```

## engine/anim.py

```python
def validate_animation(project, scope, ref, anim) -> None
    # raises ValueError on: unknown channel/anchor/mode/unit; "move" with scope=="tag";
    # out-of-order or overlapping segments WITHIN the animation (ruling 3: reject, never sort);
    # unit "frac" forbidden where spec says; step present on a non-sequence mode.
    # scope: "global" | "group" | "tag"; ref: None | gi | [wid,...]

def new_id(existing_ids) -> str            # "a1","a2",… first free

def resolve_animations(project, gi, li, ti) -> list[dict]
    # The cue's renderable animation list. Steps:
    #  1. collect: globals.animations -> layout[gi].animations -> every anim_tag containing
    #     the cue's tok.ids[0] (order: global, group, tags in stored order)
    #  2. drop disabled and suppressed (group.suppress hides global ids for the whole group;
    #     tag.suppress hides global+group ids for the tag's ids)
    #  3. expand mode -> per-member (anchor, stagger-offset); "custom"/None = raw anchors
    #     (member ordering: layout reading order; centerout = index distance from list midpoint;
    #      jitter seeded by word id; typewriter step default = member animation duration;
    #      stagger inert when scope has 1 member — ruling 4)
    #  4. resolve every AnimTime to absolute seconds (anchor table below)
    #  5. conflict rule: same channel + time-overlap ACROSS scopes -> narrowest wins, the wider
    #     animation dropped whole for this cue; same scope overlap -> keep both, append
    #     {"warning": "overlap"} to both
    # returns [{"id","name","group_id","channel","segments":[{"start_s","end_s","from","to",
    #           "accel"}], "src": "global"|"group"|"tag", "warning": str|None}]

def anchor_seconds(project, gi, li, ti, anim_time, scope_span) -> float
    # cue_*  : merged-token span (min start / max end of tok.ids)
    # line_* : sung span of layout[gi].lines[li]
    # span_* : scope_span (tag: min..max over its ids; group/global: the event window)
    # event_*: render event window (win_start / win_end+linger model — same numbers render.py uses)
    # offset: ms -> /1000; frac -> fraction of the anchor pair's own span
```

Appearance rule (no special machinery): a cue with **no alpha-channel animation** covering it is
visible for its whole event. Migration manufactures the appearance animation; nothing else does.

## engine/anim_migrate.py

```python
def migrate_project(project) -> bool       # True if anything changed; idempotent
    # fin_tags  -> anim_tags entries: name "fade_in", channel alpha, FF->00,
    #              t0 = cue_start+0 (trigger!=None -> offset so start == trigger relative to
    #              cue_end: t0 = cue_end + (trigger - cue_end_seconds) ms), dur = resolved fade_in_ms
    # fout_tags -> name "fade_out", 00->FF, anchored cue_end (trigger -> cue_end offset)
    # group.fade / globals.fade_*_ms -> durations baked into the records above
    # accumulate -> the group's appearance animation's mode:
    #              words->"percue", lines->"perline", off->"together"
    # every group with words gets an appearance anim (global default fade) unless fades were 0
    # removes the legacy keys; called on project load (engine/model.py load path)
```

Gold test: a representative legacy project's compiled `.ass` is **byte-identical** before/after
migration (AE-MIG-08).

## engine/mutations.py additions (Session-recorded, same style as existing fns)

```python
def anim_add(project, scope, ref, anim)              # validate; multi-channel presets arrive as
                                                     # sibling records sharing group_id (ruling 2)
def anim_remove(project, scope, ref, anim_id)        # own anim -> delete (and its group_id siblings);
                                                     # inherited id at narrower scope -> append to
                                                     # suppress (tombstone); idempotent no-op (ruling 5)
def anim_restore(project, scope, ref, anim_id)       # remove from suppress; idempotent no-op
def anim_set_props(project, scope, ref, anim_id, partial)   # validates merged result; {mode,step,
                                                     # step_unit,segments,enabled,name} all settable
```

## render.py / ass.py integration

- `project_to_render` emits, per render-word, `"anims": resolve_animations(...)` and DROPS
  `fin_ms/fout_at/fout_ms` (appearance is just an alpha animation now).
- `ass.py ev_text` replaces the hardcoded fade block with `emit_anim_tags(word_anims, ev_start)`:
  - per channel, chained `\t(t0,t1,accel,<tag><value>)` in segment order; across animations the
    **narrowest scope is emitted LAST** (spike 1: last-listed wins continuously)
  - `accel=="inout"` expands to two segments (compile-time only)
  - `clip_rect` values are `[x1,y1,x2,y2]` ints; `karaoke_fill` emits `\k` gap padding +
    `\kf` per word (spike 5 rules; cs from event start, gaps summed)
  - `move` only ever arrives from group/global scope (validation guarantees) and emits
    `\move` at event level
  - initial value: channel's static waterfall value (segments `from:None` first segment)

## mcp_server/tools.py

```python
def add_animation(ctx, scope, ref=None, anim=None) -> updated entity view
def remove_animation(ctx, scope, ref=None, anim_id=None)
def restore_animation(ctx, scope, ref=None, anim_id=None)
def set_animation_props(ctx, scope, ref=None, anim_id=None, partial=None)
# all via _do/session.record -> broadcast -> autosave (existing rails)
# get_project: + globals.animations, layout[].animations/suppress, anim_tags,
#              and per-word "anims_resolved" (flat resolved list) for the UI/strips
# get_render: render-groups carry the resolved lists (consumed by ass + preview)
# DELETED: make_fade_tag, clear_fade_tag, set_fade_tag_props, set_group_fade, set_fade_defaults
#          (set_layout_props loses the accumulate arg; keeps win/linger)
```

## Execution order (house TDD)

1. AE tests written against this spec, failing (module stubs raise NotImplementedError).
2. Engine implemented to green; full Python suite green (existing fade tests are REWRITTEN as
   part of migration coverage, not preserved verbatim — no backward compat).
3. AD daemon tests + implementation; then UI clusters per the test design.
