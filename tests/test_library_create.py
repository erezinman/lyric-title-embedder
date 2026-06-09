# tests/test_library_create.py — daemon.library.create_project + video round-trip.
import os, sys, json, shutil, tempfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from daemon.hub import Hub
from daemon.context import DaemonContext
from daemon import library

results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))

SRT = ("1\n00:00:01,000 --> 00:00:03,000\nHello world\n\n"
       "2\n00:00:03,000 --> 00:00:05,000\nsecond line now\n")

def _ctx(): return DaemonContext(Hub())

def _tmp(): return tempfile.mkdtemp(prefix="kss_lib_")

def t_create_from_suno_path():
    d = _tmp()
    try:
        library.create_project(_ctx(), d, "p1", source="suno_json", lyrics_path="aligned_lyrics.json")
        return (os.path.isfile(os.path.join(d, "p1", "lyrics.json"))
                and os.path.isfile(os.path.join(d, "p1", "project.json"))
                and library.list_projects(d) == ["p1"]), "ok"
    finally: shutil.rmtree(d, ignore_errors=True)

def t_create_from_srt_bytes_one_line_default():
    d = _tmp()
    try:
        ctx = _ctx()
        library.create_project(ctx, d, "s1", source="srt", lyrics_bytes=SRT.encode("utf-8"))
        proj = ctx.session.project
        return (len(proj["words"]) == 5 and len(proj["layout"]) == 1
                and len(proj["layout"][0]["lines"]) == 1), str(len(proj["layout"][0]["lines"]))
    finally: shutil.rmtree(d, ignore_errors=True)

def t_create_srt_per_cue():
    d = _tmp()
    try:
        ctx = _ctx()
        library.create_project(ctx, d, "s2", source="srt", lyrics_bytes=SRT.encode("utf-8"),
                               line_break="per_cue")
        lines = ctx.session.project["layout"][0]["lines"]
        return ([len(l["toks"]) for l in lines] == [2, 3]), str([len(l["toks"]) for l in lines])
    finally: shutil.rmtree(d, ignore_errors=True)

def t_collision_raises():
    d = _tmp()
    try:
        library.create_project(_ctx(), d, "p1", source="suno_json", lyrics_path="aligned_lyrics.json")
        try:
            library.create_project(_ctx(), d, "p1", source="suno_json", lyrics_path="aligned_lyrics.json")
            return (False, "no raise")
        except FileExistsError:
            return (True, "raised")
    finally: shutil.rmtree(d, ignore_errors=True)

def t_bad_json_leaves_no_folder():
    d = _tmp()
    try:
        try:
            library.create_project(_ctx(), d, "bad", source="suno_json", lyrics_bytes=b"not json")
            return (False, "no raise")
        except ValueError:
            return (not os.path.exists(os.path.join(d, "bad")), "no folder left")
    finally: shutil.rmtree(d, ignore_errors=True)

def t_video_bytes_copied_and_roundtrips():
    d = _tmp()
    try:
        ctx = _ctx()
        library.create_project(ctx, d, "v1", source="srt", lyrics_bytes=SRT.encode("utf-8"),
                               video_bytes=b"\x00\x01\x02", video_name="clip.mp4")
        copied = os.path.join(d, "v1", "video.mp4")
        doc = json.load(open(os.path.join(d, "v1", "project.json"), encoding="utf-8"))
        ctx2 = _ctx()
        library.open_project(ctx2, d, "v1")
        return (os.path.isfile(copied) and doc.get("video") == "video.mp4"
                and ctx2.video_path() == os.path.abspath(copied)), str(doc.get("video"))
    finally: shutil.rmtree(d, ignore_errors=True)

def t_video_path_referenced_not_copied():
    d = _tmp()
    try:
        ext = tempfile.NamedTemporaryFile(prefix="vid_", suffix=".mp4", delete=False); ext.write(b"x"); ext.close()
        ctx = _ctx()
        library.create_project(ctx, d, "v2", source="srt", lyrics_bytes=SRT.encode("utf-8"),
                               video_path=ext.name)
        doc = json.load(open(os.path.join(d, "v2", "project.json"), encoding="utf-8"))
        no_copy = not os.path.isfile(os.path.join(d, "v2", "video.mp4"))
        os.remove(ext.name)
        return (doc.get("video") == os.path.abspath(ext.name) and no_copy), str(doc.get("video"))
    finally: shutil.rmtree(d, ignore_errors=True)

def t_srt_dash_cue_per_cue_ids_in_range():
    # Regression: a dash-only SRT cue must NOT be dash-skipped (Suno-only option),
    # or per_cue word counts overflow the loaded word list (out-of-range token ids).
    srt_txt = ("1\n00:00:00,000 --> 00:00:01,000\nHello world\n\n"
               "2\n00:00:01,000 --> 00:00:02,000\n--\n\n"
               "3\n00:00:02,000 --> 00:00:03,000\nBye now\n")
    d = _tmp()
    try:
        ctx = _ctx()
        library.create_project(ctx, d, "dash", source="srt",
                               lyrics_bytes=srt_txt.encode("utf-8"), line_break="per_cue")
        proj = ctx.session.project
        ids = [t["ids"][0] for ln in proj["layout"][0]["lines"] for t in ln["toks"]]
        n = len(proj["words"])
        return (n == 5 and max(ids) == n - 1
                and [len(l["toks"]) for l in proj["layout"][0]["lines"]] == [2, 1, 2]), \
               f"nwords={n} ids={ids}"
    finally: shutil.rmtree(d, ignore_errors=True)

def t_missing_lyrics_input_raises():
    d = _tmp()
    try:
        try:
            library.create_project(_ctx(), d, "x", source="suno_json")
            return (False, "no raise")
        except ValueError as e:
            return ("lyrics" in str(e) and not os.path.exists(os.path.join(d, "x"))), str(e)
    finally: shutil.rmtree(d, ignore_errors=True)

def t_bad_lyrics_path_raises():
    d = _tmp()
    try:
        try:
            library.create_project(_ctx(), d, "x", source="srt", lyrics_path="/no/such.srt")
            return (False, "no raise")
        except ValueError as e:
            return ("not found" in str(e)), str(e)
    finally: shutil.rmtree(d, ignore_errors=True)

def t_srt_timings_roundtrip():
    d = _tmp()
    try:
        ctx = _ctx()
        library.create_project(ctx, d, "s3", source="srt", lyrics_bytes=SRT.encode("utf-8"))
        ctx2 = _ctx(); library.open_project(ctx2, d, "s3")
        w = ctx2.session.project["words"]
        return (len(w) == 5 and abs(w[0]["start"] - 1.0) < 1e-6 and abs(w[0]["end"] - 3.0) < 1e-6
                and abs(w[2]["start"] - 3.0) < 1e-6), str(w[0])
    finally: shutil.rmtree(d, ignore_errors=True)

def t_project_meta_srt_shape():
    # project_meta returns lightweight listing metadata: name + edited-time +
    # duration (max line end) + caption (first lines). SRT cues 1-3s, 3-5s.
    d = _tmp()
    try:
        library.create_project(_ctx(), d, "s1", source="srt", lyrics_bytes=SRT.encode("utf-8"))
        m = library.project_meta(d, "s1")
        return (m["name"] == "s1" and isinstance(m["modified"], float) and m["modified"] > 0
                and abs(m["duration_s"] - 5.0) < 1e-6
                and m["caption"][0] == "Hello world"), str(m)
    finally: shutil.rmtree(d, ignore_errors=True)

def t_project_meta_suno_caption_and_duration():
    d = _tmp()
    try:
        library.create_project(_ctx(), d, "p1", source="suno_json", lyrics_path="aligned_lyrics.json")
        m = library.project_meta(d, "p1")
        # first aligned_lyrics line text + the track's last line end (~360.6s)
        return (m["caption"][0] == "*Baa... baa...*" and len(m["caption"]) <= 2
                and m["duration_s"] is not None and m["duration_s"] > 300), str(m)[:160]
    finally: shutil.rmtree(d, ignore_errors=True)

def t_project_meta_missing_is_robust():
    # Never raises on a missing/empty project — all derived fields come back None.
    d = _tmp()
    try:
        m = library.project_meta(d, "ghost")
        return (m["name"] == "ghost" and m["modified"] is None
                and m["duration_s"] is None and m["caption"] is None), str(m)
    finally: shutil.rmtree(d, ignore_errors=True)

_active = {n: f for n, f in list(globals().items()) if n.startswith("t_") and callable(f)}
for n, f in sorted(_active.items()): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, dd in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"\n       -> {dd}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
