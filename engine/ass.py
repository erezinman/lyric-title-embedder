# engine/ass.py — render-groups -> ASS text with global<group<cue style. UI-free.
import core
ESC = core.esc

_STYLE_FOR_BORDER = {1: "Default", 3: "Box"}   # box-mode -> style name (C1)

def _gctx(cfg):
    return {"font": cfg["font"], "fontsize": cfg["fontsize"], "bold": cfg["bold"],
            "primary": cfg["primary_color"], "outline": cfg["outline_color"],
            "back": cfg["back_color"], "back_alpha": cfg["back_alpha"],
            "outline_w": cfg["outline_w"], "shadow": cfg["shadow"],
            "border_style": cfg["border_style"]}

def _resolve(word_style, group_style, gctx):
    out = {}
    for k in gctx:
        if k != "border_style" and (word_style or {}).get(k) is not None:
            out[k] = word_style[k]
        elif (group_style or {}).get(k) is not None:
            out[k] = group_style[k]
        else:
            out[k] = gctx[k]
    return out

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
    if cur["primary"] != prev["primary"]:     t.append(f"\\1c{_inline_color(cur['primary'])}")
    if cur["outline"] != prev["outline"]:     t.append(f"\\3c{_inline_color(cur['outline'])}")
    if cur["back"] != prev["back"]:           t.append(f"\\4c{_inline_color(cur['back'])}")
    if cur["back_alpha"] != prev["back_alpha"]: t.append(f"\\4a&H{str(cur['back_alpha']).upper()[:2]}&")
    if cur["outline_w"] != prev["outline_w"]: t.append(f"\\bord{cur['outline_w']}")
    if cur["shadow"] != prev["shadow"]:       t.append(f"\\shad{cur['shadow']}")
    return "".join(t)

def _group_border(group_style, gctx):
    bs = (group_style or {}).get("border_style")
    return bs if bs is not None else gctx["border_style"]

def build_ass(cfg, groups):
    pos = cfg.get("pos")
    pos_tag = f"{{\\pos({int(pos[0])},{int(pos[1])})}}" if pos else ""
    gctx = _gctx(cfg)

    def ev_text(g):
        ev = g["start"]; parts = [pos_tag]
        baseline = dict(gctx)            # Style provides global; reset per event
        cur = dict(baseline)
        for li, line in enumerate(g["lines"]):
            if li:
                parts.append("\\N")
            for w in line["words"]:
                res = _resolve(w.get("style"), g.get("group_style"), gctx)
                fin = max(0, int(round((w["start_s"] - ev) * 1000)))
                fdur = int(w.get("fin_ms", 250) or 0)
                tags = [_style_tags(cur, res)]; cur = res
                tags.append("\\alpha&HFF&" if fdur > 0 else "\\alpha&H00&")
                if fdur > 0:
                    tags.append(f"\\t({fin},{fin + fdur},\\alpha&H00&)")
                fo = w.get("fout_at")
                if fo is not None:
                    ro = max(0, int(round((fo - ev) * 1000)))
                    od = int(w.get("fout_ms", 1000) or 0)
                    tags.append(f"\\t({ro},{ro + (od if od > 0 else 1)},\\alpha&HFF&)")
                parts.append("{" + "".join(tags) + "}" + ESC(w["text"]))
        return "".join(parts)

    # distinct box-modes actually used (group-resolved)
    borders = sorted({_group_border(g.get("group_style"), gctx) for g in groups} | {gctx["border_style"]})
    primary = core.rgb_to_ass(cfg["primary_color"]); outline = core.rgb_to_ass(cfg["outline_color"])
    back = core.rgb_to_ass(cfg["back_color"], cfg["back_alpha"]); bold = -1 if cfg["bold"] else 0
    style_lines = []
    for bs in borders:
        name = _STYLE_FOR_BORDER.get(bs, f"B{bs}")
        style_lines.append(
            f"Style: {name},{cfg['font']},{cfg['fontsize']},{primary},&H000000FF,{outline},{back},"
            f"{bold},0,0,0,100,100,0,0,{bs},{cfg['outline_w']},{cfg['shadow']},"
            f"{cfg['align']},{cfg['margin_l']},{cfg['margin_r']},{cfg['margin_v']},1")
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
