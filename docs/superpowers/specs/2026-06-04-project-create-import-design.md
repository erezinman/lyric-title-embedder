# Project Create/Import (Spec 1) — Design

**Status:** approved in brainstorming; pending written-spec review.
**Branch:** `feat/project-create-import`.
**Scope:** the foundation of the "New project" feature — create a project from a **file** source
(Suno aligned-lyrics JSON, or an SRT subtitle file), with an optional video, from the web UI. This
replaces the dead `onOpen("")` placeholder and fixes the "new project not pressable" bug.

**Explicitly out of scope (→ Spec 2):** live "Connect to Suno" fetch via a song link (Playwright
browser-connect). This spec only ingests files you already have. Spec 1 is independently shippable.

---

## 1. Goal

From the project library, a **New project** button opens a wizard. The user gives the project a
name, picks a **lyric source** (Suno JSON or SRT) and supplies the file (upload, or — only when the
daemon and browser are on the same host — a server-side path), optionally attaches a video, tweaks
source-specific **advanced** options, and clicks **Create**. The daemon materializes a
self-contained project folder, opens it, and the UI switches to the editor.

## 2. Background — the data model (why the two sources differ)

The engine is built on **word atoms** (`{text, start, end}`) — immutable timing units. `make_project`
ingests Suno's `aligned_lyrics` (line entries each carrying nested `words` sub-fragments + a
`section` label), runs `reconstruct_lines` (merge lowercase continuations) then `merge_subwords`
(start a new atom on a leading-whitespace fragment). On top of atoms sit **tokens/cues** (one or more
atoms; `sep` = `" "`/`""` controls space-vs-glued merges), **lines** (newline boundaries within a
layout event), and **groups** (layout events; fully dynamic via `layout_merge` / `layout_ungroup` /
`layout_split_event` / `add_break`). **Timing + text come from the source; merges and all styling are
manual, added later in the editor. Nothing is pre-merged on import** (every atom starts as its own
token). Group/section labels and line breaks are a *starting draft* the user reshapes freely.

Persistence is folder-based and self-contained (`daemon/library.py`): a project is
`<dir>/<name>/{lyrics.json, project.json}`. `open_project` does `load_lyrics(lyrics.json)` →
`apply_cues(project.json.cues_v2)`. Crucially, `serialize_cues` already persists `words:[{text,
start, end}]` and `apply_cues` restores them when `len == nwords` — so **exact word timings and the
full layout live in `project.json/cues_v2`**, while `lyrics.json` only needs to reproduce the right
*number* of atoms with the right *text*. This is what lets SRT (with synthesized arrangement) round-
trip faithfully.

### Suno JSON source
The uploaded/--referenced file is a Suno aligned-lyrics response and becomes `lyrics.json`
**verbatim**. Initial words, lines, and section labels are Suno-derived (cleaned by the existing
loader). Advanced options: `group_by` (`section`|`line`, default `section`) and `skip_dashes`
(default `true`) — passed straight to `make_project`.

### SRT source
An SRT carries only **cue-level** timing. Import:
1. **Split** each cue's text into words; each word becomes an atom.
2. **Share timing:** every atom from a cue gets that cue's `[start, end]` (no synthesized
   distribution). Behaviorally the cue's words reveal/fade together at the cue start; the user can
   pull individual word times apart later via the timing editor.
3. **Line-break strategy** (advanced; default **No breaks**): determines the *initial* line layout.
   - **No breaks (single line)** — default. Rationale: the common case is "add a few newlines," not
     "delete most of the per-cue newlines."
   - **Every N words** — user sets N.
   - **On punctuation** — break at `,` / `.` / `!` / `?` / `;` / `:`.
   - **One line per cue.**
4. **Seed group:** all atoms land under one layout event with section label `"Subtitles"` — a seed
   the user regroups freely (groups are dynamic).

Mechanics: `engine/srt.py` parses the SRT and produces (a) a `lyrics.json` in aligned-lyrics shape
whose atoms are exactly the SRT words — one `aligned_lyrics` entry per cue, each word emitted with a
**leading space** so `merge_subwords` keeps them as distinct atoms regardless of any
`reconstruct_lines` line-merge — and (b) the initial project arrangement (shared cue timings + the
chosen line layout + seed group). The arrangement is saved as `cues_v2`, so it is authoritative on
reopen; the base layout `make_project` derives from `lyrics.json` is overlaid/replaced by `apply_cues`.

## 3. Daemon changes

### 3.1 `GET /api/env`
Returns `{ "same_host": bool }`. `same_host` is true when `request.client.host` ∈ {`127.0.0.1`,
`::1`}. The web UI uses this to decide whether to offer the **server path** input. *Caveat:* the
Vite dev proxy is itself loopback, so in dev this always reports same-host — which is correct, since
the daemon *is* local in dev. (Same `/api` auth/CORS as other routes.)

### 3.2 `library.create_project(...)` — single source of truth
```
create_project(ctx, projects_dir, name, *, source,            # "suno_json" | "srt"
               lyrics_bytes=None, lyrics_path=None,            # exactly one
               video_bytes=None, video_path=None, video_name=None,  # optional, at most one of bytes/path
               group_by="section", skip_dashes=True,          # suno_json only
               line_break="none", n_words=5)                  # srt only
        -> str   # the created project name
```
Steps (atomic; nothing partial left on failure):
1. `name = _safe(name)`; if `<dir>/<name>` already exists → raise `FileExistsError` (→ HTTP 409).
2. Materialize `lyrics.json` into a temp area then into the folder:
   - `suno_json`: write `lyrics_bytes` / copy `lyrics_path` verbatim. Validate it's JSON with a
     non-empty `aligned_lyrics`; else `ValueError`.
   - `srt`: parse via `engine.srt.parse_srt(text)`; `ValueError` on malformed input. Produce
     `lyrics.json` (aligned-lyrics shape, leading-space atoms).
3. Create the folder; write `lyrics.json`.
4. Video (optional): `video_path` → store the **absolute path** reference (no copy); `video_bytes`
   → write into the folder as `video<ext>` (ext from `video_name`) and reference that. Set
   `ctx.set_video(resolved_path)`.
5. `open_project(ctx, projects_dir, name)`. For SRT, the word timings already arrive *shared*
   from `lyrics.json` (each cue's words carry that cue's `[start,end]`), so the only post-open step
   is to apply the chosen **line-break layout + seed group** before saving. For Suno JSON no extra
   step is needed.
6. `save_project(...)` (persists `cues_v2` incl. the SRT arrangement + the video reference).
7. On any failure after the folder is created, remove the folder before re-raising.

### 3.3 `library.save_project` / `open_project` — video field
`save_project` writes `project.json` `{globals_style, cues_v2, video}` where `video` is the current
`ctx.video_path()` (absolute path or folder-relative filename), or `null`. `open_project` restores
it via `ctx.set_video(...)` (resolving folder-relative names against the project folder).

### 3.4 `POST /api/projects/create` (multipart)
`multipart/form-data` (needs the `python-multipart` dependency). Fields: `name`, `source`,
`lyrics_file` **xor** `lyrics_path`, optional `video_file` **xor** `video_path`, `group_by`,
`skip_dashes`, `line_break`, `n_words`. Parses → `create_project(...)`. Returns `{ "opened": name }`.
Errors map to: 400 (bad/missing input, unparseable JSON/SRT, invalid name), 409 (name exists),
422 (engine error). Each returns `{ "error": "<message>" }` shown inline by the modal.

### 3.5 `POST /api/projects/new` (legacy JSON) → thin shim
Keeps `{name, lyrics_path}` working by delegating: `create_project(ctx, dir, name,
source="suno_json", lyrics_path=path)`. **Zero duplicate logic**; preserves any existing caller.

## 4. Web changes

### 4.1 `components/library/CreateProjectModal.tsx` (new)
Built from existing v3 atoms (`.text-inp`, `.combo`, toggle, buttons, modal/overlay styles).
- **Name** (`.text-inp`).
- **Source** segmented toggle: *Suno JSON* / *SRT*.
- **Lyrics input:** a per-file **Upload ⇄ Server path** switch. The *Server path* choice is rendered
  only when `/api/env` reports `same_host: true`; otherwise upload-only. Upload = `<input type=file>`;
  Server path = a `.text-inp` for an absolute path.
- **Video (optional):** same Upload ⇄ Server-path control.
- **Advanced** (collapsible), source-dependent:
  - Suno JSON → `group_by` select + `skip_dashes` toggle.
  - SRT → `line_break` select (No breaks / Every N words / On punctuation / One line per cue) +
    an N field shown only for "Every N words".
- **Create** / **Cancel**. Inline error banner from the daemon; on error the modal stays open.
- On success → call `onCreated(name)` which runs the existing open path and switches to the editor.

### 4.2 `api/client.ts`
- `getEnv(): Promise<{ same_host: boolean }>`.
- `projects.create(form: FormData): Promise<{ opened: string }>` — POST `multipart/form-data` to
  `/api/projects/create` (no explicit `Content-Type`; let the browser set the boundary). Keep the
  legacy `projects.create(name, lyrics_path)` JSON helper renamed to `projects.createFromPath` (or
  drop it — no live caller after the modal lands).

### 4.3 `components/library/ProjectLibrary.tsx` + `App.tsx`
Both "New project" controls open the modal (state in `App` or library), not `onOpen("")`. On
`onCreated(name)` → existing `open(name)` flow.

## 5. Error handling

- Missing name / both-or-neither lyrics inputs / unparseable JSON or SRT / non-existent server path →
  400 with a clear message.
- Name collision → 409 ("a project named '<name>' already exists").
- Engine/open failure → 422.
- The daemon never leaves a half-created folder (step 7 above). The modal surfaces the message inline
  and stays open so the user can correct and retry.

## 6. Testing

**Python (stdlib `assert` scripts under `tests/`, run via `.venv/bin/python tests/<f>.py`):**
- `engine/srt.py` (TDD, test-first — not deferred):
  - **Parse:** well-formed SRT (sequential indices, `hh:mm:ss,mmm` → seconds with ms precision,
    multi-line cue text joined), blank-line cue separation, trailing/leading whitespace tolerance.
  - **Word-split + shared timing:** each cue's text splits into words; every resulting atom carries
    that cue's `[start, end]` (assert exact equality across a cue's atoms).
  - **Atom-count fidelity:** total atoms == total words across all cues (no accidental merges/drops);
    punctuation stays attached to its word.
  - **make_project round-trip (critical):** feed the generated `lyrics.json` through the *real*
    `engine.make_project` and assert `len(words) == expected` and `words[i].text` matches — i.e. the
    leading-space atom boundary survives `reconstruct_lines` + `merge_subwords`, including a
    **lowercase-leading cue** (which `reconstruct_lines` would line-merge) where the atoms must still
    stay distinct.
  - **Line-break strategies:** each of No-breaks (default → single line), Every-N-words (respects N),
    On-punctuation (breaks at `,.!?;:`), One-line-per-cue produces the expected line layout; seed
    group label is `"Subtitles"`.
  - **Errors:** malformed SRT (bad timecode, missing arrow, empty file) → `ValueError`.
- `library.create_project`: suno_json from bytes and from path; srt from bytes; optional video
  (path → referenced, bytes → copied into folder); name collision → `FileExistsError`; failure
  leaves no folder; `save`→`open` round-trip restores video and (for SRT) the exact word timings +
  layout (`nwords` matches; `cues_v2.words` applied).
- Daemon: `GET /api/env` loopback → `same_host:true`; `POST /api/projects/create` happy paths
  (suno upload, srt upload, same-host path, +video) and error codes (400/409/422); legacy
  `/api/projects/new` still creates a listable project (delegates to `create_project`).

**Web (Vitest + RTL):**
- Modal renders both sources; switching source swaps the Advanced controls (group_by/skip_dashes vs
  line_break/N).
- Server-path option hidden when `getEnv` returns `same_host:false`, shown when `true`.
- "Every N words" N field appears only for that strategy.
- Successful create posts a `FormData` to `/api/projects/create` and calls `onCreated`.
- Daemon error response is shown inline and the modal stays open.

**Tk suites:** unaffected; batch at the end per project convention.

## 7. File map

- **Create:** `engine/srt.py`; `web/src/components/library/CreateProjectModal.tsx`;
  `tests/test_srt.py`; `tests/test_library_create.py` (+ web test files).
- **Modify:** `daemon/api.py` (`/api/env`, `/api/projects/create`, shim `/new`);
  `daemon/app.py` (routes); `daemon/library.py` (`create_project`, `save_project`/`open_project`
  video); `engine/__init__.py` (export `srt`); `web/src/api/client.ts`;
  `web/src/components/library/ProjectLibrary.tsx`; `web/src/App.tsx`; `web/src/theme.css` (modal
  styles if missing); `pyproject`/requirements (`python-multipart`).

## 8. Open follow-ups (not this spec)

- **Spec 2:** "Connect to Suno" — Playwright persistent-profile browser-connect; paste a song link;
  daemon fetches `aligned_lyrics/v2` (fresh token via in-page Clerk `getToken()` or network capture);
  plugs a third source into this modal.
