# daemon/hub.py — WebSocket client registry + thread-safe broadcast scheduling.
import asyncio

class Hub:
    def __init__(self):
        self._clients = set()      # set of starlette WebSocket
        self._loop = None          # bound at app startup (lifespan)

    def bind_loop(self, loop):
        self._loop = loop

    def register(self, ws):
        self._clients.add(ws)

    def unregister(self, ws):
        self._clients.discard(ws)

    def schedule(self, msg):
        """Sync, callable from any thread (on_change fires synchronously inside a
        mutation). Hop to the event loop and fire-and-forget the async broadcast."""
        loop = self._loop
        if loop is None:
            return
        loop.call_soon_threadsafe(lambda: asyncio.ensure_future(self.broadcast(msg)))

    async def broadcast(self, msg):
        dead = []
        for ws in list(self._clients):
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._clients.discard(ws)
