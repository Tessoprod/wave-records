// Бронювання: доступність слотів, атомарне резервування, скасування, перенесення.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { q, tx, isConstraintError } from './db.js';
import { HttpError } from './http.js';
import { getSettings, workHours } from './settings.js';
import { HOUR, DAY, kyivToUtc, isValidDateStr, weekday, dateKey, daysInMonth, addDays } from './time.js';

export const bookingEvents = new EventEmitter();

export const STATUS_LABELS = { confirmed: 'Підтверджено', done: 'Виконано', cancelled: 'Скасовано' };

export function bookableServices() {
  return q(`SELECT * FROM services WHERE bookable = 1 ORDER BY booking_sort, sort, id`).all();
}

export function getService(idOrSlug) {
  return /^\d+$/.test(String(idOrSlug))
    ? q('SELECT * FROM services WHERE id = ?').get(Number(idOrSlug))
    : q('SELECT * FROM services WHERE slug = ?').get(String(idOrSlug));
}

/** Скільки годин займе сесія і з якої години її можна починати. */
export function sessionPlan(service, dateStr, requestedHours) {
  const wh = workHours(weekday(dateStr));
  if (!wh) return null;
  const [open, close] = wh;
  if (service.duration_mode === 'day') return { open, close, hours: close - open, starts: [open] };
  let hours = Number(service.duration_hours) || 1;
  if (service.duration_mode === 'choose') {
    const req = Math.round(Number(requestedHours) || hours);
    hours = Math.min(Math.max(req, 1), Math.max(1, Number(service.max_hours) || 8));
  }
  const starts = [];
  for (let h = open; h + hours <= close; h++) starts.push(h);
  return { open, close, hours, starts };
}

function dayWindow(dateStr) {
  const from = kyivToUtc(dateStr, 0);
  return [from, kyivToUtc(addDays(dateStr, 1), 0)];
}

function busyForRange(from, to) {
  const locked = new Set(q('SELECT slot_ms FROM slot_locks WHERE slot_ms >= ? AND slot_ms < ?').all(from - DAY, to).map((r) => r.slot_ms));
  const blocks = q('SELECT start_ms, end_ms FROM calendar_blocks WHERE end_ms > ? AND start_ms < ?').all(from, to);
  return { locked, blocks };
}

function rangeIsFree(start, end, busy, ignoreBookingId = null, lockOwners = null) {
  for (let t = Math.floor(start / HOUR) * HOUR; t < end; t += HOUR) {
    if (busy.locked.has(t) && !(lockOwners && lockOwners.get(t) === ignoreBookingId)) return false;
  }
  return !busy.blocks.some((b) => b.end_ms > start && b.start_ms < end);
}

function bookingWindow() {
  const s = getSettings();
  const now = Date.now();
  return {
    earliest: now + Number(s.lead_hours || 0) * HOUR,
    latest: kyivToUtc(addDays(dateKey(now), Number(s.horizon_days || 60)), 23, 59),
  };
}

/** Вільні початки сесії для дати. */
export function availability(dateStr, service, requestedHours) {
  if (!isValidDateStr(dateStr) || !service) return { hours: 0, slots: [] };
  const plan = sessionPlan(service, dateStr, requestedHours);
  if (!plan) return { hours: 0, slots: [] };
  const { earliest, latest } = bookingWindow();
  const [from, to] = dayWindow(dateStr);
  const busy = busyForRange(from, to);
  const slots = [];
  for (const h of plan.starts) {
    const start = kyivToUtc(dateStr, h);
    const end = start + plan.hours * HOUR;
    if (start < earliest || start > latest) continue;
    if (rangeIsFree(start, end, busy)) slots.push({ time: `${String(h).padStart(2, '0')}:00`, start });
  }
  return { hours: plan.hours, slots };
}

/** Кількість вільних стартів на кожен день місяця ('YYYY-MM'). */
export function monthAvailability(monthStr, service, requestedHours) {
  const out = {};
  if (!/^\d{4}-\d{2}$/.test(monthStr || '') || !service) return out;
  const n = daysInMonth(monthStr);
  const { earliest, latest } = bookingWindow();
  const first = `${monthStr}-01`;
  const [from] = dayWindow(first);
  const [, to] = dayWindow(`${monthStr}-${String(n).padStart(2, '0')}`);
  if (to < earliest || from > latest) return out;
  const busy = busyForRange(from, to);
  for (let d = 1; d <= n; d++) {
    const dateStr = `${monthStr}-${String(d).padStart(2, '0')}`;
    const plan = sessionPlan(service, dateStr, requestedHours);
    if (!plan) continue;
    let free = 0;
    for (const h of plan.starts) {
      const start = kyivToUtc(dateStr, h);
      if (start < earliest || start > latest) continue;
      if (rangeIsFree(start, start + plan.hours * HOUR, busy)) free++;
    }
    out[dateStr] = free;
  }
  return out;
}

/* ---------- Перевірка даних клієнта ---------- */

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function validateContact(input) {
  const errors = {};
  const name = clean(input.name, 80);
  const phone = clean(input.phone, 32);
  const email = clean(input.email, 120);
  let telegram = clean(input.telegram, 64).replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
  const comment = String(input.comment ?? '').trim().slice(0, 1500);
  if (name.length < 2) errors.name = 'Вкажіть ім\'я';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15 || /[^\d+()\-\s]/.test(phone)) errors.phone = 'Вкажіть номер телефону, наприклад +380 67 123 45 67';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Перевірте email';
  if (telegram && !/^[A-Za-z0-9_]{4,32}$/.test(telegram)) errors.telegram = 'Нікнейм Telegram складається з латиниці, цифр і _';
  return { errors, data: { name, phone, email, telegram, comment } };
}

/* ---------- Резервування ---------- */

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function newCode() {
  const bytes = crypto.randomBytes(6);
  let s = '';
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `WR-${s}`;
}

/** Ідентифікатор події в Google Calendar (дозволені символи a–v та 0–9). */
function newEventId(bookingId) {
  const rand = crypto.randomBytes(8).toString('hex'); // 0-9a-f ⊂ base32hex
  return `bk${String(bookingId).padStart(6, '0')}${rand}`;
}

function lockRange(bookingId, start, end, { tolerateConflicts = false } = {}) {
  const ins = q('INSERT INTO slot_locks(slot_ms, booking_id) VALUES(?, ?)');
  const conflicts = [];
  for (let t = Math.floor(start / HOUR) * HOUR; t < end; t += HOUR) {
    try {
      ins.run(t, bookingId);
    } catch (err) {
      if (!isConstraintError(err)) throw err;
      if (!tolerateConflicts) throw new HttpError(409, 'Цей час щойно зайняли. Оберіть інший слот.', { code: 'SLOT_TAKEN' });
      const owner = q('SELECT booking_id FROM slot_locks WHERE slot_ms = ?').get(t);
      conflicts.push(owner?.booking_id);
    }
  }
  return [...new Set(conflicts)];
}

export function markDirty(bookingId) {
  q(`INSERT INTO gcal_outbox(booking_id, rev, attempts, next_at) VALUES(?, 1, 0, ?)
     ON CONFLICT(booking_id) DO UPDATE SET rev = rev + 1, attempts = 0, next_at = excluded.next_at, last_error = ''`)
    .run(bookingId, Date.now());
  q(`UPDATE bookings SET gcal_state = 'pending' WHERE id = ?`).run(bookingId);
}

/**
 * Створює бронювання. Уся перевірка й запис відбуваються в одній транзакції BEGIN IMMEDIATE,
 * а кожна година фізично «займається» рядком у slot_locks з PRIMARY KEY — тому дві одночасні
 * заявки на той самий час не можуть пройти обидві.
 */
export function reserve(input, { source = 'site', ip = '', bypassRules = false } = {}) {
  const service = getService(input.service);
  if (!service || (!service.bookable && !bypassRules)) throw new HttpError(400, 'Оберіть послугу', { field: 'service' });
  const date = String(input.date || '');
  if (!isValidDateStr(date)) throw new HttpError(400, 'Оберіть дату', { field: 'date' });
  const timeMatch = String(input.time || '').match(/^(\d{1,2}):00$/);
  if (!timeMatch) throw new HttpError(400, 'Оберіть час', { field: 'time' });
  const hour = Number(timeMatch[1]);

  const { errors, data } = validateContact(input);
  if (Object.keys(errors).length) throw new HttpError(400, Object.values(errors)[0], { field: Object.keys(errors)[0], errors });

  const idemKey = input.idempotencyKey ? String(input.idempotencyKey).slice(0, 64) : null;
  if (idemKey) {
    const existing = q('SELECT * FROM bookings WHERE idem_key = ?').get(idemKey);
    if (existing) return { ...existing, existing: true };
  }

  let hours;
  const plan = sessionPlan(service, date, input.hours);
  if (bypassRules) {
    hours = Math.min(Math.max(Math.round(Number(input.hours) || plan?.hours || service.duration_hours || 1), 1), 14);
  } else {
    if (!plan || !plan.starts.includes(hour)) throw new HttpError(409, 'Цей час недоступний для бронювання. Оберіть інший слот.', { code: 'SLOT_TAKEN' });
    hours = plan.hours;
  }
  const start = kyivToUtc(date, hour);
  const end = start + hours * HOUR;

  if (!bypassRules) {
    const { earliest, latest } = bookingWindow();
    if (start < earliest || start > latest) throw new HttpError(409, 'Цей час уже недоступний для бронювання. Оберіть інший слот.', { code: 'SLOT_TAKEN' });
  }

  const booking = tx(() => {
    const block = q('SELECT 1 FROM calendar_blocks WHERE end_ms > ? AND start_ms < ? LIMIT 1').get(start, end);
    if (block) throw new HttpError(409, 'Цей час щойно зайняли. Оберіть інший слот.', { code: 'SLOT_TAKEN' });
    const now = Date.now();
    const res = q(`INSERT INTO bookings
      (code, service_id, service_name, start_ms, end_ms, name, phone, email, telegram, comment, status, source, idem_key, ip, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?, 'confirmed', ?, ?, ?, ?, ?)`).run(
      newCode(), service.id, service.booking_label || service.name, start, end,
      data.name, data.phone, data.email, data.telegram, data.comment, source, idemKey, ip, now, now,
    );
    const id = Number(res.lastInsertRowid);
    lockRange(id, start, end);
    q('UPDATE bookings SET gcal_event_id = ? WHERE id = ?').run(newEventId(id), id);
    markDirty(id);
    return q('SELECT * FROM bookings WHERE id = ?').get(id);
  });

  bookingEvents.emit('created', booking);
  bookingEvents.emit('dirty');
  return booking;
}

export function getBooking(id) {
  return q('SELECT * FROM bookings WHERE id = ?').get(Number(id));
}

export function cancelBooking(id, by = 'admin') {
  const result = tx(() => {
    const b = getBooking(id);
    if (!b || b.status === 'cancelled') return b;
    q(`UPDATE bookings SET status = 'cancelled', cancelled_by = ?, updated_at = ? WHERE id = ?`).run(by, Date.now(), b.id);
    q('DELETE FROM slot_locks WHERE booking_id = ?').run(b.id);
    if (by !== 'calendar') markDirty(b.id);
    return getBooking(b.id);
  });
  bookingEvents.emit('dirty');
  return result;
}

export function setDone(id) {
  q(`UPDATE bookings SET status = 'done', updated_at = ? WHERE id = ? AND status = 'confirmed'`).run(Date.now(), Number(id));
}

/** Перенесення з адмінки: старі години звільняються і займаються нові — атомарно. */
export function rescheduleBooking(id, date, time, hours) {
  if (!isValidDateStr(date)) throw new HttpError(400, 'Некоректна дата');
  const m = String(time || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new HttpError(400, 'Некоректний час');
  const h = Math.min(Math.max(Number(hours) || 1, 1), 14);
  const start = kyivToUtc(date, Number(m[1]), Number(m[2]));
  const end = start + h * HOUR;
  const result = tx(() => {
    const b = getBooking(id);
    if (!b) throw new HttpError(404, 'Бронювання не знайдено');
    if (b.status === 'cancelled') throw new HttpError(400, 'Скасоване бронювання не можна перенести');
    q('DELETE FROM slot_locks WHERE booking_id = ?').run(b.id);
    lockRange(b.id, start, end);
    q(`UPDATE bookings SET start_ms = ?, end_ms = ?, needs_attention = 0, attention_note = '', updated_at = ? WHERE id = ?`)
      .run(start, end, Date.now(), b.id);
    markDirty(b.id);
    return getBooking(b.id);
  });
  bookingEvents.emit('dirty');
  return result;
}

/**
 * Застосовує зміну часу, що прийшла з Google Calendar. Календар — головне джерело правди
 * для власника, тому зміна приймається навіть при конфлікті, але бронювання позначається
 * як «потребує уваги».
 */
export function applyCalendarTimes(bookingId, start, end, etag) {
  return tx(() => {
    const b = getBooking(bookingId);
    if (!b) return null;
    q('DELETE FROM slot_locks WHERE booking_id = ?').run(b.id);
    const conflicts = lockRange(b.id, start, end, { tolerateConflicts: true }).filter(Boolean);
    const note = conflicts.length
      ? `Після зміни в Google Calendar час перетинається з бронюванням ${conflicts.map((c) => `#${c}`).join(', ')}.`
      : '';
    q(`UPDATE bookings SET start_ms = ?, end_ms = ?, gcal_etag = ?, gcal_state = 'synced',
        needs_attention = ?, attention_note = ?, updated_at = ? WHERE id = ?`)
      .run(start, end, etag || '', conflicts.length ? 1 : b.needs_attention, conflicts.length ? note : b.attention_note, Date.now(), b.id);
    return getBooking(b.id);
  });
}
