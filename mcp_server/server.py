# mcp_server/server.py — FastMCP registration + transports. Imports `mcp` (SDK).
from typing import Optional
from mcp.server.fastmcp import FastMCP, Image
from mcp_server import tools


def build_server(ctx, name="karaoke-subtitle-studio"):
    mcp = FastMCP(name, instructions="Edit a word-timed karaoke subtitle project: inspect, "
                  "style groups/cues, fade groups, layout, globals, build/render/burn.")

    @mcp.tool()
    def get_state() -> dict: return tools.get_state(ctx)
    @mcp.tool()
    def list_groups() -> list: return tools.list_groups(ctx)
    @mcp.tool()
    def get_group(gi: int) -> dict: return tools.get_group(ctx, gi)
    @mcp.tool()
    def list_words() -> list: return tools.list_words(ctx)
    @mcp.tool()
    def get_word(wid: int) -> dict: return tools.get_word(ctx, wid)
    @mcp.tool()
    def get_render() -> list: return tools.get_render(ctx)
    @mcp.tool()
    def get_project() -> dict: return tools.get_project(ctx)
    @mcp.tool()
    def get_ass() -> str: return tools.get_ass(ctx)

    @mcp.tool()
    def set_group_style(gi: int, partial: dict) -> dict: return tools.set_group_style(ctx, gi, partial)
    @mcp.tool()
    def set_group_fade(gi: int, partial: dict) -> dict: return tools.set_group_fade(ctx, gi, partial)
    @mcp.tool()
    def set_cue_style(word_ids: list, partial: dict) -> list: return tools.set_cue_style(ctx, word_ids, partial)
    @mcp.tool()
    def make_fade_tag(kind: str, word_ids: list) -> dict: return tools.make_fade_tag(ctx, kind, word_ids)
    @mcp.tool()
    def clear_fade_tag(kind: str, word_ids: list) -> dict: return tools.clear_fade_tag(ctx, kind, word_ids)
    @mcp.tool()
    def set_fade_tag_props(kind: str, word_ids: list, trigger: Optional[float] = None) -> dict:
        return tools.set_fade_tag_props(ctx, kind, word_ids, trigger)
    @mcp.tool()
    def set_word_times(updates: list) -> dict: return tools.set_word_times(ctx, updates)
    @mcp.tool()
    def set_word_text(wid: int, text: str) -> dict: return tools.set_word_text(ctx, wid, text)

    @mcp.tool()
    def set_layout_props(gi: int, win_start: Optional[float] = None, win_end: Optional[float] = None,
                         linger: Optional[float] = None, accumulate: str = "words") -> dict:
        return tools.set_layout_props(ctx, gi, win_start, win_end, linger, accumulate)
    @mcp.tool()
    def merge_events(gidxs: list) -> list: return tools.merge_events(ctx, gidxs)
    @mcp.tool()
    def ungroup_event(gi: int) -> list: return tools.ungroup_event(ctx, gi)
    @mcp.tool()
    def split_event(gi: int, line_index: int) -> list: return tools.split_event(ctx, gi, line_index)
    @mcp.tool()
    def break_line(gi: int, li: int, ti: int, after: bool = True) -> dict: return tools.break_line(ctx, gi, li, ti, after)
    @mcp.tool()
    def merge_words(gi: int, li: int, ti: int, sep: str = "") -> dict: return tools.merge_words(ctx, gi, li, ti, sep)
    @mcp.tool()
    def merge_word_span(gi: int, li: int, ti_first: int, ti_last: int, sep: str = "") -> dict:
        return tools.merge_word_span(ctx, gi, li, ti_first, ti_last, sep)
    @mcp.tool()
    def delete_words(word_ids: list) -> list: return tools.delete_words(ctx, word_ids)
    @mcp.tool()
    def restore_words(word_ids: list) -> list: return tools.restore_words(ctx, word_ids)
    @mcp.tool()
    def set_fade_defaults(fade_in_ms: Optional[float] = None, fade_out_ms: Optional[float] = None,
                          linger: Optional[float] = None) -> dict:
        return tools.set_fade_defaults(ctx, fade_in_ms, fade_out_ms, linger)
    @mcp.tool()
    def undo() -> dict: return tools.undo(ctx)
    @mcp.tool()
    def redo() -> dict: return tools.redo(ctx)

    @mcp.tool()
    def get_globals() -> dict: return tools.get_globals(ctx)
    @mcp.tool()
    def set_globals(partial: dict) -> dict: return tools.set_globals(ctx, partial)

    @mcp.tool()
    def load_lyrics(json_path: str, group_by: str = "section", skip_dashes: bool = True) -> dict:
        ctx.load_lyrics(json_path, group_by, skip_dashes); return tools.get_state(ctx)
    @mcp.tool()
    def load_project(path: str) -> dict: return tools.load_project(ctx, path)
    @mcp.tool()
    def save_project(path: str) -> dict: return tools.save_project(ctx, path)
    @mcp.tool()
    def generate_ass(path: Optional[str] = None) -> str: return tools.generate_ass(ctx, path)
    @mcp.tool()
    def render_frame(time_s: float) -> Image:
        return Image(data=tools.render_frame(ctx, time_s), format="png")
    @mcp.tool()
    def burn(out_path: str, video_in: Optional[str] = None) -> dict: return tools.burn(ctx, out_path, video_in)
    @mcp.tool()
    def burn_status(job_id: str) -> dict: return tools.burn_status(ctx, job_id)

    @mcp.resource("karaoke://project")
    def res_project() -> str:
        import json, engine
        return json.dumps({"globals": tools.get_globals(ctx), "cues": engine.serialize_cues(ctx.session.project)})
    @mcp.resource("karaoke://ass")
    def res_ass() -> str: return tools.get_ass(ctx)

    return mcp


def serve_stdio(ctx):
    build_server(ctx).run(transport="stdio")


def serve_http(ctx, host="127.0.0.1", port=8765, token=None, in_thread=False):
    import uvicorn
    if host not in ("127.0.0.1", "localhost", "::1"):
        raise ValueError("MCP HTTP endpoint is loopback-only")
    mcp = build_server(ctx)
    app = mcp.sse_app()  # Starlette ASGI app exposing /sse + /messages/
    if token:
        from starlette.middleware.base import BaseHTTPMiddleware
        from starlette.responses import PlainTextResponse
        class Auth(BaseHTTPMiddleware):
            async def dispatch(self, request, call_next):
                if request.headers.get("authorization") != f"Bearer {token}":
                    return PlainTextResponse("unauthorized", status_code=401)
                return await call_next(request)
        app.add_middleware(Auth)
    config = uvicorn.Config(app, host=host, port=port, log_level="warning")
    server = uvicorn.Server(config)
    server.install_signal_handlers = lambda: None  # safe to run off the main thread
    if not in_thread:
        server.run()
        return lambda: None
    import threading
    th = threading.Thread(target=server.run, daemon=True)
    th.start()
    def stop():
        server.should_exit = True
        th.join(timeout=5)
    return stop
