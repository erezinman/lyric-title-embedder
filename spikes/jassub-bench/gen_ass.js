// Generates the worst-case full-song .ass (Spike A) and the geometry .ass (Spike B).
const fs = require('fs');

function fmtTime(t) {
  // ASS time format H:MM:SS.cs (centiseconds)
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const cs = Math.round((t - Math.floor(t)) * 100);
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}

const HEADER = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,54,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,10,10,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

// ---------- SPIKE A: worst-case full song ----------
function genSpikeA() {
  const WORDS_PER_EVENT = 12;
  const NUM_EVENTS = 30; // ~360 words
  const EVENT_GAP = 8.0; // seconds between event starts
  const EVENT_DUR = 7.5; // visible window
  const WORD_STAGGER = 0.4; // s between word reveals

  const sampleWords = 'lorem ipsum dolor sit amet consectetur adipiscing elytra sed eius modtemp incididunt'.split(' ');
  let lines = [];
  let totalWords = 0;
  for (let e = 0; e < NUM_EVENTS; e++) {
    const start = e * EVENT_GAP;
    const end = start + EVENT_DUR;
    let text = '';
    for (let w = 0; w < WORDS_PER_EVENT; w++) {
      const word = sampleWords[w % sampleWords.length];
      // per-word reveal offsets, in ms relative to the event start
      const o1 = Math.round(w * WORD_STAGGER * 1000);
      const o2 = o1 + 150;       // fade midpoint
      const o3 = o1 + 350;       // fully visible
      // S-curve fade: start hidden, ramp to half alpha, then full
      const ov = `{\\alpha&HFF&\\t(${o1},${o2},\\alpha&H80&)\\t(${o2},${o3},\\alpha&H00&)}`;
      text += ov + word + ' ';
      totalWords++;
    }
    lines.push(`Dialogue: 0,${fmtTime(start)},${fmtTime(end)},Default,,0,0,0,,${text.trim()}`);
  }
  const ass = HEADER + lines.join('\n') + '\n';
  fs.writeFileSync(__dirname + '/spikeA.ass', ass);
  console.log('SpikeA: events=%d words=%d bytes=%d', NUM_EVENTS, totalWords, Buffer.byteLength(ass));
  return ass;
}

// ---------- SPIKE B: geometry calibration ----------
const SPIKE_B_WORDS = ['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel'];
// pure-ish colors, ASS is &HBBGGRR
const SPIKE_B_COLORS = [
  '&H0000FF&', // red
  '&H00FF00&', // green
  '&HFF0000&', // blue
  '&H00FFFF&', // yellow
  '&HFF00FF&', // magenta
  '&HFFFF00&', // cyan
  '&H0080FF&', // orange
  '&HFFFFFF&', // white
];

function genSpikeB(bold) {
  const styleLine = `Style: Geo,DejaVu Sans,64,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,${bold?1:0},0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`;
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styleLine}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  let text = `{\\an7\\pos(40,200)\\bord0\\shad0${bold?'\\b1':''}}`;
  for (let i = 0; i < SPIKE_B_WORDS.length; i++) {
    text += `{\\1c${SPIKE_B_COLORS[i]}}` + SPIKE_B_WORDS[i];
    if (i < SPIKE_B_WORDS.length - 1) text += ' ';
  }
  const ass = header + `Dialogue: 0,0:00:00.00,0:00:10.00,Geo,,0,0,0,,${text}\n`;
  const fn = bold ? '/spikeB_bold.ass' : '/spikeB.ass';
  fs.writeFileSync(__dirname + fn, ass);
  console.log('SpikeB%s bytes=%d', bold?'(bold)':'', Buffer.byteLength(ass));
  return ass;
}

genSpikeA();
genSpikeB(false);
genSpikeB(true);

// trivial sanity track
const sanity = HEADER + `Dialogue: 0,0:00:00.00,0:00:10.00,Default,,0,0,0,,{\\an5\\pos(640,360)}HELLO\n`;
fs.writeFileSync(__dirname + '/sanity.ass', sanity);
console.log('sanity bytes=%d', Buffer.byteLength(sanity));

// export word/color metadata for the page
fs.writeFileSync(__dirname + '/spikeB_meta.json', JSON.stringify({words: SPIKE_B_WORDS, colors: SPIKE_B_COLORS}, null, 2));
