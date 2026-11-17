/* Wave Records — сторінка запису через Cal.com (/book, статична версія).
   Крок 1: вибір послуги (картки). Крок 2: календар Cal.com для цього типу запису (inline embed) або, поки тип запису
   не заповнений у content/booking.json, кнопка «Записатися в Telegram».
   - embed.js з app.cal.com вантажиться лише після вибору послуги з календарем (на інших сторінках його немає);
   - кожна послуга — окремий простір імен Cal (свій календар), тож повернення до вже відкритої послуги миттєве;
   - ?service=id в адресі одразу обирає послугу; вибір записується в адресу (history.replaceState);
   - аналітика (dataLayer через window.wrTrack із site.js): booking_service_select — при виборі послуги,
     booking_success — після успішного запису (Cal: bookingSuccessful / bookingSuccessfulV2), рівно один раз;
   - після запису календар зникає, замість англійського підтвердження Cal.com — власний екран успіху [data-book-done]
     (дата й час — за київським часом, «Додати в Google Calendar», файл .ics створюється в браузері). */
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

  const embeds = new Map(); // id послуги → { box, ready, failed, booked }
  const seenBookings = new Set();
  let current = null;
  let loadTimer = 0;
  let nsCount = 0;

  /* ---------- Екран успіху (замість підтвердження Cal.com) ---------- */
  const done = $('[data-book-done]');
  const flow = [$('.book-step-head', step2), $('.book-chosen', step2), cal, $('[data-book-note]')].filter(Boolean);
  const S = data.success || {};
  const KYIV = 'Europe/Kyiv';
  let booking = null; // { service, start, end, minutes, uid }
  let doneTimer = 0;

  // Дані з події Cal.com: нова bookingSuccessfulV2 — { uid, title, startTime, endTime, … },
  // стара bookingSuccessful — { booking: { uid, startTime, endTime }, eventType: { length }, date, duration }
  function bookingData(d) {
    const b = (d && d.booking) || {};
    const date = (v) => { const x = v ? new Date(v) : null; return x && !isNaN(x) ? x : null; };
    const start = date(d && d.startTime) || date(b.startTime) || date(d && d.date);
    let end = date(d && d.endTime) || date(b.endTime);
    let minutes = Number((d && d.duration) || (d && d.eventType && d.eventType.length)) || 0;
    if (start && end && !minutes) minutes = Math.round((end - start) / 60000);
    if (start && !end && minutes) end = new Date(+start + minutes * 60000);
    return { uid: (d && d.uid) || b.uid || '', start, end: end && start && end > start ? end : null, minutes: minutes > 0 ? minutes : 0 };
  }

  const fmt = (o) => new Intl.DateTimeFormat('uk-UA', { timeZone: KYIV, ...o });
  const fmtDate = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fmtTime = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  function fmtMinutes(m) {
    const h = Math.floor(m / 60), r = m % 60;
    return [h ? `${h} ${S.hour || 'год'}` : '', r ? `${r} ${S.min || 'хв'}` : ''].filter(Boolean).join(' ');
  }
  // 20261118T120000Z — формат дат для Google Calendar і .ics (UTC)
  const utc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const eventTitle = (service) => (S.event_title || '{service}').replace('{service}', service.name);

  function googleLink(b) {
    const p = new URLSearchParams({ action: 'TEMPLATE', text: eventTitle(b.service), dates: `${utc(b.start)}/${utc(b.end)}`, location: S.location || '', ctz: KYIV });
    return `https://calendar.google.com/calendar/render?${p}`;
  }

  function downloadIcs(b) {
    const esc = (s) => String(s || '').replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\r?\n/g, '\\n');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wave Records//Booking//UK', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${esc(b.uid || `${utc(b.start)}-${b.service.id}`)}@wave-records`,
      `DTSTAMP:${utc(new Date())}`, `DTSTART:${utc(b.start)}`, `DTEND:${utc(b.end)}`,
      `SUMMARY:${esc(eventTitle(b.service))}`, `LOCATION:${esc(S.location)}`,
      'END:VEVENT', 'END:VCALENDAR', '',
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'wave-records.ics' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('[data-done-ics]', done)?.addEventListener('click', () => { if (booking && booking.start && booking.end) downloadIcs(booking); });

  function fillDone(b) {
    const when = !!(b.start && b.end);
    $('[data-done-service]', done).textContent = b.service.name;
    $$('[data-done-when]', done).forEach((el) => { el.hidden = !when; });
    const dur = b.minutes ? fmtMinutes(b.minutes) : b.service.duration || '';
    $('[data-done-dur]', done).hidden = !dur;
    $('[data-done-duration]', done).textContent = dur;
    if (when) {
      const day = fmtDate.format(b.start);
      $('[data-done-date]', done).textContent = day.charAt(0).toUpperCase() + day.slice(1);
      $('[data-done-time]', done).textContent = `${fmtTime.format(b.start)}–${fmtTime.format(b.end)}`;
      $('[data-done-google]', done).href = googleLink(b);
    }
  }

  const fade = (el, keyframes, ms, fill = 'none') => el.animate?.(keyframes, { duration: reduce ? Math.min(ms, 250) : ms, easing: 'cubic-bezier(.16, 1, .3, 1)', fill });
  const resetFlow = () => flow.forEach((el) => { el.getAnimations?.().forEach((a) => a.cancel()); });

  function showDone() {
    fillDone(booking);
    resetFlow();
    flow.forEach((el) => { el.hidden = true; });
    done.hidden = false;
    fade(done, reduce ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(24px) scale(.98)' }, { opacity: 1, transform: 'none' }], 800);
    refreshLayout();
    scrollToEl(step2);
    done.focus({ preventScroll: true });
  }

  // Нова послуга після запису (чи під час зникання календаря) — знову крок 2 з календарем
  function hideDone() {
    clearTimeout(doneTimer);
    booking = null;
    resetFlow();
    done.hidden = true;
    flow.forEach((el) => { el.hidden = false; });
    const live = new Set([...embeds.values()].map((x) => x.box));
    $$('.book-cal-embed', cal).forEach((box) => { if (!live.has(box)) box.remove(); });
  }

  function onBooked(service, entry, e) {
    const d = (e && e.detail && e.detail.data) || {};
    const info = bookingData(d);
    // Cal надсилає на один запис дві події (стару bookingSuccessful і нову V2) — друга лише доповнює дані
    if (entry.booked) {
      if (booking && booking.service === service) {
        if (!booking.start && info.start) Object.assign(booking, { start: info.start, end: info.end });
        if (!booking.minutes && info.minutes) booking.minutes = info.minutes;
        if (!booking.uid && info.uid) booking.uid = info.uid;
        if (!done.hidden) fillDone(booking);
      }
      return;
    }
    entry.booked = true;
    if (info.uid && seenBookings.has(info.uid)) return;
    if (info.uid) seenBookings.add(info.uid);
    track('booking_success', { service: service.name, service_id: service.id });
    booking = { service, ...info };
    // Календар (з англійським підтвердженням Cal.com) плавно зникає, далі — власний екран успіху.
    // Використаний календар більше не показуємо: повторний вибір послуги відкриє новий.
    embeds.delete(service.id);
    clearTimeout(loadTimer);
    flow.forEach((el) => fade(el, [{ opacity: 1 }, { opacity: 0 }], 280, 'forwards'));
    doneTimer = setTimeout(() => { entry.box.remove(); if (current === service) showDone(); }, reduce ? 0 : 300);
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
      // Простір імен — новий для кожного календаря (після запису послугу можна обрати знову — буде новий календар)
      const ns = `wr_${service.id.replace(/[^a-z0-9]/gi, '_')}_${++nsCount}`;
      const box = document.createElement('div');
      box.className = 'book-cal-embed';
      box.id = `book-cal-${ns}`;
      box.dataset.calNs = ns;
      cal.appendChild(box);
      entry = { box, ready: false, failed: false, booked: false };
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
      // Опис події сховано (hideEventTypeDetails), але вибір тривалості (1–4 год) і часовий пояс лишаються видимими
      api('inline', {
        elementOrSelector: `#${box.id}`, calLink: service.calLink,
        config: { layout: 'month_view', theme: 'dark', showEventDurationWhenEventDetailsHidden: 'true', showTimezoneWhenEventDetailsHidden: 'true' },
      });
      api('ui', calTheme());
      const ready = () => { entry.ready = true; entry.failed = false; if (current === service) showStatus(entry); refreshLayout(); };
      api('on', { action: 'linkReady', callback: ready });
      api('on', { action: 'linkFailed', callback: () => { entry.failed = true; if (current === service) showStatus(entry); } });
      api('on', { action: 'bookingSuccessfulV2', callback: (e) => onBooked(service, entry, e) });
      api('on', { action: 'bookingSuccessful', callback: (e) => onBooked(service, entry, e) });
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
    hideDone();
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
