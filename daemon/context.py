# daemon/context.py — synchronous EngineContext whose Session change pushes state to /ws.
from mcp_server.context import HeadlessContext

class DaemonContext(HeadlessContext):
    def __init__(self, hub):
        super().__init__()                  # standalone Session + dict globals (no Tk)
        self.hub = hub
        self.session.on_change = self._fire  # wire change -> broadcast

    def _fire(self):
        from mcp_server import tools
        try:
            state = tools.get_state(self)
        except Exception:
            return
        self.hub.schedule({"type": "state", "state": state})
