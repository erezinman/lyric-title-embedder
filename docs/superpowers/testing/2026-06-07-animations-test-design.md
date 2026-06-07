# Animations — Test Design (work queue)

**Scope:** the upcoming **animations feature** — the generalization of fades into a
channel/segment/anchor animation model, the four new MCP tools, the Inspector append-override
UI, timeline strips, the timing-mode picker, external-sync behaviour, e2e round-trips, and a
**new jassub preview tier**. This document *designs* the tests (IDs, given/when/then, exact
assertion targets, fixtures, file placement). It does **not** write test code or touch product
code.

**Authoritative sources:** `design-system/HANDOFF_animations-questions.md` (Part 1 = settled
model, Part 3 = product calls), `design-system/HANDOFF_animations-reconciliation.md`,
`design-system/HANDOFF_animations.md`, `docs/GLOSSARY.md`, `spikes/libass/FINDINGS.md`,
`spikes/jassub-bench/FINDINGS.md`. Testing philosophy mirrored from
`2026-06-05-interaction-inventory.md` (facets) and `2026-06-05-adjudication-log.md` (TDD
discipline).

**Tk is OUT OF SCOPE.** The Tk desktop app does not gain animation authoring; its suites are
not extended for this feature. The integration target is `engine/ass.py` + `engine/render.py` +
`engine/model.py` + `engine/mutations.py` + the daemon (`daemon/`, `mcp_server/tools.py`) + the
React app (`web/src/**`) — per reconciliation §6, the legacy `core.py`/`app_base.py`/
`build_ass_v2` path is **not** touched.

---

## 0. Facets, IDs, and the four mandated branches

Every control/tool below carries the facet letters from the interaction inventory:

- **[A]ction** — UI before/after + the exact dispatch contract (tool + args).
- **[R]evert symmetry** — the inverse restores **both UI and data** to a pre-captured baseline
  (deep-equal). "Back to square one."
- **[D]ouble action** — defined semantics under repetition.
- **[G]ating** — disabled ⇒ no dispatch; model-level rejection where applicable.
- **[X]** — external-sync: an externally-pushed mutation renders with **zero UI interaction**
  (FakeWS emit in jsdom; side-channel `POST /api/call` in e2e).

The **four mandated test branches** apply to every control/tool and map onto the clusters:
(1) **UI state** before/after → AI/AT/AM clusters; (2) **internal data state**
(project dict / `/api/state`) before/after → AE/AD clusters + the data assertions inside e2e;
(3) **WS/MCP syncing** → AX cluster (exhaustive per tool × per UI facet); (4) **roundtrip
back-to-square-one** → the R facet on every item + the e2e inverse template (AP) +
undo-from-another-client (AX).

ID prefixes:

| Prefix | Cluster | Tier |
|---|---|---|
| **AE-** | A. Engine model / resolution / anchors / timing / compiler / migration / undo | Python, TDD-first |
| **AD-** | B. Daemon / MCP tools | Python |
| **AI-** | C. Inspector (append model, rows, tombstones, disclosure, preset picker) | jsdom audit |
| **AT-** | C. Track/strips + lanes ANIMATION column | jsdom audit |
| **AM-** | C. Timing-mode picker | jsdom audit |
| **AX-** | D. External sync (per tool × per UI facet) | jsdom audit + e2e |
| **AP-** | E. E2E round-trip (real daemon) | Playwright |
| **AJ-** | F. jassub preview tier (NEW) | Playwright/headless chromium |

---

## 1. Fixtures — extend `baseProject()`

The current `baseProject()` (`web/src/test-util/fixtures.ts`) has 2 groups (Verse 1: lines
`[0,1,2,3]` and `[4,5,6]`; Chorus: `[7,8]`), the legacy `globals.fade_*_ms`, `fin_tags`,
`fout_tags`, and per-group `accumulate`/`fade`. The animations model **replaces** these. We add a
parallel set of builders. Engine (Python) fixtures mirror the same shapes built off
`engine.make_project(...)` / a literal project dict.

### 1.1 Animation/AnimTime literal builders (shared shape, both TS + Python)

Builders must emit the **settled schema** (questions §1.2), NOT the designer's `{s,e}` shape:

```ts
// time(anchor, offset, unit) → AnimTime
const time = (anchor, offset = 0, unit = "ms") => ({ anchor, offset, unit });

// seg(t0, t1, from, to, accel) → AnimSegment
const seg = (t0, t1, from, to, accel = 1) => ({ t0, t1, from, to, accel });

// anim(partial) → Animation with sane defaults
const anim = (p) => ({
  id: p.id ?? "a1", name: p.name ?? "custom", channel: p.channel ?? "alpha",
  segments: p.segments ?? [seg(time("cue_start"), time("cue_start", 250), null, 1)],
  stagger: p.stagger,            // optional
  enabled: p.enabled ?? true,
});
```

### 1.2 `withAnimations(p, spec)` — the headline builder

`spec` places `Animation[]` / `suppress[]` at each scope, producing the settled carriers
(reconciliation §2). **Exact** project-dict paths it must write:

| Scope | Path it writes |
|---|---|
| global | `p.globals.animations: Animation[]` |
| group `gi` | `p.layout[gi].animations: Animation[]` |
| group `gi` suppress | `p.layout[gi].suppress: string[]` (anim ids) |
| tag (selection/cue) | `p.anim_tags: AnimTag[]` where `AnimTag = {ids:number[], anims:Animation[], suppress:string[]}` |

```ts
withAnimations(baseProject(), {
  global: [anim({id:"g_fade", name:"fade_in", channel:"alpha",
                 segments:[seg(time("cue_start"), time("cue_start",250), null, 1)]})],
  group: { 0: [anim({id:"grp_pop", name:"pop", channel:"scale_x"})] },
  suppress: { 0: ["g_fade"] },                 // group 0 tombstones the global fade-in
  tags: [{ ids:[7,8], anims:[anim({id:"t_color", name:"color_flash", channel:"primary"})],
           suppress:[] }],
});
```

### 1.3 Named convenience fixtures

- `withMigratableLegacyProject()` — a project still carrying `fin_tags`/`fout_tags`/
  `group.fade`/`globals.fade_*_ms`/`layout[gi].accumulate`, used **only** by the migration
  tests (AE-MIG-*). It is the pre-migration input; the gold `.ass` is captured from the
  *current* engine before migration code exists.
- `withInheritedStack()` — global fade-in + group pop + a 2-cue tag color flash, so a single
  selected cue resolves an Inherited(3) list (drives AI disclosure + Inherited(n) tests).
- `withTombstone()` — global fade-in + group `suppress:["g_fade"]` (drives tombstone-row +
  restore tests).
- `withMultiGroupTag()` — a tag whose `ids` span groups 0 and 1, for span-clamping (AE-ANC-*)
  and the "7 cues" chip (AI-TAG-*).
- `withOverlapConflict()` — global scale_x pop + a cue-tag scale_x stretch with **overlapping**
  windows on the same cue (drives AE-RES narrowest-wins-drop + AX/AI conflict warning).
- `withChainedAnim()` — one alpha animation with two non-overlapping segments
  (0→50% in 20ms, 50→100% in 80ms) for compiler chained-`\t` ordering (AE-CMP-*).

### 1.4 Engine fixtures (Python, `tests/`)

Build directly from a project dict literal (the `_proj()` pattern in `test_merge_span.py`) plus
small helpers `_anim(...)`, `_time(...)`, `_seg(...)`, `_resolved(project, wid)` that returns the
flat resolved animation list for a cue (the function under test). The migration fixture loads a
legacy `aligned_lyrics.json`-derived project and snapshots `engine.build_ass(...)` bytes.

---

## 2. Cluster AE — Engine (Python, TDD-first)

**HOUSE RULE:** engine tests are written and **failing** before any engine implementation
(`engine-tests-first` memory). Style: stdlib `t_*` script per file as in `test_merge_span.py` /
`test_globals_undo.py`, `check(name, fn)`, exit non-zero on any fail. Adjudicate every failure in
`2026-06-05-adjudication-log.md` (CODE-BUG / TEST-BUG / SPEC-GAP) before changing code or test.

### 2A — Model validation → `tests/test_anim_model.py`
- [ ] **AE-MOD-01** `move` channel **rejected at tag scope** (cue/selection); accepted at
  group/global (§1.4). [A,G]
- [ ] **AE-MOD-02** segments must be **non-overlapping within one animation**; an overlapping
  pair raises `ValueError`. [G]
- [ ] **AE-MOD-03** segments are **ordered**; out-of-order t0s raise (or are normalized — see
  SPEC-GAP-3). [G]
- [ ] **AE-MOD-04** `unit:"frac"` offset outside `0..1` where the channel/anchor requires a
  fraction is rejected; `ms` offsets are unbounded-signed. [G]
- [ ] **AE-MOD-05** unknown `anchor` / unknown `channel` rejected. [G]
- [ ] **AE-MOD-06** `karaoke_fill` animation rejects anchors/segments other than its intrinsic
  sung interval (questions §1.6: "no anchors/modes apply"). [G]
- [ ] **AE-MOD-07** `stagger` present on a non-multi-member scope is accepted-but-inert OR
  rejected (SPEC-GAP candidate — see SPEC-GAP-4). [G]
- [ ] **AE-MOD-08** `enabled:false` animation validates fine but is dropped from resolution
  (cross-ref AE-RES-07). [A]

### 2B — Resolution semantics → `tests/test_anim_resolve.py`
- [ ] **AE-RES-01** **Waterfall collect:** for a cue, resolved set = global ∪ group ∪ (every
  tag containing the cue), in `global→group→tag` order. [A]
- [ ] **AE-RES-02** **Suppression (group):** `layout[gi].suppress=["g_fade"]` drops the inherited
  global `g_fade` for that group's cues; it remains present in the *project dict* at global. [A]
- [ ] **AE-RES-03** **Suppression (tag):** `tag.suppress` mutes inherited global+group anims for
  the tag's ids only. [A]
- [ ] **AE-RES-04** **Additivity:** non-conflicting animations all survive; chained-segment
  idioms intact. [A]
- [ ] **AE-RES-05** **Cross-scope conflict — narrowest wins, whole-animation drop:** global +
  cue-tag both touch `scale_x` with **overlapping** windows → the **wider (global)** animation is
  dropped **entirely for that cue** (no time-slicing); the narrower survives intact. Keyed on
  **channel + time-overlap, never name** (§1.3.3). [A]
- [ ] **AE-RES-06** Non-overlapping same-channel cross-scope animations **both run** (the drop is
  overlap-gated). [A]
- [ ] **AE-RES-07** `enabled:false` excluded from resolution; suppressed ≠ disabled (distinct
  reasons, both excluded). [A]
- [ ] **AE-RES-08** **Same-scope, same-channel overlap** (group pop + group stretch on
  `scale_x`) → **both emitted**, AND a **warning is surfaced** on the resolved output
  (the daemon/compiler flag; §1.3.4). [A]
- [ ] **AE-RES-09** Two `custom`-named animations on one channel do **not** suppress each other
  by name — only overlap rule 3 applies (§1.3.3 explicit). [A]
- [ ] **AE-RES-10** **Roundtrip:** add an override that wins → resolve → remove it → resolved set
  deep-equals the pre-add baseline. [R]

### 2C — Anchor math → `tests/test_anim_anchors.py`
- [ ] **AE-ANC-01..08** the **8 anchors** resolve to the correct absolute seconds for a known
  cue: `cue_start/end`, `line_start/end`, `span_start/end`, `event_start/end`. (8 checks.) [A]
- [ ] **AE-ANC-09** `offset` in **ms** shifts the resolved time by `offset/1000`s (signed). [A]
- [ ] **AE-ANC-10** `offset` in **frac** = fraction of the anchor's span:
  `cue_start + 0.5·(cue_end-cue_start)`. [A]
- [ ] **AE-ANC-11** **Merged-cue span:** a merged cue's `cue_*` anchors use earliest-start /
  latest-end of its ids (GLOSSARY "merged cue span"). [A]
- [ ] **AE-ANC-12** **`span_*` tag anchor:** min-start / max-end over the tag's ids → members
  animate in unison (same absolute window). [A]
- [ ] **AE-ANC-13** **`span_*` group anchor:** = the event window (`win_start/win_end`). [A]
- [ ] **AE-ANC-14** **Hybrid endpoints:** `t0=span_start`, `t1=cue_end` resolves a per-member
  window starting together / ending per-cue (§1.2 "start together, end per cue"). [A]
- [ ] **AE-ANC-15** **Multi-group tag clamping:** a span-anchored animation that begins before a
  member cue's event exists → that cue is clamped to mid/past-animation (§1.2 edge). [A]
- [ ] **AE-ANC-16** **Retiming follows anchors:** retiming a word shifts its anchor-derived
  animation times (the migrated-trigger "follows the words" property). [R]

### 2D — Timing modes / stagger → `tests/test_anim_timing.py`
- [ ] **AE-TM-01** **Per cue** (`cue_*`, no stagger): each member on its own clock. [A]
- [ ] **AE-TM-02** **Per line** (`line_*`): each line animates as a unit, triggered by its first
  word. [A]
- [ ] **AE-TM-03** **Together** (`span_*` / `event_*`): all members one shared moment. [A]
- [ ] **AE-TM-04** **Cascade** (`order:"index"`, `step`): member i starts `i·step` after the
  first, ordered by **reading order** (gi, li, ti) — **not time**. [A]
- [ ] **AE-TM-05** Cascade stability under retiming: reordering word *times* does **not** change
  cascade order (reading-order basis, §1.2 canonical). [R]
- [ ] **AE-TM-06** **Reverse** (`order:"reverse"`): last member first. [A]
- [ ] **AE-TM-07** **Center-out** (`order:"center_out"`): ordered by distance from the
  member-list **midpoint in index space** (no pixel metrics). Verify even and odd member counts.
  [A]
- [ ] **AE-TM-08** **Chained** (`chained:true`): step = previous member's animation **duration**,
  overriding `step.value` (typewriter/domino). [A]
- [ ] **AE-TM-09** **Jitter** (`order:"random"`): offset within `±step`, **seeded by word id** →
  identical across two renders of the same project (determinism). [A]
- [ ] **AE-TM-10** `step.unit:"frac"` = fraction of span; `ms` = absolute. [A]
- [ ] **AE-TM-11** **Non-contiguous / multi-line selection** cascade is well-defined by reading
  order. [A]

### 2E — Compiler emission → `tests/test_anim_compile.py`
Assert against emitted `.ass` override text (the `\t`/`\clip`/`\kf` strings).
- [ ] **AE-CMP-01** **Chained `\t` order:** a 2-segment alpha emits two `\t` in chronological
  segment order; values continuous (seg1.to == seg2.from). [A]
- [ ] **AE-CMP-02** **Narrow-scope-LAST:** when global+group+tag all animate one channel, the
  compiler emits `\t` in `global→group→tag` order so the narrowest is **last-listed**
  (spike #1: last-listed wins continuously). [A]
- [ ] **AE-CMP-03** **S-curve auto-expand:** an ease-in-out preset auto-expands to **two chained
  segments** (§1.4) — assert exactly 2 `\t` for one logical animation, invisible to the model
  caller. [A]
- [ ] **AE-CMP-04** **`\clip` rect from laid-out bbox:** Wipe emits a **rect** `\clip` (not
  vector/`\iclip`) under `\t`, endpoints derived from the laid-out text bbox accounting for
  alignment (spike #2). [A]
- [ ] **AE-CMP-05** **`\kf` with gap padding:** Sweep emits `\kf` per word + `\k<gap>` padding
  between words; centisecond durations **sum to cover every gap** from event start; unsung =
  SecondaryColour, sung = PrimaryColour (spike #5). [A]
- [ ] **AE-CMP-06** **Appearance-gate rule:** a cue with **no alpha animation** covering it is
  **visible for the whole event** (zero-duration legacy behaviour); a cue *with* an alpha anim
  gates visibility at its appear time (GLOSSARY "Appearance"). [A]
- [ ] **AE-CMP-07** **No static tag after animated `\t`** on the same property unless cancelling
  (spike #1 rule — a trailing static kills the animation). [A]
- [ ] **AE-CMP-08** Sung-time color sweep (`cue_start..cue_end`) composes freely with any
  appearance mode (no interference). [A]
- [ ] **AE-CMP-09** `move` compiles to event-level `\move`/`\t…\pos` from the laid-out bbox
  (group/global only). [A]

### 2F — Migration → `tests/test_anim_migration.py`
- [ ] **AE-MIG-01** `fin_tags`/`fout_tags` `{ids,trigger}` → `anim_tags` with `fade_in`/
  `fade_out` named alpha animations. [A]
- [ ] **AE-MIG-02** `group.fade {fade_in_ms,fade_out_ms}` → group-scope alpha animations. [A]
- [ ] **AE-MIG-03** `globals.fade_in_ms/fade_out_ms` → global-scope alpha animations. [A]
- [ ] **AE-MIG-04** **trigger → cue_end offset:** a migrated fade-out `trigger` (absolute s)
  becomes a `cue_end`-anchored offset; verify it now *follows* a retimed word (AE-ANC-16 link).
  [A]
- [ ] **AE-MIG-05** **accumulate → timing mode:** `words`→Per cue (`cue_start`), `lines`→Per line
  (`line_start`), `off`→Together (`event_start`); the `accumulate` field is **removed**. [A]
- [ ] **AE-MIG-06** Post-migration the legacy fields (`fin_tags`,`fout_tags`,`group.fade`,
  `globals.fade_*_ms`,`layout[gi].accumulate`) are **absent** from the project dict. [A]
- [ ] **AE-MIG-07** **GOLD TEST — byte-level `.ass` equivalence:** for a representative legacy
  project, `build_ass(migrated_project)` is **byte-identical** to `build_ass(legacy_project)` on
  the pre-migration engine (the snapshot captured into the fixture). This is the migration
  correctness anchor. [A]
- [ ] **AE-MIG-08** Migration is **idempotent**: migrating an already-migrated project is a
  no-op (no double fade records). [D]

### 2G — Undo/redo through Session → `tests/test_anim_undo.py`
For each of the four mutations: do → undo restores baseline (deep-equal) → redo reapplies; each
is **one** undo step.
- [ ] **AE-UNDO-01** `add_animation` ↔ undo. [R]
- [ ] **AE-UNDO-02** `remove_animation` (own anim delete) ↔ undo. [R]
- [ ] **AE-UNDO-03** `remove_animation` (inherited → tombstone) ↔ undo (tombstone removed). [R]
- [ ] **AE-UNDO-04** `restore_animation` (clear tombstone) ↔ undo (tombstone re-added). [R]
- [ ] **AE-UNDO-05** `set_animation_props` ↔ undo restores prior props (and
  `set_props(original)` is itself a valid inverse — back to square one). [R]
- [ ] **AE-UNDO-06** add → remove → undo → undo: two-step history restores baseline. [R,D]

**Worked example — AE-RES-05 (cross-scope conflict, narrowest-wins, whole-animation drop):**
> **Given** `withOverlapConflict()`: `globals.animations=[pop@scale_x, t0=cue_start..cue_start+200ms]`
> and `anim_tags=[{ids:[0], anims:[stretch@scale_x, t0=cue_start+50ms..cue_start+250ms]}]`.
> **When** `_resolved(project, wid=0)` is computed.
> **Then** the resolved list for cue 0 contains the cue-tag `stretch` animation **only**; the
> global `pop` is **entirely absent** for cue 0 (not time-sliced). For a cue NOT in the tag
> (wid=1) the global `pop` **is** present. Assert: `[a.id for a in resolved(0)] == ["stretch"]`
> and `"pop" in [a.id for a in resolved(1)]`.

**Worked example — AE-MIG-07 (gold `.ass` equivalence):**
> **Given** `legacy = withMigratableLegacyProject()` and `gold = build_ass(legacy)` captured by
> the current engine into the fixture as a frozen string.
> **When** `migrated = migrate(legacy)` then `out = build_ass(migrated)`.
> **Then** `out == gold` byte-for-byte. On mismatch, diff is dumped; adjudicate
> (a real semantic change is CODE-BUG against migration; a benign reorder is TEST-BUG with a
> spike citation).

**Worked example — AE-TM-09 (jitter determinism):**
> **Given** a group animation `stagger={order:"random", step:{value:80,unit:"ms"}}` over cues
> 0..3.
> **When** resolution runs twice on a deep-copied project.
> **Then** the per-member offsets are identical run-to-run, and each ∈ `[-80,+80]`ms, and the
> offset for word id N is a pure function of N (swap two words' positions in the line → their
> offsets travel with the **word id**, not the slot).

---

## 3. Cluster AD — Daemon / MCP tools → `tests/test_anim_tools.py`, `tests/test_anim_daemon.py`

Style: `HeadlessContext` + `mcp_server.tools` as in `test_globals_undo.py`. Tools (reconciliation
§6 / designer §5): `add_animation(scope, ref, anim)`, `remove_animation(scope, ref, anim_id)`,
`restore_animation(scope, ref, anim_id)`, `set_animation_props(scope, ref, anim_id, partial)`.
`scope ∈ {"global","group","cue"}` ("cue"/selection = tag), `ref = gi | word_ids`.

### 3A — add_animation
- [ ] **AD-ADD-01** global add appends to `globals.animations`; returns the affected entity. [A]
- [ ] **AD-ADD-02** group add appends to `layout[gi].animations`. [A]
- [ ] **AD-ADD-03** cue/selection add creates/extends an `AnimTag {ids, anims, suppress}`;
  single id = tag of one. [A]
- [ ] **AD-ADD-04** **arg validation / error codes:** bad scope, missing ref, malformed anim →
  400 (unknown/bad-args) per FEATURES §6; engine validation failure → 422. [G]
- [ ] **AD-ADD-05** `move` at cue scope → **rejected** (mirrors AE-MOD-01) with the model error.
  [G]
- [ ] **AD-ADD-06** **broadcast:** the add pushes `{type:"state", state}` on `/ws`. [X]
- [ ] **AD-ADD-07** **autosave:** the add marks the project dirty → debounced persist (mirror
  `test_autosave.py`). [A]

### 3B — remove_animation (tombstone semantics)
- [ ] **AD-RM-01** removing an **own** animation deletes it from its scope list. [A]
- [ ] **AD-RM-02** removing an **inherited** id at a child scope writes a **tombstone**
  (`suppress` entry), NOT a deletion at source (absent ≠ removed). [A]
- [ ] **AD-RM-03** removing a non-existent / already-tombstoned id → error or no-op (define;
  SPEC-GAP-5). [G]
- [ ] **AD-RM-04** broadcast + autosave. [X,A]

### 3C — restore_animation
- [ ] **AD-RS-01** clears a tombstone (`suppress` entry removed); the inherited animation
  re-resolves. [A]
- [ ] **AD-RS-02** restore of a non-tombstoned id → no-op/error (define). [G]
- [ ] **AD-RS-03** **roundtrip:** remove(inherited) → restore → project dict deep-equals
  baseline. [R]

### 3D — set_animation_props
- [ ] **AD-SP-01** partial prop update merges (e.g. `{segments:[…]}`, `{enabled:false}`,
  `{stagger:…}`). [A]
- [ ] **AD-SP-02** **drag-retime path:** `set_animation_props(... {t0:{offset}})` /
  `{t1:{offset}}` writes offset deltas against existing anchors (reconciliation §1). [A]
- [ ] **AD-SP-03** invalid partial (overlapping segments, frac out of range) → 422. [G]
- [ ] **AD-SP-04** **roundtrip:** `set_props(x)` then `set_props(original)` → baseline. [R]

### 3E — Resolved lists in get_project / get_render
- [ ] **AD-GET-01** `get_project` includes the per-scope animation carriers AND the per-cue
  **resolved** animation list (post append/tombstone/edit). [A]
- [ ] **AD-GET-02** `get_render` / `get_word` returns the **flat resolved** list per cue so the
  timeline & preview consume it without re-resolving (designer §5). [A]
- [ ] **AD-GET-03** the conflict **warning** (AE-RES-08) surfaces in the resolved payload
  (e.g. a `warnings[]` on the cue/render). [A]

### 3F — REMOVAL of old fade tools (no backward compat)
- [ ] **AD-OLD-01** `make_fade_tag` → **unknown tool** (404/400 unknown). [G]
- [ ] **AD-OLD-02** `clear_fade_tag` → unknown tool. [G]
- [ ] **AD-OLD-03** `set_fade_tag_props` → unknown tool. [G]
- [ ] **AD-OLD-04** `set_fade_defaults` → unknown tool. [G]
- [ ] **AD-OLD-05** `set_group_fade` → unknown tool. [G]
- [ ] **AD-OLD-06** `get_state`/`get_project` payload no longer carries `fin_tags`/`fout_tags`/
  `globals.fade_*_ms`/`group.fade`/`accumulate` (post-migration shape). [A]

**Worked example — AD-RM-02 (inherited → tombstone):**
> **Given** `HeadlessContext` loaded; `add_animation("global", null, anim({id:"g_fade",
> name:"fade_in", channel:"alpha"}))`.
> **When** `remove_animation("group", 0, "g_fade")`.
> **Then** `globals.animations` still contains `g_fade` (source intact); `layout[0].suppress ==
> ["g_fade"]`; the resolved list for a cue in group 0 omits `g_fade`; a cue in group 1 still
> resolves it. A `{type:"state"}` frame was broadcast.

**Worked example — AD-OLD-01 (old tool gone):**
> **Given** a fresh `HeadlessContext`.
> **When** the daemon dispatches `make_fade_tag` (via `/api/call` or `tools.make_fade_tag`).
> **Then** it raises **unknown-tool** (the function does not exist / `/api/call` returns 400
> unknown). No `fin_tags` mutation occurs.

---

## 4. Cluster AI — Inspector (jsdom audit) → `web/src/components/panels/AnimInspector.audit.test.tsx`

Mirror `OpsToolbar.audit.test.tsx`: `setupFakeWS` + `mockApi` in `beforeEach`, `boot()` +
`emitState(withAnimations(...))`, assert dispatch via `dispatches()` / `dispatchesOf(tool)`,
assert UI via class names / aria. Apply **A/R/D/G** to each control.

### 4A — Append model
- [ ] **AI-01** GLOBAL tier shows the complete base animations list; GROUP/CUE tiers start empty
  reading *"inherits everything from {parent}"* (no overrides). [A]
- [ ] **AI-02** **`＋ Add animation ▾`** opens the **preset picker** (Fade in/out, Sweep, Pop,
  Color flash, Wipe in, Blur in, Slide). [A]
- [ ] **AI-03** picking a preset dispatches `add_animation` with `scope`, `ref` (gi or word_ids),
  and a typed `anim` carrying the preset's channel + **default timing mode** (§4.1). [A]
- [ ] **AI-04** Slide preset is **disabled at cue tier**, enabled at group/global, with the
  "group-level only" explainer (§1.4 / Q12). [G]
- [ ] **AI-05** **edit** (✎) an own animation row → opens props; commit dispatches
  `set_animation_props`. [A]
- [ ] **AI-06** **revert** (↺) an override row restores the inherited display (no override
  stored). [A,R]
- [ ] **AI-07** **remove** (✕) an own animation dispatches `remove_animation` (own delete). [A]
- [ ] **AI-08** add → remove the same animation → Inspector + state back to baseline
  (deep-equal echo). [R]
- [ ] **AI-09** **double add** of two presets stacks two rows; each independently removable. [D]

### 4B — Tombstone rows + restore
- [ ] **AI-10** removing an **inherited** animation at a child scope renders a **tombstone row**
  (`.tomb`, copy `⊘ {name} — removed here`), NOT mere absence; dispatch = `remove_animation`
  writing a tombstone. [A]
- [ ] **AI-11** tombstone row's restore (↺) dispatches `restore_animation`; the row reverts to a
  normal inherited row. [A,R]
- [ ] **AI-12** remove(inherited) → restore → UI + state baseline (deep-equal). [R]

### 4C — Inherited(n) disclosure
- [ ] **AI-13** with `withInheritedStack()` the CUE tier shows `▸ Inherited (3)`; expanding
  reveals the full computed list (own + inherited + tombstones). [A]
- [ ] **AI-14** override / remove **inline from within** the disclosure dispatches the right tool
  against the **narrow** scope (override-here copies to narrow scope which then wins by rule 3).
  [A]
- [ ] **AI-15** disclosure collapse/expand is idempotent (D); count `(n)` matches resolved length.
  [D]

### 4D — Tag ("N cues") affordance
- [ ] **AI-16** a cue belonging to a multi-cue tag (`withMultiGroupTag()`) shows a **"7 cues"
  chip** on that animation row; clicking it selects all member cues. [A]
- [ ] **AI-17** editing a tag animation from one member applies to the **whole tag** (engineer
  leaning) — dispatch carries the tag's full `ids`, not the single cue. [A]

### 4E — Preset picker
- [ ] **AI-18** the picker lists exactly the canonical v1 set (reconciliation §5: Fade in, Fade
  out, Sweep, Pop, Color flash, Wipe in, Blur in, Slide). [A]
- [ ] **AI-19** each preset instantiates the correct `channel(s)` (Pop→scale_x+scale_y,
  Wipe→clip_rect, Sweep→karaoke_fill, Blur→blur, Color→primary, Fade→alpha, Slide→move). [A]
- [ ] **AI-20** **gating:** `＋ Add override ▾` lists only not-yet-set props (style side, mirrors
  existing waterfall). [G]

**Worked example — AI-10 (tombstone render + dispatch):**
> **Given** `boot()` then `emitState(withInheritedStack())`; select a cue in group 0 (lane row
> click) and switch the rail to Inspector; expand `▸ Inherited (3)`.
> **When** the user clicks ✕ on the inherited `fade_in` (global) row.
> **Then** `dispatchesOf("remove_animation")` has length 1 with
> `{scope:"group"|"cue", ref:…, anim_id:"g_fade"}`; after echoing the tombstoned state, the row
> renders as `.tomb` containing text matching `/removed here/i` with a restore button
> (`getByRole("button", {name:/restore/i})`). No second `add_animation`/delete fires.

**Worked example — AI-03 (preset add dispatch + default mode):**
> **Given** a cue selected, `＋ Add animation ▾` open.
> **When** the user clicks **Pop**.
> **Then** exactly one `add_animation` dispatch with `args.scope==="cue"`,
> `args.ref` deep-equals the selected `word_ids`, `args.anim.channel` ∈ {scale_x,scale_y}
> (or two animations / one multi-channel — assert per final type shape), and the instantiated
> animation's mode default = `percue` (§4.1 table).

---

## 5. Cluster AT — Timeline strips + lanes ANIMATION column (jsdom audit) → `web/src/components/dock/WordTrack.anim.audit.test.tsx`, `web/src/components/dock/CueLanes.anim.audit.test.tsx`

Port targets: `tl-anim.css` classes `.astrip`, `.astrip.glyph|.overflow|.collapse`, `.h` (drag
handle), `.cue.exp`; `tl-anim.js` `stripStyle`, `typeColor`, `typeGlyph`.

### 5A — Strips: fill-by-type & density
- [ ] **AT-01** an animation renders a `.astrip` docked to the bottom band, x-bounds synced to
  the time axis (from the **resolved** per-cue times). [A]
- [ ] **AT-02** **fill-by-type class/style** per channel (color→linear-gradient, alpha→opacity
  ramp, size→wedge clip-path, type→hatch, move→arrow, glow→radial bloom) — assert the
  type→class mapping for each. [A]
- [ ] **AT-03** **cap = 3:** a cue with ≤3 animations shows that many real bars sharing the ~42%
  band, each `42/slots` tall. [A]
- [ ] **AT-04** **>3 → "+N" overflow chip** in the last slot, striped with hidden types' colors,
  spanning their time union. [A]
- [ ] **AT-05** **inline expand:** clicking **+N** on the already-selected cue adds `.cue.exp`,
  grows height `54+(n-3)*13px`, shows all bars + a `.astrip.collapse` ✕ chip. [A,D]
- [ ] **AT-06** re-selecting elsewhere or clicking ✕ **collapses** back (height restored). [R]
- [ ] **AT-07** **MIN_PX = 26 glyph chip:** a bar whose rendered width `duration·pxPerSec(zoom)`
  < 26px renders `.astrip.glyph` (type glyph + `~`); zooming horizontally past the threshold
  promotes it to a real bar (the **only** zoom affecting density). [A,G]

### 5B — Strips: 2-click focus & drag-retime
- [ ] **AT-08** **1st click** on a cue/strip selects the cue (opens Inspector). [A]
- [ ] **AT-09** **2nd click** on a strip (cue already selected) **focuses** the animation:
  Inspector drills into its row AND the strip gets `.h` drag handles on both edges. [A]
- [ ] **AT-10** **drag a handle** dispatches `set_animation_props` with the retimed endpoint
  (`{t0:{offset}}` or `{t1:{offset}}`), clamped to **≥50ms** width. [A,G]
- [ ] **AT-11** **drag-back nets baseline** (non-saturating drag) → state + strip geometry back to
  square one (cross-ref ADJ-02: symmetry only off the clamp wall). [R]
- [ ] **AT-12** **Esc mid-drag** cancels: no dispatch + visual restore; selection preserved. [A,G]
- [ ] **AT-13** strips are **muted** (`.astrip` lower opacity/desat) until the cue is
  hovered/selected. [A]

### 5C — Lanes ANIMATION column
- [ ] **AT-14** the 4th **ANIMATION** column renders **inherited-grey** vs **override-solid**
  markers, mirroring the fade lanes. [A]
- [ ] **AT-15** a tombstoned inherited anim shows the suppressed treatment in the column. [A]
- [ ] **AT-16** column reflects resolved animation presence per cue; empty when none. [A,G]

**Worked example — AT-10 (drag-retime dispatch + clamp):**
> **Given** a focused alpha strip on cue 0 (after 2-click focus), `clearDispatches()`.
> **When** the user pointer-drags the **right** handle by +Δpx (within bounds).
> **Then** exactly one `set_animation_props` with `args.anim_id` of that animation and
> `args.partial.t1.offset` increased by the px→ms conversion; a drag that would shrink width
> below 50ms is clamped (assert the dispatched offset corresponds to exactly 50ms, never less).

**Worked example — AT-07 (glyph-chip threshold vs zoom):**
> **Given** a 30ms animation at a zoom where `pxPerSec` makes it 18px wide.
> **When** the strip renders.
> **Then** it has class `.astrip.glyph` (not a true-width bar). **When** zoom doubles
> (px width 36 > 26) and state re-renders, the same strip renders as a real `.astrip` without
> `.glyph`. No dispatch occurs from zooming (G — zoom is view-only).

---

## 6. Cluster AM — Timing-mode picker (jsdom audit) → `web/src/components/panels/TimingMode.audit.test.tsx`

Port targets (`tm.css`/`tm.js`): `.seg`/`.seg-b.seq`, `.md`/`.md-pop`/`.md-item`, `.substep`,
`.adv-pop`, glossary tooltip wiring. Option B locked: 3 inline segments + `Sequence ▾` popover,
full-width row under a "TIMING" label.

- [ ] **AM-01** the row renders 3 always-visible inline segments **Per cue · Per line ·
  Together** + a 4th **`Sequence ▾`** cell, full-width under a **TIMING** label. [A]
- [ ] **AM-02** clicking a segment dispatches `set_animation_props {mode}` (or the
  anchor-equivalent in the settled model — see SPEC-GAP-1) and marks it active. [A]
- [ ] **AM-03** **`Sequence ▾`** opens a grouped popover: **Sequence**: cascade/typewriter ·
  **Advanced**: reverse/centerout/jitter; choosing one adopts its name on the cell. [A]
- [ ] **AM-04** **step sub-row gating:** the indented `.substep` appears **only** for sequence
  modes (cascade/typewriter/advanced); for percue/perline/together it shows the dashed
  "not used" placeholder so row height never jumps. [G]
- [ ] **AM-05** **ms ⇆ % toggle** on `step` flips unit; % = fraction of span; dispatch carries
  `{step:{value,unit}}`. [A]
- [ ] **AM-06** **per-preset defaults:** instantiating Fade/Pop/Color/Blur → Per cue;
  Wipe/Typewriter → Typewriter; Slide → Together (§4.1 table). [A]
- [ ] **AM-07** **roundtrip:** switch mode A→B→A restores baseline state + UI (active segment +
  substep visibility). [R,D]
- [ ] **AM-08** mode names are **hover-explained** (glossary tooltip present, aria-describedby /
  title). [A]
- [ ] **AM-09** **gating:** Advanced modes (reverse/centerout/jitter) live only in the popover,
  not in the inline segments. [G]

**Worked example — AM-04 (step sub-row gating):**
> **Given** an animation row in `together` mode.
> **When** the row renders.
> **Then** the `.substep` slot shows the dashed placeholder (no editable step), and row height
> equals the height in `percue`. **When** the user picks **Cascade** via `Sequence ▾`, the
> `.substep` becomes an editable step field (ms/% toggle present) and the row height is stable
> (placeholder slot was already reserved). Switching back to `together` re-hides it.

---

## 7. Cluster AX — External sync (jsdom + e2e) → `web/src/components/ExternalSync.anim.audit.test.tsx`, `web/e2e/external-sync-anim.spec.ts`

**Theme (cluster F extension):** every animation mutation pushed externally renders with **zero
UI interaction** — FakeWS `emit({type:"state", state})` in jsdom, side-channel `apiCall(tool,
args)` in e2e. Organized **per tool × per UI facet**. The push must update: inspector rows,
tombstone rows, Inherited(n) count, strips, lanes ANIMATION column, timing-mode picker state.
Then a baseline push reverts each (back to square one). **VIS-CLICK** allowed only to make a
surface visible (switch rail/dock tab, select a cue) — never to cause the mutation.

### 7A — add_animation (pushed)
- [ ] **AX-01** pushed global add → appears in Inspector GLOBAL list + lanes ANIMATION column +
  strip on every cue, zero clicks. [X]
- [ ] **AX-02** pushed cue/tag add → strip on the tagged cue + inspector row + "N cues" chip. [X]
- [ ] **AX-03** baseline re-push reverts all surfaces. [X,R]

### 7B — remove_animation / tombstone (pushed)
- [ ] **AX-04** pushed tombstone → tombstone row renders + Inherited(n) count adjusts +
  strip disappears + column shows suppressed. [X]
- [ ] **AX-05** baseline re-push reverts. [X,R]

### 7C — restore_animation (pushed)
- [ ] **AX-06** pushed restore → tombstone row reverts to inherited row + strip reappears. [X,R]

### 7D — set_animation_props (pushed)
- [ ] **AX-07** pushed prop change (segments) → strip x-bounds/fill update + inspector value. [X]
- [ ] **AX-08** pushed mode change → timing-mode picker active segment + substep visibility
  update with zero interaction. [X]
- [ ] **AX-09** pushed `enabled:false` → strip mutes/drops + row shows disabled. [X]

### 7E — Conflict warning (pushed)
- [ ] **AX-10** pushed same-scope overlap (`withOverlapConflict` same-scope variant) → the
  warning indicator renders on the offending rows / panel header (§1.3.4). [X]

### 7F — Undo-from-another-client (FULL UI revert)
- [ ] **AX-11** local `add_animation` echo (within the post-local-call window) raises **NO**
  "AI agent updated" toast; an **unsolicited** animation push **does** (mirror existing
  external-edit detection). [X]
- [ ] **AX-12** **undo pushed from another client** → the entire animation UI (rows, strips,
  column, picker) reverts to the prior state with zero interaction. [X,R]

**Worked example — AX-04 (pushed tombstone, no interaction):**
> **Given** `boot()`, `emitState(withInheritedStack())`, VIS-CLICK to select a group-0 cue + open
> Inspector + expand Inherited.
> **When** `emitState(withTombstone())` (the only mutation; no click causes it).
> **Then** the `fade_in` row is now `.tomb` (`/removed here/i`), the disclosure count drops from
> `(3)` to `(2)` of active, the cue's alpha strip is gone from WordTrack, and the lanes ANIMATION
> column shows the suppressed marker. **When** `emitState(withInheritedStack())` again, all four
> surfaces revert (deep-equal to the captured pre-push snapshot).

---

## 8. Cluster AP — E2E round-trip (Playwright, real daemon) → `web/e2e/animations.spec.ts`

Template per cluster (from the inventory's e2e template + `helpers.ts`): capture baseline
`apiState()` → interact in the browser → assert **state diff** (`/api/state` paths) + UI/CSS/
geometry → inverse → assert **both** state and UI back at baseline; `resetProject()` between
tests (pristine-snapshot, autosave-aware). Side-channel `apiCall(...)` = MCP impersonation.

- [ ] **AP-01** add an animation via the preset picker → `/api/state` gains the record at the
  right scope carrier + a `.astrip` appears; remove → both back to baseline. [A,R]
- [ ] **AP-02** drag-retime a strip handle against **real geometry** → `set_animation_props`
  offset lands in `/api/state`; drag back → baseline. [A,R]
- [ ] **AP-03** **autosave persistence:** add an animation, wait > debounce, `resetProject`
  WITHOUT restoring snapshot path / re-open → the animation persisted (mirror G-17 regression).
  [A]
- [ ] **AP-04** **WS push:** `apiCall("add_animation", …)` side-channel → the browser renders the
  strip/row with no UI interaction; `apiCall("remove_animation"|"undo")` → reverts. [X,R]
- [ ] **AP-05** tombstone round-trip: side-channel global add, UI remove(inherited)→tombstone,
  UI restore → baseline (state deep-equal at the carriers). [R]
- [ ] **AP-06** timing-mode change in UI → `mode`/anchor lands in `/api/state`; switch back →
  baseline. [A,R]
- [ ] **AP-07** **undo from another client:** UI edits, side-channel `undo` → full UI revert +
  `/api/state` at baseline. [X,R]
- [ ] **AP-08** old fade tool via `/api/call` (`make_fade_tag`) → HTTP 400 unknown (no state
  change) — the removal, end-to-end. [G]

---

## 9. Cluster AJ — jassub preview tier (NEW) → `web/e2e/jassub-preview.spec.ts` (headless chromium, reusing `spikes/jassub-bench` harness patterns)

**Why new:** this feature ships the in-browser wasm renderer (jassub) as the Exact-preview path.
Reuse the spike harness (`index.html`, `serve.py` COOP/COEP, `run-spikes.cjs` driving, eager font
preload, double-rAF readback). Keep it **small (~12 specs)**, deterministic, and pixel-tolerant.
Sampling: ink/alpha at known canvas coordinates at known `mediaTime`s.

### 9A — Setup gotchas encoded as assertions (from jassub FINDINGS)
- [ ] **AJ-01** `workerUrl` points at the **bundled module worker** (`jassub/dist/worker/
  worker.js`, esbuild `--bundle --format=esm`), NOT the emscripten glue; `instance.ready`
  resolves within a timeout (the wrong file hangs forever — assert it does NOT hang). [G]
- [ ] **AJ-02** fonts are **eagerly preloaded** (`fonts:[url]`): first render is **not**
  glyphless (sample ink > 0 on the first frame). [G]
- [ ] **AJ-03** pixel readback waits ~250ms + double-rAF after `manualRender` before sampling
  (assert a pre-wait sample reads zeros / a post-wait sample reads ink — the readback-lag
  contract). [G]

### 9B — edit→setTrack→pixels loop
- [ ] **AJ-04** an animation edit → pull regenerated `.ass` → `setTrack(ass)` → the rendered
  pixels change at the affected timestamp (sample before/after differ). [A]
- [ ] **AJ-05** `setTrack` swap completes within a generous budget (sanity, not a perf gate;
  spike measured 1.1–1.5ms — assert < a loose ceiling). [A]

### 9C — animations visibly animate at known timestamps
- [ ] **AJ-06** **Fade:** alpha at `cue_start` ≈ 0 ink, at `cue_start+duration` ≈ full ink;
  monotonic increase across two midpoints. [A]
- [ ] **AJ-07** **Sweep (`\kf`):** at t early in the sung interval the **left** portion of the
  word is primary-colored and the right is secondary; at t late the fill has advanced rightward
  (sample two x-bands, assert the boundary moves L→R). [A]
- [ ] **AJ-08** **Wipe (`\clip` rect):** the revealed region grows over the window (sample a
  region that is clipped early and inked late). [A]
- [ ] **AJ-09** **appearance-gate:** a cue with **no** alpha animation has full ink at
  `event_start` (zero-duration visibility, AE-CMP-06 rendered). [A]

### 9D — selection overlay geometry
- [ ] **AJ-10** the DOM selection-overlay box for a word lands within **≤5px / per-font scale**
  (≈0.866 for DejaVu) of the rendered ink bbox after one runtime calibration (spike #4 / Spike
  B); regular and bold both within tolerance. [A]
- [ ] **AJ-11** a click at a word's overlay center hit-tests to that cue (half-word tolerance
  absorbs drift). [A]

### 9E — multi-anim sanity
- [ ] **AJ-12** narrow-scope-last `\t` (cross-scope conflict) renders the **narrower** animation
  visibly winning continuously (no jump/compound) — the rendered counterpart of AE-RES-05 /
  AE-CMP-02. [A]

**What AJ explicitly does NOT cover (justified):**
- Performance/FPS gates (covered empirically by the spikes; e2e perf is flaky — AJ-05 is a loose
  sanity ceiling only).
- Pixel-perfect alignment (the architecture is tolerance-based by design, §1.5; ≤5px padded
  outlines, half-word hit-test).
- Every channel × every preset combinatorially (AE-CMP owns emission correctness; AJ samples a
  representative fade/sweep/wipe + the gate + the conflict crossover).
- Audio-synced playback (no audio in web; FEATURES §9).
- Cross-browser (chromium only, as the live renderer target).

**Worked example — AJ-07 (sweep visibly animates):**
> **Given** the harness loads a one-word `.ass` with a Sweep (`\kf`) over the word's sung interval
> (`spikes/jassub-bench/gen_ass.js` pattern), fonts preloaded, ready resolved.
> **When** `manualRender({mediaTime: sungStart+0.1})` then read; and again at
> `{mediaTime: sungEnd-0.1}` (each with the 250ms+double-rAF wait).
> **Then** at the early sample the primary-colored fill boundary x is near the word's left edge;
> at the late sample it is near the right edge (boundary x increased). Sample by classifying
> primary vs secondary color in vertical bands across the word bbox; assert `x_late > x_early`
> by a margin > tolerance.

---

## 10. Counts summary

### Per cluster
| Cluster | File(s) | Tests |
|---|---|---|
| AE — Engine | `test_anim_model/resolve/anchors/timing/compile/migration/undo.py` | **~66** |
| AD — Daemon/MCP | `test_anim_tools.py`, `test_anim_daemon.py` | **~24** |
| AI — Inspector | `AnimInspector.audit.test.tsx` | **20** |
| AT — Track/strips + lanes | `WordTrack.anim.audit.test.tsx`, `CueLanes.anim.audit.test.tsx` | **16** |
| AM — Mode picker | `TimingMode.audit.test.tsx` | **9** |
| AX — External sync | `ExternalSync.anim.audit.test.tsx`, e2e | **12** |
| AP — E2E | `animations.spec.ts` | **8** |
| AJ — jassub | `jassub-preview.spec.ts` | **12** |
| **Total** | | **~167** |

(AE sub-counts: MOD 8, RES 10, ANC 16, TM 11, CMP 9, MIG 8, UNDO 6 = 68; rounded summary ~66.)

### Per facet (primary facet per test; many carry multiple)
| Facet | Approx count | Where it dominates |
|---|---|---|
| **[A]ction** | ~95 | every cluster (the forward contract) |
| **[R]evert** | ~28 | AE-RES-10/UNDO-*, AI-08/12, AT-06/11, AM-07, AX-03/05/06/12, AP-01..07 |
| **[D]ouble** | ~8 | AE-MIG-08, AI-09, AT-05, AM-07, AE-UNDO-06 |
| **[G]ating** | ~24 | AE-MOD-*, AD-*-validation/old-tools, AI-04/20, AT-07/10/12, AM-04/09, AJ-01..03 |
| **[X]ternal-sync** | ~16 | AX-* (all), AD broadcast items, AP-04/07 |

---

## 11. Execution order (TDD honored)

1. **AE (engine), tests-first and failing**, in dependency order: model → resolve → anchors →
   timing → compile → migration → undo. (`engine-tests-first` memory: new engine code is
   TDD-first.)
2. **AD (daemon/MCP)** once the engine surface compiles — tools wrap engine mutations; old-tool
   removal can be asserted immediately.
3. **AI / AT / AM (jsdom UI)** against the dispatch contract + echoed state (no daemon needed).
4. **AX (external sync, jsdom)** — reuses the UI surfaces with pushed state.
5. **AP / AX-e2e (Playwright, real daemon)** last — integration over the now-green stack.
6. **AJ (jassub)** alongside AP (separate harness); gated by spike #2/#5 already passing.

Tk suites are **not** touched (out of scope). Per the `defer-ui-test-suites` memory, any
incidental Tk runs are batched at session end — but this feature adds none.

Every failure is adjudicated in `2026-06-05-adjudication-log.md` **before** changing code or test
(CODE-BUG / TEST-BUG / SPEC-GAP), citing the questions-doc / reconciliation / GLOSSARY / spike
FINDINGS as authority.

---

## 12. SPEC-GAP items — ALL RULED (product owner, 2026-06-07)

- **SPEC-GAP-1 — UI `mode` field vs settled anchor+stagger.** The designer's `Animation` carries
  a literal `mode`/`step` field (HANDOFF §4); the settled model has **no `mode` field** — modes
  are sugar over `anchor` + `stagger` (questions §1.2, GLOSSARY "Timing mode"). The picker tests
  (AM-*) assert "mode" semantics but the **stored shape** the dispatch writes
  (`{mode}` convenience field vs `{segments[].t0.anchor, stagger}`) is unresolved. Resolution
  used by this design: tests assert the **observable** timing behaviour (AE-TM-*) as ground truth
  and assert the UI dispatch by *named mode*. **RULED: literal `mode` field, stored** — the
  Animation record carries `mode` (+ `step`/`step_unit` for sequence modes) so it round-trips
  through save/load; the compiler expands mode → anchor+stagger at compile time; raw per-endpoint
  anchors remain the Advanced/custom representation (mode `"custom"`/absent ⇒ anchors are
  authoritative). AM-02/AD-SP-* assert `args.partial.mode` / `.step` / `.step_unit` literally,
  and AE adds a persistence test: save → load → `mode` survives verbatim.

- **SPEC-GAP-2 — Pop = one anim or two.** Pop maps to `scale_x + scale_y` (two channels). The
  model is "one animation = one channel" (questions §1.2). So Pop is **two** Animation records,
  or the preset is a UI grouping over two. AI-03/AI-19 assert "the correct channel(s)" abstractly;
  the count (1 vs 2 records, and whether `remove` removes both) needs the engine spec. Same for
  Blur-in "glow" (blur + outline alpha, reconciliation §3). **RULED: as recommended — two
  records sharing a `group_id`; `remove`/`restore`/`suppress` act on the whole group.**

- **SPEC-GAP-3 — segment ordering: reject vs normalize.** AE-MOD-03 asserts out-of-order
  segments are rejected; the spec says segments are "ordered" but does not state whether the
  mutation layer **rejects** or **sorts**. Flagged; default assumption = reject (predictability),
  **RULED: reject (as recommended).**

- **SPEC-GAP-4 — stagger on a single-member scope.** AE-MOD-07: is a `stagger` on a cue-of-one /
  global-with-one-member an error or inert? Spec is silent. **RULED: inert (as recommended).**

- **SPEC-GAP-5 — remove/restore idempotency error codes.** AD-RM-03 / AD-RS-02: removing an
  already-tombstoned id or restoring a non-tombstoned id — error vs no-op is unspecified.
  **RULED: idempotent no-op (as recommended)** — returns current state, consistent with the
  existing toggle-style tools.

---

## 13. Doc contradictions resolved during design

1. **Timing storage: `mode`/`step`/`{s,e}` (HANDOFF_animations §4) vs anchor+offset+stagger
   (questions §1.2).** The reconciliation doc explicitly states the designer's data model
   **predates** the settled schema and is superseded (reconciliation §1). **Resolution:** all
   engine/data assertions use the **settled** schema (`AnimTime{anchor,offset,unit}`, `stagger`);
   the designer's `{s,e}`/`type` shapes are treated as UI-render inputs only (strips read the
   **resolved** flat times). Logged as SPEC-GAP-1 where the UI dispatch's serialized field is
   still genuinely open.

2. **Carrier paths: `globalStyle.animations` / `tok.style.animations` / `anim_removed`
   (HANDOFF_animations §4) vs `globals.animations` / `layout[gi].animations` /
   `layout[gi].suppress` / `anim_tags` (questions §1.2, reconciliation §2).** **Resolution:** the
   reconciliation/questions carriers win; fixtures and assertions write `globals.animations`,
   `layout[gi].animations`, `layout[gi].suppress`, `anim_tags[]`. The designer's `anim_removed`
   field name is mapped to `suppress` (reconciliation §6 confirms the stored field is
   `suppress: string[]`).

3. **`type:"type"` (typewriter) preset vs Wipe preset + Typewriter mode.** HANDOFF §4 lists a
   single `type` effect; §4.1 and the reconciliation split it into **Wipe** (per-cue clip
   *preset*) and **Typewriter** (cross-member *timing mode*). **Resolution:** tests treat them as
   orthogonal — AE-CMP-04 (Wipe = clip_rect on one cue) vs AE-TM-08 (Typewriter = chained member
   starts); AM-* asserts Typewriter as a mode, AI-* asserts Wipe as a preset.

4. **Preset list drift.** HANDOFF §7 suggests "Bounce / Cascade / Karaoke sweep"; reconciliation
   §5 parks Bounce (needs spring easing), confirms Cascade is a **mode** not a preset, and locks
   the canonical v1 preset set (Fade in, Fade out, Sweep, Pop, Color flash, Wipe in, Blur in,
   Slide). **Resolution:** AI-18 asserts exactly the reconciliation §5 set; Bounce/Cascade are
   not presets in the picker.

5. **Daemon port: FEATURES says daemon :8770 / web :5173; e2e helpers use :8799.** Not an
   animations contradiction but noted so AP-* use `helpers.ts` `DAEMON` (:8799, the e2e harness
   port), not the dev-run ports.
