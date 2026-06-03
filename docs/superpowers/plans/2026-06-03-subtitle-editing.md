# Subtitle Editing (retime + text) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users retime (move/resize start-end) and edit the text of existing subtitles, gated behind a default-locked timings toggle, via the cues timeline (drag) and the Timing panel (numeric), persisted in the project.

**Architecture:** Word atoms become editable in place (count fixed → `nwords` guard stays); `project.json` now persists `words[]`. Two new atomic engine mutations (`set_word_times` batch, `set_word_text`) flow through the shared session/undo. The web edits via `store.call`; pure timing math lives in a tested helper; the timeline drag does local preview then commits one batch on release.

**Tech Stack:** Python stdlib engine + FastMCP daemon; Vite + React + TS web (Vitest + RTL). Spec: `docs/superpowers/specs/2026-06-03-subtitle-editing-design.md`.

**Conventions:** Python tests are stdlib scripts run `.venv/bin/python tests/<f>.py` (exit 0 = pass), `t_`-prefixed functions. Web tests are Vitest: `npm --prefix web run test -- <path>`; build check `npm --prefix web run build`. TDD throughout. Per the defer-UI-tests memory, run headless Python suites per task; the Tk suites are unaffected (no engine field renamed) — run them only if a Python change could touch them.

---

### Task 1: Engine mutations — `set_word_times` (batch, atomic) + `set_word_text`

**Files:**
- Modify: `engine/mutations.py`
- Test: `tests/test_engine_mutations.py`

- [ ] **Step 1: Failing tests** — append to `tests/test_engine_mutations.py` and register in `ACTIVE`:

```python
def t_set_word_times_batch_and_atomic():
    p = fresh()
    mut.set_word_times(p, [{"wid": 0, "start": 1.0, "end": 2.0}, {"wid": 1, "start": 2.0, "end": 2.5}])
    a = (p["words"][0]["start"], p["words"][0]["end"], p["words"][1]["start"], p["words"][1]["end"])
    # invalid entry (start >= end) must raise and change NOTHING
    before = [dict(w) for w in p["words"]]
    raised = False
    try:
        mut.set_word_times(p, [{"wid": 2, "start": 5.0, "end": 6.0}, {"wid": 3, "start": 9.0, "end": 9.0}])
    except ValueError:
        raised = True
    unchanged = all(p["words"][i] == before[i] for i in range(len(p["words"])))
    return (a == (1.0, 2.0, 2.0, 2.5) and raised and unchanged, (a, raised, unchanged))

def t_set_word_times_rejects_negative():
    p = fresh(); raised = False
    try:
        mut.set_word_times(p, [{"wid": 0, "start": -0.1, "end": 1.0}])
    except ValueError:
        raised = True
    return (raised, raised)

def t_set_word_text():
    p = fresh()
    mut.set_word_text(p, 0, "Hullo")
    mut.set_word_text(p, 1, "")
    return (p["words"][0]["text"] == "Hullo" and p["words"][1]["text"] == "", (p["words"][0]["text"], p["words"][1]["text"]))
```

- [ ] **Step 2: Run red** — `.venv/bin/python tests/test_engine_mutations.py` → FAIL (functions undefined).

- [ ] **Step 3: Implement** — add to `engine/mutations.py` (e.g. after `toggle_word_del`):

```python
def set_word_times(project, updates):
    """Atomically retime words. updates: list of {wid, start, end}.
    Validates all entries first (0 <= start < end, wid in range); applies none on any error."""
    clean = []
    n = len(project["words"])
    for u in updates:
        wid = u["wid"]; s = u["start"]; e = u["end"]
        if not isinstance(wid, int) or wid < 0 or wid >= n:
            raise ValueError(f"set_word_times: wid {wid!r} out of range")
        if s is None or e is None or s < 0 or s >= e:
            raise ValueError(f"set_word_times: invalid span for wid {wid}: start={s} end={e}")
        clean.append((wid, s, e))
    for wid, s, e in clean:
        project["words"][wid]["start"] = s
        project["words"][wid]["end"] = e

def set_word_text(project, wid, text):
    if not isinstance(wid, int) or wid < 0 or wid >= len(project["words"]):
        raise ValueError(f"set_word_text: wid {wid!r} out of range")
    project["words"][wid]["text"] = text
```

- [ ] **Step 4: Run green** — `.venv/bin/python tests/test_engine_mutations.py` → `N/N passed`.

- [ ] **Step 5: Commit**

```bash
git add engine/mutations.py tests/test_engine_mutations.py
git commit -m "engine: add set_word_times (batch, atomic) + set_word_text mutations"
```

---

### Task 2: Persist edited words in `project.json`

**Files:**
- Modify: `engine/io.py`
- Test: `tests/test_engine_build_io.py`

- [ ] **Step 1: Failing tests** — append to `tests/test_engine_build_io.py` (match its `engine`/`CFG` idiom + registration):

```python
def t_serialize_persists_word_edits():
    import json
    p = engine.make_project(CFG)
    engine.mutations.set_word_times(p, [{"wid": 0, "start": 9.5, "end": 10.25}])
    engine.mutations.set_word_text(p, 0, "EDITED")
    d = engine.serialize_cues(p)
    ok_doc = (len(d["words"]) == len(p["words"]) and d["words"][0] == {"text": "EDITED", "start": 9.5, "end": 10.25})
    # round-trip onto a FRESH (unedited) project of the same lyrics → edits restored
    p2 = engine.make_project(CFG)
    applied = engine.apply_cues(p2, json.loads(json.dumps(d)))
    w0 = p2["words"][0]
    return (ok_doc and applied and w0["text"] == "EDITED" and abs(w0["start"] - 9.5) < 1e-9 and abs(w0["end"] - 10.25) < 1e-9, (ok_doc, w0))

def t_apply_without_words_is_backcompat():
    p = engine.make_project(CFG)
    d = engine.serialize_cues(p)
    del d["words"]                      # an older project.json with no words[]
    p2 = engine.make_project(CFG)
    orig = dict(p2["words"][0])
    ok = engine.apply_cues(p2, d)       # still applies layout/tags; words stay lyrics-derived
    return (ok and p2["words"][0] == orig, p2["words"][0])
```

- [ ] **Step 2: Run red** — `.venv/bin/python tests/test_engine_build_io.py` → FAIL (`d["words"]` KeyError / edits not restored).

- [ ] **Step 3: Implement** in `engine/io.py`:

In `serialize_cues`, add a `"words"` key to the returned dict (alongside `"nwords"`):

```python
def serialize_cues(p):
    return {"nwords": len(p["words"]), "globals": dict(p["globals"]),
            "words": [{"text": w["text"], "start": w["start"], "end": w["end"]} for w in p["words"]],
            "layout": [{"label": g["label"], "accumulate": g.get("accumulate", "words"),
```
(rest of `serialize_cues` unchanged.)

In `apply_cues`, after the `project["globals"] = ...` line and before the `project["layout"] = ...` line, add:

```python
    sw = d.get("words")
    if sw and len(sw) == len(project["words"]):
        for i, w in enumerate(sw):
            project["words"][i] = {"text": w["text"], "start": w["start"], "end": w["end"]}
```
(Keep the `nwords` guard at the top — count always matches since no add/delete. Absent/short `words` → words stay lyrics-derived, preserving back-compat.)

- [ ] **Step 4: Run green** — `.venv/bin/python tests/test_engine_build_io.py` → `N/N passed`. Also run `tests/test_engine_mutations.py`, `tests/test_engine.py`, `tests/test_mcp.py` → all `N/N passed`.

- [ ] **Step 5: Commit**

```bash
git add engine/io.py tests/test_engine_build_io.py
git commit -m "engine(io): persist words[] (text/start/end) so subtitle edits survive save/load"
```

---

### Task 3: Tools + MCP registration for retime/text

**Files:**
- Modify: `mcp_server/tools.py`, `mcp_server/server.py`
- Test: `tests/test_mcp.py`

- [ ] **Step 1: Failing tests** — append to `tests/test_mcp.py` (idiom: `ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")`):

```python
def t_set_word_times_tool():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    tools.set_word_times(ctx, [{"wid": 0, "start": 3.0, "end": 3.5}])
    w = ctx.session.project["words"][0]
    return (abs(w["start"] - 3.0) < 1e-9 and abs(w["end"] - 3.5) < 1e-9, w)

def t_set_word_text_tool():
    ctx = HeadlessContext(); ctx.load_lyrics("aligned_lyrics.json")
    tools.set_word_text(ctx, 0, "Zzz")
    return (ctx.session.project["words"][0]["text"] == "Zzz", ctx.session.project["words"][0]["text"])
```

- [ ] **Step 2: Run red** — `.venv/bin/python tests/test_mcp.py` → FAIL.

- [ ] **Step 3: Implement**

In `mcp_server/tools.py` (next to the other `_do`-based wrappers):

```python
def set_word_times(ctx, updates):
    _do(ctx, "set_word_times", updates); return get_state(ctx)

def set_word_text(ctx, wid, text):
    _do(ctx, "set_word_text", wid, text); return get_state(ctx)
```

In `mcp_server/server.py` (next to `set_layout_props` etc.):

```python
    @mcp.tool()
    def set_word_times(updates: list) -> dict: return tools.set_word_times(ctx, updates)
    @mcp.tool()
    def set_word_text(wid: int, text: str) -> dict: return tools.set_word_text(ctx, wid, text)
```

- [ ] **Step 4: Run green** — `.venv/bin/python tests/test_mcp.py` and `tests/test_mcp_server.py` → `N/N passed`.

- [ ] **Step 5: Commit**

```bash
git add mcp_server/tools.py mcp_server/server.py tests/test_mcp.py
git commit -m "mcp: set_word_times + set_word_text tools"
```

---

### Task 4: Web pure timing-edit helpers (`model/edit.ts`)

**Files:**
- Create: `web/src/model/edit.ts`, `web/src/model/edit.test.ts`

- [ ] **Step 1: Failing test `web/src/model/edit.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { cueSpan, computeMove, computeResize, dragMode } from "./edit";
import type { Project, Token } from "../types";

const W = [
  { text: "a", start: 1.0, end: 1.5 },
  { text: "b", start: 2.0, end: 2.5 },
  { text: "c", start: 3.0, end: 3.4 },
];
const tok = (ids: number[]): Token => ({ ids, sep: " ", del: false, style: {} });
function proj(): Project {
  return {
    words: W.map((w) => ({ ...w })),
    layout: [], fin_tags: [], fout_tags: [],
    globals: { fade_in_ms: 250, fade_out_ms: 1000, linger: 0 },
    global_style: { font: "x", fontsize: 64, bold: true, primary: "#fff", outline: "#000", back: "#000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1 },
    placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 0, margin_r: 0, margin_v: 0, pos: null },
  };
}

describe("cueSpan", () => {
  it("min start / max end across member words", () => {
    expect(cueSpan(proj(), tok([0, 1]))).toEqual({ start: 1.0, end: 2.5 });
  });
});

describe("computeMove", () => {
  it("shifts all words by the same delta (diffs preserved)", () => {
    const u = computeMove(proj(), [tok([0]), tok([2])], 0.5);
    expect(u).toEqual([
      { wid: 0, start: 1.5, end: 2.0 },
      { wid: 2, start: 3.5, end: 3.9 },
    ]);
  });
  it("clamps so the earliest start cannot go below 0", () => {
    const u = computeMove(proj(), [tok([0]), tok([1])], -5);
    expect(u[0]).toEqual({ wid: 0, start: 0, end: 0.5 });   // shifted by -1.0, not -5
    expect(u[1]).toEqual({ wid: 1, start: 1.0, end: 1.5 });
  });
});

describe("computeResize", () => {
  it("resize end moves the latest word's end", () => {
    expect(computeResize(proj(), tok([0]), "end", 0.3)).toEqual([{ wid: 0, start: 1.0, end: 1.8 }]);
  });
  it("resize start clamps below word end minus minSpan", () => {
    const u = computeResize(proj(), tok([0]), "start", 5, 0.05);
    expect(u[0].wid).toBe(0);
    expect(u[0].end).toBe(1.5);
    expect(u[0].start).toBeCloseTo(1.45); // clamped to end - minSpan
  });
});

describe("dragMode", () => {
  it("classifies edges vs body, narrow → move", () => {
    expect(dragMode(2, 100)).toBe("resize-start");
    expect(dragMode(96, 100)).toBe("resize-end");
    expect(dragMode(50, 100)).toBe("move");
    expect(dragMode(2, 18)).toBe("move"); // too narrow for edge zones
  });
});
```

- [ ] **Step 2: Run red** — `npm --prefix web run test -- src/model/edit.test.ts` → FAIL.

- [ ] **Step 3: Implement `web/src/model/edit.ts`:**

```ts
import type { Project, Token } from "../types";

export interface TimeUpdate { wid: number; start: number; end: number; }

export function cueSpan(project: Project, tok: Token): { start: number; end: number } {
  const ws = tok.ids.map((id) => project.words[id]);
  return { start: Math.min(...ws.map((w) => w.start)), end: Math.max(...ws.map((w) => w.end)) };
}

// Move: shift every member word of every token by `dt`, clamped so the earliest start stays >= 0.
export function computeMove(project: Project, toks: Token[], dt: number): TimeUpdate[] {
  const wids = toks.flatMap((t) => t.ids);
  const minStart = Math.min(...wids.map((id) => project.words[id].start));
  const d = Math.max(dt, -minStart);
  return wids.map((id) => ({ wid: id, start: project.words[id].start + d, end: project.words[id].end + d }));
}

// Resize one cue's start (earliest word) or end (latest word) by `dt`, keeping that word's span >= minSpan and start >= 0.
export function computeResize(project: Project, tok: Token, edge: "start" | "end", dt: number, minSpan = 0.05): TimeUpdate[] {
  const span = cueSpan(project, tok);
  if (edge === "start") {
    const id = tok.ids.reduce((a, b) => (project.words[a].start <= project.words[b].start ? a : b));
    const wEnd = project.words[id].end;
    const ns = Math.max(0, Math.min(span.start + dt, wEnd - minSpan));
    return [{ wid: id, start: ns, end: wEnd }];
  }
  const id = tok.ids.reduce((a, b) => (project.words[a].end >= project.words[b].end ? a : b));
  const wStart = project.words[id].start;
  const ne = Math.max(wStart + minSpan, span.end + dt);
  return [{ wid: id, start: wStart, end: ne }];
}

// Decide drag intent from the pointer's x within a block of pixel `width`.
export function dragMode(localX: number, width: number, edge = 6): "resize-start" | "resize-end" | "move" {
  if (width < 22) return "move"; // too narrow for edge zones; resize via panel/keyboard
  if (localX <= edge) return "resize-start";
  if (localX >= width - edge) return "resize-end";
  return "move";
}
```

- [ ] **Step 4: Run green** — `npm --prefix web run test -- src/model/edit.test.ts` → PASS; `npm --prefix web run build` → tsc clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/model/edit.ts web/src/model/edit.test.ts
git commit -m "web: pure timing-edit helpers (cueSpan, computeMove, computeResize, dragMode)"
```

---

### Task 5: Selection model — Ctrl-toggle, Shift-range, Esc-clear; unify timeline + cue lanes

**Files:**
- Modify: `web/src/components/Editor.tsx` (selection state + handlers; pass to children; Esc)
- Modify: `web/src/components/stage/WordTrack.tsx` (emit modifier-aware select)
- Modify: `web/src/components/panels/CueLanes.tsx` (emit modifier-aware select)
- Test: `web/src/components/Editor.selection.test.tsx`

The current `Editor` has `selectedWords: Set<number>` + `sel` + `selectWord`/`shiftSelectWord`. Generalize selection to a modifier-aware API and add an `anchorWid`/`primaryWid`.

- [ ] **Step 1: Failing test `web/src/components/Editor.selection.test.tsx`** — render `Editor`, push a project with two events of a few single-word cues, then exercise selection via clicks with modifiers on cue-lane rows (stable text). Assert the selection count via a visible affordance (the OpsToolbar "N selected" text already exists). Use the FakeWS+fetch harness from `Editor.test.tsx`. Concretely:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "./Editor";
import type { Project } from "../types";
// FakeWS identical to Editor.test.tsx; projectTwoCues(): one event "V" with words [{a},{b},{c}] as 3 single-word toks.
// (build like the model/edit.test.ts words, in a layout event)

beforeEach(() => { (globalThis as any).WebSocket = FakeWS; vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({result:{}}),{status:200,headers:{"Content-Type":"application/json"}}) as Response); });

describe("selection", () => {
  it("ctrl-click toggles into a multi-selection (cue lanes)", async () => {
    render(<Editor projectName="s" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    act(() => FakeWS.last!.emit({ type: "state", state: projectTwoCues() }));
    await userEvent.click(await screen.findByText("a"));
    await userEvent.keyboard("{Control>}");           // hold ctrl
    await userEvent.click(screen.getByText("b"));
    await userEvent.keyboard("{/Control}");
    expect(screen.getByText(/2 selected/i)).toBeTruthy();
  });
  it("Esc clears selection", async () => {
    render(<Editor projectName="s" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    act(() => FakeWS.last!.emit({ type: "state", state: projectTwoCues() }));
    await userEvent.click(await screen.findByText("a"));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText(/selected/i)).toBeNull();  // OpsToolbar shows the hint, not "N selected"
  });
});
```

- [ ] **Step 2: Run red** — `npm --prefix web run test -- src/components/Editor.selection.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

In `Editor.tsx`, add `const [anchorWid, setAnchorWid] = useState<number | null>(null);` and a unified selection handler. Replace the single-purpose `selectWord`/`shiftSelectWord` usage with:

```tsx
// ordered cue list (by start time) for range-select
function cueList(): { wid: number; gi: number; li: number; ti: number; start: number }[] {
  if (!P) return [];
  const out: { wid: number; gi: number; li: number; ti: number; start: number }[] = [];
  P.layout.forEach((g, gi) => g.lines.forEach((ln, li) => ln.toks.forEach((t, ti) =>
    out.push({ wid: t.ids[0], gi, li, ti, start: Math.min(...t.ids.map((id) => P.words[id].start)) }))));
  return out;
}

const selectCue = useCallback((gi: number, li: number, ti: number, wid: number, mods: { ctrl?: boolean; shift?: boolean }) => {
  if (mods.shift && anchorWid != null) {
    const list = cueList();
    const a = list.find((c) => c.wid === anchorWid)?.start ?? 0;
    const b = list.find((c) => c.wid === wid)?.start ?? 0;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    setSelectedWords(new Set(list.filter((c) => c.start >= lo && c.start <= hi).map((c) => c.wid)));
    setSel({ scope: "cue", gi, tok: { li, ti } });             // primary = clicked
  } else if (mods.ctrl) {
    setSelectedWords((prev) => { const n = new Set(prev); n.has(wid) ? n.delete(wid) : n.add(wid); return n; });
    setSel({ scope: "cue", gi, tok: { li, ti } });
    setAnchorWid(wid);
  } else {
    setSelectedWords(new Set([wid]));
    setSel({ scope: "cue", gi, tok: { li, ti } });
    setAnchorWid(wid);
  }
}, [P, anchorWid]);

const clearSelection = useCallback(() => { setSelectedWords(new Set()); setSel((s) => ({ ...s, scope: "global", tok: null })); setAnchorWid(null); }, []);
```

Add an Esc keydown effect (only clears when not mid-drag — drag-cancel is Task 7; here clear on Esc when a selection exists):

```tsx
useEffect(() => {
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") clearSelection(); };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [clearSelection]);
```

Change `CueLanes` and `WordTrack` to call `selectCue(gi, li, ti, wid, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })` from their click handlers (pass the React mouse event's modifiers). Update their `onSelectWord` prop type to `(gi, li, ti, wid, mods) => void` (WordTrack passes its block's gi/li/ti — extend `TrackWord` with `li`/`ti`, populated in `computeTrackWords`). The cue lanes already have the (gi,li,ti,wid) onSelect; just thread `mods`.

(Keep `selectEvent` for group selection as-is.)

- [ ] **Step 4: Run green** — `npm --prefix web run test` (all) → green; `npm --prefix web run build` → clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/Editor.tsx web/src/components/stage/WordTrack.tsx web/src/components/panels/CueLanes.tsx web/src/components/Editor.selection.test.tsx
git commit -m "web: modifier-aware cue selection (ctrl-toggle, shift-range, Esc-clear), unified timeline+lanes"
```

---

### Task 6: Timing lock + unlocked Timing panel (numeric start/end + text)

**Files:**
- Modify: `web/src/components/Editor.tsx` (`timingsUnlocked` state; `setCueTime`/`setCueText` dispatchers; pass to panel)
- Modify: `web/src/components/panels/TimingPanel.tsx` (lock toggle + editable fields)
- Modify: `web/src/theme.css` (editable-field + lock-toggle styles; reuse `.pv-step`)
- Test: `web/src/components/panels/TimingPanel.test.tsx`

- [ ] **Step 1: Failing test `web/src/components/panels/TimingPanel.test.tsx`:**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimingPanel } from "./TimingPanel";
import type { Project, Token } from "../../types";
const tok: Token = { ids: [0], sep: "", del: false, style: {} };
function proj(): Project { return { words: [{ text: "a", start: 1.0, end: 2.0 }], layout: [], fin_tags: [], fout_tags: [], globals: { fade_in_ms: 250, fade_out_ms: 1000, linger: 0 }, global_style: { font: "x", fontsize: 64, bold: true, primary: "#fff", outline: "#000", back: "#000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1 }, placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 0, margin_r: 0, margin_v: 0, pos: null } }; }

describe("TimingPanel", () => {
  it("locked by default: start/end read-only, text editable, toggling unlock enables timing", async () => {
    const onTime = vi.fn(); const onText = vi.fn(); const onToggle = vi.fn();
    render(<TimingPanel tok={tok} project={proj()} unlocked={false} onToggleLock={onToggle} onSetTime={onTime} onSetText={onText} />);
    // text edit works while locked
    const text = screen.getByLabelText(/text/i);
    await userEvent.clear(text); await userEvent.type(text, "Hi{Enter}");
    expect(onText).toHaveBeenCalledWith("Hi");
    // there is a lock toggle
    await userEvent.click(screen.getByRole("button", { name: /lock|unlock/i }));
    expect(onToggle).toHaveBeenCalled();
  });
  it("unlocked: committing end dispatches onSetTime", async () => {
    const onTime = vi.fn();
    render(<TimingPanel tok={tok} project={proj()} unlocked={true} onToggleLock={() => {}} onSetTime={onTime} onSetText={() => {}} />);
    const end = screen.getByLabelText(/end/i);
    await userEvent.clear(end); await userEvent.type(end, "2.5{Enter}");
    expect(onTime).toHaveBeenCalledWith(1.0, 2.5);   // (start, end)
  });
});
```

- [ ] **Step 2: Run red** — FAIL.

- [ ] **Step 3: Implement**

`TimingPanel.tsx` — new props + behavior:

```tsx
import { useState, useEffect } from "react";
import { Icon } from "../icons/Icon";
import { cueSpan } from "../../model/edit";
import type { Project, Token } from "../../types";

export interface TimingPanelProps {
  tok: Token | null;
  project: Project;
  unlocked: boolean;
  onToggleLock: () => void;
  onSetTime: (start: number, end: number) => void;
  onSetText: (text: string) => void;
}

export function TimingPanel({ tok, project, unlocked, onToggleLock, onSetTime, onSetText }: TimingPanelProps) {
  if (!tok) return null;
  const span = cueSpan(project, tok);
  const text = tok.ids.map((id) => project.words[id].text).join(tok.sep || " ");
  const merged = tok.ids.length > 1;

  return (
    <div className="timing">
      <div className="locked-h">
        <Icon name="clock" size={13} />Timing
        <button className="lock-pill" onClick={onToggleLock} title={unlocked ? "Lock timings" : "Unlock timings"}>
          <Icon name="settings" size={10} />{unlocked ? "unlocked" : "locked"}
        </button>
      </div>
      <NumField label="Start" value={span.start} disabled={!unlocked} step={0.05}
        onCommit={(v) => onSetTime(v, span.end)} />
      <NumField label="End" value={span.end} disabled={!unlocked} step={0.05}
        onCommit={(v) => onSetTime(span.start, v)} />
      <label className="timing-text">
        <span>Text</span>
        <input aria-label="text" defaultValue={text} disabled={merged}
          onBlur={(e) => onSetText(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSetText(e.currentTarget.value); }} />
      </label>
      {merged && <p className="locked-note">Merged cue — un-merge to edit text per word.</p>}
    </div>
  );
}

function NumField({ label, value, disabled, step, onCommit }: { label: string; value: number; disabled: boolean; step: number; onCommit: (v: number) => void; }) {
  const [v, setV] = useState(String(value.toFixed(3)));
  useEffect(() => { setV(String(value.toFixed(3))); }, [value]);
  const commit = (raw: string) => { const n = parseFloat(raw); if (!Number.isNaN(n)) onCommit(n); };
  return (
    <div className={"locked-row" + (disabled ? " ro" : "")}>
      <span>{label}</span>
      <input aria-label={label} className="mono num" disabled={disabled} value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
          else if (e.key === "ArrowUp") { e.preventDefault(); const n = (parseFloat(v) || 0) + step * (e.shiftKey ? 5 : 1); setV(n.toFixed(3)); onCommit(n); }
          else if (e.key === "ArrowDown") { e.preventDefault(); const n = Math.max(0, (parseFloat(v) || 0) - step * (e.shiftKey ? 5 : 1)); setV(n.toFixed(3)); onCommit(n); }
        }}
        onBlur={(e) => commit(e.target.value)} />
      <span className="unit">s</span>
    </div>
  );
}
```

In `Editor.tsx`: add `const [timingsUnlocked, setTimingsUnlocked] = useState(false);`. Add dispatchers:

```tsx
function setCueTime(start: number, end: number) {
  if (!P || !sel.tok) return;
  const tk = P.layout[sel.gi].lines[sel.tok.li].toks[sel.tok.ti];
  const earliest = tk.ids.reduce((a, b) => (P.words[a].start <= P.words[b].start ? a : b));
  const latest = tk.ids.reduce((a, b) => (P.words[a].end >= P.words[b].end ? a : b));
  const updates = earliest === latest
    ? [{ wid: earliest, start, end }]
    : [{ wid: earliest, start, end: P.words[earliest].end }, { wid: latest, start: P.words[latest].start, end }];
  dispatch("set_word_times", { updates });
}
function setCueText(text: string) {
  if (!P || !sel.tok) return;
  const tk = P.layout[sel.gi].lines[sel.tok.li].toks[sel.tok.ti];
  if (tk.ids.length === 1) dispatch("set_word_text", { wid: tk.ids[0], text });
}
```

Render the panel in the rail's inspector tab:
```tsx
{curTok() && <TimingPanel tok={curTok()} project={P} unlocked={timingsUnlocked}
  onToggleLock={() => setTimingsUnlocked((u) => !u)} onSetTime={setCueTime} onSetText={setCueText} />}
```

`theme.css` — add (reuse tokens): `.timing` card like `.locked`; `.locked-row .num` (a `.mono` number input: surface-3, border, radius-xs, width ~84px, right-aligned); `.locked-row.ro .num` (dimmed/read-only); `.timing-text input` (full-width text-inp style); `.lock-pill` as a clickable button (cursor pointer, hover accent). Keep it short and on-brand.

- [ ] **Step 4: Run green** — `npm --prefix web run test -- src/components/panels/TimingPanel.test.tsx`; full `npm --prefix web run test`; `npm --prefix web run build`.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/panels/TimingPanel.tsx web/src/components/Editor.tsx web/src/theme.css web/src/components/panels/TimingPanel.test.tsx
git commit -m "web: timing lock (default locked) + unlocked numeric Timing panel (start/end ↑↓ + text)"
```

---

### Task 7: Timeline drag/resize + keyboard nudge (gated on unlock)

**Files:**
- Modify: `web/src/components/stage/WordTrack.tsx` (drag/resize handles + local preview + commit)
- Modify: `web/src/components/Editor.tsx` (`onRetime` dispatch; keyboard nudge; pass `unlocked` + selected token set)
- Modify: `web/src/theme.css` (handles + cursors)
- Test: `web/src/components/stage/WordTrack.drag.test.tsx`

Drag uses the pure helpers from Task 4 for all math; the component only maps pixels→time and owns a local preview map. Commit one `onRetime(updates)` on pointer-up; **Esc cancels** (discard preview, no commit). All drag/handles/keyboard are **inert when `unlocked` is false**.

- [ ] **Step 1: Failing test `web/src/components/stage/WordTrack.drag.test.tsx`** — verify (a) when locked, blocks have no resize handles and a pointer-drag fires no `onRetime`; (b) when unlocked, a body-drag across the area fires one `onRetime` with `computeMove`-shaped updates for the selected cues; (c) Esc during a drag fires no `onRetime`. Mock `getBoundingClientRect` for the lane area to a known width. (Drive pointer events via `fireEvent.pointerDown/Move/Up`.) Provide `events`, `words` (with `li`/`ti`/`gi`), `dur`, `selectedWords`, `unlocked`, `onRetime`, selection callback props.

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { WordTrack } from "./WordTrack";

const words = [ { wid: 0, text: "a", s: 1, e: 1.5, gi: 0, li: 0, ti: 0 }, { wid: 1, text: "b", s: 2, e: 2.5, gi: 0, li: 0, ti: 1 } ];
const events = [{ gi: 0, label: "V" }];
beforeEach(() => { Element.prototype.getBoundingClientRect = vi.fn(() => ({ x: 0, left: 0, width: 1000, top: 0, right: 1000, bottom: 30, height: 30, y: 0, toJSON: () => {} } as DOMRect)); });

function setup(unlocked: boolean, onRetime = vi.fn()) {
  const utils = render(<WordTrack words={words as any} events={events} dur={10} time={0} liveId={null} selId={0}
    selectedWords={new Set([0])} unlocked={unlocked} onRetime={onRetime} onSelect={() => {}} />);
  return { ...utils, onRetime };
}

describe("WordTrack drag", () => {
  it("locked: pointer-drag fires no onRetime", () => {
    const { container, onRetime } = setup(false);
    const block = container.querySelector(".block")!;
    fireEvent.pointerDown(block, { clientX: 150 }); fireEvent.pointerMove(window, { clientX: 250 }); fireEvent.pointerUp(window, { clientX: 250 });
    expect(onRetime).not.toHaveBeenCalled();
  });
  it("unlocked: body-drag commits one move (dx=100px over 1000px*10s = +1.0s)", () => {
    const { container, onRetime } = setup(true);
    const block = container.querySelector(".block")!; // word 0 block; mid-body click
    fireEvent.pointerDown(block, { clientX: 150 }); // within body (block spans ~100..150px for s=1..1.5 over 10s/1000px)
    fireEvent.pointerMove(window, { clientX: 250 });
    fireEvent.pointerUp(window, { clientX: 250 });
    expect(onRetime).toHaveBeenCalledTimes(1);
    const u = onRetime.mock.calls[0][0];
    expect(u).toContainEqual({ wid: 0, start: 2, end: 2.5 }); // +1.0s
  });
  it("unlocked: Esc during drag cancels (no onRetime)", () => {
    const { container, onRetime } = setup(true);
    const block = container.querySelector(".block")!;
    fireEvent.pointerDown(block, { clientX: 150 }); fireEvent.pointerMove(window, { clientX: 250 });
    fireEvent.keyDown(window, { key: "Escape" }); fireEvent.pointerUp(window, { clientX: 260 });
    expect(onRetime).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run red** — FAIL.

- [ ] **Step 3: Implement** — in `WordTrack.tsx` add a drag controller:
- Props add: `selectedWords: Set<number>`, `unlocked: boolean`, `onRetime: (updates: {wid:number;start:number;end:number}[]) => void`. (Keep existing.)
- On a block's `onPointerDown` (only when `unlocked`): read the lane `.wt-area` rect width (`px`), the block's own rect to compute `localX` and `width`, call `dragMode(localX, width)`. Build a `Project`-shaped slice for the helpers — but `WordTrack` only has `TrackWord[]`. Simplest: pass enough to reconstruct, or reuse the helpers by building lightweight `Token`/`Project` adapters from `words`. To avoid passing the whole `Project`, compute math inline using the same formulas as the helpers (move: shift selected words by `dt=clamp`; resize: edit the grabbed word). **Recommended:** pass `project` and the selected `Token[]` down from `Editor` instead of recomputing — i.e., add `project: Project` and `selectedToks: Token[]` props so `WordTrack` calls `computeMove(project, selectedToks, dt)` / `computeResize(project, tok, edge, dt)` directly. Update the test's props accordingly.
- Maintain `const [preview, setPreview] = useState<Map<number,{start:number;end:number}>|null>(null)`. During `pointermove` (window listener), compute `dt = (e.clientX - startX)/areaPx*dur`, call the helper, set preview map. Block rendering uses preview times when present.
- `pointerup`: if not cancelled, `onRetime([...updates])`; clear preview/listeners.
- `keydown Escape` during an active drag: set a `cancelled` flag, clear preview, remove listeners (no commit).
- Resize handles: render `<span className="wt-handle l"/>` / `.r` inside each block, shown on hover/selection via CSS; pointerdown on a handle forces resize mode for that edge.

In `Editor.tsx`: pass `project={P}`, `selectedToks={[...selectedWords].map(resolveTokenByWid)}`, `unlocked={timingsUnlocked}`, `onRetime={(updates) => dispatch("set_word_times", { updates })}`. Add **keyboard nudge** (window keydown, only when `timingsUnlocked` and a cue selected and not editing a field): `ArrowLeft/Right` shift the primary cue by ±0.05s (Shift = ±0.25s) via `set_word_times` (computeMove on the primary token); `Shift+Arrow` adjusts end only (computeResize end). Guard against firing when an `<input>` is focused (`document.activeElement.tagName === "INPUT"`).

`theme.css`: `.wt-area .block .wt-handle { position:absolute; top:0; bottom:0; width:6px; cursor:ew-resize; opacity:0; }` `.wt-handle.l{left:-2px} .wt-handle.r{right:-2px}` show on `.block:hover .wt-handle, .block.sel .wt-handle { opacity:1; background: color-mix(in srgb, #fff 55%, transparent); }`; `.wt-area .block { cursor: grab; }` only when unlocked (add a `.wt.unlocked` parent class → `.wt:not(.unlocked) .block{cursor:default}` and hide handles).

- [ ] **Step 4: Run green** — `npm --prefix web run test` (all) → green; `npm --prefix web run build` → clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/stage/WordTrack.tsx web/src/components/Editor.tsx web/src/theme.css web/src/components/stage/WordTrack.drag.test.tsx
git commit -m "web: timeline drag (move multi/resize) + keyboard nudge, gated on unlocked timings, Esc-cancel"
```

---

### Task 8: Final wiring sanity + integration test

**Files:**
- Modify: `web/src/components/Editor.tsx` (only if gaps remain after Tasks 5–7)
- Test: `web/src/components/Editor.editing.test.tsx`

- [ ] **Step 1: Failing/【integration】test `web/src/components/Editor.editing.test.tsx`** — full flow with the FakeWS harness: push a project, open Inspector, select a cue, click the Timing-panel **unlock** toggle, edit the **End** field → assert a `set_word_times` POST with the expected `updates`; edit the **Text** field → assert a `set_word_text` POST. (Same fetch-spy assertion style as `Editor.integration.test.tsx`.)

```tsx
// after selecting a cue and unlocking:
//   end field commit → fetch called with {tool:"set_word_times", args:{updates:[{wid,start,end}]}}
//   text field blur   → fetch called with {tool:"set_word_text", args:{wid, text}}
const calls = (fetch as any).mock.calls.map((c:any)=>JSON.parse(c[1].body));
expect(calls.some((c:any)=>c.tool==="set_word_times" && c.args.updates?.[0]?.end===2.5)).toBe(true);
expect(calls.some((c:any)=>c.tool==="set_word_text" && c.args.text==="Hi")).toBe(true);
```

- [ ] **Step 2: Run red** — FAIL if any wiring gap; otherwise it documents the flow.

- [ ] **Step 3: Implement** — close any gaps so the integration test passes (the dispatch wiring from Tasks 6–7 should already satisfy it).

- [ ] **Step 4: Run green** — `npm --prefix web run test` → all green; `npm --prefix web run build` → clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/Editor.tsx web/src/components/Editor.editing.test.tsx
git commit -m "web: integration test for retime/text editing flow"
```

---

### Task 9: Full verification + live smoke

**Files:** none (verification)

- [ ] **Step 1: Headless + web suites** — all green:
```
for f in test_engine test_engine_model test_engine_mutations test_engine_build_io test_mcp test_mcp_server test_daemon; do echo "== $f =="; .venv/bin/python tests/$f.py; done
npm --prefix web run test
npm --prefix web run build
```

- [ ] **Step 2: Tk UI suites** (batch, DISPLAY=:1) — confirm no regression (these don't touch words editing but exercise the engine):
```
for f in test_v2_ui test_ui_selection test_ui_undo test_ui_persistence test_ui_style test_mcp_ui; do DISPLAY=:1 .venv/bin/python tests/$f.py; done
```

- [ ] **Step 3: Live smoke** — `python -m daemon --port 8770` + `npm --prefix web run dev`; in the browser: open a project → Timeline tab → unlock timings in the panel → drag a cue body (moves), drag an edge (resizes), edit Start/End numerically, multi-select (Ctrl/Shift) and drag together, Esc cancels a drag; edit a cue's text; **save → reopen** the project and confirm the edits persisted; relock and confirm timing edits are disabled while text stays editable. (Use `mcp__plugin_playwright` to script + screenshot, or do it manually.)

- [ ] **Step 4: Commit any fixups**
```bash
git add -A web/ engine/ mcp_server/ tests/
git commit -m "subtitle-editing: final verification fixups"
```

---

## Self-Review

**Spec coverage:** retime batch + text mutations → T1; persistence (words[] + back-compat) → T2; tools/MCP → T3; pure timing math → T4; selection (ctrl/shift/Esc, unified timeline+lanes) → T5; lock (default locked) + unlocked numeric panel (↑/↓) + text → T6; timeline drag (move multi diff-preserving / resize single) + keyboard nudge + Esc-cancel + small-cue handling (dragMode width<22→move, handles) → T7; integration + persistence smoke → T8/T9. Constraints (start≥0, start<end) enforced in `set_word_times` (T1) and the helpers (T4). ✓

**Placeholder scan:** engine/io/tools (T1–T3) and the web pure helpers (T4) carry complete code + full tests; the React tasks (T5–T8) give exact prop signatures, handler logic in code blocks, full test code, and an explicit recommendation to pass `project`/`selectedToks` into `WordTrack` so the Task-4 helpers are reused (no re-derivation). No TBD/"handle later".

**Type/name consistency:** `set_word_times(updates:[{wid,start,end}])` and `set_word_text(wid,text)` names + arg shapes match across engine→tools→server→web dispatch (`{updates}` / `{wid,text}`); `cueSpan/computeMove/computeResize/dragMode/TimeUpdate` names stable from T4 onward; `timingsUnlocked` + `selectCue(...,mods)` used consistently T5→T7; `TimingPanel` props (`unlocked,onToggleLock,onSetTime,onSetText`) consistent T6/T8.

**Ordering:** engine (1-2) → daemon (3) → web pure (4) → selection (5) → lock+panel (6) → drag+keyboard (7) → integration (8) → verify (9). Each commit keeps suites green; `set_word_times` exists before the web dispatches it.
