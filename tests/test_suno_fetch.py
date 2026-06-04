# tests/test_suno_fetch.py — tools/suno_fetch.py CLI (pure parts + mocked HTTP).
import os, sys, json, tempfile, shutil
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tools import suno_fetch as sf

results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))

SID = "01234567-89ab-cdef-0123-456789abcdef"
PAYLOAD = {"aligned_lyrics": [
    {"text": "Hello world", "start_s": 0.0, "end_s": 1.0, "section": "Verse",
     "words": [{"text": "Hello ", "start_s": 0.0, "end_s": 0.5},
               {"text": "world", "start_s": 0.5, "end_s": 1.0}]},
    {"text": "Bye", "start_s": 1.0, "end_s": 2.0, "section": "Verse",
     "words": [{"text": "Bye", "start_s": 1.0, "end_s": 2.0}]},
]}

# ── parse_song_id ─────────────────────────────────────────────────────────────
def t_parse_full_url():
    return (sf.parse_song_id(f"https://suno.com/song/{SID}") == SID), "url"

def t_parse_url_with_query_and_slash():
    return (sf.parse_song_id(f"https://suno.com/song/{SID}/?sh=abc&x=1") == SID), "query"

def t_parse_bare_id():
    return (sf.parse_song_id(SID.upper()) == SID), "bare id lowercased"

def t_parse_garbage_raises():
    try: sf.parse_song_id("https://suno.com/about"); return (False, "no raise")
    except ValueError: return (True, "raised")

# ── clean_token ───────────────────────────────────────────────────────────────
def t_clean_token_strips_bearer_and_ws():
    return (sf.clean_token("  Bearer eyJtok  \n") == "eyJtok"), "stripped"

def t_clean_token_plain():
    return (sf.clean_token("eyJtok") == "eyJtok"), "plain"

def t_clean_token_empty_raises():
    try: sf.clean_token("   "); return (False, "no raise")
    except ValueError: return (True, "raised")

# ── validate_payload ──────────────────────────────────────────────────────────
def t_validate_counts():
    return (sf.validate_payload(PAYLOAD) == (3, 2)), str(sf.validate_payload(PAYLOAD))

def t_validate_missing_raises():
    try: sf.validate_payload({"foo": 1}); return (False, "no raise")
    except ValueError: return (True, "raised")

# ── fetch_lyrics (mocked HTTP) ────────────────────────────────────────────────
def _http(status, body):
    calls = []
    def fake(url, headers):
        calls.append((url, headers)); return status, body
    return fake, calls

def t_fetch_ok_and_request_shape():
    fake, calls = _http(200, json.dumps(PAYLOAD).encode())
    data = sf.fetch_lyrics(SID, "tok", http_get=fake)
    url, headers = calls[0]
    return (data == PAYLOAD and SID in url and "aligned_lyrics/v2" in url
            and headers["Authorization"] == "Bearer tok"), url

def t_fetch_401_friendly():
    fake, _ = _http(401, b"{}")
    try: sf.fetch_lyrics(SID, "tok", http_get=fake); return (False, "no raise")
    except RuntimeError as e:
        return ("expired" in str(e) and "DevTools" in str(e)), str(e)

def t_fetch_404_friendly():
    fake, _ = _http(404, b"{}")
    try: sf.fetch_lyrics(SID, "tok", http_get=fake); return (False, "no raise")
    except RuntimeError as e: return ("not found" in str(e)), str(e)

def t_fetch_other_status_snippet():
    fake, _ = _http(503, b"upstream sad")
    try: sf.fetch_lyrics(SID, "tok", http_get=fake); return (False, "no raise")
    except RuntimeError as e: return ("503" in str(e) and "upstream sad" in str(e)), str(e)

def t_fetch_bad_json_raises():
    fake, _ = _http(200, b"<html>nope</html>")
    try: sf.fetch_lyrics(SID, "tok", http_get=fake); return (False, "no raise")
    except RuntimeError as e: return ("JSON" in str(e)), str(e)

# ── main ──────────────────────────────────────────────────────────────────────
def t_main_refuses_overwrite_before_token():
    d = tempfile.mkdtemp(prefix="kss_sf_")
    try:
        out = os.path.join(d, "x.json")
        open(out, "w").close()
        # read_token would block/fail if reached; stub it to prove it is NOT called
        called = []
        orig = sf.read_token
        sf.read_token = lambda: called.append(1) or "tok"
        try:
            rc = sf.main([f"https://suno.com/song/{SID}", "-o", out])
        finally:
            sf.read_token = orig
        return (rc == 1 and not called), f"rc={rc} called={called}"
    finally: shutil.rmtree(d, ignore_errors=True)

def t_main_end_to_end_mocked():
    d = tempfile.mkdtemp(prefix="kss_sf_")
    try:
        out = os.path.join(d, "out.json")
        orig_rt, orig_fl = sf.read_token, sf.fetch_lyrics
        sf.read_token = lambda: "tok"
        sf.fetch_lyrics = lambda sid, tok, http_get=None: PAYLOAD
        try:
            rc = sf.main([SID, "-o", out])
        finally:
            sf.read_token, sf.fetch_lyrics = orig_rt, orig_fl
        saved = json.load(open(out, encoding="utf-8"))
        return (rc == 0 and saved == PAYLOAD), f"rc={rc}"
    finally: shutil.rmtree(d, ignore_errors=True)

def t_main_force_overwrites():
    d = tempfile.mkdtemp(prefix="kss_sf_")
    try:
        out = os.path.join(d, "out.json")
        with open(out, "w") as fh: fh.write("old")
        orig_rt, orig_fl = sf.read_token, sf.fetch_lyrics
        sf.read_token = lambda: "tok"
        sf.fetch_lyrics = lambda sid, tok, http_get=None: PAYLOAD
        try:
            rc = sf.main([SID, "-o", out, "-f"])
        finally:
            sf.read_token, sf.fetch_lyrics = orig_rt, orig_fl
        return (rc == 0 and json.load(open(out)) == PAYLOAD), f"rc={rc}"
    finally: shutil.rmtree(d, ignore_errors=True)

def t_main_bad_url_rc1():
    rc = sf.main(["not-a-song-url", "-o", "/tmp/never.json"])
    return (rc == 1), f"rc={rc}"

_active = {n: f for n, f in list(globals().items()) if n.startswith("t_") and callable(f)}
for n, f in sorted(_active.items()): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, dd in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"\n       -> {dd}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
