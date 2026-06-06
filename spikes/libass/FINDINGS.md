# libass Rendering Semantics — Empirical Spikes

Environment: ffmpeg 4.4.2 (libass), PIL 9.0.1, font DejaVu Sans.
Method: render single frames of `.ass` over a black 1280x720 source, output-side seek
(`-ss` AFTER input so PTS are preserved), then measure ink pixels with PIL.
Style `K`: DejaVu Sans 64, Primary `&H00FFFFFF` (white), Secondary `&H00FF0000` (blue),
Outline=0, Shadow=0; `\bord0\shad0` also forced in override blocks for clean ink.

Harness (`harness.py`) verified: text timed 0–10s shows ink at t=1 (2643 px) and zero at
t=11 — confirms output-side seek aligns subtitle PTS to the rendered frame.
Rerunnable: `python3 spike1.py`, `spike1_fine.py`, `spike2.py`, `spike3.py`.

---

## SPIKE 1 — Overlapping \t on the same property (\fscx)

Setup: Dialogue 0–10s, text HHHH. Implied fscx = 100 × (ink width / width@t=0.5).
Main: {\bord0\shad0\fscx100\t(1000,5000,\fscx300)\t(3000,7000,\fscx100)}HHHH
Control (first only): …\fscx100\t(1000,5000,\fscx300)
Swap-only (two \t reordered): …\fscx100\t(3000,7000,\fscx100)\t(1000,5000,\fscx300)

| t (s) | both | first_only | swap-only |
|------:|-----:|-----------:|----------:|
| 0.5 | 100.0 | 100.0 | 100.0 |
| 2.0 | 148.7 | 148.7 | 148.7 |
| 3.0 | 198.7 | — | 198.7 |
| 3.5 | 207.7 | 224.4 | 224.4 |
| 4.0 | 211.5 | 248.7 | 248.7 |
| 4.5 | 207.7 | — | 274.4 |
| 5.0 | 198.7 | 297.4 | 297.4 |
| 6.0 | 148.7 | 297.4 | 297.4 |
| 8.0 | 100.0 | 297.4 | 297.4 |

`both` dense (continuous, single peak at t=4): 100→125.6→148.7→174.4→198.7→207.7→
211.5(peak@4.0)→207.7→198.7→173.1→148.7→123.1→100.

VERDICT — LAST-LISTED \t WINS (per property), result is CONTINUOUS.
- Not compounding: `both` never exceeds ~211; compounding would overshoot 300+.
- Not discontinuous: `both` bends smoothly through one crossover peak at t≈4.0.
- Block order decides: `both` (the →fscx100 transform listed last) pulls back to 100;
  `swap-only` (the →fscx300 transform listed last) reproduces the pure ramp to 300.
- Mechanism: for the same property the later-listed \t overwrites the earlier one's
  contribution at each frame; its own start time is where the curve bends.
- Extra (spike1_fine.py): a STATIC \fscxNNN placed after the \t blocks pins it flat —
  static-last fully overrides animation.

Compiler advice: emit at most one \t per (property, window). The transform you want to
dominate during any overlap must be emitted LAST in the block. Never assume additive
behavior. Don't append a static value for an animated property unless cancelling it.

---

## SPIKE 2 — Is \clip(x1,y1,x2,y2) interpolated under \t?

Setup: {\bord0\shad0\clip(0,0,0,720)\t(1000,9000,\clip(0,0,1280,720))}WIPETEST, centered.
Unclipped full width = 274 px, ink spans x∈[504,777]. Interp clip x2 = 1280×(t−1)/8.

| t (s) | ink width | frac of full | ink right-edge | expected clip x2 |
|------:|----------:|-------------:|---------------:|-----------------:|
| 0.5 | 0 | 0.00 | — | <0 |
| 1.0 | 0 | 0.00 | — | 0 |
| 3.0 | 0 | 0.00 | — | 320 (left of text) |
| 4.0 | 0 | 0.00 | — | 480 (left of x=504) |
| 5.0 | 134 | 0.49 | 637 | 640 |
| 6.0 | 274 | 1.00 | 777 | 800 (≥ text right) |
| 7.0 | 274 | 1.00 | — | 960 |
| 9.5 | 274 | 1.00 | — | full |

VERDICT — \clip rectangle IS linearly interpolated under \t.
Width grows smoothly; ink right edge tracks interpolated x2 to the pixel (t=5: expected
640, measured 637; t=4: x2=480 still left of text → nothing revealed). Exact geometric
interpolation, not a snap.

Compiler advice: \clip rect under \t is fully usable for a Wipe. Compute clip endpoints
from the ACTUAL laid-out text bbox (account for alignment/centering); PlayRes-relative
guesses mis-time the wipe. This is the RECTANGLE form — the vector/\iclip drawing form is
NOT interpolated by libass; prefer the rect form for sweeps.

---

## SPIKE 3 (doc #5) — \kf karaoke fill with GAP PADDING

Setup: event 0–10s; word A sung 1.0–2.0s, gap, word B sung 4.0–5.0s. Primary white,
Secondary blue &H00FF0000 (AABBGGRR).
{\bord0\shad0\k100\kf100}AAAA{\k200\kf100}BBBB
(\k100 lead-in 0–1s, \kf100 fills A 1–2s, \k200 gap pad 2–4s, \kf100 fills B 4–5s.)
Separate-block form {\k100}{\kf100}AAAA{\k200}{\kf100}BBBB gave IDENTICAL results.
Per word: white fraction (sung) vs blue (unsung); "other" = AA edge pixels.

| t (s) | Word A (white/blue) | Word B (white/blue) | State |
|------:|--------------------:|--------------------:|-------|
| 0.5 | 0.00 / 0.78 | 0.00 / 0.81 | both blue (pre-fill) |
| 1.5 | 0.44 / 0.41 | 0.00 / 0.81 | A mid-fill (left white), B blue |
| 2.5 | 0.92 / 0.00 | 0.00 / 0.81 | A full white, B blue |
| 3.0 | 0.92 / 0.00 | 0.00 / 0.81 | A white, B blue (gap pad holds) |
| 4.5 | 0.92 / 0.00 | 0.49 / 0.39 | A white, B mid-fill |
| 6.0 | 0.92 / 0.00 | 0.93 / 0.00 | both white |

SecondaryColour source check: setting Secondary to green &H0000FF00 renders unfilled text
green at t=0.5 (4465 green, 0 blue, 0 white). Unsung/pre-fill color = SecondaryColour, confirmed.

VERDICT — GAP PADDING VIA \k WORKS; fills line up exactly with real word times.
- Karaoke clock advances from event start; \k padding consumes lead-in (0–1s) and gap
  (2–4s), so \kf fills hit 1–2s and 4–5s.
- \kf is a smooth left-to-right partial fill (A at t=1.5 ~half white on left), not a snap.
- Two bare karaoke tags in one block work fine; separate-block workaround unnecessary.

Surprises/notes: none on correctness. Pure-fill reads ~0.92 white (not 1.0) only because
AA glyph-edge pixels classify as "other"; immaterial. Padding \k must attach to some text
run for the clock to advance; inline-before-word works (zero-width/space also fine if cs sum
covers the gap).

Compiler advice: emit leading \k<lead-in cs>, then per word \kf<dur cs>, inserting
\k<gap cs> padding between words. Durations are CENTISECONDS from event start and must sum
to cover every gap. SecondaryColour = unsung color, PrimaryColour = sung. One block per word
is sufficient.

---

## Summary of verdicts
1. Overlapping \t same property: last-listed \t wins; transition continuous (smooth bend at
   crossover), not compounding, not discontinuous. Block order is authoritative.
2. \clip rect under \t: linearly interpolated, pixel-accurate — usable for Wipe.
3. \kf gap padding: works; fills align to real word times, partial fill is a smooth sweep,
   unsung color = SecondaryColour, one-block bare tags are fine.
