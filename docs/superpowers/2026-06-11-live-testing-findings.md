# Live-testing findings (Electron desktop run, 2026-06-11)

Issues surfaced by running the packaged Electron app (`run-desktop.sh` → daemon serves `web/dist`,
ephemeral port). **Most are production-path bugs the dev-server e2e / jsdom tests never exercise** —
jassub/ffmpeg under the daemon, transport loop, caption windowing, panel sizing. Grouped + triaged.

## ✅ Fixed already (this session)
| # | Issue | Fix | Commit |
|---|---|---|---|
| A | Timeline playhead showed multiple heads | single head, gutter-aligned (kit Option A) | `3438c00` |
| B | AI pill falsely "live" | honest copy (no real agent signal exists) | `3438c00` |
| C | Project rail had an unwanted Animations section | removed | `3438c00` |
| D | Events panel overlap (500px grid in 320px rail) | CSS stopgap (shrinkable cols) | `3438c00` |
| E | Electron window/taskbar icon was default | logo-mark → PNG icon | `b3f74e2` |
| F | Event name editor showed scrollbars | `.ev .name:focus` overflow auto→hidden | (pending) |

## 🔶 Designer-gated (deferred per user)
| # | Issue | Note |
|---|---|---|
| G | Events UI disliked as a rail panel → **merge into Cue Lanes** | feasible ~1–1.5d (port controls onto `.lane-evt`; the wide dock fixes the overlap). Open design Q: multi-select-for-Merge interaction. **Wait for designer.** |

## 🐞 Open bugs — BATCH 1: timeline sizing & zoom (user-specified 2026-06-11)
| # | Issue | Root cause / plan |
|---|---|---|
| H | Timeline/Cue-lanes dock **almost always shows scrollbars** | The constant-height card rows (55px) + fixed dock height (252px) overflow fast. Want: (1) the dock **adjustable** (verify the Splitter resizes it; raise default/max), (2) scrollbars **only when controls are actually occluded** (min-content sizing, not eager overflow). |
| I | **H-zoom min should = whole song + ~5%** | Today hz∈[0.6,3]×68px/s (fixed scale, never fits long songs). Change: hz **minimum = fit-to-width** (song span × ~1.05 into the viewport), ranging up to a max zoom-in. (This is the fit-to-width the user now explicitly wants — supersedes the earlier "skip" decision.) |
| J | **V-zoom does nothing** | The `vz`→`rowH` value isn't actually applied to the row height in WordTrack. Wire `rowH`/`--row-h` so V-zoom changes lane height. |

## 🐞 Open bugs — BATCH 2: the preview pane is blank + transport (core feature)
| # | Issue | Root cause (diagnosed) |
|---|---|---|
| K | **Live preview blank** | jassub canvas mounts (1920×1080) but **doesn't paint** under the daemon-served build; in jass mode the CSS caption is a transparent hit-overlay → nothing visible. jassub works in dev-server e2e → environment-specific (likely missing **COOP/COEP** headers on the daemon, or worker/wasm under `--web-dist`). Fix dir: set COOP/COEP on daemon SPA responses; **and** make the CSS caption a visible fallback when jassub isn't ready. |
| L | **Exact preview blank** | `/api/frame` raises `RuntimeError: frame render failed` (`tools.py:387`, empty stderr) — yet the **same ffmpeg cmd run from the repo root succeeds**. → daemon **cwd/relative-path** issue: Electron daemon's cwd ≠ repo, so `projects/demo/video.mp4` (relative `ctx.video_path()`) doesn't resolve. Fix: resolve the video path absolutely (and/or the ass/out/fonts paths) in `render_frame`/`video_path`. |
| M | **No `<video>` in preview** | PreviewStage never renders a `<video>`; no daemon route serves the bytes. Add `GET /api/video` (HTTP Range) + a `<video>` layer behind the caption/jassub canvas (drive currentTime from `time`). |
| N | **Play doesn't advance the timeline** (no live time update) | Transport rAF loop not updating `time` in the packaged build (works in dev e2e G-30). Investigate the play loop / WS clock under Electron. |
| O | **"The whole lines are wrong"** | The `.cap` shows ~12 words from **multiple cues concatenated** at one time instead of the active cue's line(s). Caption windowing/`capWords` resolves too many. Investigate `capWords`/`wordSchedule`/resolve at time t. (May be related to N if `time` is stuck.) |

## 🐞 Open bugs — BATCH 3: live-update cluster (likely ONE root cause)
These all share a tell — **a continuous gesture doesn't update the UI live, but discrete commits do** —
and all work in the dev-server e2e, so it's a **packaged-build (prod) regression**, possibly a single cause
(stale closure / effect not running / rAF loop / global key listener not wired under prod React).
| # | Issue |
|---|---|
| N | Play doesn't advance the timeline/time live |
| P | Animation-boundary drag: handle is draggable but the bar **doesn't update during drag, only on drop** |
| Q | Magnet **"alt" badge doesn't change while Alt is held** (the altHeld key tracking isn't updating live) |

Hypothesis: a `useEffect` (rAF transport loop / window keydown-keyup for altHeld / drag preview subscription)
isn't taking effect in the production bundle (works in dev). Investigate one, likely fixes all three.

## 🐞 Other
| # | Issue | Note |
|---|---|---|
| R | "Timeline is gone" | NOT gone — it's a 65px 1-row strip ~24k px wide at fixed 68px/s for a 6-min song; only ~6% visible. **Same root as I (fit-to-width zoom).** |
| S | Cues not draggable | Likely the `unlocked` gate (drag off until timings unlocked) — verify the unlock affordance is discoverable, or fix if drag is broken when unlocked. |

## Suggested order
1. **Batch 1 (timeline sizing/zoom — H/I/J)** — concrete, self-contained, user-specified; fixes the most-visible daily friction.
2. **Batch 2 (preview cascade — K/L/M/N/O)** — the core feature is blank; bigger, production-path debugging (COOP/COEP, daemon cwd, transport, windowing). Likely its own mini-plan.
3. F commit + rebuild/relaunch so the user sees fixes.
4. G when the designer weighs in.

Notes: every fix here needs verification in the **packaged path** (daemon `--web-dist`), not just dev — the
gap is that our e2e runs the vite dev server. Worth adding a daemon-served e2e tier (flagged separately).
