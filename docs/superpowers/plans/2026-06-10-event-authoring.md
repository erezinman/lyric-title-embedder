# Event authoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** An Events panel that authors SRT-import gaps — group cues into events, name them, set a section, set linger, and give each event a brand color that recolors it everywhere. Two new persisted group fields (`section`, `color`) + thin label/section/color mutations; reuse existing merge/split/ungroup/window-linger. No ASS-compile change.

**Architecture:** Backend first (TDD): thread `section`/`color` through `engine/io.py` + constructors + `layout_ungroup` + MCP projections, add `set_event_label`/`set_event_section`/`set_event_color`. Frontend: `eventColor` helper swaps ~6 color sites; Events panel in the Project rail; inline rename in CueLanes + WordTrack gutter.

**Tech:** Python engine (script-style tests via `.venv/bin/python tests/<f>.py`, TDD-first per house rule); Starlette daemon (generic `getattr` dispatch — new tools auto-callable); React/TS + Vitest; Playwright e2e. Spec: `docs/superpowers/specs/2026-06-10-event-authoring-design.md`. Prototype: `docs/superpowers/zip15-decisions/resources/Event-Authoring.html`.

**House rules:** engine/daemon code TDD-first. Commit only listed files (never `git add -A`). `cd web` for npm; `.venv/bin/python` for engine tests.

---

## Phase 1 — Backend: `section`/`color` fields + label/section/color mutations (TDD-first)

### Task 1: thread `section` + `color` through persistence + projections, add 3 setters

**Files:**
- Modify: `engine/io.py` (`_ser_group` ~20, `_apply_group` ~58)
- Modify: `engine/mutations.py` (`layout_ungroup` ~273; add 3 setters)
- Modify: `mcp_server/tools.py` (`_event_view` ~36; `get_project` layout projection ~114; add 3 tools)
- Modify: `mcp_server/server.py` (register the 3 tools, if it has an explicit registry)
- Test: `tests/test_event_fields.py` (create, script-style)

- [ ] **Step 1: Write the failing test** — `tests/test_event_fields.py` (mirror the existing script-style harness, e.g. `tests/test_library_create.py`):

```python
# tests/test_event_fields.py — section/color group fields + label/section/color setters.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine import io, mutations, model

results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}\n{traceback.format_exc()}"))

def _proj():
    # minimal 2-word, 1-group project
    p = {"words": [{"text":"a","start":0.0,"end":1.0},{"text":"b","start":1.0,"end":2.0}],
         "globals": dict(model.BUILTIN) if hasattr(model, "BUILTIN") else {},
         "layout": [{"label":"G0","win_start":None,"win_end":None,"linger":None,"del":False,
                     "style":{},"animations":[],"suppress":[],
                     "lines":[{"toks":[{"ids":[0],"sep":"","del":False,"style":{}},
                                       {"ids":[1],"sep":"","del":False,"style":{}}]}]}]}
    return p

def t_setters_set_fields():
    p = _proj()
    mutations.set_event_label(p, 0, "Chorus")
    mutations.set_event_section(p, 0, "Chorus")
    mutations.set_event_color(p, 0, "#36E2FF")
    g = p["layout"][0]
    return (g["label"]=="Chorus" and g["section"]=="Chorus" and g["color"]=="#36E2FF"), str(g.get("section"))

def t_label_section_strip_newlines():
    p = _proj()
    mutations.set_event_label(p, 0, "two\nlines")
    mutations.set_event_section(p, 0, "x\r\ny")
    g = p["layout"][0]
    return ("\n" not in g["label"] and "\n" not in g["section"] and g["label"]=="two lines"), repr(g["label"])

def t_roundtrip_persists():
    p = _proj()
    mutations.set_event_section(p, 0, "Verse"); mutations.set_event_color(p, 0, "#FF3DA6")
    ser = io._ser_group(p["layout"][0]); back = io._apply_group(ser)
    return (back["section"]=="Verse" and back["color"]=="#FF3DA6"), str(ser.get("section"))

def t_roundtrip_absent_when_unset():
    p = _proj()
    ser = io._ser_group(p["layout"][0])
    # unset → emitted as "" (or omitted); apply yields "" not a crash
    back = io._apply_group(ser)
    return (back.get("section","")=="" and back.get("color","")==""), str({k:ser.get(k) for k in ("section","color")})

def t_ungroup_carries_fields():
    p = _proj()
    mutations.set_event_section(p, 0, "Bridge"); mutations.set_event_color(p, 0, "#FFC24B")
    # ungroup the single 2-tok line group → still one line, but exercises the copy path
    mutations.layout_ungroup(p, 0)
    g0 = p["layout"][0]
    return (g0.get("section")=="Bridge" and g0.get("color")=="#FFC24B"), str(g0.get("section"))

def t_bad_gi_noop():
    p = _proj()
    mutations.set_event_label(p, 9, "x")  # out of range → no raise, no change
    return (p["layout"][0]["label"]=="G0"), "ok"

_active = {n: f for n, f in list(globals().items()) if n.startswith("t_") and callable(f)}
for n, f in sorted(_active.items()): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, dd in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"\n       -> {dd}"))
print(f"\n{npass}/{len(results)} passed")
sys.exit(0 if npass == len(results) else 1)
```

- [ ] **Step 2: Run; verify failure** — `.venv/bin/python tests/test_event_fields.py` → FAIL (`set_event_label` missing; `section`/`color` not in `_ser_group`).

- [ ] **Step 3: Thread the fields in `engine/io.py`.** In `_ser_group`, after `"del": ...,` add (emit only when set, to keep project.json clean):
```python
    if g.get("section"): out["section"] = g["section"]
    if g.get("color"):   out["color"] = g["color"]
```
Wait — `out` is built as one dict literal then returned; add these two lines just before `return out` (alongside the `accumulate`/`fade` conditionals). In `_apply_group`, before `return out` add:
```python
    if g.get("section"): out["section"] = g["section"]
    if g.get("color"):   out["color"] = g["color"]
```
(Defensive `.get` so missing keys are fine; absent → not added, `g.get("section","")==""`.)

- [ ] **Step 4: `layout_ungroup` carries the fields** (`engine/mutations.py` ~273). The child dict is hand-built — add `"section": g.get("section",""), "color": g.get("color","")` to the `new` dict comprehension (and only keep non-empty if you prefer; simplest is to copy through). (`layout_merge`/`layout_split_event` use `{**g}` and already carry them.)

- [ ] **Step 5: Add the 3 setters** to `engine/mutations.py` (near `set_layout_props`):
```python
def _one_line(s):
    return (s or "").replace("\r", " ").replace("\n", " ").strip()

def set_event_label(project, gi, label):
    L = project["layout"]
    if 0 <= gi < len(L): L[gi]["label"] = _one_line(label)

def set_event_section(project, gi, section):
    L = project["layout"]
    if 0 <= gi < len(L): L[gi]["section"] = _one_line(section)

def set_event_color(project, gi, color):
    L = project["layout"]
    if 0 <= gi < len(L): L[gi]["color"] = (color or "").strip()
```

- [ ] **Step 6: Run; verify pass** — `.venv/bin/python tests/test_event_fields.py` → PASS (6).

- [ ] **Step 7: MCP tools + projections** (`mcp_server/tools.py`). In `_event_view`'s returned dict add `"section": g.get("section",""), "color": g.get("color","")`. If `get_project` (~107-116) has its own layout projection, add the two keys there too. Add 3 tools (mirror `set_layout_props` at :187):
```python
def set_event_label(ctx, gi, label):
    _do(ctx, "set_event_label", gi, label); return ctx.run(lambda: _event_view(ctx, gi))
def set_event_section(ctx, gi, section):
    _do(ctx, "set_event_section", gi, section); return ctx.run(lambda: _event_view(ctx, gi))
def set_event_color(ctx, gi, color):
    _do(ctx, "set_event_color", gi, color); return ctx.run(lambda: _event_view(ctx, gi))
```
If `mcp_server/server.py` registers tools in an explicit list/dict, add these three (grep `set_layout_props` in server.py to find the registry; if dispatch is purely `getattr`, no change needed).

- [ ] **Step 8: Daemon round-trip test** — add to `tests/test_event_fields.py` (or `tests/test_daemon_projects.py`) a check that drives the tools through a context and that a saved/opened project keeps `section`/`color` (use the `daemon.library` save/open or the `mcp_server.tools` `_do` path with a real `DaemonContext`, mirroring `tests/test_anim_daemon.py`). Assert: set section/color via the tool → `serialize_cues`→`apply_cues` (or save_project→open_project) preserves them, and `_event_view`/`get_project` expose them. Run → PASS.

- [ ] **Step 9: Regression** — run the engine/daemon scripts that touch layout/io:
  `for f in test_event_fields test_daemon test_daemon_projects test_library_create test_anim_daemon test_video; do .venv/bin/python tests/$f.py; done` — all green.

- [ ] **Step 10: Commit**
```bash
git add engine/io.py engine/mutations.py mcp_server/tools.py mcp_server/server.py tests/test_event_fields.py
git commit -m "feat(events): persist section+color group fields; add label/section/color setters (TDD)"
```

---

## Phase 2 — Frontend: `eventColor` helper (isolates the recolor)

### Task 2: stored per-group color, default to index

**Files:** `web/src/model/palette.ts`, `web/src/types.ts`, `web/src/components/panels/CueLanes.tsx`, `web/src/components/stage/WordTrack.tsx`; test `web/src/model/palette.test.ts`.

- [ ] **Step 1: types** — `web/src/types.ts` `LayoutGroup` (62-68): add `section?: string; color?: string;`.
- [ ] **Step 2: failing test** — extend `palette.test.ts`: `eventColor({color:"#abc"} as any, 3) === "#abc"`; `eventColor({} as any, 3) === colorForIndex(3)`; `eventColor(undefined, 0) === colorForIndex(0)`. Run → FAIL.
- [ ] **Step 3: implement** in `palette.ts`: `export function eventColor(group: { color?: string } | null | undefined, gi: number) { return group?.color || colorForIndex(gi); }`.
- [ ] **Step 4: swap the sites** — replace `colorForIndex(gi)`/`colorForIndex(w.gi)` with `eventColor(group, gi)` at: `CueLanes.tsx:143` (the group is `g`), `WordTrack.tsx:734, 750, 854, 863, 914` (the group/event for that `gi` — pass the resolved `TrackEvent`/group; WordTrack has `events`/`lanes` — derive the group color once per row/word from the matching event's `color`). Thread the event's `color` into `TrackEvent` if not already present (it comes from the layout projection now exposing `color`).
- [ ] **Step 5: verify** — `cd web && npx vitest run src/model/palette.test.ts` PASS; `npx vitest run` full green; `npx tsc --noEmit` clean.
- [ ] **Step 6: Commit**
```bash
git add web/src/types.ts web/src/model/palette.ts web/src/model/palette.test.ts web/src/components/panels/CueLanes.tsx web/src/components/stage/WordTrack.tsx
git commit -m "feat(events): eventColor(group, gi) helper — stored group color overrides the index default"
```

---

## Phase 3 — Frontend: the Events panel (Project rail)

### Task 3: Events list + grouping toolbar + section/color/linger controls

**Files:** new `web/src/components/panels/EventsPanel.tsx`; modify `web/src/components/panels/ControlsRail.tsx` (mount it), `web/src/components/Editor.tsx` (dispatch handlers + data), `web/src/theme.css` (styles); tests `EventsPanel.test.tsx`.

- [ ] **Step 1: Editor dispatch handlers** — add `setEventLabel(gi,label)`, `setEventSection(gi,section)`, `setEventColor(gi,color)` (each `dispatch("set_event_label"|..., {gi, ...})`), reusing the existing `dispatch` + `mergeEvents`/`splitEvent`. Build an `events` array for the panel from `P.layout` (gi, label, section, color, win_start, win_end, linger, cueCount = sum of toks). Pass to ControlsRail/EventsPanel.
- [ ] **Step 2: EventsPanel component** — per the prototype + spec §4: header grid `26px 1fr 150px 120px 90px 64px`, `srt`/`author` tag chips, legend; one row per event with: color-dot button → palette popover (`PALETTE` 8) → `onSetColor`; `contenteditable` name (single-line rules §6 helper — see Phase 4 shared util) → `onSetLabel`; `<select>` of `SEC_BASE` + sticky custom option + `Custom…` → modal (maxlength 40, newline→space, empty→"—") → `onSetSection`; read-only window `{ws.toFixed(1)}–{we.toFixed(1)}s`; linger stepper (0.1/min 0) → `onSetLinger` (existing `set_layout_props`); cue-count. Toolbar: `Merge selected` (enabled only when ≥2 **contiguous** gi selected → `onMerge(gidxs)`), `Split at cue` (split focused group at a line boundary → `onSplit(gi, li)`), and **"New from selection"** (split-off — §1; v1 may implement as `onSplit` at the selection boundary). Multi-select = local `Set<number>`; row click toggles unless target matches `.name,select,.stepper,.dot`. Define `SEC_BASE`/`PALETTE` consts in the component (or a small `events.ts`).
- [ ] **Step 3: mount** in `ControlsRail.tsx` as a new "Events" section (Project rail). Add CSS to `theme.css` for `.ev-panel`/`.ev`/`.evhead`/`.tag-imp`/`.tag-auth`/`.sec-sel`/`.cpop`/`.modal-back` (port from the prototype `<style>`).
- [ ] **Step 4: tests** — `EventsPanel.test.tsx`: renders a row per event; ＋/− linger calls onSetLinger; section change calls onSetSection; Custom… opens modal, save sanitizes; color dot → popover → onSetColor; Merge disabled unless ≥2 contiguous; name edit calls onSetLabel; "Untitled event" for empty label.
- [ ] **Step 5: verify** — `cd web && npx vitest run` green; `npx tsc --noEmit` clean.
- [ ] **Step 6: Commit**
```bash
git add web/src/components/panels/EventsPanel.tsx web/src/components/panels/ControlsRail.tsx web/src/components/Editor.tsx web/src/theme.css web/src/components/panels/EventsPanel.test.tsx
git commit -m "feat(events): Events panel in the Project rail (group/name/section/color/linger)"
```

---

## Phase 4 — Frontend: inline rename in the timeline + shared single-line util

### Task 4: rename on CueLanes header + WordTrack Lanes gutter

**Files:** new `web/src/components/controls/inlineRename.ts` (or a small hook); modify `CueLanes.tsx` (`.lane-evt` header ~147-160), `WordTrack.tsx` (`.glabel`/`.gname` ~913-915), `Editor.tsx` (thread `onRenameEvent`); tests in the respective `*.test.tsx`.

- [ ] **Step 1: shared util** — `singleLineEditable` helpers: `onKeyDown` (Enter→preventDefault+blur), `onPaste` (insert `text.replace(/[\r\n]+/g," ").trim()`), commit-on-blur reading `textContent.trim()`. Reuse in EventsPanel (Phase 3), CueLanes, WordTrack.
- [ ] **Step 2: CueLanes header rename** — make `{g.label}` (`CueLanes.tsx:147-160`) double-click → `contenteditable` with the util; commit → `onRenameEvent(gi, label)` (new prop). Truncate + `title` tooltip; "Untitled event" placeholder.
- [ ] **Step 3: WordTrack gutter rename** — `.gname` (`WordTrack.tsx:913-915`, Lanes mode) `onDoubleClick` → inline edit → `onRenameEvent(gi, label)` (new prop threaded from Editor).
- [ ] **Step 4: Editor** — `onRenameEvent = setEventLabel` (already added in Phase 3); pass to CueLanes + WordTrack.
- [ ] **Step 5: tests** — CueLanes: double-click label → edit → onRenameEvent called with trimmed single-line value; Enter commits; paste with `\n` → space. WordTrack: gutter double-click in Lanes mode fires onRenameEvent.
- [ ] **Step 6: verify** — `cd web && npx vitest run` green; `npx tsc --noEmit` clean.
- [ ] **Step 7: Commit**
```bash
git add web/src/components/controls/inlineRename.ts web/src/components/panels/CueLanes.tsx web/src/components/stage/WordTrack.tsx web/src/components/Editor.tsx web/src/components/panels/CueLanes.audit.test.tsx web/src/components/stage/WordTrack.test.tsx
git commit -m "feat(events): inline event rename on CueLanes header + timeline Lanes gutter"
```

---

## Phase 5 — e2e + full verification

### Task 5: SRT → events authoring round-trip

**Files:** new/extend `web/e2e/events.spec.ts`.

- [ ] **Step 1: e2e** (against the real daemon): with the seeded project, in the Events panel — set a section (incl. Custom…), set a color (assert the lane `--g-color` / a cue block bg changes via `eventColor`), rename an event (panel + lane-header), Split a group → event count rises, Merge two contiguous → falls; then reload (or re-open) and assert `section`/`color`/`label` persisted (autosave round-trip). Assert recolor reaches both the lane bar and a cue block.
- [ ] **Step 2: full verification**
  - `cd web && npx tsc --noEmit` clean; `npx vitest run` all green.
  - `xvfb-run -a npx playwright test` full suite green.
  - Engine: `for f in test_event_fields test_daemon test_daemon_projects test_library_create test_anim_daemon test_video test_srt; do .venv/bin/python tests/$f.py; done` green.
- [ ] **Step 3: Commit**
```bash
git add web/e2e/events.spec.ts
git commit -m "test(events): e2e SRT→author events (section/color/rename/split/merge) + persistence"
```

---

## Self-review notes
- **Spec coverage:** §2 backend fields+mutations → Ph1; §3 color helper → Ph2; §4 Events panel → Ph3; §5 inline rename → Ph4; §8 e2e → Ph5. §1 model reconciliation (no empty ＋New → split-off; line-granular split; contiguous merge) baked into Ph3 toolbar logic + Ph1 reusing existing merge/split. ✓
- **Type consistency:** `section?: string; color?: string` on `LayoutGroup` (Ph2) used by `eventColor` (Ph2), EventsPanel (Ph3), and surfaced by `_event_view`/`get_project` (Ph1). Mutation names match exactly between engine (`set_event_label/_section/_color`), tools, and web `dispatch(...)` strings.
- **No ASS-compile change** — `section`/`color` are metadata; engine work is field-threading + setters only. No `engine/ass.py`/`render.py` edits.
- **Risk seams:** (1) `_ser_group`/`_apply_group` must BOTH thread the fields or they vanish on reopen — Ph1 Step 3 + the round-trip test guards it. (2) `eventColor` must receive the group that actually carries `color` — confirm `TrackEvent`/CueLanes `g` expose `color` from the new projection (Ph2 Step 4). (3) Merge contiguity — disable unless selected gi are consecutive (Ph3). (4) "New from selection" semantics are the §1 open call — if the user wants a different mapping, only Ph3's toolbar changes.
