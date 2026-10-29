import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

export const db = new DatabaseSync(config.dbFile);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;
  PRAGMA synchronous = NORMAL;
`);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS services (
  id               INTEGER PRIMARY KEY,
  slug             TEXT UNIQUE NOT NULL,
  category         TEXT NOT NULL DEFAULT 'sound',     -- sound | media
  name             TEXT NOT NULL,
  price_label      TEXT NOT NULL DEFAULT '',
  description      TEXT NOT NULL DEFAULT '',
  home_title       TEXT NOT NULL DEFAULT '',
  home_price       TEXT NOT NULL DEFAULT '',
  show_on_home     INTEGER NOT NULL DEFAULT 0,
  show_on_services INTEGER NOT NULL DEFAULT 1,
  bookable         INTEGER NOT NULL DEFAULT 0,
  booking_label    TEXT NOT NULL DEFAULT '',
  duration_mode    TEXT NOT NULL DEFAULT 'fixed',     -- fixed | choose | day
  duration_hours   INTEGER NOT NULL DEFAULT 1,
  max_hours        INTEGER NOT NULL DEFAULT 8,
  sort             INTEGER NOT NULL DEFAULT 0,
  home_sort        INTEGER NOT NULL DEFAULT 0,
  booking_sort     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bookings (
  id               INTEGER PRIMARY KEY,
  code             TEXT UNIQUE NOT NULL,
  service_id       INTEGER,
  service_name     TEXT NOT NULL,
  start_ms         INTEGER NOT NULL,
  end_ms           INTEGER NOT NULL,
  name             TEXT NOT NULL,
  phone            TEXT NOT NULL,
  email            TEXT NOT NULL DEFAULT '',
  telegram         TEXT NOT NULL DEFAULT '',
  comment          TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'confirmed', -- confirmed | done | cancelled
  source           TEXT NOT NULL DEFAULT 'site',      -- site | admin
  agreed_price     TEXT NOT NULL DEFAULT '',
  admin_note       TEXT NOT NULL DEFAULT '',
  needs_attention  INTEGER NOT NULL DEFAULT 0,
  attention_note   TEXT NOT NULL DEFAULT '',
  cancelled_by     TEXT NOT NULL DEFAULT '',
  gcal_event_id    TEXT NOT NULL DEFAULT '',
  gcal_etag        TEXT NOT NULL DEFAULT '',
  gcal_state       TEXT NOT NULL DEFAULT 'pending',   -- pending | synced | error | off
  idem_key         TEXT UNIQUE,
  ip               TEXT NOT NULL DEFAULT '',
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bookings_start ON bookings(start_ms);
CREATE INDEX IF NOT EXISTS bookings_event ON bookings(gcal_event_id);

-- Кожна зайнята година = один рядок. PRIMARY KEY гарантує, що
-- дві заявки ніколи не займуть одну годину, навіть якщо прийшли одночасно.
CREATE TABLE IF NOT EXISTS slot_locks (
  slot_ms    INTEGER PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS slot_locks_booking ON slot_locks(booking_id);

-- Події з Google Calendar, які створили не ми (ручні блокування, особисті справи).
CREATE TABLE IF NOT EXISTS calendar_blocks (
  event_id   TEXT PRIMARY KEY,
  start_ms   INTEGER NOT NULL,
  end_ms     INTEGER NOT NULL,
  summary    TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS calendar_blocks_range ON calendar_blocks(start_ms, end_ms);

-- Черга синхронізації з Google Calendar: «бронювання N потрібно привести у відповідність».
CREATE TABLE IF NOT EXISTS gcal_outbox (
  booking_id INTEGER PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  rev        INTEGER NOT NULL DEFAULT 1,
  attempts   INTEGER NOT NULL DEFAULT 0,
  next_at    INTEGER NOT NULL,
  last_error TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tracks (
  id         INTEGER PRIMARY KEY,
  category   TEXT NOT NULL,                -- vocal | music | b2b
  artist     TEXT NOT NULL DEFAULT '',
  title      TEXT NOT NULL DEFAULT '',
  file       TEXT NOT NULL,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL DEFAULT 0,
  duration   REAL NOT NULL DEFAULT 0,
  peaks      TEXT NOT NULL DEFAULT '',
  on_home    INTEGER NOT NULL DEFAULT 0,
  sort       INTEGER NOT NULL DEFAULT 0,
  plays      INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
  id         INTEGER PRIMARY KEY,
  file       TEXT NOT NULL,
  mime       TEXT NOT NULL,
  width      INTEGER NOT NULL DEFAULT 0,
  height     INTEGER NOT NULL DEFAULT 0,
  alt        TEXT NOT NULL DEFAULT '',
  placement  TEXT NOT NULL DEFAULT 'gallery',
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS content (
  key        TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  visible    INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pageviews (
  id       INTEGER PRIMARY KEY,
  day      TEXT NOT NULL,
  ts       INTEGER NOT NULL,
  path     TEXT NOT NULL,
  ref_host TEXT NOT NULL DEFAULT '',
  utm      TEXT NOT NULL DEFAULT '',
  device   TEXT NOT NULL DEFAULT '',
  visitor  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pageviews_day ON pageviews(day);

CREATE TABLE IF NOT EXISTS events (
  id    INTEGER PRIMARY KEY,
  day   TEXT NOT NULL,
  ts    INTEGER NOT NULL,
  type  TEXT NOT NULL,
  ref   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS events_day ON events(day, type);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  csrf       TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
`;

db.exec(SCHEMA);

const cache = new Map();
/** Підготовлений запит із кешем. */
export function q(sql) {
  let st = cache.get(sql);
  if (!st) { st = db.prepare(sql); cache.set(sql, st); }
  return st;
}

let depth = 0;
/** Атомарна транзакція (BEGIN IMMEDIATE одразу бере блокування на запис). */
export function tx(fn) {
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    depth--;
  }
}

export function kvGet(key, fallback = null) {
  const row = q('SELECT value FROM kv WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

export function kvSet(key, value) {
  q('INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

export function isConstraintError(err) {
  return err && (err.errcode === 1555 || err.errcode === 2067 || /UNIQUE constraint/.test(err.message || ''));
}

/* ---------- Початкові послуги ---------- */

const SEED_SERVICES = [
  // slug, category, name, price, description, home_title, home_price, on_home, on_services, bookable, booking_label, mode, hours, sort, home_sort, booking_sort
  ['recording', 'sound', 'Година запису', '700 грн / год', '', 'Запис вокалу', '700 грн / год', 1, 1, 1, 'Запис', 'choose', 2, 10, 10, 10],
  ['wave-plus', 'sound', 'Пакет Wave Plus', '3 999 грн', '2 години запису + зведення 1 проєкту + мастеринг.', '', '', 0, 1, 1, 'Пакет Wave Plus', 'fixed', 2, 20, 0, 40],
  ['wave-pro', 'sound', 'Пакет Wave Pro', '5 999 грн', 'Повний студійний день + зведення 1 проєкту + мастеринг.', '', '', 0, 1, 1, 'Пакет Wave Pro', 'day', 10, 30, 0, 50],
  ['vocal-mixing', 'sound', 'Зведення вокалу', '2 500 – 5 500 грн', 'Ціна залежить від складності проєкту. Після підтвердження бронювання наш менеджер зв\'яжеться з Вами і буде домовлено остаточну ціну.', 'Зведення', 'від 2 500 грн', 1, 1, 1, 'Зведення', 'fixed', 2, 40, 20, 20],
  ['arrangement', 'sound', 'Аранжування / Біт', '3 500 – 7 000 грн', 'Ціна залежить від складності проєкту. Після підтвердження бронювання наш менеджер зв\'яжеться з Вами і буде домовлено остаточну ціну.', 'Аранжування / Біт', 'від 3 500 грн', 1, 1, 1, 'Аранжування / Біт', 'fixed', 2, 50, 40, 60],
  ['arrangement-mixing', 'sound', 'Зведення аранжування', '1 500 грн', 'Для цієї послуги у Вас повинен бути трекаут проєкту (всі записи інструментів окремими файлами).', '', '', 0, 1, 0, '', 'fixed', 1, 60, 0, 0],
  ['mastering', 'sound', 'Мастеринг', '1 000 грн', '', 'Мастеринг', '1 000 грн', 1, 1, 1, 'Мастеринг', 'fixed', 1, 70, 30, 30],
  ['turnkey', 'sound', 'Пісня під ключ', 'від 20 000 грн', 'У послугу входить повний процес створення пісні з нуля. Ціна залежить від складності проєкту. Після підтвердження бронювання наш менеджер зв\'яжеться з Вами і буде домовлено остаточну ціну.', 'Пісня під ключ', '14 000 грн', 1, 1, 1, 'Пісня під ключ', 'fixed', 2, 80, 50, 70],
  ['distribution', 'media', 'Дистрибуція', '500 грн', '', 'Дистрибуція', '500 грн', 1, 0, 0, '', 'fixed', 1, 85, 60, 0],
  ['cover', 'media', 'Обкладинка для треку', '1 100 – 1 700 грн', 'Після підтвердження бронювання наш менеджер зв\'яжеться з Вами і буде домовлено остаточну ціну.', '', '', 0, 1, 0, '', 'fixed', 1, 90, 0, 0],
  ['cover-animation', 'media', 'Анімація обкладинки', '550 – 850 грн', 'Після підтвердження бронювання наш менеджер зв\'яжеться з Вами і буде домовлено остаточну ціну.', '', '', 0, 1, 0, '', 'fixed', 1, 100, 0, 0],
  ['lyric-video', 'media', 'Ліричне відео', '4 500 грн', '', '', '', 0, 1, 0, '', 'fixed', 1, 110, 0, 0],
  ['banners', 'media', 'Дизайн банерів', '1 000 грн', '', '', '', 0, 1, 0, '', 'fixed', 1, 120, 0, 0],
  ['press-kit', 'media', 'Створення прес-пакету', '1 700 грн', '', '', '', 0, 1, 0, '', 'fixed', 1, 130, 0, 0],
  ['playlist-pitching', 'media', 'Розсилка по плейлистах', '1 000 грн', '', '', '', 0, 1, 0, '', 'fixed', 1, 140, 0, 0],
];

if (!q('SELECT 1 FROM services LIMIT 1').get()) {
  const ins = db.prepare(`INSERT INTO services
    (slug, category, name, price_label, description, home_title, home_price, show_on_home, show_on_services,
     bookable, booking_label, duration_mode, duration_hours, sort, home_sort, booking_sort)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  tx(() => { for (const s of SEED_SERVICES) ins.run(...s); });
}
