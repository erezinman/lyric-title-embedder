#!/usr/bin/env python3
"""Reusable libass spike harness: write .ass, render a frame at time T, analyze ink."""
import subprocess, os, sys
from PIL import Image

DIR = os.path.dirname(os.path.abspath(__file__))
FONTSDIR = "/usr/share/fonts/truetype/dejavu"

ASS_HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: K,DejaVu Sans,64,&H00FFFFFF,&H00FF0000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

def write_ass(name, dialogues):
    """dialogues: list of (start, end, text)."""
    path = os.path.join(DIR, name)
    with open(path, "w") as f:
        f.write(ASS_HEADER)
        for start, end, text in dialogues:
            f.write(f"Dialogue: 0,{start},{end},K,,0,0,0,,{text}\n")
    return path

def render(ass_path, t, out_png):
    out = os.path.join(DIR, out_png)
    cmd = ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=black:s=1280x720:d=12",
           "-ss", str(t),
           "-vf", f"subtitles={ass_path}:fontsdir={FONTSDIR}",
           "-frames:v", "1", out]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-2000:])
        raise RuntimeError("ffmpeg failed")
    return out

def load(png):
    return Image.open(png).convert("RGB")

def ink_bbox(img, thresh=40):
    """Bounding box of pixels brighter than thresh in any channel."""
    px = img.load()
    w, h = img.size
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if r > thresh or g > thresh or b > thresh:
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
    if maxx < 0:
        return None
    return (minx, miny, maxx, maxy)

def ink_width(img, thresh=40):
    bb = ink_bbox(img, thresh)
    return 0 if bb is None else (bb[2] - bb[0] + 1)

def ink_count(img, thresh=40):
    px = img.load(); w, h = img.size; n = 0
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if r > thresh or g > thresh or b > thresh:
                n += 1
    return n

if __name__ == "__main__":
    # Verify harness: text visible 0-10s, render at t=1 (present) and t=11 (absent)
    p = write_ass("verify.ass", [("0:00:00.00", "0:00:10.00", "{\\bord0\\shad0}VERIFY")])
    a = render(p, 1, "verify_t1.png")
    b = render(p, 11, "verify_t11.png")
    print("t=1  ink pixels:", ink_count(load(a)), "bbox:", ink_bbox(load(a)))
    print("t=11 ink pixels:", ink_count(load(b)), "bbox:", ink_bbox(load(b)))
