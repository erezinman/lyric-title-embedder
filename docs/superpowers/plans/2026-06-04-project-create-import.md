# Project Create/Import (Spec 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A web "New project" wizard that creates a self-contained project from a file source (Suno aligned-lyrics JSON or an SRT), with an optional video, replacing the dead `onOpen("")` and fixing the "new project not pressable" bug.

**Architecture:** A new UI-free `engine/srt.py` converts SRT → the canonical word-atom model. A single `library.create_project()` is the only create code path; both the new multipart `POST /api/projects/create` and the legacy JSON `POST /api/projects/new` (now a thin shim) call it. A `GET /api/env` reports loopback so the web modal can offer a server-path input on the same host. A new `CreateProjectModal` drives it all.

**Tech Stack:** Python (Starlette daemon, stdlib tests), TypeScript/React (Vite, Vitest + RTL).

**Spec:** `docs/superpowers/specs/2026-06-04-project-create-import-design.md`

**Testing conventions:**
- Python tests are stdlib scripts under `tests/` with a `check`/`results` harness, printing a summary and `sys.exit(0/1)`. Each file begins with `sys.path.insert(0, <root>)` + `os.chdir(<root>)`. Run with `.venv/bin/python tests/<file>.py`.
- Daemon tests use `starlette.testclient.TestClient` over `daemon.app.build_app`.
- Web tests use Vitest + RTL. Run with `npm --prefix web run test`.
- Engine tests are TDD-first and run per-task. Tk UI suites are NOT touched here.

---

### Task 1: SRT parser (`engine/srt.py` — `parse_srt`)

**Files:**
- Create: `engine/srt.py`
- Test: `tests/test_srt.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_srt.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python tests/test_srt.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'engine.srt'`.

- [ ] **Step 3: Write minimal implementation**

Create `engine/srt.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python tests/test_srt.py`
Expected: PASS — `6/6 passed`.

- [ ] **Step 5: Commit**

```bash
git add engine/srt.py tests/test_srt.py
git commit -m "feat(engine): SRT parser (parse_srt + timecodes)"
```

---

### Task 2: SRT → aligned-lyrics + make_project round-trip (`engine/srt.py` — `srt_to_lyrics`)

**Files:**
- Modify: `engine/srt.py`
- Test: `tests/test_srt.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_srt.py` (before the runner block):

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python tests/test_srt.py`
Expected: FAIL — `srt_to_lyrics` not defined.

- [ ] **Step 3: Write minimal implementation**

Append to `engine/srt.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python tests/test_srt.py`
Expected: PASS — `9/9 passed`.

- [ ] **Step 5: Commit**

```bash
git add engine/srt.py tests/test_srt.py
git commit -m "feat(engine): srt_to_lyrics with make_project round-trip fidelity"
```

---

### Task 3: Line-break strategies + initial layout (`engine/srt.py` — `build_srt_layout`)

**Files:**
- Modify: `engine/srt.py`, `engine/__init__.py`
- Test: `tests/test_srt.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_srt.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python tests/test_srt.py`
Expected: FAIL — `build_srt_layout` not defined / `engine.srt` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `engine/srt.py`:

```python
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
```

Then add to `engine/__init__.py` (after the existing `from engine import mutations` line):

```python
from engine import srt
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python tests/test_srt.py`
Expected: PASS — `15/15 passed`.

- [ ] **Step 5: Commit**

```bash
git add engine/srt.py engine/__init__.py tests/test_srt.py
git commit -m "feat(engine): build_srt_layout line-break strategies; export engine.srt"
```

---

### Task 4: `library.create_project` + video persistence

**Files:**
- Modify: `daemon/library.py`
- Test: `tests/test_library_create.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_library_create.py`:

```python
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

_active = {n: f for n, f in list(globals().items()) if n.startswith("t_") and callable(f)}
for n, f in sorted(_active.items()): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, dd in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"\n       -> {dd}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python tests/test_library_create.py`
Expected: FAIL — `library.create_project` not defined.

- [ ] **Step 3: Verify the context video API exists**

Run: `grep -n "set_video\|video_path" daemon/context.py mcp_server/context.py`
Expected: `DaemonContext` inherits `set_video`/`video_path` from `HeadlessContext` (mcp_server/context.py lines ~41-42). If `daemon/context.py` overrides them, mirror the same behavior. (No code change expected; this is a guard check.)

- [ ] **Step 4: Write minimal implementation**

Edit `daemon/library.py`. Add `import engine` is already present; ensure `json, os, shutil` imported (they are). Add helper + `create_project`, and extend `save_project`/`open_project`:

```python
def _video_field(folder, path):
    """Persisted video value: folder-relative basename if inside the folder, else absolute."""
    if not path:
        return None
    ap = os.path.abspath(path)
    if ap.startswith(os.path.abspath(folder) + os.sep):
        return os.path.basename(ap)
    return ap


def create_project(ctx, projects_dir, name, *, source,
                   lyrics_bytes=None, lyrics_path=None,
                   video_bytes=None, video_path=None, video_name=None,
                   group_by="section", skip_dashes=True,
                   line_break="none", n_words=5):
    """Single create code path. Materializes a self-contained project folder,
    opens it, and saves project.json. Raises FileExistsError on name collision
    and ValueError on bad input. Leaves no folder behind on failure."""
    name = _safe(name)
    folder = os.path.join(projects_dir, name)
    if os.path.exists(folder):
        raise FileExistsError(f"a project named {name!r} already exists")

    # 1. Resolve + validate the lyrics source BEFORE creating the folder.
    cues = None
    if source == "suno_json":
        raw = lyrics_bytes if lyrics_bytes is not None else open(lyrics_path, "rb").read()
        try:
            lyrics_doc = json.loads(raw.decode("utf-8"))
        except Exception as e:
            raise ValueError(f"lyrics is not valid JSON: {e}")
        if not isinstance(lyrics_doc.get("aligned_lyrics"), list) or not lyrics_doc["aligned_lyrics"]:
            raise ValueError("JSON has no non-empty 'aligned_lyrics'")
    elif source == "srt":
        text = (lyrics_bytes.decode("utf-8") if lyrics_bytes is not None
                else open(lyrics_path, encoding="utf-8").read())
        cues = engine.srt.parse_srt(text)
        lyrics_doc = engine.srt.srt_to_lyrics(cues)
    else:
        raise ValueError(f"unknown source {source!r}")

    os.makedirs(folder)
    try:
        with open(os.path.join(folder, "lyrics.json"), "w", encoding="utf-8") as fh:
            json.dump(lyrics_doc, fh, ensure_ascii=False)

        vpath = None
        if video_bytes is not None:
            ext = os.path.splitext(video_name or "video.mp4")[1] or ".mp4"
            vpath = os.path.join(folder, "video" + ext)
            with open(vpath, "wb") as fh:
                fh.write(video_bytes)
        elif video_path:
            if not os.path.isfile(video_path):
                raise ValueError(f"video path not found: {video_path}")
            vpath = os.path.abspath(video_path)

        ctx.load_lyrics(os.path.join(folder, "lyrics.json"),
                        group_by=group_by, skip_dashes=skip_dashes)
        if source == "srt":
            proj = ctx.session.project
            proj["layout"] = engine.srt.build_srt_layout(
                proj["words"], line_break=line_break, n_words=n_words,
                cue_word_counts=[len(c.words) for c in cues])
            ctx.session.set_project(proj)
        if vpath:
            ctx.set_video(vpath)
        save_project(ctx, projects_dir, name)
        return name
    except Exception:
        shutil.rmtree(folder, ignore_errors=True)
        raise
```

Replace `save_project` body's `doc` line and `open_project`'s restore block:

```python
def save_project(ctx, projects_dir, name):
    name = _safe(name)
    folder = os.path.join(projects_dir, name); os.makedirs(folder, exist_ok=True)
    doc = {"globals_style": ctx.get_globals(),
           "cues_v2": engine.serialize_cues(ctx.session.project),
           "video": _video_field(folder, ctx.video_path())}
    with open(os.path.join(folder, "project.json"), "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=2)
```

In `open_project`, inside the `if os.path.isfile(pj):` block, after `engine.apply_cues(...)` and before `ctx.session.set_project(...)`:

```python
        v = d.get("video")
        if v:
            ctx.set_video(v if os.path.isabs(v) else os.path.join(folder, v))
```

- [ ] **Step 5: Run test to verify it passes**

Run: `.venv/bin/python tests/test_library_create.py`
Expected: PASS — `8/8 passed`.

- [ ] **Step 6: Commit**

```bash
git add daemon/library.py tests/test_library_create.py
git commit -m "feat(daemon): library.create_project + video persistence"
```

---

### Task 5: Daemon `GET /api/env`

**Files:**
- Modify: `daemon/api.py`, `daemon/app.py`
- Test: `tests/test_daemon_projects.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_daemon_projects.py`:

```python
# tests/test_daemon_projects.py — /api/env + /api/projects/create + legacy /new shim.
import os, sys, io, json, shutil, tempfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from starlette.testclient import TestClient
from daemon.hub import Hub
from daemon.context import DaemonContext
from daemon.app import build_app

results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))

def _client():
    d = tempfile.mkdtemp(prefix="kss_dproj_")
    app = build_app(DaemonContext(Hub()), Hub(), token=None, projects_dir=d)
    return TestClient(app), d

def t_env_same_host_loopback():
    c, d = _client()
    try:
        r = c.get("/api/env")
        return (r.status_code == 200 and r.json().get("same_host") is True), r.text
    finally: shutil.rmtree(d, ignore_errors=True)

_active = {n: f for n, f in list(globals().items()) if n.startswith("t_") and callable(f)}
for n, f in sorted(_active.items()): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, dd in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"\n       -> {dd}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python tests/test_daemon_projects.py`
Expected: FAIL — `GET /api/env` returns 404.

- [ ] **Step 3: Write minimal implementation**

In `daemon/api.py`, add an `env` handler inside `make_routes` (near `state`):

```python
    async def env(request):
        client = request.client
        same = bool(client and client.host in ("127.0.0.1", "::1", "localhost"))
        return JSONResponse({"same_host": same})
```

Update the return tuple at the end of `make_routes` to append `env` (keep order stable — append at the end):

```python
    return call, state, render, ass, ws_endpoint, frame, burn, burn_status, \
           projects_list, projects_new, projects_open, projects_save, env
```

In `daemon/app.py`, update the unpack and routes:

```python
    (call, state, render, ass, ws_endpoint, frame, burn, burn_status,
     projects_list, projects_new, projects_open, projects_save, env) = make_routes(ctx, hub)
```

and add to the `routes` list:

```python
        Route("/api/env", env, methods=["GET"]),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python tests/test_daemon_projects.py`
Expected: PASS — `1/1 passed`.

- [ ] **Step 5: Commit**

```bash
git add daemon/api.py daemon/app.py tests/test_daemon_projects.py
git commit -m "feat(daemon): GET /api/env reports same-host (loopback)"
```

---

### Task 6: Daemon `POST /api/projects/create` (multipart) + `/new` shim

**Files:**
- Modify: `daemon/api.py`, `daemon/app.py`, `pyproject.toml`
- Test: `tests/test_daemon_projects.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_daemon_projects.py` (before the runner block):

```python
SRT = ("1\n00:00:01,000 --> 00:00:03,000\nHello world\n\n"
       "2\n00:00:03,000 --> 00:00:05,000\nsecond line now\n")

def t_create_suno_upload():
    c, d = _client()
    try:
        with open("aligned_lyrics.json", "rb") as fh: blob = fh.read()
        r = c.post("/api/projects/create",
                   data={"name": "u1", "source": "suno_json"},
                   files={"lyrics_file": ("aligned_lyrics.json", io.BytesIO(blob), "application/json")})
        return (r.status_code == 200 and r.json().get("opened") == "u1"
                and "u1" in c.get("/api/projects").json()), r.text
    finally: shutil.rmtree(d, ignore_errors=True)

def t_create_srt_upload():
    c, d = _client()
    try:
        r = c.post("/api/projects/create",
                   data={"name": "srt1", "source": "srt", "line_break": "per_cue"},
                   files={"lyrics_file": ("x.srt", io.BytesIO(SRT.encode()), "text/plain")})
        return (r.status_code == 200 and "srt1" in c.get("/api/projects").json()), r.text
    finally: shutil.rmtree(d, ignore_errors=True)

def t_create_same_host_path():
    c, d = _client()
    try:
        r = c.post("/api/projects/create",
                   data={"name": "p2", "source": "suno_json",
                         "lyrics_path": os.path.abspath("aligned_lyrics.json")})
        return (r.status_code == 200 and "p2" in c.get("/api/projects").json()), r.text
    finally: shutil.rmtree(d, ignore_errors=True)

def t_create_collision_409():
    c, d = _client()
    try:
        c.post("/api/projects/create", data={"name": "dup", "source": "srt"},
               files={"lyrics_file": ("x.srt", io.BytesIO(SRT.encode()), "text/plain")})
        r = c.post("/api/projects/create", data={"name": "dup", "source": "srt"},
                   files={"lyrics_file": ("x.srt", io.BytesIO(SRT.encode()), "text/plain")})
        return (r.status_code == 409 and "error" in r.json()), r.text
    finally: shutil.rmtree(d, ignore_errors=True)

def t_create_bad_srt_400():
    c, d = _client()
    try:
        r = c.post("/api/projects/create", data={"name": "z", "source": "srt"},
                   files={"lyrics_file": ("x.srt", io.BytesIO(b"   "), "text/plain")})
        return (r.status_code == 400 and "error" in r.json()), r.text
    finally: shutil.rmtree(d, ignore_errors=True)

def t_legacy_new_still_works():
    c, d = _client()
    try:
        r = c.post("/api/projects/new",
                   json={"name": "leg", "lyrics_path": os.path.abspath("aligned_lyrics.json")})
        return (r.status_code == 200 and "leg" in c.get("/api/projects").json()), r.text
    finally: shutil.rmtree(d, ignore_errors=True)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python tests/test_daemon_projects.py`
Expected: FAIL — `POST /api/projects/create` 404; legacy `/new` may already pass (it will be re-routed in step 3).

- [ ] **Step 3: Write minimal implementation**

In `daemon/api.py`, replace the existing `projects_new` handler and add `projects_create` (both delegate to `library.create_project`):

```python
    async def projects_new(request):
        b = await request.json()
        try:
            opened = library.create_project(ctx, request.app.state.projects_dir, b["name"],
                                             source="suno_json", lyrics_path=b["lyrics_path"])
        except FileExistsError as e:
            return _err(str(e), 409)
        except ValueError as e:
            return _err(str(e))
        return JSONResponse({"opened": opened})

    async def projects_create(request):
        form = await request.form()
        def g(k, default=None):
            v = form.get(k)
            return v if (v is not None and v != "") else default
        try:
            kwargs = dict(
                source=g("source", "suno_json"),
                group_by=g("group_by", "section"),
                skip_dashes=(g("skip_dashes", "true") == "true"),
                line_break=g("line_break", "none"),
                n_words=int(g("n_words", "5")),
            )
            lf = form.get("lyrics_file")
            if lf is not None and hasattr(lf, "read"):
                kwargs["lyrics_bytes"] = await lf.read()
            else:
                kwargs["lyrics_path"] = g("lyrics_path")
            vf = form.get("video_file")
            if vf is not None and hasattr(vf, "read"):
                kwargs["video_bytes"] = await vf.read()
                kwargs["video_name"] = getattr(vf, "filename", "video.mp4")
            elif g("video_path"):
                kwargs["video_path"] = g("video_path")
            opened = library.create_project(ctx, request.app.state.projects_dir, g("name"), **kwargs)
        except FileExistsError as e:
            return _err(str(e), 409)
        except ValueError as e:
            return _err(str(e), 400)
        except Exception as e:
            return _err(f"{type(e).__name__}: {e}", 422)
        return JSONResponse({"opened": opened})
```

Update the return tuple (append `projects_create` at the end):

```python
    return call, state, render, ass, ws_endpoint, frame, burn, burn_status, \
           projects_list, projects_new, projects_open, projects_save, env, projects_create
```

In `daemon/app.py`, update the unpack and add the route:

```python
    (call, state, render, ass, ws_endpoint, frame, burn, burn_status,
     projects_list, projects_new, projects_open, projects_save, env, projects_create) = make_routes(ctx, hub)
```

```python
        Route("/api/projects/create", projects_create, methods=["POST"]),
```

In `pyproject.toml`, under `[tool.poetry.group.mcp.dependencies]`, declare the multipart dep (already installed in the venv as `python-multipart` 0.0.30):

```toml
python-multipart = ">=0.0.9"
```

If `daemon/library.py` still defines the old `new_project` function and nothing references it (verify: `grep -rn "new_project" daemon mcp_server tests`), remove it; otherwise leave it.

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python tests/test_daemon_projects.py`
Expected: PASS — `7/7 passed`.

- [ ] **Step 5: Run the existing daemon suite to confirm no regressions**

Run: `.venv/bin/python tests/test_daemon.py`
Expected: PASS (the prior `/api/projects/new` test, if any, still passes via the shim).

- [ ] **Step 6: Commit**

```bash
git add daemon/api.py daemon/app.py pyproject.toml tests/test_daemon_projects.py
git commit -m "feat(daemon): POST /api/projects/create (multipart) + /new shim to create_project"
```

---

### Task 7: Web API client — `getEnv` + `projects.create(FormData)`

**Files:**
- Modify: `web/src/api/client.ts`
- Test: `web/src/api/client.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `web/src/api/client.test.ts` (follow the existing mock-fetch style in that file):

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getEnv, projects } from "./client";

beforeEach(() => { vi.restoreAllMocks(); });

describe("getEnv", () => {
  it("returns same_host flag", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ same_host: true }), { status: 200 })));
    expect(await getEnv()).toEqual({ same_host: true });
  });
});

describe("projects.create", () => {
  it("posts FormData to /api/projects/create and returns opened", async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({ opened: "x" }), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    const fd = new FormData();
    fd.set("name", "x"); fd.set("source", "srt");
    const r = await projects.create(fd);
    expect(r).toEqual({ opened: "x" });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/projects/create");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
  });

  it("throws the daemon error message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 409 })));
    await expect(projects.create(new FormData())).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web run test -- client`
Expected: FAIL — `getEnv` / `projects.create(FormData)` signature mismatch.

- [ ] **Step 3: Write minimal implementation**

In `web/src/api/client.ts`, add `getEnv` and replace the `projects.create` entry:

```typescript
export async function getEnv(): Promise<{ same_host: boolean }> {
  return jsonOrThrow<{ same_host: boolean }>(await fetch("/api/env"));
}
```

```typescript
  create: async (form: FormData): Promise<{ opened: string }> => {
    const res = await fetch("/api/projects/create", { method: "POST", body: form });
    return jsonOrThrow<{ opened: string }>(res);
  },
```

(Do not set `Content-Type` — the browser sets the multipart boundary. The old `create(name, lyrics_path)` JSON helper is removed; the modal is the only caller.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix web run test -- client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/api/client.ts web/src/api/client.test.ts
git commit -m "feat(web): client getEnv + projects.create(FormData)"
```

---

### Task 8: Web `CreateProjectModal` component

**Files:**
- Create: `web/src/components/library/CreateProjectModal.tsx`
- Test: `web/src/components/library/CreateProjectModal.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `web/src/components/library/CreateProjectModal.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateProjectModal } from "./CreateProjectModal";
import * as client from "../../api/client";

beforeEach(() => { vi.restoreAllMocks(); });

function setup(envSameHost = false) {
  vi.spyOn(client, "getEnv").mockResolvedValue({ same_host: envSameHost });
  const onCreated = vi.fn();
  const onClose = vi.fn();
  render(<CreateProjectModal onCreated={onCreated} onClose={onClose} />);
  return { onCreated, onClose };
}

describe("CreateProjectModal", () => {
  it("shows Suno advanced options by default and SRT options after switching", async () => {
    setup();
    expect(await screen.findByLabelText(/group by/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    expect(screen.getByLabelText(/line breaks/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/group by/i)).not.toBeInTheDocument();
  });

  it("hides the server-path option when not same-host", async () => {
    setup(false);
    await screen.findByLabelText(/group by/i);
    expect(screen.queryByRole("button", { name: /server path/i })).not.toBeInTheDocument();
  });

  it("shows the server-path option when same-host", async () => {
    setup(true);
    expect(await screen.findByRole("button", { name: /server path/i })).toBeInTheDocument();
  });

  it("shows the N field only for the every-N strategy", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    expect(screen.queryByLabelText(/words per line/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/line breaks/i), { target: { value: "every_n" } });
    expect(screen.getByLabelText(/words per line/i)).toBeInTheDocument();
  });

  it("creates and calls onCreated on success", async () => {
    const { onCreated } = setup(false);
    vi.spyOn(client.projects, "create").mockResolvedValue({ opened: "song" });
    await screen.findByLabelText(/group by/i);
    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "song" } });
    const file = new File(['{"aligned_lyrics":[]}'], "a.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/lyrics file/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("song"));
  });

  it("shows the daemon error inline and stays open", async () => {
    const { onCreated } = setup(false);
    vi.spyOn(client.projects, "create").mockRejectedValue(new Error("name exists"));
    await screen.findByLabelText(/group by/i);
    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "dup" } });
    const file = new File(['{}'], "a.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/lyrics file/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect(await screen.findByText(/name exists/i)).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web run test -- CreateProjectModal`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/components/library/CreateProjectModal.tsx`:

```tsx
import { useEffect, useState } from "react";
import { getEnv, projects } from "../../api/client";

type Source = "suno_json" | "srt";
type Provide = "upload" | "path";
type LineBreak = "none" | "every_n" | "punctuation" | "per_cue";

export function CreateProjectModal({
  onCreated,
  onClose,
}: {
  onCreated: (name: string) => void;
  onClose: () => void;
}) {
  const [sameHost, setSameHost] = useState(false);
  const [name, setName] = useState("");
  const [source, setSource] = useState<Source>("suno_json");

  const [lyricsMode, setLyricsMode] = useState<Provide>("upload");
  const [lyricsFile, setLyricsFile] = useState<File | null>(null);
  const [lyricsPath, setLyricsPath] = useState("");

  const [videoMode, setVideoMode] = useState<Provide>("upload");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPath, setVideoPath] = useState("");

  const [groupBy, setGroupBy] = useState<"section" | "line">("section");
  const [skipDashes, setSkipDashes] = useState(true);
  const [lineBreak, setLineBreak] = useState<LineBreak>("none");
  const [nWords, setNWords] = useState(5);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void getEnv().then((e) => setSameHost(e.same_host)).catch(() => setSameHost(false)); }, []);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("source", source);
      if (lyricsMode === "upload") { if (lyricsFile) fd.set("lyrics_file", lyricsFile); }
      else fd.set("lyrics_path", lyricsPath);
      if (videoMode === "upload") { if (videoFile) fd.set("video_file", videoFile); }
      else if (videoPath) fd.set("video_path", videoPath);
      if (source === "suno_json") { fd.set("group_by", groupBy); fd.set("skip_dashes", String(skipDashes)); }
      else { fd.set("line_break", lineBreak); fd.set("n_words", String(nWords)); }
      const { opened } = await projects.create(fd);
      onCreated(opened);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const ModeSwitch = ({ mode, set }: { mode: Provide; set: (m: Provide) => void }) => (
    <div className="seg2" role="group">
      <button type="button" className={"seg-btn" + (mode === "upload" ? " on" : "")} onClick={() => set("upload")}>Upload</button>
      {sameHost && (
        <button type="button" className={"seg-btn" + (mode === "path" ? " on" : "")} onClick={() => set("path")}>Server path</button>
      )}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal cpm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="ks-h2">New project</h2>
          <button className="btn ghost" onClick={onClose} aria-label="Close">×</button>
        </div>

        <label className="fld">
          <span>Project name</span>
          <input className="text-inp" aria-label="Project name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="fld">
          <span>Source</span>
          <div className="seg2" role="group">
            <button type="button" className={"seg-btn" + (source === "suno_json" ? " on" : "")} onClick={() => setSource("suno_json")}>Suno JSON</button>
            <button type="button" className={"seg-btn" + (source === "srt" ? " on" : "")} onClick={() => setSource("srt")}>SRT</button>
          </div>
        </div>

        <div className="fld">
          <span>Lyrics</span>
          <ModeSwitch mode={lyricsMode} set={setLyricsMode} />
          {lyricsMode === "upload" ? (
            <input type="file" aria-label="Lyrics file" accept={source === "srt" ? ".srt,text/plain" : ".json,application/json"}
                   onChange={(e) => setLyricsFile(e.target.files?.[0] ?? null)} />
          ) : (
            <input className="text-inp" aria-label="Lyrics server path" value={lyricsPath} onChange={(e) => setLyricsPath(e.target.value)} placeholder="/abs/path/to/lyrics" />
          )}
        </div>

        <div className="fld">
          <span>Video (optional)</span>
          <ModeSwitch mode={videoMode} set={setVideoMode} />
          {videoMode === "upload" ? (
            <input type="file" aria-label="Video file" accept="video/*" onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)} />
          ) : (
            <input className="text-inp" aria-label="Video server path" value={videoPath} onChange={(e) => setVideoPath(e.target.value)} placeholder="/abs/path/to/video.mp4" />
          )}
        </div>

        <details className="adv">
          <summary>Advanced</summary>
          {source === "suno_json" ? (
            <>
              <label className="fld">
                <span>Group by</span>
                <select className="combo" aria-label="Group by" value={groupBy} onChange={(e) => setGroupBy(e.target.value as "section" | "line")}>
                  <option value="section">Section</option>
                  <option value="line">Line</option>
                </select>
              </label>
              <label className="fld row">
                <input type="checkbox" checked={skipDashes} onChange={(e) => setSkipDashes(e.target.checked)} />
                <span>Skip dash-only filler lines</span>
              </label>
            </>
          ) : (
            <>
              <label className="fld">
                <span>Line breaks</span>
                <select className="combo" aria-label="Line breaks" value={lineBreak} onChange={(e) => setLineBreak(e.target.value as LineBreak)}>
                  <option value="none">No breaks (single line)</option>
                  <option value="every_n">Every N words</option>
                  <option value="punctuation">On punctuation</option>
                  <option value="per_cue">One line per cue</option>
                </select>
              </label>
              {lineBreak === "every_n" && (
                <label className="fld">
                  <span>Words per line</span>
                  <input className="text-inp" type="number" min={1} aria-label="Words per line" value={nWords} onChange={(e) => setNWords(Math.max(1, Number(e.target.value) || 1))} />
                </label>
              )}
            </>
          )}
        </details>

        {error && <div className="form-err" role="alert">{error}</div>}

        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={() => void submit()} disabled={busy}>Create</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix web run test -- CreateProjectModal`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/library/CreateProjectModal.tsx web/src/components/library/CreateProjectModal.test.tsx
git commit -m "feat(web): CreateProjectModal wizard"
```

---

### Task 9: Wire the modal into `ProjectLibrary` + `App` (replace `onOpen("")`)

**Files:**
- Modify: `web/src/components/library/ProjectLibrary.tsx`, `web/src/App.tsx`
- Test: `web/src/components/library/ProjectLibrary.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `web/src/components/library/ProjectLibrary.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProjectLibrary } from "./ProjectLibrary";
import * as client from "../../api/client";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(client.projects, "list").mockResolvedValue([]);
  vi.spyOn(client, "getEnv").mockResolvedValue({ same_host: false });
});

describe("ProjectLibrary", () => {
  it("opens the create modal instead of calling onOpen('')", async () => {
    const onOpen = vi.fn();
    render(<ProjectLibrary onOpen={onOpen} />);
    fireEvent.click(screen.getAllByRole("button", { name: /new project/i })[0]);
    await waitFor(() => expect(screen.getByRole("heading", { name: /new project/i })).toBeInTheDocument());
    expect(onOpen).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix web run test -- ProjectLibrary`
Expected: FAIL — no modal opens; `onOpen("")` is called.

- [ ] **Step 3: Write minimal implementation**

In `web/src/components/library/ProjectLibrary.tsx`:
- Add `import { CreateProjectModal } from "./CreateProjectModal";` and `useState` for `creating`.
- Replace both `onClick={() => onOpen("")}` with `onClick={() => setCreating(true)}`.
- Render the modal when `creating`, wiring success to open the new project:

```tsx
export function ProjectLibrary({ onOpen }: { onOpen: (name: string) => void }) {
  const [names, setNames] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void projects.list().then(setNames).catch(() => setNames([]));
  }, []);
  // ... unchanged markup, with both "New project" controls calling setCreating(true) ...
```

At the end, before the final closing `</div>`:

```tsx
      {creating && (
        <CreateProjectModal
          onClose={() => setCreating(false)}
          onCreated={(name) => { setCreating(false); onOpen(name); }}
        />
      )}
```

(`App.tsx` needs no change: `onOpen(name)` already calls `projects.open(name)` then shows the editor. The daemon already opened the project during create; a redundant `open` is harmless and keeps the single open path.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix web run test -- ProjectLibrary`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/library/ProjectLibrary.tsx web/src/components/library/ProjectLibrary.test.tsx
git commit -m "feat(web): open CreateProjectModal from the library (fix new-project bug)"
```

---

### Task 10: Modal styling

**Files:**
- Modify: `web/src/theme.css`

- [ ] **Step 1: Check which classes already exist**

Run: `grep -nE "\.modal|\.seg2|\.seg-btn|\.fld|\.form-err|\.combo|\.text-inp|\.adv|\.cpm" web/src/theme.css`
Expected: note which of `.modal-overlay`, `.modal`, `.modal-head`, `.modal-foot`, `.cpm`, `.fld`, `.seg2`, `.seg-btn`, `.form-err`, `.adv` already exist (`.text-inp`/`.combo`/`.seg2` likely exist from v3). Only add the missing ones.

- [ ] **Step 2: Add the missing modal styles**

Append to `web/src/theme.css` (omit any rule whose selector already exists; adapt tokens to the existing palette variables):

```css
/* Create-project modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.55);
  display: flex; align-items: center; justify-content: center; z-index: 50; }
.modal { background: var(--surface-1, #15151c); border: 1px solid var(--line, #2a2a35);
  border-radius: 14px; padding: 20px; width: min(460px, 92vw); max-height: 88vh; overflow: auto;
  box-shadow: 0 24px 80px rgba(0,0,0,.5); }
.modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.cpm .fld { display: flex; flex-direction: column; gap: 6px; margin: 12px 0; }
.cpm .fld > span { font-size: 12px; color: var(--text-3, #9aa); }
.cpm .fld.row { flex-direction: row; align-items: center; gap: 8px; }
.cpm .adv { margin-top: 8px; border-top: 1px solid var(--line, #2a2a35); padding-top: 8px; }
.cpm .adv > summary { cursor: pointer; font-size: 13px; color: var(--text-2, #ccd); }
.seg2 { display: inline-flex; border: 1px solid var(--line, #2a2a35); border-radius: 8px; overflow: hidden; }
.seg2 .seg-btn { background: transparent; border: 0; color: var(--text-2, #ccd); padding: 6px 12px; cursor: pointer; }
.seg2 .seg-btn.on { background: var(--accent, #FF3DA6); color: #fff; }
.form-err { background: rgba(255,61,61,.12); border: 1px solid rgba(255,61,61,.5);
  color: #ffb4b4; border-radius: 8px; padding: 8px 10px; font-size: 13px; margin-top: 8px; }
```

- [ ] **Step 3: Verify the web build + full web suite**

Run: `npm --prefix web run build && npm --prefix web run test`
Expected: build succeeds; all web tests pass.

- [ ] **Step 4: Commit**

```bash
git add web/src/theme.css
git commit -m "style(web): create-project modal CSS"
```

---

### Task 11: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run all Python headless + daemon suites**

Run:
```bash
for f in tests/test_srt.py tests/test_library_create.py tests/test_daemon_projects.py \
         tests/test_daemon.py tests/test_engine.py tests/test_engine_model.py \
         tests/test_engine_build_io.py tests/test_engine_mutations.py \
         tests/test_mcp.py tests/test_mcp_server.py; do
  echo "== $f =="; .venv/bin/python "$f" || break
done
```
Expected: every suite prints `N/N passed` and exits 0.

- [ ] **Step 2: Run the full web suite + build**

Run: `npm --prefix web run test && npm --prefix web run build`
Expected: all green; build succeeds.

- [ ] **Step 3: Manual smoke (live daemon + Vite), then dispatch the final reviewer**

Start the daemon + Vite, open the library, click **New project**, create from a Suno JSON upload and from an SRT upload (try each line-break strategy), confirm the editor opens and the cues timeline reflects the chosen layout. Then dispatch the final code review for the whole branch.

- [ ] **Step 4: Tk UI suites (batched, per project convention)**

Run on the display: `DISPLAY=:1 .venv/bin/python tests/test_v2_ui.py` (and the other `tests/test_ui_*.py`). These are unaffected by this change; run once at the end.

---

## Self-Review Notes

- **Spec coverage:** `/api/env` (T5), `create_project` + both endpoints + `/new` shim (T4, T6), `engine/srt.py` split→share-timing→strategies + make_project round-trip (T1–T3), video reference-vs-copy + persistence (T4), modal with source-dependent advanced + same-host gating + inline errors (T8), library/App wiring replacing `onOpen("")` (T9), styling (T10), test matrix (all tasks + T11). ✅
- **Type/name consistency:** `line_break` values `none|every_n|punctuation|per_cue`; `source` values `suno_json|srt`; `create_project` keyword names match the daemon form keys and the modal `FormData` keys. ✅
- **No placeholders.** ✅
