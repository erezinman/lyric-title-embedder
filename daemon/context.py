# daemon/context.py — synchronous EngineContext whose Session change pushes state to /ws.
from mcp_server.context import HeadlessContext

class DaemonContext(HeadlessContext):
    def __init__(self, hub):
        super().__init__()                  # standalone Session + dict globals (no Tk)
        self.hub = hub
        self.after_change = None             # optional hook (e.g. autosave), called after broadcast
        self.session.on_change = self._fire  # wire change -> broadcast

    def _fire(self):
        from mcp_server import tools
        try:
            state = tools.get_project(self)
        except Exception:
            return
        self.hub.schedule({"type": "state", "state": state})
        if self.after_change:
            self.after_change()

    # set_globals is inherited: HeadlessContext routes it through session.record,
    # which fires session.on_change (== self._fire) on a real change, so the WS
    # push happens automatically. undo/redo also fire on_change -> broadcast the
    # reverted globals (get_project reads ctx.get_globals()).
