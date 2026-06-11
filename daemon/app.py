# daemon/app.py — build the unified Starlette app (/api + /ws + /mcp [+ optional SPA]).
import asyncio
import os
from contextlib import asynccontextmanager
from starlette.applications import Starlette
from starlette.routing import Route, WebSocketRoute, Mount
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import PlainTextResponse, FileResponse
from daemon.api import make_routes
from mcp_server.server import build_server

class _CrossOriginIsolation(BaseHTTPMiddleware):
    # Cross-origin isolation so jassub (libass-wasm) can use SharedArrayBuffer
    # threads in the packaged build. COOP/COEP go on the document; CORP same-origin
    # goes on every response so COEP `require-corp` accepts our own same-origin
    # subresources (assets, /api/font, /api/video) — the app serves nothing
    # cross-origin, so require-corp is safe here.
    async def dispatch(self, request, call_next):
        resp = await call_next(request)
        resp.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        resp.headers["Cross-Origin-Embedder-Policy"] = "require-corp"
        resp.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
        return resp

class _Auth(BaseHTTPMiddleware):
    def __init__(self, app, token):
        super().__init__(app); self.token = token
    async def dispatch(self, request, call_next):
        if request.url.path.startswith(("/api", "/mcp")) and request.headers.get("authorization") != f"Bearer {self.token}":
            return PlainTextResponse("unauthorized", status_code=401)
        return await call_next(request)

def build_app(ctx, hub, token=None, projects_dir="projects", file_access="native", web_dist=None):
    (call, state, render, ass, srt, vtt, ws_endpoint, frame, font, burn, burn_status,
     projects_list, projects_new, projects_open, projects_save, env, projects_create,
     connect, fonts, video, video_get, video_clear, fonts_upload, fonts_file, fonts_delete) = make_routes(ctx, hub)

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
        Route("/api/srt", srt, methods=["GET"]),
        Route("/api/vtt", vtt, methods=["GET"]),
        WebSocketRoute("/ws", ws_endpoint),
        Route("/api/frame", frame, methods=["GET"]),
        Route("/api/font", font, methods=["GET"]),
        Route("/api/burn", burn, methods=["POST"]),
        Route("/api/burn/{job_id}", burn_status, methods=["GET"]),
        Route("/api/projects", projects_list, methods=["GET"]),
        Route("/api/projects/new", projects_new, methods=["POST"]),
        Route("/api/projects/create", projects_create, methods=["POST"]),
        Route("/api/projects/open", projects_open, methods=["POST"]),
        Route("/api/projects/save", projects_save, methods=["POST"]),
        Route("/api/video", video_get, methods=["GET"]),
        Route("/api/video", video, methods=["POST"]),
        Route("/api/video", video_clear, methods=["DELETE"]),
        Route("/api/env", env, methods=["GET"]),
        Route("/api/connect", connect, methods=["GET"]),
        Route("/api/fonts", fonts, methods=["GET"]),
        Route("/api/fonts/upload", fonts_upload, methods=["POST"]),
        Route("/api/fonts/file/{family:path}", fonts_file, methods=["GET"]),
        Route("/api/fonts/{family:path}", fonts_delete, methods=["DELETE"]),
    ]
    # Optional: serve the built web SPA so a single local origin hosts UI + API (the
    # Electron shell loads http://127.0.0.1:<port>/). Appended LAST so the explicit
    # /api, /ws, /mcp routes above always match first.
    if web_dist and os.path.isdir(web_dist):
        base = os.path.abspath(web_dist)
        index = os.path.join(base, "index.html")

        async def _spa(request):
            rel = request.path_params.get("path", "")
            if rel in ("ws", "api", "mcp") or rel.startswith("api/") or rel.startswith("mcp/"):
                return PlainTextResponse("not found", status_code=404)
            candidate = os.path.abspath(os.path.join(base, rel))
            if (candidate == base or candidate.startswith(base + os.sep)) and os.path.isfile(candidate):
                return FileResponse(candidate)
            return FileResponse(index)            # SPA deep-link fallback

        async def _spa_root(request):
            return FileResponse(index)

        routes.append(Route("/", _spa_root, methods=["GET"]))
        routes.append(Route("/{path:path}", _spa, methods=["GET"]))

    middleware = [Middleware(_CrossOriginIsolation),
                  Middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:5173",
                  "http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])]
    if token:
        middleware.append(Middleware(_Auth, token=token))
    app = Starlette(routes=routes, middleware=middleware, lifespan=lifespan)
    app.state.ctx = ctx; app.state.hub = hub
    app.state.token = token; app.state.projects_dir = projects_dir
    app.state.file_access = file_access
    app.state.web_dist = web_dist
    return app
