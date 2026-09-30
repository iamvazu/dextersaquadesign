/* =========================================================================
   Dexter's Aqua Designs — the living layer around scroll-world's engine.
   - probes which film clips exist, then mounts the scrub engine
   - a WebGL water backdrop (caustics + light shafts) whose palette follows the journey
   - drifting motes: bubbles underwater, pollen above the waterline
   - specimen windows + an instrument readout for scenes that have no clip yet
   - optional ambient sound, the ecosystem diagram, contact helpers
   ========================================================================= */
(function () {
  const D = window.DAD, S = D.sections, N = S.length;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const isMobile = () => coarse || innerWidth <= 860;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const hex = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255); };

  /* ---------- 1. which clips exist? ---------- */
  function probe(url) {
    if (!url || location.protocol === 'file:') return Promise.resolve(false);
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 3000);
    return fetch(url, { method: 'HEAD', signal: ac.signal, cache: 'no-store' })
      .then(r => r.ok && !/text\/html/.test(r.headers.get('content-type') || ''))
      .catch(() => false).finally(() => clearTimeout(t));
  }
  const hasFilm = new Array(N).fill(false);

  Promise.all(S.map((s, i) => Promise.all([probe(s.clip), probe(s.clipMobile)]).then(([a, m]) => {
    hasFilm[i] = a; s._m = m;
  }))).then(mount);

  /* ---------- 2. mount the engine ---------- */
  let seg = [];            // [{start,end}] in px, mirrors the engine's layout (no connectors)
  function mount() {
    const world = document.getElementById('world');
    mountScrollWorld(world, {
      brand: { name: 'Dexter’s Aqua Designs', href: '#top' },
      cta: { label: 'Start a project', href: '#contact' },
      hint: 'Scroll to follow the water',
      nav: true, atmosphere: false,
      diveScroll: 1.4, crossfade: 0.08,
      sections: S.map((s, i) => ({
        id: s.id, label: s.label, accent: s.accent, scroll: s.scroll, linger: s.linger,
        still: s.still || '',
        clip: hasFilm[i] ? s.clip : null,
        clipMobile: hasFilm[i] && s._m ? s.clipMobile : null,
        eyebrow: s.eyebrow, title: s.title.replace(/<[^>]+>/g, ''), body: s.body, tags: s.tags, cta: s.cta
      })),
      connectors: []
    });
    // titles carry an italic accent phrase
    world.querySelectorAll('.sw-copy__title').forEach((h, i) => { h.innerHTML = S[i].title; });
    const nm = world.querySelector('.sw-brand__name');
    if (nm) nm.innerHTML = "Dexter's Aqua Designs";

    // header sound toggle grouped with CTA on right
    const top = world.querySelector('.sw-topbar'), cta = world.querySelector('.sw-topcta');
    const rightControls = document.createElement('div'); rightControls.className = 'aq-top-right';
    const soundBtn = document.createElement('button');
    soundBtn.className = 'aq-sound';
    soundBtn.type = 'button';
    soundBtn.setAttribute('aria-pressed', 'false');
    soundBtn.setAttribute('aria-label', 'Toggle ambient sound');
    soundBtn.innerHTML = `
      <svg class="icon-sound-off" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <line x1="23" y1="9" x2="17" y2="15"></line>
        <line x1="17" y1="9" x2="23" y2="15"></line>
      </svg>
      <svg class="icon-sound-on" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
      </svg>
    `;
    soundBtn.addEventListener('click', toggleSound);

    if (cta && cta.parentNode) {
      top.appendChild(rightControls);
      rightControls.appendChild(soundBtn);
      rightControls.appendChild(cta);
    }

    buildPortals(); layout(); onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', () => { layout(); onScroll(); });
    document.documentElement.classList.toggle('aq-has-film', hasFilm.some(Boolean));
  }

  function layout() {
    const vh = innerHeight; let off = 0;
    seg = S.map(s => { const w = s.scroll || 1.4; const r = { start: off * vh, end: (off + w) * vh }; off += w; return r; });
    D.filmEnd = off * vh;
  }

  /* ---------- 3. scroll state ---------- */
  const state = { f: 0, i: 0, local: 0, sky: null, after: 0 };
  function onScroll() {
    const y = scrollY; let i = 0;
    for (let k = 0; k < N; k++) if (y >= seg[k].start) i = k;
    const local = clamp((y - seg[i].start) / (seg[i].end - seg[i].start));
    state.i = i; state.local = local;
    // palette: hold the scene, blend into the next over the last third
    const j = Math.min(N - 1, i + 1), t = i === N - 1 ? 0 : smooth((local - 0.62) / 0.38);
    const a = S[i].sky, b = S[j].sky;
    state.sky = {
      top: hex(a.top).map((v, k) => lerp(v, hex(b.top)[k], t)),
      bot: hex(a.bot).map((v, k) => lerp(v, hex(b.bot)[k], t)),
      ray: hex(a.ray).map((v, k) => lerp(v, hex(b.ray)[k], t)),
      water: lerp(a.water, b.water, t), rays: lerp(a.rays, b.rays, t)
    };
    state.after = clamp((y - D.filmEnd) / innerHeight);   // 1 once the studio pages cover the film
    document.documentElement.classList.toggle('aq-after', state.after > 0.9);
    updatePortals(y); updateHud(); updateSound();
  }

  /* ---------- 4. specimen windows ---------- */
  const portals = [];
  function buildPortals() {
    const host = document.getElementById('aq-portals');
    S.forEach((s, i) => {
      const p = document.createElement('figure');
      p.style.margin = '0';
      p.style.setProperty('--glow', s.accent);
      if (s.portal === 'logo') {
        p.className = 'aq-portal aq-portal--logo';
        p.innerHTML = '<div class="aq-logo"><img src="assets/img/logo.webp" alt=""></div>';
      } else {
        p.className = 'aq-portal';
        if (s.ar) p.style.setProperty('--ar', s.ar);
        if (s.w) p.style.setProperty('--w', s.w);
        p.innerHTML = `<div class="aq-portal__glass"><img src="${s.portal}" alt="" decoding="async"></div>` +
          `<div class="aq-portal__reflect"><img src="${s.portal}" alt=""></div>` +
          `<figcaption class="aq-portal__cap"><span>Fig. ${String(i + 1).padStart(2, '0')}</span><b>${s.fig}</b></figcaption>`;
      }
      host.appendChild(p); portals.push(p);
    });
  }
  function updatePortals(y) {
    portals.forEach((p, i) => {
      if (hasFilm[i]) { p.style.opacity = 0; return; }
      const s = seg[i], pr = clamp((y - s.start) / (s.end - s.start)), before = y < s.start, after = y > s.end;
      let op;
      if (i === 0) op = after ? 0 : smooth(1 - (pr - 0.35) / 0.4);
      else if (i === N - 1) op = before ? 0 : smooth(pr / 0.3) * (1 - state.after);
      else op = (before || after) ? 0 : smooth((0.5 - Math.abs(pr - 0.5)) / 0.2);
      p.style.opacity = op.toFixed(3);
      if (op <= 0.001) return;
      const sc = reduce ? 1 : 0.9 + pr * 0.16, dy = reduce ? 0 : (0.5 - pr) * 6;
      const m = isMobile() ? 0 : 1;
      p.style.transform = `translate(-50%, calc(-50% + ${dy}vh)) scale(${sc.toFixed(3)}) rotate(${m * (0.5 - pr) * 1.2}deg)`;
      p.style.filter = op < 0.98 && !coarse ? `blur(${((1 - op) * 8).toFixed(1)}px)` : 'none';
      p.style.setProperty('--kb', (1.04 + pr * 0.1).toFixed(3));
    });
  }

  /* ---------- 5. instrument readout ---------- */
  const hud = document.getElementById('aq-hud'); let hudI = -1;
  function updateHud() {
    hud.style.opacity = (1 - state.after) * (scrollY < innerHeight * 0.1 && state.i === 0 ? 0.0 : 1);
    if (state.i === hudI) return; hudI = state.i;
    const s = S[hudI];
    hud.style.setProperty('--sw-accent', s.accent);
    hud.innerHTML = `<i class="dot"></i><span><b>${String(hudI + 1).padStart(2, '0')}</b> ${s.label}</span>` + s.reading.map(r => `<span>${r}</span>`).join('');
  }

  /* ---------- 6. WebGL water ---------- */
  const cv = document.getElementById('aq-water');
  const gl = cv.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false });
  let prog, U = {};
  const FRAG = `
precision highp float;
uniform vec2 R; uniform float T; uniform vec3 cTop, cBot, cRay; uniform float uWater, uRays;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float caustic(vec2 uv,float t){
  vec2 p=mod(uv*6.28318,6.28318)-250.; vec2 i=p; float c=1.; float k=.005;
  for(int n=0;n<5;n++){float tt=t*(1.-(3.5/float(n+1)));
    i=p+vec2(cos(tt-i.x)+sin(tt+i.y),sin(tt-i.y)+cos(tt+i.x));
    c+=1./length(vec2(p.x/(sin(i.x+tt)/k),p.y/(cos(i.y+tt)/k)));}
  c/=5.; c=1.17-pow(c,1.4); return pow(abs(c),8.);
}
void main(){
  vec2 uv=gl_FragCoord.xy/R; float asp=R.x/R.y;
  vec3 col=mix(cBot,cTop,pow(uv.y,1.35));
  // light shafts fanning down from above the surface
  vec2 o=vec2(.62,1.35); vec2 d=vec2((uv.x-o.x)*asp,uv.y-o.y);
  float a=atan(d.x,-d.y);
  float s=.5+.5*sin(a*19.+T*.21)*sin(a*7.3-T*.13+1.7);
  s=pow(s,3.)*smoothstep(1.45,.1,length(d))*smoothstep(-.1,.8,uv.y);
  col+=cRay*s*.42*uRays;
  // caustic net, stronger near the surface
  vec2 cuv=vec2(uv.x*asp,uv.y)*.9;
  float c=caustic(cuv+vec2(0.,T*.01),T*.35);
  col+=cRay*c*(.08+.32*smoothstep(.05,1.,uv.y))*uWater;
  // surface shimmer band when we are near a waterline
  float band=smoothstep(.82,1.,uv.y)*(1.-abs(uWater-.5)*2.);
  col+=cRay*band*.12*(.5+.5*sin(uv.x*40.+T*1.3));
  // above water: soft haze and bloom
  col=mix(col,col+cRay*.05*(1.-uv.y),1.-uWater);
  // vignette + grain
  float v=smoothstep(1.25,.35,length((uv-.5)*vec2(asp*.8,1.)));
  col*=mix(.45,1.,v);
  col+=(h(uv*R+T)-.5)*.022;
  gl_FragColor=vec4(col,1.);
}`;
  const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  function initGL() {
    if (!gl) return false;
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const v = sh(gl.VERTEX_SHADER, VERT), f = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!v || !f) return false;
    prog = gl.createProgram(); gl.attachShader(prog, v); gl.attachShader(prog, f); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ['R', 'T', 'cTop', 'cBot', 'cRay', 'uWater', 'uRays'].forEach(n => U[n] = gl.getUniformLocation(prog, n));
    return true;
  }
  const glOK = initGL();
  if (!glOK) document.getElementById('aq-sky').style.background = 'radial-gradient(120% 90% at 60% 0%, #136a64, #020a09 70%)';
  function sizeGL() {
    const scale = isMobile() ? 0.4 : 0.55, w = Math.min(1100, Math.round(innerWidth * scale)), hgt = Math.round(w * innerHeight / innerWidth);
    cv.width = w; cv.height = hgt; if (glOK) gl.viewport(0, 0, w, hgt);
  }

  /* ---------- 7. motes: bubbles below the waterline, pollen above ---------- */
  const mc = document.getElementById('aq-motes'), mx = mc.getContext('2d');
  let motes = [];
  function sizeMotes() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    mc.width = innerWidth * dpr; mc.height = innerHeight * dpr; mx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = reduce ? 0 : (isMobile() ? 34 : 80);
    motes = Array.from({ length: n }, (_, k) => ({
      x: Math.random() * innerWidth, y: Math.random() * innerHeight,
      r: k % 7 === 0 ? 2 + Math.random() * 4 : 0.6 + Math.random() * 1.6,
      bubble: k % 7 === 0, sp: 0.15 + Math.random() * 0.5, ph: Math.random() * 6.28, z: 0.3 + Math.random() * 0.7
    }));
  }
  let lastY = scrollY;
  function drawMotes(t) {
    const W = innerWidth, H = innerHeight, sky = state.sky; if (!sky) return;
    mx.clearRect(0, 0, W, H);
    const dy = (scrollY - lastY); lastY = scrollY;
    const water = sky.water, ray = sky.ray.map(v => Math.round(v * 255));
    for (const m of motes) {
      const rise = m.bubble ? m.sp * 2.4 * water + 0.1 : m.sp * (0.25 + 0.3 * (1 - water));
      m.y -= rise + dy * 0.12 * m.z;
      m.x += Math.sin(t * 0.0006 * (1 + m.z) + m.ph) * (m.bubble ? 0.5 : 0.25) + (1 - water) * 0.12 * m.z;
      if (m.y < -10) { m.y = H + 10; m.x = Math.random() * W; }
      if (m.y > H + 12) { m.y = -8; m.x = Math.random() * W; }
      if (m.x > W + 10) m.x = -10;
      if (m.bubble) {
        const a = 0.55 * water * m.z; if (a < 0.02) continue;
        mx.beginPath(); mx.arc(m.x, m.y, m.r, 0, 6.2832);
        mx.strokeStyle = `rgba(${ray[0]},${ray[1]},${ray[2]},${a})`; mx.lineWidth = 0.8; mx.stroke();
        mx.beginPath(); mx.arc(m.x - m.r * 0.35, m.y - m.r * 0.35, m.r * 0.28, 0, 6.2832);
        mx.fillStyle = `rgba(255,255,255,${a})`; mx.fill();
      } else {
        const tw = 0.5 + 0.5 * Math.sin(t * 0.002 * m.sp + m.ph);
        const a = (0.18 + 0.4 * (1 - water) * tw) * m.z;
        const g = mx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * (3 + 3 * (1 - water)));
        g.addColorStop(0, `rgba(${ray[0]},${ray[1]},${ray[2]},${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        mx.fillStyle = g; mx.beginPath(); mx.arc(m.x, m.y, m.r * (3 + 3 * (1 - water)), 0, 6.2832); mx.fill();
      }
    }
  }

  function covered() {
    // everything behind the film is hidden when the studio pages are up,
    // or when the current and next scenes both have real footage playing
    if (state.after >= 1) return true;
    const i = state.i, j = Math.min(N - 1, i + 1);
    return hasFilm[i] && hasFilm[j] && state.local > 0.02 && state.local < 0.98;
  }
  const t0 = performance.now();
  function frame(now) {
    if (state.sky && !covered()) {
      const t = (now - t0) / 1000;
      if (glOK) {
        gl.uniform2f(U.R, cv.width, cv.height); gl.uniform1f(U.T, reduce ? 12 : t);
        gl.uniform3fv(U.cTop, state.sky.top); gl.uniform3fv(U.cBot, state.sky.bot); gl.uniform3fv(U.cRay, state.sky.ray);
        gl.uniform1f(U.uWater, state.sky.water); gl.uniform1f(U.uRays, state.sky.rays);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      drawMotes(now);
    }
    if (!reduce) requestAnimationFrame(frame);
  }
  function resize() { sizeGL(); sizeMotes(); }
  resize(); addEventListener('resize', resize);
  // start once the first scroll state exists
  (function wait() { if (state.sky) { reduce ? frame(performance.now()) : requestAnimationFrame(frame); } else setTimeout(wait, 30); })();
  if (reduce) addEventListener('scroll', () => requestAnimationFrame(frame), { passive: true });

  /* ---------- 8. ambient sound (starts only from the button) ---------- */
  let ac = null, gA, gB, master, bubbleTimer = null;
  function buildAudio() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const len = ac.sampleRate * 4, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
    const white = ac.createBuffer(1, len, ac.sampleRate), wd = white.getChannelData(0);
    for (let i = 0; i < len; i++) wd[i] = Math.random() * 2 - 1;
    master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
    // underwater hush
    const nA = ac.createBufferSource(); nA.buffer = buf; nA.loop = true;
    const lpA = ac.createBiquadFilter(); lpA.type = 'lowpass'; lpA.frequency.value = 340; lpA.Q.value = 0.8;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.07; const lfoG = ac.createGain(); lfoG.gain.value = 140;
    lfo.connect(lfoG); lfoG.connect(lpA.frequency); lfo.start();
    gA = ac.createGain(); nA.connect(lpA); lpA.connect(gA); gA.connect(master); nA.start();
    // moving water in air
    const nB = ac.createBufferSource(); nB.buffer = white; nB.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.5;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    const lfo2 = ac.createOscillator(); lfo2.frequency.value = 0.23; const l2g = ac.createGain(); l2g.gain.value = 300;
    lfo2.connect(l2g); l2g.connect(bp.frequency); lfo2.start();
    gB = ac.createGain(); nB.connect(bp); bp.connect(lp); lp.connect(gB); gB.connect(master); nB.start();
  }
  function bubble() {
    if (!ac || !state.sky) return;
    if (Math.random() < state.sky.water) {
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime, f = 280 + Math.random() * 500;
      o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 2.6, t + 0.09);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.16);
    }
    bubbleTimer = setTimeout(bubble, 300 + Math.random() * 1800);
  }
  function updateSound() {
    if (!ac || !state.sky) return;
    const w = state.sky.water, t = ac.currentTime, fall = S[state.i].id === 'waterfall' ? 0.25 : 0;
    gA.gain.setTargetAtTime(0.9 * w * (1 - state.after * 0.7), t, 0.4);
    gB.gain.setTargetAtTime((0.1 + 0.3 * (1 - w) + fall) * (1 - state.after * 0.7), t, 0.4);
  }
  function toggleSound(e) {
    const btn = e.currentTarget, on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', on);
    try {
      if (on) {
        if (!ac) buildAudio();
        ac.resume(); updateSound(); master.gain.setTargetAtTime(0.5, ac.currentTime, 0.6);
        clearTimeout(bubbleTimer); bubble();
      } else if (ac) { master.gain.setTargetAtTime(0, ac.currentTime, 0.3); clearTimeout(bubbleTimer); }
    } catch (err) { btn.setAttribute('aria-pressed', 'false'); }
  }

  /* ---------- 9. ecosystem diagram ---------- */
  const ELEMENTS = [
    ['Water', 'Movement, circulation, oxygenation and filtration.', '#5fd3e4'],
    ['Plants', 'Growth, nutrient uptake, habitat and visual structure.', '#9ed36a'],
    ['Microorganisms', 'Biological processes that break down organic matter.', '#d2b06a'],
    ['Rock & wood', 'Structure, shelter and natural visual formations.', '#c9b89c'],
    ['Aquatic life', 'Fish, shrimp, snails and other compatible organisms.', '#7fd6c2'],
    ['Light', 'Supports plant growth and shapes the atmosphere.', '#f0c27b']
  ];
  const gN = document.getElementById('eco-nodes'), list = document.getElementById('eco-list');
  const NS = 'http://www.w3.org/2000/svg', nodes = [], items = [];
  ELEMENTS.forEach(([name, text, c], k) => {
    const a = (-90 + k * 60) * Math.PI / 180, x = 300 + 220 * Math.cos(a), y = 300 + 220 * Math.sin(a);
    const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'node'); g.style.setProperty('--nc', c);
    const ci = document.createElementNS(NS, 'circle'); ci.setAttribute('cx', x); ci.setAttribute('cy', y); ci.setAttribute('r', 62);
    g.appendChild(ci);
    const words = name === 'Microorganisms' ? ['Micro-', 'organisms'] : name === 'Aquatic life' ? ['Aquatic', 'life'] : name === 'Rock & wood' ? ['Rock &', 'wood'] : [name];
    words.forEach((w, wi) => {
      const tx = document.createElementNS(NS, 'text'); tx.setAttribute('x', x); tx.setAttribute('y', y + 4 + (wi - (words.length - 1) / 2) * 15); tx.textContent = w; g.appendChild(tx);
    });
    gN.appendChild(g); nodes.push(g);
    const li = document.createElement('li'); li.tabIndex = 0; li.style.setProperty('--nc', c);
    li.innerHTML = `<b>${name}</b><span>${text}</span>`; list.appendChild(li); items.push(li);
    const on = () => { hold = true; light(k); }, off = () => { hold = false; };
    li.addEventListener('mouseenter', on); li.addEventListener('focus', on); li.addEventListener('mouseleave', off); li.addEventListener('blur', off);
    g.addEventListener('mouseenter', on); g.addEventListener('mouseleave', off);
  });
  let hold = false, cyc = 0;
  function light(k) { nodes.forEach((n, i) => n.classList.toggle('is-on', i === k)); items.forEach((n, i) => n.classList.toggle('is-on', i === k)); }
  light(0);
  if (!reduce) setInterval(() => { if (!hold) light(cyc = (cyc + 1) % 6); }, 2600);

  /* ---------- 10. contact helpers ---------- */
  document.querySelectorAll('.copy').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.copy, done = () => { b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1600); };
    const fallback = () => { const a = b.parentElement.querySelector('a'); const r = document.createRange(); r.selectNodeContents(a); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = 'Selected'; setTimeout(() => b.textContent = 'Copy', 1600); };
    try { navigator.clipboard.writeText(v).then(done, fallback); } catch (e) { fallback(); }
  }));
  const form = document.getElementById('enquiry'), note = document.getElementById('f-note');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const $ = id => document.getElementById(id);
    const name = $('f-name').value.trim(), contact = $('f-contact').value.trim();
    if (!name || !contact) { note.style.color = 'var(--gold)'; note.textContent = 'Add your name and a phone number or email so Dexter can reply.'; (name ? $('f-contact') : $('f-name')).focus(); return; }
    const kinds = [...form.querySelectorAll('input[name=kind]:checked')].map(i => i.value).join(', ') || 'Not sure yet';
    const body = `Name: ${name}\nContact: ${contact}\nInterested in: ${kinds}\nSpace: ${$('f-space').value}\n\n${$('f-msg').value.trim()}`;
    note.style.color = 'var(--moss)';
    note.textContent = 'Opening your email app with the enquiry filled in. If nothing opens, email dextersaquadesigns@gmail.com or call 814-709-3243.';
    location.href = 'mailto:dextersaquadesigns@gmail.com?subject=' + encodeURIComponent('New project: ' + kinds) + '&body=' + encodeURIComponent(body);
  });
})();
