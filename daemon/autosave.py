# daemon/autosave.py — debounced autosave of the open project after each change.
# The web/MCP clients never call /api/projects/save explicitly; without this,
# every edit lived only in daemon memory and re-opening a project lost it.
import threading
from daemon import library


class Autosaver:
    def __init__(self, ctx, projects_dir, delay=0.4):
        self.ctx, self.projects_dir, self.delay = ctx, projects_dir, delay
        self.name = None
        self._timer = None
        self._lock = threading.Lock()

    def bind(self, name):
        """Attach to the currently open project (None = nothing to save)."""
        with self._lock:
            if self._timer:
                self._timer.cancel()
                self._timer = None
            self.name = name

    def schedule(self):
        """Debounce: (re)start the save timer on every change."""
        if not self.name:
            return
        with self._lock:
            if self._timer:
                self._timer.cancel()
            self._timer = threading.Timer(self.delay, self._save)
            self._timer.daemon = True
            self._timer.start()

    def _save(self):
        name = self.name
        if not name:
            return
        try:
            library.save_project(self.ctx, self.projects_dir, name)
        except Exception:
            pass  # autosave must never take the daemon down
