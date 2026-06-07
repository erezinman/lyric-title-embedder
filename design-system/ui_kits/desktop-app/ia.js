/* Animations IA preview — renders 3 placements with shared chrome + hover explainers. */
(function () {
  // ---- icons ----
  const I = {
    play:'<path d="M5 3l14 9-14 9z"/>', layers:'<path d="M12 2l9 5-9 5-9-5z"/><path d="M3 12l9 5 9-5"/>',
    sliders:'<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    spark:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/>',
    wand:'<path d="M15 4V2M15 10V8M11 6H9M19 6h-2M5 19l9-9M17.5 6.5l1.8 1.8"/>',
    type:'<path d="M4 7V5h16v2M9 19h6M12 5v14"/>', wave:'<path d="M3 12h3l2-7 4 14 3-9 2 4h4"/>',
    chev:'<path d="M9 6l6 6-6 6"/>', x:'<path d="M6 6l12 12M18 6L6 18"/>', gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    bounce:'<path d="M4 16c4-10 12-10 16 0"/><circle cx="12" cy="7" r="2.4"/>', glow:'<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>',
    arrowR:'<path d="M5 12h14M13 6l6 6-6 6"/>',
    ban:'<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>', dot:'<circle cx="12" cy="12" r="3"/>',
  };
  const svg = (k, sz=14, sw=1.8) => `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${I[k]||''}</svg>`;

  // ---- glossary (every jargon term hoverable) ----
  const GLOSS = {
    'Cascade': 'Words/lines enter one after another, staggered along reading order — a rolling wave across the line.',
    'Typewriter': 'Each word (or glyph group) reveals in sequence, like it’s being typed out left-to-right.',
    'Pop': 'A springy overshoot: the cue scales up past 100% then settles — gives a punchy “landing”.',
    'Per cue': 'Timing mode: every cue animates at its own start time.',
    'Per line': 'Timing mode: a whole line animates together, triggered by its first word.',
    'Together': 'Timing mode: all cues in the group animate at one shared moment.',
    'Reverse': 'Cascade order runs last-to-first instead of reading order.',
    'Center-out': 'Cascade radiates from the middle of the line outward to both ends.',
    'Jitter': 'Per-cue start times get a small random offset so the entrance feels organic, not mechanical.',
    'Stagger': 'The delay between each cue’s entrance in a cascade — bigger = slower rolling wave.',
    'Karaoke sweep': 'A left-to-right color fill across each word as it’s sung, anchored to the word’s own start/end — the classic “bouncing-ball” highlight.',
    'Fade': 'Opacity ramps from transparent to solid (and back out) over a set duration.',
    'Color flash': 'The fill color briefly shifts to an accent then returns — a beat-synced emphasis.',
    'Easing': 'The acceleration curve of the motion (e.g. ease-out, spring) — shapes how “mechanical” vs “alive” it reads.',
    'Inherited': 'No override here — the value flows down global → group → cue. Most specific wins.',
  };

  // wrap known terms in hover spans
  function gloss(text) {
    let out = text;
    Object.keys(GLOSS).sort((a,b)=>b.length-a.length).forEach(term => {
      const re = new RegExp('\\b(' + term.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&') + ')\\b');
      out = out.replace(re, `<span class="tip" data-term="$1">$1</span>`);
    });
    return out;
  }

  // ---- the shared animation vocabulary (what's being authored, regardless of IA) ----
  const ANIMS = [
    { ic:'spark', nm:'Fade in', scope:'glob', meta:'inherited', sub:'Default entrance. Opacity ramp.', params:[['dur','250ms'],['Easing','ease-out']] },
    { ic:'bounce', nm:'Pop', scope:'grp', meta:'group override', over:true, sub:'Springy overshoot as the Chorus lands.', params:[['scale','1.18→1.0'],['Easing','spring'],['Stagger','40ms']] },
    { ic:'type', nm:'Typewriter', scope:'cue', meta:'cue override', over:true, sub:'“bleating” reveals glyph-by-glyph.', params:[['Per cue','on'],['speed','22ch/s']] },
    { ic:'wand', nm:'Karaoke sweep', scope:'glob', meta:'inherited', sub:'Left-to-right fill as each word is sung.', params:[['anchor','cue start→end'],['fill','accent']] },
  ];

  function animCard(a, withParams=true) {
    return `<div class="anim ${a.over?'over':'inh'}" data-anim="${a.nm}">
      <div class="anim-top">
        <span class="anim-ic">${svg(a.ic,15)}</span>
        <span class="anim-nm">${gloss(a.nm)}</span>
        <span class="anim-scope ${a.scope}">${a.scope==='cue'?'CUE':a.scope==='grp'?'GROUP':'GLOBAL'}</span>
      </div>
      <div class="anim-sub">${gloss(a.sub)}</div>
      ${withParams?`<div class="anim-params">${a.params.map(p=>`<span class="chip ${a.over?'over':''}">${gloss(p[0])} <b>${p[1]}</b></span>`).join('')}</div>`:''}
    </div>`;
  }

  // ---- preset gallery (entry-style picker, shared) ----
  const PRESETS = [
    { ic:'spark', nm:'Fade', on:false }, { ic:'bounce', nm:'Pop', on:true },
    { ic:'type', nm:'Typewriter', on:false }, { ic:'wand', nm:'Karaoke sweep', on:false },
    { ic:'glow', nm:'Glow', on:false }, { ic:'wave', nm:'Cascade', on:false },
    { ic:'spark', nm:'Color flash', on:false }, { ic:'arrowR', nm:'Slide', on:false },
  ];
  function presetGallery() {
    return `<div class="preset-row" style="grid-template-columns:repeat(4,1fr)">
      ${PRESETS.map(p=>`<div class="preset ${p.on?'on':''}">
        <div class="pv-ic" style="color:${p.on?'var(--accent)':'var(--cyan)'}">${svg(p.ic,22,1.7)}</div>
        <span class="pv-nm">${gloss(p.nm)}<span class="tip qm" data-term="${p.nm}">?</span></span>
      </div>`).join('')}
    </div>`;
  }

  // ---- a compact style-tier block, for rail realism ----
  function styleTier() {
    return `<div class="tier"><div class="tier-h"><span class="ttag cue">CUE</span>“bleating”<span class="tmeta">Verse 1</span></div>
      <div class="tier-body">
        <div class="prow"><span class="pl">Fill</span><span class="pv" style="color:var(--accent)">#FF3DA6</span><span class="psrc">cue</span></div>
        <div class="prow inh"><span class="pl">Size</span><span class="pv">72 px</span><span class="psrc">grp</span></div>
      </div></div>`;
  }

  // ---- chrome ----
  function topbar() {
    return `<div class="topbar">
      <div class="brand"><span class="mk"></span>Karaoke Subtitle Studio<span class="ver">v3</span></div>
      <div class="crumb">Bleating Obsession</div>
      <div class="tb-sp"></div>
      <span class="ai-pill"><span class="ai-dot"></span>AI agent · live</span>
      <button class="btn primary">${svg('play',14)}Export</button>
    </div>`;
  }
  function stage(capHot) {
    const words = ['Caught','in','a','bleating','obsession'];
    return `<div class="center"><div class="stage-pad"><div class="stage">
      <span class="stage-cap-note">1920×1080 · LIVE</span>
      <div class="cap">${words.map((w,i)=>`<span class="w ${i===3&&capHot?'hot':''}">${w} </span>`).join('')}</div>
    </div></div></div>`;
  }
  function lanes(showAnimLane) {
    const cols = showAnimLane ? '1.6fr 1fr 1fr 1fr' : '1.8fr 1fr 1fr';
    const head = showAnimLane
      ? `<span>${svg('layers',12)} LAYOUT · cues</span><span>${svg('spark',12)} FADE-IN</span><span>${svg('spark',12)} FADE-OUT</span><span>${svg('wand',12)} ANIMATION</span>`
      : `<span>${svg('layers',12)} LAYOUT · cues</span><span>${svg('spark',12)} FADE-IN</span><span>${svg('spark',12)} FADE-OUT</span>`;
    const row = (wd, fin, fout, anim, sel) => `<div class="lane-row ${sel?'sel':''}" style="display:grid;grid-template-columns:${cols}">
      <span class="wd">${wd}</span><span class="${fin.inh?'lc-anim inh':''}">${fin.t}</span><span>${fout}</span>
      ${showAnimLane?`<span class="lc-anim ${anim.inh?'inh':''}">${anim.inh?'· inherits':'<span class="mini-ic">'+svg(anim.ic,12)+'</span>'+gloss(anim.nm)}</span>`:''}</div>`;
    return `<div class="dock"><div class="dock-tabs">
        <button class="dock-tab on">${svg('layers',13)} Cue lanes</button>
        <button class="dock-tab">${svg('wave',13)} Timeline</button>
        <span class="dock-hint">${showAnimLane?'Animation lane mirrors fade lanes — grey = inherited':'Animations authored in the rail/modal'}</span>
      </div>
      <div class="lanes"><div class="lane-grid lane-head" style="grid-template-columns:${cols}">${head}</div>
        ${row('Caught',{t:'@0.30 / 250',inh:true},'· none',{nm:'Fade',ic:'spark',inh:true},false)}
        ${row('bleating',{t:'@1.40 / 180',inh:false},'@15.40 / 1000',{nm:'Typewriter',ic:'type',inh:false},true)}
        ${row('obsession',{t:'@2.20 / 180',inh:true},'@15.40 / 1000',{nm:'Pop',ic:'bounce',inh:false},false)}
      </div></div>`;
  }

  // ===== OPTION A: Inspector section (rail, under the style waterfall) =====
  function optionA() {
    return `<div class="shell">${topbar()}
      <div class="body">
        <aside class="rail">
          <div class="rail-tabs"><button class="rail-tab">${svg('sliders',14)}Project</button><button class="rail-tab on">${svg('layers',14)}Inspector</button></div>
          <div class="rail-body">
            ${styleTier()}
            <div class="sec-t spacer cyan">${svg('wand',13)}<span class="di"></span>Animation</div>
            <div class="sec-sub">${gloss('Same global → group → cue waterfall as style. Grey cards are Inherited.')}</div>
            <div class="anim-list">${ANIMS.map(a=>animCard(a)).join('')}</div>
          </div>
        </aside>
        ${stage(false)}
      </div>
      ${lanes(true)}
    </div>`;
  }

  // ===== OPTION B: dedicated Animate rail tab =====
  function optionB() {
    return `<div class="shell">${topbar()}
      <div class="body">
        <aside class="rail">
          <div class="rail-tabs">
            <button class="rail-tab">${svg('sliders',14)}Project</button>
            <button class="rail-tab">${svg('layers',14)}Style</button>
            <button class="rail-tab on">${svg('wand',14)}<span class="tdot"></span>Animate</button>
          </div>
          <div class="rail-body">
            <div class="sec-t cyan">${svg('spark',13)}<span class="di"></span>Preset</div>
            <div class="sec-sub">${gloss('Pick a starting effect — Pop, Cascade, Typewriter, Karaoke sweep. Hover ? for what each does.')}</div>
            ${presetGallery()}
            <div class="sec-t spacer cyan">${svg('gear',13)}<span class="di"></span>This cue · “bleating”</div>
            <div class="anim-list">${ANIMS.slice(1,3).map(a=>animCard(a)).join('')}</div>
          </div>
        </aside>
        ${stage(false)}
      </div>
      ${lanes(true)}
    </div>`;
  }

  // ===== OPTION C: modal / focused dialog =====
  function optionC() {
    return `<div class="shell">${topbar()}
      <div class="body">
        <aside class="rail">
          <div class="rail-tabs"><button class="rail-tab">${svg('sliders',14)}Project</button><button class="rail-tab on">${svg('layers',14)}Inspector</button></div>
          <div class="rail-body">
            ${styleTier()}
            <div class="sec-t spacer cyan">${svg('wand',13)}<span class="di"></span>Animation</div>
            <div class="anim" style="cursor:pointer"><div class="anim-top"><span class="anim-ic">${svg('bounce',15)}</span><span class="anim-nm">${gloss('Pop')}</span><span class="anim-scope grp">GROUP</span></div>
              <div class="anim-sub">Tap to open the animation studio →</div></div>
          </div>
        </aside>
        ${stage(false)}
      </div>
      ${lanes(false)}
      <div class="modal-scrim">
        <div class="modal">
          <div class="modal-h">${svg('wand',16)}<span class="mt">Animate</span>
            <div class="scope-pills"><span class="anim-scope glob">GLOBAL</span><span class="anim-scope grp">GROUP</span><span class="anim-scope cue">CUE</span></div>
            <button class="x">${svg('x',13)}</button></div>
          <div class="modal-body">
            ${presetGallery()}
            <div class="anim-list">${ANIMS.map(a=>animCard(a)).join('')}</div>
          </div>
          <div class="modal-foot"><span class="sp"></span><button class="btn">Cancel</button><button class="btn primary">Apply to GROUP</button></div>
        </div>
      </div>
    </div>`;
  }

  // ===== OPTION D: Option A, redrawn in APPEND style (proposed evolution) =====
  // GLOBAL = full base. GROUP/CUE start empty and append only their overrides,
  // incl. a tombstone for a removed-here inherited animation + an Inherited disclosure.
  function baseCard() {
    return `<div class="tier base"><div class="tier-h"><span class="ttag glob">GLOBAL</span>defaults<span class="tmeta">the complete base</span></div>
      <div class="tier-body">
        <div class="prow"><span class="pl">Fill</span><span class="pv">#FFFFFF</span></div>
        <div class="prow"><span class="pl">Size</span><span class="pv">64 px</span></div>
        <div class="prow"><span class="pl">Bold</span><span class="pv">on</span></div>
        <div class="prow"><span class="pl">Outline</span><span class="pv">3 px · #000</span></div>
        <div class="base-anim">
          <span class="ba-lbl">${svg('wand',11)} Animations</span>
          <span class="anim-pill">${svg('spark',11)}${gloss('Fade')} in</span>
          <span class="anim-pill">${svg('wand',11)}${gloss('Karaoke sweep')}</span>
        </div>
      </div></div>`;
  }
  // an append-style tier: only override rows + tombstones + add affordances + inherited disclosure
  function appendTier(scope, label, meta, rows, inheritedCount) {
    const tag = scope==='cue'?'CUE':scope==='grp'?'GROUP':'GLOBAL';
    return `<div class="tier append ${scope}"><div class="tier-h"><span class="ttag ${scope}">${tag}</span>${label}<span class="tmeta">${meta}</span></div>
      <div class="tier-body">
        ${rows.length ? rows.map(r=>appendRow(r)).join('') : `<div class="empty-row">${gloss('Inherited')} everything from ${scope==='cue'?'group':'global'}</div>`}
        <div class="add-row">
          <button class="add-btn">＋ Add override <span class="caret">▾</span></button>
          <button class="add-btn cyan">＋ Add ${gloss('animation')} <span class="caret">▾</span></button>
        </div>
        <button class="inh-disc">▸ Inherited (${inheritedCount})</button>
      </div></div>`;
  }
  function appendRow(r) {
    if (r.tomb) return `<div class="ov-row tomb"><span class="ov-ic">${svg('ban',13)}</span>
      <span class="ov-main"><b>${gloss(r.nm)}</b> <span class="tomb-lbl">removed here</span></span>
      <button class="ov-act" title="Restore inherited">↺</button></div>`;
    if (r.anim) return `<div class="ov-row anim-ov"><span class="ov-ic cyan">${svg(r.ic,13)}</span>
      <span class="ov-main"><b>${gloss(r.nm)}</b> <span class="ov-sub">${r.sub||''}</span></span>
      <button class="ov-act">✎</button><button class="ov-act">✕</button></div>`;
    return `<div class="ov-row"><span class="ov-ic">${svg('dot',13)}</span>
      <span class="ov-main"><span class="ov-key">${r.nm}</span><b class="ov-val">${r.val}</b></span>
      <button class="ov-act" title="Edit">✎</button><button class="ov-act" title="Revert to inherited">↺</button></div>`;
  }
  function optionD() {
    return `<div class="shell">${topbar()}
      <div class="body">
        <aside class="rail">
          <div class="rail-tabs"><button class="rail-tab">${svg('sliders',14)}Project</button><button class="rail-tab on">${svg('layers',14)}Inspector</button></div>
          <div class="rail-body">
            ${baseCard()}
            ${appendTier('grp','Chorus','appends 1 + 1',[
              {nm:'Size', val:'72 px'},
              {anim:true, ic:'bounce', nm:'Pop', sub:'spring · 40ms stagger'},
              {tomb:true, nm:'Karaoke sweep'},
            ], 7)}
            ${appendTier('cue','“bleating”','appends 1',[
              {anim:true, ic:'type', nm:'Typewriter', sub:'22 ch/s'},
            ], 9)}
          </div>
        </aside>
        ${stage(false)}
      </div>
      ${lanes(true)}
    </div>`;
  }

  const OPTIONS = [
    { tag:'Option A', nm:'Inspector section', rec:true,
      note:'Animation becomes a section in the <b>Inspector rail</b>, directly under the style waterfall — sharing the exact global → group → cue model and the inherit-grey / override-solid language users already learned. Authoring style and motion in one rail keeps the mental model singular. The cue lanes gain a 4th <b>ANIMATION</b> column mirroring the fade lanes.', build:optionA },
    { tag:'Option B', nm:'Dedicated “Animate” tab', rec:false,
      note:'Motion gets its own <b>rail tab</b> beside Project / Style, opening with a preset gallery then per-scope controls. More room for an Advanced disclosure, but it <b>splits</b> style and motion across tabs — you can’t see a cue’s fill and its animation at once, and the waterfall is duplicated.', build:optionB },
    { tag:'Option C', nm:'Focused modal', rec:false,
      note:'An <b>“Animate” button</b> opens a focused dialog with presets + all scopes. Great for a guided, low-clutter moment — but it’s <b>modal</b>: you lose the live preview/lane context while authoring, and it fights the always-live, AI-co-editing nature of the app.', build:optionC },
  ];

  const root = document.getElementById('opts');
  root.innerHTML = OPTIONS.map(o => `<div class="opt">
    <div class="opt-h"><span class="opt-tag">${o.tag}</span><span class="opt-name">${o.nm}</span>
      <span class="opt-rec ${o.rec?'':'meh'}">${o.rec?'◆ recommended':'alternative'}</span></div>
    <div class="opt-note">${o.note}</div>
    ${o.build()}
  </div>`).join('')
  + `<div class="divider"><span>The override model — proposed change</span></div>
     <div class="opt">
       <div class="opt-h"><span class="opt-tag" style="color:var(--cyan);border-color:color-mix(in srgb,var(--cyan) 45%,transparent)">Append style</span>
         <span class="opt-name">Defaults are complete · tiers append overrides</span>
         <span class="opt-rec">◆ proposed</span></div>
       <div class="opt-note">GLOBAL holds the <b>complete</b> set. GROUP and CUE start empty and <b>append only what they change</b> — far less noise than greying out all ten rows per tier, and it scales to animations (an open list). Each override row carries <b>edit ✎</b> and <b>revert ↺</b>; a removed-here inherited animation becomes an explicit <b>tombstone</b> (⊘ “removed here” + restore) so absence still means inherit. <b>＋ Add override</b> lists only not-yet-set props; <b>▸ Inherited (n)</b> reveals the full computed list on demand — clean default, full context one click away.</div>
       ${optionD()}
     </div>`;

  // ---- tooltip engine ----
  const layer = document.getElementById('tip-layer');
  let pop = null;
  function show(el) {
    const term = el.getAttribute('data-term');
    const body = GLOSS[term]; if (!body) return;
    hide();
    pop = document.createElement('div'); pop.className = 'tip-pop';
    pop.innerHTML = `<span class="tp-name">${term}</span>${body}`;
    layer.appendChild(pop);
    const r = el.getBoundingClientRect();
    const pw = Math.min(248, pop.offsetWidth || 248);
    let left = r.left + r.width/2 - pw/2;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    let top = r.top - (pop.offsetHeight) - 10;
    if (top < 8) top = r.bottom + 10;
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    pop.style.setProperty('--ax', (r.left + r.width/2 - left - 5) + 'px');
    requestAnimationFrame(() => pop && pop.classList.add('show'));
  }
  function hide() { if (pop) { pop.remove(); pop = null; } }
  document.addEventListener('mouseover', e => { const t = e.target.closest('.tip'); if (t) show(t); });
  document.addEventListener('mouseout', e => { if (e.target.closest('.tip')) hide(); });
})();
