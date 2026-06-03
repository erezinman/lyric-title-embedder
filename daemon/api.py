# daemon/api.py — Starlette handlers over a DaemonContext + Hub. Imports starlette only.
from starlette.responses import JSONResponse, Response
from mcp_server import tools

def _err(msg, code=400):
    return JSONResponse({"error": msg}, status_code=code)

def make_routes(ctx, hub):
    async def call(request):
        body = await request.json()
        name = body.get("tool"); args = body.get("args") or {}
        fn = getattr(tools, name, None)
        if name is None or fn is None or name.startswith("_"):
            return _err(f"unknown tool {name!r}")
        try:
            return JSONResponse({"result": fn(ctx, **args)})
        except TypeError as e:
            return _err(f"bad args for {name}: {e}")
        except Exception as e:
            return _err(f"{type(e).__name__}: {e}", 422)

    async def state(request):  return JSONResponse(tools.get_state(ctx))
    async def render(request): return JSONResponse(tools.get_render(ctx))
    async def ass(request):    return Response(tools.get_ass(ctx), media_type="text/plain")

    async def ws_endpoint(websocket):
        import asyncio as _asyncio
        # Lazy loop bind: the ws handler runs in the event loop, so we can always
        # bind here. This covers TestClient (no lifespan) and prod startup alike.
        hub.bind_loop(_asyncio.get_running_loop())
        await websocket.accept()
        hub.register(websocket)
        try:
            await websocket.send_json({"type": "state", "state": tools.get_state(ctx)})
            while True:
                await websocket.receive_text()
        except Exception:
            pass
        finally:
            hub.unregister(websocket)

    return call, state, render, ass, ws_endpoint
