import path from 'node:path';
import { config } from '../config.js';
import { q } from '../db.js';
import { sendHtml, sendJson, send, serveFile, safeJoin, parseBody, HttpError, rateLimiter } from '../http.js';
import * as views from '../views/public.js';
import { trackPageview, trackEvent } from '../stats.js';
import { bookableServices, getService, availability, monthAvailability, reserve } from '../booking.js';
import * as gcal from '../gcal.js';
import { block } from '../content.js';
import { fmt, dateKey, isValidDateStr } from '../time.js';
import { currentSession } from '../auth.js';
import { notifyNewBooking } from '../notify.js';

const bookingLimiter = rateLimiter({ windowMs: 3600_000, max: 8 });
const apiLimiter = rateLimiter({ windowMs: 60_000, max: 120 });
const eventLimiter = rateLimiter({ windowMs: 60_000, max: 60 });

function page(render, pathForStats) {
  return (req, res) => {
    if (!currentSession(req)) trackPageview(req, pathForStats || req.path);
    sendHtml(req, res, render(req));
  };
}

const tracksBy = (category) => q('SELECT * FROM tracks WHERE category = ? ORDER BY sort, id').all(category);

export function registerSite(r) {
  r.get('/', page(() => {
    const homeServices = q('SELECT * FROM services WHERE show_on_home = 1 ORDER BY home_sort, sort, id').all();
    let tracks = q('SELECT * FROM tracks WHERE on_home = 1 ORDER BY sort, id LIMIT 4').all();
    if (!tracks.length) tracks = q('SELECT * FROM tracks ORDER BY created_at DESC LIMIT 4').all();
    return views.homePage({ homeServices, tracks });
  }, '/'));

  r.get('/home', (req, res) => { res.writeHead(301, { Location: '/' }); res.end(); });

  r.get('/services', page(() => views.servicesPage({
    sound: q(`SELECT * FROM services WHERE category = 'sound' AND show_on_services = 1 ORDER BY sort, id`).all(),
    media: q(`SELECT * FROM services WHERE category = 'media' AND show_on_services = 1 ORDER BY sort, id`).all(),
  })));

  r.get('/portfolio', page(() => views.portfolioPage({ vocal: tracksBy('vocal'), music: tracksBy('music'), b2b: tracksBy('b2b') })));

  r.get('/about', page(() => views.aboutPage({ photos: q('SELECT * FROM photos ORDER BY sort, id').all() })));

  r.get('/book', page((req) => views.bookPage({ services: bookableServices(), preselect: String(req.query.service || '') })));

  r.get('/contacts', page(() => views.contactsPage()));
  r.get('/privacy-policy', page(() => views.legalPage('legal.privacy', '/privacy-policy')));
  r.get('/agreement', page(() => views.legalPage('legal.agreement', '/agreement')));

  r.get('/robots.txt', (req, res) => {
    const base = config.publicUrl;
    send(req, res, 200, `User-agent: *\nDisallow: /admin\nDisallow: /api\n${base ? `Sitemap: ${base}/sitemap.xml\n` : ''}`);
  });
  r.get('/sitemap.xml', (req, res) => {
    const base = config.publicUrl || `http://${req.headers.host}`;
    const urls = ['/', '/services', '/portfolio', '/about', '/book', '/contacts', '/privacy-policy', '/agreement'];
    send(req, res, 200, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${base}${u}</loc></url>`).join('')}</urlset>`, 'application/xml; charset=utf-8');
  });

  /* ---------- Статичні файли та медіа ---------- */
  r.get('/assets/:a', staticHandler);
  r.get('/assets/:a/:b', staticHandler);
  r.get('/favicon.ico', (req, res) => serveFile(req, res, path.join(config.root, 'public/img/favicon.svg'), { cache: 'public, max-age=86400' }));

  r.get('/media/audio/:file', (req, res) => {
    const file = safeJoin(config.audioDir, req.params.file);
    if (!file || !serveFile(req, res, file, { cache: 'public, max-age=31536000, immutable' })) throw new HttpError(404, 'Файл не знайдено');
  });
  r.get('/media/photos/:file', (req, res) => {
    const file = safeJoin(config.photoDir, req.params.file);
    if (!file || !serveFile(req, res, file, { cache: 'public, max-age=31536000, immutable' })) throw new HttpError(404, 'Файл не знайдено');
  });

  /* ---------- API бронювання ---------- */
  r.get('/api/availability', async (req, res) => {
    if (!apiLimiter(req.ip)) throw new HttpError(429, 'Забагато запитів');
    const service = getService(req.query.service || '');
    if (!service?.bookable) throw new HttpError(400, 'Оберіть послугу');
    const { date, month, hours } = req.query;
    if (month) return sendJson(req, res, { month, days: monthAvailability(month, service, hours) });
    if (!isValidDateStr(date)) throw new HttpError(400, 'Некоректна дата');
    await gcal.ensureFresh(60_000, 2500);
    const result = availability(date, service, hours);
    sendJson(req, res, { date, ...result });
  });

  r.post('/api/bookings', async (req, res) => {
    const origin = req.headers.origin;
    if (origin) {
      let host = null;
      try { host = new URL(origin).host; } catch { /* некоректний origin */ }
      if (host !== req.headers.host) throw new HttpError(403, 'Запит відхилено');
    }
    const body = await parseBody(req, 32 * 1024);
    if (body.website) return sendJson(req, res, { ok: true, spam: true }); // honeypot
    if (!body.consent) throw new HttpError(400, 'Потрібна згода з політикою конфіденційності', { field: 'consent' });
    if (!bookingLimiter(req.ip)) throw new HttpError(429, 'Забагато заявок з вашої мережі. Зателефонуйте нам, і ми запишемо вас вручну.');

    await gcal.ensureFresh(); // свіжі ручні блокування з календаря перед резервуванням
    const booking = reserve(body, { source: 'site', ip: req.ip });
    if (!booking.existing) {
      trackEvent('booking', booking.id);
      notifyNewBooking(booking).catch(() => {});
    }
    const info = block('book.info');
    sendJson(req, res, {
      ok: true,
      booking: {
        code: booking.code,
        service: booking.service_name,
        date: fmt.long(booking.start_ms),
        time: fmt.range(booking.start_ms, booking.end_ms),
        address: info.address,
        start: booking.start_ms,
        ics: `/api/bookings/${booking.code}/ics`,
      },
    }, 201);
  });

  r.get('/api/bookings/:code/ics', (req, res) => {
    const b = q(`SELECT * FROM bookings WHERE code = ? AND status != 'cancelled'`).get(req.params.code);
    if (!b) throw new HttpError(404, 'Бронювання не знайдено');
    const info = block('book.info');
    const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const escIcs = (s) => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wave Records//Booking//UK', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${b.code}@wave-records`,
      `DTSTAMP:${stamp(Date.now())}`,
      `DTSTART:${stamp(b.start_ms)}`,
      `DTEND:${stamp(b.end_ms)}`,
      `SUMMARY:${escIcs(`Wave Records — ${b.service_name}`)}`,
      `LOCATION:${escIcs(info.address)}`,
      `DESCRIPTION:${escIcs(`Код бронювання: ${b.code}`)}`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    send(req, res, 200, ics, 'text/calendar; charset=utf-8', { 'Content-Disposition': `attachment; filename="wave-${b.code}.ics"` });
  });

  /* ---------- Події для статистики (прослуховування) ---------- */
  r.post('/api/e', async (req, res) => {
    const body = await parseBody(req, 2048).catch(() => ({}));
    if (eventLimiter(req.ip) && body.type === 'play' && /^\d+$/.test(String(body.id || ''))) {
      const res2 = q('UPDATE tracks SET plays = plays + 1 WHERE id = ?').run(Number(body.id));
      if (res2.changes) trackEvent('play', body.id);
    }
    res.writeHead(204); res.end();
  });

  /* ---------- Webhook Google Calendar ---------- */
  r.post('/api/gcal/webhook', async (req, res) => {
    await parseBody(req, 64 * 1024).catch(() => null);
    const ok = gcal.handleWebhook(req.headers);
    res.writeHead(ok ? 200 : 403); res.end();
  });

  r.get('/api/health', (req, res) => sendJson(req, res, { ok: true, time: dateKey(Date.now()) }));
}

function staticHandler(req, res) {
  const rel = [req.params.a, req.params.b].filter(Boolean).join('/');
  const file = safeJoin(path.join(config.root, 'public'), rel);
  const cache = req.query.v ? 'public, max-age=31536000, immutable' : 'public, max-age=3600';
  if (!file || !serveFile(req, res, file, { cache })) throw new HttpError(404, 'Файл не знайдено');
}
