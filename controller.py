# controller.py — UI-free session: project + undo/redo + change notification.
import copy
from engine import mutations
from engine.render import project_to_render

class Session:
    def __init__(self, project=None, on_change=None, aux_get=None, aux_set=None):
        self.project = project
        self.on_change = on_change      # callable(); fired after every applied edit
        # Optional auxiliary-state hooks. When both are set, each undo snapshot
        # also captures aux_get() and undo/redo restore it via aux_set(). When
        # left None (the default), behavior is byte-identical to the old Session.
        self.aux_get = aux_get          # callable() -> snapshotable aux state
        self.aux_set = aux_set          # callable(state) -> restore aux state
        self._undo, self._redo = [], []

    def _snap_aux(self):
        return copy.deepcopy(self.aux_get()) if self.aux_get else None

    def _restore_aux(self, aux):
        if self.aux_set is not None:
            self.aux_set(copy.deepcopy(aux))

    def set_project(self, project):
        self.project = project
        self._undo, self._redo = [], []
        self._fire()

    def render(self):
        return project_to_render(self.project) if self.project else []

    def can_undo(self):
        return bool(self._undo)

    def can_redo(self):
        return bool(self._redo)

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
        aux_snap = self._snap_aux()
        rv = getattr(mutations, fn_name)(self.project, *args, **kw)
        if rv is False or snap == self.project:
            return rv                      # no-op / rejected: don't disturb undo/redo
        self._push_undo(snap, aux_snap)
        self._fire()
        return rv

    def record(self, mutate):
        """Record an auxiliary-state edit onto the shared undo timeline. Snapshots
        project + aux, runs mutate() (which should change aux via the registered
        hook), and pushes a history step iff aux actually changed. No-ops leave
        the stacks untouched. Requires aux hooks to be registered."""
        if self.aux_get is None or self.aux_set is None:
            mutate(); return
        before = self._snap_aux()
        proj_snap = copy.deepcopy(self.project) if self.project is not None else None
        mutate()
        if self.aux_get() == before:
            return                          # no-op: don't disturb undo/redo
        self._push_undo(proj_snap, before)
        self._fire()

    def _push_undo(self, proj_snap, aux_snap):
        self._undo.append((proj_snap, aux_snap))
        if len(self._undo) > 100:
            self._undo.pop(0)
        self._redo.clear()

    def undo(self):
        if self._undo:
            self._redo.append((copy.deepcopy(self.project), self._snap_aux()))
            proj, aux = self._undo.pop()
            self.project = proj; self._restore_aux(aux); self._fire()

    def redo(self):
        if self._redo:
            self._undo.append((copy.deepcopy(self.project), self._snap_aux()))
            proj, aux = self._redo.pop()
            self.project = proj; self._restore_aux(aux); self._fire()
