// Власна статистика без cookies: перегляди сторінок, унікальні відвідувачі (анонімний хеш, що змінюється щодня),
// джерела переходів, прослуховування треків, бронювання.
import crypto from 'node:crypto';
import { q, kvGet, kvSet } from './db.js';
import { dateKey, addDays } from './time.js';

const BOT_RE = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|axios|facebookexternalhit|embedly|whatsapp|telegrambot/i;

function secret() {
  let s = kvGet('stats.secret');
  if (!s) { s = crypto.randomBytes(32).toString('hex'); kvSet('stats.secret', s); }
  return s;
}

export function trackPageview(req, path) {
  const ua = String(req.headers['user-agent'] || '');
  if (!ua || BOT_RE.test(ua)) return;
  if (req.headers.purpose === 'prefetch' || req.headers['sec-purpose']?.includes('prefetch')) return;
  const now = Date.now();
  const day = dateKey(now);
  const visitor = crypto.createHmac('sha256', secret()).update(`${day}|${req.ip}|${ua}`).digest('hex').slice(0, 20);
  let refHost = '';
  try {
    const ref = new URL(req.headers.referer || '');
    if (ref.host !== req.headers.host) refHost = ref.host.replace(/^www\./, '');
  } catch { /* без реферера */ }
  const utm = String(req.query.utm_source || '').slice(0, 60);
  const device = /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : /iPad|Tablet/i.test(ua) ? 'tablet' : 'desktop';
  q('INSERT INTO pageviews(day, ts, path, ref_host, utm, device, visitor) VALUES(?,?,?,?,?,?,?)')
    .run(day, now, path, refHost, utm, device, visitor);
}

export function trackEvent(type, ref = '') {
  const now = Date.now();
  q('INSERT INTO events(day, ts, type, ref) VALUES(?,?,?,?)').run(dateKey(now), now, type, String(ref).slice(0, 100));
}

export function summary(days = 30) {
  const today = dateKey(Date.now());
  const from = addDays(today, -(days - 1));
  const prevFrom = addDays(from, -days);
  const daily = q(`SELECT day, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors FROM pageviews WHERE day >= ? GROUP BY day`).all(from);
  const byDay = Object.fromEntries(daily.map((r) => [r.day, r]));
  const series = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    series.push({ day: d, views: byDay[d]?.views || 0, visitors: byDay[d]?.visitors || 0 });
  }
  const totals = q(`SELECT COUNT(*) AS views, COUNT(DISTINCT day || visitor) AS visitors FROM pageviews WHERE day >= ?`).get(from);
  const prev = q(`SELECT COUNT(*) AS views, COUNT(DISTINCT day || visitor) AS visitors FROM pageviews WHERE day >= ? AND day < ?`).get(prevFrom, from);
  const fromMs = Date.parse(`${from}T00:00:00Z`) - 3 * 3600_000;
  const bookings = q(`SELECT COUNT(*) AS n FROM bookings WHERE created_at >= ? AND source = 'site'`).get(fromMs).n;
  const plays = q(`SELECT COUNT(*) AS n FROM events WHERE type = 'play' AND day >= ?`).get(from).n;
  return {
    days, series, totals, prev, bookings, plays,
    conversion: totals.visitors ? (bookings / totals.visitors) * 100 : 0,
    pages: q(`SELECT path, COUNT(*) AS views, COUNT(DISTINCT day || visitor) AS visitors FROM pageviews WHERE day >= ? GROUP BY path ORDER BY views DESC LIMIT 10`).all(from),
    sources: q(`SELECT CASE WHEN utm != '' THEN utm || ' (utm)' WHEN ref_host != '' THEN ref_host ELSE 'Прямі заходи' END AS source,
                COUNT(DISTINCT day || visitor) AS visitors FROM pageviews WHERE day >= ? GROUP BY source ORDER BY visitors DESC LIMIT 10`).all(from),
    devices: q(`SELECT device, COUNT(DISTINCT day || visitor) AS visitors FROM pageviews WHERE day >= ? GROUP BY device ORDER BY visitors DESC`).all(from),
    topTracks: q(`SELECT t.id, t.artist, t.title, t.category, COUNT(e.id) AS plays FROM events e JOIN tracks t ON t.id = CAST(e.ref AS INTEGER)
                  WHERE e.type = 'play' AND e.day >= ? GROUP BY t.id ORDER BY plays DESC LIMIT 8`).all(from),
  };
}

/** Видаляє сирі перегляди старші за рік. */
export function prune() {
  q('DELETE FROM pageviews WHERE day < ?').run(addDays(dateKey(Date.now()), -400));
}
