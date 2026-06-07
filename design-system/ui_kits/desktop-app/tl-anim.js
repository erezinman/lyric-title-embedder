/* Timeline animation strips — concept preview.
   Cues sit on a shared time axis; each animation renders a strip in the bottom
   third of the cue block, its x-bounds synced to the axis, its FILL encoding the
   type. 1 click = select cue; 2nd click on a strip = focus that animation. */
(function () {
  const TYPES = {
    color:  { label: 'Color change', desc: 'Fill shifts from one color to another over its span — the strip is the literal gradient.' },
    alpha:  { label: 'Alpha / fade', desc: 'Opacity ramps over the span — strip shows the fill at increasing/decreasing alpha.' },
    size:   { label: 'Size / Pop',   desc: 'Scale grows (with optional spring overshoot) — strip is a rising wedge.' },
    type:   { label: 'Typewriter',   desc: 'Glyphs reveal left-to-right — strip is a hatched wipe.' },
    move:   { label: 'Move / slide', desc: 'Cue translates into place — strip is a directional arrow-trail.' },
    glow:   { label: 'Glow pulse',   desc: 'Soft bloom swells then settles — strip is a blurred bloom band.' },
  };

  // window shown on the track (seconds)
  const T0 = 0.0, T1 = 7.2;
  // cues: {text, s, e, gi, anims:[{type, s, e, from?, to?, dir?}]}
  const PALETTE = ['#FF3DA6', '#8A5CF6', '#36E2FF', '#37E29A', '#FFC24B'];
  const CUES = [
    { text: 'Caught', s: 0.30, e: 1.05, gi: 0, anims: [
        { type:'alpha', s:0.30, e:0.62, dir:'in' } ] },
    { text: 'in a', s: 0.80, e: 1.35, gi: 0, anims: [
        { type:'type', s:0.80, e:1.20 } ] },
    { text: 'bleating', s: 1.40, e: 2.55, gi: 0, anims: [
        { type:'alpha', s:1.40, e:1.66, dir:'in' },
        { type:'color', s:1.55, e:2.30, from:'#FFFFFF', to:'#FF3DA6' },
        { type:'size',  s:1.42, e:1.74 } ] },                         // stacked: 3 anims
    { text: 'obsession', s: 2.70, e: 4.10, gi: 0, anims: [
        { type:'alpha', s:2.70, e:2.96, dir:'in' },
        { type:'color', s:2.78, e:3.90, from:'#FFFFFF', to:'#8A5CF6' },
        { type:'glow',  s:3.40, e:4.10 },
        { type:'size',  s:2.72, e:3.00 } ] },                         // 4 anims → 2 bars + "+2"
    { text: 'Tangled', s: 4.40, e: 5.40, gi: 1, anims: [
        { type:'move', s:4.40, e:4.74, dir:'up' },
        { type:'size', s:4.62, e:4.74 } ] },                          // tiny pop → glyph chip
    { text: 'up in', s: 5.10, e: 6.00, gi: 1, anims: [
        { type:'type', s:5.10, e:5.62 } ] },
    { text: 'wool', s: 6.05, e: 7.10, gi: 1, anims: [
        { type:'alpha', s:6.60, e:7.10, dir:'out' } ] },
  ];

  let zoom = 1, t = 0, playing = false, raf = null, last = 0;
  let selCue = 2, focusAnim = null; // {ci, ai}
  let muted = true;
  let expanded = new Set();          // cue indices whose +N stack is expanded inline
  const MIN_PX = 26;  // below this width → glyph chip ("not to scale"); scales with h-zoom
  const MAX_BARS = 3; // max stacked bars per cue (no vertical zoom → fixed); rest collapse to +N

  const board = document.getElementById('board');
  const focusEl = document.getElementById('focus');
  const readEl = document.getElementById('read');

  const pxPerSec = () => 150 * zoom;
  const xOf = (sec) => (sec - T0) * pxPerSec();
  const wOf = (a, b) => (b - a) * pxPerSec();

  // ---- strip fill per type ----
  function stripStyle(an, cue) {
    const c = PALETTE[cue.gi % PALETTE.length];
    switch (an.type) {
      case 'color': return `background:linear-gradient(90deg, ${an.from||'#fff'}, ${an.to||c});`;
      case 'alpha': {
        const a = an.dir === 'out'
          ? `linear-gradient(90deg, ${c}, ${c}00)`
          : `linear-gradient(90deg, ${c}00, ${c})`;
        return `background:${a};`;
      }
      case 'size': return `background:linear-gradient(90deg, ${c}22, ${c}); clip-path:polygon(0 100%,100% 0,100% 100%);`;
      case 'type': return `background:repeating-linear-gradient(90deg, ${c} 0 3px, ${c}33 3px 7px);`;
      case 'move': return `background:linear-gradient(90deg, ${c}11, ${c}); --arrow:1;`;
      case 'glow': return `background:radial-gradient(120% 180% at 60% 50%, ${c}, ${c}22 70%, transparent); filter:blur(.4px);`;
      default: return `background:${c};`;
    }
  }

  function render() {
    const trackW = xOf(T1);
    board.style.setProperty('--track-w', trackW + 'px');
    // ruler
    let ruler = '<div class="ruler" style="width:' + trackW + 'px">';
    for (let s = 0; s <= Math.floor(T1); s++) ruler += `<span class="tick" style="left:${xOf(s)}px">${s}s</span>`;
    ruler += `<div class="playhead" style="left:${xOf(t)}px"></div></div>`;

    let rows = '';
    CUES.forEach((cue, ci) => {
      const left = xOf(cue.s), width = wOf(cue.s, cue.e);
      const isSel = ci === selCue;
      const live = t >= cue.s && t < cue.e;
      // strips occupy the bottom band, stacked. Cap at MAX_BARS; the rest collapse
      // into one "+N" overflow chip — unless this cue is expanded inline (show all).
      const all = cue.anims;
      const isExp = expanded.has(ci);
      const over = all.length > MAX_BARS && !isExp;
      const shown = over ? all.slice(0, MAX_BARS - 1) : all; // keep last slot for overflow
      const slots = over ? MAX_BARS : all.length;
      const grow = isExp && all.length > MAX_BARS;
      const BAND = grow ? 60 : 42;     // strips live in the bottom 42% (60% when expanded)
      const slotH = BAND / slots;
      const stripsArr = shown.map((an, ai) => {
        const aL = xOf(an.s) - left, aW = wOf(an.s, an.e);
        const tiny = aW < MIN_PX;       // threshold in px → scales with horizontal zoom
        const focused = focusAnim && focusAnim.ci === ci && focusAnim.ai === ai;
        const top = (100 - BAND) + (ai * slotH);
        if (tiny) {
          return `<button class="astrip glyph ${focused?'foc':''}" data-ci="${ci}" data-ai="${ai}"
            style="left:${aL}px; top:${top}%; height:${slotH}%;" title="${TYPES[an.type].label} · ${(an.e-an.s).toFixed(2)}s (zoom in to expand)">
            <i class="g-ic">${typeGlyph(an.type)}</i></button>`;
        }
        return `<button class="astrip ${focused?'foc':''}" data-ci="${ci}" data-ai="${ai}"
          style="left:${aL}px; width:${aW}px; top:${top}%; height:${slotH}%; ${stripStyle(an, cue)}"
          title="${TYPES[an.type].label} · ${an.s.toFixed(2)}–${an.e.toFixed(2)}s">
          ${an.type==='move' ? '<i class="arrow">→</i>' : ''}
          ${focused ? '<i class="h h-l"></i><i class="h h-r"></i>' : ''}
        </button>`;
      });
      if (over) {
        const hidden = all.slice(MAX_BARS - 1);
        const oS = Math.min(...hidden.map(a => a.s)), oE = Math.max(...hidden.map(a => a.e));
        const oL = xOf(oS) - left, oW = Math.max(MIN_PX, wOf(oS, oE));
        const top = (100 - BAND) + ((slots - 1) * slotH);
        const stripeC = hidden.map(a => PALETTE[cue.gi % PALETTE.length]); // band uses group color; stripes mark count
        const stripes = hidden.map((a, k) => `${typeColor(a.type)} ${k*(100/hidden.length)}% ${(k+1)*(100/hidden.length)}%`).join(',');
        stripsArr.push(`<button class="astrip overflow" data-ci="${ci}" data-ai="over"
          style="left:${oL}px; width:${oW}px; top:${top}%; height:${slotH}%; background:linear-gradient(90deg, ${stripes});"
          title="${hidden.length} more animations — ${selCue===ci?'click to expand inline':'select the cue, then click to expand'}">
          <span class="ov-n">+${hidden.length}</span></button>`);
      }
      if (grow) {
        stripsArr.push(`<button class="astrip collapse" data-ci="${ci}" data-ai="collapse"
          style="right:6px; top:6px;" title="Collapse stack"><span class="ov-n">✕</span></button>`);
      }
      const strips = stripsArr.join('');

      // expanded multi-anim cues grow taller so the extra bars stay legible
      const cueH = grow ? 54 + (all.length - MAX_BARS) * 13 : 54;
      rows += `<div class="cue ${isSel?'sel':''} ${live?'live':''} ${grow?'exp':''}" data-ci="${ci}"
        style="left:${left}px; width:${width}px; height:${cueH}px; --c:${PALETTE[cue.gi%PALETTE.length]}">
        <span class="cue-t">${cue.text}</span>
        <span class="cue-anims ${muted?'muted':''}">${strips}</span>
      </div>`;
    });

    board.innerHTML = ruler + `<div class="track" style="width:${trackW}px">${rows}</div>`;
    readEl.textContent = 't = ' + t.toFixed(2) + 's';
    renderFocus();
    renderLegend();
  }

  // representative color per animation type (for the +N overflow stripes & glyphs)
  function typeColor(type) {
    return { color:'#FF3DA6', alpha:'#36E2FF', size:'#37E29A', type:'#8A5CF6', move:'#FFC24B', glow:'#36E2FF' }[type] || '#fff';
  }

  function typeGlyph(type) {
    const m = { color:'◑', alpha:'◧', size:'▲', type:'⌨', move:'→', glow:'✦' };
    return m[type] || '•';
  }

  function renderLegend() {
    const el = document.getElementById('legend');
    el.innerHTML = Object.entries(TYPES).map(([k, v]) =>
      `<span class="lg"><i class="lg-sw t-${k}"></i>${v.label}</span>`).join('')
      + `<span class="lg"><i class="lg-sw glyphsw">▲</i>too short → glyph chip</span>`;
  }

  function renderFocus() {
    if (!focusAnim) {
      const cue = CUES[selCue];
      focusEl.innerHTML = cue
        ? `<div class="f-h"><span class="f-tag cue">CUE</span>“${cue.text}”</div>
           <p class="f-note">${cue.anims.length} animation${cue.anims.length>1?'s':''}. Click a strip again to focus & retime it.</p>
           <div class="f-list">${cue.anims.map((a,i)=>`<div class="f-li"><i class="lg-sw t-${a.type}"></i>${TYPES[a.type].label}<span class="f-span">${a.s.toFixed(2)}–${a.e.toFixed(2)}s</span></div>`).join('')}</div>`
        : '<p class="f-note">Select a cue.</p>';
      focusEl.classList.remove('on');
      return;
    }
    const cue = CUES[focusAnim.ci], an = cue.anims[focusAnim.ai];
    focusEl.classList.add('on');
    focusEl.innerHTML = `<div class="f-h"><span class="f-tag anim">ANIMATION</span>${TYPES[an.type].label}</div>
      <p class="f-note">${TYPES[an.type].desc}</p>
      <div class="f-grid">
        <div class="f-row"><span>On cue</span><b>“${cue.text}”</b></div>
        <div class="f-row"><span>Start</span><b class="mono">${an.s.toFixed(2)}s</b></div>
        <div class="f-row"><span>End</span><b class="mono">${an.e.toFixed(2)}s</b></div>
        <div class="f-row"><span>Duration</span><b class="mono">${((an.e-an.s)*1000)|0}ms</b></div>
      </div>
      <p class="f-tip">Drag the strip's left/right edges on the track to retime. Esc to deselect.</p>`;
  }

  // ---- interaction: 1 click select cue, 2nd click on strip focuses anim ----
  board.addEventListener('click', (e) => {
    const strip = e.target.closest('.astrip');
    const cueEl = e.target.closest('.cue');
    if (strip) {
      const ci = +strip.dataset.ci;
      if (strip.dataset.ai === 'over') {        // +N chip → expand stack inline (after selecting the cue)
        if (selCue !== ci) { selCue = ci; focusAnim = null; }
        else { expanded.add(ci); }
        render(); return;
      }
      if (strip.dataset.ai === 'collapse') { expanded.delete(ci); render(); return; }
      const ai = +strip.dataset.ai;
      if (selCue === ci) { focusAnim = { ci, ai }; }     // 2nd click (cue already selected) → focus anim
      else { selCue = ci; focusAnim = null; }            // 1st click → select cue
      render(); return;
    }
    if (cueEl) {
      const ci = +cueEl.dataset.ci;
      if (selCue !== ci) { selCue = ci; focusAnim = null; }
      else { focusAnim = null; }
      render();
    }
  });
  // scrub by clicking the ruler
  board.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.astrip') || e.target.closest('.cue')) return;
    const rect = board.querySelector('.track').getBoundingClientRect();
    t = Math.max(T0, Math.min(T1, (e.clientX - rect.left) / pxPerSec()));
    render();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { focusAnim = null; render(); } });

  // ---- drag handles to retime the focused animation ----
  board.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.h'); if (!h || !focusAnim) return;
    e.stopPropagation();
    const left = h.classList.contains('h-l');
    const an = CUES[focusAnim.ci].anims[focusAnim.ai];
    const move = (ev) => {
      const rect = board.querySelector('.track').getBoundingClientRect();
      const sec = Math.max(T0, Math.min(T1, (ev.clientX - rect.left) / pxPerSec()));
      if (left) an.s = Math.min(sec, an.e - 0.05); else an.e = Math.max(sec, an.s + 0.05);
      render();
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });

  // ---- controls ----
  document.getElementById('zoom').addEventListener('input', (e) => { zoom = +e.target.value; render(); });
  document.getElementById('mute').addEventListener('change', (e) => { muted = e.target.checked; render(); });
  const playBtn = document.getElementById('play');
  playBtn.addEventListener('click', () => {
    playing = !playing; playBtn.textContent = playing ? '❚❚ Pause' : '▶ Play';
    if (playing) { last = performance.now(); raf = requestAnimationFrame(tick); } else cancelAnimationFrame(raf);
  });
  function tick(now) {
    const dt = (now - last) / 1000; last = now;
    t += dt; if (t > T1) t = T0;
    render(); raf = requestAnimationFrame(tick);
  }

  render();
})();
