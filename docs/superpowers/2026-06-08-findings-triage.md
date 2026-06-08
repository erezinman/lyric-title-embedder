# Findings triage — UX audit + feature-gap scan (2026-06-08)

Divides every finding from `ux-behavior-auditor` and `feature-gap-scout` (plus items either agent
left out) into work tracks. Two axes: **where the work lives** (backend = engine/daemon/MCP;
frontend = web/src) and **whether a designer decision is required**. Collapses to the requested
split:

- **TRACK A — proceed now (no designer):** pure backend, or frontend fixes whose correct behavior
  is unambiguous.
- **TRACK B — designer-gated:** UI/UX where the right behavior is a product/design choice.
- **SPANNING:** items whose backend part can proceed now while the UI part waits on B.

Severity/leverage carried from the source reports. "Det." = deterministic (one obviously-correct
outcome).

---

## TRACK A — proceed now (no designer input)

### A1. Backend (engine / daemon / MCP) — pure
| Item | Source | Kind | What | Effort |
|---|---|---|---|---|
| **SRT/VTT export** | gap#1 | feature | Add `to_srt`/`to_vtt` serializers (parser/builder already in `engine/srt.py`) + MCP tool + daemon route | S–M |
| **`set_video` dispatchable tool** | gap#2 (backend half) | feature | Wrap existing `ctx.set_video` (`daemon/library.py:90`) as an MCP/`/api/call` tool | S |
| **Re-import lyrics — same word-count path** | gap#3 (backend half) | feature | Expose `ctx.load_lyrics` as a tool; reconcile by `nwords` (differing-count is C/SPANNING) | M |
| **Export lint — compute side** | gap#10 (backend half) | feature | Aggregate `engine.anim.validate` + same-scope-overlap warnings + off-canvas `\pos`/clamped-trigger into a `lint_project` result | S–M |
| **Atomic multi-break/join op** | UX#2 (backend half) | bug→feature | New engine mutation `break_after_each`/`join_lines_multi` so a multi-cue gesture is ONE undo step | M |
| **Server history depth (`can_undo`/`can_redo`)** | UX#3 (backend half) | bug | Echo undo/redo availability in state so the UI can gate truthfully | S |
| **Echo correlation id** | UX#6 (backend half) | bug | Carry the originating call id on the WS state push so the client can match its own echo | S |

### A2. Frontend — deterministic bug fixes (correct behavior unambiguous)
| Item | Source | Sev | Fix | Effort |
|---|---|---|---|---|
| **Stale-box placement commit** | UX#1 | High | Snapshot `align`/`pinned` into `DragState` at drag start; commit against that (`PreviewStage.tsx:203/225-258`). (Micro-question — abort vs ignore an external align mid-drag — has a safe default: ignore + commit-against-snapshot.) | S |
| **Selection lost on external echo during merge/unmerge** | UX#6 | Med | Once A1 echo-id lands, consume `pendingSelRef` only on the matching echo (`Editor.tsx:195-215`) | S |
| **Undo/Redo gating + flash** | UX#3 | Med | Once A1 ships depth, gate disabled-state AND the flash on real availability (`Editor.tsx:116/138-152`) | S |
| **`groupExplicitSel` one-way latch** | UX#8 | Low | Reset on `clearSelection`/cue-select (`Editor.tsx:49/386-391`) | XS |
| **`bandH` snap-back on unrelated echo** | UX watch | Low | Preserve session-local band height across non-placement echoes (`PreviewStage.tsx:64/126-140`) | S |
| **Merge lead-tok selection re-derivation** | UX watch | Low | Verify/repair the "any id in set" match picks the merged cue, not a neighbor | XS |

---

## TRACK B — designer input needed (UI/UX decisions)

| Item | Source | Sev/Lev | The decision the designer owns |
|---|---|---|---|
| **Animation conflict warning surfacing** | UX#4 | Med | How a `ResolvedAnim.warning` reads to the user — strip tooltip? Inspector row badge? both? (engine already computes it) |
| **Strip retime affordance / focus model** | UX#5 | Med | Should an unfocused strip show a drag affordance/cursor? Or change the 2-click-to-focus model? |
| **Live(jassub)/Exact + `\pos` half-state** | UX#7 | Med | Badge wording ("Live · libass" vs "Live · approx") AND reconciling the `use_pos:true, pos:null` half-state with the toggle label |
| **Alt-bypass discoverability** | UX#9 | Low | Where the "hold Alt to free snapping" hint lives (placement stage help, magnet state visible across dock tabs) |
| **MCP-connect popover interaction** | UX#10 | Low | Make it a real toggle (click+focus, keyboard-reachable) and where connection info lives when WS is down — interaction pattern + a11y |
| **Merged-cue retime: track vs Inspector** | UX watch | — | Track drag may retime a merged cue the Inspector forbids ("un-merge to edit"). Which wins — consistent lock, or allow track retime? |
| **Arrow-nudge vs snap consistency** | UX watch | — | Keyboard nudge bypasses magnet while drags snap — intended, or should nudge snap too? |
| **Advanced animation editor** (channels/curves) | gap#6 | High lev | The big one: an "Advanced" Inspector sub-panel exposing the engine's latent channels (`scale_y`, `clip_rect` direction, multi-segment `accel` curves, `step_unit` toggle). Engine+tool already accept it; needs the editor design |
| **Search / find-replace surface** | gap#5 | Med | Where search lives (a panel? a TopBar field?), the replace-confirm flow, jump-to-time-at-playhead UX |
| **Find-by-time at playhead** | gap#5 | Low | The affordance for "select the cue under the playhead" |

---

## SPANNING — backend proceeds now, UI waits on designer

| Item | Source | Backend (Track A, now) | UI (Track B, designer) |
|---|---|---|---|
| **Multi-break/join undo trap** | UX#2 | atomic engine op (A1) | if not atomic, the "undo 3×" toast wording/affordance |
| **set_video** | gap#2 | tool wrapper (A1) | where the swap/clear-video control lives + confirm-on-swap |
| **Re-import lyrics** | gap#3 | same-count tool (A1) | differing-count reconcile UX + the re-import entry point |
| **Export lint** | gap#10 | compute (A1) | how/where warnings show in the export popover; block vs warn |
| **Portable style/anim presets** | gap#7 | scoped serializer + import/export tools | the preset library/management UI |
| **Version history / checkpoints** | gap#8 | snapshot store (start cheap: duplicate-project) | the history/restore UI + "duplicate" entry point |
| **Add / delete cues** | gap#4 | model hardening (stable word ids / reindex — the parked spec) | the add/delete gesture + where it lives |
| **Per-event `\pos` override** | gap#11 | per-event pos in the model + emit | how you pick which event, per-event placement UI |
| **Audio playback / real waveform** | gap#9 | NEW subsystem: audio import endpoint + PCM/peaks extractor + synced clock | waveform rendering + audio-scrub interaction (Aegisub-class) |
| **RTL / non-Latin / contrast** | gap#12 | bidi/ordering handling in the compiler | RTL editing UX + caption-vs-video contrast check UI |

---

## BLOCKED (prerequisite first)
- **Beat-grid stagger** (gap#13) — needs tempo metadata ingestion (and ideally the audio subsystem) before any UI. Keep parked.

## DELIBERATELY EXCLUDED (contradict shipped decisions — do not propose)
Absolute-time animation anchors · canvas W×H editing in the web (must match video PlayRes) ·
animation UI for the frozen Tk app · non-adjacent cue merge.

---

## Suggested order if we act
1. **Track A backend batch** (SRT/VTT, set_video, can_undo/redo, echo-id, atomic break/join, lint-compute) — all independent, parallelizable, no design.
2. **Track A frontend fixes** (the 6 deterministic bugs) — small, several depend on the A backend bits above.
3. **Track B** — bundle the designer questions (conflict-warning surfacing, strip affordance, Live/pos badge, Advanced animation editor, search surface, the spanning UI halves) into one handoff, same as the editor-iteration loop.
