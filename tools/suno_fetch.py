#!/usr/bin/env python3
"""suno_fetch — pull a song's aligned-lyrics JSON out of Suno.

Given a suno.com song URL (or bare song id) and a session token, fetches
    GET https://studio-api.prod.suno.com/api/gen/<songId>/aligned_lyrics/v2/
and saves the response — the word-timed source the studio imports.

The token is your Suno session JWT (short-lived, ~minutes): log into suno.com,
open DevTools → Network, click any request to studio-api, and copy the value
after "Bearer " in the Authorization request header. The tool prompts for it
(hidden) or reads it from stdin; it is never echoed, logged, or stored.

Usage:
    python tools/suno_fetch.py https://suno.com/song/<id> [-o OUT.json] [-f]
    echo "$SUNO_TOKEN" | python tools/suno_fetch.py <id> -o song.json
"""
import argparse, getpass, json, os, re, sys
import urllib.error, urllib.request

API = "https://studio-api.prod.suno.com/api/gen/{id}/aligned_lyrics/v2/"
_ID = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"


def parse_song_id(s):
    """Song id from a suno.com/song/<id> URL or a bare UUID. Raises ValueError."""
    s = s.strip()
    if re.fullmatch(_ID, s):
        return s.lower()
    m = re.search(rf"/song/({_ID})", s)
    if m:
        return m.group(1).lower()
    raise ValueError(f"could not find a Suno song id in {s!r} "
                     "(expected https://suno.com/song/<id> or a bare id)")


def clean_token(tok):
    """Strip whitespace and a pasted 'Bearer ' prefix. Raises ValueError if empty."""
    tok = tok.strip()
    if tok.lower().startswith("bearer "):
        tok = tok[7:].strip()
    if not tok:
        raise ValueError("empty token")
    return tok


def read_token():
    """Hidden prompt on a TTY; first stdin line when piped. Never echoed."""
    if sys.stdin.isatty():
        raw = getpass.getpass("Suno token: ")
    else:
        raw = sys.stdin.readline()
    return clean_token(raw)


def validate_payload(data):
    """Require a non-empty aligned_lyrics (what the studio importer needs).
    Returns (nwords, nlines)."""
    al = data.get("aligned_lyrics") if isinstance(data, dict) else None
    if not isinstance(al, list) or not al:
        raise ValueError("response has no non-empty 'aligned_lyrics' — "
                         "not an alignment payload")
    nwords = sum(len(e.get("words") or []) for e in al)
    return nwords, len(al)


def _http_get(url, headers):
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def fetch_lyrics(song_id, token, http_get=_http_get):
    """Fetch + decode the alignment JSON; maps HTTP failures to friendly errors."""
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json",
               "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) suno-fetch/1.0"}
    status, body = http_get(API.format(id=song_id), headers)
    if status in (401, 403):
        raise RuntimeError(
            "token invalid or expired — grab a fresh one from DevTools "
            "(Network tab → any studio-api request → Authorization header)")
    if status == 404:
        raise RuntimeError(f"song {song_id} not found (or it has no aligned lyrics)")
    if status != 200:
        snippet = body[:200].decode("utf-8", "replace")
        raise RuntimeError(f"Suno API returned HTTP {status}: {snippet}")
    try:
        return json.loads(body.decode("utf-8"))
    except Exception as e:
        raise RuntimeError(f"response is not valid JSON: {e}")


def main(argv=None):
    ap = argparse.ArgumentParser(
        prog="suno_fetch", description="Fetch a song's aligned-lyrics JSON from Suno.")
    ap.add_argument("song", help="suno.com/song/<id> URL or bare song id")
    ap.add_argument("-o", "--out", default="aligned_lyrics.json",
                    help="output file (default: aligned_lyrics.json)")
    ap.add_argument("-f", "--force", action="store_true",
                    help="overwrite the output file if it exists")
    a = ap.parse_args(argv)
    try:
        song_id = parse_song_id(a.song)
        # refuse the overwrite BEFORE asking for a token (tokens are short-lived)
        if os.path.exists(a.out) and not a.force:
            raise RuntimeError(f"{a.out} already exists — pass -f to overwrite")
        token = read_token()
        data = fetch_lyrics(song_id, token)
        nwords, nlines = validate_payload(data)
        with open(a.out, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False)
        print(f"saved {a.out} — {nlines} lines / {nwords} words")
        return 0
    except (ValueError, RuntimeError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
