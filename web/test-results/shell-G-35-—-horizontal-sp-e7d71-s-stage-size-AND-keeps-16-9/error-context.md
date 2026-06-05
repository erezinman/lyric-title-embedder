# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: shell.spec.ts >> G-35 — horizontal splitter drag changes stage size AND keeps 16:9
- Location: e2e/shell.spec.ts:67:1

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 1.79
Received:   2.3001808318264017
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
          - button "Alignment" [ref=e77] [cursor=pointer]: Bottom-Center (2)
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
  - generic [ref=e277]: AI agent updated the project
```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | import { apiState, apiCall, resetProject, openAudit, until } from "./helpers";
  3   | 
  4   | test.beforeEach(async () => { await resetProject(); });
  5   | 
  6   | const timeLabel = (page: import("@playwright/test").Page) => page.locator(".transport .time");
  7   | 
  8   | test("G-30 — Play advances the time label (real rAF) and pause freezes it", async ({ page }) => {
  9   |   await openAudit(page);
  10  |   const label = timeLabel(page);
  11  |   await expect(label).toContainText("0:00.00");
  12  | 
  13  |   await page.locator(".tbtn.play").click();
  14  |   // wait for the clock to advance
  15  |   await expect.poll(async () => (await label.textContent()) ?? "").not.toContain("0:00.00");
  16  |   await page.locator(".tbtn.play").click(); // pause
  17  |   const frozen = await label.textContent();
  18  |   await page.waitForTimeout(300);
  19  |   expect(await label.textContent()).toBe(frozen);
  20  | });
  21  | 
  22  | test("G-31 — seek +/- moves the time label", async ({ page }) => {
  23  |   await openAudit(page);
  24  |   const label = timeLabel(page);
  25  |   await page.locator(".transport .tbtn").last().click(); // skip forward (+2)
  26  |   await expect(label).toContainText("0:02.00");
  27  |   await page.locator(".transport .tbtn").first().click(); // skip back (-2)
  28  |   await expect(label).toContainText("0:00.00");
  29  | });
  30  | 
  31  | test("G-32 — undo button (TopBar) reverts a UI edit against real history", async ({ page }) => {
  32  |   await openAudit(page);
  33  |   // make an edit via UI: group fontsize via inspector
  34  |   await page.locator(".dock-tab", { hasText: "Cue lanes" }).click();
  35  |   await page.locator(".lane-evt").first().click();
  36  |   await page.locator(".rail-tab", { hasText: "Inspector" }).click();
  37  |   const sizeRow = page.locator(`.tier3.group .prow`, { has: page.locator(".pl", { hasText: "Size" }) });
  38  |   await sizeRow.locator(".pm").last().click();
  39  |   await until(async () => typeof (await apiState()).layout[0].style.fontsize === "number");
  40  | 
  41  |   // undo via TopBar button (title Undo)
  42  |   await page.locator('.topbar button[title="Undo"]').click();
  43  |   await until(async () => (await apiState()).layout[0].style.fontsize === undefined);
  44  | });
  45  | 
  46  | test("G-33 — rail tabs switch Project <-> Inspector", async ({ page }) => {
  47  |   await openAudit(page);
  48  |   await page.locator(".rail-tab", { hasText: "Project" }).click();
  49  |   await expect(page.locator(".rail-body .insp")).toHaveCount(0);
  50  |   await expect(page.getByRole("switch", { name: "Free placement" })).toBeVisible();
  51  |   await page.locator(".rail-tab", { hasText: "Inspector" }).click();
  52  |   await expect(page.locator(".rail-body .insp")).toBeVisible();
  53  | });
  54  | 
  55  | test("G-34 — dock tabs switch Timeline <-> Cue lanes", async ({ page }) => {
  56  |   await openAudit(page);
  57  |   await page.locator(".dock-tab", { hasText: "Timeline" }).click();
  58  |   await expect(page.locator(".wt")).toBeVisible();
  59  |   await expect(page.locator(".lanes")).toHaveCount(0);
  60  |   await page.locator(".dock-tab", { hasText: "Cue lanes" }).click();
  61  |   await expect(page.locator(".lanes")).toBeVisible();
  62  | });
  63  | 
  64  | // FINDING G-35: the .stage element declares `aspect-ratio: 16/9` in CSS but its
  65  | // rendered box is NOT 16:9 (observed ~2.85:1) — the stage is stretched to fill
  66  | // its column instead of being letterboxed to 16:9. This is the squash-bug class.
  67  | test("G-35 — horizontal splitter drag changes stage size AND keeps 16:9", async ({ page }) => {
  68  |   test.fail();
  69  |   await openAudit(page);
  70  |   const stage = page.locator(".stage");
  71  |   const before = (await stage.boundingBox())!;
  72  | 
  73  |   const split = page.locator(".splitter.horizontal");
  74  |   const sb = (await split.boundingBox())!;
  75  |   const cx = sb.x + sb.width / 2;
  76  |   const cy = sb.y + sb.height / 2;
  77  |   // drag the dock divider DOWN -> grows the stage area above it
  78  |   await page.mouse.move(cx, cy);
  79  |   await page.mouse.down();
  80  |   await page.mouse.move(cx, cy + 80, { steps: 8 });
  81  |   await page.mouse.up();
  82  | 
  83  |   const after = (await stage.boundingBox())!;
  84  |   expect(Math.abs(after.height - before.height)).toBeGreaterThan(10);
  85  |   // stage keeps 16:9 (the squash-bug guard)
  86  |   const ratio = after.width / after.height;
  87  |   expect(ratio).toBeGreaterThan(1.77);
> 88  |   expect(ratio).toBeLessThan(1.79);
      |                 ^ Error: expect(received).toBeLessThan(expected)
  89  | });
  90  | 
  91  | test("G-36 — splitter double-click resets to default height", async ({ page }) => {
  92  |   await openAudit(page);
  93  |   const dock = page.locator(".dock");
  94  |   const defaultH = (await dock.boundingBox())!.height;
  95  | 
  96  |   const split = page.locator(".splitter.horizontal");
  97  |   const sb = (await split.boundingBox())!;
  98  |   await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  99  |   await page.mouse.down();
  100 |   await page.mouse.move(sb.x + sb.width / 2, sb.y - 60, { steps: 6 });
  101 |   await page.mouse.up();
  102 |   expect(Math.abs((await dock.boundingBox())!.height - defaultH)).toBeGreaterThan(10);
  103 | 
  104 |   await split.dblclick();
  105 |   await expect.poll(async () => Math.round((await dock.boundingBox())!.height)).toBe(Math.round(defaultH));
  106 | });
  107 | 
  108 | test("G-37 — pane sizes persist across page reload (localStorage)", async ({ page }) => {
  109 |   await openAudit(page);
  110 |   // nudge rail wider via keyboard arrow on the vertical splitter
  111 |   const vsplit = page.locator(".splitter.vertical");
  112 |   await vsplit.focus();
  113 |   const railBefore = (await page.locator(".rail").boundingBox())!.width;
  114 |   await vsplit.press("ArrowRight");
  115 |   await vsplit.press("ArrowRight");
  116 |   await expect.poll(async () => (await page.locator(".rail").boundingBox())!.width).toBeGreaterThan(railBefore + 10);
  117 |   const railAfter = (await page.locator(".rail").boundingBox())!.width;
  118 | 
  119 |   // localStorage holds the new width
  120 |   const stored = await page.evaluate(() => Number(localStorage.getItem("kss.railW")));
  121 |   expect(Math.abs(stored - railAfter)).toBeLessThan(4);
  122 | 
  123 |   // reload returns to the library; re-open the project and the persisted width applies
  124 |   await page.reload();
  125 |   await openAudit(page);
  126 |   const railReloaded = (await page.locator(".rail").boundingBox())!.width;
  127 |   expect(Math.abs(railReloaded - railAfter)).toBeLessThan(4);
  128 | });
  129 | 
```