# daemon/library.py — self-contained project folders: <dir>/<name>/lyrics.json + project.json
import json, os, shutil, tempfile
from urllib.parse import quote
import engine

FONT_EXTS = (".ttf", ".otf", ".woff", ".woff2")


def fonts_dir(folder):
    """Per-project fonts directory (<project>/fonts). Not created here."""
    return os.path.join(folder, "fonts")


def _font_family_from_name(filename):
    """Family name derived per HANDOFF: basename, extension stripped, _ -> space."""
    base = os.path.splitext(os.path.basename(filename))[0]
    return base.replace("_", " ").strip()


def _font_url(family):
    return "/api/fonts/file/" + quote(family)


def save_font(folder, data, filename, family=None):
    """Save an uploaded font into <project>/fonts/<family><ext>. Accepts
    .ttf/.otf/.woff/.woff2 (case-insensitive). Family defaults to the filename
    (ext stripped, _->space). Returns (family, url)."""
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in FONT_EXTS:
        raise ValueError(f"unsupported font type {ext!r}; allowed: {', '.join(FONT_EXTS)}")
    fam = (family or _font_family_from_name(filename)).strip()
    if not fam or "/" in fam or "\\" in fam or fam in (".", ".."):
        raise ValueError(f"invalid font family {fam!r}")
    fdir = fonts_dir(folder)
    os.makedirs(fdir, exist_ok=True)
    # one file per family; a re-upload of the same family replaces it (drop stale exts)
    for ex in FONT_EXTS:
        old = os.path.join(fdir, fam + ex)
        if os.path.isfile(old):
            os.remove(old)
    with open(os.path.join(fdir, fam + ext), "wb") as fh:
        fh.write(data)
    return fam, _font_url(fam)


def list_custom_fonts(folder):
    """List the project's uploaded fonts as [{family, url, ext}], sorted by family."""
    fdir = fonts_dir(folder)
    if not os.path.isdir(fdir):
        return []
    out = []
    for n in os.listdir(fdir):
        base, ext = os.path.splitext(n)
        if ext.lower() in FONT_EXTS and os.path.isfile(os.path.join(fdir, n)):
            out.append({"family": base, "url": _font_url(base), "ext": ext.lower()})
    return sorted(out, key=lambda f: f["family"].lower())


def font_file_path(folder, family):
    """Absolute path of the stored file for `family`, or None if not present."""
    if not family or "/" in family or "\\" in family or family in (".", ".."):
        return None
    fdir = fonts_dir(folder)
    for ex in FONT_EXTS:
        p = os.path.join(fdir, family + ex)
        if os.path.isfile(p):
            return p
    return None


def delete_font(folder, family):
    """Remove the stored file for `family`. Returns True if something was removed."""
    p = font_file_path(folder, family)
    if p:
        os.remove(p)
        return True
    return False

def _safe(name):
    if not name or name != os.path.basename(name) or name in (".", "..") or "/" in name or "\\" in name:
        raise ValueError(f"invalid project name {name!r}")
    return name

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
    if lyrics_bytes is None and not lyrics_path:
        raise ValueError("provide a lyrics file or a server-side lyrics path")
    if lyrics_bytes is None and not os.path.isfile(lyrics_path):
        raise ValueError(f"lyrics path not found: {lyrics_path}")
    cues = None
    if source == "suno_json":
        if lyrics_bytes is None:
            with open(lyrics_path, "rb") as fh:
                lyrics_bytes = fh.read()
        try:
            lyrics_doc = json.loads(lyrics_bytes.decode("utf-8"))
        except Exception as e:
            raise ValueError(f"lyrics is not valid JSON: {e}")
        if not isinstance(lyrics_doc.get("aligned_lyrics"), list) or not lyrics_doc["aligned_lyrics"]:
            raise ValueError("JSON has no non-empty 'aligned_lyrics'")
    elif source == "srt":
        if lyrics_bytes is None:
            with open(lyrics_path, encoding="utf-8") as fh:
                text = fh.read()
        else:
            text = lyrics_bytes.decode("utf-8")
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

        if source == "srt":
            # Every SRT atom must survive: dash-skipping and grouping are
            # Suno-only options, and build_srt_layout's cue_word_counts assume
            # the full word list (dropped atoms would shift/overflow token ids).
            ctx.load_lyrics(os.path.join(folder, "lyrics.json"), skip_dashes=False)
            proj = ctx.session.project
            proj["layout"] = engine.srt.build_srt_layout(
                proj["words"], line_break=line_break, n_words=n_words,
                cue_word_counts=[len(c.words) for c in cues])
            ctx.session.set_project(proj)
        else:
            ctx.load_lyrics(os.path.join(folder, "lyrics.json"),
                            group_by=group_by, skip_dashes=skip_dashes)
        if vpath:
            ctx.set_video(vpath)
        _bind_fonts_dir(ctx, folder)
        save_project(ctx, projects_dir, name)
        return name
    except Exception:
        shutil.rmtree(folder, ignore_errors=True)
        raise


def set_project_video(ctx, projects_dir, name, *, video_bytes=None, video_path=None,
                      video_name=None):
    """Attach/swap/clear the video on an already-open project AFTER creation.
    Mirrors create_project's media handling: uploaded bytes are saved into the
    project folder as video<ext>; a server-side path is validated + stored absolute;
    clear (no bytes, no path) detaches. Calls ctx.set_video (which probes + rides the
    undo/broadcast/autosave timeline) and re-saves project.json. Returns the stored
    video meta dict (or None)."""
    name = _safe(name)
    folder = os.path.join(projects_dir, name)
    if not os.path.isdir(folder):
        raise ValueError(f"project not found: {name}")
    if video_bytes is not None:
        ext = os.path.splitext(video_name or "video.mp4")[1] or ".mp4"
        vpath = os.path.join(folder, "video" + ext)
        with open(vpath, "wb") as fh:
            fh.write(video_bytes)
    elif video_path:
        if not os.path.isfile(video_path):
            raise ValueError(f"video path not found: {video_path}")
        vpath = os.path.abspath(video_path)
    else:
        vpath = None
    ctx.set_video(vpath)
    save_project(ctx, projects_dir, name)
    return ctx.video_meta()


def list_projects(projects_dir):
    if not os.path.isdir(projects_dir):
        return []
    return sorted(n for n in os.listdir(projects_dir)
                  if os.path.isfile(os.path.join(projects_dir, n, "project.json")))

def _bind_fonts_dir(ctx, folder):
    """Point the context at this project's fonts dir (for burn/frame :fontsdir).
    No-op on contexts without the hook."""
    if hasattr(ctx, "set_fonts_dir"):
        ctx.set_fonts_dir(fonts_dir(folder))


def open_project(ctx, projects_dir, name):
    name = _safe(name)
    folder = os.path.join(projects_dir, name)
    _bind_fonts_dir(ctx, folder)
    ctx.load_lyrics(os.path.join(folder, "lyrics.json"))
    pj = os.path.join(folder, "project.json")
    if os.path.isfile(pj):
        with open(pj, encoding="utf-8") as fh:
            d = json.load(fh)
        if d.get("globals_style"):
            ctx.set_globals(d["globals_style"])
        engine.apply_cues(ctx.session.project, d.get("cues_v2") or {})
        # Legacy projects auto-convert to the animation model on open (idempotent).
        engine.migrate_project(ctx.session.project)
        v = d.get("video")
        if v:
            ctx.set_video(v if os.path.isabs(v) else os.path.join(folder, v))
        ctx.session.set_project(ctx.session.project)   # fire on_change / reset undo

def save_project(ctx, projects_dir, name):
    name = _safe(name)
    folder = os.path.join(projects_dir, name); os.makedirs(folder, exist_ok=True)
    doc = {"globals_style": ctx.get_globals(),
           "cues_v2": engine.serialize_cues(ctx.session.project),
           "video": _video_field(folder, ctx.video_path())}
    # Atomic write: a concurrent reader (e.g. a polling client/test) must never see a
    # half-written project.json. Write a temp file in the same dir, then rename.
    dest = os.path.join(folder, "project.json")
    fd, tmp = tempfile.mkstemp(dir=folder, prefix=".project.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(doc, fh, indent=2)
        os.replace(tmp, dest)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
