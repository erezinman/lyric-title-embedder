"""core — shared, UI-free logic for Karaoke Subtitle Studio.

Pure helpers, constants, and tooling discovery used by every front-end
(the current app and the archived v1 in old/). No tkinter / customtkinter here.
"""
import os, re, shutil, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))          # project root
FFMPEG = shutil.which("ffmpeg") or "/usr/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or "/usr/bin/ffprobe"
HAS_FFMPEG = os.path.isfile(FFMPEG)
FC_LIST = shutil.which("fc-list")
FC_MATCH = shutil.which("fc-match")

# libass renders ~0.78 × Fontsize of visible ink height, independent of font
# (it normalizes by font height). FreeType's ink-per-pixel varies per font, so
# the Tk pixel size that matches libass is 0.78×Fontsize / (FreeType ink ratio).
LIBASS_INK_AT_100 = 78.0

# Alignment anchors (ASS numpad) and their tk anchor equivalents.
ALIGN_LABELS = {
    "Bottom-Left (1)": 1, "Bottom-Center (2)": 2, "Bottom-Right (3)": 3,
    "Middle-Left (4)": 4, "Middle-Center (5)": 5, "Middle-Right (6)": 6,
    "Top-Left (7)": 7, "Top-Center (8)": 8, "Top-Right (9)": 9,
}
ANCHOR = {1: "sw", 2: "s", 3: "se", 4: "w", 5: "center", 6: "e", 7: "nw", 8: "n", 9: "ne"}
PREVIEW_W = 720
HANDLE = 7


# ── lyric/token helpers ──
def merge_subwords(toks):
    """Merge Suno sub-word tokens into whole words (a new word starts on a
    leading-whitespace token)."""
    out = []
    for tok in toks:
        txt = tok.get("text", "")
        if not txt:
            continue
        if not out or txt[:1].isspace():
            out.append({"text": txt, "start_s": tok["start_s"], "end_s": tok["end_s"]})
        else:
            out[-1]["text"] += txt
            out[-1]["end_s"] = tok["end_s"]
    return out

def reconstruct_lines(aligned):
    """Merge aligned_lyrics entries that are lowercase continuations into whole
    lyric lines (Suno splits mid-word/mid-phrase)."""
    def is_cont(nxt):
        t = nxt.get("text", "").strip()
        return bool(t) and t[:1].islower()
    def glue(nxt):
        toks = nxt.get("words") or []
        first = toks[0]["text"] if toks else nxt.get("text", "")
        return " " if first[:1].isspace() else ""
    raw = [l for l in aligned if l.get("text", "").strip()]
    real = []
    for l in raw:
        if real and is_cont(l):
            real[-1]["text"] += glue(l) + l["text"]
            real[-1]["end_s"] = l["end_s"]
            real[-1]["_entries"].append(l)
        else:
            real.append({"text": l["text"], "start_s": l["start_s"], "end_s": l["end_s"],
                         "section": l.get("section") or "Unknown", "_entries": [l]})
    return real

def token_text(words, tok):
    """Rendered text of a token (one or more merged canonical word indices)."""
    parts = [words[i]["text"] for i in tok["ids"]]
    if len(parts) == 1:
        return parts[0]
    joiner = " " if tok.get("sep") == " " else ""
    body = joiner.join(p.strip() for p in parts)
    lead = " " if parts[0][:1] == " " else ""
    trail = " " if parts[-1][-1:] == " " else ""
    return lead + body + trail

def token_span(words, tok):
    ss = [words[i]["start"] for i in tok["ids"]]
    es = [words[i]["end"] for i in tok["ids"]]
    return min(ss), max(es)


# ── ASS formatting ──
def ass_time(t):
    t = max(0, t)
    h = int(t // 3600); m = int((t % 3600) // 60); s = t % 60
    cs = int(round((s - int(s)) * 100)); s = int(s)
    if cs == 100:
        s += 1; cs = 0
    return f"{h:d}:{m:02d}:{s:02d}.{cs:02d}"

def esc(s):
    return s.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")

def rgb_to_ass(hex_color, alpha_hex="00"):
    h = hex_color.lstrip("#")
    return f"&H{alpha_hex}{h[4:6]}{h[2:4]}{h[0:2]}".upper()


# ── render-group helpers (render-group shape is shared by both apps) ──
def is_dashes(t):
    return bool(re.fullmatch(r"-+", t.strip()))

def full_text_at(groups, t):
    """Full text (ALL words) of the render-group active at t."""
    for g in groups:
        if g["start"] <= t <= g["end"]:
            return "\n".join("".join(w["text"] for w in line["words"]).strip()
                             for line in g["lines"])
    return ""

def total_duration(groups):
    return (groups[-1]["end"] + 2.0) if groups else 10.0


# ── fonts ──
def list_font_families():
    if FC_LIST:
        try:
            out = subprocess.run([FC_LIST, ":", "family"], capture_output=True,
                                 text=True, timeout=8).stdout
            fams = sorted({line.split(",")[0].strip() for line in out.splitlines()
                           if line.strip()})
            if fams:
                return fams
        except Exception:
            pass
    return ["Arial", "DejaVu Sans", "Liberation Sans", "Sans"]
