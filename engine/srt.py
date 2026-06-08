# engine/srt.py — import SubRip (.srt) subtitles into the canonical word-atom model.
# An SRT carries only cue-level timing; we split each cue into word-atoms that SHARE
# the cue's [start,end], emit a Suno-shaped lyrics.json (leading-space atoms so the
# real loader keeps them distinct), and build an initial single-group layout whose
# lines follow a chosen break strategy (default: no breaks).
import re

_TC = re.compile(r"(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})")
_PUNCT = tuple(",.!?;:")


class Cue:
    __slots__ = ("start", "end", "words")
    def __init__(self, start, end, words):
        self.start, self.end, self.words = start, end, words


def _to_seconds(h, m, s, ms):
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms.ljust(3, "0")) / 1000.0


def parse_srt(text):
    """Parse SRT text into [Cue(start, end, [word, ...])]. Raises ValueError if no
    valid cue (a block with a 'start --> end' timecode line) is found."""
    text = text.lstrip("﻿").replace("\r\n", "\n").replace("\r", "\n")
    blocks = re.split(r"\n\s*\n", text.strip())
    cues = []
    for blk in blocks:
        lines = blk.split("\n")
        tc_idx = next((i for i, ln in enumerate(lines) if "-->" in ln), None)
        if tc_idx is None:
            continue
        tcs = _TC.findall(lines[tc_idx])
        if len(tcs) < 2:
            raise ValueError(f"bad timecode line: {lines[tc_idx]!r}")
        start, end = _to_seconds(*tcs[0]), _to_seconds(*tcs[1])
        body = " ".join(ln.strip() for ln in lines[tc_idx + 1:] if ln.strip())
        words = body.split()
        if words:
            cues.append(Cue(start, end, words))
    if not cues:
        raise ValueError("no SRT cues found")
    return cues


def srt_to_lyrics(cues):
    """Suno-shaped aligned-lyrics dict: one entry per cue, each word a separate atom
    (leading space defeats sub-word merging) sharing the cue's timing."""
    entries = []
    for c in cues:
        wj = [{"text": " " + w, "start_s": c.start, "end_s": c.end} for w in c.words]
        entries.append({"text": " ".join(c.words), "start_s": c.start, "end_s": c.end,
                        "section": "Subtitles", "words": wj})
    if entries:  # the very first atom needn't carry a leading space (it's first in its line group)
        entries[0]["words"][0]["text"] = entries[0]["words"][0]["text"].lstrip()
    return {"aligned_lyrics": entries}


def _line_index_groups(words, line_break, n_words, cue_word_counts):
    n = len(words)
    if n == 0:
        return []
    if line_break == "none":
        return [list(range(n))]
    if line_break == "per_cue":
        groups, i = [], 0
        for cnt in (cue_word_counts or [n]):
            if cnt > 0:
                groups.append(list(range(i, i + cnt))); i += cnt
        return groups
    if line_break == "every_n":
        step = max(1, int(n_words))
        return [list(range(i, min(i + step, n))) for i in range(0, n, step)]
    if line_break == "punctuation":
        groups, cur = [], []
        for i in range(n):
            cur.append(i)
            if words[i]["text"].rstrip().endswith(_PUNCT):
                groups.append(cur); cur = []
        if cur:
            groups.append(cur)
        return groups
    raise ValueError(f"unknown line_break {line_break!r}")


def build_srt_layout(words, line_break="none", n_words=5, cue_word_counts=None):
    """One layout event ('Subtitles') whose lines follow the break strategy.
    `words` is the canonical word list (only `text` is read, for punctuation)."""
    groups = _line_index_groups(words, line_break, n_words, cue_word_counts)
    lines = [{"toks": [{"ids": [i], "sep": "", "del": False, "style": {}} for i in g]}
             for g in groups]
    return [{"label": "Subtitles", "lines": lines, "accumulate": "words",
             "win_start": None, "win_end": None, "linger": None,
             "del": False, "style": {}, "fade": {}}]


# ── export (.srt / .vtt) ──────────────────────────────────────────────────────
# Serialize a project to plain caption text. One cue per rendered token: the
# token's merged text (core.token_text) over its own [start,end] span (min..max
# over the token's word ids). Deleted groups, deleted tokens, and empty tokens
# are omitted. Cues are emitted in time order (stable by start, then by layout
# reading order). SRT uses comma-millisecond timestamps + 1-based numbering;
# WebVTT uses dot-millisecond timestamps under a "WEBVTT" header, no numbering.

def _export_cues(project):
    """[(start_s, end_s, text), ...] for every rendered token, in time order."""
    import core
    words = project["words"]
    out = []
    for g in project["layout"]:
        if g.get("del"):
            continue
        for line in g["lines"]:
            for tok in line["toks"]:
                if tok.get("del") or not tok["ids"]:
                    continue
                ids = [i for i in tok["ids"] if i < len(words)]
                if not ids:
                    continue
                start = min(words[i]["start"] for i in ids)
                end = max(words[i]["end"] for i in ids)
                text = core.token_text(words, tok).strip()
                if not text:
                    continue
                out.append((start, end, text))
    out.sort(key=lambda c: c[0])
    return out


def _ts(t, sep):
    """HH:MM:SS<sep>mmm timestamp (sep is ',' for SRT, '.' for VTT)."""
    t = max(0.0, t)
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = int(t % 60)
    ms = int(round((t - int(t)) * 1000))
    if ms == 1000:
        s += 1; ms = 0
        if s == 60:
            s = 0; m += 1
            if m == 60:
                m = 0; h += 1
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"


def to_srt(project):
    """SubRip (.srt) text for a project (trailing newline; numbered cues)."""
    cues = _export_cues(project)
    blocks = []
    for i, (start, end, text) in enumerate(cues, 1):
        blocks.append(f"{i}\n{_ts(start, ',')} --> {_ts(end, ',')}\n{text}\n")
    return "\n".join(blocks) + ("\n" if blocks else "")


def to_vtt(project):
    """WebVTT (.vtt) text for a project (WEBVTT header; dot-millisecond stamps)."""
    cues = _export_cues(project)
    blocks = ["WEBVTT\n"]
    for (start, end, text) in cues:
        blocks.append(f"{_ts(start, '.')} --> {_ts(end, '.')}\n{text}\n")
    return "\n".join(blocks) + ("\n" if len(blocks) > 1 else "")
