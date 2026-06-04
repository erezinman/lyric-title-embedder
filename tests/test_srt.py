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

def t_to_lyrics_shape_and_shared_timing():
    cues = srt.parse_srt(SAMPLE)
    doc = srt.srt_to_lyrics(cues)
    e0 = doc["aligned_lyrics"][0]
    shared = all(abs(w["start_s"] - e0["start_s"]) < 1e-9 and abs(w["end_s"] - e0["end_s"]) < 1e-9
                 for w in e0["words"])
    return (len(doc["aligned_lyrics"]) == 2 and len(e0["words"]) == 3
            and e0["section"] == "Subtitles" and shared), json.dumps(e0)

def _roundtrip_words(doc):
    fd, path = tempfile.mkstemp(suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh: json.dump(doc, fh)
        p = engine.make_project({"json_path": path, "group_by": "section", "skip_dashes": True})
        return p["words"]
    finally:
        os.remove(path)

def t_roundtrip_atom_count_and_text():
    cues = srt.parse_srt(SAMPLE)
    words = _roundtrip_words(srt.srt_to_lyrics(cues))
    texts = [w["text"].strip() for w in words]
    return (len(words) == 6 and texts == ["Hello", "there", "world", "second", "cue", "here"]), str(texts)

def t_roundtrip_lowercase_leading_cue_stays_distinct():
    # cue 2 starts lowercase -> reconstruct_lines line-merges it into cue 1; atoms must stay split
    txt = ("1\n00:00:00,000 --> 00:00:01,000\nHello world\n\n"
           "2\n00:00:01,000 --> 00:00:02,000\nlittle words here\n")
    words = _roundtrip_words(srt.srt_to_lyrics(srt.parse_srt(txt)))
    return (len(words) == 5
            and [w["text"].strip() for w in words] == ["Hello", "world", "little", "words", "here"]), \
           str([w["text"] for w in words])

def _words(texts):
    return [{"text": t, "start": 0.0, "end": 1.0} for t in texts]

def _line_lens(layout):
    return [len(ln["toks"]) for ln in layout[0]["lines"]]

def t_layout_none_single_line():
    lay = srt.build_srt_layout(_words(["a", "b", "c", "d"]), line_break="none")
    return (len(lay) == 1 and lay[0]["label"] == "Subtitles" and _line_lens(lay) == [4]
            and lay[0]["lines"][0]["toks"][0] == {"ids": [0], "sep": "", "del": False, "style": {}}), str(_line_lens(lay))

def t_layout_every_n():
    lay = srt.build_srt_layout(_words(["a"] * 7), line_break="every_n", n_words=3)
    return (_line_lens(lay) == [3, 3, 1]), str(_line_lens(lay))

def t_layout_per_cue():
    lay = srt.build_srt_layout(_words(["a"] * 5), line_break="per_cue", cue_word_counts=[2, 3])
    return (_line_lens(lay) == [2, 3]), str(_line_lens(lay))

def t_layout_punctuation():
    lay = srt.build_srt_layout(_words(["Hello", "world,", "this", "ends."]), line_break="punctuation")
    return (_line_lens(lay) == [2, 2]), str(_line_lens(lay))

def t_layout_ids_are_global_sequential():
    lay = srt.build_srt_layout(_words(["a", "b", "c"]), line_break="every_n", n_words=2)
    ids = [t["ids"][0] for ln in lay[0]["lines"] for t in ln["toks"]]
    return (ids == [0, 1, 2]), str(ids)

def t_export_via_engine_namespace():
    return (hasattr(engine, "srt") and callable(engine.srt.build_srt_layout)), "engine.srt present"

_active = {n: f for n, f in list(globals().items()) if n.startswith("t_") and callable(f)}
for n, f in sorted(_active.items()): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, d in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"\n       -> {d}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
