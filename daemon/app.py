# daemon/app.py — build the unified Starlette app (/api + /ws). /mcp added in a later task.
import asyncio
from contextlib import asynccontextmanager
from starlette.applications import Starlette
from starlette.routing import Route, WebSocketRoute
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from daemon.api import make_routes

def build_app(ctx, hub, token=None, projects_dir="projects"):
    call, state, render, ass, ws_endpoint = make_routes(ctx, hub)

    @asynccontextmanager
    async def lifespan(app):
        hub.bind_loop(asyncio.get_running_loop())
        yield

    routes = [
        Route("/api/call", call, methods=["POST"]),
        Route("/api/state", state, methods=["GET"]),
        Route("/api/render", render, methods=["GET"]),
        Route("/api/ass", ass, methods=["GET"]),
        WebSocketRoute("/ws", ws_endpoint),
    ]
    middleware = [Middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:5173",
                  "http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])]
    app = Starlette(routes=routes, middleware=middleware, lifespan=lifespan)
    app.state.ctx = ctx; app.state.hub = hub
    app.state.token = token; app.state.projects_dir = projects_dir
    return app
