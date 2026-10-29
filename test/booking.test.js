// Тести бронювання та двосторонньої синхронізації з Google Calendar (з імітацією API Google).
// Запуск: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

/* ---------- Імітація Google Calendar API ---------- */
const mock = { events: new Map(), seq: 0, changes: [], calls: [] };
function etagOf() { return `"${++mock.seq}"`; }
function recordChange(ev) { mock.changes.push({ seq: mock.seq, ev: structuredClone(ev) }); }

const google = http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  const url = new URL(req.url, 'http://x');
  const json = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(obj ? JSON.stringify(obj) : ''); };
  mock.calls.push(`${req.method} ${url.pathname}`);
  if (url.pathname === '/token') return json(200, { access_token: 'test-token', expires_in: 3600 });
  if (req.headers.authorization !== 'Bearer test-token') return json(401, { error: { message: 'unauthorized' } });
  const m = url.pathname.match(/^\/calendars\/([^/]+)(\/events(?:\/([^/]+))?)?$/);
  if (!m) return json(404, { error: { message: 'not found' } });
  const [, , isEvents, eventId] = m;
  if (!isEvents) return json(200, { summary: 'Wave Studio' });
  if (req.method === 'POST' && !eventId) {
    const ev = JSON.parse(body);
    if (mock.events.has(ev.id)) return json(409, { error: { message: 'duplicate' } });
    Object.assign(ev, { status: 'confirmed', etag: etagOf() });
    mock.events.set(ev.id, ev); recordChange(ev);
    return json(200, ev);
  }
  if (req.method === 'GET' && !eventId) {
    const token = url.searchParams.get('syncToken');
    const since = token ? Number(token) : -1;
    const items = mock.changes.filter((c) => c.seq > since).map((c) => c.ev);
    const latest = new Map(items.map((e) => [e.id, e]));
    return json(200, { items: [...latest.values()], nextSyncToken: String(mock.seq) });
  }
  const ev = mock.events.get(decodeURIComponent(eventId));
  if (!ev) return json(404, { error: { message: 'not found' } });
  if (req.method === 'PATCH') {
    if (req.headers['if-match'] && req.headers['if-match'] !== ev.etag) return json(412, { error: { message: 'precondition' } });
    Object.assign(ev, JSON.parse(body), { etag: etagOf() }); recordChange(ev);
    return json(200, ev);
  }
  if (req.method === 'DELETE') {
    ev.status = 'cancelled'; ev.etag = etagOf(); recordChange(ev); mock.events.delete(ev.id);
    return json(204);
  }
  return json(405, {});
});

/** Власник змінює подію в календарі зі смартфона. */
function ownerEdit(id, patch) {
  const ev = mock.events.get(id);
  Object.assign(ev, patch, { etag: etagOf() }); recordChange(ev);
}
function ownerCreate(ev) {
  Object.assign(ev, { status: 'confirmed', etag: etagOf() });
  mock.events.set(ev.id, ev); recordChange(ev);
}
function ownerDelete(id) {
  const ev = mock.events.get(id);
  ev.status = 'cancelled'; ev.etag = etagOf(); recordChange(ev); mock.events.delete(id);
}

/* ---------- Підготовка середовища ---------- */
let mod; let server; let base; let tmp;

before(async () => {
  await new Promise((r) => google.listen(0, '127.0.0.1', r));
  const gport = google.address().port;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-test-'));
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  fs.writeFileSync(path.join(tmp, 'sa.json'), JSON.stringify({
    client_email: 'wave@test.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    token_uri: `http://127.0.0.1:${gport}/token`,
  }));
  Object.assign(process.env, {
    DATA_DIR: path.join(tmp, 'data'),
    TRUST_PROXY: '1',
    GOOGLE_SERVICE_ACCOUNT_FILE: path.join(tmp, 'sa.json'),
    GOOGLE_CALENDAR_ID: 'owner@gmail.com',
    GOOGLE_API_BASE: `http://127.0.0.1:${gport}`,
    ADMIN_PASSWORD: 'test-password-123',
  });
  const [booking, gcal, time, db, srv] = await Promise.all([
    import('../src/booking.js'), import('../src/gcal.js'), import('../src/time.js'), import('../src/db.js'), import('../src/app.js'),
  ]);
  mod = { booking, gcal, time, db };
  server = srv.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  if (google.listening) google.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Найближчий понеділок, що щонайменше за 7 днів від сьогодні. */
function futureMonday(weeksAhead = 1) {
  const { dateKey, addDays, weekday } = mod.time;
  let d = addDays(dateKey(Date.now()), 7 * weeksAhead);
  while (weekday(d) !== 1) d = addDays(d, 1);
  return d;
}

const contact = { name: 'Тарас', phone: '+380 67 123 45 67', consent: true };
const post = (body, ip) => fetch(`${base}/api/bookings`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip || `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
  body: JSON.stringify(body),
});

/* ---------- Час ---------- */
test('конвертація київського часу враховує перехід на зимовий час', () => {
  const { kyivToUtc, timeLabel } = mod.time;
  assert.equal(new Date(kyivToUtc('2026-07-01', 10)).toISOString(), '2026-07-01T07:00:00.000Z'); // літо, UTC+3
  assert.equal(new Date(kyivToUtc('2026-12-01', 10)).toISOString(), '2026-12-01T08:00:00.000Z'); // зима, UTC+2
  assert.equal(new Date(kyivToUtc('2026-10-25', 10)).toISOString(), '2026-10-25T08:00:00.000Z'); // день переходу
  assert.equal(timeLabel(kyivToUtc('2026-12-01', 19)), '19:00');
});

/* ---------- Доступність і атомарне резервування ---------- */
test('30 одночасних заявок на той самий час: проходить рівно одна', async () => {
  const date = futureMonday(1);
  const results = await Promise.all(Array.from({ length: 30 }, (_, i) =>
    post({ ...contact, service: 'mastering', date, time: '12:00', idempotencyKey: `race-${i}` }, `10.1.0.${i + 1}`)));
  const statuses = results.map((r) => r.status);
  assert.equal(statuses.filter((s) => s === 201).length, 1, `статуси: ${statuses.join(',')}`);
  assert.equal(statuses.filter((s) => s === 409).length, 29);
  const locks = mod.db.q('SELECT COUNT(*) AS n FROM slot_locks').get().n;
  assert.equal(locks, 1);
});

test('сесія на 3 години займає 3 слоти і зменшує доступні старти', async () => {
  const date = futureMonday(2);
  const svc = mod.booking.getService('recording');
  const beforeSlots = mod.booking.availability(date, svc, 3).slots.map((s) => s.time);
  assert.deepEqual(beforeSlots, ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']);
  const res = await post({ ...contact, service: 'recording', date, time: '13:00', hours: 3 });
  assert.equal(res.status, 201);
  const afterSlots = mod.booking.availability(date, svc, 1).slots.map((s) => s.time);
  assert.ok(!afterSlots.includes('13:00') && !afterSlots.includes('14:00') && !afterSlots.includes('15:00'));
  assert.ok(afterSlots.includes('12:00') && afterSlots.includes('16:00'));
  // 2-годинна сесія з 12:00 перетнулася б з 13:00 — недоступна
  assert.ok(!mod.booking.availability(date, svc, 2).slots.some((s) => s.time === '12:00'));
});

test('повторне надсилання форми (той самий ключ) не створює дубль', async () => {
  const date = futureMonday(3);
  const body = { ...contact, service: 'mastering', date, time: '10:00', idempotencyKey: 'same-key' };
  const a = await (await post(body)).json();
  const b = await (await post(body)).json();
  assert.equal(a.booking.code, b.booking.code);
  assert.equal(mod.db.q(`SELECT COUNT(*) AS n FROM bookings WHERE idem_key = 'same-key'`).get().n, 1);
});

test('вихідні, неробочі години та некоректні дані відхиляються', async () => {
  const date = futureMonday(4);
  const sunday = mod.time.addDays(date, -1);
  assert.equal((await post({ ...contact, service: 'mastering', date: sunday, time: '12:00' })).status, 409);
  assert.equal((await post({ ...contact, service: 'mastering', date, time: '21:00' })).status, 409);
  const bad = await post({ ...contact, phone: '123', service: 'mastering', date, time: '12:00' });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).field, 'phone');
  assert.equal((await post({ ...contact, consent: false, service: 'mastering', date, time: '12:00' })).status, 400);
});

/* ---------- Синхронізація з Google Calendar ---------- */
test('бронювання з сайту з\'являється в Google Calendar', async () => {
  await mod.gcal.flushOutbox();
  const pending = mod.db.q('SELECT COUNT(*) AS n FROM gcal_outbox').get().n;
  assert.equal(pending, 0);
  const b = mod.db.q(`SELECT * FROM bookings WHERE status = 'confirmed' ORDER BY id LIMIT 1`).get();
  const ev = mock.events.get(b.gcal_event_id);
  assert.ok(ev, 'подія створена');
  assert.equal(ev.extendedProperties.private.waveBookingId, String(b.id));
  assert.equal(Date.parse(ev.start.dateTime), b.start_ms);
  assert.equal(b.gcal_state, 'synced');
});

test('перенесення події в календарі оновлює бронювання на сайті', async () => {
  await mod.gcal.pullChanges(); // початкова синхронізація
  const b = mod.db.q(`SELECT * FROM bookings WHERE service_name = 'Запис' AND status = 'confirmed'`).get();
  const newStart = b.start_ms + 2 * 3600_000; // 15:00–18:00
  ownerEdit(b.gcal_event_id, {
    start: { dateTime: new Date(newStart).toISOString() },
    end: { dateTime: new Date(newStart + 3 * 3600_000).toISOString() },
  });
  await mod.gcal.pullChanges();
  const after = mod.booking.getBooking(b.id);
  assert.equal(after.start_ms, newStart);
  const locks = mod.db.q('SELECT slot_ms FROM slot_locks WHERE booking_id = ? ORDER BY slot_ms').all(b.id).map((r) => r.slot_ms);
  assert.deepEqual(locks, [newStart, newStart + 3600_000, newStart + 7200_000]);
  const date = mod.time.dateKey(newStart);
  const free = mod.booking.availability(date, mod.booking.getService('recording'), 1).slots.map((s) => s.time);
  assert.ok(free.includes('13:00') && !free.includes('15:00'), `вільно: ${free}`);
});

test('ручне блокування годин у календарі закриває ці години на сайті', async () => {
  const date = futureMonday(5);
  ownerCreate({
    id: 'personal1', summary: 'Особисте',
    start: { dateTime: new Date(mod.time.kyivToUtc(date, 14)).toISOString() },
    end: { dateTime: new Date(mod.time.kyivToUtc(date, 16)).toISOString() },
  });
  await mod.gcal.pullChanges();
  const free = mod.booking.availability(date, mod.booking.getService('mastering')).slots.map((s) => s.time);
  assert.ok(!free.includes('14:00') && !free.includes('15:00') && free.includes('16:00'), `вільно: ${free}`);
  const res = await post({ ...contact, service: 'mastering', date, time: '14:00' });
  assert.equal(res.status, 409);
  // власник прибрав блокування — час знову доступний
  ownerDelete('personal1');
  await mod.gcal.pullChanges();
  assert.ok(mod.booking.availability(date, mod.booking.getService('mastering')).slots.some((s) => s.time === '14:00'));
});

test('видалення події в календарі скасовує бронювання і звільняє час', async () => {
  const date = futureMonday(6);
  const res = await (await post({ ...contact, service: 'mastering', date, time: '11:00' })).json();
  await mod.gcal.flushOutbox();
  const b = mod.db.q('SELECT * FROM bookings WHERE code = ?').get(res.booking.code);
  ownerDelete(b.gcal_event_id);
  await mod.gcal.pullChanges();
  const after = mod.booking.getBooking(b.id);
  assert.equal(after.status, 'cancelled');
  assert.equal(after.cancelled_by, 'calendar');
  assert.equal(mod.db.q('SELECT COUNT(*) AS n FROM slot_locks WHERE booking_id = ?').get(b.id).n, 0);
});

test('скасування на сайті видаляє подію з календаря', async () => {
  const date = futureMonday(7);
  const res = await (await post({ ...contact, service: 'mastering', date, time: '15:00' })).json();
  await mod.gcal.flushOutbox();
  const b = mod.db.q('SELECT * FROM bookings WHERE code = ?').get(res.booking.code);
  assert.ok(mock.events.has(b.gcal_event_id));
  mod.booking.cancelBooking(b.id, 'admin');
  await mod.gcal.flushOutbox();
  assert.ok(!mock.events.has(b.gcal_event_id));
  await mod.gcal.pullChanges(); // наше ж видалення повертається з календаря — нічого не ламається
  assert.equal(mod.booking.getBooking(b.id).status, 'cancelled');
});

test('перенесення в календар на зайнятий час позначає бронювання «потребує уваги»', async () => {
  const date = mod.time.addDays(futureMonday(1), 1);
  const a = await (await post({ ...contact, service: 'mastering', date, time: '10:00' })).json();
  const b = await (await post({ ...contact, service: 'mastering', date, time: '12:00' })).json();
  await mod.gcal.flushOutbox();
  const bRow = mod.db.q('SELECT * FROM bookings WHERE code = ?').get(b.booking.code);
  const start = mod.time.kyivToUtc(date, 10);
  ownerEdit(bRow.gcal_event_id, { start: { dateTime: new Date(start).toISOString() }, end: { dateTime: new Date(start + 3600_000).toISOString() } });
  await mod.gcal.pullChanges();
  const after = mod.booking.getBooking(bRow.id);
  assert.equal(after.start_ms, start);
  assert.equal(after.needs_attention, 1);
  const aId = mod.db.q('SELECT id FROM bookings WHERE code = ?').get(a.booking.code).id;
  assert.match(after.attention_note, new RegExp(`#${aId}`));
});

test('збій Google не втрачає бронювання: повтор після відновлення', async () => {
  const date = mod.time.addDays(futureMonday(1), 2);
  google.close();
  google.closeAllConnections();
  await new Promise((r) => setTimeout(r, 50));
  const res = await post({ ...contact, service: 'mastering', date, time: '16:00' });
  assert.equal(res.status, 201, 'сайт приймає бронювання навіть коли Google недоступний');
  const { booking } = await res.json();
  await mod.gcal.flushOutbox();
  const job = mod.db.q('SELECT o.* FROM gcal_outbox o JOIN bookings b ON b.id = o.booking_id WHERE b.code = ?').get(booking.code);
  assert.ok(job && job.attempts === 1 && job.last_error, 'задача залишилась у черзі з помилкою');
});
