# engine/ffmpeg.py — ffmpeg command construction + headless progress runner. UI-free.
import subprocess
from core import FFMPEG, FFPROBE

def _escape_ass(path):
    return path.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")

def burn_cmd(video_in, ass_path, out_path):
    return [FFMPEG, "-y", "-hide_banner", "-i", video_in,
            "-vf", f"ass='{_escape_ass(ass_path)}'", "-c:a", "copy",
            "-progress", "pipe:1", "-nostats", out_path]

def probe_duration(path):
    import os
    if not os.path.isfile(FFPROBE):
        return None
    try:
        out = subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration",
                              "-of", "default=nokey=1:noprint_wrappers=1", path],
                             capture_output=True, text=True, timeout=10).stdout.strip()
        return float(out)
    except Exception:
        return None

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
