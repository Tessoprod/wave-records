/* Wave Records — сторінка запису через Cal.com (/book, статична версія).
   Крок 1: випадний список усіх послуг (чекбокси в групах Sound / Media | PR / BUSINESS). Можна обрати кілька послуг,
   але лише один пакет (data-package) — спроба обрати другий показує сповіщення.
   Крок 2: обрані послуги з описами; для кожної послуги із записом у студії (calLink) — свій календар Cal.com
   (inline embed, свій namespace), для решти — блок «робиться дистанційно, деталі в Telegram».
   - embed.js з app.cal.com вантажиться лише коли обрано послугу з календарем (на інших сторінках його немає);
   - зняли послугу — її календар ховається (не видаляється), повторний вибір показує його миттєво;
   - ?service=id[,id…] в адресі одразу обирає послуги; вибір записується в адресу (history.replaceState);
   - аналітика (dataLayer через window.wrTrack із site.js): booking_service_select — при додаванні послуги,
     booking_success — після успішного запису (Cal: bookingSuccessful / bookingSuccessfulV2), рівно один раз на календар;
   - після запису календар цієї послуги зникає, на його місці — власний екран успіху (з шаблону [data-done-template]):
     дата й час — за київським часом, «Додати в Google Calendar», файл .ics створюється в браузері. */
(() => {
  'use strict';
  const root = document.querySelector('[data-book]');
  const dataEl = document.getElementById('book-cal-data');
  if (!root || !dataEl) return;
  const data = JSON.parse(dataEl.textContent);
  const T = data.texts || {};
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CAL_ORIGIN = 'https://app.cal.com';
  const CAL_SCRIPT = `${CAL_ORIGIN}/embed/embed.js`;

  const step2 = $('[data-book-time]');
  const title2 = $('#book-h-time');
  const calsBox = $('[data-book-cals]');
  const calTpl = $('[data-cal-template]');
  const doneTpl = $('[data-done-template]');
  const remote = $('[data-book-remote]');
  const order = data.services.map((s) => s.id);
  const byId = new Map(data.services.map((s) => [s.id, s]));
  const picked = new Set(); // id обраних послуг

  const track = (name, params) => {
    if (window.wrTrack) window.wrTrack(name, params);
    else (window.dataLayer = window.dataLayer || []).push({ event: name, ...params });
  };

  // ?debug=booking — у консоль: вибір послуг, усі події від Cal.com і зміни висоти iframe
  const DEBUG = new URLSearchParams(location.search).get('debug') === 'booking';
  const dbg = (...a) => { if (DEBUG) console.log('[booking]', ...a); };

  const fade = (el, keyframes, ms, fill = 'none') => el.animate?.(keyframes, { duration: reduce ? Math.min(ms, 250) : ms, easing: 'cubic-bezier(.16, 1, .3, 1)', fill });
  const appear = (el, dy = 20, ms = 600) => fade(el, reduce ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: `translateY(${dy}px)` }, { opacity: 1, transform: 'none' }], ms);

  // Висота сторінки змінилась (крок 2, календар підріс) — перерахувати анімації на скролі
  let refreshQueued = 0;
  function refreshLayout() {
    cancelAnimationFrame(refreshQueued);
    refreshQueued = requestAnimationFrame(() => window.wrMotion?.ScrollTrigger?.refresh());
  }
  if ('ResizeObserver' in window) new ResizeObserver(refreshLayout).observe(step2);

  function scrollToEl(el, offset = 0) {
    const lenis = window.wrMotion?.lenis;
    if (lenis && !reduce) lenis.scrollTo(el, { duration: 1, offset });
    else el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  /* ---------- Випадний список послуг ---------- */
  const picker = $('[data-picker]');
  const pickBtn = $('[data-picker-btn]');
  const panel = $('[data-picker-panel]');
  const pickValue = $('[data-picker-value]');
  const pickCount = $('[data-picker-count]');
  const alertEl = $('[data-picker-alert]');
  const boxes = $$('[data-book-service]', panel);

  function openPicker(focusFirst = false) {
    if (!panel.hidden) return;
    // Панель вміщається у вільне місце під кнопкою (разом із «Готово»), але не нижча за 320 px
    const room = innerHeight - pickBtn.getBoundingClientRect().bottom - 28;
    panel.style.maxHeight = `${Math.round(Math.max(320, Math.min(640, room)))}px`;
    panel.hidden = false;
    pickBtn.setAttribute('aria-expanded', 'true');
    picker.classList.add('is-open');
    panel.getAnimations?.().forEach((a) => a.cancel());
    fade(panel, reduce ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(-10px) scale(.98)' }, { opacity: 1, transform: 'none' }], 380);
    if (focusFirst) (boxes.find((b) => b.checked) || boxes[0])?.focus({ preventScroll: true });
  }
  function closePicker(focusBtn = false) {
    if (panel.hidden || pickBtn.getAttribute('aria-expanded') === 'false') return;
    pickBtn.setAttribute('aria-expanded', 'false');
    picker.classList.remove('is-open');
    const a = fade(panel, [{ opacity: 1 }, { opacity: 0, transform: reduce ? 'none' : 'translateY(-6px)' }], 200);
    const hide = () => { if (pickBtn.getAttribute('aria-expanded') === 'false') panel.hidden = true; };
    if (a) a.onfinish = hide; else hide();
    if (focusBtn) pickBtn.focus({ preventScroll: true });
  }
  pickBtn.addEventListener('click', () => (pickBtn.getAttribute('aria-expanded') === 'true' ? closePicker() : openPicker()));
  $('[data-picker-done]', panel).addEventListener('click', () => {
    closePicker(true);
    if (picked.size) setTimeout(() => scrollToEl(step2, -16), reduce ? 0 : 120);
  });
  document.addEventListener('pointerdown', (e) => { if (!panel.hidden && !picker.contains(e.target)) closePicker(); });
  picker.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { e.preventDefault(); closePicker(true); } });
  picker.addEventListener('focusout', (e) => { if (!panel.hidden && e.relatedTarget && !picker.contains(e.relatedTarget)) closePicker(); });

  // Сповіщення «Можна обрати лише один пакет…»: з'являється біля списку й ховається за ~4 с
  let alertTimer = 0;
  function showAlert() {
    clearTimeout(alertTimer);
    alertEl.getAnimations?.().forEach((a) => a.cancel());
    alertEl.hidden = false;
    fade(alertEl, reduce ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], 350);
    alertTimer = setTimeout(() => {
      const a = fade(alertEl, [{ opacity: 1 }, { opacity: 0 }], 300);
      if (a) a.onfinish = () => { alertEl.hidden = true; }; else alertEl.hidden = true;
    }, 4000);
  }

  function pickerSummary() {
    const list = order.filter((id) => picked.has(id)).map((id) => byId.get(id).name);
    pickValue.textContent = list.length ? list.join(', ') : T.placeholder || '';
    picker.classList.toggle('has-value', list.length > 0);
    pickCount.hidden = list.length < 2;
    pickCount.textContent = (T.count || '{n}').replace('{n}', list.length);
  }

  boxes.forEach((box) => box.addEventListener('change', () => {
    if (!box.checked) { remove(box.value); return; }
    if (!add(box.value, 'click')) box.checked = false;
  }));

  /* ---------- Cal.com ---------- */
  // Офіційний завантажувач Cal.com (embed snippet): створює window.Cal і чергу викликів, сам embed.js додає в <head>
  // при першому виклику. Викликається лише тут — коли обрано послугу з календарем.
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
    return { theme: 'dark', hideEventTypeDetails: true, layout: 'month_view', cssVarsPerTheme: { dark: vars } };
  }

  const embeds = new Map(); // id послуги → { service, sec, cal, box, ready, failed, booked, booking, done, timer }
  const seenBookings = new Set();
  let nsCount = 0;

  /* ---------- Екран успіху (замість підтвердження Cal.com) ---------- */
  const S = data.success || {};
  const KYIV = 'Europe/Kyiv';

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

  function fillDone(el, b) {
    const when = !!(b.start && b.end);
    $('[data-done-service]', el).textContent = b.service.name;
    $$('[data-done-when]', el).forEach((x) => { x.hidden = !when; });
    const dur = b.minutes ? fmtMinutes(b.minutes) : b.service.duration || '';
    $('[data-done-dur]', el).hidden = !dur;
    $('[data-done-duration]', el).textContent = dur;
    if (when) {
      const day = fmtDate.format(b.start);
      $('[data-done-date]', el).textContent = day.charAt(0).toUpperCase() + day.slice(1);
      $('[data-done-time]', el).textContent = `${fmtTime.format(b.start)}–${fmtTime.format(b.end)}`;
      $('[data-done-google]', el).href = googleLink(b);
    }
  }

  function showDone(entry) {
    const el = doneTpl.content.firstElementChild.cloneNode(true);
    $('[data-done-ics]', el).addEventListener('click', () => { const b = entry.booking; if (b.start && b.end) downloadIcs(b); });
    fillDone(el, entry.booking);
    entry.done = el;
    entry.cal.replaceWith(el);
    $('[data-cal-title]', entry.sec).hidden = true;
    fade(el, reduce ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(24px) scale(.98)' }, { opacity: 1, transform: 'none' }], 800);
    refreshLayout();
    scrollToEl(entry.sec, -24);
    el.focus({ preventScroll: true });
  }

  function onBooked(service, entry, e) {
    const d = (e && e.detail && e.detail.data) || {};
    dbg('успішний запис', service.id, e && e.detail && e.detail.type, d);
    const info = bookingData(d);
    // Cal надсилає на один запис дві події (стару bookingSuccessful і нову V2) — друга лише доповнює дані
    if (entry.booked) {
      const b = entry.booking;
      if (b) {
        if (!b.start && info.start) Object.assign(b, { start: info.start, end: info.end });
        if (!b.minutes && info.minutes) b.minutes = info.minutes;
        if (!b.uid && info.uid) b.uid = info.uid;
        if (entry.done) fillDone(entry.done, b);
      }
      return;
    }
    entry.booked = true;
    if (info.uid && seenBookings.has(info.uid)) return;
    if (info.uid) seenBookings.add(info.uid);
    track('booking_success', { service: service.name, service_id: service.id });
    entry.booking = { service, ...info };
    // Календар (з англійським підтвердженням Cal.com) плавно зникає, на його місці — власний екран успіху
    clearTimeout(entry.timer);
    fade(entry.cal, [{ opacity: 1 }, { opacity: 0 }], 280, 'forwards');
    setTimeout(() => showDone(entry), reduce ? 0 : 300);
  }

  function showStatus(entry) {
    clearTimeout(entry.timer);
    $('[data-book-loading]', entry.cal).hidden = entry.ready || entry.failed;
    $('[data-book-error]', entry.cal).hidden = !entry.failed;
    if (entry.failed) $('[data-book-error-link]', entry.cal).href = `https://cal.com/${entry.service.calLink}`;
    // Не завантажився за 20 с (немає мережі, блокувальник) — посилання на сторінку запису Cal.com
    if (!entry.ready && !entry.failed) entry.timer = setTimeout(() => { entry.failed = true; showStatus(entry); }, 20000);
  }

  // Банер cookies (fixed унизу) лежав би над календарем і перехоплював натискання — напр. кнопку «Підтвердити» на телефоні
  // (крізь напівпрозоре скло кнопку видно, а натискання дістається банеру). Поки відкритий календар, банер не показуємо
  // (і тоді, коли site.js показує його із затримкою); вибору не зроблено — діють типові налаштування без згоди,
  // банер з'явиться на наступній сторінці, або його відкриває «Налаштування cookies» у футері.
  const consent = document.querySelector('[data-consent]');
  let consentByUser = false;
  const calendarOpen = () => !step2.hidden && [...embeds.entries()].some(([id, x]) => picked.has(id) && !x.booked);
  function keepConsentAway() {
    if (consent && !consent.hidden && !consentByUser && calendarOpen()) { consent.hidden = true; dbg('банер cookies сховано, щоб не закривав календар'); }
  }
  if (consent) {
    new MutationObserver(keepConsentAway).observe(consent, { attributes: true, attributeFilter: ['hidden'] });
    document.addEventListener('click', (e) => { if (e.target.closest('[data-consent-open]')) consentByUser = true; }, true);
  }

  function createCalendar(service) {
    // Простір імен — новий для кожного календаря
    const ns = `wr_${service.id.replace(/[^a-z0-9]/gi, '_')}_${++nsCount}`;
    const sec = calTpl.content.firstElementChild.cloneNode(true);
    const calEl = $('[data-book-cal]', sec);
    const box = document.createElement('div');
    box.className = 'book-cal-embed';
    box.id = `book-cal-${ns}`;
    box.dataset.calNs = ns;
    calEl.appendChild(box);
    $('[data-cal-title]', sec).textContent = (T.calendar_for || '{service}').replace('{service}', service.name);
    const entry = { service, sec, cal: calEl, box, ready: false, failed: false, booked: false, booking: null, done: null, timer: 0 };
    embeds.set(service.id, entry);
    placeSections();
    const Cal = calApi();
    // Скрипт не завантажився (немає мережі чи його заблоковано)
    const script = document.querySelector(`script[src="${CAL_SCRIPT}"]`);
    if (script && !script.dataset.wrWatch) {
      script.dataset.wrWatch = '1';
      script.addEventListener('error', () => { embeds.forEach((x) => { if (!x.ready && !x.booked) { x.failed = true; showStatus(x); } }); });
    }
    Cal('init', ns, { origin: CAL_ORIGIN });
    const api = Cal.ns[ns];
    // Опис події сховано (hideEventTypeDetails), але вибір тривалості й часовий пояс лишаються видимими
    api('inline', {
      elementOrSelector: `#${box.id}`, calLink: service.calLink,
      config: { layout: 'month_view', theme: 'dark', showEventDurationWhenEventDetailsHidden: 'true', showTimezoneWhenEventDetailsHidden: 'true' },
    });
    api('ui', calTheme());
    api('on', { action: 'linkReady', callback: () => { entry.ready = true; entry.failed = false; showStatus(entry); refreshLayout(); } });
    api('on', { action: 'linkFailed', callback: () => { entry.failed = true; showStatus(entry); } });
    if (DEBUG) {
      // «*» — усі події цього календаря (формат: window CustomEvent `CAL:<ns>:<type>`, detail = { type, namespace, fullType, data })
      api('on', { action: '*', callback: (e) => dbg(`${ns} подія`, e.detail && e.detail.type, e.detail && e.detail.data) });
      if ('ResizeObserver' in window) {
        let last = 0;
        new ResizeObserver(() => {
          const f = box.querySelector('iframe');
          const h = f ? Math.round(f.getBoundingClientRect().height) : 0;
          if (h !== last) { dbg(`${ns} висота iframe: ${last} → ${h}px`); last = h; }
        }).observe(box);
      }
    }
    api('on', { action: 'bookingSuccessfulV2', callback: (e) => onBooked(service, entry, e) });
    api('on', { action: 'bookingSuccessful', callback: (e) => onBooked(service, entry, e) });
    showStatus(entry);
    return entry;
  }

  // Секції календарів — у порядку послуг; видно лише обрані
  function placeSections() {
    order.forEach((id) => {
      const x = embeds.get(id);
      if (!x) return;
      x.sec.hidden = !picked.has(id);
      calsBox.appendChild(x.sec);
    });
    // Заголовок «Дата й час: …» потрібен, лише коли календарів кілька
    const shown = [...embeds.values()].filter((x) => !x.sec.hidden);
    shown.forEach((x) => { $('[data-cal-title]', x.sec).hidden = !!x.done || shown.length < 2; });
  }

  /* ---------- Крок 2: обрані послуги ---------- */
  const remoteText = $('[data-remote-text]', remote);
  const remoteList = $('[data-remote-list]', remote);

  function render() {
    const ids = order.filter((id) => picked.has(id));
    $$('[data-chosen]', step2).forEach((li) => { li.hidden = !picked.has(li.dataset.chosen); });
    boxes.forEach((b) => { b.checked = picked.has(b.value); });
    pickerSummary();
    placeSections();
    const rem = ids.map((id) => byId.get(id)).filter((s) => !s.calLink);
    remote.hidden = !rem.length;
    remoteText.textContent = (rem.length > 1 && T.remote_many) || T.remote_one || '';
    remoteList.replaceChildren(...(rem.length > 1 ? rem.map((s) => Object.assign(document.createElement('li'), { textContent: s.name })) : []));
    title2.textContent = ids.some((id) => byId.get(id).calLink) ? T.step_time : T.step_remote || T.step_time;
    // Нічого не обрано — крок 2 ховається
    if (!ids.length) step2.hidden = true;
    else if (step2.hidden) {
      step2.hidden = false;
      appear(step2, 28, 700);
    }
    keepConsentAway();
    refreshLayout();
    // Адреса з обраними послугами — щоб можна було поділитися чи оновити сторінку
    try {
      const url = new URL(location.href);
      if (ids.length) url.searchParams.set('service', ids.join(',')); else url.searchParams.delete('service');
      history.replaceState(history.state, '', url);
    } catch { /* без History API — нічого */ }
  }

  const packageTaken = () => [...picked].some((x) => byId.get(x).package);

  // Додати послугу; false — не можна (уже обрано інший пакет)
  function add(id, source) {
    const service = byId.get(id);
    if (!service) return false;
    if (picked.has(id)) return true;
    if (service.package && packageTaken()) { showAlert(); dbg('другий пакет заблоковано', id); return false; }
    picked.add(id);
    let entry = embeds.get(id);
    // Записаний календар більше не показуємо: повторний вибір послуги відкриває новий
    if (entry && entry.booked) { entry.sec.remove(); embeds.delete(id); entry = null; }
    if (service.calLink && !entry) createCalendar(service);
    render();
    const sec = embeds.get(id)?.sec;
    if (sec && !sec.hidden) appear(sec, 16, 500);
    track('booking_service_select', { service: service.name, service_id: id, source });
    dbg('обрано', id, [...picked]);
    return true;
  }

  function remove(id) {
    if (!picked.delete(id)) return;
    render();
    dbg('прибрано', id, [...picked]);
  }

  step2.addEventListener('click', (e) => {
    const x = e.target.closest('[data-unpick]');
    if (!x) return;
    remove(x.dataset.unpick);
    // Фокус — на наступну кнопку «прибрати» або на кнопку списку
    const next = $$('[data-chosen]:not([hidden]) [data-unpick]', step2)[0];
    (next || pickBtn).focus({ preventScroll: true });
  });

  $('[data-book-change]').addEventListener('click', () => {
    scrollToEl($('#book-service'), -24);
    setTimeout(() => openPicker(true), reduce ? 0 : 450);
  });

  // ?service=a,b в адресі — одразу обрати послуги; прокрутка до кроку 2 — коли сторінка вже з'явилась
  const pre = (new URLSearchParams(location.search).get('service') || '').split(',').map((s) => s.trim()).filter((id) => byId.has(id));
  pre.forEach((id) => {
    const s = byId.get(id);
    if (picked.has(id) || (s.package && packageTaken())) return;
    picked.add(id);
    if (s.calLink) createCalendar(s);
    track('booking_service_select', { service: s.name, service_id: id, source: 'url' });
  });
  render();
  if (picked.size) {
    Promise.resolve(window.wrMotion?.entered).then(() => setTimeout(() => {
      if (step2.getBoundingClientRect().top > innerHeight * 0.6) scrollToEl(step2, -16);
    }, 500));
  }
})();
