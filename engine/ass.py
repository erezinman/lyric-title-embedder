# engine/ass.py — render-groups -> ASS text. UI-free.
import core
ESC = core.esc

def build_ass(cfg, groups):
    pos = cfg.get("pos")
    pos_tag = f"{{\\pos({int(pos[0])},{int(pos[1])})}}" if pos else ""

    def ev_text(g):
        ev = g["start"]; parts = [pos_tag]
        for li, line in enumerate(g["lines"]):
            if li:
                parts.append("\\N")
            for w in line["words"]:
                fin = max(0, int(round((w["start_s"] - ev) * 1000)))
                fdur = int(w.get("fin_ms", 250) or 0)
                tags = ["\\alpha&HFF&"] if fdur > 0 else ["\\alpha&H00&"]
                if fdur > 0:
                    tags.append(f"\\t({fin},{fin + fdur},\\alpha&H00&)")
                fo = w.get("fout_at")
                if fo is not None:
                    ro = max(0, int(round((fo - ev) * 1000)))
                    od = int(w.get("fout_ms", 1000) or 0)
                    tags.append(f"\\t({ro},{ro + (od if od > 0 else 1)},\\alpha&HFF&)")
                parts.append("{" + "".join(tags) + "}" + ESC(w["text"]))
        return "".join(parts)

    primary = core.rgb_to_ass(cfg["primary_color"]); outline = core.rgb_to_ass(cfg["outline_color"])
    back = core.rgb_to_ass(cfg["back_color"], cfg["back_alpha"]); bold = -1 if cfg["bold"] else 0
    header = (
        "[Script Info]\n; Karaoke Subtitle Studio\nScriptType: v4.00+\n"
        f"PlayResX: {cfg['play_w']}\nPlayResY: {cfg['play_h']}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
        "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, "
        "Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Default,{cfg['font']},{cfg['fontsize']},{primary},&H000000FF,{outline},{back},"
        f"{bold},0,0,0,100,100,0,0,{cfg['border_style']},{cfg['outline_w']},{cfg['shadow']},"
        f"{cfg['align']},{cfg['margin_l']},{cfg['margin_r']},{cfg['margin_v']},1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
    out = [header]
    for g in groups:
        out.append(f"Dialogue: 0,{core.ass_time(g['start'])},{core.ass_time(g['end'])},Default,,0,0,0,,{ev_text(g)}\n")
    return "".join(out), len(groups)
