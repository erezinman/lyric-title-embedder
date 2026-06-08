# daemon/api.py — Starlette handlers over a DaemonContext + Hub. Imports starlette only.
import os
from starlette.responses import JSONResponse, Response
from mcp_server import tools

def _err(msg, code=400):
    return JSONResponse({"error": msg}, status_code=code)

def make_routes(ctx, hub):
    async def call(request):
        body = await request.json()
        name = body.get("tool"); args = body.get("args") or {}
        # Optional echo-correlation id: the WS state broadcast this call triggers
        # carries it back (cid) so the originating client can recognize its own echo.
        cid = body.get("cid", body.get("call_id"))
        fn = getattr(tools, name, None)
        if name is None or fn is None or name.startswith("_"):
            return _err(f"unknown tool {name!r}")
        # Stamp the cid onto any broadcast fired synchronously by this tool. Reset
        # in finally so subsequent external/unsolicited mutations broadcast cid=null.
        prev = getattr(ctx, "_pending_cid", None)
        try:
            ctx._pending_cid = cid
        except AttributeError:
            pass
        try:
            return JSONResponse({"result": fn(ctx, **args), "cid": cid})
        except TypeError as e:
            return _err(f"bad args for {name}: {e}")
        except Exception as e:
            return _err(f"{type(e).__name__}: {e}", 422)
        finally:
            try:
                ctx._pending_cid = prev
            except AttributeError:
                pass

    async def state(request):  return JSONResponse(tools.get_project(ctx))
    async def render(request): return JSONResponse(tools.get_render(ctx))
    async def ass(request):    return Response(tools.get_ass(ctx), media_type="text/plain")
    async def srt(request):    return Response(tools.get_srt(ctx), media_type="text/plain")
    async def vtt(request):    return Response(tools.get_vtt(ctx), media_type="text/plain")

    async def ws_endpoint(websocket):
        import asyncio as _asyncio
        # Lazy loop bind: the ws handler runs in the event loop, so we can always
        # bind here. This covers TestClient (no lifespan) and prod startup alike.
        hub.bind_loop(_asyncio.get_running_loop())
        await websocket.accept()
        hub.register(websocket)
        try:
            await websocket.send_json({"type": "state", "state": tools.get_project(ctx), "cid": None})
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

    async def font(request):
        # Serve the configured font file so the in-browser libass (jassub) live
        # preview shapes with the SAME TTF the export render uses. Resolves the
        # configured family name to a file via fontconfig (fc-match).
        import core, subprocess, os
        cfg = ctx.cfg()
        family = cfg.get("font") or "DejaVu Sans"
        path = None
        if core.FC_MATCH:
            try:
                out = subprocess.run([core.FC_MATCH, "-f", "%{file}", family],
                                     capture_output=True, text=True, timeout=8)
                path = out.stdout.strip() or None
            except Exception:
                path = None
        if not path or not os.path.isfile(path):
            return _err(f"font file for {family!r} not found", 404)
        with open(path, "rb") as fh:
            data = fh.read()
        return Response(data, media_type="font/ttf",
                        headers={"Cache-Control": "no-cache"})

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
    from daemon.autosave import Autosaver
    autosaver = Autosaver(ctx, None)         # projects_dir resolved per request below
    ctx.after_change = autosaver.schedule
    async def projects_list(request):
        return JSONResponse(library.list_projects(request.app.state.projects_dir))
    async def projects_new(request):
        b = await request.json()
        try:
            opened = library.create_project(ctx, request.app.state.projects_dir, b["name"],
                                             source="suno_json", lyrics_path=b["lyrics_path"])
        except FileExistsError as e:
            return _err(str(e), 409)
        except ValueError as e:
            return _err(str(e))
        autosaver.projects_dir = request.app.state.projects_dir
        autosaver.bind(opened)
        return JSONResponse({"opened": opened})

    async def projects_create(request):
        form = await request.form()
        def g(k, default=None):
            v = form.get(k)
            return v if (v is not None and v != "") else default
        try:
            kwargs = dict(
                source=g("source", "suno_json"),
                group_by=g("group_by", "section"),
                skip_dashes=(g("skip_dashes", "true") == "true"),
                line_break=g("line_break", "none"),
                n_words=int(g("n_words", "5")),
            )
            lf = form.get("lyrics_file")
            if lf is not None and hasattr(lf, "read"):
                kwargs["lyrics_bytes"] = await lf.read()
            else:
                kwargs["lyrics_path"] = g("lyrics_path")
            vf = form.get("video_file")
            if vf is not None and hasattr(vf, "read"):
                kwargs["video_bytes"] = await vf.read()
                kwargs["video_name"] = getattr(vf, "filename", "video.mp4")
            elif g("video_path"):
                kwargs["video_path"] = g("video_path")
            opened = library.create_project(ctx, request.app.state.projects_dir, g("name"), **kwargs)
        except FileExistsError as e:
            return _err(str(e), 409)
        except ValueError as e:
            return _err(str(e), 400)
        except Exception as e:
            return _err(f"{type(e).__name__}: {e}", 422)
        autosaver.projects_dir = request.app.state.projects_dir
        autosaver.bind(opened)
        return JSONResponse({"opened": opened})
    async def projects_open(request):
        b = await request.json()
        try:
            library.open_project(ctx, request.app.state.projects_dir, b["name"])
        except ValueError as e:
            return _err(str(e))
        autosaver.projects_dir = request.app.state.projects_dir
        autosaver.bind(b["name"])
        return JSONResponse({"opened": b["name"]})
    async def projects_save(request):
        b = await request.json()
        try:
            library.save_project(ctx, request.app.state.projects_dir, b["name"])
        except ValueError as e:
            return _err(str(e))
        return JSONResponse({"saved": b["name"]})

    async def video(request):
        # POST /api/video — attach/swap the open project's video AFTER creation.
        # Accepts EITHER multipart bytes (video_file → saved into the project dir,
        # mirroring projects_create) OR JSON {path} naming a same-host server file.
        # Server-path mode is loopback-gated like the env/same_host inputs. Routes
        # through library.set_project_video → ctx.set_video, so it probes + broadcasts
        # + autosaves + persists. Returns {video: {path,w,h,duration_s}|null}.
        name = autosaver.name
        if not name:
            return _err("no project open", 409)
        kwargs = {}
        ctype = request.headers.get("content-type", "")
        if ctype.startswith("multipart/"):
            form = await request.form()
            vf = form.get("video_file")
            if vf is None or not hasattr(vf, "read"):
                return _err("multipart upload requires a 'video_file' part")
            kwargs["video_bytes"] = await vf.read()
            kwargs["video_name"] = getattr(vf, "filename", "video.mp4")
        else:
            body = await request.json()
            path = body.get("path")
            if path:
                client = request.client
                same = bool(client and client.host in ("127.0.0.1", "::1"))
                if not same:
                    return _err("server-side video paths are only allowed from localhost", 403)
                kwargs["video_path"] = path
            # else: no bytes, no path → clear (detach) via empty kwargs
        try:
            meta = library.set_project_video(ctx, request.app.state.projects_dir, name, **kwargs)
        except ValueError as e:
            return _err(str(e), 400)
        except Exception as e:
            return _err(f"{type(e).__name__}: {e}", 422)
        return JSONResponse({"video": meta})

    async def video_clear(request):
        # DELETE /api/video — detach the media pointer only (cues/styling kept).
        name = autosaver.name
        if not name:
            return _err("no project open", 409)
        try:
            library.set_project_video(ctx, request.app.state.projects_dir, name)
        except ValueError as e:
            return _err(str(e), 400)
        return JSONResponse({"video": None})

    async def env(request):
        # same_host gates the server-path inputs in the web UI: only a client
        # connecting from loopback can name files on the daemon's filesystem.
        client = request.client
        same = bool(client and client.host in ("127.0.0.1", "::1"))
        return JSONResponse({"same_host": same})

    async def connect(request):
        # MCP-connect popover params. Host/port are derived from the request so a
        # client behind a proxy or on a non-default port still copies a working URL.
        # token_required reflects whether the daemon was launched with KSS_MCP_TOKEN;
        # the token VALUE is never returned.
        url = request.url
        host = url.hostname or "127.0.0.1"
        port = url.port or (443 if url.scheme == "https" else 80)
        base = f"{url.scheme}://{url.netloc}"
        ws_scheme = "wss" if url.scheme == "https" else "ws"
        return JSONResponse({
            "host": host,
            "port": port,
            "api_url": f"{base}/api/call",
            "ws_url": f"{ws_scheme}://{url.netloc}/ws",
            "mcp_url": f"{base}/mcp",
            "token_required": bool(os.environ.get("KSS_MCP_TOKEN")),
        })

    def _system_fonts():
        import core, subprocess
        if not core.FC_LIST:
            return []
        try:
            out = subprocess.run([core.FC_LIST, ":", "family"],
                                 capture_output=True, text=True, timeout=8).stdout
        except Exception:
            return []
        return sorted({line.split(",")[0].strip() for line in out.splitlines() if line.strip()})

    async def fonts(request):
        # Installed system families (fc-list) PLUS the open project's uploaded
        # custom families: {system:[name...], custom:[{family,url,ext}...]}.
        # The legacy `fonts` key (== system) is kept for back-compat callers.
        sysf = _system_fonts()
        customs = []
        folder = None if not autosaver.name else os.path.join(request.app.state.projects_dir, autosaver.name)
        if folder:
            customs = library.list_custom_fonts(folder)
        return JSONResponse({"system": sysf, "custom": customs, "fonts": sysf})

    async def fonts_upload(request):
        # POST /api/fonts/upload (multipart `font_file`) -> save into the open
        # project's fonts dir, returning {family, url}. An optional `family` form
        # field overrides the filename-derived name.
        if not autosaver.name:
            return _err("no project open", 409)
        folder = os.path.join(request.app.state.projects_dir, autosaver.name)
        form = await request.form()
        ff = form.get("font_file")
        if ff is None or not hasattr(ff, "read"):
            return _err("multipart upload requires a 'font_file' part")
        data = await ff.read()
        try:
            family, url = library.save_font(folder, data, getattr(ff, "filename", ""),
                                            family=(form.get("family") or None))
        except ValueError as e:
            return _err(str(e), 400)
        return JSONResponse({"family": family, "url": url})

    async def fonts_file(request):
        # GET /api/fonts/file/{family} -> serve the stored font bytes so a web
        # FontFace src can load it.
        if not autosaver.name:
            return _err("no project open", 409)
        folder = os.path.join(request.app.state.projects_dir, autosaver.name)
        path = library.font_file_path(folder, request.path_params["family"])
        if not path:
            return _err("font not found", 404)
        with open(path, "rb") as fh:
            data = fh.read()
        mt = {".woff2": "font/woff2", ".woff": "font/woff",
              ".otf": "font/otf", ".ttf": "font/ttf"}.get(os.path.splitext(path)[1].lower(), "font/ttf")
        return Response(data, media_type=mt, headers={"Cache-Control": "no-cache"})

    async def fonts_delete(request):
        # DELETE /api/fonts/{family} -> remove the uploaded font from the project.
        if not autosaver.name:
            return _err("no project open", 409)
        folder = os.path.join(request.app.state.projects_dir, autosaver.name)
        removed = library.delete_font(folder, request.path_params["family"])
        if not removed:
            return _err("font not found", 404)
        return JSONResponse({"deleted": request.path_params["family"]})

    return call, state, render, ass, srt, vtt, ws_endpoint, frame, font, burn, burn_status, \
           projects_list, projects_new, projects_open, projects_save, env, projects_create, \
           connect, fonts, video, video_clear, fonts_upload, fonts_file, fonts_delete
