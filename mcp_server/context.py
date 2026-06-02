# mcp_server/context.py — mode-aware bridge. No `mcp`, no tkinter at import time.
import threading
import core
import engine
import controller

DEFAULT_GLOBALS = {
    "font": "DejaVu Sans", "fontsize": 64, "bold": True, "align": 2,
    "primary_color": "#FFFFFF", "outline_color": "#000000", "back_color": "#000000",
    "back_alpha": "80", "border_style": 1, "outline_w": 3, "shadow": 0,
    "play_w": 1920, "play_h": 1080, "margin_l": 80, "margin_r": 80, "margin_v": 60,
    "fade_ms": 250, "wrap_style": 2, "use_pos": True,
}
GLOBAL_KEYS = ["font", "fontsize", "bold", "align", "primary", "outline", "back",
               "back_alpha", "border_style", "outline_w", "shadow", "play_w", "play_h",
               "margin_l", "margin_r", "margin_v", "fade_ms", "use_pos", "pos"]

def run_on_main(app, fn, timeout=15.0):
    box = {}; ev = threading.Event()
    def task():
        try: box["r"] = fn()
        except BaseException as e: box["e"] = e
        finally: ev.set()
    app.after(0, task)
    if not ev.wait(timeout):
        raise TimeoutError("MCP op timed out waiting for the UI main loop")
    if "e" in box: raise box["e"]
    return box.get("r")

class EngineContext:
    session = None
    def run(self, fn): raise NotImplementedError
    def get_globals(self): raise NotImplementedError
    def set_globals(self, partial): raise NotImplementedError
    def cfg(self): raise NotImplementedError
    def video_path(self): return None
    def fonts(self): return core.list_font_families()

class HeadlessContext(EngineContext):
    def __init__(self):
        self.session = controller.Session()
        self._g = dict(DEFAULT_GLOBALS)
        self._g["primary"] = self._g.pop("primary_color")
        self._g["outline"] = self._g.pop("outline_color")
        self._g["back"] = self._g.pop("back_color")
        self._g["pos"] = None
        self._video = None
    def run(self, fn): return fn()
    def get_globals(self): return dict(self._g)
    def set_globals(self, partial):
        for k, v in partial.items():
            if k in GLOBAL_KEYS: self._g[k] = v
    def set_video(self, path): self._video = path or None
    def video_path(self): return self._video
    def cfg(self):
        g = self._g
        c = {"font": g["font"], "fontsize": g["fontsize"], "bold": g["bold"], "align": g["align"],
             "fade_ms": g["fade_ms"], "play_w": g["play_w"], "play_h": g["play_h"],
             "margin_l": g["margin_l"], "margin_r": g["margin_r"], "margin_v": g["margin_v"],
             "primary_color": g["primary"], "outline_color": g["outline"], "back_color": g["back"],
             "back_alpha": g["back_alpha"], "border_style": g["border_style"],
             "outline_w": g["outline_w"], "shadow": g["shadow"], "wrap_style": g["wrap_style"]}
        if g.get("use_pos") and g.get("pos"): c["pos"] = g["pos"]
        return c
    def load_lyrics(self, json_path, group_by="section", skip_dashes=True):
        p = engine.make_project({"json_path": json_path, "group_by": group_by,
                                 "skip_dashes": skip_dashes})
        self.session.set_project(p); return p
