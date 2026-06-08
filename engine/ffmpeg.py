# engine/ffmpeg.py — ffmpeg command construction + headless progress runner. UI-free.
import os
import json
import subprocess
from core import FFMPEG, FFPROBE

def _escape_ass(path):
    return path.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")

def _ass_filter(ass_path, fonts_dir=None):
    """Build the libass video filter. When fonts_dir is given, append
    :fontsdir=<dir> so libass resolves project-uploaded families at render time
    (escaped the same way as the .ass path)."""
    f = f"ass='{_escape_ass(ass_path)}'"
    if fonts_dir:
        f += f":fontsdir='{_escape_ass(fonts_dir)}'"
    return f

def burn_cmd(video_in, ass_path, out_path, fonts_dir=None):
    return [FFMPEG, "-y", "-hide_banner", "-i", video_in,
            "-vf", _ass_filter(ass_path, fonts_dir), "-c:a", "copy",
            "-progress", "pipe:1", "-nostats", out_path]

def probe_duration(path):
    if not os.path.isfile(FFPROBE):
        return None
    try:
        out = subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration",
                              "-of", "default=nokey=1:noprint_wrappers=1", path],
                             capture_output=True, text=True, timeout=10).stdout.strip()
        return float(out)
    except Exception:
        return None

def probe_video(path):
    """Probe a video file for {w, h, duration_s} via ffprobe (JSON output). Returns
    None if ffprobe is unavailable, the file can't be read, or parsing fails — callers
    degrade gracefully (path stored, meta null). Picks the first video stream for w/h
    and the container duration for duration_s."""
    if not os.path.isfile(FFPROBE):
        return None
    try:
        out = subprocess.run([FFPROBE, "-v", "error", "-show_entries",
                              "stream=codec_type,width,height:format=duration",
                              "-of", "json", path],
                             capture_output=True, text=True, timeout=10).stdout
        doc = json.loads(out)
        vs = next((s for s in doc.get("streams", []) if s.get("codec_type") == "video"), None)
        w = int(vs["width"]) if vs and vs.get("width") is not None else None
        h = int(vs["height"]) if vs and vs.get("height") is not None else None
        dur = doc.get("format", {}).get("duration")
        duration_s = float(dur) if dur is not None else None
        return {"w": w, "h": h, "duration_s": duration_s}
    except Exception:
        return None

def frame_cmd(video_in, ass_path, time_s, w, h, out_png, fonts_dir=None):
    """Render one exact libass frame at time_s to out_png. If video_in is None,
    use a solid dark canvas of w x h (so a preview works without footage).
    fonts_dir, when given, is passed to libass via :fontsdir so uploaded families
    resolve in the preview too."""
    if video_in:
        src = ["-ss", f"{time_s:.3f}", "-copyts", "-i", video_in]
    else:
        src = ["-ss", f"{time_s:.3f}", "-copyts", "-f", "lavfi",
               "-i", f"color=c=#202024:s={int(w)}x{int(h)}:d={max(time_s + 1, 1):.1f}"]
    return [FFMPEG, "-y", "-hide_banner", "-loglevel", "error", *src,
            "-vf", _ass_filter(ass_path, fonts_dir), "-frames:v", "1", out_png]

def run(cmd, total, progress_cb):
    """Run an ffmpeg -progress command; call progress_cb(frac in 0..0.999) as it
    advances. Returns (ok, err_text). No Tk — caller adapts to its event loop."""
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    except Exception as e:
        return False, str(e)
    for line in proc.stdout:
        line = line.strip()
        if line.startswith("out_time_us=") or line.startswith("out_time_ms="):
            try:
                secs = int(line.split("=")[1]) / 1_000_000
                if total:
                    progress_cb(min(secs / total, 0.999))
            except (ValueError, ZeroDivisionError):
                pass
    err = proc.stderr.read(); rc = proc.wait()
    return (rc == 0), (None if rc == 0 else err)
