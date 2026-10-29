/* Wave Records — форма бронювання */
(() => {
  'use strict';
  const form = document.getElementById('book-form');
  if (!form) return;
  const data = JSON.parse(document.getElementById('book-data').textContent);
  const $ = (id) => document.getElementById(id);
  const els = {
    service: $('bf-service'), hoursWrap: $('bf-hours-wrap'), hours: $('bf-hours'), note: $('bf-duration-note'),
    cal: $('bf-cal'), times: $('bf-times'), summary: $('bf-summary'), error: $('bf-error'), submit: $('bf-submit'),
    dialog: $('bf-success'),
  };

  const TZ = 'Europe/Kyiv';
  const kyivToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const today = kyivToday();
  const monthOf = (d) => d.slice(0, 7);
  const addMonths = (m, n) => {
    const [y, mo] = m.split('-').map(Number);
    const d = new Date(Date.UTC(y, mo - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  const lastMonth = (() => {
    const [y, m, d] = today.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + Number(data.horizonDays || 60)));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
  })();
  const monthName = (m) => {
    const [y, mo] = m.split('-').map(Number);
    return new Intl.DateTimeFormat('uk-UA', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, mo - 1, 1)));
  };
  const longDate = (d) => {
    const [y, m, dd] = d.split('-').map(Number);
    return new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, dd)));
  };
  const hoursWord = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'година' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'години' : 'годин');

  const state = { service: null, hours: null, month: monthOf(today), date: '', time: '', hoursActual: 0 };
  const monthCache = new Map();
  let idemKey = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
  let started = false;

  async function api(url, opts) {
    const res = await fetch(url, { headers: { Accept: 'application/json', ...(opts?.body ? { 'Content-Type': 'application/json' } : {}) }, ...opts });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(body.error || 'Не вдалося зв\'язатися із сервером'); Object.assign(err, body, { status: res.status }); throw err; }
    return body;
  }

  /* ---------- Послуга і тривалість ---------- */
  function setService(slug) {
    state.service = data.services.find((s) => s.slug === slug) || null;
    state.date = ''; state.time = '';
    els.hoursWrap.hidden = true;
    els.note.textContent = '';
    if (!state.service) {
      els.cal.innerHTML = '<p class="bf-hint">Спочатку оберіть послугу.</p>';
      els.times.innerHTML = '<p class="bf-hint">Оберіть дату, щоб побачити вільний час.</p>';
      updateSummary();
      return;
    }
    if (!started) { started = true; window.wrTrack?.('booking_start', { service: state.service.label }); }
    const s = state.service;
    if (s.mode === 'choose') {
      els.hours.innerHTML = '';
      for (let h = 1; h <= (s.max || 8); h++) els.hours.add(new Option(`${h} ${hoursWord(h)}`, String(h)));
      state.hours = Math.min(s.hours || 1, s.max || 8);
      els.hours.value = String(state.hours);
      els.hoursWrap.hidden = false;
      els.note.textContent = s.price ? `Вартість: ${s.price}.` : '';
    } else if (s.mode === 'day') {
      state.hours = null;
      els.note.textContent = `Повний студійний день — з відкриття до закриття студії.${s.price ? ` Вартість: ${s.price}.` : ''}`;
    } else {
      state.hours = null;
      els.note.textContent = `Тривалість сесії: ${s.hours} ${hoursWord(s.hours)}.${s.price ? ` Вартість: ${s.price}.` : ''}`;
    }
    loadMonth(state.month);
    els.times.innerHTML = '<p class="bf-hint">Оберіть дату, щоб побачити вільний час.</p>';
    updateSummary();
  }

  els.service.addEventListener('change', () => { clearFieldError(els.service); setService(els.service.value); });
  els.hours.addEventListener('change', () => {
    state.hours = Number(els.hours.value);
    const keepDate = state.date;
    state.time = '';
    loadMonth(state.month).then(() => { if (keepDate) selectDate(keepDate, true); });
    updateSummary();
  });

  /* ---------- Календар ---------- */
  const qs = (extra) => new URLSearchParams({ service: state.service.slug, ...(state.hours ? { hours: state.hours } : {}), ...extra });

  async function loadMonth(month) {
    state.month = month;
    const key = `${state.service.slug}|${state.hours}|${month}`;
    renderCalendar(monthCache.get(key) || null, !monthCache.has(key));
    if (monthCache.has(key)) return;
    try {
      const res = await api(`/api/availability?${qs({ month })}`);
      monthCache.set(key, res.days);
      if (state.month === month) renderCalendar(res.days, false);
    } catch (err) {
      els.cal.innerHTML = `<p class="form-error">${err.message}</p>`;
    }
  }

  function renderCalendar(days, loading) {
    const m = state.month;
    const [y, mo] = m.split('-').map(Number);
    const first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
    const offset = (first + 6) % 7; // понеділок — перший
    const total = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const dows = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
    let cells = dows.map((d) => `<span class="cal-dow" aria-hidden="true">${d}</span>`).join('');
    for (let i = 0; i < offset; i++) cells += '<span></span>';
    for (let d = 1; d <= total; d++) {
      const ds = `${m}-${String(d).padStart(2, '0')}`;
      const free = days ? days[ds] || 0 : 0;
      const label = `${longDate(ds)}${free ? `, вільних стартів: ${free}` : ', немає вільного часу'}`;
      cells += `<button type="button" class="cal-day${ds === today ? ' is-today' : ''}" data-date="${ds}" aria-pressed="${ds === state.date}" aria-label="${label}" ${free ? '' : 'disabled'}>${d}</button>`;
    }
    els.cal.innerHTML = `
      <div class="cal-head">
        <p class="cal-title" aria-live="polite">${monthName(m)}</p>
        <div class="cal-nav">
          <button type="button" class="btn-glass" data-nav="-1" aria-label="Попередній місяць" ${m <= monthOf(today) ? 'disabled' : ''}>‹</button>
          <button type="button" class="btn-glass" data-nav="1" aria-label="Наступний місяць" ${m >= lastMonth ? 'disabled' : ''}>›</button>
        </div>
      </div>
      <div class="cal-grid${loading ? ' cal-loading' : ''}">${cells}</div>
      ${days && !Object.values(days).some(Boolean) && !loading ? '<p class="bf-hint">У цьому місяці вільного часу немає — перегляньте наступний.</p>' : ''}`;
  }

  els.cal.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav && !nav.disabled) { loadMonth(addMonths(state.month, Number(nav.dataset.nav))); return; }
    const day = e.target.closest('[data-date]');
    if (day && !day.disabled) selectDate(day.dataset.date);
  });

  async function selectDate(ds, keepTime) {
    state.date = ds;
    if (!keepTime) state.time = '';
    els.cal.querySelectorAll('[data-date]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.date === ds)));
    els.times.innerHTML = '<p class="bf-hint">Перевіряємо вільний час…</p>';
    updateSummary();
    try {
      const res = await api(`/api/availability?${qs({ date: ds })}`);
      if (state.date !== ds) return;
      state.hoursActual = res.hours;
      renderTimes(res.slots);
    } catch (err) {
      els.times.innerHTML = `<p class="form-error">${err.message}</p>`;
    }
  }

  function renderTimes(slots) {
    if (!slots.length) {
      els.times.innerHTML = '<p class="bf-hint">На цей день вільного часу вже немає. Оберіть іншу дату.</p>';
      state.time = '';
      updateSummary();
      return;
    }
    if (!slots.some((s) => s.time === state.time)) state.time = '';
    els.times.innerHTML = slots.map((s) => `
      <label class="time-chip"><input type="radio" name="time" value="${s.time}" ${s.time === state.time ? 'checked' : ''}><span>${s.time}</span></label>`).join('');
    updateSummary();
  }

  els.times.addEventListener('change', (e) => {
    if (e.target.name === 'time') { state.time = e.target.value; updateSummary(); }
  });

  function endTime(t, hours) {
    const h = Number(t.split(':')[0]) + hours;
    return `${String(h).padStart(2, '0')}:00`;
  }

  function updateSummary() {
    const s = state.service;
    if (!s || !state.date || !state.time) { els.summary.textContent = ''; return; }
    const hrs = state.hoursActual || state.hours || s.hours;
    els.summary.innerHTML = '';
    const strong = document.createElement('strong');
    strong.textContent = s.label;
    els.summary.append(strong, `, ${longDate(state.date)}, ${state.time}–${endTime(state.time, hrs)}`);
  }

  /* ---------- Перевірка та відправка ---------- */
  function fieldOf(name) { return form.elements[name]?.closest?.('.field') || null; }
  function clearFieldError(input) {
    const f = input.closest('.field');
    if (!f) return;
    f.classList.remove('has-error');
    f.querySelector('.field-error')?.remove();
    input.removeAttribute('aria-invalid');
  }
  function setFieldError(name, msg) {
    const input = form.elements[name];
    const f = fieldOf(name);
    if (!f || !input) return false;
    clearFieldError(input);
    f.classList.add('has-error');
    input.setAttribute('aria-invalid', 'true');
    const p = document.createElement('p');
    p.className = 'field-error';
    p.textContent = msg;
    f.appendChild(p);
    return true;
  }
  form.addEventListener('input', (e) => { if (e.target.closest('.field')) clearFieldError(e.target); els.error.hidden = true; });

  function showError(msg) {
    els.error.textContent = msg;
    els.error.hidden = false;
    els.error.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function validate() {
    const f = form.elements;
    if (!state.service) { setFieldError('service', 'Оберіть послугу'); return 'Оберіть послугу.'; }
    if (!state.date) return 'Оберіть дату в календарі.';
    if (!state.time) return 'Оберіть час початку сесії.';
    let msg = '';
    if (f.name.value.trim().length < 2) { setFieldError('name', 'Вкажіть ім\'я'); msg ||= 'Вкажіть ім\'я.'; }
    const digits = f.phone.value.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) { setFieldError('phone', 'Вкажіть номер телефону, наприклад +380 67 123 45 67'); msg ||= 'Перевірте номер телефону.'; }
    if (f.email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.value.trim())) { setFieldError('email', 'Перевірте email'); msg ||= 'Перевірте email.'; }
    if (!f.consent.checked) msg ||= 'Підтвердьте згоду з політикою конфіденційності.';
    return msg;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    els.error.hidden = true;
    const problem = validate();
    if (problem) { showError(problem); return; }
    const f = form.elements;
    const payload = {
      service: state.service.slug, date: state.date, time: state.time, hours: state.hours || undefined,
      name: f.name.value, phone: f.phone.value, telegram: f.telegram.value, email: f.email.value, comment: f.comment.value,
      consent: true, website: f.website.value, idempotencyKey: idemKey,
    };
    els.submit.setAttribute('aria-busy', 'true');
    try {
      const res = await api('/api/bookings', { method: 'POST', body: JSON.stringify(payload) });
      idemKey = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now();
      monthCache.clear();
      showSuccess(res.booking);
      window.wrTrack?.('booking_confirmed', { service: state.service.label, booking_code: res.booking.code });
    } catch (err) {
      if (err.status === 409) {
        showError(err.error || 'Цей час щойно зайняли. Оберіть інший слот.');
        monthCache.clear();
        state.time = '';
        loadMonth(state.month).then(() => selectDate(state.date));
      } else if (err.field && setFieldError(err.field, err.error)) {
        showError(err.error);
      } else {
        showError(err.error || err.message || 'Не вдалося надіслати заявку. Спробуйте ще раз.');
      }
    } finally {
      els.submit.removeAttribute('aria-busy');
    }
  });

  function showSuccess(b) {
    $('bf-success-title').textContent = data.successTitle || 'Запис підтверджено';
    $('bf-success-text').textContent = data.successText || '';
    const list = $('bf-success-list');
    list.innerHTML = '';
    for (const [k, v] of [['Послуга', b.service], ['Дата', b.date], ['Час', b.time], ['Адреса', b.address], ['Код', b.code]]) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      list.append(dt, dd);
    }
    $('bf-ics').href = b.ics;
    if (typeof els.dialog.showModal === 'function') els.dialog.showModal();
    else els.dialog.setAttribute('open', '');
    els.dialog.scrollTop = 0;
    $('bf-success-title').focus({ preventScroll: true });
    form.reset();
    setService(state.service?.slug || '');
    els.service.value = state.service?.slug || '';
  }
  els.dialog.addEventListener('click', (e) => { if (e.target === els.dialog) els.dialog.close(); });

  /* ---------- Старт ---------- */
  const pre = data.services.find((s) => s.slug === data.preselect);
  if (pre) { els.service.value = pre.slug; setService(pre.slug); }
})();
