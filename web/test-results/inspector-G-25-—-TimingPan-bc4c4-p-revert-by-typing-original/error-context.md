# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: inspector.spec.ts >> G-25 — TimingPanel numeric commit + arrow-step + revert by typing original
- Location: e2e/inspector.spec.ts:127:1

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
                - generic "inherited from global" [ref=e84]: glob
              - generic [ref=e85]:
                - generic [ref=e86]: Fill
                - generic "inherited from global" [ref=e96]: glob
              - generic [ref=e97]:
                - generic [ref=e98]: Outline
                - generic "inherited from global" [ref=e108]: glob
              - generic [ref=e109]:
                - generic [ref=e110]: Box color
                - generic "inherited from global" [ref=e120]: glob
              - generic [ref=e121]:
                - generic [ref=e122]: Box alpha
                - generic [ref=e124]:
                  - generic [ref=e125]: −
                  - generic [ref=e126]: "0x80"
                  - generic [ref=e127]: +
                - generic "inherited from global" [ref=e128]: glob
              - generic [ref=e129]:
                - generic [ref=e130]: Outline w
                - generic [ref=e132]:
                  - generic [ref=e133]: −
                  - generic [ref=e134]: 3 px
                  - generic [ref=e135]: +
                - generic "inherited from global" [ref=e136]: glob
              - generic [ref=e137]:
                - generic [ref=e138]: Shadow
                - generic [ref=e140]:
                  - generic [ref=e141]: −
                  - generic [ref=e142]: 0 px
                  - generic [ref=e143]: +
                - generic "inherited from global" [ref=e144]: glob
          - generic [ref=e145] [cursor=pointer]:
            - generic [ref=e146]:
              - generic [ref=e147]: GROUP
              - generic [ref=e148]: Verse 1
            - generic [ref=e149]:
              - generic [ref=e150]:
                - generic [ref=e151]: Font
                - generic [ref=e153]:
                  - generic [ref=e154]: −
                  - generic [ref=e155]: DejaVu Sans
                  - generic [ref=e156]: +
                - generic "inherited from global" [ref=e157]: glob
              - generic [ref=e158]:
                - generic [ref=e159]: Size
                - generic [ref=e161]:
                  - generic [ref=e162]: −
                  - generic [ref=e163]: 64 px
                  - generic [ref=e164]: +
                - generic "inherited from global" [ref=e165]: glob
              - generic [ref=e166]:
                - generic [ref=e167]: Bold
                - generic "inherited from global" [ref=e172]: glob
              - generic [ref=e173]:
                - generic [ref=e174]: Fill
                - generic "inherited from global" [ref=e184]: glob
              - generic [ref=e185]:
                - generic [ref=e186]: Outline
                - generic "inherited from global" [ref=e196]: glob
              - generic [ref=e197]:
                - generic [ref=e198]: Box color
                - generic "inherited from global" [ref=e208]: glob
              - generic [ref=e209]:
                - generic [ref=e210]: Box alpha
                - generic [ref=e212]:
                  - generic [ref=e213]: −
                  - generic [ref=e214]: "0x80"
                  - generic [ref=e215]: +
                - generic "inherited from global" [ref=e216]: glob
              - generic [ref=e217]:
                - generic [ref=e218]: Outline w
                - generic [ref=e220]:
                  - generic [ref=e221]: −
                  - generic [ref=e222]: 3 px
                  - generic [ref=e223]: +
                - generic "inherited from global" [ref=e224]: glob
              - generic [ref=e225]:
                - generic [ref=e226]: Shadow
                - generic [ref=e228]:
                  - generic [ref=e229]: −
                  - generic [ref=e230]: 0 px
                  - generic [ref=e231]: +
                - generic "inherited from global" [ref=e232]: glob
              - generic [ref=e233]:
                - generic [ref=e234]: Border mode
                - generic [ref=e236]:
                  - button "Outline" [ref=e237]
                  - button "Box" [ref=e238]
                - generic "inherited from global" [ref=e239]: glob
              - generic [ref=e240]:
                - generic [ref=e241]: Alignment
                - button "Alignment" [ref=e244]: Bottom-Center (2)
                - generic "inherited from global" [ref=e245]: glob
              - generic [ref=e246]:
                - generic [ref=e247]: Group fade-in
                - generic [ref=e249]:
                  - generic [ref=e250]: −
                  - generic [ref=e251]: 250 ms
                  - generic [ref=e252]: +
                - generic "inherited from global" [ref=e253]: glob
              - generic [ref=e254]:
                - generic [ref=e255]: Group fade-out
                - generic [ref=e257]:
                  - generic [ref=e258]: −
                  - generic [ref=e259]: 1000 ms
                  - generic [ref=e260]: +
                - generic "inherited from global" [ref=e261]: glob
          - generic [ref=e262] [cursor=pointer]:
            - generic [ref=e263]:
              - generic [ref=e264]: GLOBAL
              - generic [ref=e265]: defaults
            - generic [ref=e266]:
              - generic [ref=e267]:
                - generic [ref=e268]: Font
                - generic [ref=e270]:
                  - generic [ref=e271]: −
                  - generic [ref=e272]: DejaVu Sans
                  - generic [ref=e273]: +
                - generic [ref=e274]: base
              - generic [ref=e275]:
                - generic [ref=e276]: Size
                - generic [ref=e278]:
                  - generic [ref=e279]: −
                  - generic [ref=e280]: 64 px
                  - generic [ref=e281]: +
                - generic [ref=e282]: base
              - generic [ref=e283]:
                - generic [ref=e284]: Bold
                - generic [ref=e289]: base
              - generic [ref=e290]:
                - generic [ref=e291]: Fill
                - generic [ref=e301]: base
              - generic [ref=e302]:
                - generic [ref=e303]: Outline
                - generic [ref=e313]: base
              - generic [ref=e314]:
                - generic [ref=e315]: Box color
                - generic [ref=e325]: base
              - generic [ref=e326]:
                - generic [ref=e327]: Box alpha
                - generic [ref=e329]:
                  - generic [ref=e330]: −
                  - generic [ref=e331]: "0x80"
                  - generic [ref=e332]: +
                - generic [ref=e333]: base
              - generic [ref=e334]:
                - generic [ref=e335]: Outline w
                - generic [ref=e337]:
                  - generic [ref=e338]: −
                  - generic [ref=e339]: 3 px
                  - generic [ref=e340]: +
                - generic [ref=e341]: base
              - generic [ref=e342]:
                - generic [ref=e343]: Shadow
                - generic [ref=e345]:
                  - generic [ref=e346]: −
                  - generic [ref=e347]: 0 px
                  - generic [ref=e348]: +
                - generic [ref=e349]: base
              - generic [ref=e350]:
                - generic [ref=e351]: Border mode
                - generic [ref=e353]:
                  - button "Outline" [ref=e354]
                  - button "Box" [ref=e355]
                - generic [ref=e356]: base
              - generic [ref=e357]:
                - generic [ref=e358]: Alignment
                - button "Alignment" [ref=e361]: Bottom-Center (2)
                - generic [ref=e362]: base
          - generic [ref=e363]:
            - img [ref=e364]
            - text: Box mode is a
            - generic [ref=e369]: group
            - text: decision (separate ASS Style). Cue tier omits it.
        - generic [ref=e370]:
          - generic [ref=e371]:
            - img [ref=e372]
            - text: Fade defaults
            - generic [ref=e376]: project-wide · global
          - generic [ref=e377]:
            - generic [ref=e378]: Fade-in
            - generic [ref=e379]:
              - generic [ref=e380] [cursor=pointer]: −
              - generic [ref=e381]: 250ms
              - generic [ref=e382] [cursor=pointer]: +
          - generic [ref=e383]:
            - generic [ref=e384]: Fade-out
            - generic [ref=e385]:
              - generic [ref=e386] [cursor=pointer]: −
              - generic [ref=e387]: 1000ms
              - generic [ref=e388] [cursor=pointer]: +
          - generic [ref=e389]:
            - generic [ref=e390]: Linger
            - generic [ref=e391]:
              - generic [ref=e392] [cursor=pointer]: −
              - generic [ref=e393]: 0s
              - generic [ref=e394] [cursor=pointer]: +
          - paragraph [ref=e395]: Per-group fade rows inherit these unless overridden (the “global” source tag).
        - generic [ref=e396]:
          - generic [ref=e397]:
            - img [ref=e398]
            - text: Timing
            - button "Lock timings" [ref=e402] [cursor=pointer]:
              - img [ref=e403]
              - text: unlocked
          - generic [ref=e407]:
            - generic [ref=e408]: Start
            - textbox "Start" [active] [ref=e409]: "0.850"
            - generic [ref=e410]: s
          - generic [ref=e411]:
            - generic [ref=e412]: End
            - textbox "End" [ref=e413]: "1.200"
            - generic [ref=e414]: s
          - generic [ref=e415]:
            - generic [ref=e416]: Text
            - textbox "text" [ref=e417]: alpha
    - separator "Resize side panel" [ref=e418]
    - main [ref=e419]:
      - generic [ref=e420]:
        - generic [ref=e421]:
          - button "Live" [ref=e422] [cursor=pointer]
          - button "Exact" [ref=e423] [cursor=pointer]
        - generic [ref=e424]:
          - generic [ref=e426]: 1920 × 1080 · 24fps
          - generic [ref=e427]: LIVE
          - generic [ref=e429]:
            - generic [ref=e430]:
              - generic [ref=e431] [cursor=pointer]: alpha
              - generic [ref=e432] [cursor=pointer]: bravo
              - generic [ref=e433] [cursor=pointer]: charlie
              - generic [ref=e434] [cursor=pointer]: delta
            - generic [ref=e435]:
              - generic [ref=e436] [cursor=pointer]: echo
              - generic [ref=e437] [cursor=pointer]: foxtrot
              - generic [ref=e438] [cursor=pointer]: golf
          - generic [ref=e439]: CSS approx
          - generic [ref=e440]:
            - generic: margins
        - generic [ref=e450]: Drag inside the box to move · drag a handle to adjust margins · Esc cancels.
  - separator "Resize timeline dock" [ref=e451]
  - generic [ref=e452]:
    - generic [ref=e453]:
      - button "Timeline" [ref=e454] [cursor=pointer]:
        - img [ref=e455]
        - text: Timeline
      - button "Cue lanes" [ref=e458] [cursor=pointer]:
        - img [ref=e459]
        - text: Cue lanes
    - generic [ref=e465]:
      - button "Group fade-in" [ref=e466] [cursor=pointer]:
        - img [ref=e467]
        - text: Group fade-in
      - button "Group fade-out" [ref=e471] [cursor=pointer]:
        - img [ref=e472]
        - text: Group fade-out
      - button "Merge words" [disabled] [ref=e477]:
        - img [ref=e478]
        - text: Merge words
      - button "Break line" [ref=e483] [cursor=pointer]:
        - img [ref=e484]
        - text: Break line
      - button "Merge events" [disabled] [ref=e491]:
        - img [ref=e492]
        - text: Merge events
      - button "Split event" [disabled] [ref=e497]:
        - img [ref=e498]
        - text: Split event
      - button "Ungroup event" [disabled] [ref=e505]:
        - img [ref=e506]
        - text: Ungroup event
      - button "Delete" [ref=e513] [cursor=pointer]:
        - img [ref=e514]
        - text: Delete
      - button "Undo" [ref=e519] [cursor=pointer]:
        - img [ref=e520]
        - text: Undo
      - button "Redo" [ref=e524] [cursor=pointer]:
        - img [ref=e525]
        - text: Redo
      - generic [ref=e529]: 1 selected
    - generic [ref=e531]:
      - generic [ref=e532]:
        - generic [ref=e533]:
          - img [ref=e534]
          - text: LAYOUT · cues
        - generic [ref=e539]:
          - img [ref=e540]
          - text: FADE-IN
        - generic [ref=e544]:
          - img [ref=e545]
          - text: FADE-OUT
      - generic [ref=e549] [cursor=pointer]:
        - img [ref=e551]
        - text: Verse 1
        - generic [ref=e553]: words
        - generic [ref=e554]: 0.85–7.20
      - generic [ref=e555] [cursor=pointer]:
        - generic [ref=e556]: alpha
        - generic [ref=e557]: auto / 250
        - generic [ref=e558]: · none
      - generic [ref=e559] [cursor=pointer]:
        - generic [ref=e560]: bravo
        - generic [ref=e561]: auto / 250
        - generic [ref=e562]: · none
      - generic [ref=e563] [cursor=pointer]:
        - generic [ref=e564]: charlie
        - generic [ref=e565]: auto / 250
        - generic [ref=e566]: · none
      - generic [ref=e567] [cursor=pointer]:
        - generic [ref=e568]: delta
        - generic [ref=e569]: auto / 250
        - generic [ref=e570]: · none
      - generic [ref=e571]: line break · \N
      - generic [ref=e572] [cursor=pointer]:
        - generic [ref=e573]: echo
        - generic [ref=e574]: auto / 250
        - generic [ref=e575]: · none
      - generic [ref=e576] [cursor=pointer]:
        - generic [ref=e577]: foxtrot
        - generic [ref=e578]: auto / 250
        - generic [ref=e579]: · none
      - generic [ref=e580] [cursor=pointer]:
        - generic [ref=e581]: golf
        - generic [ref=e582]: auto / 250
        - generic [ref=e583]: · none
      - generic [ref=e584] [cursor=pointer]:
        - img [ref=e586]
        - text: Chorus
        - generic [ref=e588]: words
        - generic [ref=e589]: 7.50–9.20
      - generic [ref=e590] [cursor=pointer]:
        - generic [ref=e591]: hotel
        - generic [ref=e592]: auto / 250
        - generic [ref=e593]: · none
      - generic [ref=e594] [cursor=pointer]:
        - generic [ref=e595]: india
        - generic [ref=e596]: auto / 250
        - generic [ref=e597]: · none
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