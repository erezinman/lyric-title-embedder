# engine/ass.py — render-groups -> ASS text with global<group<cue style. UI-free.
import core
from engine import anim
from engine.model import resolve_style
ESC = core.esc

_STYLE_FOR_BORDER = {1: "Default", 3: "Box"}   # box-mode -> style name (C1)

# \an alignment columns mirror horizontally for RTL: 1<->3, 4<->6, 7<->9; the
# centered column (2/5/8) is unchanged.
_MIRROR_ALIGN = {1: 3, 3: 1, 4: 6, 6: 4, 7: 9, 9: 7}


def resolve_direction(cfg, text):
    """Resolve the base writing direction for an event -> "ltr" | "rtl".

    explicit "ltr"/"rtl" wins; "auto" (or missing) detects from the first
    strong-directional character of the event's concatenated visible text:
    Hebrew (U+0590–05FF) or Arabic (U+0600–06FF) => rtl, else ltr (empty => ltr)."""
    d = (cfg or {}).get("text_direction", "auto")
    if d in ("ltr", "rtl"):
        return d
    for ch in text or "":
        o = ord(ch)
        if 0x0590 <= o <= 0x05FF or 0x0600 <= o <= 0x06FF:
            return "rtl"
        if ("a" <= ch <= "z") or ("A" <= ch <= "Z"):
            return "ltr"
    return "ltr"


def _mirror_align(a, direction):
    return _MIRROR_ALIGN.get(int(a), int(a)) if direction == "rtl" else int(a)


def _insert_bidi_marks(text):
    """Wrap each maximal run of ASCII letters/digits with LRM (U+200E) on both
    sides so embedded numbers/Latin keep LTR order inside an RTL paragraph.
    v1 approximation: applied per-word, before ASS escaping."""
    LRM = "‎"
    out = []
    run = []
    def flush():
        if run:
            out.append(LRM + "".join(run) + LRM)
            run.clear()
    for ch in text:
        if ("a" <= ch <= "z") or ("A" <= ch <= "Z") or ("0" <= ch <= "9"):
            run.append(ch)
        else:
            flush(); out.append(ch)
    flush()
    return "".join(out)

def _gctx(cfg):
    return {"font": cfg["font"], "fontsize": cfg["fontsize"], "bold": cfg["bold"],
            "italic": cfg.get("italic", False), "underline": cfg.get("underline", False),
            "primary": cfg["primary_color"], "outline": cfg["outline_color"],
            "back": cfg["back_color"], "back_alpha": cfg["back_alpha"],
            "outline_w": cfg["outline_w"], "shadow": cfg["shadow"],
            "border_style": cfg["border_style"], "align": cfg["align"]}

def _resolve(word_style, group_style, gctx):
    return resolve_style({"style": word_style}, {"style": group_style}, gctx)

def _inline_color(hex_color):
    """Return &HBBGGRR& format for inline ASS color override tags."""
    h = hex_color.lstrip("#")
    return f"&H{h[4:6]}{h[2:4]}{h[0:2]}&".upper()

def _style_tags(prev, cur):
    """Emit inline tags for properties that changed prev->cur (running delta)."""
    t = []
    if cur["font"] != prev["font"]:           t.append(f"\\fn{cur['font']}")
    if cur["fontsize"] != prev["fontsize"]:   t.append(f"\\fs{int(cur['fontsize'])}")
    if cur["bold"] != prev["bold"]:           t.append(f"\\b{1 if cur['bold'] else 0}")
    if cur["italic"] != prev["italic"]:       t.append(f"\\i{1 if cur['italic'] else 0}")
    if cur["underline"] != prev["underline"]: t.append(f"\\u{1 if cur['underline'] else 0}")
    if cur["primary"] != prev["primary"]:     t.append(f"\\1c{_inline_color(cur['primary'])}")
    if cur["outline"] != prev["outline"]:     t.append(f"\\3c{_inline_color(cur['outline'])}")
    if cur["back"] != prev["back"]:           t.append(f"\\4c{_inline_color(cur['back'])}")
    if cur["back_alpha"] != prev["back_alpha"]: t.append(f"\\4a&H{str(cur['back_alpha']).upper()[:2]}&")
    if cur["outline_w"] != prev["outline_w"]: t.append(f"\\bord{cur['outline_w']}")
    if cur["shadow"] != prev["shadow"]:       t.append(f"\\shad{cur['shadow']}")
    return "".join(t)

def _group_text(g):
    """Concatenated visible text of an event (for base-direction detection)."""
    return " ".join(w["text"] for line in g["lines"] for w in line["words"])


def _all_text(groups):
    return " ".join(_group_text(g) for g in groups)


def _group_border(group_style, gctx):
    bs = (group_style or {}).get("border_style")
    return bs if bs is not None else gctx["border_style"]

def build_ass(cfg, groups):
    pos = cfg.get("pos")
    pos_tag = f"{{\\pos({int(pos[0])},{int(pos[1])})}}" if pos else ""
    gctx = _gctx(cfg)
    play_w = int(cfg.get("play_w", 1920))
    bidi_marks = bool(cfg.get("bidi_marks", True))

    # Document base direction (for the single Style-line Alignment column): explicit
    # ltr/rtl wins; "auto" detects from every event's concatenated visible text.
    doc_dir = resolve_direction(cfg, _all_text(groups))

    def ev_text(g):
        ev = g["start"]
        edir = resolve_direction(cfg, _group_text(g))   # per-event base direction
        # group-level alignment override: \an applies to the whole event, so it is
        # emitted once here (group -> global only; never per cue). Mirror for RTL.
        ga = (g.get("group_style") or {}).get("align")
        an_tag = ""
        if ga is not None:
            mga = _mirror_align(ga, edir)
            # compare against the (also direction-resolved) Style alignment
            if mga != _mirror_align(gctx["align"], doc_dir):
                an_tag = f"{{\\an{int(mga)}}}"
        parts = [an_tag, pos_tag]
        baseline = dict(gctx)            # Style provides global; reset per event
        cur = dict(baseline)
        for li, line in enumerate(g["lines"]):
            if li:
                parts.append("\\N")
            for w in line["words"]:
                res = _resolve(w.get("style"), g.get("group_style"), gctx)
                tags = [_style_tags(cur, res)]; cur = res
                tags.append(anim.emit_anim_tags(w.get("anims") or [], ev,
                                                play_w=play_w, direction=edir))
                txt = w["text"]
                if edir == "rtl" and bidi_marks:
                    txt = _insert_bidi_marks(txt)
                parts.append("{" + "".join(tags) + "}" + ESC(txt))
        return "".join(parts)

    # distinct box-modes actually used (group-resolved)
    borders = sorted({_group_border(g.get("group_style"), gctx) for g in groups} | {gctx["border_style"]})
    primary = core.rgb_to_ass(cfg["primary_color"]); outline = core.rgb_to_ass(cfg["outline_color"])
    back = core.rgb_to_ass(cfg["back_color"], cfg["back_alpha"]); bold = -1 if cfg["bold"] else 0
    italic = -1 if cfg.get("italic") else 0; underline = -1 if cfg.get("underline") else 0
    style_align = _mirror_align(cfg["align"], doc_dir)
    style_lines = []
    for bs in borders:
        name = _STYLE_FOR_BORDER.get(bs, f"B{bs}")
        style_lines.append(
            f"Style: {name},{cfg['font']},{cfg['fontsize']},{primary},&H000000FF,{outline},{back},"
            f"{bold},{italic},{underline},0,100,100,0,0,{bs},{cfg['outline_w']},{cfg['shadow']},"
            f"{style_align},{cfg['margin_l']},{cfg['margin_r']},{cfg['margin_v']},1")
    header = (
        "[Script Info]\n; Karaoke Subtitle Studio\nScriptType: v4.00+\n"
        f"PlayResX: {cfg['play_w']}\nPlayResY: {cfg['play_h']}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
        "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, "
        "Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        + "\n".join(style_lines) + "\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
    out = [header]
    for g in groups:
        bs = _group_border(g.get("group_style"), gctx)
        sname = _STYLE_FOR_BORDER.get(bs, f"B{bs}")
        out.append(f"Dialogue: 0,{core.ass_time(g['start'])},{core.ass_time(g['end'])},{sname},,0,0,0,,{ev_text(g)}\n")
    return "".join(out), len(groups)
