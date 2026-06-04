# tests/test_srt.py — engine/srt.py: parse + convert + layout (TDD, headless).
import os, sys, json, tempfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import engine
from engine import srt

results = []
def check(name, fn):
    try:
        ok, detail = fn(); results.append((ok, name, detail))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))

SAMPLE = """1
00:00:01,000 --> 00:00:04,000
Hello there world

2
00:00:04,500 --> 00:00:06,250
second cue here
"""

def t_parse_counts_and_times():
    cues = srt.parse_srt(SAMPLE)
    return (len(cues) == 2 and cues[0].words == ["Hello", "there", "world"]
            and abs(cues[0].start - 1.0) < 1e-6 and abs(cues[0].end - 4.0) < 1e-6
            and abs(cues[1].start - 4.5) < 1e-6 and abs(cues[1].end - 6.25) < 1e-6), str([c.words for c in cues])

def t_parse_multiline_cue_joined():
    txt = "1\n00:00:00,000 --> 00:00:02,000\nline one\nline two\n"
    cues = srt.parse_srt(txt)
    return (len(cues) == 1 and cues[0].words == ["line", "one", "line", "two"]), str(cues[0].words)

def t_parse_no_index_ok():
    txt = "00:00:00,000 --> 00:00:01,000\nno index\n"
    cues = srt.parse_srt(txt)
    return (len(cues) == 1 and cues[0].words == ["no", "index"]), str(cues[0].words)

def t_parse_bom_and_crlf():
    txt = "﻿1\r\n00:00:00,000 --> 00:00:01,000\r\nhi\r\n"
    cues = srt.parse_srt(txt)
    return (len(cues) == 1 and cues[0].words == ["hi"]), str(cues[0].words)

def t_parse_empty_raises():
    try:
        srt.parse_srt("   \n\n  "); return (False, "no raise")
    except ValueError:
        return (True, "raised")

def t_parse_bad_timecode_raises():
    try:
        srt.parse_srt("1\n00:00 --> garbage\ntext\n"); return (False, "no raise")
    except ValueError:
        return (True, "raised")

_active = {n: f for n, f in list(globals().items()) if n.startswith("t_") and callable(f)}
for n, f in sorted(_active.items()): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, d in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"\n       -> {d}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
