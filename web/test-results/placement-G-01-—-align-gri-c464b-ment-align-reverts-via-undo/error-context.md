# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: placement.spec.ts >> G-01 — align grid: pick Top-Center updates placement.align + reverts via undo
- Location: e2e/placement.spec.ts:32:1

# Error details

```
Error: condition not met; last=false
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic "Back to projects" [ref=e5] [cursor=pointer]:
      - generic [ref=e6]: Karaoke Subtitle Studio
      - generic [ref=e7]: v3
    - generic [ref=e8]:
      - img [ref=e9]
      - generic [ref=e11]: audit
    - generic [ref=e12]:
      - button [ref=e13] [cursor=pointer]:
        - img [ref=e14]
      - button [ref=e17] [cursor=pointer]:
        - img [ref=e18]
      - button [ref=e20] [cursor=pointer]:
        - img [ref=e21]
      - generic [ref=e24]:
        - text: 0:00.00
        - generic [ref=e25]: / 0:10.70
    - button "Undo" [ref=e26] [cursor=pointer]:
      - img [ref=e27]
    - button "Redo" [ref=e31] [cursor=pointer]:
      - img [ref=e32]
    - button "Export" [ref=e36] [cursor=pointer]:
      - img [ref=e37]
      - text: Export
  - generic [ref=e41]: AI agent · live
  - generic [ref=e42]:
    - complementary [ref=e43]:
      - generic [ref=e44]:
        - button "Project" [ref=e45] [cursor=pointer]:
          - img [ref=e46]
          - text: Project
        - button "Inspector" [ref=e48] [cursor=pointer]:
          - img [ref=e49]
          - text: Inspector
      - generic [ref=e55]:
        - generic [ref=e56]:
          - img [ref=e57]
          - text: Source & output
        - generic [ref=e60]:
          - generic [ref=e61]: Lyrics
          - generic [ref=e63]: audit/lyrics.json
        - generic [ref=e64]:
          - generic [ref=e65]: Video
          - generic [ref=e67]: —
        - generic [ref=e68]:
          - img [ref=e69]
          - text: Placement (global)
        - generic [ref=e71]:
          - generic [ref=e72]: Canvas
          - generic [ref=e73]: 1920×1080
        - generic [ref=e74]:
          - generic [ref=e75]: Alignment
          - button "Alignment" [ref=e77] [cursor=pointer]: Top-Center (8)
        - generic [ref=e78]:
          - generic [ref=e79]: Free placement (\pos)
          - switch "Free placement" [ref=e80]
        - paragraph [ref=e82]:
          - img [ref=e83]
          - text: Margins come from dragging the preview box edges.
        - generic [ref=e85]:
          - img [ref=e86]
          - text: Animation preset
          - generic [ref=e90]: Coming soon
        - generic [ref=e91]:
          - generic [ref=e92]: Karaoke Bounce
          - generic [ref=e93]: Pop
          - generic [ref=e94]: Glow
          - generic [ref=e95]: Typewriter
        - paragraph [ref=e96]: Per-word entrance animations aren't in the render engine yet — disabled until then.
    - separator "Resize side panel" [ref=e97]
    - main [ref=e98]:
      - generic [ref=e99]:
        - generic [ref=e100]:
          - button "Live" [ref=e101] [cursor=pointer]
          - button "Exact" [ref=e102] [cursor=pointer]
        - generic [ref=e103]:
          - generic [ref=e105]: 1920 × 1080 · 24fps
          - generic [ref=e106]: LIVE
          - generic [ref=e108]:
            - generic [ref=e109]:
              - generic [ref=e110] [cursor=pointer]: alpha
              - generic [ref=e111] [cursor=pointer]: bravo
              - generic [ref=e112] [cursor=pointer]: charlie
              - generic [ref=e113] [cursor=pointer]: delta
            - generic [ref=e114]:
              - generic [ref=e115] [cursor=pointer]: echo
              - generic [ref=e116] [cursor=pointer]: foxtrot
              - generic [ref=e117] [cursor=pointer]: golf
          - generic [ref=e118]: CSS approx
          - generic [ref=e119]:
            - generic: margins
        - generic [ref=e129]: Drag inside the box to move · drag a handle to adjust margins · Esc cancels.
  - separator "Resize timeline dock" [ref=e130]
  - generic [ref=e131]:
    - generic [ref=e132]:
      - button "Timeline" [ref=e133] [cursor=pointer]:
        - img [ref=e134]
        - text: Timeline
      - button "Cue lanes" [ref=e137] [cursor=pointer]:
        - img [ref=e138]
        - text: Cue lanes
    - generic [ref=e144]:
      - button "Group fade-in" [disabled] [ref=e145]:
        - img [ref=e146]
        - text: Group fade-in
      - button "Group fade-out" [disabled] [ref=e150]:
        - img [ref=e151]
        - text: Group fade-out
      - button "Merge words" [disabled] [ref=e156]:
        - img [ref=e157]
        - text: Merge words
      - button "Break line" [disabled] [ref=e162]:
        - img [ref=e163]
        - text: Break line
      - button "Merge events" [ref=e170] [cursor=pointer]:
        - img [ref=e171]
        - text: Merge events
      - button "Split event" [ref=e176] [cursor=pointer]:
        - img [ref=e177]
        - text: Split event
      - button "Ungroup event" [ref=e184] [cursor=pointer]:
        - img [ref=e185]
        - text: Ungroup event
      - button "Delete" [disabled] [ref=e192]:
        - img [ref=e193]
        - text: Delete
      - button "Undo" [ref=e198] [cursor=pointer]:
        - img [ref=e199]
        - text: Undo
      - button "Redo" [ref=e203] [cursor=pointer]:
        - img [ref=e204]
        - text: Redo
      - generic [ref=e208]: shift-click words to multi-select
    - generic [ref=e210]:
      - generic [ref=e211]:
        - generic [ref=e212]:
          - img [ref=e213]
          - text: LAYOUT · cues
        - generic [ref=e218]:
          - img [ref=e219]
          - text: FADE-IN
        - generic [ref=e223]:
          - img [ref=e224]
          - text: FADE-OUT
      - generic [ref=e228] [cursor=pointer]:
        - img [ref=e230]
        - text: Verse 1
        - generic [ref=e232]: words
        - generic [ref=e233]: 0.50–7.20
      - generic [ref=e234] [cursor=pointer]:
        - generic [ref=e235]: alpha
        - generic [ref=e236]: auto / 250
        - generic [ref=e237]: · none
      - generic [ref=e238] [cursor=pointer]:
        - generic [ref=e239]: bravo
        - generic [ref=e240]: auto / 250
        - generic [ref=e241]: · none
      - generic [ref=e242] [cursor=pointer]:
        - generic [ref=e243]: charlie
        - generic [ref=e244]: auto / 250
        - generic [ref=e245]: · none
      - generic [ref=e246] [cursor=pointer]:
        - generic [ref=e247]: delta
        - generic [ref=e248]: auto / 250
        - generic [ref=e249]: · none
      - generic [ref=e250]: line break · \N
      - generic [ref=e251] [cursor=pointer]:
        - generic [ref=e252]: echo
        - generic [ref=e253]: auto / 250
        - generic [ref=e254]: · none
      - generic [ref=e255] [cursor=pointer]:
        - generic [ref=e256]: foxtrot
        - generic [ref=e257]: auto / 250
        - generic [ref=e258]: · none
      - generic [ref=e259] [cursor=pointer]:
        - generic [ref=e260]: golf
        - generic [ref=e261]: auto / 250
        - generic [ref=e262]: · none
      - generic [ref=e263] [cursor=pointer]:
        - img [ref=e265]
        - text: Chorus
        - generic [ref=e267]: words
        - generic [ref=e268]: 7.50–9.20
      - generic [ref=e269] [cursor=pointer]:
        - generic [ref=e270]: hotel
        - generic [ref=e271]: auto / 250
        - generic [ref=e272]: · none
      - generic [ref=e273] [cursor=pointer]:
        - generic [ref=e274]: india
        - generic [ref=e275]: auto / 250
        - generic [ref=e276]: · none
```

# Test source

```ts
  1  | // e2e/helpers.ts — shared helpers for the audit e2e tier.
  2  | import type { Page } from "@playwright/test";
  3  | 
  4  | export const DAEMON = "http://127.0.0.1:8799";
  5  | 
  6  | /** The daemon's authoritative project state (the "internal data state"). */
  7  | export async function apiState(): Promise<Record<string, any>> {
  8  |   const r = await fetch(`${DAEMON}/api/state`);
  9  |   if (!r.ok) throw new Error(`/api/state ${r.status}`);
  10 |   return r.json();
  11 | }
  12 | 
  13 | /** Side-channel tool call — impersonates the MCP agent (never via the UI). */
  14 | export async function apiCall(tool: string, args: Record<string, unknown> = {}): Promise<unknown> {
  15 |   const r = await fetch(`${DAEMON}/api/call`, {
  16 |     method: "POST",
  17 |     headers: { "Content-Type": "application/json" },
  18 |     body: JSON.stringify({ tool, args }),
  19 |   });
  20 |   const data = await r.json();
  21 |   if (!r.ok || data.error) throw new Error(`tool ${tool}: ${data.error ?? r.status}`);
  22 |   return data.result;
  23 | }
  24 | 
  25 | /** Reset the in-memory project by re-opening it from disk (discards edits). */
  26 | export async function resetProject(name = "audit"): Promise<void> {
  27 |   const r = await fetch(`${DAEMON}/api/projects/open`, {
  28 |     method: "POST",
  29 |     headers: { "Content-Type": "application/json" },
  30 |     body: JSON.stringify({ name }),
  31 |   });
  32 |   if (!r.ok) throw new Error(`reset failed: ${r.status}`);
  33 | }
  34 | 
  35 | /** Open the seeded project in the browser and wait for the editor. */
  36 | export async function openAudit(page: Page, name = "audit"): Promise<void> {
  37 |   await page.goto("/");
  38 |   await page.locator(".proj", { hasText: name }).click();
  39 |   await page.locator(".lane-row").first().waitFor();   // editor + lanes rendered
  40 | }
  41 | 
  42 | /** Poll until fn() is truthy (deterministic wait on server state propagation). */
  43 | export async function until<T>(fn: () => Promise<T>, tries = 40, ms = 100): Promise<T> {
  44 |   let last: T | undefined;
  45 |   for (let i = 0; i < tries; i++) {
  46 |     last = await fn();
  47 |     if (last) return last;
  48 |     await new Promise((r) => setTimeout(r, ms));
  49 |   }
> 50 |   throw new Error(`condition not met; last=${JSON.stringify(last)}`);
     |         ^ Error: condition not met; last=false
  51 | }
  52 | 
```