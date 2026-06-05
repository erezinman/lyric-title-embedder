# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: inspector.spec.ts >> G-22 — bold toggle twice = state reverted (back to inherited)
- Location: e2e/inspector.spec.ts:68:1

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
      - generic [ref=e54]:
        - generic [ref=e55]:
          - generic [ref=e56]: Style waterfall — cue → group → global · most specific wins
          - generic [ref=e57] [cursor=pointer]:
            - generic [ref=e58]:
              - generic [ref=e59]: CUE
              - generic [ref=e60]: "\"alpha\""
            - generic [ref=e61]:
              - generic [ref=e62]:
                - generic [ref=e63]: Font
                - generic [ref=e65]:
                  - generic [ref=e66]: −
                  - generic [ref=e67]: DejaVu Sans
                  - generic [ref=e68]: +
                - generic "inherited from global" [ref=e69]: glob
              - generic [ref=e70]:
                - generic [ref=e71]: Size
                - generic [ref=e73]:
                  - generic [ref=e74]: −
                  - generic [ref=e75]: 64 px
                  - generic [ref=e76]: +
                - generic "inherited from global" [ref=e77]: glob
              - generic [ref=e78]:
                - generic [ref=e79]: Bold
                - button "Clear override (inherit)" [ref=e84]:
                  - img [ref=e85]
              - generic [ref=e89]:
                - generic [ref=e90]: Fill
                - generic "inherited from global" [ref=e100]: glob
              - generic [ref=e101]:
                - generic [ref=e102]: Outline
                - generic "inherited from global" [ref=e112]: glob
              - generic [ref=e113]:
                - generic [ref=e114]: Box color
                - generic "inherited from global" [ref=e124]: glob
              - generic [ref=e125]:
                - generic [ref=e126]: Box alpha
                - generic [ref=e128]:
                  - generic [ref=e129]: −
                  - generic [ref=e130]: "0x80"
                  - generic [ref=e131]: +
                - generic "inherited from global" [ref=e132]: glob
              - generic [ref=e133]:
                - generic [ref=e134]: Outline w
                - generic [ref=e136]:
                  - generic [ref=e137]: −
                  - generic [ref=e138]: 3 px
                  - generic [ref=e139]: +
                - generic "inherited from global" [ref=e140]: glob
              - generic [ref=e141]:
                - generic [ref=e142]: Shadow
                - generic [ref=e144]:
                  - generic [ref=e145]: −
                  - generic [ref=e146]: 0 px
                  - generic [ref=e147]: +
                - generic "inherited from global" [ref=e148]: glob
          - generic [ref=e149] [cursor=pointer]:
            - generic [ref=e150]:
              - generic [ref=e151]: GROUP
              - generic [ref=e152]: Verse 1
            - generic [ref=e153]:
              - generic [ref=e154]:
                - generic [ref=e155]: Font
                - generic [ref=e157]:
                  - generic [ref=e158]: −
                  - generic [ref=e159]: DejaVu Sans
                  - generic [ref=e160]: +
                - generic "inherited from global" [ref=e161]: glob
              - generic [ref=e162]:
                - generic [ref=e163]: Size
                - generic [ref=e165]:
                  - generic [ref=e166]: −
                  - generic [ref=e167]: 64 px
                  - generic [ref=e168]: +
                - generic "inherited from global" [ref=e169]: glob
              - generic [ref=e170]:
                - generic [ref=e171]: Bold
                - generic "inherited from global" [ref=e176]: glob
              - generic [ref=e177]:
                - generic [ref=e178]: Fill
                - generic "inherited from global" [ref=e188]: glob
              - generic [ref=e189]:
                - generic [ref=e190]: Outline
                - generic "inherited from global" [ref=e200]: glob
              - generic [ref=e201]:
                - generic [ref=e202]: Box color
                - generic "inherited from global" [ref=e212]: glob
              - generic [ref=e213]:
                - generic [ref=e214]: Box alpha
                - generic [ref=e216]:
                  - generic [ref=e217]: −
                  - generic [ref=e218]: "0x80"
                  - generic [ref=e219]: +
                - generic "inherited from global" [ref=e220]: glob
              - generic [ref=e221]:
                - generic [ref=e222]: Outline w
                - generic [ref=e224]:
                  - generic [ref=e225]: −
                  - generic [ref=e226]: 3 px
                  - generic [ref=e227]: +
                - generic "inherited from global" [ref=e228]: glob
              - generic [ref=e229]:
                - generic [ref=e230]: Shadow
                - generic [ref=e232]:
                  - generic [ref=e233]: −
                  - generic [ref=e234]: 0 px
                  - generic [ref=e235]: +
                - generic "inherited from global" [ref=e236]: glob
              - generic [ref=e237]:
                - generic [ref=e238]: Border mode
                - generic [ref=e240]:
                  - button "Outline" [ref=e241]
                  - button "Box" [ref=e242]
                - generic "inherited from global" [ref=e243]: glob
              - generic [ref=e244]:
                - generic [ref=e245]: Alignment
                - button "Alignment" [ref=e248]: Bottom-Center (2)
                - generic "inherited from global" [ref=e249]: glob
              - generic [ref=e250]:
                - generic [ref=e251]: Group fade-in
                - generic [ref=e253]:
                  - generic [ref=e254]: −
                  - generic [ref=e255]: 250 ms
                  - generic [ref=e256]: +
                - generic "inherited from global" [ref=e257]: glob
              - generic [ref=e258]:
                - generic [ref=e259]: Group fade-out
                - generic [ref=e261]:
                  - generic [ref=e262]: −
                  - generic [ref=e263]: 1000 ms
                  - generic [ref=e264]: +
                - generic "inherited from global" [ref=e265]: glob
          - generic [ref=e266] [cursor=pointer]:
            - generic [ref=e267]:
              - generic [ref=e268]: GLOBAL
              - generic [ref=e269]: defaults
            - generic [ref=e270]:
              - generic [ref=e271]:
                - generic [ref=e272]: Font
                - generic [ref=e274]:
                  - generic [ref=e275]: −
                  - generic [ref=e276]: DejaVu Sans
                  - generic [ref=e277]: +
                - generic [ref=e278]: base
              - generic [ref=e279]:
                - generic [ref=e280]: Size
                - generic [ref=e282]:
                  - generic [ref=e283]: −
                  - generic [ref=e284]: 64 px
                  - generic [ref=e285]: +
                - generic [ref=e286]: base
              - generic [ref=e287]:
                - generic [ref=e288]: Bold
                - generic [ref=e293]: base
              - generic [ref=e294]:
                - generic [ref=e295]: Fill
                - generic [ref=e305]: base
              - generic [ref=e306]:
                - generic [ref=e307]: Outline
                - generic [ref=e317]: base
              - generic [ref=e318]:
                - generic [ref=e319]: Box color
                - generic [ref=e329]: base
              - generic [ref=e330]:
                - generic [ref=e331]: Box alpha
                - generic [ref=e333]:
                  - generic [ref=e334]: −
                  - generic [ref=e335]: "0x80"
                  - generic [ref=e336]: +
                - generic [ref=e337]: base
              - generic [ref=e338]:
                - generic [ref=e339]: Outline w
                - generic [ref=e341]:
                  - generic [ref=e342]: −
                  - generic [ref=e343]: 3 px
                  - generic [ref=e344]: +
                - generic [ref=e345]: base
              - generic [ref=e346]:
                - generic [ref=e347]: Shadow
                - generic [ref=e349]:
                  - generic [ref=e350]: −
                  - generic [ref=e351]: 0 px
                  - generic [ref=e352]: +
                - generic [ref=e353]: base
              - generic [ref=e354]:
                - generic [ref=e355]: Border mode
                - generic [ref=e357]:
                  - button "Outline" [ref=e358]
                  - button "Box" [ref=e359]
                - generic [ref=e360]: base
              - generic [ref=e361]:
                - generic [ref=e362]: Alignment
                - button "Alignment" [ref=e365]: Bottom-Center (2)
                - generic [ref=e366]: base
          - generic [ref=e367]:
            - img [ref=e368]
            - text: Box mode is a
            - generic [ref=e373]: group
            - text: decision (separate ASS Style). Cue tier omits it.
        - generic [ref=e374]:
          - generic [ref=e375]:
            - img [ref=e376]
            - text: Fade defaults
            - generic [ref=e380]: project-wide · global
          - generic [ref=e381]:
            - generic [ref=e382]: Fade-in
            - generic [ref=e383]:
              - generic [ref=e384] [cursor=pointer]: −
              - generic [ref=e385]: 250ms
              - generic [ref=e386] [cursor=pointer]: +
          - generic [ref=e387]:
            - generic [ref=e388]: Fade-out
            - generic [ref=e389]:
              - generic [ref=e390] [cursor=pointer]: −
              - generic [ref=e391]: 1000ms
              - generic [ref=e392] [cursor=pointer]: +
          - generic [ref=e393]:
            - generic [ref=e394]: Linger
            - generic [ref=e395]:
              - generic [ref=e396] [cursor=pointer]: −
              - generic [ref=e397]: 0s
              - generic [ref=e398] [cursor=pointer]: +
          - paragraph [ref=e399]: Per-group fade rows inherit these unless overridden (the “global” source tag).
        - generic [ref=e400]:
          - generic [ref=e401]:
            - img [ref=e402]
            - text: Timing
            - button "locked" [ref=e406] [cursor=pointer]:
              - img [ref=e407]
              - text: locked
          - generic [ref=e411]:
            - generic [ref=e412]: Start
            - textbox "Start" [disabled] [ref=e413]: "0.500"
            - generic [ref=e414]: s
          - generic [ref=e415]:
            - generic [ref=e416]: End
            - textbox "End" [disabled] [ref=e417]: "1.200"
            - generic [ref=e418]: s
          - generic [ref=e419]:
            - generic [ref=e420]: Text
            - textbox "text" [ref=e421]: alpha
    - separator "Resize side panel" [ref=e422]
    - main [ref=e423]:
      - generic [ref=e424]:
        - generic [ref=e425]:
          - button "Live" [ref=e426] [cursor=pointer]
          - button "Exact" [ref=e427] [cursor=pointer]
        - generic [ref=e428]:
          - generic [ref=e430]: 1920 × 1080 · 24fps
          - generic [ref=e431]: LIVE
          - generic [ref=e433]:
            - generic [ref=e434]:
              - generic [ref=e435] [cursor=pointer]: alpha
              - generic [ref=e436] [cursor=pointer]: bravo
              - generic [ref=e437] [cursor=pointer]: charlie
              - generic [ref=e438] [cursor=pointer]: delta
            - generic [ref=e439]:
              - generic [ref=e440] [cursor=pointer]: echo
              - generic [ref=e441] [cursor=pointer]: foxtrot
              - generic [ref=e442] [cursor=pointer]: golf
          - generic [ref=e443]: CSS approx
          - generic [ref=e444]:
            - generic: margins
        - generic [ref=e454]: Drag inside the box to move · drag a handle to adjust margins · Esc cancels.
  - separator "Resize timeline dock" [ref=e455]
  - generic [ref=e456]:
    - generic [ref=e457]:
      - button "Timeline" [ref=e458] [cursor=pointer]:
        - img [ref=e459]
        - text: Timeline
      - button "Cue lanes" [ref=e462] [cursor=pointer]:
        - img [ref=e463]
        - text: Cue lanes
    - generic [ref=e469]:
      - button "Group fade-in" [ref=e470] [cursor=pointer]:
        - img [ref=e471]
        - text: Group fade-in
      - button "Group fade-out" [ref=e475] [cursor=pointer]:
        - img [ref=e476]
        - text: Group fade-out
      - button "Merge words" [disabled] [ref=e481]:
        - img [ref=e482]
        - text: Merge words
      - button "Break line" [ref=e487] [cursor=pointer]:
        - img [ref=e488]
        - text: Break line
      - button "Merge events" [disabled] [ref=e495]:
        - img [ref=e496]
        - text: Merge events
      - button "Split event" [disabled] [ref=e501]:
        - img [ref=e502]
        - text: Split event
      - button "Ungroup event" [disabled] [ref=e509]:
        - img [ref=e510]
        - text: Ungroup event
      - button "Delete" [ref=e517] [cursor=pointer]:
        - img [ref=e518]
        - text: Delete
      - button "Undo" [ref=e523] [cursor=pointer]:
        - img [ref=e524]
        - text: Undo
      - button "Redo" [ref=e528] [cursor=pointer]:
        - img [ref=e529]
        - text: Redo
      - generic [ref=e533]: 1 selected
    - generic [ref=e535]:
      - generic [ref=e536]:
        - generic [ref=e537]:
          - img [ref=e538]
          - text: LAYOUT · cues
        - generic [ref=e543]:
          - img [ref=e544]
          - text: FADE-IN
        - generic [ref=e548]:
          - img [ref=e549]
          - text: FADE-OUT
      - generic [ref=e553] [cursor=pointer]:
        - img [ref=e555]
        - text: Verse 1
        - generic [ref=e557]: words
        - generic [ref=e558]: 0.50–7.20
      - generic [ref=e559] [cursor=pointer]:
        - generic [ref=e560]: alpha
        - generic [ref=e561]: auto / 250
        - generic [ref=e562]: · none
      - generic [ref=e563] [cursor=pointer]:
        - generic [ref=e564]: bravo
        - generic [ref=e565]: auto / 250
        - generic [ref=e566]: · none
      - generic [ref=e567] [cursor=pointer]:
        - generic [ref=e568]: charlie
        - generic [ref=e569]: auto / 250
        - generic [ref=e570]: · none
      - generic [ref=e571] [cursor=pointer]:
        - generic [ref=e572]: delta
        - generic [ref=e573]: auto / 250
        - generic [ref=e574]: · none
      - generic [ref=e575]: line break · \N
      - generic [ref=e576] [cursor=pointer]:
        - generic [ref=e577]: echo
        - generic [ref=e578]: auto / 250
        - generic [ref=e579]: · none
      - generic [ref=e580] [cursor=pointer]:
        - generic [ref=e581]: foxtrot
        - generic [ref=e582]: auto / 250
        - generic [ref=e583]: · none
      - generic [ref=e584] [cursor=pointer]:
        - generic [ref=e585]: golf
        - generic [ref=e586]: auto / 250
        - generic [ref=e587]: · none
      - generic [ref=e588] [cursor=pointer]:
        - img [ref=e590]
        - text: Chorus
        - generic [ref=e592]: words
        - generic [ref=e593]: 7.50–9.20
      - generic [ref=e594] [cursor=pointer]:
        - generic [ref=e595]: hotel
        - generic [ref=e596]: auto / 250
        - generic [ref=e597]: · none
      - generic [ref=e598] [cursor=pointer]:
        - generic [ref=e599]: india
        - generic [ref=e600]: auto / 250
        - generic [ref=e601]: · none
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