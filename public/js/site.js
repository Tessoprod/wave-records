/* Wave Records — інтерактивність публічного сайту */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  /* Видимий фокус — лише при навігації з клавіатури. Клас kbd-nav на <html>: ставить Tab чи стрілки, знімає дотик чи
     клік. На телефонах і сенсорних екранах без нього контур фокусу не малюється (site.css), а програмне фокусування
     (пастка фокусу в меню, повернення фокусу) — без прокрутки й без видимого контуру (quietFocus) */
  const kbdKeys = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  addEventListener('keydown', (e) => { if (kbdKeys.has(e.key)) document.documentElement.classList.add('kbd-nav'); }, true);
  addEventListener('pointerdown', () => document.documentElement.classList.remove('kbd-nav'), true);
  const quietFocus = () => ({ preventScroll: true, focusVisible: document.documentElement.classList.contains('kbd-nav') });
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
    // Банер — лише після входу (інтро чи шторки з меню), щоб не з'являвся поверх них
    if (!storedConsent) {
      setTimeout(() => {
        Promise.resolve(window.wrMotion?.entered).then(() => setTimeout(() => { consentBox.hidden = false; }, 400));
      }, 500);
    }
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
    // Повторно — лише коли справді змінилась ширина (на телефоні resize приходить і від появи/зникнення адресного
    // рядка — тоді перерахунок посеред анімації давав інший розмір, і текст першого екрана «скакав»)
    let fitT;
    let fitW = innerWidth;
    addEventListener('resize', () => {
      if (Math.abs(innerWidth - fitW) < 3) return;
      fitW = innerWidth;
      clearTimeout(fitT); fitT = setTimeout(fitHero, 100);
    });
  }

  const menu = $('[data-menu]');
  const toggle = $('[data-menu-toggle]');
  /* Меню: тут — стан, доступність і фокус. Анімацію хвилі дає motion.js (window.wrMotion.menuAnim);
     якщо її немає (без GSAP), меню просто проявляється класом .is-open. */
  let menuBusy = false;
  const isOpen = () => toggle?.getAttribute('aria-expanded') === 'true';
  async function setMenu(open) {
    if (!menu || !toggle || menuBusy || open === isOpen()) return;
    menuBusy = true;
    toggle.setAttribute('aria-expanded', String(open));
    $('.menu-label', toggle).textContent = open ? 'Закрити' : 'Меню';
    document.body.classList.toggle('menu-open', open);
    const anim = window.wrMotion?.menuAnim;
    try {
      if (open) {
        menu.hidden = false;
        if (anim) await anim(true);
        else await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => { menu.classList.add('is-open'); r(); })));
        $('.menu-links a', menu)?.focus(quietFocus());
      } else {
        if (anim) await anim(false);
        else { menu.classList.remove('is-open'); await new Promise((r) => setTimeout(r, reduceMotion ? 0 : 300)); }
        menu.hidden = true;
        if (menu.contains(document.activeElement) || document.activeElement === document.body) toggle.focus(quietFocus());
      }
    } finally {
      menuBusy = false;
    }
  }
  toggle?.addEventListener('click', () => setMenu(!isOpen()));
  /* Посилання в меню:
       • на поточну сторінку — просто закрити меню;
       • на іншу сторінку сайту — шторка лишається опущеною: ставимо позначку wr_from_menu і переходимо;
         нова сторінка відкривається з опущеною шторкою і піднімає її (motion.js, curtainLift),
         View Transition для такого переходу вимикає скрипт у <head>;
       • решта (телефон, Telegram, нова вкладка) — як звичайно, меню закривається. */
  let navLoaderTimer = 0;
  const samePath = (a, b) => (a.replace(/\/+$/, '') || '/') === (b.replace(/\/+$/, '') || '/');
  menu?.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    const plain = !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0 && !a.target && !a.hasAttribute('download');
    const internal = plain && a.origin === location.origin && /^https?:$/.test(a.protocol);
    if (internal && samePath(a.pathname, location.pathname)) {
      if (!a.hash) e.preventDefault();
      setMenu(false);
      return;
    }
    if (internal && !reduceMotion && window.wrMotion?.menuAnim) {
      try { sessionStorage.setItem('wr_from_menu', String(Date.now())); } catch { setMenu(false); return; }
      // Пункти меню плавно згасають, шторка стає суцільною. Лоадер-хвиля — лише якщо нова сторінка не відкрилась
      // за 250 мс (нова сторінка рахує той самий відлік від позначки й продовжує ту саму хвилю — фаза від годинника)
      document.documentElement.classList.add('nav-leaving');
      clearTimeout(navLoaderTimer);
      navLoaderTimer = setTimeout(() => window.wrNavLoader?.start(), 250);
      return; // шторку не піднімаємо — браузер переходить на нову сторінку
    }
    setMenu(false);
  });
  // Повернення кнопкою «Назад» на сторінку зі збереженого стану (bfcache), з якої пішли через меню:
  // меню там ще відкрите — піднімаємо шторку, як при закритті
  addEventListener('pageshow', (e) => {
    try { sessionStorage.removeItem('wr_from_menu'); } catch { /* приватний режим */ }
    if (e.persisted) { clearTimeout(navLoaderTimer); document.documentElement.classList.remove('nav-leaving'); window.wrNavLoader?.stop(); }
    if (e.persisted && isOpen()) setMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { setMenu(false); toggle.focus({ preventScroll: true }); return; }
    // Поки меню відкрите, фокус ходить по колу: пункти меню, контакти, «Записатися» і кнопка «Закрити»
    if (e.key === 'Tab') {
      const items = [...$$('a, button', menu), toggle].filter((el) => !el.hidden && el.offsetParent !== null);
      const i = items.indexOf(document.activeElement);
      const next = i === -1 ? 0 : (i + (e.shiftKey ? -1 : 1) + items.length) % items.length;
      e.preventDefault();
      items[next].focus({ preventScroll: true });
    }
  });

  /* ---------- Рідке скло ----------
     --px (на <html>)   — положення курсора по горизонталі, від -1 до 1;
     --sy (на блоці)    — де блок на екрані по вертикалі, від -1 (вгорі) до 1 (внизу);
     --mx/--my          — курсор усередині блоку (відблиск по краю);
     --rx/--ry          — нахил блоку до курсора, до 3°.
     Смуга світла всередині скла зміщується від --px і --sy, тож скло «живе» при прокрутці й русі миші. */
  const root = document.documentElement;
  // Заломлення через SVG-фільтр у backdrop-filter уміє лише Chromium; Safari і Firefox лишаються з розмиттям
  const isChromium = !!navigator.userAgentData?.brands?.some((b) => /Chromium/.test(b.brand));
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  // На телефонах і планшетах заломлення не вмикаємо — воно найдорожче для відеокарти
  if (isChromium && finePointer && !reduceMotion && CSS.supports?.('backdrop-filter', 'url(#lg-refract) blur(1px)')) root.classList.add('lg-refract');
  const TILT = '.svc-card, .glass-card, .bento-card';
  const RIM = '.glass, .btn-glass, .btn-neon, .track-play';
  const visibleGlass = new Set();
  let pointer = null;
  let hovered = null;
  let glassRaf = 0;

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

  // Смуга світла рухається при прокрутці — на комп'ютерах і на телефонах, у прокрутці вниз і вгору. Легко:
  // IntersectionObserver тримає список видимих скляних блоків, на прокрутку (слухачі passive) — один
  // requestAnimationFrame на кадр, що оновлює --sy лише видимим блокам (getBoundingClientRect лише для них);
  // прокрутка зупинилась — подій немає, кадрів теж. Сама смуга — ::before, рухається лише transform.
  // Курсор (--px, нахил, відблиск по краю) — тільки для миші. prefers-reduced-motion — без руху.
  if (!reduceMotion) {
    const glassIO = 'IntersectionObserver' in window && new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? visibleGlass.add(en.target) : visibleGlass.delete(en.target)));
      scheduleGlass();
    });
    if (glassIO) $$('.glass, .btn-glass').forEach((el) => glassIO.observe(el));
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
  let gain = null;
  const playedOnce = new Set();
  // Позиція кожного треку (за id) у пам'яті сторінки: перемкнули на інший — попередній продовжиться з того ж місця
  const positions = new Map();
  const setWave = (el, t) => {
    const dur = durationOf(el);
    const wave = $('.track-wave', el);
    wave.style.setProperty('--p', `${dur ? Math.min(100, (t / dur) * 100) : 0}%`);
    wave.setAttribute('aria-valuenow', String(Math.round(t)));
    wave.setAttribute('aria-valuetext', fmt(t));
    $('[data-cur]', el).textContent = fmt(t);
  };

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
      // джерело → аналізатор → гучність → вихід: аналізатор (фон, хвилі, 3D) бачить сигнал без змін за будь-якої гучності
      gain = ctx.createGain();
      src.connect(analyser);
      analyser.connect(gain);
      gain.connect(ctx.destination);
      freq = new Uint8Array(analyser.frequencyBinCount);
    } catch { ctx = null; analyser = null; gain = null; }
    applyVolume();
  }

  function liveLoop() {
    raf = 0;
    if (!analyser || audio.paused) { window.wrAudioLevel = null; return; }
    analyser.getByteFrequencyData(freq);
    const bins = freq.length * 0.7;
    // Рівень звуку для фону (bg.js) і 3D-скульптури (hero3d.js): низькі й середні частоти, від 0 до 1
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
    if (current) {
      if (!audio.ended && audio.currentTime > 0) positions.set(current.dataset.id, audio.currentTime);
      setWave(current, positions.get(current.dataset.id) || 0);
      current.classList.remove('is-active', 'is-playing');
    }
    current = el;
    el.classList.add('is-active');
    audio.src = el.dataset.src;
    audio.preload = 'auto';
    // Продовжити з місця, де трек зупинили, щойно завантажаться метадані
    const saved = positions.get(el.dataset.id);
    if (saved) audio.addEventListener('loadedmetadata', () => { if (current === el && audio.currentTime < 0.5) audio.currentTime = Math.min(saved, (audio.duration || saved) - 0.5); }, { once: true });
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
      const t = current === el ? audio.currentTime : (positions.get(el.dataset.id) || 0);
      const step = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5, PageUp: 15, PageDown: -15 }[e.key];
      if (step !== undefined) { e.preventDefault(); seekTo(el, (t + step) / dur); }
      if (e.key === 'Home') { e.preventDefault(); seekTo(el, 0); }
      if (e.key === 'End') { e.preventDefault(); seekTo(el, 0.999); }
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); togglePlay(el); }
    });
  });

  /* Гучність (лише комп'ютер; на телефоні регулятора немає — гучність кнопками телефона): спільна для всіх треків,
     зберігається в localStorage. З Web Audio — GainNode, без нього — audio.volume. */
  const volBox = mini && $('[data-mini-vol]', mini);
  const volRange = volBox && $('[data-mini-range]', volBox);
  const volBtn = volBox && $('[data-mini-mute]', volBox);
  const volOn = !!volBox && matchMedia('(hover: hover) and (pointer: fine) and (min-width: 861px)').matches;
  let vol = 1;
  let muted = false;
  if (volOn) {
    try { const v = JSON.parse(localStorage.getItem('wr_volume') || 'null'); if (v && Number.isFinite(v.v)) { vol = Math.max(0, Math.min(1, v.v)); muted = !!v.m; } } catch { /* немає доступу */ }
  }
  function applyVolume() {
    const v = volOn && (muted || vol === 0) ? 0 : volOn ? vol : 1;
    if (gain && ctx) { audio.volume = 1; gain.gain.setTargetAtTime(v, ctx.currentTime, 0.015); } else audio.volume = v;
    if (!volBox) return;
    const pct = Math.round((muted ? 0 : vol) * 100);
    volRange.value = String(pct);
    volRange.setAttribute('aria-valuetext', `${pct}%`);
    volBox.style.setProperty('--vol', `${pct}%`);
    volBox.dataset.level = muted || vol === 0 ? 'mute' : vol < 0.5 ? 'low' : 'high';
    volBtn.setAttribute('aria-label', muted || vol === 0 ? 'Увімкнути звук' : 'Вимкнути звук');
  }
  const saveVolume = () => { try { localStorage.setItem('wr_volume', JSON.stringify({ v: vol, m: muted })); } catch { /* приватний режим */ } };
  if (volOn) {
    volRange.addEventListener('input', () => { vol = Number(volRange.value) / 100; muted = vol === 0; applyVolume(); saveVolume(); });
    volBtn.addEventListener('click', () => {
      if (muted || vol === 0) { muted = false; if (vol === 0) vol = 0.5; } else muted = true;
      applyVolume(); saveVolume();
    });
  }
  applyVolume();

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
    // Трек дограв — його позиція з початку
    if (current) { positions.delete(current.dataset.id); setWave(current, 0); }
    // наступний трек з того самого списку
    const list = current?.closest('.tracks');
    const items = list ? $$('[data-track]', list) : [];
    const next = items[items.indexOf(current) + 1];
    if (next) play(next);
  });

  if (mini) {
    $('[data-mini-toggle]', mini).addEventListener('click', () => { if (current) togglePlay(current); });
    // Клік по бару (окрім кнопок і гучності) чи кнопка «Перейти до треку» — плавно до рядка треку (з відступом під
    // шапку: Lenis і браузер беруть його зі scroll-padding-top), рядок коротко підсвічується
    const flash = (el) => { el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash'); setTimeout(() => el.classList.remove('is-flash'), 1500); };
    const goToTrack = () => {
      if (!current) return;
      const el = current;
      const lenis = window.wrMotion?.lenis;
      if (lenis) lenis.scrollTo(el, { offset: -16, duration: 1, onComplete: () => flash(el) });
      else { el.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' }); setTimeout(() => flash(el), reduceMotion ? 0 : 650); }
    };
    mini.addEventListener('click', (e) => {
      if (e.target.closest('[data-mini-go]') || !e.target.closest('button, input, [data-mini-vol]')) goToTrack();
    });
    $('[data-mini-close]', mini).addEventListener('click', () => {
      if (current && audio.currentTime > 0 && !audio.ended) positions.set(current.dataset.id, audio.currentTime);
      audio.pause();
      mini.hidden = true;
      current?.classList.remove('is-active', 'is-playing');
      current = null;
      audio.removeAttribute('src');
      audio.load();
    });
  }

  /* ---------- Навігація-прогрес по розділах (FAQ, Послуги, Портфоліо) ----------
     Розмітка — sectionNav() у public.js: на десктопі закріплена колонка ліворуч, на телефоні — ряд скляних чіпсів
     під шапкою. Поточний розділ — останній, чий верх уже вище лінії на 35 % висоти екрана (угорі сторінки — перший);
     ряд чіпсів гортається вбік так, щоб активний чіпс було видно. Клік по пункту — плавна прокрутка (якорі веде motion.js).
     Повертає функцію оновлення: update('instant') — миттєво доставити активний чіпс у видиму зону. */
  function sectionNav(scope, groups) {
    const links = $$('[data-faq-link]', scope);
    const navRow = $('.faq-nav-list', scope);
    if (!groups.length || !links.length) return () => {};
    let active = null;
    const showChip = (a, behavior) => {
      if (a && navRow && navRow.scrollWidth > navRow.clientWidth + 1) {
        navRow.scrollTo({ left: a.offsetLeft - (navRow.clientWidth - a.offsetWidth) / 2, behavior });
      }
    };
    const setActive = (id, behavior = reduceMotion ? 'auto' : 'smooth') => {
      if (id === active) {
        // Повторно — лише щоб миттєво доставити чіпс у видиму зону (після стрибка сторінки чи завантаження шрифтів)
        if (behavior === 'instant') showChip(links.find((a) => a.hash === `#${id}`), 'instant');
        return;
      }
      active = id;
      links.forEach((a) => {
        const on = a.hash === `#${id}`;
        a.classList.toggle('is-active', on);
        if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
        if (on) showChip(a, behavior);
      });
    };
    let ticking = false;
    const update = (behavior) => {
      ticking = false;
      const line = innerHeight * 0.35;
      let cur = groups[0];
      for (const g of groups) if (g.getBoundingClientRect().top <= line) cur = g;
      setActive(cur.id, typeof behavior === 'string' ? behavior : undefined);
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => update()); } }, { passive: true });
    addEventListener('resize', () => update(), { passive: true });
    update('instant');
    // Шрифти змінюють ширину чіпсів — після них ще раз ставимо активний на місце
    document.fonts?.ready.then(() => update('instant'));
    return update;
  }

  /* ---------- Питання та відповіді (/faq) ----------
     Основа — нативні details/summary: без JS усе відкривається й закривається саме.
     Тут: у межах групи відкрите одне питання; aria-expanded на summary; хеш в URL (#installments)
     відкриває й прокручує до питання, а відкриття оновлює хеш без стрибка (history.replaceState);
     підсвітка поточної групи в колонці ліворуч (на телефоні — у ряді чіпсів).
     Плавне розгортання дає motion.js (wrMotion.faqAnim); без нього — миттєво. */
  const faq = $('[data-faq]');
  if (faq) {
    const items = $$('[data-faq-item]', faq);
    const useHash = faq.hasAttribute('data-faq-hash'); // хеш в адресі — лише на сторінці FAQ, не на головній
    const shown = (d) => d.open && !d.classList.contains('is-closing');
    const sync = (d) => $('summary', d).setAttribute('aria-expanded', String(shown(d)));
    const setHash = (id) => {
      const url = id ? `#${id}` : location.pathname + location.search;
      try { history.replaceState(history.state, '', url); } catch { /* file:// тощо */ }
    };
    // Ексклюзивність робимо самі (з анімацією закриття сусіда), тож нативне name="" прибираємо
    items.forEach((d) => { d.removeAttribute('name'); sync(d); });

    async function setItem(d, open, { animate = true, hash = true } = {}) {
      if (open === shown(d)) return;
      const anim = animate && !reduceMotion ? window.wrMotion?.faqAnim : null;
      if (open) {
        $$('[data-faq-item]', d.closest('[data-faq-group]') || faq).forEach((o) => { if (o !== d && shown(o)) setItem(o, false, { animate, hash: false }); });
        d.classList.remove('is-closing');
        d.open = true;
        sync(d);
        if (useHash && hash && d.id) setHash(d.id);
        if (anim) await anim(d, true);
      } else {
        d.classList.add('is-closing');
        sync(d);
        if (useHash && hash && d.id && location.hash === `#${d.id}`) setHash('');
        if (anim) {
          const done = await anim(d, false);
          if (!done || !d.classList.contains('is-closing')) return; // поки закривалось, питання відкрили знову
        }
        d.classList.remove('is-closing');
        d.open = false;
        sync(d);
      }
    }

    items.forEach((d) => {
      $('summary', d).addEventListener('click', (e) => {
        e.preventDefault();
        setItem(d, !shown(d));
      });
      // Браузер може відкрити details сам (пошук на сторінці) — тримаємо стан і сусідів у порядку
      d.addEventListener('toggle', () => {
        if (d.open && !d.classList.contains('is-closing')) {
          $$('[data-faq-item]', d.closest('[data-faq-group]') || faq).forEach((o) => { if (o !== d && o.open && !o.classList.contains('is-closing')) { o.open = false; sync(o); } });
        }
        sync(d);
      });
    });

    let updateActive = () => {};
    // Хеш → відкрити питання і прокрутити до нього
    const byHash = (hash) => {
      let id = '';
      try { id = decodeURIComponent(String(hash || '').slice(1)); } catch { return null; }
      const el = id && document.getElementById(id);
      return el && el.matches('[data-faq-item]') ? el : null;
    };
    const openFromHash = (smooth) => {
      const d = byHash(location.hash);
      if (!d) return;
      setItem(d, true, { animate: smooth, hash: false });
      requestAnimationFrame(() => {
        const lenis = window.wrMotion?.lenis;
        if (smooth && lenis) lenis.scrollTo(d);
        else d.scrollIntoView({ block: 'start', behavior: smooth && !reduceMotion ? 'smooth' : 'instant' });
        // Після стрибка сторінки плавна прокрутка ряду чіпсів може перерватися — ставимо активний чіпс одразу
        if (!smooth) updateActive('instant');
      });
    };
    openFromHash(false);
    addEventListener('hashchange', () => openFromHash(true));
    // Посилання на питання на цій самій сторінці: відкриваємо (прокрутку робить motion.js або браузер)
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href*="#"]');
      if (!a || a.pathname !== location.pathname) return;
      const d = byHash(a.hash);
      if (d) setItem(d, true, { hash: false });
    });

    updateActive = sectionNav(faq, $$('[data-faq-group]', faq));
  }
  // Навігація-прогрес на сторінках Послуги й Портфоліо — той самий компонент, що на FAQ
  $$('[data-secnav]').forEach((el) => sectionNav(el, $$('[data-secnav-group]', el)));

  /* ---------- Галерея: перегляд фото ----------
     Діалог на весь екран; фото в рамці .lb-frame, кнопка закриття — на самому фото (правий верхній кут).
     Гортання: стрілки ← → на клавіатурі, скляні кнопки-стрілки (комп'ютер), свайп (Pointer Events: фото йде за пальцем
     і докручується до сусіднього, якщо зсув > ¼ ширини чи свайп швидкий, інакше повертається; свайп униз закриває).
     Перехід — зсув із легким згасанням (~0,37 с); сусідні фото вантажаться заздалегідь. Далі фото немає — «упор»:
     фото трохи зсувається в бік спроби (при свайпі — з опором) і пружно повертається; стрілка з того боку неактивна.
     prefers-reduced-motion — без зсувів, лише проявлення. Фокус при відкритті — на сам діалог (без контуру),
     контур на кнопках — лише при навігації Tab (:focus-visible). */
  const lightbox = $('[data-lightbox]');
  if (lightbox && typeof lightbox.showModal === 'function') {
    const img = $('[data-lightbox-img]', lightbox);
    const frame = $('[data-lb-frame]', lightbox);
    const stage = $('[data-lb-stage]', lightbox);
    const prevBtn = $('[data-lb-prev]', lightbox);
    const nextBtn = $('[data-lb-next]', lightbox);
    const count = $('[data-lb-count]', lightbox);
    const opens = $$('.g-open');
    const photos = opens.map((b) => ({ src: b.dataset.full, alt: b.dataset.alt || '' }));
    let index = 0;
    let busy = false;
    const preload = (i) => { if (photos[i]) { const im = new Image(); im.decoding = 'async'; im.src = photos[i].src; } };
    const decoded = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve());
    const clear = () => frame.getAnimations().forEach((a) => a.cancel());
    const anim = (keyframes, opts) => frame.animate(keyframes, { fill: 'forwards', ...opts }).finished.catch(() => {});
    function sync() {
      prevBtn.disabled = index <= 0;
      nextBtn.disabled = index >= photos.length - 1;
      count.textContent = `${index + 1} / ${photos.length}`;
      count.hidden = photos.length < 2;
      preload(index - 1);
      preload(index + 1);
    }
    function setPhoto(i) {
      index = i;
      img.src = photos[i].src;
      img.alt = photos[i].alt;
      sync();
    }
    // Упор: далі фото немає — фото трохи зсувається в бік спроби й пружно повертається
    async function bump(dir, fromX = 0) {
      if (reduceMotion) return;
      clear();
      const x = fromX || dir * 34;
      if (!fromX) await anim([{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(${x}px,0,0)` }], { duration: 130, easing: 'cubic-bezier(0, 0, .2, 1)' });
      await anim([{ transform: `translate3d(${x}px,0,0)` }, { transform: 'translate3d(0,0,0)' }], { duration: 480, easing: 'cubic-bezier(.2, 1.45, .35, 1)' });
      clear();
    }
    // Перехід до сусіднього фото: поточне йде в бік гортання зі згасанням, нове заходить з протилежного боку
    async function go(dir, fromX = 0) {
      if (busy) return;
      const to = index + dir;
      if (to < 0 || to >= photos.length) { bump(dir, fromX); return; }
      busy = true;
      clear();
      const shift = reduceMotion ? 0 : 60;
      const out = fromX ? fromX - dir * 80 : -dir * shift;
      await anim([{ transform: `translate3d(${fromX}px,0,0)`, opacity: 1 }, { transform: `translate3d(${out}px,0,0)`, opacity: 0 }], { duration: 170, easing: 'cubic-bezier(.4, 0, 1, 1)' });
      setPhoto(to);
      await decoded();
      await anim([{ transform: `translate3d(${dir * shift}px,0,0)`, opacity: 0 }, { transform: 'translate3d(0,0,0)', opacity: 1 }], { duration: 200, easing: 'cubic-bezier(0, 0, .2, 1)' });
      clear();
      busy = false;
    }
    opens.forEach((b, i) => b.addEventListener('click', () => {
      setPhoto(i);
      lightbox.showModal();
      // showModal сам фокусує першу кнопку (і стрілки потім «підсвічували» закриття) — фокус на сам діалог
      lightbox.focus({ preventScroll: true });
      if (!reduceMotion) decoded().then(() => anim([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0, 0, .2, 1)' })).then(clear);
    }));
    $('[data-lightbox-close]', lightbox).addEventListener('click', () => lightbox.close());
    prevBtn.addEventListener('click', () => go(-1));
    nextBtn.addEventListener('click', () => go(1));
    lightbox.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    });
    // Клік повз фото (по затемненню) — закрити
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox || e.target === stage) lightbox.close(); });

    // Свайп (палець чи стилус; мишею — кліки й стрілки)
    let drag = null;
    stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || busy || e.target.closest('button')) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), axis: '', dx: 0, dy: 0 };
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.axis) {
        if (Math.hypot(dx, dy) < 8) return;
        drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        try { stage.setPointerCapture(e.pointerId); } catch { /* палець уже відпущено */ }
        clear();
      }
      if (drag.axis === 'x') {
        const edge = (dx > 0 && index === 0) || (dx < 0 && index === photos.length - 1);
        // Біля краю — опір, що зростає з відстанню (не більше ~40 px)
        drag.dx = edge ? Math.sign(dx) * 40 * (1 - Math.exp(-Math.abs(dx) / 120)) : dx;
        if (!reduceMotion) frame.style.transform = `translate3d(${drag.dx}px,0,0)`;
        frame.style.opacity = String(1 - Math.min(0.35, Math.abs(drag.dx) / (frame.offsetWidth * 2.5)));
      } else {
        drag.dy = Math.max(0, dy);
        if (!reduceMotion) frame.style.transform = `translate3d(0,${drag.dy * 0.6}px,0)`;
        frame.style.opacity = String(1 - Math.min(0.5, drag.dy / 500));
      }
    });
    const endDrag = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      const dt = Math.max(1, performance.now() - d.t);
      frame.style.transform = '';
      frame.style.opacity = '';
      if (d.axis === 'x') {
        const dir = d.dx < 0 ? 1 : -1;
        const edge = (dir < 0 && index === 0) || (dir > 0 && index === photos.length - 1);
        const fast = Math.abs(d.dx) / dt > 0.5 && Math.abs(d.dx) > 30;
        const x = reduceMotion ? 0 : d.dx;
        if (edge) bump(dir, x);
        else if (Math.abs(d.dx) > frame.offsetWidth / 4 || fast) go(dir, x);
        else if (x) anim([{ transform: `translate3d(${x}px,0,0)` }, { transform: 'translate3d(0,0,0)' }], { duration: 420, easing: 'cubic-bezier(.2, 1.3, .35, 1)' }).then(clear);
      } else if (d.axis === 'y') {
        if (d.dy > 110) { lightbox.close(); return; }
        const y = reduceMotion ? 0 : d.dy * 0.6;
        if (y) anim([{ transform: `translate3d(0,${y}px,0)` }, { transform: 'translate3d(0,0,0)' }], { duration: 380, easing: 'cubic-bezier(.2, 1.2, .35, 1)' }).then(clear);
      }
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    lightbox.addEventListener('close', () => { clear(); frame.style.transform = ''; frame.style.opacity = ''; busy = false; drag = null; });
  }
})();
