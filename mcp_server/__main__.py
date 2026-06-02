# Headless MCP entrypoint:  python -m mcp_server [--json PATH] [--project PATH] [--video PATH]
import argparse
from mcp_server.context import HeadlessContext


def main(argv=None):
    ap = argparse.ArgumentParser(prog="mcp_server")
    ap.add_argument("--json", default="aligned_lyrics.json")
    ap.add_argument("--project")
    ap.add_argument("--video")
    a = ap.parse_args(argv)
    ctx = HeadlessContext()
    ctx.load_lyrics(a.json)
    if a.video: ctx.set_video(a.video)
    if a.project:
        from mcp_server import tools; tools.load_project(ctx, a.project)
    from mcp_server.server import serve_stdio
    serve_stdio(ctx)


if __name__ == "__main__":
    main()
