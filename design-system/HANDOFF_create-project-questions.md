# Designer questions — New-project create/import modal, v3 web UI

**Status:** parked for later. The engineer shipped an on-brand modal built from existing v3 atoms;
these are the open *design* questions we'd raise with the designer **only if the result looks off**.
Each item states the current engineer decision so you can react to a concrete proposal.

**Feature recap:** the library's "New project" opens a modal: name, **source** segmented toggle
(Suno JSON / SRT), per-file **Upload ⇄ Server path** switch (Server path only shown when the
daemon detects a same-host browser), optional video, a collapsible **Advanced** section that swaps
with the source (Suno → group-by + skip-dashes; SRT → line-break strategy + N), inline error
banner, Create disabled until name + lyrics present. Spec:
`docs/superpowers/specs/2026-06-04-project-create-import-design.md`.

---

## 1. Modal layout & density
**Engineer decision:** a single-screen vertical form (~460px wide): name → source → lyrics →
video → Advanced (collapsed `<details>`) → footer buttons.
- a. Single screen vs a 2-step wizard (source+files → options)?
- b. Should the Advanced section be a `<details>` disclosure (current) or always-visible when SRT
  is chosen (the line-break choice meaningfully shapes the import)?

## 2. Upload ⇄ Server-path switch
**Engineer decision:** a small `seg2` segmented control above each file field; "Server path"
renders only when same-host.
- a. Is a per-file segmented switch right, or one global "I'm on the same machine" toggle?
- b. The plain `<input type="file">` is unstyled — want a branded drop-zone (drag-and-drop) instead?

## 3. SRT line-break options
**Engineer decision:** select with: No breaks (default) / Every N words (+ numeric field) /
On punctuation / One line per cue. Default = no breaks ("add a few newlines" beats "delete many").
- a. Naming and ordering of the options OK?
- b. Should a tiny preview show how the first cues would split for the chosen strategy?

## 4. Error & busy states
**Engineer decision:** inline red banner (`role=alert`) with the daemon's message; buttons disabled
while creating; modal stays open on failure.
- a. Banner placement (above footer) OK, or per-field errors?
- b. Any progress affordance for large video uploads (currently none — the request just runs)?

## 5. Video field
**Engineer decision:** one optional field labeled "Video (optional)"; uploaded video is copied into
the project, a server path is referenced in place. No explanation of that difference in the UI.
- a. Should the copy-vs-reference behavior be surfaced (a one-line hint under the field)?

---

### How to use this
If the shipped modal looks good, this doc stays parked. If anything reads off, send the relevant
questions with screenshots to the designer — same round-trip as the original v3 kit.
