/* timing-mode.html — renders both picker form factors + step sub-row + Typewriter/Wipe matrix. */
(function () {
  const I = {
    bounce:'<path d="M4 16c4-10 12-10 16 0"/><circle cx="12" cy="7" r="2.4"/>',
    chev:'<path d="M9 6l6 6-6 6"/>', check:'<path d="M5 12l5 5 9-11"/>',
    clock:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    dots:'<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    layers:'<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    // mode glyphs
    percue:'<rect x="4" y="9" width="4" height="6" rx="1"/><rect x="10" y="9" width="4" height="6" rx="1"/><rect x="16" y="9" width="4" height="6" rx="1"/>',
    perline:'<rect x="3" y="6" width="18" height="4" rx="1"/><rect x="3" y="14" width="11" height="4" rx="1"/>',
    together:'<rect x="4" y="5" width="16" height="3" rx="1"/><rect x="4" y="10.5" width="16" height="3" rx="1"/><rect x="4" y="16" width="16" height="3" rx="1"/>',
    cascade:'<path d="M4 6h5M4 11h9M4 16h13"/><path d="M17 13l3 3-3 3"/>',
    typewriter:'<path d="M5 7V5h14v2M9 19h6M12 5v14"/>',
    reverse:'<path d="M20 6h-5M20 11h-9M20 16H7"/><path d="M7 13l-3 3 3 3"/>',
    centerout:'<path d="M12 5v14"/><path d="M10 9L6 12l4 3M14 9l4 3-4 3"/>',
    jitter:'<path d="M3 12h3l2-5 3 9 2-6 2 4h6"/>',
    up:'<path d="M5 13l4 4 10-12"/>', warn:'<path d="M12 9v4M12 17v.3M4 19h16L12 4z"/>',
  };
  const svg = (k, sz=14, sw=1.8) => `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${I[k]||''}</svg>`;

  const GLOSS = {
    'Per cue':'Timing mode — each cue animates at its own start time, independently.',
    'Per line':'Timing mode — a whole line animates as one, triggered by its first word.',
    'Together':'Timing mode — every member animates at one shared moment (the group window).',
    'Cascade':'Timing mode — members enter one after another, staggered by a fixed step. A rolling wave.',
    'Typewriter':'Timing mode — members START one after the next. Any preset can typewrite; it’s about ordering, not the look.',
    'Reverse':'Advanced — cascade/typewriter order runs last → first instead of reading order.',
    'Center-out':'Advanced — the sequence radiates from the middle of the line outward to both ends.',
    'Jitter':'Advanced — each start gets a small random offset so the entrance feels organic, not mechanical.',
    'Wipe in':'Preset — one cue’s glyphs are revealed left-to-right by an animated clip rect (engine \\clip). Acts on a single cue.',
    'Pop':'Preset — a springy scale overshoot as the cue lands.',
    'step':'The delay between each member in a sequence — larger = slower wave. In ms or as a % of the animation’s span.',
    'Step':'The delay between each member in a sequence — larger = slower wave. In ms or as a % of the animation’s span.',
  };
  function gloss(text){let out=text;Object.keys(GLOSS).sort((a,b)=>b.length-a.length).forEach(t=>{const re=new RegExp('(?<![\\w>])('+t.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')+')(?![\\w<])');out=out.replace(re,`<span class="tip" data-term="$1">$1</span>`);});return out;}

  const MODES = [
    {id:'percue', nm:'Per cue', g:'common', tip:'each cue, own time'},
    {id:'perline', nm:'Per line', g:'common', tip:'line fires as one'},
    {id:'together', nm:'Together', g:'common', tip:'all at one moment'},
    {id:'cascade', nm:'Cascade', g:'sequence', tip:'rolling wave, stepped', step:true},
    {id:'typewriter', nm:'Typewriter', g:'sequence', tip:'one after the next', step:true},
    {id:'reverse', nm:'Reverse', g:'advanced', tip:'last → first', step:true},
    {id:'centerout', nm:'Center-out', g:'advanced', tip:'middle → edges', step:true},
    {id:'jitter', nm:'Jitter', g:'advanced', tip:'random offsets', step:true},
  ];
  const byId = id => MODES.find(m=>m.id===id);
  const GRP = {common:'Common', sequence:'Sequence', advanced:'Advanced'};

  // ---- the host animation override row ----
  function rowHTML(s) {
    const m = byId(s.mode);
    const control = s.variant==='dropdown' ? dropdown(s) : segmented(s);
    return `<div class="tm-row" data-state="${s.key}">
      <div class="tm-row-top">
        <span class="tm-row-ic">${svg(s.ic||'bounce',14)}</span>
        <span class="tm-row-nm">${gloss(s.preset||'Pop')}</span>
        <span class="tm-row-sub">${s.sub||'spring · 1.18×'}</span>
        <span class="tm-row-acts">
          <button class="ov-act" title="Revert to inherited">↺</button>
          <button class="ov-act" title="Remove animation">✕</button>
        </span>
      </div>
      <div class="tm-mode-line">
        <span class="ml-lbl">${svg('clock',12)} Timing</span>
        ${control}
      </div>
      ${substep(s)}
    </div>`;
  }
  function dropdown(s) {
    const m = byId(s.mode);
    let body='';
    ['common','sequence','advanced'].forEach(g=>{
      body += `<div class="md-grp">${GRP[g]}</div>`;
      MODES.filter(x=>x.g===g).forEach(x=>{
        const on = x.id===s.mode;
        body += `<div class="md-item ${on?'on':''}" data-pick="${x.id}">
          <span class="mi-ic">${svg(x.id,14,1.7)}</span><span>${x.nm}</span>
          ${on?`<span class="mi-ck">${svg('check',13)}</span>`:`<span class="mi-tip">${x.tip}</span>`}
        </div>`;
      });
    });
    return `<div class="md ${s.open?'open':''}" data-md>
      <button class="md-btn" data-md-btn>
        <span class="mb-ic">${svg(m.id,14,1.7)}</span><span>${m.nm}</span>
        <span class="mb-car">${svg('chev',12)}</span>
      </button>
      <div class="md-pop">${body}</div></div>`;
  }
  function segmented(s) {
    const common = MODES.filter(x=>x.g==='common');           // Per cue · Per line · Together
    const seqOn = byId(s.mode).g!=='common';                  // Cascade/Typewriter/Advanced active
    const seqLabel = seqOn ? byId(s.mode).nm : 'Sequence';
    const segs = common.map(x=>`<button class="seg-b ${x.id===s.mode?'on':''}" data-pick="${x.id}" title="${x.nm} — ${x.tip}">
      <span class="sb-ic">${svg(x.id,15,1.7)}</span><span class="sb-l">${x.nm}</span></button>`).join('');
    return `<div class="seg">${segs}
      <button class="seg-b seq ${seqOn?'on':''}" data-more title="Sequence modes: Cascade · Typewriter · Advanced">
        <span class="sb-ic">${svg(seqOn?byId(s.mode).id:'cascade',15,1.7)}</span><span class="sb-l">${seqLabel} ▾</span></button></div>`;
  }
  function substep(s) {
    const m = byId(s.mode);
    if (!m.step) {
      return `<div class="substep na"><span class="ss-lbl">${svg('cascade',12)} ${gloss('Step')}</span>
        <span class="na-txt">— not used by <b>${m.nm}</b></span></div>`;
    }
    const v = s.unit==='pct' ? s.stepPct : s.stepMs;
    return `<div class="substep"><span class="ss-lbl">${svg('cascade',12)} ${gloss('Step')}</span>
      <span class="stepper"><button data-step="-1">−</button><span class="sv">${v}${s.unit==='pct'?'%':''}</span><button data-step="1">+</button></span>
      <span class="unit"><button class="${s.unit==='ms'?'on':''}" data-unit="ms">ms</button><button class="${s.unit==='pct'?'on':''}" data-unit="pct">%</button></span>
      <span class="ss-wave">${[0,1,2,3,4].map(i=>`<i style="animation-delay:${i*0.12}s"></i>`).join('')}</span></div>`;
  }

  // ---- option section wrapper (mirrors ia.html .opt) ----
  function opt(n, tag, title, sub, bodyHTML) {
    return `<section class="opt">
      <div class="opt-h"><span class="opt-tag">${tag}</span>
        <h2>${title}</h2><p class="opt-sub">${sub}</p></div>
      ${bodyHTML}</section>`;
  }

  function render() {
    const root = document.getElementById('opts');

    // -- Option A: grouped dropdown --
    const a = opt('A','Option A','Grouped dropdown',
      'One compact trigger; the menu groups modes Common · Sequence · Advanced with inline plain-language hints. Scales to any number of modes and keeps the row one line tall.',
      `<div class="tm-stage">
        <div class="rail-frag"><div class="rf-h">${svg('layers',13)} Inspector · selected cue</div>
          <div class="rf-body" id="hostA"></div></div>
        <div class="note-col">
          <h4>Why this</h4>
          <p>The row stays <b>one line</b> until opened, so a cue with several animations stays scannable. Grouping headers (Common / Sequence / Advanced) hide the jargon-heavy modes until wanted, and every item carries a one-glance hint. Hovering a term anywhere shows the full glossary blurb.</p>
          <div class="pro up"><span class="gi">${svg('up',15)}</span><span>Infinitely extensible; advanced modes don’t crowd the common ones.</span></div>
          <div class="pro down"><span class="gi">${svg('warn',15)}</span><span>Mode is hidden behind a click — you can’t compare options at a glance.</span></div>
          <h4>Where <code>step</code> lives</h4>
          <p>It appears as an <b>indented sub-row</b> directly under the control, but only for stepped modes (Cascade / Typewriter / the Advanced three). For unstepped modes the slot shows a dashed “not used” placeholder so the row never jumps height unexpectedly.</p>
        </div>
      </div>`);

    // -- Option B: segmented --
    const b = opt('B','Option B','Segmented + Sequence menu',
      'The three common modes (Per cue · Per line · Together) sit inline as an always-visible segmented switch — the 80% case is one tap, no opening. A fourth <b>Sequence ▾</b> cell holds the staggered modes (Cascade, Typewriter) and the Advanced three, and adopts the active mode’s name when one is chosen.',
      `<div class="tm-stage">
        <div class="rail-frag"><div class="rf-h">${svg('layers',13)} Inspector · selected cue</div>
          <div class="rf-body" id="hostB"></div></div>
        <div class="note-col">
          <h4>Why this</h4>
          <p>The common modes are <b>visible and comparable at a glance</b> — pick in one tap. Building it surfaced a real constraint: <b>five labelled cells don’t fit a 280&nbsp;px rail</b> (they collide). So only the three common modes stay inline; the stepped/advanced modes — which always need the <code>step</code> sub-row anyway — live behind <b>Sequence ▾</b>, which reuses Option A’s grouped menu verbatim and lights up with the chosen mode’s name.</p>
          <div class="pro up"><span class="gi">${svg('up',15)}</span><span>Fastest path for the common case; honest about rail width; advanced modes get a tidy grouped home.</span></div>
          <div class="pro down"><span class="gi">${svg('warn',15)}</span><span>Cascade/Typewriter are one click deeper than Per&nbsp;cue/Per&nbsp;line/Together.</span></div>
          <h4>Where <code>step</code> lives — same answer</h4>
          <p>Identical indented sub-row. The point: <b>step is a property of the mode, not a peer control</b>, so it nests under the mode and only when the mode consumes it. This keeps the “one concept per row” rhythm the Inspector already uses.</p>
          <div class="verdict">Recommendation — <b>Option B</b>. The 80% modes are one tap and glanceable; the jargon-heavy stepped modes live in Option&nbsp;A’s grouped menu (reused verbatim as <b>Sequence ▾</b>), where their hover-explanations and the <code>step</code> control have room to breathe. Best of both, and it fits the real rail.</div>
        </div>
      </div>`);

    // -- step rationale --
    const stepSec = opt('S','Detail','The <code>step</code> sub-row',
      'Decided: <b>step nests under the mode</b> as an indented child, visible only for sequence modes. It is not a sibling control and not a global — it modifies the selected timing mode.',
      `<div class="defaults">
        <div class="dh"><span>Timing mode</span><span>Shows step?</span><span>Reading</span></div>
        <div class="dr"><span class="pn">${svg('percue',13)} Per cue</span><span class="mn">—</span><span>members independent; no inter-member delay to set</span></div>
        <div class="dr"><span class="pn">${svg('together',13)} Together</span><span class="mn">—</span><span>one shared trigger; step is meaningless</span></div>
        <div class="dr"><span class="pn">${svg('cascade',13)} Cascade</span><span class="mn">ms · %</span><span>step = gap between each member’s start</span></div>
        <div class="dr"><span class="pn">${svg('typewriter',13)} Typewriter</span><span class="mn">ms · %</span><span>step = per-character / per-word delay</span></div>
        <div class="dr"><span class="pn">${svg('jitter',13)} Advanced</span><span class="mn">ms · %</span><span>step = base spacing before the random jitter is applied</span></div>
      </div>`);

    // -- typewriter vs wipe --
    const twSec = opt('T','Composition','Typewriter (mode) ≠ Wipe (preset)',
      'The old single “type” effect splits cleanly: <b>Wipe</b> is a per-cue reveal <i>preset</i>; <b>Typewriter</b> is a <i>timing mode</i> that staggers member starts. They’re orthogonal and compose.',
      `<div class="tw-card">
        <div class="tw-grid">
          <div class="tw-cell preset"><span class="tc-k">Preset (the look)</span><h5>${gloss('Wipe in')}</h5>
            <p>One cue’s glyphs revealed L→R by a clip rect. Acts on a <b>single</b> cue.</p>
            <div class="mini-cap wipe"><span class="mw">bleating</span></div></div>
          <div class="tw-op">+</div>
          <div class="tw-cell mode"><span class="tc-k">Timing mode (the order)</span><h5>${gloss('Typewriter')}</h5>
            <p>Members <b>start</b> one after the next. Acts <b>across</b> cues in scope.</p>
            <div class="mini-cap tw"><span class="mw">one</span><span class="mw">word</span><span class="mw">at</span><span class="mw">time</span></div></div>
          <div class="tw-op">=</div>
          <div class="tw-cell result"><span class="tc-k">Composed</span><h5>Per-glyph typewriter</h5>
            <p>Fade preset + Typewriter over a cue’s glyphs = the classic typed-out line.</p>
            <div class="mini-cap both"><span class="mw">typed</span><span class="mw">out</span><span class="mw">live</span></div></div>
        </div>
      </div>`);

    // -- preset → default-mode table --
    const defSec = opt('D','Defaults','Each preset ships a default mode',
      'The picker isn’t a blank choice — adding a preset pre-selects a sensible mode, so the common path needs zero timing fiddling. Users only touch the picker to deviate.',
      `<div class="defaults">
        <div class="dh"><span>Preset</span><span>Default mode</span><span>Rationale</span></div>
        <div class="dr"><span class="pn"><span class="pic">${svg('bounce',13)}</span> Fade / Pop / Glow</span><span class="mn">Per cue</span><span>each word lands on its own beat</span></div>
        <div class="dr"><span class="pn"><span class="pic">${svg('typewriter',13)}</span> Wipe</span><span class="mn">Typewriter</span><span>reveal naturally reads as a sequence</span></div>
        <div class="dr"><span class="pn"><span class="pic">${svg('layers',13)}</span> Slide (group/global)</span><span class="mn">Together</span><span>a block slides as one unit</span></div>
      </div>`);

    root.innerHTML = a + b + stepSec + twSec + defSec;

    // mount the two host rows
    states.A.host = document.getElementById('hostA');
    states.B.host = document.getElementById('hostB');
    paint('A'); paint('B');
  }

  const states = {
    A:{key:'A', variant:'dropdown', mode:'cascade', open:false, unit:'ms', stepMs:80, stepPct:12, preset:'Pop', ic:'bounce', sub:'spring · 1.18×'},
    B:{key:'B', variant:'segmented', mode:'cascade', open:false, unit:'ms', stepMs:80, stepPct:12, preset:'Pop', ic:'bounce', sub:'spring · 1.18×'},
  };
  function paint(k){ const s=states[k]; s.host.innerHTML = rowHTML(s); wire(k); }

  function wire(k){
    const s = states[k];
    const host = s.host;
    // dropdown open/close
    const md = host.querySelector('[data-md]');
    if (md){
      md.querySelector('[data-md-btn]').onclick = (e)=>{ e.stopPropagation(); s.open=!s.open; paint(k); };
    }
    // pick a mode (both variants)
    host.querySelectorAll('[data-pick]').forEach(el=>{
      el.onclick = ()=>{ s.mode = el.getAttribute('data-pick'); s.open=false; paint(k); };
    });
    // segmented "More" → open advanced as a tiny popover by cycling, else open dropdown-like menu
    const more = host.querySelector('[data-more]');
    if (more){
      more.onclick = (e)=>{ e.stopPropagation(); openAdvancedMenu(k, more); };
    }
    // step +/- and unit
    host.querySelectorAll('[data-step]').forEach(b=>{
      b.onclick = ()=>{ const d=+b.getAttribute('data-step');
        if (s.unit==='pct'){ s.stepPct=Math.max(0,Math.min(100,s.stepPct+d*2)); }
        else { s.stepMs=Math.max(0,s.stepMs+d*10); } paint(k); };
    });
    host.querySelectorAll('[data-unit]').forEach(b=>{
      b.onclick = ()=>{ s.unit=b.getAttribute('data-unit'); paint(k); };
    });
  }

  // sequence popover for the segmented "Sequence ▾" cell — lists Sequence + Advanced groups
  function openAdvancedMenu(k, anchor){
    closeAdvancedMenu();
    const s = states[k];
    const pop = document.createElement('div');
    pop.className='adv-pop';
    let html='';
    [['sequence','Sequence'],['advanced','Advanced']].forEach(([g,lbl])=>{
      html += `<div class="md-grp">${lbl}</div>` + MODES.filter(x=>x.g===g).map(x=>`
        <div class="md-item ${x.id===s.mode?'on':''}" data-advpick="${x.id}">
          <span class="mi-ic">${svg(x.id,14,1.7)}</span><span>${x.nm}</span>
          ${x.id===s.mode?`<span class="mi-ck">${svg('check',13)}</span>`:`<span class="mi-tip">${x.tip}</span>`}</div>`).join('');
    });
    pop.innerHTML = html;
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.min(r.left, window.innerWidth-220)+'px';
    pop.style.top = (r.bottom+6)+'px';
    pop.querySelectorAll('[data-advpick]').forEach(el=>{
      el.onclick = ()=>{ s.mode=el.getAttribute('data-advpick'); closeAdvancedMenu(); paint(k); };
    });
    setTimeout(()=>document.addEventListener('click', closeAdvancedMenu, {once:true}),0);
  }
  function closeAdvancedMenu(){ document.querySelectorAll('.adv-pop').forEach(p=>p.remove()); }

  // close dropdowns on outside click
  document.addEventListener('click', (e)=>{
    let changed=false;
    ['A','B'].forEach(k=>{ const s=states[k]; if(s.open && s.host && !s.host.contains(e.target)){ s.open=false; changed=true; if(s.host)paint(k);} });
  });

  // ---- glossary tooltip layer ----
  const layer = document.getElementById('tip-layer');
  document.addEventListener('mouseover', (e)=>{
    const t = e.target.closest('.tip'); if(!t) return;
    const term = t.getAttribute('data-term'); const txt = GLOSS[term]; if(!txt) return;
    layer.innerHTML = `<div class="tip-pop"><span class="tp-name">${term}</span>${txt}</div>`;
    const tip = layer.firstChild; const r=t.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    let left = r.left + r.width/2 - tr.width/2;
    left = Math.max(10, Math.min(left, window.innerWidth - tr.width - 10));
    tip.style.setProperty('--ax', (r.left + r.width/2 - left)+'px');
    tip.style.left = left+'px';
    let top = r.top - tr.height - 9;
    if (top < 8){ top = r.bottom + 9; }
    tip.style.top = top+'px';
    tip.classList.add('show');
  });
  document.addEventListener('mouseout', (e)=>{ if(e.target.closest('.tip')) layer.innerHTML=''; });

  render();
})();
