/* Wave Records — сторінка запису через Cal.com (/book, статична версія).
   Крок 1: вибір послуги (картки). Крок 2: календар Cal.com для цього типу запису (inline embed) або, поки тип запису
   не заповнений у content/booking.json, кнопка «Записатися в Telegram».
   - embed.js з app.cal.com вантажиться лише після вибору послуги з календарем (на інших сторінках його немає);
   - кожна послуга — окремий простір імен Cal (свій календар), тож повернення до вже відкритої послуги миттєве;
   - ?service=id в адресі одразу обирає послугу; вибір записується в адресу (history.replaceState);
   - аналітика (dataLayer через window.wrTrack із site.js): booking_service_select — при виборі послуги,
     booking_success — після успішного запису (Cal: bookingSuccessful / bookingSuccessfulV2), без дублів. */
(() => {
  'use strict';
  const root = document.querySelector('[data-book]');
  const dataEl = document.getElementById('book-cal-data');
  if (!root || !dataEl) return;
  const data = JSON.parse(dataEl.textContent);
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CAL_ORIGIN = 'https://app.cal.com';
  const CAL_SCRIPT = `${CAL_ORIGIN}/embed/embed.js`;

  const step2 = $('[data-book-time]');
  const cal = $('[data-book-cal]');
  const els = {
    name: $('[data-book-name]'), meta: $('[data-book-meta]'), change: $('[data-book-change]'),
    loading: $('[data-book-loading]'), error: $('[data-book-error]'), errorLink: $('[data-book-error-link]'), stub: $('[data-book-stub]'),
    title: $('#book-h-time'),
  };
  const cards = $$('[data-book-service]');
  const byId = new Map(data.services.map((s) => [s.id, s]));

  const track = (name, params) => {
    if (window.wrTrack) window.wrTrack(name, params);
    else (window.dataLayer = window.dataLayer || []).push({ event: name, ...params });
  };

  /* ---------- Cal.com ---------- */
  // Офіційний завантажувач Cal.com (embed snippet): створює window.Cal і чергу викликів, сам embed.js додає в <head>
  // при першому виклику. Викликається лише тут — після вибору послуги з календарем.
  function calApi() {
    if (window.Cal) return window.Cal;
    /* eslint-disable */
    (function (C, A, L) { let p = function (a, ar) { a.q.push(ar); }; let d = C.document; C.Cal = C.Cal || function () { let cal = C.Cal; let ar = arguments; if (!cal.loaded) { cal.ns = {}; cal.q = cal.q || []; d.head.appendChild(d.createElement('script')).src = A; cal.loaded = true; } if (ar[0] === L) { const api = function () { p(api, arguments); }; const namespace = ar[1]; api.q = api.q || []; if (typeof namespace === 'string') { cal.ns[namespace] = cal.ns[namespace] || api; p(cal.ns[namespace], ar); p(cal, ['initNamespace', namespace]); } else p(cal, ar); return; } p(cal, ar); }; })(window, CAL_SCRIPT, 'init');
    /* eslint-enable */
    return window.Cal;
  }

  // Кольори бренду для календаря — зі змінних site.css (у JS hex не дублюємо)
  const cssVar = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  function calTheme() {
    const pink = cssVar('--pink', '');
    const black = cssVar('--black', '');
    const white = cssVar('--white', '');
    const vars = { 'cal-brand': pink, 'cal-brand-emphasis': pink, 'cal-brand-text': black, 'cal-text': white, 'cal-text-emphasis': white };
    for (const k of Object.keys(vars)) if (!vars[k]) delete vars[k];
    return { theme: 'dark', hideEventTypeDetails: true, layout: 'month_view', cssVarsPerTheme: { dark: vars }, styles: pink ? { branding: { brandColor: pink } } : undefined };
  }

  const embeds = new Map(); // id послуги → { box, ready, failed }
  const seenBookings = new Set();
  const lastSuccess = new Map();
  let current = null;
  let loadTimer = 0;

  function onBooked(service, e) {
    const d = (e && e.detail && e.detail.data) || {};
    const uid = d.uid || (d.booking && d.booking.uid) || '';
    // Cal надсилає обидві події (стару bookingSuccessful і нову V2) на один запис — рахуємо один раз:
    // за uid запису, а якщо його немає — одна подія на послугу протягом 10 с
    const now = Date.now();
    if ((uid && seenBookings.has(uid)) || now - (lastSuccess.get(service.id) || 0) < 10000) return;
    if (uid) seenBookings.add(uid);
    lastSuccess.set(service.id, now);
    track('booking_success', { service: service.name, service_id: service.id });
  }

  function showStatus(entry) {
    clearTimeout(loadTimer);
    els.loading.hidden = !(entry && !entry.ready && !entry.failed);
    els.error.hidden = !(entry && entry.failed);
    if (entry && entry.failed) els.errorLink.href = `https://cal.com/${current.calLink}`;
    // Не завантажився за 20 с (немає мережі, блокувальник) — посилання на сторінку запису Cal.com
    if (entry && !entry.ready && !entry.failed) loadTimer = setTimeout(() => { entry.failed = true; if (current && embeds.get(current.id) === entry) showStatus(entry); }, 20000);
  }

  function openCalendar(service) {
    let entry = embeds.get(service.id);
    if (!entry) {
      const ns = `wr_${service.id.replace(/[^a-z0-9]/gi, '_')}`;
      const box = document.createElement('div');
      box.className = 'book-cal-embed';
      box.id = `book-cal-${service.id}`;
      cal.appendChild(box);
      entry = { box, ready: false, failed: false };
      embeds.set(service.id, entry);
      const Cal = calApi();
      // Скрипт не завантажився (немає мережі чи його заблоковано)
      const script = document.querySelector(`script[src="${CAL_SCRIPT}"]`);
      if (script && !script.dataset.wrWatch) {
        script.dataset.wrWatch = '1';
        script.addEventListener('error', () => { embeds.forEach((x) => { if (!x.ready) x.failed = true; }); if (current && current.calLink) showStatus(embeds.get(current.id)); });
      }
      Cal('init', ns, { origin: CAL_ORIGIN });
      const api = Cal.ns[ns];
      api('inline', { elementOrSelector: `#${box.id}`, calLink: service.calLink, config: { layout: 'month_view', theme: 'dark' } });
      api('ui', calTheme());
      const ready = () => { entry.ready = true; entry.failed = false; if (current === service) showStatus(entry); refreshLayout(); };
      api('on', { action: 'linkReady', callback: ready });
      api('on', { action: 'linkFailed', callback: () => { entry.failed = true; if (current === service) showStatus(entry); } });
      api('on', { action: 'bookingSuccessfulV2', callback: (e) => onBooked(service, e) });
      api('on', { action: 'bookingSuccessful', callback: (e) => onBooked(service, e) });
    }
    embeds.forEach((x, id) => { x.box.hidden = id !== service.id; });
    showStatus(entry);
  }

  /* ---------- Вибір послуги ---------- */
  // Висота сторінки змінилась (з'явився крок 2, календар підріс) — перерахувати анімації на скролі
  let refreshQueued = 0;
  function refreshLayout() {
    cancelAnimationFrame(refreshQueued);
    refreshQueued = requestAnimationFrame(() => window.wrMotion?.ScrollTrigger?.refresh());
  }
  if ('ResizeObserver' in window) new ResizeObserver(refreshLayout).observe(step2);

  function scrollToEl(el) {
    const lenis = window.wrMotion?.lenis;
    if (lenis && !reduce) lenis.scrollTo(el, { duration: 1 });
    else el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  function reveal() {
    if (!step2.hidden) return;
    step2.hidden = false;
    if (step2.animate) {
      step2.animate(reduce
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ opacity: 0, transform: 'translateY(28px)' }, { opacity: 1, transform: 'none' }],
      { duration: reduce ? 300 : 700, easing: 'cubic-bezier(.16, 1, .3, 1)' });
    }
    refreshLayout();
  }

  function select(id, { source = 'click', scroll = true } = {}) {
    const service = byId.get(id);
    if (!service) return;
    const same = current === service;
    current = service;
    cards.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.bookService === id)));
    els.name.textContent = service.name;
    els.meta.textContent = [service.duration, service.price].filter(Boolean).join(' · ');
    els.stub.hidden = !!service.calLink;
    if (service.calLink) openCalendar(service);
    else { embeds.forEach((x) => { x.box.hidden = true; }); showStatus(null); }
    reveal();
    // Адреса з обраною послугою — щоб можна було поділитися чи оновити сторінку
    try {
      const url = new URL(location.href);
      url.searchParams.set('service', id);
      history.replaceState(history.state, '', url);
    } catch { /* без History API — нічого */ }
    if (!same) track('booking_service_select', { service: service.name, service_id: service.id, source });
    if (scroll) {
      scrollToEl(step2);
      els.title.focus({ preventScroll: true });
    }
  }

  cards.forEach((card) => card.addEventListener('click', () => select(card.dataset.bookService)));
  els.change.addEventListener('click', () => {
    scrollToEl($('#book-service'));
    const card = cards.find((c) => c.getAttribute('aria-pressed') === 'true') || cards[0];
    card?.focus({ preventScroll: true });
  });

  // ?service=… в адресі — одразу обрати послугу; прокрутка до календаря — коли сторінка вже з'явилась
  const pre = new URLSearchParams(location.search).get('service');
  if (pre && byId.has(pre)) {
    select(pre, { source: 'url', scroll: false });
    Promise.resolve(window.wrMotion?.entered).then(() => setTimeout(() => {
      if (step2.getBoundingClientRect().top > innerHeight * 0.6) scrollToEl(step2);
    }, 500));
  }
})();
