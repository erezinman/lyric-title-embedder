# Interaction-Audit Inventory (work queue)

97 distinct interactive controls across 20 components (Phase-1 exploration). Each control owes:
**[A]ction** (UI before/after + dispatch contract), **[R]evert symmetry** (inverse restores UI+data),
**[D]ouble action** (defined semantics under repetition), **[G]ating** (disabled ⇒ no dispatch),
plus the **[X] external-sync** facet test (cluster F). Writers tick boxes as tests land; a control
with no applicable kind is marked n/a in the test file comment.

## Cluster A — Shell (TopBar + Editor chrome) → `Editor.shell.audit.test.tsx`, `TopBar.audit.test.tsx`
- [ ] Brand/home click (A)
- [ ] Play/Pause (A, R: pause stops clock, D: double-press = paused at later t; exact-mode switch-to-live)
- [ ] Seek back/fwd ±2s (A, R: back+fwd net zero, D, clamping at 0/dur)
- [ ] Undo / Redo buttons (A, G)
- [ ] Export toggle (A, R: toggle twice = closed, D)
- [ ] Rail tabs project/inspector (A, R, D)
- [ ] Dock tabs timeline/lanes (A, R, D)
- [ ] Esc clears selection (A; G: not in inputs)
- [ ] Arrow / Shift+Arrow timing nudge (A: set_word_times args, R: left+right net zero, G: locked)
- [ ] Rail splitter drag (A, R: drag back restores width+localStorage, D: dblclick reset)
- [ ] Dock splitter drag (A, R, D) + arrow-key nudge (A, R)
- [ ] Error toast surfacing on failed dispatch (A)

## Cluster B — Placement → `PreviewStage.audit.test.tsx`, `ControlsRail.audit.test.tsx`, `AlignGrid.audit.test.tsx`
- [ ] Live/Exact mode buttons (A, R, D)
- [ ] Render-exact button (A; G: exact mode only)
- [ ] Caption word click select (A, R: reselect/deselect semantics)
- [ ] Box body drag (A: margins args, R: drag-back nets original margins, D: two drags compose)
- [ ] 8 resize handles (A each incl. clamps/min-size, R: resize-back, band-height persistence)
- [ ] Esc mid-drag (A: no dispatch + visual restore)
- [ ] Click-no-move (G: no dispatch)
- [ ] Pin drag in pos mode (A: pos args, R, Esc)
- [ ] Drag readout chip appears/updates/disappears (A)
- [ ] Free-placement toggle (A: use_pos+pos derive, R: off reverts to margins, D: on-off-on stable)
- [ ] Alignment grid in Project tab (A per cell, R, G: disabled when pinned)
- [ ] Waveform click-seek (A, R: seek back, D)
- [ ] AlignGrid atom: open/close/backdrop/Esc/9 cells/disabled (A, R, D, G)

## Cluster C — Inspector → `StyleWaterfall.audit.test.tsx`, `Timing.audit.test.tsx`, `Fade.audit.test.tsx`
- [ ] Tier select global/group/cue (A, R)
- [ ] Per style key × {global, group, cue} set (A: correct tool + partial; cue: word_ids) — font n/a (display), fontsize, bold, primary, outline, back, back_alpha, outline_w, shadow (steppers/toggle/swatches)
- [ ] border_style modes (group/global only) (A, R, G: absent at cue tier)
- [ ] align grid (group/global only) (A, R, G: absent at cue tier)
- [ ] Clear-override × per key × tier (A: null partial, R: set→clear restores inherited display)
- [ ] Stepper double-press = 2 steps; min/max clamps (D)
- [ ] Group fade rows ±50ms + clear (A, R, D)
- [ ] FadeDefaultsPanel 3 steppers (A: set_fade_defaults single key, R, D, min 0 clamp)
- [ ] FadeGroupPanel trigger ±0.5/auto/clear (A, R, G: renders only with tags)
- [ ] TimingPanel lock toggle (A, R, D)
- [ ] Start/End fields: change+Enter/blur commit, ArrowUp/Down step (A: set_word_times, R, G: locked/merged)
- [ ] Text field commit (A: set_word_text, R: retype original, G: merged)
- [ ] EventStrip accumulate 3-way + linger ± (A: set_layout_props, R, D)

## Cluster D — Dock → `WordTrack.audit.test.tsx`, `CueLanes.audit.test.tsx`, `OpsToolbar.audit.test.tsx`
- [ ] Lane event header select + collapse chevron (A, R, D)
- [ ] Lane row click / ctrl / shift selection incl. visual .sel/.multi (A, R: ctrl-toggle off, D)
- [ ] WordTrack block click select (locked mode) (A)
- [ ] WordTrack block drag move (unlocked) (A: set_word_times, R: drag back nets original, D)
- [ ] Multi-select group drag preserves diffs (A, R)
- [ ] Block resize handles l/r (A, R)
- [ ] Esc mid-drag cancels, preserves selection (A)
- [ ] OpsToolbar: group fade-in/out (A: make_tag, R: clear, G)
- [ ] Clear fade (A: clear_tag, G)
- [ ] Merge words (A: merge_word_span, G: <2 or non-adjacent toast, D)
- [ ] Break line toggle (A: break_line / join_lines, R: toggle twice = original, G)
- [ ] Merge events / Split event / Ungroup event (A, R: merge↔split, G)
- [ ] Delete/Restore (A: delete_words/restore_words, R: toggle restores, D)
- [ ] Undo/Redo toolbar (A, G)

## Cluster E — Modals → `CreateProjectModal.audit.test.tsx`, `ProjectLibrary.audit.test.tsx`, `ExportMenu.audit.test.tsx`
- [ ] Library: open project card, New-project ×2 entry points (A)
- [ ] Modal: every field/toggle/segmented control (17) incl. source-dependent advanced swap (A, R, D)
- [ ] Create gating: name+lyrics required; busy state (G)
- [ ] Create success path → onCreated; error stays open with banner (A)
- [ ] Overlay click / Close / Cancel (A)
- [ ] ExportMenu: out field, video field gating (same-host), Burn args, Download .ass blob, Enter/Space on row, error banner (A, R, G)

## Cluster F — External sync (WS = MCP path) → `ExternalSync.audit.test.tsx`, `e2e/external-sync.spec.ts`
For EVERY mutating tool: externally-pushed state renders correctly with zero UI interaction (+ revert):
- [ ] set_globals: align, margins, pos/use_pos, fontsize/colors… → Project tab, box/pin, caption
- [ ] set_group_style / set_cue_style per key → inspector values, caption scale/bold/fill
- [ ] set_group_fade / set_fade_defaults → fade panels
- [ ] make_tag / clear_tag / set_fade_tag_props → lanes fade columns, FadeGroupPanel
- [ ] set_layout_props (accumulate/linger/win) → EventStrip, lanes header
- [ ] toggle_word_del ± → lanes strikethrough, caption omission
- [ ] set_word_times / set_word_text → lanes, timeline blocks, TimingPanel
- [ ] break_line / join_lines → lanes line-break dividers, caption lines
- [ ] merge_words / merge_word_span → lanes merged token, caption text
- [ ] merge_events / split_event / ungroup_event → lanes headers, WordTrack lanes
- [ ] undo / redo from another client → full UI revert
- [ ] set_video → Project tab video name
- [ ] external-edit detection: unsolicited push ⇒ "AI agent updated the project" toast; local-call echo ⇒ NO toast
- [ ] e2e extras: WS reconnect after daemon restart; burn-progress push rendering

## E2E tier (per cluster, written by same writers)
`web/e2e/<cluster>.spec.ts` — round-trip template: baseline `/api/state` → interact → assert state diff + UI/CSS/geometry → inverse → assert both at baseline. Reset via `resetProject()` between tests.
