# mcp_server/context.py — mode-aware bridge. No `mcp`, no tkinter at import time.
import queue
import core
import engine
import controller

DEFAULT_GLOBALS = {
    "font": "DejaVu Sans", "fontsize": 64, "bold": True, "italic": False, "underline": False,
    "align": 2,
    "primary_color": "#FFFFFF", "outline_color": "#000000", "back_color": "#000000",
    "back_alpha": "80", "border_style": 1, "outline_w": 3, "shadow": 0,
    "play_w": 1920, "play_h": 1080, "margin_l": 80, "margin_r": 80, "margin_v": 60,
    "use_pos": True,
    "text_direction": "auto", "bidi_marks": True,
}
GLOBAL_KEYS = ["font", "fontsize", "bold", "italic", "underline", "align", "primary", "outline", "back",
               "back_alpha", "border_style", "outline_w", "shadow", "play_w", "play_h",
               "margin_l", "margin_r", "margin_v", "use_pos", "pos",
               "text_direction", "bidi_marks"]

TEXT_DIRECTIONS = ("auto", "ltr", "rtl")

class EngineContext:
    session = None
    def run(self, fn): raise NotImplementedError
    def get_globals(self): raise NotImplementedError
    def set_globals(self, partial): raise NotImplementedError
    def cfg(self): raise NotImplementedError
    def video_path(self): return None
    def video_meta(self): return None
    def fonts(self): return core.list_font_families()
    def fonts_dir(self): return None

class HeadlessContext(EngineContext):
    def __init__(self):
        self._g = dict(DEFAULT_GLOBALS)
        self._g["primary"] = self._g.pop("primary_color")
        self._g["outline"] = self._g.pop("outline_color")
        self._g["back"] = self._g.pop("back_color")
        self._g["pos"] = None
        # Register _g as the session's auxiliary state so set_globals edits
        # (align/margins/pos/use_pos/style) join the shared undo timeline.
        self._video = None
        # Open project's fonts dir (set by daemon.library on create/open). Burn/frame
        # pass it to libass via :fontsdir so uploaded families resolve at render.
        self._fonts_dir = None
        self.session = controller.Session(aux_get=self._aux_get, aux_set=self._aux_set)
    # Auxiliary undo state = global style/placement (_g) PLUS the input video path.
    # Bundling video into the snapshot makes set_video undoable and lets it ride the
    # shared timeline (and, in the daemon, broadcast + autosave) like a globals edit.
    def _aux_get(self): return {"g": self._g, "video": self._video}
    def _aux_set(self, aux): self._g = aux["g"]; self._video = aux["video"]
    def run(self, fn): return fn()
    def get_globals(self): return dict(self._g)
    def set_globals(self, partial):
        if "text_direction" in partial and partial["text_direction"] not in TEXT_DIRECTIONS:
            raise ValueError(f"invalid text_direction {partial['text_direction']!r}; "
                             f"expected one of {TEXT_DIRECTIONS}")
        def apply():
            for k, v in partial.items():
                if k in GLOBAL_KEYS: self._g[k] = v
        self.session.record(apply)
    def set_video(self, path):
        # Probe outside the recorded apply() so the undo snapshot captures the
        # already-resolved meta dict (probe failure degrades to path + null meta).
        if path:
            import engine
            meta = engine.ffmpeg.probe_video(path) or {"w": None, "h": None, "duration_s": None}
            video = {"path": path, "w": meta.get("w"), "h": meta.get("h"),
                     "duration_s": meta.get("duration_s")}
        else:
            video = None
        def apply(): self._video = video
        self.session.record(apply)
    def set_fonts_dir(self, path):
        # Not undoable: a fonts dir is bound to the open project folder, not project
        # content. The dir need not exist yet (lazily created on first upload).
        self._fonts_dir = path
    def fonts_dir(self):
        return self._fonts_dir
    def video_path(self):
        return self._video["path"] if self._video else None
    def video_meta(self):
        # Full {path, w, h, duration_s} dict (or None). get_project surfaces this as
        # the `video` field; video_path() stays the bare path for burn/frame/library.
        return dict(self._video) if self._video else None
    def cfg(self):
        g = self._g
        c = {"font": g["font"], "fontsize": g["fontsize"], "bold": g["bold"],
             "italic": g.get("italic", False), "underline": g.get("underline", False),
             "align": g["align"],
             "play_w": g["play_w"], "play_h": g["play_h"],
             "margin_l": g["margin_l"], "margin_r": g["margin_r"], "margin_v": g["margin_v"],
             "primary_color": g["primary"], "outline_color": g["outline"], "back_color": g["back"],
             "back_alpha": g["back_alpha"], "border_style": g["border_style"],
             "outline_w": g["outline_w"], "shadow": g["shadow"],
             "text_direction": g.get("text_direction", "auto"),
             "bidi_marks": g.get("bidi_marks", True)}
        if g.get("use_pos") and g.get("pos"): c["pos"] = g["pos"]
        return c
    def load_lyrics(self, json_path, group_by="section", skip_dashes=True):
        p = engine.make_project({"json_path": json_path, "group_by": group_by,
                                 "skip_dashes": skip_dashes})
        self.session.set_project(p); return p
