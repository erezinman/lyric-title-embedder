# controller.py — UI-free session: project + undo/redo + change notification.
import copy
from engine import mutations
from engine.render import project_to_render

class Session:
    def __init__(self, project=None, on_change=None):
        self.project = project
        self.on_change = on_change      # callable(); fired after every applied edit
        self._undo, self._redo = [], []

    def set_project(self, project):
        self.project = project
        self._undo, self._redo = [], []
        self._fire()

    def render(self):
        return project_to_render(self.project) if self.project else []

    def _fire(self):
        if self.on_change:
            self.on_change()

    def do(self, fn_name, *args, **kw):
        """Snapshot, apply engine.mutations.<fn_name>, fire change. Returns the
        mutation's return value. No-ops / rejections (rv is False or project
        unchanged) leave the undo/redo stacks untouched and do not fire."""
        if self.project is None:
            return None
        snap = copy.deepcopy(self.project)
        rv = getattr(mutations, fn_name)(self.project, *args, **kw)
        if rv is False or snap == self.project:
            return rv                      # no-op / rejected: don't disturb undo/redo
        self._undo.append(snap)
        if len(self._undo) > 100:
            self._undo.pop(0)
        self._redo.clear()
        self._fire()
        return rv

    def undo(self):
        if self._undo:
            self._redo.append(copy.deepcopy(self.project))
            self.project = self._undo.pop(); self._fire()

    def redo(self):
        if self._redo:
            self._undo.append(copy.deepcopy(self.project))
            self.project = self._redo.pop(); self._fire()
