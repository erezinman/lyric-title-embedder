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

class UIContext(EngineContext):
    """Binds to a live AppV2.  All ops are marshaled onto the Tk main loop via
    a thread-safe queue that is drained by a periodic after() poll installed at
    construction time (which always happens on the main thread)."""
    _POLL_MS = 10   # drain interval in milliseconds

    def __init__(self, app):
        self.app = app
        self.session = app._session
        self._q = queue.SimpleQueue()
        self._closed = False
        self._poll_id = None
        self._start_poll()

    def _start_poll(self):
        """Install a recurring after() drain on the main thread."""
        def drain():
            if self._closed:
                return
            while True:
                try:
                    task = self._q.get_nowait()
                except queue.Empty:
                    break
                task()
            try:
                self._poll_id = self.app.after(self._POLL_MS, drain)
            except Exception:
                pass
        self._poll_id = self.app.after(0, drain)

    def close(self):
        """Cancel the poll loop so no after() callbacks fire after app.destroy()."""
        self._closed = True
        try:
            self.app.after_cancel(self._poll_id)
        except Exception:
            pass

    def run(self, fn, timeout=15.0):
        """Schedule fn on the Tk main loop and return its result (blocks caller)."""
        # Fast path: if already on the main Tk thread, call directly.
        import threading as _t
        if _t.current_thread() is _t.main_thread():
            return fn()
        box = {}; ev = _t.Event()
        def task():
            try: box["r"] = fn()
            except BaseException as e: box["e"] = e
            finally: ev.set()
        self._q.put(task)
        if not ev.wait(timeout):
            raise TimeoutError("MCP op timed out waiting for the UI main loop")
        if "e" in box: raise box["e"]
        return box.get("r")
    def video_path(self): return self.run(lambda: self.app.vid_var.get() or None)
    def video_meta(self):
        # The Tk app stores only a path string; probe on demand so the daemon-style
        # `video` object (path + w/h/duration) is available to MCP/web clients too.
        p = self.video_path()
        if not p:
            return None
        import engine
        meta = engine.ffmpeg.probe_video(p) or {"w": None, "h": None, "duration_s": None}
        return {"path": p, "w": meta.get("w"), "h": meta.get("h"),
                "duration_s": meta.get("duration_s")}
    def cfg(self): return self.run(lambda: self.app.cfg())
    def fonts(self):
        return core.list_font_families()
    def get_globals(self):
        def read():
            from core import ALIGN_LABELS
            a = self.app
            return {"font": a.font_var.get(), "fontsize": a.size_var.get(), "bold": a.bold_var.get(),
                    "align": ALIGN_LABELS[a.align_var.get()], "primary": a._color["primary"],
                    "outline": a._color["outline"], "back": a._color["back"],
                    "back_alpha": a.backa_var.get(), "border_style": a.border_var.get(),
                    "outline_w": a.outline_var.get(), "shadow": a.shadow_var.get(),
                    "play_w": a.pw_var.get(), "play_h": a.ph_var.get(),
                    "margin_l": a.ml_var.get(), "margin_r": a.mr_var.get(), "margin_v": a.mv_var.get(),
                    "use_pos": a.pos_var.get()}
        return self.run(read)
    def set_globals(self, partial):
        def write():
            from core import ALIGN_LABELS
            a = self.app
            inv = {v: k for k, v in ALIGN_LABELS.items()}
            m = {"font": a.font_var, "fontsize": a.size_var, "bold": a.bold_var,
                 "back_alpha": a.backa_var, "border_style": a.border_var, "outline_w": a.outline_var,
                 "shadow": a.shadow_var, "play_w": a.pw_var, "play_h": a.ph_var,
                 "margin_l": a.ml_var, "margin_r": a.mr_var, "margin_v": a.mv_var,
                 "use_pos": a.pos_var}
            for k, v in partial.items():
                if k in m: m[k].set(v)
                elif k in ("primary", "outline", "back"): a._color[k] = v
                elif k == "align" and v in inv: a.align_var.set(inv[v])
            if any(k in ("play_w", "play_h") for k in partial): a._resync_canvas()
            a._rebuild_render()
        return self.run(write)
