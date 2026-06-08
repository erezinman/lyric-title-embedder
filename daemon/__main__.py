# python -m daemon [--port 8770] [--projects-dir projects] [--json aligned_lyrics.json]
import argparse, os
import uvicorn
from daemon.hub import Hub
from daemon.context import DaemonContext
from daemon.app import build_app

def main(argv=None):
    ap = argparse.ArgumentParser(prog="daemon")
    ap.add_argument("--port", type=int, default=8770)
    ap.add_argument("--projects-dir", default="projects")
    ap.add_argument("--json", default="aligned_lyrics.json")
    # File-access mode. native (default): local dev / desktop shell — server paths + burn.
    # transfer: hosted/remote — upload + subtitle-download only; meant to run behind a
    # reverse proxy that terminates the public side and forwards to this loopback daemon.
    ap.add_argument("--file-access", choices=["native", "transfer"],
                    default=os.environ.get("KSS_FILE_ACCESS", "native"))
    a = ap.parse_args(argv)
    hub = Hub(); ctx = DaemonContext(hub)
    if os.path.isfile(a.json):
        ctx.load_lyrics(a.json)
    app = build_app(ctx, hub, token=os.environ.get("KSS_MCP_TOKEN"),
                    projects_dir=a.projects_dir, file_access=a.file_access)
    uvicorn.run(app, host="127.0.0.1", port=a.port, log_level="warning")  # loopback-only

if __name__ == "__main__":
    main()
