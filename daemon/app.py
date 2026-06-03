# daemon/app.py — build the unified Starlette app (/api + /ws + /mcp).
import asyncio
from contextlib import asynccontextmanager
from starlette.applications import Starlette
from starlette.routing import Route, WebSocketRoute, Mount
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from daemon.api import make_routes
from mcp_server.server import build_server

def build_app(ctx, hub, token=None, projects_dir="projects"):
    (call, state, render, ass, ws_endpoint, frame, burn, burn_status,
     projects_list, projects_new, projects_open, projects_save) = make_routes(ctx, hub)

    @asynccontextmanager
    async def lifespan(app):
        hub.bind_loop(asyncio.get_running_loop())
        yield

    mcp_app = build_server(ctx).sse_app(mount_path="/mcp")
    routes = [
        Mount("/mcp", app=mcp_app),
        Route("/api/call", call, methods=["POST"]),
        Route("/api/state", state, methods=["GET"]),
        Route("/api/render", render, methods=["GET"]),
        Route("/api/ass", ass, methods=["GET"]),
        WebSocketRoute("/ws", ws_endpoint),
        Route("/api/frame", frame, methods=["GET"]),
        Route("/api/burn", burn, methods=["POST"]),
        Route("/api/burn/{job_id}", burn_status, methods=["GET"]),
        Route("/api/projects", projects_list, methods=["GET"]),
        Route("/api/projects/new", projects_new, methods=["POST"]),
        Route("/api/projects/open", projects_open, methods=["POST"]),
        Route("/api/projects/save", projects_save, methods=["POST"]),
    ]
    middleware = [Middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:5173",
                  "http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])]
    app = Starlette(routes=routes, middleware=middleware, lifespan=lifespan)
    app.state.ctx = ctx; app.state.hub = hub
    app.state.token = token; app.state.projects_dir = projects_dir
    return app
