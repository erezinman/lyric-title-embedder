# daemon/library.py — self-contained project folders: <dir>/<name>/lyrics.json + project.json
import json, os, shutil
import engine

def _safe(name):
    if not name or name != os.path.basename(name) or name in (".", "..") or "/" in name or "\\" in name:
        raise ValueError(f"invalid project name {name!r}")
    return name

def list_projects(projects_dir):
    if not os.path.isdir(projects_dir):
        return []
    return sorted(n for n in os.listdir(projects_dir)
                  if os.path.isfile(os.path.join(projects_dir, n, "project.json")))

def new_project(projects_dir, name, lyrics_path):
    name = _safe(name)
    dst = os.path.join(projects_dir, name); os.makedirs(dst, exist_ok=True)
    shutil.copyfile(lyrics_path, os.path.join(dst, "lyrics.json"))

def open_project(ctx, projects_dir, name):
    name = _safe(name)
    folder = os.path.join(projects_dir, name)
    ctx.load_lyrics(os.path.join(folder, "lyrics.json"))
    pj = os.path.join(folder, "project.json")
    if os.path.isfile(pj):
        d = json.load(open(pj, encoding="utf-8"))
        if d.get("globals_style"):
            ctx.set_globals(d["globals_style"])
        engine.apply_cues(ctx.session.project, d.get("cues_v2") or {})
        ctx.session.set_project(ctx.session.project)   # fire on_change / reset undo

def save_project(ctx, projects_dir, name):
    name = _safe(name)
    folder = os.path.join(projects_dir, name); os.makedirs(folder, exist_ok=True)
    doc = {"globals_style": ctx.get_globals(), "cues_v2": engine.serialize_cues(ctx.session.project)}
    with open(os.path.join(folder, "project.json"), "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=2)
