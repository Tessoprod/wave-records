// Двостороння синхронізація з Google Calendar.
//
//  Сайт → Календар: кожна зміна бронювання ставить його в чергу gcal_outbox;
//                   фоновий обробник створює / оновлює / видаляє подію з повторами при збоях.
//  Календар → Сайт: інкрементальна синхронізація (syncToken) за push-сповіщенням від Google
//                   і додатково щохвилини. Перенесли або видалили подію бронювання в календарі —
//                   бронювання на сайті оновлюється. Будь-яка інша подія в календарі блокує цей час.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { q, tx, kvGet, kvSet } from './db.js';
import { bookingEvents, cancelBooking, applyCalendarTimes, getBooking } from './booking.js';
import { kyivToUtc } from './time.js';

const SCOPE = 'https://www.googleapis.com/auth/calendar';
const log = (...a) => console.log('[gcal]', ...a);

let credentials = null;
function loadCredentials() {
  if (credentials !== null) return credentials;
  try {
    const { serviceAccountFile, serviceAccountJson } = config.google;
    let raw = '';
    if (serviceAccountJson) raw = serviceAccountJson.trim().startsWith('{') ? serviceAccountJson : Buffer.from(serviceAccountJson, 'base64').toString('utf8');
    else if (serviceAccountFile) raw = fs.readFileSync(path.resolve(config.root, serviceAccountFile), 'utf8');
    credentials = raw ? JSON.parse(raw) : false;
  } catch (err) {
    console.error('[gcal] Не вдалося прочитати ключ сервісного акаунта:', err.message);
    credentials = false;
  }
  return credentials;
}

export function isConfigured() {
  return !!(loadCredentials() && config.google.calendarId);
}

export function serviceAccountEmail() {
  return loadCredentials()?.client_email || '';
}

/* ---------- OAuth2 для сервісного акаунта (JWT, RS256) ---------- */

let token = null;
const b64url = (b) => Buffer.from(b).toString('base64url');

async function accessToken() {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const cred = loadCredentials();
  const tokenUrl = config.google.tokenUrl || cred.token_uri || 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: cred.client_email, scope: SCOPE, aud: tokenUrl, iat: now, exp: now + 3600 }));
  const signature = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), cred.private_key).toString('base64url');
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${signature}` }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Авторизація Google: ${body.error_description || body.error || res.status}`);
  token = { value: body.access_token, exp: Date.now() + (body.expires_in || 3600) * 1000 };
  return token.value;
}

class GoogleError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function api(method, path, { query, body, headers = {} } = {}) {
  const url = new URL(config.google.apiBase + path);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new GoogleError(res.status, data?.error?.message || `HTTP ${res.status}`);
  return data;
}

const calPath = () => `/calendars/${encodeURIComponent(config.google.calendarId)}`;

/* ---------- Сайт → Календар ---------- */

function eventBody(b) {
  const site = config.publicUrl || '';
  const lines = [
    `Послуга: ${b.service_name}`,
    `Клієнт: ${b.name}`,
    `Телефон: ${b.phone}`,
    b.telegram ? `Telegram: @${b.telegram}` : '',
    b.email ? `Email: ${b.email}` : '',
    b.comment ? `\nКоментар:\n${b.comment}` : '',
    `\nКод: ${b.code}`,
    site ? `Адмінка: ${site}/admin/bookings/${b.id}` : '',
  ].filter(Boolean);
  return {
    summary: `🎙 ${b.service_name} — ${b.name}`,
    description: lines.join('\n'),
    start: { dateTime: new Date(b.start_ms).toISOString(), timeZone: config.tz },
    end: { dateTime: new Date(b.end_ms).toISOString(), timeZone: config.tz },
    colorId: '11',
    reminders: { useDefault: true },
    extendedProperties: { private: { waveBookingId: String(b.id), waveCode: b.code } },
  };
}

function saveEventState(id, ev) {
  q(`UPDATE bookings SET gcal_etag = ?, gcal_state = 'synced' WHERE id = ?`).run(ev?.etag || '', id);
}

async function pushBooking(b) {
  const evPath = `${calPath()}/events/${encodeURIComponent(b.gcal_event_id)}`;
  if (b.status === 'cancelled') {
    try { await api('DELETE', evPath); } catch (err) { if (![404, 410].includes(err.status)) throw err; }
    q(`UPDATE bookings SET gcal_state = 'synced', gcal_etag = '' WHERE id = ?`).run(b.id);
    return;
  }
  const body = eventBody(b);
  if (!b.gcal_etag) {
    try {
      const ev = await api('POST', `${calPath()}/events`, { body: { id: b.gcal_event_id, ...body } });
      return saveEventState(b.id, ev);
    } catch (err) {
      if (err.status !== 409) throw err; // подія вже існує (попередня спроба дійшла) — оновлюємо її
    }
  }
  try {
    const ev = await api('PATCH', evPath, { body, headers: b.gcal_etag ? { 'If-Match': b.gcal_etag } : {} });
    saveEventState(b.id, ev);
  } catch (err) {
    if (err.status === 412) {
      // Подію щойно змінили в календарі — спершу забираємо ці зміни.
      await pullChanges();
      throw new Error('Подію змінили в календарі, повторимо після синхронізації');
    }
    if (err.status === 404 || err.status === 410) {
      q(`UPDATE bookings SET needs_attention = 1, attention_note = 'Подію не знайдено в Google Calendar.', gcal_state = 'error' WHERE id = ?`).run(b.id);
      return;
    }
    throw err;
  }
}

let flushing = false;
export async function flushOutbox() {
  if (!isConfigured() || flushing) return;
  flushing = true;
  try {
    const jobs = q('SELECT * FROM gcal_outbox WHERE next_at <= ? ORDER BY next_at LIMIT 20').all(Date.now());
    for (const job of jobs) {
      const b = getBooking(job.booking_id);
      if (!b) { q('DELETE FROM gcal_outbox WHERE booking_id = ?').run(job.booking_id); continue; }
      try {
        await pushBooking(b);
        q('DELETE FROM gcal_outbox WHERE booking_id = ? AND rev = ?').run(job.booking_id, job.rev);
      } catch (err) {
        const attempts = job.attempts + 1;
        const delay = Math.min(30_000 * 2 ** (attempts - 1), 3600_000);
        q('UPDATE gcal_outbox SET attempts = ?, next_at = ?, last_error = ? WHERE booking_id = ? AND rev = ?')
          .run(attempts, Date.now() + delay, String(err.message).slice(0, 500), job.booking_id, job.rev);
        q(`UPDATE bookings SET gcal_state = 'error' WHERE id = ?`).run(job.booking_id);
        log(`Не вдалося синхронізувати бронювання #${job.booking_id}: ${err.message}`);
      }
    }
  } finally {
    flushing = false;
  }
}

/* ---------- Календар → Сайт ---------- */

function eventRange(ev) {
  if (ev.start?.dateTime) return [Date.parse(ev.start.dateTime), Date.parse(ev.end?.dateTime || ev.start.dateTime)];
  if (ev.start?.date) return [kyivToUtc(ev.start.date, 0), kyivToUtc(ev.end?.date || ev.start.date, 0)];
  return null;
}

export function applyEvent(ev) {
  const bookingId = Number(ev.extendedProperties?.private?.waveBookingId || 0);
  const booking = bookingId ? getBooking(bookingId) : null;
  const ours = booking && booking.gcal_event_id === ev.id;

  if (ours) {
    if (ev.status === 'cancelled') {
      if (booking.status !== 'cancelled') {
        cancelBooking(booking.id, 'calendar');
        log(`Бронювання #${booking.id} скасовано з календаря`);
      }
      q(`UPDATE bookings SET gcal_etag = '', gcal_state = 'synced' WHERE id = ?`).run(booking.id);
      return;
    }
    if (ev.etag && ev.etag === booking.gcal_etag) return; // це наша власна зміна
    const range = eventRange(ev);
    if (!range) return;
    if (booking.status === 'cancelled') {
      q(`UPDATE bookings SET needs_attention = 1, attention_note = 'Бронювання скасоване, але подія в календарі залишилась.', gcal_etag = ? WHERE id = ?`)
        .run(ev.etag || '', booking.id);
      return;
    }
    if (range[0] !== booking.start_ms || range[1] !== booking.end_ms) {
      applyCalendarTimes(booking.id, range[0], range[1], ev.etag);
      log(`Бронювання #${booking.id} перенесено з календаря`);
    } else {
      q(`UPDATE bookings SET gcal_etag = ?, gcal_state = 'synced' WHERE id = ?`).run(ev.etag || '', booking.id);
    }
    return;
  }

  // Стороння подія: зайнятий час (окрім подій, позначених як «Вільний»).
  const range = eventRange(ev);
  if (ev.status === 'cancelled' || ev.transparency === 'transparent' || !range || range[1] <= range[0]) {
    q('DELETE FROM calendar_blocks WHERE event_id = ?').run(ev.id);
    return;
  }
  q(`INSERT INTO calendar_blocks(event_id, start_ms, end_ms, summary, updated_at) VALUES(?,?,?,?,?)
     ON CONFLICT(event_id) DO UPDATE SET start_ms = excluded.start_ms, end_ms = excluded.end_ms, summary = excluded.summary, updated_at = excluded.updated_at`)
    .run(ev.id, range[0], range[1], String(ev.summary || '').slice(0, 200), Date.now());
}

let pulling = null;
export function pullChanges() {
  if (!isConfigured()) return Promise.resolve();
  if (!pulling) pulling = doPull().finally(() => { pulling = null; });
  return pulling;
}

async function doPull() {
  let syncToken = kvGet('gcal.syncToken', null);
  let pageToken;
  let nextSyncToken;
  try {
    do {
      const query = { showDeleted: 'true', singleEvents: 'true', maxResults: '250', pageToken };
      if (syncToken) query.syncToken = syncToken;
      else query.timeMin = new Date(Date.now() - 7 * 86400_000).toISOString();
      let page;
      try {
        page = await api('GET', `${calPath()}/events`, { query });
      } catch (err) {
        if (err.status === 410 && syncToken) {
          log('Токен синхронізації застарів, виконуємо повну синхронізацію');
          kvSet('gcal.syncToken', null);
          q('DELETE FROM calendar_blocks').run();
          syncToken = null; pageToken = undefined;
          continue;
        }
        throw err;
      }
      tx(() => { for (const ev of page.items || []) applyEvent(ev); });
      pageToken = page.nextPageToken;
      nextSyncToken = page.nextSyncToken;
    } while (pageToken);
    if (nextSyncToken) kvSet('gcal.syncToken', nextSyncToken);
    kvSet('gcal.lastPull', { at: Date.now(), ok: true });
  } catch (err) {
    kvSet('gcal.lastPull', { at: Date.now(), ok: false, error: String(err.message).slice(0, 300) });
    log('Помилка синхронізації з календарем:', err.message);
    throw err;
  }
}

/** Перед бронюванням підтягуємо свіжі блокування з календаря (з обмеженням часу очікування). */
export async function ensureFresh(maxAgeMs = 30_000, timeoutMs = 4000) {
  if (!isConfigured()) return;
  const last = kvGet('gcal.lastPull', null);
  if (last?.ok && Date.now() - last.at < maxAgeMs) return;
  await Promise.race([pullChanges().catch(() => {}), new Promise((r) => setTimeout(r, timeoutMs))]);
}

/* ---------- Push-сповіщення (webhook) ---------- */

export function webhookToken() {
  let t = kvGet('gcal.webhookToken', null);
  if (!t) { t = crypto.randomBytes(24).toString('hex'); kvSet('gcal.webhookToken', t); }
  return t;
}

async function ensureWatch() {
  if (!isConfigured() || !config.publicUrl.startsWith('https://')) return;
  const ch = kvGet('gcal.channel', null);
  if (ch && ch.expiration - Date.now() > 24 * 3600_000) return;
  const id = crypto.randomUUID();
  try {
    const res = await api('POST', `${calPath()}/events/watch`, {
      body: { id, type: 'web_hook', address: `${config.publicUrl}/api/gcal/webhook`, token: webhookToken(), params: { ttl: String(7 * 24 * 3600) } },
    });
    if (ch) api('POST', '/channels/stop', { body: { id: ch.id, resourceId: ch.resourceId } }).catch(() => {});
    kvSet('gcal.channel', { id, resourceId: res.resourceId, expiration: Number(res.expiration) || Date.now() + 6 * 86400_000 });
    log('Push-канал Google Calendar активний до', new Date(Number(res.expiration)).toISOString());
  } catch (err) {
    log('Не вдалося підписатися на push-сповіщення (працює синхронізація за розкладом):', err.message);
  }
}

let debounce = null;
export function handleWebhook(headers) {
  const ch = kvGet('gcal.channel', null);
  if (headers['x-goog-channel-token'] !== webhookToken()) return false;
  if (ch && headers['x-goog-channel-id'] !== ch.id) return true; // старий канал — ігноруємо
  clearTimeout(debounce);
  debounce = setTimeout(() => pullChanges().then(flushOutbox).catch(() => {}), 800);
  return true;
}

/* ---------- Статус і фоновий цикл ---------- */

export function status() {
  return {
    configured: isConfigured(),
    calendarId: config.google.calendarId,
    serviceAccount: serviceAccountEmail(),
    lastPull: kvGet('gcal.lastPull', null),
    channel: kvGet('gcal.channel', null),
    pending: q('SELECT COUNT(*) AS n FROM gcal_outbox').get().n,
    errors: q(`SELECT o.booking_id, o.attempts, o.last_error, o.next_at FROM gcal_outbox o WHERE o.last_error != '' ORDER BY o.next_at LIMIT 10`).all(),
  };
}

export async function testConnection() {
  const cal = await api('GET', calPath());
  return cal.summary || config.google.calendarId;
}

export function start() {
  if (!isConfigured()) {
    log('Google Calendar не налаштовано — бронювання працюють лише на сайті. Див. README.');
    q(`UPDATE bookings SET gcal_state = 'off' WHERE gcal_state = 'pending'`).run();
    return;
  }
  let kick = null;
  bookingEvents.on('dirty', () => { clearTimeout(kick); kick = setTimeout(() => flushOutbox().catch(() => {}), 50); });
  const tick = async () => {
    try { await pullChanges(); } catch { /* записано у статус */ }
    try { await flushOutbox(); } catch { /* повторимо */ }
  };
  tick().then(ensureWatch);
  setInterval(tick, Math.max(15, config.google.pollSeconds) * 1000).unref();
  setInterval(() => flushOutbox().catch(() => {}), 10_000).unref();
  setInterval(() => ensureWatch(), 6 * 3600_000).unref();
}
