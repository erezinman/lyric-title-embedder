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
