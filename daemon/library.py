# daemon/library.py — self-contained project folders: <dir>/<name>/lyrics.json + project.json
import json, os, shutil
import engine

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
        save_project(ctx, projects_dir, name)
        return name
    except Exception:
        shutil.rmtree(folder, ignore_errors=True)
        raise


def list_projects(projects_dir):
    if not os.path.isdir(projects_dir):
        return []
    return sorted(n for n in os.listdir(projects_dir)
                  if os.path.isfile(os.path.join(projects_dir, n, "project.json")))

def open_project(ctx, projects_dir, name):
    name = _safe(name)
    folder = os.path.join(projects_dir, name)
    ctx.load_lyrics(os.path.join(folder, "lyrics.json"))
    pj = os.path.join(folder, "project.json")
    if os.path.isfile(pj):
        with open(pj, encoding="utf-8") as fh:
            d = json.load(fh)
        if d.get("globals_style"):
            ctx.set_globals(d["globals_style"])
        engine.apply_cues(ctx.session.project, d.get("cues_v2") or {})
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
    with open(os.path.join(folder, "project.json"), "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=2)
