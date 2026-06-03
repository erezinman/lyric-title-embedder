// model.jsx — faithful (if simplified) mirror of the real engine project model.
// Shape matches HANDOFF_real-model §5: immutable word atoms, layout events →
// lines(\N) → tokens(cues), fade-in/out grouping tags, globals, palette.
// Plus pure resolvers (style waterfall cue→group→global, render derivation).

const PALETTE = ["#7A3A5A","#5A4A7A","#3A5A7A","#5A7A3A","#7A6A3A","#3A7A7A","#7A4A4A","#6A3A7A","#3A6A7A","#7A5A3A"];

// immutable atoms — index = wid
const WORDS = [
  { text: "Caught",    start: 0.30, end: 0.70 }, //0
  { text: "in",        start: 0.80, end: 1.00 }, //1
  { text: "a",         start: 1.05, end: 1.20 }, //2
  { text: "bleating",  start: 1.40, end: 2.00 }, //3
  { text: "obsession", start: 2.20, end: 3.10 }, //4
  { text: "Tangled",   start: 3.70, end: 4.20 }, //5
  { text: "up",        start: 4.25, end: 4.45 }, //6
  { text: "in",        start: 4.50, end: 4.70 }, //7
  { text: "wool",      start: 4.95, end: 5.45 }, //8
  { text: "and",       start: 5.55, end: 5.75 }, //9
  { text: "static",    start: 5.95, end: 6.85 }, //10
];

// global style defaults (the GLOBAL tier) — 10 props + placement-ish
const GLOBAL_STYLE = {
  font: "Space Grotesk", fontsize: 64, bold: true,
  primary: "#FFFFFF", outline: "#000000", back: "#000000", back_alpha: "80",
  outline_w: 3, shadow: 0, border_style: 1, // 1 = outline, 3 = opaque box
};

const INITIAL_PROJECT = {
  words: WORDS,
  layout: [
    { label: "Verse 1", accumulate: "words", win_start: null, win_end: null, linger: null, del: false,
      style: { fontsize: 72 }, // a GROUP override to demonstrate the waterfall
      lines: [ { toks: [
        { ids: [0], sep: "", del: false, style: {} },
        { ids: [1], sep: "", del: false, style: {} },
        { ids: [2], sep: "", del: false, style: {} },
        { ids: [3], sep: "", del: false, style: { primary: "#FF3DA6" } }, // a CUE override
        { ids: [4], sep: "", del: false, style: {} },
      ] } ] },
    { label: "Chorus", accumulate: "lines", win_start: null, win_end: null, linger: 0.4, del: false,
      style: {},
      lines: [ { toks: [
        { ids: [5], sep: "", del: false, style: {} },
        { ids: [6, 7], sep: " ", del: false, style: {} }, // merged token "up in"
        { ids: [8], sep: "", del: false, style: {} },
        { ids: [9], sep: "", del: false, style: {} },
        { ids: [10], sep: "", del: false, style: {} },
      ] } ] },
  ],
  fin_tags:  [ { ids: [0, 1, 2], color: 0, trigger: null, dur: null } ],          // inherited fade-in group
  fout_tags: [ { ids: [3, 4],    color: 1, trigger: 15.40, dur: 600 } ],          // overridden fade-out group
  globals: { fade_in_ms: 250, fade_out_ms: 1000, linger: 0.0 },
  global_style: GLOBAL_STYLE,
  placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 60, margin_r: 60, margin_v: 60, use_pos: false, pos: null },
  palette: PALETTE,
};

// ---- helpers ----
const clone = (p) => JSON.parse(JSON.stringify(p));
const eqSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
const STYLE_KEYS = ["font", "fontsize", "bold", "primary", "outline", "back", "back_alpha", "outline_w", "shadow", "border_style"];
const CUE_STYLE_KEYS = STYLE_KEYS.filter(k => k !== "border_style"); // box-mode group-only

// flatten layout → ordered tokens with location, across lines/events
function tokens(project) {
  const out = [];
  project.layout.forEach((g, gi) => g.lines.forEach((ln, li) => ln.toks.forEach((tok, ti) => {
    out.push({ ...tok, gi, li, ti, key: `${gi}.${li}.${ti}`,
      text: tok.ids.map(id => project.words[id].text).join(tok.sep || " ") });
  })));
  return out;
}
const tokText = (project, tok) => tok.ids.map(id => project.words[id].text).join(tok.sep || " ");
function findTokByWord(project, wid) {
  for (let gi = 0; gi < project.layout.length; gi++)
    for (let li = 0; li < project.layout[gi].lines.length; li++)
      for (let ti = 0; ti < project.layout[gi].lines[li].toks.length; ti++) {
        const tok = project.layout[gi].lines[li].toks[ti];
        if (tok.ids.includes(wid)) return { tok, gi, li, ti };
      }
  return null;
}
const fadeTagOf = (project, kind, wid) => (kind === "in" ? project.fin_tags : project.fout_tags).find(t => t.ids.includes(wid)) || null;

// style waterfall: cue → group → global (most specific wins). Returns {value, src} per key.
function resolveStyle(project, gi, tok) {
  const g = project.layout[gi];
  const out = {};
  STYLE_KEYS.forEach(k => {
    // border_style resolves group→global only (never per-cue) to match the engine
    if (k !== "border_style" && tok && tok.style && tok.style[k] != null) out[k] = { value: tok.style[k], src: "cue" };
    else if (g && g.style && g.style[k] != null) out[k] = { value: g.style[k], src: "group" };
    else out[k] = { value: project.global_style[k], src: "global" };
  });
  return out;
}

// event window (auto unless overridden) + linger
function eventWindow(project, gi) {
  const g = project.layout[gi];
  const wids = g.lines.flatMap(l => l.toks.filter(t => !t.del).flatMap(t => t.ids));
  const live = wids.map(id => project.words[id]).filter(Boolean);
  const linger = g.linger != null ? g.linger : project.globals.linger;
  const s = g.win_start != null ? g.win_start : (live.length ? Math.min(...live.map(w => w.start)) : 0);
  const e = g.win_end != null ? g.win_end : (live.length ? Math.max(...live.map(w => w.end)) + linger : 0);
  return [s, e, linger];
}

// per-word appearance + fade schedule (mirrors render-group §5.4)
function wordSchedule(project, gi, wid) {
  const g = project.layout[gi];
  const [winS] = eventWindow(project, gi);
  const w = project.words[wid];
  let start_s = w.start;
  if (g.accumulate === "lines") {
    // first word of the word's line
    const line = g.lines.find(l => l.toks.some(t => t.ids.includes(wid)));
    const ids = line ? line.toks.filter(t => !t.del).flatMap(t => t.ids) : [wid];
    start_s = Math.min(...ids.map(id => project.words[id].start));
  } else if (g.accumulate === "off") start_s = winS;

  const fin = fadeTagOf(project, "in", wid);
  let fin_trigger = start_s, fin_ms = project.globals.fade_in_ms;
  if (fin) {
    fin_ms = fin.dur != null ? fin.dur : project.globals.fade_in_ms;
    fin_trigger = fin.trigger != null ? fin.trigger
      : Math.min(...fin.ids.map(id => wordSchedule0(project, gi, id))); // first member appearance
  }
  const fout = fadeTagOf(project, "out", wid);
  let fout_at = null, fout_ms = project.globals.fade_out_ms;
  if (fout) {
    fout_ms = fout.dur != null ? fout.dur : project.globals.fade_out_ms;
    fout_at = fout.trigger != null ? fout.trigger : Math.max(...fout.ids.map(id => project.words[id].end));
  }
  return { start_s, fin_trigger, fin_ms, fin_inherited: !fin || (fin.trigger == null && fin.dur == null),
           fout_at, fout_ms, fout_inherited: fout && fout.trigger == null && fout.dur == null, inFin: !!fin, inFout: !!fout };
}
// tiny helper to avoid recursion blowup for fin trigger derivation
function wordSchedule0(project, gi, wid) {
  const g = project.layout[gi], w = project.words[wid];
  if (g.accumulate === "off") return eventWindow(project, gi)[0];
  if (g.accumulate === "lines") {
    const line = g.lines.find(l => l.toks.some(t => t.ids.includes(wid)));
    const ids = line ? line.toks.filter(t => !t.del).flatMap(t => t.ids) : [wid];
    return Math.min(...ids.map(id => project.words[id].start));
  }
  return w.start;
}

const totalDuration = (project) => Math.max(8, ...project.words.map(w => w.end)) + 1.5;

Object.assign(window, {
  INITIAL_PROJECT, PALETTE, STYLE_KEYS, CUE_STYLE_KEYS, GLOBAL_STYLE,
  clone, eqSet, tokens, tokText, findTokByWord, fadeTagOf, resolveStyle,
  eventWindow, wordSchedule, totalDuration,
});
