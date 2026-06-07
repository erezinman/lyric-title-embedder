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
        { type:'alpha', s:0.30, e:0.62, dir:'in', src:'global', sid:'fadein' } ] },
    { text: 'in a', s: 0.80, e: 1.35, gi: 0, anims: [
        { type:'type', s:0.80, e:1.20 } ] },
    { text: 'bleating', s: 1.40, e: 2.55, gi: 0, anims: [
        { type:'alpha', s:1.40, e:1.66, dir:'in', src:'global', sid:'fadein' },
        { type:'color', s:1.55, e:2.30, from:'#FFFFFF', to:'#FF3DA6', src:'group', sid:'v1color' },
        { type:'size',  s:1.42, e:1.74 } ] },                         // stacked: 3 anims
    { text: 'obsession', s: 2.70, e: 4.10, gi: 0, anims: [
        { type:'alpha', s:2.70, e:2.96, dir:'in', src:'global', sid:'fadein' },
        { type:'color', s:2.78, e:3.90, from:'#FFFFFF', to:'#FF3DA6', src:'group', sid:'v1color' },
        { type:'glow',  s:3.40, e:4.10 },
        { type:'size',  s:2.72, e:3.00 } ] },                         // 4 anims → 2 bars + "+2"
    { text: 'Tangled', s: 4.40, e: 5.40, gi: 1, anims: [
        { type:'move', s:4.40, e:4.74, dir:'up' },
        { type:'size', s:4.62, e:4.74 } ] },                          // tiny pop → glyph chip
    { text: 'up in', s: 5.10, e: 6.00, gi: 1, anims: [
        { type:'type', s:5.10, e:5.62 } ] },
    { text: 'wool', s: 6.05, e: 7.10, gi: 1, anims: [
        { type:'alpha', s:6.60, e:7.10, dir:'out', src:'global', sid:'fadein' } ] },
  ];

  let zoom = 1, t = 0, playing = false, raf = null, last = 0;
  let selCue = 2, focusAnim = null; // {ci, ai}
  let muted = true;
  let magnet = true, snapGuide = null, didDrag = false; // timeline snapping
  let hoverSid = '';                 // hovered shared-animation source (group/global)
  let expanded = new Set();          // cue indices whose +N stack is expanded inline
  const MIN_PX = 26;  // below this width → glyph chip ("not to scale"); scales with h-zoom
  const MAX_BARS = 3; // max stacked bars per cue (no vertical zoom → fixed); rest collapse to +N

  const board = document.getElementById('board');
  const focusEl = document.getElementById('focus');
  const readEl = document.getElementById('read');

  const pxPerSec = () => 150 * zoom;
  const xOf = (sec) => (sec - T0) * pxPerSec();
  const wOf = (a, b) => (b - a) * pxPerSec();

  // ---- snapping: edges magnetize to cue edges, OTHER strips' edges, the
  // playhead, and the window ends. Strips are both snappable and snapped-to. ----
  const SNAP_PX = 8;
  const REVEAL_PX = 40;
  function snapCandidates(ci, ai, includePlayhead = true) {
    const c = [{ t: T0, kind: 'edge' }, { t: T1, kind: 'edge' }];
    if (includePlayhead) c.push({ t, kind: 'playhead' });
    CUES.forEach((cue, ci2) => {
      c.push({ t: cue.s, kind: 'cue' }, { t: cue.e, kind: 'cue' });
      cue.anims.forEach((a, ai2) => {
        if (ci2 === ci && ai2 === ai) return;
        c.push({ t: a.s, kind: 'anim' }, { t: a.e, kind: 'anim' });
      });
    });
    return c;
  }
  function snapSec(val, cand, enabled) {
    if (!enabled) return { val, hit: null };
    const tol = SNAP_PX / pxPerSec();
    let hit = null, best = tol + 1e-9;
    for (const c of cand) { const d = Math.abs(c.t - val); if (d <= best) { best = d; hit = c; } }
    return hit ? { val: hit.t, hit } : { val, hit: null };
  }
  // candidate guides within reveal range of any dragged edge (soft preview)
  function nearLines(edges, cand) {
    const reveal = REVEAL_PX / pxPerSec(), seen = new Set(), out = [];
    for (const c of cand) {
      let d = Infinity; for (const v of edges) d = Math.min(d, Math.abs(c.t - v));
      if (d > reveal) continue;
      const k = c.t.toFixed(4); if (seen.has(k)) continue; seen.add(k);
      out.push({ t: c.t, kind: c.kind, strength: Math.max(0, 1 - d / reveal) });
    }
    return out;
  }

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
    ruler += `<div class="playhead" style="left:${xOf(t)}px"><i class="ph-hit"></i><i class="ph-head"></i></div></div>`;

    let rows = '';
    // a group/global animation renders an instance per cue; hovering/selecting one
    // lights up every other in-view instance that shares the same source id.
    const selA = focusAnim ? CUES[focusAnim.ci].anims[focusAnim.ai] : null;
    const selSid = selA && (selA.src === 'group' || selA.src === 'global') ? selA.sid : '';
    const isLinked = (an) => !!(an.sid && (an.sid === hoverSid || an.sid === selSid));
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
        const linked = isLinked(an);
        const top = (100 - BAND) + (ai * slotH);
        if (tiny) {
          return `<button class="astrip glyph ${focused?'foc':''} ${linked?'linked':''}" data-ci="${ci}" data-ai="${ai}" data-sid="${an.sid||''}"
            style="left:${aL}px; top:${top}%; height:${slotH}%;" title="${TYPES[an.type].label} · ${(an.e-an.s).toFixed(2)}s${an.src&&an.src!=='cue'?' · '+an.src:''} (zoom in to expand)">
            <i class="g-ic">${typeGlyph(an.type)}</i></button>`;
        }
        return `<button class="astrip ${focused?'foc':''} ${linked?'linked':''}" data-ci="${ci}" data-ai="${ai}" data-sid="${an.sid||''}"
          style="left:${aL}px; width:${aW}px; top:${top}%; height:${slotH}%; ${stripStyle(an, cue)}"
          title="${TYPES[an.type].label} · ${an.s.toFixed(2)}–${an.e.toFixed(2)}s${an.src&&an.src!=='cue'?' · '+an.src+' source':''}">
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
        const overLinked = hidden.some(a => isLinked(a));
        stripsArr.push(`<button class="astrip overflow ${overLinked?'linked':''}" data-ci="${ci}" data-ai="over"
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

    let guideHtml = '';
    if (snapGuide) {
      const hit = snapGuide.hit;
      (snapGuide.near || []).forEach(n => {
        if (hit && Math.abs(n.t - hit.t) < 1e-3) return;
        guideHtml += `<div class="snap-guide near" style="left:${xOf(n.t)}px;opacity:${(0.15 + n.strength * 0.45).toFixed(3)}"></div>`;
      });
      if (hit) guideHtml += `<div class="snap-guide ${hit.kind === 'playhead' ? 'k-playhead' : ''}" style="left:${xOf(hit.t)}px"><span class="sg-tag">${hit.t.toFixed(2)}s</span></div>`;
    }
    board.innerHTML = ruler + `<div class="track" style="width:${trackW}px">${rows}${guideHtml}<div class="playhead track-ph" style="left:${xOf(t)}px"><i class="ph-hit"></i></div></div>`;
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
    const shared = an.src === 'group' || an.src === 'global';
    const inst = shared ? CUES.reduce((n, c) => n + c.anims.filter(a => a.sid === an.sid).length, 0) : 0;
    focusEl.innerHTML = `<div class="f-h"><span class="f-tag anim">ANIMATION</span>${TYPES[an.type].label}</div>
      <p class="f-note">${TYPES[an.type].desc}</p>
      <div class="f-grid">
        <div class="f-row"><span>On cue</span><b>“${cue.text}”</b></div>
        ${shared ? `<div class="f-row"><span>Source</span><b class="src-${an.src}">${an.src} · ${inst} cues</b></div>` : ''}
        <div class="f-row"><span>Start</span><b class="mono">${an.s.toFixed(2)}s</b></div>
        <div class="f-row"><span>End</span><b class="mono">${an.e.toFixed(2)}s</b></div>
        <div class="f-row"><span>Duration</span><b class="mono">${((an.e-an.s)*1000)|0}ms</b></div>
      </div>
      <p class="f-tip">${shared ? `This is a <b>${an.src}</b> animation — it appears on ${inst} cues; editing the source changes them together. ` : ''}Drag the strip (or its edges) to retime — it snaps to cue edges, other strips & the playhead. Hold <b>Alt</b> to free it. Esc to deselect.</p>`;
  }

  // ---- interaction: 1 click select cue, 2nd click on strip focuses anim ----
  board.addEventListener('click', (e) => {
    if (didDrag) { didDrag = false; return; }   // a drag just happened — don't re-select
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
  // suppress text selection during any timeline drag
  board.addEventListener('pointerdown', () => {
    document.body.classList.add('tl-drag');
    const clear = () => { document.body.classList.remove('tl-drag'); window.removeEventListener('pointerup', clear); };
    window.addEventListener('pointerup', clear);
  });

  // hover-link: highlight every in-view instance of a shared (group/global) animation
  board.addEventListener('mouseover', (e) => {
    const strip = e.target.closest('.astrip');
    const sid = strip ? (strip.dataset.sid || '') : '';
    if (sid !== hoverSid) { hoverSid = sid; render(); }
  });
  board.addEventListener('mouseleave', () => { if (hoverSid) { hoverSid = ''; render(); } });

  // scrub by dragging the ruler / track background OR the playhead itself
  board.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.astrip') || e.target.closest('.cue')) return;
    const rect = board.querySelector('.track').getBoundingClientRect();
    const scrub = (ev) => {
      const raw = Math.max(T0, Math.min(T1, (ev.clientX - rect.left) / pxPerSec()));
      const enabled = magnet !== ev.altKey;                       // Alt inverts
      const cand = snapCandidates(-1, -1, false);                 // don't snap to self
      const sn = snapSec(raw, cand, enabled);
      t = sn.val;
      snapGuide = enabled ? { hit: sn.hit ? { t: sn.hit.t, kind: sn.hit.kind } : null, near: nearLines([raw], cand) } : null;
      render();
    };
    scrub(e);
    const up = () => { window.removeEventListener('pointermove', scrub); window.removeEventListener('pointerup', up); snapGuide = null; render(); };
    window.addEventListener('pointermove', scrub); window.addEventListener('pointerup', up);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { focusAnim = null; render(); } });

  // ---- drag the focused strip's BODY to move it (both edges, snapped) ----
  board.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.h')) return;
    const strip = e.target.closest('.astrip'); if (!strip) return;
    if (strip.dataset.ai === 'over' || strip.dataset.ai === 'collapse') return;
    const ci = +strip.dataset.ci, ai = +strip.dataset.ai;
    if (!(focusAnim && focusAnim.ci === ci && focusAnim.ai === ai)) return; // only the focused strip moves
    e.stopPropagation();
    const an = CUES[ci].anims[ai];
    const startX = e.clientX, origS = an.s, origE = an.e;
    let moved = false;
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientX - startX) < 3) return;
      moved = true; didDrag = true;
      const d = (ev.clientX - startX) / pxPerSec();
      const enabled = magnet !== ev.altKey;
      const cand = snapCandidates(ci, ai);
      const rawS = origS + d, rawE = origE + d;
      const a = snapSec(rawS, cand, enabled), b = snapSec(rawE, cand, enabled);
      const da = a.hit ? Math.abs(a.val - rawS) : Infinity, db = b.hit ? Math.abs(b.val - rawE) : Infinity;
      let corr = 0, guide = null;
      if (a.hit && da <= db) { corr = a.val - rawS; guide = { t: a.val, kind: a.hit.kind }; }
      else if (b.hit) { corr = b.val - rawE; guide = { t: b.val, kind: b.hit.kind }; }
      let ns = rawS + corr, ne = rawE + corr;
      if (ns < T0) { ne += T0 - ns; ns = T0; guide = { t: T0, kind: 'edge' }; }
      if (ne > T1) { ns -= ne - T1; ne = T1; guide = { t: T1, kind: 'edge' }; }
      an.s = ns; an.e = ne; snapGuide = enabled ? { hit: guide, near: nearLines([rawS, rawE], cand) } : null; render();
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); snapGuide = null; render(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });

  // ---- drag handles to retime the focused animation (snapped) ----
  board.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.h'); if (!h || !focusAnim) return;
    e.stopPropagation();
    const left = h.classList.contains('h-l');
    const an = CUES[focusAnim.ci].anims[focusAnim.ai];
    const move = (ev) => {
      const rect = board.querySelector('.track').getBoundingClientRect();
      const raw = Math.max(T0, Math.min(T1, (ev.clientX - rect.left) / pxPerSec()));
      const enabled = magnet !== ev.altKey;
      const cand = snapCandidates(focusAnim.ci, focusAnim.ai);
      const sn = snapSec(raw, cand, enabled);
      if (left) an.s = Math.min(sn.val, an.e - 0.05); else an.e = Math.max(sn.val, an.s + 0.05);
      snapGuide = enabled ? { hit: sn.hit ? { t: sn.hit.t, kind: sn.hit.kind } : null, near: nearLines([raw], cand) } : null;
      didDrag = true; render();
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); snapGuide = null; render(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });

  // ---- controls ----
  document.getElementById('zoom').addEventListener('input', (e) => {
    // zoom around the current time: keep the playhead pinned to its on-screen x
    const vw = board.clientWidth;
    let anchor = xOf(t) - board.scrollLeft;          // playhead's current screen x
    if (anchor < 0 || anchor > vw) anchor = vw / 2;  // off-screen → pull to center
    zoom = +e.target.value;
    render();
    void board.scrollWidth;                          // force reflow so the new width lays out
    board.scrollLeft = Math.max(0, xOf(t) - anchor); // re-pin after re-render
  });
  document.getElementById('mute').addEventListener('change', (e) => { muted = e.target.checked; render(); });
  const magBtn = document.getElementById('magnet');
  magBtn.addEventListener('click', () => { magnet = !magnet; magBtn.classList.toggle('on', magnet); magBtn.textContent = magnet ? '⊙ Magnet · on' : '⊙ Magnet · off'; });
  // Alt momentarily inverts snapping — tint the toggle while it's held
  document.addEventListener('keydown', (e) => { if (e.key === 'Alt' || e.altKey) magBtn.classList.add('alt'); });
  document.addEventListener('keyup', (e) => { if (e.key === 'Alt' || !e.altKey) magBtn.classList.remove('alt'); });
  window.addEventListener('blur', () => magBtn.classList.remove('alt'));
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
