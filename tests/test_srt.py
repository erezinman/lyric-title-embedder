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

# ── export (to_srt / to_vtt) ──────────────────────────────────────────────────
def _proj(words, lines_ids):
    """Minimal migrated-shape project. words: [(text,start,end)]. lines_ids: list of
    lines, each a list of token-id-lists."""
    return {"words": [{"text": t, "start": s, "end": e} for (t, s, e) in words],
            "globals": {"animations": []}, "anim_tags": [],
            "layout": [{"label": "L", "win_start": None, "win_end": None, "linger": None,
                        "del": False, "style": {}, "animations": [], "suppress": [],
                        "lines": [{"toks": [{"ids": list(ids), "sep": " " if len(ids) > 1 else "",
                                             "del": False, "style": {}} for ids in line]}
                                  for line in lines_ids]}]}

def t_to_srt_basic_format_and_numbering():
    p = _proj([("Hello", 1.0, 4.0), ("there", 4.5, 6.25)], [[[0]], [[1]]])
    out = srt.to_srt(p)
    expect = ("1\n00:00:01,000 --> 00:00:04,000\nHello\n\n"
              "2\n00:00:04,500 --> 00:00:06,250\nthere\n\n")
    return (out == expect), repr(out)

def t_to_vtt_header_and_dot_stamps():
    p = _proj([("Hello", 1.0, 4.0), ("there", 4.5, 6.25)], [[[0]], [[1]]])
    out = srt.to_vtt(p)
    expect = ("WEBVTT\n\n"
              "00:00:01.000 --> 00:00:04.000\nHello\n\n"
              "00:00:04.500 --> 00:00:06.250\nthere\n\n")
    return (out == expect), repr(out)

def t_to_srt_merged_token_single_cue():
    # a single merged token (two ids) -> one cue spanning min..max, joined text
    p = _proj([("good", 1.0, 2.0), ("bye", 2.0, 3.0)], [[[0, 1]]])
    out = srt.to_srt(p)
    expect = "1\n00:00:01,000 --> 00:00:03,000\ngood bye\n\n"
    return (out == expect), repr(out)

def t_to_srt_deleted_token_omitted():
    p = _proj([("keep", 1.0, 2.0), ("drop", 2.0, 3.0)], [[[0], [1]]])
    p["layout"][0]["lines"][0]["toks"][1]["del"] = True
    out = srt.to_srt(p)
    return (out == "1\n00:00:01,000 --> 00:00:02,000\nkeep\n\n"), repr(out)

def t_to_srt_deleted_group_omitted():
    p = _proj([("keep", 1.0, 2.0)], [[[0]]])
    p["layout"][0]["del"] = True
    return (srt.to_srt(p) == ""), repr(srt.to_srt(p))

def t_export_time_ordered():
    # token order in layout is reverse of time order -> output must sort by start
    p = _proj([("late", 5.0, 6.0), ("early", 1.0, 2.0)], [[[0], [1]]])
    out = srt.to_srt(p)
    return (out.splitlines()[2] == "early" and out.splitlines()[6] == "late"), repr(out)

def t_roundtrip_parse_build_to_srt_text_stable():
    # parse SAMPLE -> make_project -> build a per-cue layout -> to_srt should reproduce
    # cue texts (one cue per word here since each token is a single id).
    cues = srt.parse_srt(SAMPLE)
    fd, path = tempfile.mkstemp(suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh: json.dump(srt.srt_to_lyrics(cues), fh)
        p = engine.make_project({"json_path": path, "group_by": "section", "skip_dashes": True})
        out = srt.to_srt(p)
    finally:
        os.remove(path)
    texts = [ln for i, ln in enumerate(out.splitlines()) if ln and "-->" not in ln and not ln.isdigit()]
    return (texts == ["Hello", "there", "world", "second", "cue", "here"]), repr(out)

def t_tool_get_srt_and_vtt_text():
    from mcp_server.context import HeadlessContext
    from mcp_server import tools
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    s = tools.get_srt(ctx); v = tools.get_vtt(ctx)
    return (isinstance(s, str) and "-->" in s and "," in s.split("-->")[1].split("\n")[0]
            and v.startswith("WEBVTT") and "." in v.split("-->")[1].split("\n")[0]), f"len s={len(s)}"

def t_daemon_srt_vtt_routes():
    from starlette.testclient import TestClient
    from daemon.app import build_app
    from daemon.hub import Hub
    from daemon.context import DaemonContext
    hub = Hub(); ctx = DaemonContext(hub); ctx.load_lyrics("aligned_lyrics.json")
    c = TestClient(build_app(ctx, hub, token=None, projects_dir="/tmp/_kss_projects"))
    rs = c.get("/api/srt"); rv = c.get("/api/vtt")
    return (rs.status_code == 200 and rs.headers["content-type"].startswith("text/plain")
            and rv.status_code == 200 and rv.text.startswith("WEBVTT")), f"srt={rs.status_code} vtt={rv.status_code}"

_active = {n: f for n, f in list(globals().items()) if n.startswith("t_") and callable(f)}
for n, f in sorted(_active.items()): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, d in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"\n       -> {d}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
