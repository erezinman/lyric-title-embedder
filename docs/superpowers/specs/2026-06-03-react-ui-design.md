# v3 Web UI (Spec B) — React/Vite editor over the engine daemon

**Date:** 2026-06-03
**Status:** Approved for planning (pending user review)
**Branch:** `feat/react-ui`
**Parent:** Spec A (`2026-06-03-engine-daemon-design.md`) + addendum A.1
(`2026-06-03-daemon-get-project-addendum.md`). **Sibling/deferred:** Spec C (Tauri shell).

## Context

The unified engine daemon serves `/api` (HTTP tool calls), `/ws` (full-project state push), and
`/mcp`, all over one shared `Session`. The Synthwave v3 design kit
(`design-system/ui_kits/desktop-app/`) is a browser prototype (CDN React + `@babel/standalone`,
`window.*` globals, a local fake model). This spec turns that prototype into a real **Vite + React +
TypeScript** app under `web/`, wired to the live daemon, and brings the kit's data model in line with
the now-UI-agnostic engine (fade tags `{ids,trigger}`, per-group `fade` waterfall, no palette/color).

**Scope: the full editor in one spec** — Project Library, the editor (cue lanes, 3-tier style
waterfall + new group-fade rows, fade-group panel, locked timing, ops toolbar, event strip), Live
(CSS) + Exact (`/api/frame`) preview, and burn/export with WS progress.

## Decisions (locked)

| Topic | Decision |
|---|---|
| Toolchain | **Vite + React + TypeScript**, app under `web/`. |
| State | **Server-authoritative, push-driven.** Client state = latest `/ws` `get_project` snapshot. Every edit is a `POST /api/call`; the daemon mutates the shared session and broadcasts the new project; the client renders it. No local model mutation, no local history. |
| Undo/redo | `api.call("undo"/"redo")` (one shared server timeline). Buttons **always enabled** (server no-ops when the stack is empty) — no daemon `can_undo` field added. |
| Serving | **Dev-only:** Vite dev server (HMR) proxies `/api`, `/ws`, `/mcp` → `127.0.0.1:8770`. No production static mount yet (deferred). |
| Testing | **Vitest** (pure TS units) + **React Testing Library** (key widgets). No live daemon in tests (mock fetch/WS). |
| Colors | Client-owned brand `PALETTE`; group color = `gi % 10`, fade-group color = tag index. Engine sends no palette/color. |
| Fade durations | Group-only waterfall (`global < group`), surfaced as group-tier rows in the inspector. No cue-tier fade (mirrors `border_style`). |
| Coexistence | The CTk app and MCP are untouched; this is a third front-end over the same daemon. |

## Architecture

```
web/
  package.json  tsconfig.json  vite.config.ts      # proxy /api,/ws,/mcp -> 127.0.0.1:8770
  index.html    src/main.tsx    src/theme.css       # theme.css ported from the kit
  src/
    types.ts                 # typed get_project payload + key lists (below)
    api/
      client.ts              # call<tool,args>(); getRender(); getFrame(t); getAss();
                             #   projects.list/new/open/save; burn(); burnStatus(id)
      useProjectStore.ts     # /ws subscription -> {project, connected, lastExternal};
                             #   call() = POST then await push; undo()/redo(); reconnect
    model/
      resolve.ts             # pure: resolveStyle (cue->group->global),
                             #   resolveFade (group->global), eventWindow, wordSchedule
      palette.ts             # PALETTE (brand) + colorForIndex(i)
    components/
      icons/Icon.tsx
      atoms/{Toggle,Stepper,Select,Combo,Swatches,Chip}.tsx
      TopBar.tsx
      library/ProjectLibrary.tsx
      stage/{PreviewStage,Waveform,WordTrack}.tsx
      panels/{ControlsRail,StyleWaterfall,FadeGroupPanel,TimingPanel,CueLanes,OpsToolbar,EventStrip}.tsx
      Editor.tsx
    App.tsx                  # library <-> editor routing
  src/**/*.test.ts(x)        # Vitest + RTL, co-located
```

Each module has one responsibility: `api/` talks to the daemon; `model/` is pure derivation;
`components/` render + raise intents; `Editor.tsx` holds client-only **selection** state (which
cue/group/word, which tier) and dispatches edits through the store.

### Typed model (`types.ts`) — mirrors `get_project`
```ts
type Word = { text: string; start: number; end: number };
type Token = { ids: number[]; sep: string; del: boolean; style: Partial<StyleOverrides> };
type LayoutGroup = {
  label: string; accumulate: "words" | "lines" | "off";
  win_start: number | null; win_end: number | null; linger: number | null; del: boolean;
  style: Partial<StyleOverrides>; fade: Partial<FadeOverrides>;
  lines: { toks: Token[] }[];
};
type FadeTag = { ids: number[]; trigger: number | null };
type GlobalStyle = { font: string; fontsize: number; bold: boolean; primary: string;
  outline: string; back: string; back_alpha: string; outline_w: number; shadow: number;
  border_style: number };
type Placement = { align: number; play_w: number; play_h: number;
  margin_l: number; margin_r: number; margin_v: number; pos: [number, number] | null };
type Globals = { fade_in_ms: number; fade_out_ms: number; linger: number };
type Project = { words: Word[]; layout: LayoutGroup[]; fin_tags: FadeTag[]; fout_tags: FadeTag[];
  globals: Globals; global_style: GlobalStyle; placement: Placement };
// StyleOverrides = the 10 STYLE_KEYS; CueStyleOverrides = 9 (no border_style); FadeOverrides = {fade_in_ms, fade_out_ms}
const STYLE_KEYS = ["font","fontsize","bold","primary","outline","back","back_alpha","outline_w","shadow","border_style"];
const CUE_STYLE_KEYS = STYLE_KEYS.filter(k => k !== "border_style");
const FADE_KEYS = ["fade_in_ms","fade_out_ms"];
```

### State store (`useProjectStore.ts`)
Opens `/ws`; on each `{type:"state", state}` message, replaces `project`. Exposes:
- `project: Project | null`, `connected: boolean`.
- `call(tool, args)` → `POST /api/call {tool,args}`; resolves with the tool result or throws on
  `{error}`. State updates arrive via the subsequent push (not the POST response).
- `undo()` / `redo()` → `call("undo"/"redo")`.
- Reconnect with backoff on socket close; on reconnect, `GET /api/state` to resync.
- Tracks in-flight local calls; a push arriving with no pending local call sets a transient
  `lastExternal` marker (drives the AI pulse/toast).

### Edit dispatch (kit fn → tool call)
`set_group_style(gi, partial)` · `set_cue_style(word_ids, partial)` · `set_group_fade(gi, partial)` ·
`make_fade_tag(kind, word_ids)` · `clear_fade_tag(kind, word_ids)` ·
`set_fade_tag_props(kind, word_ids, trigger)` · `set_layout_props(gi, …)` · `merge_events` ·
`ungroup_event` · `split_event` · `break_line` · `merge_words` · `delete_words`/`restore_words` ·
`set_fade_defaults` · `set_globals` · `undo`/`redo`. `null` in a partial clears an override.
"Merge selection" maps to a sequence of adjacent `merge_words(gi,li,ti,sep)` calls.

### Preview
- **Live (CSS approx):** `PreviewStage` renders the active event's caption from `project` + the local
  scrub `time`, using ported `wordSchedule`/`resolveStyle`/`resolveFade`. Word colors/box come from
  resolved styles; fade in/out approximated with CSS opacity transitions. A "CSS approx" badge.
- **Exact (libass):** `GET /api/frame?t=<sec>` → object URL → `<img>`; a "Render exact frame @ t"
  button + "libass" badge.
- A `Live | Exact` segmented toggle switches modes.

### Burn / export
`POST /api/burn {out, video_in?}` → `{job_id}`. Progress arrives on `/ws` as `{type:"burn", job}`
(the store also exposes `burn` messages); a progress bar + final toast. (`GET /api/burn/{id}` is the
poll fallback.)

### Colors & fades (model alignment)
- `palette.ts` holds the brand 10-color `PALETTE`; `colorForIndex(i) = PALETTE[i % 10]`.
- Event/group band = `colorForIndex(gi)`; fade-group band = `colorForIndex(tagIndex)` where
  `tagIndex` is the tag's position in `fin_tags`/`fout_tags`.
- `FadeCell` shows `@<trigger> / <dur>`: `trigger` from the tag (italic-grey "auto" when `null`);
  `dur` from `resolveFade(group)` (grey when the group inherits global, solid when overridden).
- `FadeGroupPanel` edits **trigger only** (`set_fade_tag_props(kind, ids, trigger)`); duration is
  edited at the group tier.
- StyleWaterfall GROUP tier gains two fade rows (`fade_in_ms`/`fade_out_ms`) → `set_group_fade`;
  CUE tier omits them (and `border_style`), GLOBAL fade defaults edit `project.globals` via
  `set_fade_defaults`.
- `use_pos` is derived in the UI as `placement.pos != null`.

## Error handling
- `api.call` rejects on `{error}` / non-2xx → a toast with the message; the editor stays on the last
  good pushed state.
- WS close → auto-reconnect (exponential backoff, capped); a "reconnecting…" indicator; on open,
  `GET /api/state` resyncs.
- `getFrame`/`burn` failures → toast; preview falls back to Live.
- Malformed/absent project (no project loaded) → the library view (open something first).

## Testing
**Vitest (pure):**
- `resolve.ts`: `resolveStyle` precedence (cue>group>global; `border_style` group-only),
  `resolveFade` (group override vs global fallback), `eventWindow` (auto vs overrides + linger),
  `wordSchedule` (accumulate words/lines/off; fade-in default vs fin-tag trigger; fout opt-in) — cases
  mirroring the Python engine tests.
- `palette.ts`: `colorForIndex` wraps at 10.
- `api/client.ts`: `call` posts `{tool,args}` and unwraps `result`/throws on `error` (mock `fetch`).
- `useProjectStore`: a mock WS message replaces `project`; `call` posts and the next push updates
  state; a push with no in-flight call sets `lastExternal`; reconnect resyncs.

**RTL (components):**
- `StyleWaterfall`: inherited prop renders grey with a source chip; overridden renders solid with a
  `×` that calls `set_group_style`/`set_cue_style` with `null`; GROUP tier shows `border_style` +
  fade rows, CUE tier does not.
- `CueLanes`/`FadeCell`: band color by index; `@trigger/dur` shows inherited (grey) vs overridden
  (solid); merged token shows the joined text + glyph; soft-deleted token struck through.
- `OpsToolbar`: button enablement (group-fade/merge/split/break/delete) reflects selection.
- `PreviewStage`: Live vs Exact toggle swaps CSS overlay vs `<img>`; "Render exact frame" calls
  `getFrame`.

## Verification
1. `python -m daemon --port 8770` and `npm --prefix web run dev`; open the Vite URL.
2. Library lists projects; open one → editor renders from the `/ws` push.
3. Edit a group style / set a group fade / group a fade / merge words → the change round-trips
   (POST → push → re-render); undo/redo reverts/replays.
4. Drive an edit over `/mcp` (or a second tab) → this client updates (shared session) with the AI
   pulse/toast.
5. Live preview scrubs; Exact frame renders a PNG at `t`; burn reaches done with progress.
6. `npm --prefix web run test` is green; `npm --prefix web run build` succeeds.

## Out of scope
Production static serving from the daemon, the Tauri shell (Spec C), per-cue fade overrides,
word-level text/timing editing (locked — "coming soon"), animation presets ("coming soon"),
placement-editing UX, and diff-based WS pushes.
