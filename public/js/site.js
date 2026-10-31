/* Wave Records — інтерактивність публічного сайту */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (sec) => {
    const s = Math.max(0, Math.floor(sec || 0));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  /* ---------- Аналітика ---------- */
  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* приватний режим */ } },
  };

  function loadPixel() {
    const id = window.WR_PIXEL_ID;
    if (!id || window.fbq) return;
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', id);
    window.fbq('track', 'PageView');
  }

  const FB_EVENTS = { booking_confirmed: 'Schedule', booking_start: 'InitiateCheckout' };
  window.wrTrack = (name, params = {}) => {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: name, ...params });
    if (window.WR_GA4 && typeof window.gtag === 'function') window.gtag('event', name, params);
    if (window.fbq && FB_EVENTS[name]) window.fbq('track', FB_EVENTS[name], params);
  };

  function applyConsent(choice) {
    const granted = choice === 'all' ? 'granted' : 'denied';
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', { ad_storage: granted, ad_user_data: granted, ad_personalization: granted, analytics_storage: granted });
    }
    window.dataLayer.push({ event: 'consent_update', consent: choice });
    if (choice === 'all') loadPixel();
  }

  const consentBox = $('[data-consent]');
  const storedConsent = storage.get('wr_consent');
  if (storedConsent === 'all') loadPixel();
  if (consentBox) {
    if (!storedConsent) setTimeout(() => { consentBox.hidden = false; }, 900);
    consentBox.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-consent-choice]');
      if (!btn) return;
      const choice = btn.dataset.consentChoice;
      storage.set('wr_consent', choice);
      applyConsent(choice);
      consentBox.hidden = true;
    });
  }
  $$('[data-consent-open]').forEach((b) => b.addEventListener('click', () => { if (consentBox) consentBox.hidden = false; }));

  document.addEventListener('click', (e) => {
    const cta = e.target.closest('[data-cta]');
    if (cta) window.wrTrack('cta_click', { cta: cta.dataset.cta });
  });

  /* ---------- Шапка та меню ---------- */
  const header = $('[data-header]');
  const onScroll = () => header && header.toggleAttribute('data-scrolled', window.scrollY > 24);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Перший екран: WAVE RECORDS завжди в ширину контейнера ---------- */
  const heroTitle = $('.hero-title');
  const heroLine = $('.hero-l1');
  function fitHero() {
    if (!heroTitle || !heroLine) return;
    heroTitle.style.removeProperty('--hero-fs');
    const box = heroTitle.parentElement.clientWidth;
    const width = heroLine.scrollWidth;
    if (width > box) {
      const size = parseFloat(getComputedStyle(heroLine).fontSize);
      heroTitle.style.setProperty('--hero-fs', `${Math.floor(size * box / width * 0.98)}px`);
    }
  }
  if (heroTitle) {
    fitHero();
    if (document.fonts) document.fonts.ready.then(fitHero);
    let fitT;
    addEventListener('resize', () => { clearTimeout(fitT); fitT = setTimeout(fitHero, 100); });
  }

  const menu = $('[data-menu]');
  const toggle = $('[data-menu-toggle]');
  function setMenu(open) {
    if (!menu || !toggle) return;
    toggle.setAttribute('aria-expanded', String(open));
    $('.menu-label', toggle).textContent = open ? 'Закрити' : 'Меню';
    document.body.classList.toggle('menu-open', open);
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
      setTimeout(() => $('a', menu)?.focus({ preventScroll: true }), 80);
    } else {
      menu.classList.remove('is-open');
      setTimeout(() => { if (!menu.classList.contains('is-open')) menu.hidden = true; }, reduceMotion ? 0 : 360);
    }
  }
  toggle?.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  menu?.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle?.getAttribute('aria-expanded') === 'true') { setMenu(false); toggle.focus(); }
  });

  /* ---------- Рідке скло ----------
     --px (на <html>)   — положення курсора по горизонталі, від -1 до 1;
     --sy (на блоці)    — де блок на екрані по вертикалі, від -1 (вгорі) до 1 (внизу);
     --mx/--my          — курсор усередині блоку (відблиск по краю);
     --rx/--ry          — нахил блоку до курсора, до 3°;
     --lg               — SVG-фільтр заломлення для цього блоку (лише Chromium на комп'ютері).
     Смуга світла і райдужне ребро зміщуються від --px і --sy, тож скло «живе» при прокрутці й русі миші. */
  const root = document.documentElement;
  // SVG-фільтр у backdrop-filter уміє лише Chromium; Safari і Firefox лишаються з розмиттям та імітацією призми
  const isChromium = !!navigator.userAgentData?.brands?.some((b) => /Chromium/.test(b.brand));
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  // Слабкі пристрої (мало ядер чи пам'яті) і телефони отримують спрощене скло без заломлення
  const weak = (navigator.hardwareConcurrency || 8) <= 2 || (navigator.deviceMemory || 8) < 2;
  const refract = isChromium && finePointer && !weak && !!CSS.supports?.('backdrop-filter', 'url(#lg0) blur(1px)')
    && 'IntersectionObserver' in window && 'ResizeObserver' in window;
  if (refract) root.classList.add('lg-refract');
  const TILT = '.svc-card, .glass-card, .bento-card';
  const RIM = '.glass, .btn-glass, .btn-neon, .track-play';
  const visibleGlass = new Set();
  let pointer = null;
  let hovered = null;
  let glassRaf = 0;

  /* Заломлення. Для кожного унікального розміру (ширина × висота × радіус) — один SVG-фільтр:
       feImage — карта зміщення: лінза з фаскою, біля краю пікселі тягнуться всередину, у центрі — нуль;
       feDisplacementMap ×3 — окремо для червоного, зеленого й синього з трохи різною силою,
       тож по краях виходить райдужна облямівка; канали розділяє feColorMatrix і зводить feComposite.
     Фільтр вмикається лише для блоків, видимих на екрані. */
  if (refract) {
    const defs = $('.lg-defs');
    const NS = 'http://www.w3.org/2000/svg';
    const filters = new Map(); // розмір → id фільтра
    const onScreen = new Set();

    function lensMap(w, h, r, bevel) {
      // Карту можна зробити меншою: браузер розтягне її плавно
      const s = Math.min(1, Math.sqrt(120000 / (w * h)));
      const cw = Math.max(2, Math.round(w * s));
      const ch = Math.max(2, Math.round(h * s));
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      const g = c.getContext('2d');
      const img = g.createImageData(cw, ch);
      const d = img.data;
      const hx = w / 2;
      const hy = h / 2;
      // Радіус кута не менший за фаску — тоді напрямок зміщення біля кутів змінюється плавно
      const rr = Math.min(Math.max(r, bevel), hx, hy);
      for (let j = 0; j < ch; j++) {
        for (let i = 0; i < cw; i++) {
          const x = ((i + 0.5) / cw) * w - hx;
          const y = ((j + 0.5) / ch) * h - hy;
          const ax = Math.abs(x);
          const ay = Math.abs(y);
          const qx = ax - (hx - rr);
          const qy = ay - (hy - rr);
          let e; let nx; let ny;
          if (qx > 0 && qy > 0) {
            const l = Math.hypot(qx, qy) || 1;
            e = rr - l; nx = (qx / l) * Math.sign(x); ny = (qy / l) * Math.sign(y);
          } else if (qx > qy) {
            e = hx - ax; nx = Math.sign(x); ny = 0;
          } else {
            e = hy - ay; nx = 0; ny = Math.sign(y);
          }
          const t = Math.min(1, Math.max(0, 1 - e / bevel));
          const m = t * t; // крутіше біля самого краю
          const k = (j * cw + i) * 4;
          d[k] = 128 - nx * m * 127;
          d[k + 1] = 128 - ny * m * 127;
          d[k + 2] = 128;
          d[k + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      return c.toDataURL();
    }

    function filterFor(el) {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w < 16 || h < 16) return '';
      const cs = getComputedStyle(el);
      const r = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, w / 2, h / 2);
      const blur = parseFloat(cs.getPropertyValue('--lg-blur')) || 3;
      const key = `${w}x${h}r${Math.round(r)}b${blur}`;
      let id = filters.get(key);
      if (!id) {
        id = `lg${filters.size}`;
        // Ширина фаски і сила зміщення залежать від розміру; сила менша за фаску, щоб зображення не перекидалось
        const bevel = Math.max(8, Math.min(42, Math.min(w, h) * 0.32));
        const S = bevel * 0.9;
        const f = document.createElementNS(NS, 'filter');
        f.setAttribute('id', id);
        f.setAttribute('x', '0'); f.setAttribute('y', '0');
        f.setAttribute('width', '100%'); f.setAttribute('height', '100%');
        f.setAttribute('color-interpolation-filters', 'sRGB');
        const channels = [
          ['1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', S],
          ['0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', S * 0.86],
          ['0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', S * 0.72],
        ];
        f.innerHTML = `<feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" result="src"/>`
          + `<feImage href="${lensMap(w, h, r, bevel)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>`
          + channels.map(([m, s], n) => `<feDisplacementMap in="src" in2="map" scale="${s.toFixed(1)}" xChannelSelector="R" yChannelSelector="G" result="d${n}"/>`
            + `<feColorMatrix in="d${n}" type="matrix" values="${m}" result="c${n}"/>`).join('')
          + '<feComposite in="c0" in2="c1" operator="arithmetic" k2="1" k3="1" result="rg"/>'
          + '<feComposite in="rg" in2="c2" operator="arithmetic" k2="1" k3="1"/>';
        defs.appendChild(f);
        filters.set(key, id);
      }
      return `url(#${id})`;
    }
    const applyLens = (el) => {
      const v = filterFor(el);
      if (v) el.style.setProperty('--lg', v); else el.style.removeProperty('--lg');
    };

    const lensIO = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { onScreen.add(en.target); applyLens(en.target); } else { onScreen.delete(en.target); en.target.style.removeProperty('--lg'); }
    }), { rootMargin: '120px 0px' });
    // Розмір змінився — фільтр під новий розмір (з паузою, щоб не робити карти на кожен кадр під час зміни вікна)
    const pending = new Set();
    let lensT = 0;
    const lensRO = new ResizeObserver((entries) => {
      entries.forEach((en) => { if (onScreen.has(en.target)) pending.add(en.target); });
      clearTimeout(lensT);
      lensT = setTimeout(() => { pending.forEach((el) => onScreen.has(el) && applyLens(el)); pending.clear(); }, 160);
    });
    $$('.glass, .btn-glass, .track-play, .menu').forEach((el) => { lensIO.observe(el); lensRO.observe(el); });
  }

  function glassFrame() {
    glassRaf = 0;
    // Спершу всі виміри, потім усі записи — без зайвих перерахунків верстки
    const h = innerHeight;
    const blocks = [...visibleGlass].map((el) => [el, el.getBoundingClientRect()]);
    let hit = null;
    if (pointer) {
      const el = pointer.target.closest?.(RIM);
      if (el) hit = [el, el.getBoundingClientRect(), el.matches(TILT)];
    }
    for (const [el, r] of blocks) el.style.setProperty('--sy', (((r.top + r.height / 2) / h) * 2 - 1).toFixed(3));
    if (pointer) root.style.setProperty('--px', ((pointer.x / innerWidth) * 2 - 1).toFixed(3));
    if (hovered && hovered !== hit?.[0]) { hovered.style.removeProperty('--rx'); hovered.style.removeProperty('--ry'); }
    hovered = hit?.[0] || null;
    if (hit) {
      const [el, r, tilt] = hit;
      const x = pointer.x - r.left;
      const y = pointer.y - r.top;
      el.style.setProperty('--mx', `${x.toFixed(1)}px`);
      el.style.setProperty('--my', `${y.toFixed(1)}px`);
      if (tilt) {
        el.style.setProperty('--rx', `${((0.5 - y / r.height) * 6).toFixed(2)}deg`);
        el.style.setProperty('--ry', `${((x / r.width - 0.5) * 6).toFixed(2)}deg`);
      }
    }
  }
  const scheduleGlass = () => { if (!glassRaf) glassRaf = requestAnimationFrame(glassFrame); };

  // Положення блоків на екрані (--sy) — для смуги світла і райдужного ребра, і на телефонах теж
  if (!reduceMotion) {
    const glassIO = 'IntersectionObserver' in window && new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? visibleGlass.add(en.target) : visibleGlass.delete(en.target)));
      scheduleGlass();
    });
    if (glassIO) $$('.glass, .btn-glass, .track-play').forEach((el) => glassIO.observe(el));
    addEventListener('scroll', scheduleGlass, { passive: true });
    addEventListener('resize', scheduleGlass, { passive: true });
    if (finePointer) {
      document.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        pointer = { x: e.clientX, y: e.clientY, target: e.target };
        scheduleGlass();
      }, { passive: true });
      document.addEventListener('pointerleave', () => { pointer = null; scheduleGlass(); }, { passive: true });
    }
  }

  /* ---------- Лінії рівня (meter) ---------- */
  const meters = $$('.meter[data-live]').map((el) => ({ el, bars: [], idle: [], visible: true }));

  function idleShape(n, i) {
    // Хвиля: дві синусоїди + детермінований «шум», щоб нагадувати запис голосу.
    const x = i / Math.max(1, n - 1);
    const env = Math.sin(Math.PI * x) ** 0.6;
    const wave = 0.55 + 0.25 * Math.sin(x * 19) + 0.2 * Math.sin(x * 47 + 1.3);
    const noise = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
    return Math.max(0.05, Math.min(1, env * (wave * 0.75 + noise * 0.35)));
  }

  function buildMeter(m) {
    const w = m.el.clientWidth || 300;
    const n = m.el.classList.contains('mini-meter') ? 18 : Math.max(24, Math.min(160, Math.floor(w / 9)));
    m.el.innerHTML = '';
    m.bars = [];
    m.idle = [];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const bar = document.createElement('i');
      frag.appendChild(bar);
      m.bars.push(bar);
      m.idle.push(idleShape(n, i));
    }
    m.el.appendChild(frag);
  }

  function setIdle(m) {
    m.bars.forEach((b, i) => b.style.setProperty('--v', m.idle[i].toFixed(3)));
  }

  meters.forEach((m) => { buildMeter(m); setIdle(m); });

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const m = meters.find((x) => x.el === en.target);
        if (m) m.visible = en.isIntersecting;
      }
    });
    meters.forEach((m) => io.observe(m.el));
  }

  let resizeT;
  addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      meters.filter((m) => !m.el.classList.contains('mini-meter')).forEach((m) => { buildMeter(m); setIdle(m); });
      $$('[data-track]').forEach(renderWave);
    }, 200);
  });

  /* ---------- Аудіоплеєр ---------- */
  const tracks = $$('[data-track]');
  const mini = $('[data-mini]');
  const audio = new Audio();
  audio.preload = 'none';
  let current = null;
  let ctx = null;
  let analyser = null;
  let freq = null;
  let raf = 0;
  const playedOnce = new Set();

  function peaksOf(el) {
    const raw = (el.dataset.peaks || '').split(',').map(Number).filter((n) => Number.isFinite(n));
    return raw.length ? raw.map((v) => Math.max(0.06, Math.min(1, v / 100))) : null;
  }

  function renderWave(el) {
    const wave = $('.track-wave', el);
    if (!wave) return;
    const peaks = peaksOf(el);
    const n = Math.max(28, Math.min(peaks ? peaks.length : 96, Math.floor((wave.clientWidth || 300) / 5)));
    const values = [];
    for (let i = 0; i < n; i++) {
      if (peaks) {
        const a = Math.floor((i / n) * peaks.length);
        const b = Math.max(a + 1, Math.floor(((i + 1) / n) * peaks.length));
        values.push(Math.max(...peaks.slice(a, b)));
      } else {
        values.push(0.3);
      }
    }
    const bars = values.map((v) => `<i style="height:${Math.round(v * 100)}%"></i>`).join('');
    const p = wave.style.getPropertyValue('--p');
    wave.innerHTML = `<div class="wave-bars wave-base">${bars}</div><div class="wave-bars wave-fill" aria-hidden="true">${bars}</div>`;
    if (p) wave.style.setProperty('--p', p);
  }
  tracks.forEach(renderWave);

  const durationOf = (el) => (el === current && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Number(el.dataset.duration) || 0);

  function updateProgress() {
    if (!current) return;
    const dur = durationOf(current);
    const t = audio.currentTime || 0;
    const pct = dur ? Math.min(100, (t / dur) * 100) : 0;
    const wave = $('.track-wave', current);
    wave.style.setProperty('--p', `${pct}%`);
    wave.setAttribute('aria-valuenow', String(Math.round(t)));
    wave.setAttribute('aria-valuetext', fmt(t));
    $('[data-cur]', current).textContent = fmt(t);
    if (dur) $('[data-dur]', current).textContent = fmt(dur);
    if (mini) $('[data-mini-time]', mini).textContent = `${fmt(t)} / ${fmt(dur)}`;
  }

  function setupAnalyser() {
    if (ctx || reduceMotion) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      const src = ctx.createMediaElementSource(audio);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.78;
      src.connect(analyser);
      analyser.connect(ctx.destination);
      freq = new Uint8Array(analyser.frequencyBinCount);
    } catch { ctx = null; analyser = null; }
  }

  function liveLoop() {
    raf = 0;
    if (!analyser || audio.paused) { window.wrAudioLevel = null; return; }
    analyser.getByteFrequencyData(freq);
    const bins = freq.length * 0.7;
    // Рівень звуку для фону (bg.js): низькі й середні частоти, від 0 до 1
    const avg = (from, to) => { let s = 0; for (let i = from; i < to; i++) s += freq[i]; return s / (to - from) / 255; };
    window.wrAudioLevel = { bass: avg(1, 8), mid: avg(8, 48) };
    for (const m of meters) {
      if (!m.visible) continue;
      const n = m.bars.length;
      for (let i = 0; i < n; i++) {
        // симетрична картинка: низькі частоти в центрі
        const pos = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
        const idx = Math.min(freq.length - 1, Math.floor(Math.pow(pos, 1.6) * bins));
        const v = freq[idx] / 255;
        m.bars[i].style.setProperty('--v', (0.06 + v * v * 0.94).toFixed(3));
      }
    }
    raf = requestAnimationFrame(liveLoop);
  }

  function setLive(on) {
    if (!on) window.wrAudioLevel = null;
    meters.forEach((m) => {
      m.el.classList.toggle('is-live', on && !!analyser);
      if (!on) setIdle(m);
    });
    if (on && analyser && !raf) raf = requestAnimationFrame(liveLoop);
  }

  function select(el) {
    if (current === el) return;
    if (current) current.classList.remove('is-active', 'is-playing');
    current = el;
    el.classList.add('is-active');
    audio.src = el.dataset.src;
    audio.preload = 'auto';
    if (mini) {
      mini.hidden = false;
      $('[data-mini-title]', mini).textContent = el.dataset.title;
    }
  }

  async function play(el) {
    select(el);
    setupAnalyser();
    if (ctx && ctx.state === 'suspended') await ctx.resume().catch(() => {});
    try { await audio.play(); } catch { /* браузер заблокував автозапуск */ }
    if (!playedOnce.has(el.dataset.id)) {
      playedOnce.add(el.dataset.id);
      window.wrTrack('audio_play', { track_title: el.dataset.title });
      if (document.documentElement.hasAttribute('data-static')) return;
      const body = JSON.stringify({ type: 'play', id: el.dataset.id });
      if (navigator.sendBeacon) navigator.sendBeacon('/api/e', new Blob([body], { type: 'application/json' }));
      else fetch('/api/e', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  }

  function togglePlay(el) {
    if (current === el && !audio.paused) audio.pause();
    else play(el);
  }

  function seekTo(el, ratio) {
    ratio = Math.max(0, Math.min(1, ratio));
    const apply = () => {
      const dur = durationOf(el);
      if (dur) audio.currentTime = ratio * dur;
      updateProgress();
    };
    if (current !== el) {
      play(el).then(() => (audio.readyState >= 1 ? apply() : audio.addEventListener('loadedmetadata', apply, { once: true })));
    } else if (audio.readyState >= 1) apply();
    else audio.addEventListener('loadedmetadata', apply, { once: true });
  }

  tracks.forEach((el) => {
    $('.track-play', el).addEventListener("click", () => togglePlay(el));
    const wave = $('.track-wave', el);
    let dragging = false;
    const ratioAt = (e) => { const r = wave.getBoundingClientRect(); return (e.clientX - r.left) / r.width; };
    wave.addEventListener('pointerdown', (e) => { dragging = true; wave.setPointerCapture(e.pointerId); seekTo(el, ratioAt(e)); });
    wave.addEventListener('pointermove', (e) => { if (dragging && current === el) seekTo(el, ratioAt(e)); });
    wave.addEventListener('pointerup', () => { dragging = false; });
    wave.addEventListener('pointercancel', () => { dragging = false; });
    wave.addEventListener('keydown', (e) => {
      const dur = durationOf(el);
      if (!dur) return;
      const t = current === el ? audio.currentTime : 0;
      const step = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5, PageUp: 15, PageDown: -15 }[e.key];
      if (step !== undefined) { e.preventDefault(); seekTo(el, (t + step) / dur); }
      if (e.key === 'Home') { e.preventDefault(); seekTo(el, 0); }
      if (e.key === 'End') { e.preventDefault(); seekTo(el, 0.999); }
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); togglePlay(el); }
    });
  });

  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('loadedmetadata', updateProgress);
  audio.addEventListener('play', () => {
    current?.classList.add('is-playing');
    mini?.classList.add('is-playing');
    if (mini) $('[data-mini-toggle]', mini).setAttribute('aria-label', 'Пауза');
    setLive(true);
  });
  audio.addEventListener('pause', () => {
    current?.classList.remove('is-playing');
    mini?.classList.remove('is-playing');
    if (mini) $('[data-mini-toggle]', mini).setAttribute('aria-label', 'Відтворити');
    setLive(false);
  });
  audio.addEventListener('ended', () => {
    // наступний трек з того самого списку
    const list = current?.closest('.tracks');
    const items = list ? $$('[data-track]', list) : [];
    const next = items[items.indexOf(current) + 1];
    if (next) play(next);
  });

  if (mini) {
    $('[data-mini-toggle]', mini).addEventListener('click', () => { if (current) togglePlay(current); });
    $('[data-mini-close]', mini).addEventListener('click', () => {
      audio.pause();
      mini.hidden = true;
      current?.classList.remove('is-active', 'is-playing');
      current = null;
      audio.removeAttribute('src');
      audio.load();
    });
  }

  /* ---------- Інтерактивна хвиля на першому екрані ----------
     Дзеркальні заокруглені смужки зі скла. Висота кожної смужки — сума:
       • «дихання» у спокої (форма запису голосу, що повільно змінюється);
       • музики, коли грає трек (той самий аналізатор, що й для міні-плеєра);
       • горба біля курсора/пальця і м'якого сліду за ним;
       • брижів від кліку чи дотику, що розходяться в обидва боки.
     Малює WebGL-шейдер: за текстуру береться поточний кадр динамічного фону (canvas з bg.js),
     кожна смужка — скляна лінза: фон за нею заломлюється (сильніше біля країв), червоний, зелений і синій
     канали зміщуються трохи по-різному (райдужна облямівка), по краях — м'яке френелівське світіння,
     а блики рухаються за курсором, як за джерелом світла. Без WebGL — імітація у 2D-canvas. */
  const heroWave = $('[data-hero-wave]');
  if (heroWave) {
    let canvas = $('canvas', heroWave);
    const coarse = matchMedia('(pointer: coarse)').matches;
    const DPR = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
    const MARGIN = 48; // запас фону навколо хвилі: заломлення бере пікселі трохи збоку
    let STEP = 14; // відстань між смужками, px
    let W = 0;
    let H = 0;
    let n = 0;
    let idle = [];
    let val = [];
    let trail = [];
    const ripples = [];
    let ptr = null; // { x, y }
    let ptrStrength = 0;
    let ptrX = 0;
    let ptrY = 0;
    let clock = 0; // секунди від появи — для руху світла
    const t0 = performance.now();
    const x0 = () => (W - (n - 1) * STEP) / 2;
    const barR = () => STEP * 0.33; // радіус смужки (ширина ≈ 2/3 кроку)

    /* --- WebGL: скляні смужки --- */
    const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
    const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes; uniform float uDpr, uW;
uniform sampler2D uH; uniform float uN, uStep, uX0, uR, uCy, uMax;
uniform sampler2D uBg; uniform vec4 uBgMap;
uniform vec3 uLight;
float hAt(float i){ vec4 t = texture2D(uH, vec2((i + .5) / uN, .5)); return (t.r * 65280. + t.g * 255.) / 65535. * uMax; }
// Фірмовий градієнт: світлі краї → вузька смуга ціану → рожевий центр (рожевий домінує)
vec3 brand(float c){ vec3 col = mix(vec3(1., .18, .6), vec3(.1, .72, .82), smoothstep(.34, .5, c)); return mix(col, vec3(.93, .94, .97), smoothstep(.44, .72, c)); }
vec3 bgAt(vec2 p){ return texture2D(uBg, (p + uBgMap.xy) * uBgMap.zw).rgb; }
void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  float fi = floor((p.x - uX0) / uStep + .5);
  float d = 1e4; vec2 q = vec2(0.); float rr = uR;
  for (int k = -2; k <= 2; k++) {
    float i = fi + float(k);
    if (i < 0. || i > uN - 1.) continue;
    float hh = max(hAt(i), .9);
    float r = min(uR, hh);
    float L = hh - r;
    vec2 qq = p - vec2(uX0 + i * uStep, clamp(p.y, uCy - L, uCy + L));
    float dd = length(qq) - r;
    if (dd < d) { d = dd; q = qq; rr = r; }
  }
  float c = abs(p.x / uW - .5) * 2.;           // 0 — центр хвилі, 1 — краї
  vec3 tint = brand(c);
  float edgeFade = mix(1., .45, smoothstep(.35, 1., c));
  float cover = clamp(.5 - d * uDpr, 0., 1.);
  float glow = exp(-max(d, 0.) / 4.) * .12 * edgeFade * (1. - cover);
  if (cover <= 0.) { gl_FragColor = vec4(tint * glow, glow * .6); return; }
  // Смужка — скляний циліндр із заокругленими кінцями: нормаль із форми перерізу
  float lq = length(q);
  vec2 n2 = lq > 1e-4 ? q / lq : vec2(0.);
  float s = clamp(lq / rr, 0., 1.);            // 0 — вісь смужки, 1 — край
  float z = sqrt(max(1. - s * s, 0.));
  vec3 N = normalize(vec3(n2 * s, z + .0001));
  // Заломлення: зміщення вздовж нормалі, сильніше біля країв; R, G, B — з різною силою
  vec2 off = -N.xy * rr * 2.6;
  vec3 bg = vec3(bgAt(p + off * 1.18).r, bgAt(p + off).g, bgAt(p + off * .82).b);
  // Світло від курсора: дзеркальний блиск і широкий м'який відблиск
  vec3 Lv = normalize(vec3(uLight.xy - p, uLight.z));
  float ndh = max(dot(N, normalize(Lv + vec3(0., 0., 1.))), 0.);
  float spec = pow(ndh, 90.) * 1.4 + pow(ndh, 12.) * .14;
  float fres = pow(1. - z, 2.4);
  // Райдужна облямівка: червоний зовні, синій усередині
  float e = -d;
  vec3 fringe = vec3(exp(-pow((e - .2) / .55, 2.)), exp(-pow((e - .8) / .55, 2.)), exp(-pow((e - 1.4) / .55, 2.)));
  float facing = pow(max(dot(n2, normalize(uLight.xy - p + vec2(.001))), 0.), 1.5);
  // Тіло скла світиться фірмовим кольором рівномірно, край лише трохи світліший — без обведення
  vec3 col = bg * 1.5
    + tint * edgeFade * (.44 + .2 * fres)
    + vec3(.85, .9, 1.) * fres * .14
    + fringe * .55 * (.3 + .7 * facing) * (.5 + .5 * edgeFade)
    + vec3(spec);
  float a = cover * clamp(.74 + .2 * fres + spec, 0., 1.);
  gl_FragColor = vec4(min(col, vec3(1.)) * a, a);
}`;

    function createGL(cv) {
      let gl = null;
      try { gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false }); } catch { gl = null; }
      if (!gl) return null;
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
      const vs = sh(gl.VERTEX_SHADER, VERT);
      const fs = sh(gl.FRAGMENT_SHADER, FRAG);
      const prog = vs && fs && gl.createProgram();
      if (prog) { gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog); }
      if (!prog || !gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl.getExtension('WEBGL_lose_context')?.loseContext(); return null; }
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'a');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const u = {};
      ['uRes', 'uDpr', 'uW', 'uH', 'uN', 'uStep', 'uX0', 'uR', 'uCy', 'uMax', 'uBg', 'uBgMap', 'uLight'].forEach((k) => { u[k] = gl.getUniformLocation(prog, k); });
      const tex = (unit) => {
        const t = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, unit ? gl.LINEAR : gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, unit ? gl.LINEAR : gl.NEAREST);
        return t;
      };
      const hTex = tex(0);
      const bgTex = tex(1);
      gl.uniform1i(u.uH, 0);
      gl.uniform1i(u.uBg, 1);
      let hData = new Uint8Array(0);

      // Фон за хвилею: темна основа, сітка точок і поточний кадр стрічок із bg.js
      const back = document.createElement('canvas');
      const bc = back.getContext('2d');
      let dots = null;
      if (bc) {
        const tile = document.createElement('canvas');
        tile.width = tile.height = 32;
        const tc = tile.getContext('2d');
        tc.fillStyle = 'rgba(245, 245, 245, .09)';
        tc.beginPath(); tc.arc(16, 16, 1.2, 0, Math.PI * 2); tc.fill();
        dots = bc.createPattern(tile, 'repeat');
      }
      function backdrop() {
        const r = heroWave.getBoundingClientRect();
        const w = Math.ceil(W + MARGIN * 2);
        const h = Math.ceil(H + MARGIN * 2);
        if (back.width !== w || back.height !== h) { back.width = w; back.height = h; }
        const left = r.left - MARGIN;
        const top = r.top - MARGIN;
        bc.fillStyle = '#111';
        bc.fillRect(0, 0, w, h);
        const bgs = window.wrBg;
        if (dots) {
          const dy = (bgs ? bgs.dotsY : 0) - 32;
          bc.save();
          bc.translate(-left, dy - top);
          bc.fillStyle = dots;
          bc.fillRect(left, top - dy, w, h);
          bc.restore();
        }
        const src = bgs && bgs.canvas;
        if (src && src.width) {
          const k = src.width / innerWidth;
          try { bc.drawImage(src, left * k, top * k, w * k, h * k, 0, 0, w, h); } catch { /* фон ще не готовий */ }
        }
        return [w, h];
      }

      return {
        draw() {
          const [bw, bh] = backdrop();
          gl.viewport(0, 0, cv.width, cv.height);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          // Висоти смужок — у текстурі n×1, 16 біт на значення (R — старший байт, G — молодший)
          if (hData.length !== n * 4) hData = new Uint8Array(n * 4);
          for (let i = 0; i < n; i++) {
            const v = Math.round(Math.min(1, Math.max(0, val[i])) * 65535);
            hData[i * 4] = v >> 8;
            hData[i * 4 + 1] = v & 255;
            hData[i * 4 + 3] = 255;
          }
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, hTex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, hData);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, bgTex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, back);
          // Світло: курсор або палець, а без них — повільно пливе над хвилею
          const ix = W * (0.5 + 0.32 * Math.sin(clock * 0.35));
          const iy = -H * 0.5;
          const k = ptrStrength;
          gl.uniform2f(u.uRes, cv.width, cv.height);
          gl.uniform1f(u.uDpr, DPR);
          gl.uniform1f(u.uW, W);
          gl.uniform1f(u.uN, n);
          gl.uniform1f(u.uStep, STEP);
          gl.uniform1f(u.uX0, x0());
          gl.uniform1f(u.uR, barR());
          gl.uniform1f(u.uCy, H / 2);
          gl.uniform1f(u.uMax, H / 2 - 6);
          gl.uniform4f(u.uBgMap, MARGIN, MARGIN, 1 / bw, 1 / bh);
          gl.uniform3f(u.uLight, ix + (ptrX - ix) * k, iy + (ptrY - iy) * k, 70 + 50 * (1 - k));
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        },
      };
    }

    /* --- Запасний варіант без WebGL: напівпрозорі смужки з відблисками і зсунутими рожевою й ціановою копіями країв --- */
    function create2D(cv) {
      const g = cv.getContext('2d');
      if (!g) return null;
      const capsule = (x, cy, h, r) => {
        g.moveTo(x - r, cy - h + r);
        g.arc(x, cy - h + r, r, Math.PI, 0);
        g.lineTo(x + r, cy + h - r);
        g.arc(x, cy + h - r, r, 0, Math.PI);
        g.closePath();
      };
      const pass = (style, dx, shrink) => {
        const cy = H / 2;
        const max = H / 2 - 6;
        const r0 = barR();
        g.fillStyle = style;
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const h = Math.max(0.9, val[i] * max);
          const r = Math.min(r0, h) * shrink;
          capsule(x0() + i * STEP + dx, cy, Math.max(r, h - (r0 - r)), r);
        }
        g.fill();
      };
      return {
        draw() {
          g.setTransform(DPR, 0, 0, DPR, 0, 0);
          g.clearRect(0, 0, W, H);
          const grad = (a1, a2, a3) => {
            const gr = g.createLinearGradient(0, 0, W, 0);
            gr.addColorStop(0, `rgba(245, 245, 245, ${a1 * 0.4})`);
            gr.addColorStop(0.18, `rgba(245, 245, 245, ${a1})`);
            gr.addColorStop(0.32, `rgba(0, 229, 255, ${a2 * 0.6})`);
            gr.addColorStop(0.5, `rgba(255, 46, 154, ${a3})`);
            gr.addColorStop(0.68, `rgba(0, 229, 255, ${a2 * 0.6})`);
            gr.addColorStop(0.82, `rgba(245, 245, 245, ${a1})`);
            gr.addColorStop(1, `rgba(245, 245, 245, ${a1 * 0.4})`);
            return gr;
          };
          g.globalCompositeOperation = 'lighter';
          pass('rgba(255, 46, 154, .32)', -1.2, 1); // рожева копія краю
          pass('rgba(0, 229, 255, .26)', 1.2, 1); // ціанова копія краю
          g.globalCompositeOperation = 'source-over';
          pass(grad(0.2, 0.42, 0.5), 0, 1); // тіло смужки
          g.globalCompositeOperation = 'lighter';
          pass('rgba(255, 255, 255, .5)', -barR() * 0.35, 0.28); // відблиск уздовж лівого краю
          g.globalCompositeOperation = 'source-over';
        },
      };
    }

    let renderer = createGL(canvas);
    if (!renderer) {
      // Canvas, на якому вже пробували WebGL, не дасть 2D-контекст — підміняємо його чистим
      const fresh = canvas.cloneNode(false);
      canvas.replaceWith(fresh);
      canvas = fresh;
      renderer = create2D(canvas);
    }

    if (renderer) {
      function layoutWave() {
        W = heroWave.clientWidth || 300;
        H = heroWave.clientHeight || 100;
        STEP = W >= 700 ? 14 : 11;
        canvas.width = Math.round(W * DPR);
        canvas.height = Math.round(H * DPR);
        const count = Math.max(24, Math.min(170, Math.floor(W / STEP)));
        if (count !== n) {
          n = count;
          idle = Array.from({ length: n }, (_, i) => idleShape(n, i));
          val = reduceMotion ? idle.slice() : val.length === n ? val : new Array(n).fill(0.03);
          trail = new Array(n).fill(0);
        }
      }

      layoutWave();
      if (reduceMotion) {
        // Статичний кадр без анімації (фон теж статичний)
        renderer.draw();
        addEventListener('resize', () => { layoutWave(); renderer.draw(); }, { passive: true });
      } else {
        const easeOutBack = (x) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;
        let raf = 0;
        let visible = true;
        let prev = performance.now();

        function frame(now) {
          raf = 0;
          const dt = Math.min(0.05, (now - prev) / 1000);
          prev = now;
          const t = (now - t0) / 1000;
          clock = t;
          const live = !!analyser && !audio.paused && !!freq;
          if (live) analyser.getByteFrequencyData(freq);
          ptrStrength += ((ptr ? 1 : 0) - ptrStrength) * Math.min(1, dt * 8);
          if (ptr) { ptrX += (ptr.x - ptrX) * Math.min(1, dt * 14); ptrY += (ptr.y - ptrY) * Math.min(1, dt * 14); }
          const sigma = Math.max(28, W * 0.045);
          const bins = freq ? freq.length * 0.7 : 0;

          for (let i = ripples.length - 1; i >= 0; i--) if (t - ripples[i].t > 2.4) ripples.splice(i, 1);

          for (let i = 0; i < n; i++) {
            const x = x0() + i * STEP;
            // Дихання: форма запису голосу, що повільно змінюється
            const breathe = 0.78 + 0.16 * Math.sin(t * 0.9 + i * 0.19) * Math.sin(t * 0.37 + i * 0.045) + 0.06 * Math.sin(t * 2.1 + i * 0.7);
            let target = idle[i] * breathe;
            if (live) {
              const pos = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
              const v = freq[Math.min(freq.length - 1, Math.floor(Math.pow(pos, 1.6) * bins))] / 255;
              target = Math.max(target * 0.35, 0.06 + v * v * 0.94);
            }
            // Горб біля курсора і слід, що повільно згасає
            const d = (x - ptrX) / sigma;
            const bump = ptrStrength * Math.exp(-d * d) * 0.55;
            trail[i] = Math.max(trail[i] * Math.pow(0.08, dt), bump * 0.75);
            let extra = Math.max(bump, trail[i]);
            // Брижі від кліку: хвильовий фронт розходиться в обидва боки й згасає
            for (const r of ripples) {
              const age = t - r.t;
              const front = age * Math.max(260, W * 0.55);
              const dd = (Math.abs(x - r.x) - front) / 34;
              extra += Math.exp(-dd * dd) * 0.5 * Math.exp(-age * 1.6);
            }
            target = Math.min(1, target + extra * (1 - target * 0.5));
            // Поява при завантаженні: смужки виростають з центральної лінії зліва направо
            const intro = Math.min(1, Math.max(0, (t - 0.15 - i * 0.006) / 1.1));
            target *= intro < 1 ? Math.max(0.03, easeOutBack(intro)) : 1;
            const k = live ? 0.4 : 0.16;
            val[i] += (target - val[i]) * Math.min(1, k * dt * 60);
          }
          renderer.draw();
          if (visible && !document.hidden) raf = requestAnimationFrame(frame);
        }
        const start = () => { if (!raf && visible && !document.hidden) { prev = performance.now(); raf = requestAnimationFrame(frame); } };

        // Пауза, коли хвилю не видно або вкладка неактивна
        if ('IntersectionObserver' in window) {
          new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) start(); }).observe(heroWave);
        }
        document.addEventListener('visibilitychange', start);

        const local = (e) => { const r = heroWave.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
        heroWave.addEventListener('pointermove', (e) => {
          const p = local(e);
          if (!ptr) { ptrX = p.x; ptrY = p.y; }
          ptr = p;
        }, { passive: true });
        heroWave.addEventListener('pointerdown', (e) => {
          const p = local(e);
          ptr = p;
          ptrX = p.x;
          ptrY = p.y;
          ripples.push({ x: p.x, t: (performance.now() - t0) / 1000 });
          if (ripples.length > 6) ripples.shift();
          start();
        }, { passive: true });
        const leave = () => { ptr = null; };
        heroWave.addEventListener('pointerleave', leave, { passive: true });
        heroWave.addEventListener('pointercancel', leave, { passive: true });
        heroWave.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') leave(); }, { passive: true });

        let waveResizeT;
        addEventListener('resize', () => {
          clearTimeout(waveResizeT);
          waveResizeT = setTimeout(() => { layoutWave(); renderer.draw(); }, 150);
        }, { passive: true });
        start();
      }
    }
  }

  /* ---------- Галерея ---------- */
  const lightbox = $('[data-lightbox]');
  if (lightbox && typeof lightbox.showModal === 'function') {
    const img = $('[data-lightbox-img]', lightbox);
    $$('.g-open').forEach((b) => b.addEventListener('click', () => {
      img.src = b.dataset.full;
      img.alt = b.dataset.alt || '';
      lightbox.showModal();
    }));
    $('[data-lightbox-close]', lightbox).addEventListener('click', () => lightbox.close());
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.close(); });
  }
})();
