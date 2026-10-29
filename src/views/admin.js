import { html, raw } from '../html.js';
import { asset, logoMark } from './layout.js';
import { fmt, dateKey, kyivParts } from '../time.js';
import { STATUS_LABELS } from '../booking.js';
import { fmtDur } from './public.js';
import { config } from '../config.js';

const NAV = [
  ['/admin', 'Огляд'],
  ['/admin/bookings', 'Бронювання'],
  ['/admin/tracks', 'Треки'],
  ['/admin/photos', 'Фото студії'],
  ['/admin/services', 'Послуги'],
  ['/admin/blocks', 'Блоки сайту'],
  ['/admin/settings', 'Налаштування'],
];

const csrfField = (req) => html`<input type="hidden" name="_csrf" value="${req.session.csrf}">`;

function flash(req) {
  if (req.query.ok) return html`<div class="flash flash-ok" role="status">${req.query.ok}</div>`;
  if (req.query.err) return html`<div class="flash flash-err" role="alert">${req.query.err}</div>`;
  return '';
}

function adminLayout(req, { title, active, body, scripts = [] }) {
  return '<!doctype html>' + html`
<html lang="uk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <meta name="csrf" content="${req.session?.csrf || ''}">
  <title>${title} — адмінка Wave Records</title>
  <link rel="icon" href="${asset('img/favicon.svg')}" type="image/svg+xml">
  <link rel="stylesheet" href="${asset('css/admin.css')}">
</head>
<body>
  <div class="shell">
    <aside class="side">
      <a class="side-logo" href="/admin">${logoMark}<span>WAVE</span></a>
      <nav aria-label="Розділи адмінки">
        <ul>${NAV.map(([href, label]) => html`<li><a href="${href}" ${active === href ? raw('aria-current="page"') : ''}>${label}</a></li>`)}</ul>
      </nav>
      <div class="side-foot">
        <a href="/" target="_blank" rel="noopener">Відкрити сайт ↗</a>
        <form method="post" action="/admin/logout">${csrfField(req)}<button class="link" type="submit">Вийти</button></form>
      </div>
    </aside>
    <main class="main">
      <h1 class="page-title">${title}</h1>
      ${flash(req)}
      ${body}
    </main>
  </div>
  <script src="${asset('js/admin.js')}" defer></script>
  ${scripts.map((s) => html`<script src="${asset(s)}" defer></script>`)}
</body>
</html>`;
}

/* ---------- Вхід ---------- */

export function loginPage({ next = '/admin', error = '' }) {
  return '<!doctype html>' + html`
<html lang="uk">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
  <title>Вхід — адмінка Wave Records</title>
  <link rel="icon" href="${asset('img/favicon.svg')}" type="image/svg+xml">
  <link rel="stylesheet" href="${asset('css/admin.css')}">
</head>
<body class="login-body">
  <form class="login card" method="post" action="/admin/login">
    <a class="side-logo" href="/">${logoMark}<span>WAVE</span></a>
    <h1>Вхід в адмінку</h1>
    ${error ? html`<p class="flash flash-err" role="alert">${error}</p>` : ''}
    <input type="hidden" name="next" value="${next || '/admin'}">
    <label class="fld"><span>Логін</span><input name="user" autocomplete="username" required autofocus></label>
    <label class="fld"><span>Пароль</span><input name="password" type="password" autocomplete="current-password" required></label>
    <button class="btn btn-primary" type="submit">Увійти</button>
  </form>
</body>
</html>`;
}

/* ---------- Спільне ---------- */

const statusBadge = (s) => html`<span class="badge badge-${s}">${STATUS_LABELS[s] || s}</span>`;

function gcalBadge(b, gcalOn) {
  if (!gcalOn) return html`<span class="badge badge-muted" title="Google Calendar не підключено">—</span>`;
  const map = { synced: ['ok', 'У календарі'], pending: ['wait', 'Синхронізується'], error: ['err', 'Помилка'], off: ['muted', 'Вимкнено'] };
  const [cls, label] = map[b.gcal_state] || map.pending;
  return html`<span class="badge badge-${cls}">${label}</span>`;
}

const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);

function delta(cur, prev) {
  const d = pct(cur, prev);
  if (d === null) return '';
  return html`<span class="delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d}% до попередніх 30 днів</span>`;
}

function barChart(series) {
  const W = 720; const H = 180; const pad = 24;
  const max = Math.max(1, ...series.map((d) => d.visitors));
  const bw = (W - pad) / series.length;
  const bars = series.map((d, i) => {
    const h = Math.round((d.visitors / max) * (H - 30));
    const x = pad + i * bw + 1.5;
    const [, m, dd] = d.day.split('-');
    return html`<rect x="${x.toFixed(1)}" y="${H - h}" width="${Math.max(2, bw - 3).toFixed(1)}" height="${Math.max(h, d.visitors ? 2 : 0)}" rx="3" class="bar"><title>${dd}.${m}: ${d.visitors} відвідувачів, ${d.views} переглядів</title></rect>`;
  });
  const lbl = (i) => { const [, m, dd] = series[i].day.split('-'); return `${dd}.${m}`; };
  return html`
  <svg class="chart" viewBox="0 0 ${W} ${H + 22}" role="img" aria-label="Унікальні відвідувачі за днями, максимум ${max}">
    <line x1="${pad}" x2="${W}" y1="${H - (H - 30)}" y2="${H - (H - 30)}" class="grid"/>
    <line x1="${pad}" x2="${W}" y1="${H}" y2="${H}" class="axis"/>
    <text x="0" y="${H - (H - 30) + 4}" class="tick">${max}</text>
    <text x="0" y="${H + 4}" class="tick">0</text>
    ${bars}
    <text x="${pad}" y="${H + 18}" class="tick">${lbl(0)}</text>
    <text x="${pad + (series.length / 2) * bw}" y="${H + 18}" class="tick" text-anchor="middle">${lbl(Math.floor(series.length / 2))}</text>
    <text x="${W}" y="${H + 18}" class="tick" text-anchor="end">${lbl(series.length - 1)}</text>
  </svg>`;
}

/* ---------- Огляд ---------- */

export function dashboardPage(req, { stats, upcoming, attention, gcal }) {
  const s = stats;
  const body = html`
  ${attention ? html`<a class="flash flash-err" href="/admin/bookings?f=attention">${attention} бронювань потребують уваги — відкрити</a>` : ''}
  ${gcal.configured && gcal.errors.length ? html`<a class="flash flash-err" href="/admin/settings">Є помилки синхронізації з Google Calendar — перевірити</a>` : ''}
  <section class="kpis">
    <div class="card kpi"><p class="kpi-label">Відвідувачі, 30 днів</p><p class="kpi-value">${s.totals.visitors}</p>${delta(s.totals.visitors, s.prev.visitors)}</div>
    <div class="card kpi"><p class="kpi-label">Перегляди сторінок</p><p class="kpi-value">${s.totals.views}</p>${delta(s.totals.views, s.prev.views)}</div>
    <div class="card kpi"><p class="kpi-label">Бронювання з сайту</p><p class="kpi-value">${s.bookings}</p></div>
    <div class="card kpi"><p class="kpi-label">Конверсія у запис</p><p class="kpi-value">${s.conversion.toFixed(1)}%</p></div>
    <div class="card kpi"><p class="kpi-label">Прослуховування треків</p><p class="kpi-value">${s.plays}</p></div>
  </section>

  <section class="card">
    <h2>Відвідувачі за днями</h2>
    ${barChart(s.series)}
  </section>

  <div class="grid-2">
    <section class="card">
      <div class="card-head"><h2>Найближчі сесії</h2><a href="/admin/bookings">Усі бронювання</a></div>
      ${upcoming.length ? html`<table class="tbl"><tbody>${upcoming.map((b) => html`
        <tr><td class="nowrap">${fmt.short(b.start_ms)}<br><span class="muted">${fmt.range(b.start_ms, b.end_ms)}</span></td>
        <td><a href="/admin/bookings/${b.id}">${b.name}</a><br><span class="muted">${b.service_name}</span></td>
        <td>${b.needs_attention ? html`<span class="badge badge-err">Увага</span>` : ''}</td></tr>`)}</tbody></table>`
        : html`<p class="muted">Найближчих бронювань немає.</p>`}
    </section>
    <section class="card">
      <h2>Звідки приходять</h2>
      ${s.sources.length ? html`<table class="tbl"><tbody>${s.sources.map((r) => html`<tr><td>${r.source}</td><td class="num">${r.visitors}</td></tr>`)}</tbody></table>` : html`<p class="muted">Даних поки немає.</p>`}
    </section>
    <section class="card">
      <h2>Популярні сторінки</h2>
      ${s.pages.length ? html`<table class="tbl"><thead><tr><th>Сторінка</th><th class="num">Відвідувачі</th><th class="num">Перегляди</th></tr></thead><tbody>${s.pages.map((r) => html`<tr><td>${r.path}</td><td class="num">${r.visitors}</td><td class="num">${r.views}</td></tr>`)}</tbody></table>` : html`<p class="muted">Даних поки немає.</p>`}
    </section>
    <section class="card">
      <h2>Найпопулярніші треки</h2>
      ${s.topTracks.length ? html`<table class="tbl"><tbody>${s.topTracks.map((t) => html`<tr><td>${t.artist ? `${t.artist} — ` : ''}${t.title}</td><td class="num">${t.plays}</td></tr>`)}</tbody></table>` : html`<p class="muted">Ще ніхто не слухав треки.</p>`}
      ${s.devices.length ? html`<p class="muted small">Пристрої: ${s.devices.map((d) => `${{ mobile: 'телефони', desktop: 'комп\'ютери', tablet: 'планшети' }[d.device] || d.device} ${d.visitors}`).join(', ')}</p>` : ''}
    </section>
  </div>
  <p class="muted small">Статистика рахується без cookies: відвідувач визначається анонімним кодом, що змінюється щодня. Детальна аналітика — у Google Analytics.</p>`;
  return adminLayout(req, { title: 'Огляд', active: '/admin', body });
}

/* ---------- Бронювання ---------- */

export function bookingsPage(req, { rows, filter, gcalOn }) {
  const tabs = [['upcoming', 'Майбутні'], ['past', 'Минулі'], ['attention', 'Потребують уваги'], ['cancelled', 'Скасовані'], ['all', 'Усі']];
  const body = html`
  <div class="toolbar">
    <nav class="tabs" aria-label="Фільтр">${tabs.map(([k, l]) => html`<a href="?f=${k}" ${k === filter ? raw('aria-current="page"') : ''}>${l}</a>`)}</nav>
    <a class="btn btn-primary" href="/admin/bookings/new">Додати вручну</a>
  </div>
  <section class="card">
    ${rows.length ? html`
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Дата і час</th><th>Послуга</th><th>Клієнт</th><th>Статус</th><th>Календар</th></tr></thead>
      <tbody>${rows.map((b) => html`
        <tr class="${b.needs_attention ? 'row-warn' : ''}">
          <td class="nowrap"><a href="/admin/bookings/${b.id}">${fmt.short(b.start_ms)}</a><br><span class="muted">${fmt.range(b.start_ms, b.end_ms)}</span></td>
          <td>${b.service_name}${b.source === 'admin' ? html`<br><span class="muted small">додано вручну</span>` : ''}</td>
          <td><a href="/admin/bookings/${b.id}">${b.name}</a><br><a class="muted" href="tel:${b.phone.replace(/[^\d+]/g, '')}">${b.phone}</a></td>
          <td>${statusBadge(b.status)}${b.needs_attention ? html` <span class="badge badge-err">Увага</span>` : ''}</td>
          <td>${gcalBadge(b, gcalOn)}</td>
        </tr>`)}</tbody>
    </table></div>` : html`<p class="muted">Тут поки порожньо.</p>`}
  </section>`;
  return adminLayout(req, { title: 'Бронювання', active: '/admin/bookings', body });
}

export function bookingPage(req, { b, outbox, gcalOn }) {
  const p = kyivParts(b.start_ms);
  const hours = Math.round((b.end_ms - b.start_ms) / 3600_000) || 1;
  const action = (name, label, cls = 'btn', confirm = '') => html`
    <form method="post" ${confirm ? raw(`data-confirm="${confirm}"`) : ''}>${csrfField(req)}<input type="hidden" name="action" value="${name}"><button class="${cls}" type="submit">${label}</button></form>`;
  const body = html`
  <p><a href="/admin/bookings">← Усі бронювання</a></p>
  ${b.needs_attention ? html`<div class="flash flash-err">${b.attention_note || 'Потребує уваги.'} ${action('resolve', 'Позначити як вирішене', 'btn btn-sm')}</div>` : ''}
  <div class="grid-2">
    <section class="card">
      <div class="card-head"><h2>${b.code}</h2>${statusBadge(b.status)}</div>
      <dl class="dl">
        <dt>Послуга</dt><dd>${b.service_name}</dd>
        <dt>Дата</dt><dd>${fmt.long(b.start_ms)}</dd>
        <dt>Час</dt><dd>${fmt.range(b.start_ms, b.end_ms)} (${hours} год)</dd>
        <dt>Коментар</dt><dd>${b.comment || '—'}</dd>
        <dt>Створено</dt><dd>${fmt.dateTime(b.created_at)}, ${b.source === 'admin' ? 'вручну' : 'з сайту'}</dd>
        ${b.status === 'cancelled' ? html`<dt>Скасовано</dt><dd>${{ admin: 'в адмінці', calendar: 'з Google Calendar' }[b.cancelled_by] || b.cancelled_by}</dd>` : ''}
        <dt>Календар</dt><dd>${gcalBadge(b, gcalOn)} ${outbox?.last_error ? html`<span class="muted small">${outbox.last_error}</span>` : ''}</dd>
      </dl>
      <div class="actions">
        ${b.status === 'confirmed' ? action('done', 'Позначити виконаним', 'btn') : ''}
        ${b.status !== 'cancelled' ? action('cancel', 'Скасувати бронювання', 'btn btn-danger', 'Скасувати бронювання і звільнити час?') : ''}
        ${gcalOn ? action('resync', 'Повторити синхронізацію', 'btn btn-ghost') : ''}
      </div>
    </section>

    <section class="card">
      <h2>Клієнт</h2>
      <form method="post" class="form">
        ${csrfField(req)}<input type="hidden" name="action" value="contact">
        <label class="fld"><span>Ім'я</span><input name="name" value="${b.name}" required></label>
        <label class="fld"><span>Телефон <a href="tel:${b.phone.replace(/[^\d+]/g, '')}">подзвонити</a></span><input name="phone" value="${b.phone}" required></label>
        <label class="fld"><span>Telegram ${b.telegram ? html`<a href="https://t.me/${b.telegram}" target="_blank" rel="noopener">написати</a>` : ''}</span><input name="telegram" value="${b.telegram}"></label>
        <label class="fld"><span>Email</span><input name="email" type="email" value="${b.email}"></label>
        <button class="btn" type="submit">Зберегти контакти</button>
      </form>
    </section>

    <section class="card">
      <h2>Ціна і нотатки</h2>
      <form method="post" class="form">
        ${csrfField(req)}<input type="hidden" name="action" value="notes">
        <label class="fld"><span>Узгоджена ціна</span><input name="agreed_price" value="${b.agreed_price}" placeholder="Напр. 3 500 грн"></label>
        <label class="fld"><span>Нотатка (бачите лише ви)</span><textarea name="admin_note" rows="4">${b.admin_note}</textarea></label>
        <button class="btn" type="submit">Зберегти</button>
      </form>
    </section>

    ${b.status !== 'cancelled' ? html`
    <section class="card">
      <h2>Перенести</h2>
      <form method="post" class="form" data-confirm="Перенести бронювання на новий час?">
        ${csrfField(req)}<input type="hidden" name="action" value="reschedule">
        <div class="row">
          <label class="fld"><span>Дата</span><input type="date" name="date" value="${dateKey(b.start_ms)}" required></label>
          <label class="fld"><span>Початок</span><input type="time" name="time" step="1800" value="${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}" required></label>
          <label class="fld"><span>Годин</span><input type="number" name="hours" min="1" max="14" value="${hours}" required></label>
        </div>
        <p class="muted small">Перенесення змінить подію і в Google Calendar. Можна також просто перетягнути подію в календарі — сайт підхопить зміну.</p>
        <button class="btn" type="submit">Перенести</button>
      </form>
    </section>` : ''}
  </div>`;
  return adminLayout(req, { title: `Бронювання ${b.code}`, active: '/admin/bookings', body });
}

export function bookingNewPage(req, { services, error = '', values = {} }) {
  const v = (k, d = '') => values[k] ?? d;
  const body = html`
  <p><a href="/admin/bookings">← Усі бронювання</a></p>
  ${error ? html`<div class="flash flash-err" role="alert">${error}</div>` : ''}
  <section class="card narrow">
    <form method="post" action="/admin/bookings" class="form">
      ${csrfField(req)}
      <label class="fld"><span>Послуга</span><select name="service" required>
        ${services.map((s) => html`<option value="${s.slug}" ${v('service') === s.slug ? raw('selected') : ''}>${s.booking_label || s.name}</option>`)}
      </select></label>
      <div class="row">
        <label class="fld"><span>Дата</span><input type="date" name="date" value="${v('date')}" required></label>
        <label class="fld"><span>Початок</span><select name="time" required>
          ${Array.from({ length: 17 }, (_, i) => i + 7).map((h) => { const t = `${String(h).padStart(2, '0')}:00`; return html`<option ${v('time', '10:00') === t ? raw('selected') : ''}>${t}</option>`; })}
        </select></label>
        <label class="fld"><span>Годин</span><input type="number" name="hours" min="1" max="14" value="${v('hours', '2')}" required></label>
      </div>
      <label class="fld"><span>Ім'я клієнта</span><input name="name" value="${v('name')}" required></label>
      <label class="fld"><span>Телефон</span><input name="phone" value="${v('phone')}" required></label>
      <label class="fld"><span>Telegram</span><input name="telegram" value="${v('telegram')}"></label>
      <label class="fld"><span>Email</span><input name="email" type="email" value="${v('email')}"></label>
      <label class="fld"><span>Коментар</span><textarea name="comment" rows="3">${v('comment')}</textarea></label>
      <p class="muted small">Ручне бронювання ігнорує робочі години, але не дозволить накласти сесію на вже зайнятий час.</p>
      <button class="btn btn-primary" type="submit">Створити бронювання</button>
    </form>
  </section>`;
  return adminLayout(req, { title: 'Нове бронювання', active: '/admin/bookings', body });
}

/* ---------- Треки ---------- */

const CAT_LABELS = { vocal: 'Vocal Mixing — зведення вокалу', music: 'Music — аранжування / біт', b2b: 'B2B — продакшн для бізнесів' };

export function tracksPage(req, { tracks }) {
  const homeCount = tracks.filter((t) => t.on_home).length;
  const body = html`
  <section class="card">
    <h2>Завантажити трек</h2>
    <form class="form" data-upload="track">
      <div class="row">
        <label class="fld"><span>Розділ</span><select name="category">${Object.entries(CAT_LABELS).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
        <label class="fld"><span>Артист <em>можна залишити порожнім для бітів</em></span><input name="artist" maxlength="120"></label>
        <label class="fld"><span>Назва треку</span><input name="title" maxlength="160" required></label>
      </div>
      <label class="fld"><span>Файл WAV або MP3 (до ${Math.round(config.maxAudioBytes / 1024 / 1024)} МБ)</span><input type="file" name="file" accept=".wav,.mp3,audio/wav,audio/x-wav,audio/mpeg" required></label>
      <div class="progress" hidden><span></span></div>
      <p class="upload-status muted small" aria-live="polite"></p>
      <button class="btn btn-primary" type="submit">Завантажити</button>
    </form>
    <p class="muted small">Порада: для сайту краще MP3 320 kbps — WAV важить у 5–10 разів більше і довше вантажиться на телефоні. Тривалість і форма хвилі розраховуються автоматично.</p>
  </section>

  <p class="muted">На головній показуються до 4 треків з позначкою «На головній» (зараз: ${homeCount}). Якщо не позначено жодного — 4 останні.</p>

  ${Object.entries(CAT_LABELS).map(([cat, label]) => {
    const list = tracks.filter((t) => t.category === cat);
    return html`
    <section class="card">
      <h2>${label}</h2>
      ${list.length ? html`<ul class="items" data-sortable="tracks">${list.map((t) => html`
        <li class="item" data-id="${t.id}">
          <div class="item-order">
            <button type="button" class="icon-btn" data-move="-1" aria-label="Вище">↑</button>
            <button type="button" class="icon-btn" data-move="1" aria-label="Нижче">↓</button>
          </div>
          <form class="item-form" data-track-form="${t.id}">
            <div class="row">
              <label class="fld"><span>Артист</span><input name="artist" value="${t.artist}"></label>
              <label class="fld"><span>Назва</span><input name="title" value="${t.title}" required></label>
              <label class="fld"><span>Розділ</span><select name="category">${Object.entries(CAT_LABELS).map(([k, l]) => html`<option value="${k}" ${k === t.category ? raw('selected') : ''}>${l.split(' — ')[0]}</option>`)}</select></label>
            </div>
            <div class="item-meta">
              <audio controls preload="none" src="/media/audio/${t.file}"></audio>
              <span class="muted small">${t.mime === 'audio/wav' ? 'WAV' : 'MP3'}, ${(t.size / 1024 / 1024).toFixed(1)} МБ, ${fmtDur(t.duration)}, прослуховувань: ${t.plays}</span>
            </div>
            <div class="item-actions">
              <label class="chk"><input type="checkbox" name="on_home" ${t.on_home ? raw('checked') : ''}> На головній</label>
              <button class="btn btn-sm" type="submit">Зберегти</button>
              <label class="btn btn-sm btn-ghost file-btn">Замінити файл<input type="file" accept=".wav,.mp3,audio/wav,audio/x-wav,audio/mpeg" data-replace="${t.id}" hidden></label>
              <button class="btn btn-sm btn-danger" type="button" data-delete="/admin/api/tracks/${t.id}" data-confirm="Видалити трек «${t.title}»?">Видалити</button>
              <span class="item-status muted small" aria-live="polite"></span>
            </div>
          </form>
        </li>`)}</ul>` : html`<p class="muted">У цьому розділі ще немає треків.</p>`}
    </section>`;
  })}`;
  return adminLayout(req, { title: 'Треки', active: '/admin/tracks', body });
}

/* ---------- Фото ---------- */

const PLACEMENT_LABELS = {
  gallery: 'Галерея «Атмосфера студії»',
  'about-hero': 'Головне фото сторінки «Про студію»',
  'process-1': 'Етап 1 — Record', 'process-2': 'Етап 2 — Produce', 'process-3': 'Етап 3 — Mix', 'process-4': 'Етап 4 — Master', 'process-5': 'Етап 5 — Release',
};

export function photosPage(req, { photos }) {
  const body = html`
  <section class="card">
    <h2>Завантажити фото</h2>
    <form class="form" data-upload="photo">
      <div class="row">
        <label class="fld"><span>Де показувати</span><select name="placement">${Object.entries(PLACEMENT_LABELS).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
        <label class="fld"><span>Опис для незрячих і пошуковиків</span><input name="alt" maxlength="200" placeholder="Напр. Вокальна кабіна з неоновим світлом"></label>
      </div>
      <label class="fld"><span>Фото JPG, PNG або WEBP (можна кілька)</span><input type="file" name="file" accept="image/jpeg,image/png,image/webp" multiple required></label>
      <div class="progress" hidden><span></span></div>
      <p class="upload-status muted small" aria-live="polite"></p>
      <button class="btn btn-primary" type="submit">Завантажити</button>
    </form>
    <p class="muted small">Фото автоматично зменшуються до 2400 px і стискаються перед завантаженням. Для галереї найкраще 4–6 реальних кадрів студії.</p>
  </section>
  <section class="card">
    <h2>Фото на сайті</h2>
    ${photos.length ? html`<ul class="photo-grid" data-sortable="photos">${photos.map((p) => html`
      <li class="item photo-item" data-id="${p.id}">
        <img src="/media/photos/${p.file}" alt="${p.alt}" loading="lazy">
        <form class="item-form" data-photo-form="${p.id}">
          <label class="fld"><span>Де показувати</span><select name="placement">${Object.entries(PLACEMENT_LABELS).map(([k, l]) => html`<option value="${k}" ${k === p.placement ? raw('selected') : ''}>${l}</option>`)}</select></label>
          <label class="fld"><span>Опис</span><input name="alt" value="${p.alt}"></label>
          <div class="item-actions">
            <button type="button" class="icon-btn" data-move="-1" aria-label="Раніше">←</button>
            <button type="button" class="icon-btn" data-move="1" aria-label="Пізніше">→</button>
            <button class="btn btn-sm" type="submit">Зберегти</button>
            <button class="btn btn-sm btn-danger" type="button" data-delete="/admin/api/photos/${p.id}" data-confirm="Видалити це фото?">Видалити</button>
            <span class="item-status muted small" aria-live="polite"></span>
          </div>
        </form>
      </li>`)}</ul>` : html`<p class="muted">Фото ще не завантажено. Поки їх немає, на сайті показуються графічні фрагменти.</p>`}
  </section>`;
  return adminLayout(req, { title: 'Фото студії', active: '/admin/photos', body });
}

/* ---------- Послуги ---------- */

export function servicesPage(req, { services }) {
  const sel = (v, opts) => opts.map(([k, l]) => html`<option value="${k}" ${String(v) === k ? raw('selected') : ''}>${l}</option>`);
  const chk = (name, on, label) => html`<label class="chk"><input type="checkbox" name="${name}" ${on ? raw('checked') : ''}> ${label}</label>`;
  const body = html`
  <p class="muted">Ціни й описи змінюються тут і одразу оновлюються на головній, на сторінці послуг і у формі запису.</p>
  ${services.map((s) => html`
  <section class="card" id="s${s.id}">
    <form method="post" action="/admin/services/${s.id}" class="form">
      ${csrfField(req)}
      <div class="card-head"><h2>${s.name}</h2><span class="muted small">${s.category === 'media' ? 'Media | PR' : 'Sound'}</span></div>
      <div class="row">
        <label class="fld"><span>Назва</span><input name="name" value="${s.name}" required></label>
        <label class="fld"><span>Ціна</span><input name="price_label" value="${s.price_label}"></label>
        <label class="fld"><span>Блок</span><select name="category">${sel(s.category, [['sound', 'Sound'], ['media', 'Media | PR']])}</select></label>
        <label class="fld fld-xs"><span>Порядок</span><input type="number" name="sort" value="${s.sort}"></label>
      </div>
      <label class="fld"><span>Опис</span><textarea name="description" rows="2">${s.description}</textarea></label>
      <div class="opts">
        ${chk('show_on_services', s.show_on_services, 'На сторінці «Послуги»')}
        ${chk('show_on_home', s.show_on_home, 'На головній')}
        ${chk('bookable', s.bookable, 'У формі запису')}
      </div>
      <details class="more">
        <summary>Головна та бронювання</summary>
        <div class="row">
          <label class="fld"><span>Назва на головній</span><input name="home_title" value="${s.home_title}" placeholder="${s.name}"></label>
          <label class="fld"><span>Ціна на головній</span><input name="home_price" value="${s.home_price}" placeholder="${s.price_label}"></label>
          <label class="fld fld-xs"><span>Порядок</span><input type="number" name="home_sort" value="${s.home_sort}"></label>
        </div>
        <div class="row">
          <label class="fld"><span>Назва у списку запису</span><input name="booking_label" value="${s.booking_label}" placeholder="${s.name}"></label>
          <label class="fld"><span>Тривалість сесії</span><select name="duration_mode">${sel(s.duration_mode, [['fixed', 'Фіксована'], ['choose', 'Клієнт обирає'], ['day', 'Повний робочий день']])}</select></label>
          <label class="fld fld-xs"><span>Годин</span><input type="number" min="1" max="14" name="duration_hours" value="${s.duration_hours}"></label>
          <label class="fld fld-xs"><span>Макс.</span><input type="number" min="1" max="14" name="max_hours" value="${s.max_hours}"></label>
          <label class="fld fld-xs"><span>Порядок</span><input type="number" name="booking_sort" value="${s.booking_sort}"></label>
        </div>
        <p class="muted small">«Годин» — тривалість для фіксованої сесії або значення за замовчуванням, якщо клієнт обирає сам. «Макс.» — найдовша сесія, яку клієнт може обрати.</p>
      </details>
      <div class="actions">
        <button class="btn" type="submit">Зберегти</button>
        <button class="btn btn-danger btn-ghost" type="submit" name="action" value="delete" data-confirm-click="Видалити послугу «${s.name}»?">Видалити</button>
      </div>
    </form>
  </section>`)}
  <section class="card">
    <h2>Нова послуга</h2>
    <form method="post" action="/admin/services/new" class="form">
      ${csrfField(req)}
      <div class="row">
        <label class="fld"><span>Назва</span><input name="name" required></label>
        <label class="fld"><span>Ціна</span><input name="price_label" placeholder="1 000 грн"></label>
        <label class="fld"><span>Блок</span><select name="category"><option value="sound">Sound</option><option value="media">Media | PR</option></select></label>
      </div>
      <button class="btn btn-primary" type="submit">Додати</button>
    </form>
  </section>`;
  return adminLayout(req, { title: 'Послуги', active: '/admin/services', body });
}

/* ---------- Блоки сайту ---------- */

export function blocksPage(req, { blocks }) {
  const pages = [...new Set(blocks.map((b) => b.def.page))];
  const body = html`
  <p class="muted">Тексти всіх блоків сайту. Блок можна приховати, не видаляючи текст.</p>
  ${pages.map((p) => html`
  <section class="card">
    <h2>${p}</h2>
    <ul class="links">${blocks.filter((b) => b.def.page === p).map((b) => html`
      <li><a href="/admin/blocks/${encodeURIComponent(b.def.key)}">${b.def.label}</a> ${b.visible ? '' : html`<span class="badge badge-muted">приховано</span>`}</li>`)}</ul>
  </section>`)}`;
  return adminLayout(req, { title: 'Блоки сайту', active: '/admin/blocks', body });
}

function fieldInput(name, f, value) {
  if (f.type === 'textarea') return html`<textarea name="${name}" rows="3">${value}</textarea>`;
  if (f.type === 'markdown') return html`<textarea name="${name}" rows="24" class="mono">${value}</textarea>`;
  return html`<input name="${name}" value="${value}">`;
}

export function blockEditPage(req, { def, data }) {
  const body = html`
  <p><a href="/admin/blocks">← Усі блоки</a></p>
  <section class="card">
    <form method="post" class="form" data-block-form>
      ${csrfField(req)}
      <p class="muted">Сторінка: ${def.page}</p>
      <label class="chk"><input type="checkbox" name="visible" ${data.visible ? raw('checked') : ''}> Показувати блок на сайті</label>
      ${def.fields.map((f) => f.type === 'list' ? html`
        <fieldset class="list-field" data-list="${f.name}">
          <legend>${f.label}</legend>
          <ol class="list-items">${(data[f.name] || []).map((it, i) => html`
            <li class="list-item">
              ${f.item.map((sf) => html`<label class="fld"><span>${sf.label}</span>${fieldInput(`f.${f.name}.${i}.${sf.name}`, sf, it[sf.name] ?? '')}</label>`)}
              <button type="button" class="btn btn-sm btn-ghost" data-remove-item>Прибрати</button>
            </li>`)}</ol>
          <template>${raw(`<li class="list-item">${f.item.map((sf) => `<label class="fld"><span>${sf.label}</span>${String(fieldInput(`f.${f.name}.__i__.${sf.name}`, sf, ''))}</label>`).join('')}<button type="button" class="btn btn-sm btn-ghost" data-remove-item>Прибрати</button></li>`)}</template>
          <button type="button" class="btn btn-sm" data-add-item>Додати пункт</button>
        </fieldset>` : html`
        <label class="fld"><span>${f.label}</span>${fieldInput(`f.${f.name}`, f, data[f.name] ?? '')}</label>`)}
      <div class="actions">
        <button class="btn btn-primary" type="submit">Зберегти</button>
        <button class="btn btn-ghost" type="submit" name="action" value="reset" data-confirm-click="Повернути текст за замовчуванням? Ваші зміни в цьому блоці буде втрачено.">Скинути до початкового</button>
      </div>
    </form>
  </section>`;
  return adminLayout(req, { title: def.label, active: '/admin/blocks', body });
}

/* ---------- Налаштування ---------- */

export function settingsPage(req, { settings: s, gcal, telegramOn }) {
  const days = [[1, 'Понеділок'], [2, 'Вівторок'], [3, 'Середа'], [4, 'Четвер'], [5, 'П\'ятниця'], [6, 'Субота'], [0, 'Неділя']];
  const lp = gcal.lastPull;
  const body = html`
  <div class="grid-2">
    <section class="card">
      <h2>Сайт і аналітика</h2>
      <form method="post" action="/admin/settings" class="form">
        ${csrfField(req)}
        <div class="row">
          <label class="fld"><span>Назва компанії</span><input name="company" value="${s.company}"></label>
          <label class="fld"><span>Домен сайту</span><input name="domain" value="${s.domain}" placeholder="waverecords.ua"></label>
        </div>
        <label class="fld"><span>Google Tag Manager ID</span><input name="gtm_id" value="${s.gtm_id}" placeholder="GTM-XXXXXXX"></label>
        <label class="fld"><span>Google Analytics 4 ID <em>якщо GA4 не налаштовано через GTM</em></span><input name="ga4_id" value="${s.ga4_id}" placeholder="G-XXXXXXXXXX"></label>
        <label class="fld"><span>Meta Pixel ID</span><input name="pixel_id" value="${s.pixel_id}" placeholder="123456789012345"></label>
        <p class="muted small">Сайт показує банер згоди на cookies (Google Consent Mode v2). Meta Pixel вмикається лише після згоди відвідувача. Події: booking_start, booking_confirmed (Pixel: Schedule), audio_play, cta_click.</p>

        <h3>Робочі години для запису</h3>
        <div class="hours">
          ${days.map(([d, l]) => html`<label class="fld"><span>${l}</span><input name="hours_${d}" value="${s.hours[d] || ''}" placeholder="вихідний"></label>`)}
        </div>
        <p class="muted small">Формат: 10-20 (з 10:00 до 20:00). Порожньо — вихідний.</p>
        <div class="row">
          <label class="fld"><span>Мінімум годин до сесії</span><input type="number" name="lead_hours" min="0" max="168" value="${s.lead_hours}"></label>
          <label class="fld"><span>Бронювання наперед, днів</span><input type="number" name="horizon_days" min="1" max="365" value="${s.horizon_days}"></label>
        </div>
        <button class="btn btn-primary" type="submit">Зберегти налаштування</button>
      </form>
    </section>

    <div class="stack">
      <section class="card">
        <h2>Google Calendar</h2>
        ${gcal.configured ? html`
          <dl class="dl">
            <dt>Календар</dt><dd>${gcal.calendarId}</dd>
            <dt>Сервісний акаунт</dt><dd class="break">${gcal.serviceAccount}</dd>
            <dt>Остання синхронізація</dt><dd>${lp ? html`${fmt.dateTime(lp.at)} ${lp.ok ? html`<span class="badge badge-ok">OK</span>` : html`<span class="badge badge-err">Помилка</span><br><span class="muted small">${lp.error}</span>`}` : 'ще не було'}</dd>
            <dt>Push-сповіщення</dt><dd>${gcal.channel ? `активні до ${fmt.dateTime(gcal.channel.expiration)}` : 'вимкнено — працює перевірка щохвилини'}</dd>
            <dt>У черзі</dt><dd>${gcal.pending}</dd>
          </dl>
          ${gcal.errors.length ? html`<ul class="errors">${gcal.errors.map((e) => html`<li><a href="/admin/bookings/${e.booking_id}">#${e.booking_id}</a>: ${e.last_error} (спроба ${e.attempts})</li>`)}</ul>` : ''}
          <form method="post" action="/admin/settings/gcal">${csrfField(req)}<button class="btn" type="submit">Перевірити й синхронізувати зараз</button></form>`
        : html`
          <p>Календар не підключено: бронювання зберігаються лише на сайті.</p>
          <p class="muted small">Щоб підключити, додайте в файл .env змінні GOOGLE_SERVICE_ACCOUNT_FILE та GOOGLE_CALENDAR_ID і перезапустіть сайт. Покрокова інструкція — у README, розділ «Google Calendar».</p>`}
      </section>

      <section class="card">
        <h2>Telegram-сповіщення</h2>
        <p>${telegramOn ? 'Увімкнено: про кожне нове бронювання надходить повідомлення.' : 'Вимкнено. Додайте TELEGRAM_BOT_TOKEN і TELEGRAM_CHAT_ID у .env, щоб отримувати повідомлення про нові записи.'}</p>
      </section>

      <section class="card">
        <h2>Пароль адміністратора</h2>
        <form method="post" action="/admin/settings/password" class="form">
          ${csrfField(req)}
          <label class="fld"><span>Поточний пароль</span><input type="password" name="current" autocomplete="current-password" required></label>
          <label class="fld"><span>Новий пароль (від 10 символів)</span><input type="password" name="next" autocomplete="new-password" minlength="10" required></label>
          <label class="fld"><span>Новий пароль ще раз</span><input type="password" name="next2" autocomplete="new-password" minlength="10" required></label>
          <button class="btn" type="submit">Змінити пароль</button>
        </form>
      </section>
    </div>
  </div>`;
  return adminLayout(req, { title: 'Налаштування', active: '/admin/settings', body });
}
