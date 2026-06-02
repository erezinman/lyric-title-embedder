#!/usr/bin/env python3
"""Generate an ASS subtitle file with per-word fade-in from Suno's
aligned_lyrics.json. Each section becomes one Dialogue event in which words
accumulate and persist (matching v5), but every new word fades in smoothly.

Burn into video:
    ffmpeg -i input.mp4 -vf "ass=bleating.ass" -c:a copy output.mp4
Shotcut: add filter "Subtitle (libass)"/"avfilter.subtitles" pointing at the .ass,
or use the ffmpeg command above to pre-render.
"""
import json, os, re

# ─── STYLE CONFIG — change these freely ──────────────────────────────
PLAY_W, PLAY_H = 1920, 1080      # reference resolution (match your video)
FONT       = "Arial"
FONTSIZE   = 64
PRIMARY    = "&H00FFFFFF"         # &HAABBGGRR  (AA=00 opaque). White.
OUTLINE_C  = "&H00000000"         # black outline
BACK_C     = "&H80000000"         # 50%-alpha black box/shadow
BOLD       = -1                   # -1 = on, 0 = off
OUTLINE    = 3                    # outline thickness (px)
SHADOW     = 0
BORDER_STYLE = 1                  # 1 = outline+shadow, 3 = opaque box
ALIGN      = 2                    # numpad: 2=bottom-center, 5=middle, 8=top-center
MARGIN_L   = 80                   # left edge of the text box
MARGIN_R   = 80                   # right edge
MARGIN_V   = 60                   # vertical margin from the aligned edge
WRAP_STYLE = 0                    # 0 = smart wrap (uses margins as the box width)
FADE_MS    = 250                  # per-word fade-in duration
GROUP_BY   = "section"            # "section" or "line"
SKIP_DASHES = True                # drop pure "---" marker lines
# ─────────────────────────────────────────────────────────────────────

base = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(base, "aligned_lyrics.json")))

def merge_subwords(toks):
    out = []
    for tok in toks:
        txt = tok["text"]
        if not txt: continue
        if not out or txt[:1].isspace():
            out.append({"text": txt, "start_s": tok["start_s"], "end_s": tok["end_s"]})
        else:
            out[-1]["text"] += txt; out[-1]["end_s"] = tok["end_s"]
    return out

# Reconstruct real lines (merge lowercase continuations), keep sub-word tokens.
def is_cont(nxt):
    t = nxt.get("text","").strip()
    return bool(t) and t[:1].islower()
def glue(nxt):
    toks = nxt.get("words") or []
    first = toks[0]["text"] if toks else nxt.get("text","")
    return " " if first[:1].isspace() else ""

raw = [l for l in data["aligned_lyrics"] if l.get("text","").strip()]
real = []
for l in raw:
    if real and is_cont(l):
        real[-1]["text"] += glue(l) + l["text"]
        real[-1]["end_s"] = l["end_s"]
        real[-1]["_entries"].append(l)
    else:
        real.append({"text": l["text"], "start_s": l["start_s"], "end_s": l["end_s"],
                     "section": l.get("section") or "Unknown", "_entries": [l]})

def is_dashes(t): return bool(re.fullmatch(r"-+", t.strip()))

# Group into events.
groups = []  # each: {"start","end","lines":[line,...]}
for l in real:
    if SKIP_DASHES and is_dashes(l["text"]): continue
    key = l["section"] if GROUP_BY == "section" else id(l)
    if groups and GROUP_BY == "section" and groups[-1]["key"] == key:
        groups[-1]["lines"].append(l); groups[-1]["end"] = l["end_s"]
    else:
        groups.append({"key": key, "start": l["start_s"], "end": l["end_s"], "lines": [l]})

def ass_time(t):
    if t < 0: t = 0
    h = int(t // 3600); m = int((t % 3600) // 60); s = t % 60
    cs = int(round((s - int(s)) * 100)); s = int(s)
    if cs == 100: s += 1; cs = 0
    return f"{h:d}:{m:02d}:{s:02d}.{cs:02d}"

def esc(s):
    return s.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")

def build_event_text(group):
    ev_start = group["start"]
    parts = []
    for li, line in enumerate(group["lines"]):
        if li: parts.append("\\N")  # hard line break between lyric lines
        flat = []
        for e in line["_entries"]:
            flat.extend(e.get("words") or [])
        for w in merge_subwords(flat):
            rel = int(round((w["start_s"] - ev_start) * 1000))
            rel = max(0, rel)
            if FADE_MS > 0:
                tag = f"{{\\alpha&HFF&\\t({rel},{rel+FADE_MS},\\alpha&H00&)}}"
            else:
                tag = "{\\alpha&H00&}"
            parts.append(tag + esc(w["text"]))
    # collapse the leading newline of merged words; keep internal spacing
    return "".join(parts)

header = f"""[Script Info]
; Generated from aligned_lyrics.json — per-word fade-in
ScriptType: v4.00+
PlayResX: {PLAY_W}
PlayResY: {PLAY_H}
WrapStyle: {WRAP_STYLE}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{FONT},{FONTSIZE},{PRIMARY},&H000000FF,{OUTLINE_C},{BACK_C},{BOLD},0,0,0,100,100,0,0,{BORDER_STYLE},{OUTLINE},{SHADOW},{ALIGN},{MARGIN_L},{MARGIN_R},{MARGIN_V},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

lines_out = [header]
for g in groups:
    text = build_event_text(g)
    lines_out.append(
        f"Dialogue: 0,{ass_time(g['start'])},{ass_time(g['end'])},Default,,0,0,0,,{text}\n"
    )

out_path = os.path.join(base, "bleating.ass")
with open(out_path, "w", encoding="utf-8") as f:
    f.write("".join(lines_out))

print(f"wrote {out_path}")
print(f"events: {len(groups)}  (grouped by {GROUP_BY})")
