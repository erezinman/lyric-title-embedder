# DEVLOG — `feat/designer-sync` (through 2026-06-11)

Durable state dump so work can resume after context compaction. Pairs with the open-issues triage
`docs/superpowers/2026-06-11-live-testing-findings.md` (read both).

## Environment / how to run
- **Repo:** `/home/erez/karaoke-subtitle-studio`. **Shell cwd is NOT the repo** (`/home/erez/audacity-config/Desktop`) — use absolute paths or `cd` inside the command (note: `cd` resets between tool calls).
- **Branch:** `feat/designer-sync` (deep stack of feat branches; all unmerged). **Remote:** `git@github.com:erezinman/lyric-title-embedder.git`. Push: `git push origin feat/designer-sync`.
- **Web dev run:** `./run.sh` → daemon `:8770` + vite `:5173`. `./kill.sh` clears `:8770`/`:5173`.
- **Electron (packaged) run:** `DISPLAY=:1 bash run-desktop.sh` (background). It **spawns its own daemon on an ephemeral port serving `web/dist`** (the *production* path). **MUST `npm --prefix web run build` first** or it serves a stale bundle. Quitting the window kills its daemon.
- **Stale daemons** on `:8788` (3-day) / `:8785` (2-day) from old sessions are harmless leftovers (different cwd/projects).
- **Verify:** `cd web && npx tsc --noEmit`; `npx vitest run` (~932 pass); `xvfb-run -a npx playwright test` (full e2e ~79); engine/daemon scripts `.venv/bin/python tests/<f>.py` (e.g. test_daemon, test_daemon_projects, test_video, test_event_fields, test_anim_daemon, test_srt, test_library_create).
- **Packaged-path headless harness** (how live bugs were diagnosed; the e2e gap): spawn `.venv/bin/python -m daemon --file-access native --projects-dir <TEMP COPY of projects> --web-dist "$PWD/web/dist" --port <free>`, then a playwright script UNDER `web/` (so it resolves `web/node_modules`): `import { chromium } from "playwright"`, goto the daemon origin, click `.proj:not(.new)` to open a project, screenshot to `/tmp/*.png` (read PNGs with the Read tool to view), `page.evaluate` for DOM state, capture `console`/`pageerror`. Use a TEMP copy of `projects/` so headless autosave doesn't touch real files.

## What this branch contains (the arc)
Ported designer zips 12→17 onto the React/TS app, then fixed live-run bugs. Major landmarks:
- **Track A** (zip 14 design fidelity): picker portal anti-flash, CSS fidelity, self-hosted variable fonts, dock-hint, favicon, Break/Join label, library-card metadata (backend `project_meta`).
- **Timeline density rework** (zip 15 §1–4): `model/trackPack.ts` (compact/coherent/lanes packing), constant-height anim bars (`animStrips.ts` `layoutBars`/`BLOCK_H`), `WordTrack` card rows + `.wt-scroller`, density toggle + H/V zoom + FLIP + selected-cue pin, expand-to-overlay accordion. **`BASE_PPS=68` fixed-scale timeline** (DAW-style, H/V zoom sliders, default density Lanes if events≤6 else Coherent).
- **Track B conflict fixes** (zip 16): nullable `SelState` + GROUP-anim-tier gate (#2+#6), merged-cue badge (#10i). Report: `docs/superpowers/2026-06-10-track-b-conflicts-report.md`.
- **zip-17 locked calls:** EventStrip→dock bottom, alignment caption+tooltip, magnet chip "alt", tier header band, GROUP preview hybrid, density-default rule.
- **Event Authoring feature** (zip 17): persisted `section`+`color` group fields (engine `io.py`/`mutations.py`/`mcp_server/tools.py` + `set_event_label/_section/_color`), `eventColor(group,gi)` helper, Events panel (`EventsPanel.tsx` in ControlsRail/Project rail), inline rename (CueLanes header + WordTrack gutter), section chip on `.lane-evt`. Spec `2026-06-10-event-authoring-design.md`, plan `2026-06-10-event-authoring.md`.
- **Live-run fixes:** single playhead (`3438c00`), honest AI pill, removed rail Animations, events-overlap stopgap, logo Electron icon (`b3f74e2`), event-name no-scrollbar + findings doc (`40f05e2`).

Recent commit landmarks (newest last): timeline rework (`66508f5`…`ea6d271`), section-chip+verifications (`4423ed4`), live fixes (`3438c00`), logo icon (`b3f74e2`), scrollbar+findings (`40f05e2`).

## OPEN WORK (resume here) — see findings doc for full triage
User decided: build all batches; **frontend batches are sequential** (all edit `Editor.tsx`/`WordTrack`/`theme.css`); the **preview backend + the new daemon-served e2e tier are independent** and can run alongside. User opted IN to **adding a daemon-served e2e tier**.

Tasks (TaskList): **#108 B3-backend (in_progress)**, #109 B3-frontend, #110 daemon-served e2e tier. Batch 1 (timeline fit/zoom) and Batch 2 (live-update cluster) not yet tasked.

**Batch 3 — preview pane (CORE feature blank). Start with B3-backend (#108), TDD:**
- **Exact-mode ffmpeg fails** in the daemon because cwd ≠ repo → relative `ctx.video_path()` (`projects/demo/video.mp4`) doesn't resolve (same cmd succeeds from repo root). Fix: make `render_frame` (`mcp_server/tools.py:372-390`) + `video_path` resolve **absolute** paths (video/ass/out/fonts). TDD: render_frame works after `os.chdir(tmp)`.
- **Add `GET /api/video` (HTTP Range)** serving the open project's video (`FileResponse`) — for the `<video>` element. Register in `daemon/app.py` beside POST/DELETE `/api/video`. **NOTE: `daemon/api.py` already imports `FileResponse` (line 3) and `daemon/library.py` was edited (has `set_project_video`, `_video_field` returns absolute for external paths)** — the user/linter touched these; check whether the GET route is partly started before adding.
- **Add COOP/COEP headers** (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) to daemon SPA/asset responses (`daemon/app.py` ~82-86) for jassub SAB/multithread. Verify it doesn't break same-origin asset/font/video loads (all same-origin, should be fine; fall back to `credentialless` if needed).

**Batch 3 — frontend (#109, after backend):** PreviewStage render `<video src=/api/video>` behind caption/jassub canvas (drive currentTime from `time`); **visible CSS-caption fallback when jassub isn't ready** (jassActive currently only flag-gated, not ready-gated — `PreviewStage.tsx:81,368`); **fix caption windowing** — `.cap` shows many cues' words concatenated at one time ("lines wrong") instead of the active cue.

**Daemon-served e2e tier (#110):** new playwright tier running against the daemon `--web-dist` (not vite dev); specs: live preview shows captions, exact frame loads, `<video>` present, caption windowing correct. Closes the prod-path gap that let all these through.

**Batch 1 — timeline fit/zoom/visibility (frontend, sequential):**
- H-zoom **min = whole song + ~5%** (fit-to-width); today fixed `BASE_PPS=68`×hz → 6-min song = ~24k px, only ~6% visible ("timeline gone" = a 65px×24k strip). `Editor.tsx` hz state + WordTrack `pxPerSecOverride`.
- **V-zoom does nothing** — `vz`→`rowH`/`--row-h` not applied to row height in WordTrack; wire it.
- **Playhead line behind cues** — raise `.wt-playhead` z-index above `.wt-block`.
- **Dock scrollbars** — scroll only when controls occluded (min-content sizing), and ensure the dock is adjustable (Splitter).

**Batch 2 — live-update cluster (likely ONE prod-bundle root cause):** Play doesn't advance time; anim-drag updates only on drop (not live); magnet "alt" badge doesn't change on Alt-hold. All "continuous gesture doesn't update live, commits do," all work in dev → a prod build effect/closure/listener regression (rAF transport loop / window keydown-keyup altHeld / drag preview). Investigate one → likely fixes all three. **Cues not draggable** is likely the separate `unlocked` gate (drag off until timings unlocked) — verify affordance.

## Deferred / decided (do NOT re-litigate)
- **Events UI → merge into Cue Lanes:** designer-gated (open Q: multi-select-for-Merge UX). Feasibility done (~1–1.5d). Wait for designer.
- **GLOBAL_STYLE default font:** engine "DejaVu Sans" vs kit "Space Grotesk" — 11/12 match; font is **report-only** (changing alters ASS + needs libass fontsdir + breaks golden tests). Not auto-fixed.
- **`ResolvedAnim.src` "tag" vs "cue":** internal nit, never designer-specified — not pursued.
- **Grip-reorder of events:** model-incompatible (events are time-ordered) — flagged to designer, not built.
- Skipped earlier as "my proposals not designer-spec": zoom fit-to-width + overlay auto-scroll — BUT fit-to-width is now explicitly requested (Batch 1).

## House rules
TDD-first for engine/daemon (and new pure modules); commit only the files you changed (never `git add -A`; CSVs/lockfiles live in repo); commit messages end `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; superpowers flow (spec→plan→subagent-driven) for features; **verify fixes in the packaged daemon-served path, not just dev**; subagent implementers should report BLOCKED rather than weaken tests or no-op.
