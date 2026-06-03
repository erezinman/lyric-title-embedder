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

    async def state(request):  return JSONResponse(tools.get_project(ctx))
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
            await websocket.send_json({"type": "state", "state": tools.get_project(ctx)})
            while True:
                await websocket.receive_text()
        except Exception:
            pass
        finally:
            hub.unregister(websocket)

    async def frame(request):
        t = float(request.query_params.get("t", "0"))
        png = tools.render_frame(ctx, t)
        return Response(png, media_type="image/png")

    async def burn(request):
        body = await request.json()
        job = tools.burn(ctx, body["out"], body.get("video_in"))
        return JSONResponse(job)

    async def burn_status(request):
        try:
            return JSONResponse(tools.burn_status(ctx, request.path_params["job_id"]))
        except Exception as e:
            return _err(str(e), 404)

    from daemon import library
    async def projects_list(request):
        return JSONResponse(library.list_projects(request.app.state.projects_dir))
    async def projects_new(request):
        b = await request.json()
        try:
            library.new_project(request.app.state.projects_dir, b["name"], b["lyrics_path"])
            library.open_project(ctx, request.app.state.projects_dir, b["name"])
        except ValueError as e:
            return _err(str(e))
        return JSONResponse({"opened": b["name"]})
    async def projects_open(request):
        b = await request.json()
        try:
            library.open_project(ctx, request.app.state.projects_dir, b["name"])
        except ValueError as e:
            return _err(str(e))
        return JSONResponse({"opened": b["name"]})
    async def projects_save(request):
        b = await request.json()
        try:
            library.save_project(ctx, request.app.state.projects_dir, b["name"])
        except ValueError as e:
            return _err(str(e))
        return JSONResponse({"saved": b["name"]})

    return call, state, render, ass, ws_endpoint, frame, burn, burn_status, \
           projects_list, projects_new, projects_open, projects_save
