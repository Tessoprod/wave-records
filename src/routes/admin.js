import { config } from '../config.js';
import { q, tx } from '../db.js';
import { sendHtml, sendJson, redirect, parseBody, HttpError } from '../http.js';
import { login, logout, requireAdmin, checkCsrf, changePassword, currentSession } from '../auth.js';
import * as A from '../views/admin.js';
import { summary } from '../stats.js';
import * as gcal from '../gcal.js';
import { BLOCKS, BLOCK_MAP, block, saveBlock, resetBlock } from '../content.js';
import { getSettings, saveSettings } from '../settings.js';
import { reserve, cancelBooking, setDone, rescheduleBooking, getBooking, markDirty, bookingEvents } from '../booking.js';
import { receiveUpload, wavDuration, removeFile } from '../uploads.js';
import path from 'node:path';

const CATEGORIES = ['vocal', 'music', 'b2b'];
const PLACEMENTS = ['gallery', 'about-hero', 'process-1', 'process-2', 'process-3', 'process-4', 'process-5'];

/** Обробники, що вимагають входу; для POST/PUT/DELETE перевіряють CSRF. */
function guarded(fn, { body = 'form' } = {}) {
  return async (req, res) => {
    requireAdmin(req, res);
    if (res.writableEnded) return;
    if (req.method !== 'GET') {
      let token;
      if (body === 'form') token = (await parseBody(req, 2 * 1024 * 1024))._csrf;
      checkCsrf(req, token);
    }
    return fn(req, res);
  };
}

const flashUrl = (url, msg, kind = 'ok') => `${url}${url.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(msg)}`;
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const int = (v, def = 0) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Math.round(Number(v)) : def);
const bool = (v) => (v === 'on' || v === '1' || v === 'true' || v === true ? 1 : 0);

export function registerAdmin(r) {
  /* ---------- Вхід ---------- */
  r.get('/admin/login', (req, res) => {
    if (currentSession(req)) return redirect(res, '/admin');
    sendHtml(req, res, A.loginPage({ next: req.query.next, error: req.query.error }));
  });
  r.post('/admin/login', async (req, res) => {
    const body = await parseBody(req);
    const next = /^\/admin(\/|$)/.test(String(body.next || '')) ? body.next : '/admin';
    try {
      login(req, res, body.user, body.password);
      redirect(res, next);
    } catch (err) {
      sendHtml(req, res, A.loginPage({ next, error: err.message }), err.status || 401);
    }
  });
  r.post('/admin/logout', guarded((req, res) => { logout(req, res); redirect(res, '/admin/login'); }));

  /* ---------- Огляд ---------- */
  r.get('/admin', guarded((req, res) => {
    const now = Date.now();
    sendHtml(req, res, A.dashboardPage(req, {
      stats: summary(30),
      upcoming: q(`SELECT * FROM bookings WHERE status = 'confirmed' AND end_ms > ? ORDER BY start_ms LIMIT 8`).all(now),
      attention: q(`SELECT COUNT(*) AS n FROM bookings WHERE needs_attention = 1 AND status != 'cancelled'`).get().n,
      gcal: gcal.status(),
    }));
  }));

  /* ---------- Бронювання ---------- */
  r.get('/admin/bookings', guarded((req, res) => {
    const f = ['upcoming', 'past', 'cancelled', 'attention', 'all'].includes(req.query.f) ? req.query.f : 'upcoming';
    const now = Date.now();
    const where = {
      upcoming: [`status != 'cancelled' AND end_ms > ?`, [now], 'start_ms ASC'],
      past: [`status != 'cancelled' AND end_ms <= ?`, [now], 'start_ms DESC'],
      cancelled: [`status = 'cancelled'`, [], 'start_ms DESC'],
      attention: [`needs_attention = 1 AND status != 'cancelled'`, [], 'start_ms ASC'],
      all: ['1 = 1', [], 'start_ms DESC'],
    }[f];
    const rows = q(`SELECT * FROM bookings WHERE ${where[0]} ORDER BY ${where[2]} LIMIT 300`).all(...where[1]);
    sendHtml(req, res, A.bookingsPage(req, { rows, filter: f, gcalOn: gcal.isConfigured() }));
  }));

  r.get('/admin/bookings/new', guarded((req, res) => {
    sendHtml(req, res, A.bookingNewPage(req, { services: q('SELECT * FROM services ORDER BY sort, id').all() }));
  }));

  r.post('/admin/bookings', guarded(async (req, res) => {
    const body = req.body;
    try {
      const b = reserve({ ...body, comment: body.comment || '' }, { source: 'admin', bypassRules: true });
      redirect(res, flashUrl(`/admin/bookings/${b.id}`, 'Бронювання створено'));
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      sendHtml(req, res, A.bookingNewPage(req, { services: q('SELECT * FROM services ORDER BY sort, id').all(), error: err.message, values: body }), 400);
    }
  }));

  r.get('/admin/bookings/:id', guarded((req, res) => {
    const b = getBooking(req.params.id);
    if (!b) throw new HttpError(404, 'Бронювання не знайдено');
    const outbox = q('SELECT * FROM gcal_outbox WHERE booking_id = ?').get(b.id);
    sendHtml(req, res, A.bookingPage(req, { b, outbox, gcalOn: gcal.isConfigured() }));
  }));

  r.post('/admin/bookings/:id', guarded(async (req, res) => {
    const b = getBooking(req.params.id);
    if (!b) throw new HttpError(404, 'Бронювання не знайдено');
    const body = req.body;
    const back = `/admin/bookings/${b.id}`;
    try {
      switch (body.action) {
        case 'notes':
          q('UPDATE bookings SET agreed_price = ?, admin_note = ?, updated_at = ? WHERE id = ?').run(str(body.agreed_price, 100), str(body.admin_note, 3000), Date.now(), b.id);
          return redirect(res, flashUrl(back, 'Збережено'));
        case 'contact':
          q('UPDATE bookings SET name = ?, phone = ?, email = ?, telegram = ?, updated_at = ? WHERE id = ?')
            .run(str(body.name, 80), str(body.phone, 32), str(body.email, 120), str(body.telegram, 64).replace(/^@/, ''), Date.now(), b.id);
          if (b.status !== 'cancelled') { markDirty(b.id); bookingEvents.emit('dirty'); }
          return redirect(res, flashUrl(back, 'Контакти оновлено'));
        case 'done':
          setDone(b.id);
          return redirect(res, flashUrl(back, 'Позначено як виконане'));
        case 'cancel':
          cancelBooking(b.id, 'admin');
          return redirect(res, flashUrl(back, 'Бронювання скасовано, час звільнено'));
        case 'reschedule':
          rescheduleBooking(b.id, body.date, body.time, body.hours);
          return redirect(res, flashUrl(back, 'Бронювання перенесено'));
        case 'resolve':
          q(`UPDATE bookings SET needs_attention = 0, attention_note = '' WHERE id = ?`).run(b.id);
          return redirect(res, flashUrl(back, 'Позначено як вирішене'));
        case 'resync':
          markDirty(b.id); bookingEvents.emit('dirty');
          return redirect(res, flashUrl(back, 'Синхронізацію з календарем поставлено в чергу'));
        default:
          throw new HttpError(400, 'Невідома дія');
      }
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      redirect(res, flashUrl(back, err.message, 'err'));
    }
  }));

  /* ---------- Треки ---------- */
  r.get('/admin/tracks', guarded((req, res) => {
    sendHtml(req, res, A.tracksPage(req, { tracks: q('SELECT * FROM tracks ORDER BY category, sort, id').all() }));
  }));

  r.put('/admin/api/tracks', guarded(async (req, res) => {
    const category = CATEGORIES.includes(req.query.category) ? req.query.category : null;
    if (!category) throw new HttpError(400, 'Оберіть розділ');
    const up = await receiveUpload(req, config.audioDir, { maxBytes: config.maxAudioBytes, kind: 'audio' });
    let duration = Number(req.query.duration) || 0;
    if (!duration && up.mime === 'audio/wav') duration = wavDuration(path.join(config.audioDir, up.file));
    const sort = (q('SELECT MAX(sort) AS m FROM tracks WHERE category = ?').get(category).m || 0) + 10;
    const homeCount = q('SELECT COUNT(*) AS n FROM tracks WHERE on_home = 1').get().n;
    const r2 = q(`INSERT INTO tracks(category, artist, title, file, mime, size, duration, peaks, on_home, sort, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .run(category, str(req.query.artist, 120), str(req.query.title, 160) || 'Без назви', up.file, up.mime, up.size, duration,
        cleanPeaks(req.query.peaks), homeCount < 4 && category === 'vocal' ? 1 : 0, sort, Date.now());
    sendJson(req, res, { ok: true, id: Number(r2.lastInsertRowid) }, 201);
  }, { body: 'none' }));

  r.put('/admin/api/tracks/:id/file', guarded(async (req, res) => {
    const t = q('SELECT * FROM tracks WHERE id = ?').get(Number(req.params.id));
    if (!t) throw new HttpError(404, 'Трек не знайдено');
    const up = await receiveUpload(req, config.audioDir, { maxBytes: config.maxAudioBytes, kind: 'audio' });
    let duration = Number(req.query.duration) || 0;
    if (!duration && up.mime === 'audio/wav') duration = wavDuration(path.join(config.audioDir, up.file));
    q('UPDATE tracks SET file = ?, mime = ?, size = ?, duration = ?, peaks = ? WHERE id = ?').run(up.file, up.mime, up.size, duration, cleanPeaks(req.query.peaks), t.id);
    removeFile(config.audioDir, t.file);
    sendJson(req, res, { ok: true });
  }, { body: 'none' }));

  r.post('/admin/api/tracks/:id', guarded(async (req, res) => {
    const body = await parseBody(req);
    const t = q('SELECT * FROM tracks WHERE id = ?').get(Number(req.params.id));
    if (!t) throw new HttpError(404, 'Трек не знайдено');
    const category = CATEGORIES.includes(body.category) ? body.category : t.category;
    q('UPDATE tracks SET artist = ?, title = ?, category = ?, on_home = ? WHERE id = ?')
      .run(str(body.artist, 120), str(body.title, 160) || t.title, category, bool(body.on_home), t.id);
    sendJson(req, res, { ok: true });
  }, { body: 'none' }));

  r.delete('/admin/api/tracks/:id', guarded((req, res) => {
    const t = q('SELECT * FROM tracks WHERE id = ?').get(Number(req.params.id));
    if (!t) throw new HttpError(404, 'Трек не знайдено');
    q('DELETE FROM tracks WHERE id = ?').run(t.id);
    removeFile(config.audioDir, t.file);
    sendJson(req, res, { ok: true });
  }, { body: 'none' }));

  r.post('/admin/api/reorder', guarded(async (req, res) => {
    const body = await parseBody(req);
    const table = body.kind === 'photos' ? 'photos' : 'tracks';
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Boolean);
    tx(() => ids.forEach((id, i) => q(`UPDATE ${table} SET sort = ? WHERE id = ?`).run((i + 1) * 10, id)));
    sendJson(req, res, { ok: true });
  }, { body: 'none' }));

  /* ---------- Фото ---------- */
  r.get('/admin/photos', guarded((req, res) => {
    sendHtml(req, res, A.photosPage(req, { photos: q('SELECT * FROM photos ORDER BY sort, id').all() }));
  }));

  r.put('/admin/api/photos', guarded(async (req, res) => {
    const up = await receiveUpload(req, config.photoDir, { maxBytes: config.maxPhotoBytes, kind: 'image' });
    const placement = PLACEMENTS.includes(req.query.placement) ? req.query.placement : 'gallery';
    const sort = (q('SELECT MAX(sort) AS m FROM photos').get().m || 0) + 10;
    const r2 = q('INSERT INTO photos(file, mime, width, height, alt, placement, sort, created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(up.file, up.mime, int(req.query.width), int(req.query.height), str(req.query.alt, 200), placement, sort, Date.now());
    sendJson(req, res, { ok: true, id: Number(r2.lastInsertRowid) }, 201);
  }, { body: 'none' }));

  r.post('/admin/api/photos/:id', guarded(async (req, res) => {
    const body = await parseBody(req);
    const p = q('SELECT * FROM photos WHERE id = ?').get(Number(req.params.id));
    if (!p) throw new HttpError(404, 'Фото не знайдено');
    const placement = PLACEMENTS.includes(body.placement) ? body.placement : p.placement;
    q('UPDATE photos SET alt = ?, placement = ? WHERE id = ?').run(str(body.alt, 200), placement, p.id);
    sendJson(req, res, { ok: true });
  }, { body: 'none' }));

  r.delete('/admin/api/photos/:id', guarded((req, res) => {
    const p = q('SELECT * FROM photos WHERE id = ?').get(Number(req.params.id));
    if (!p) throw new HttpError(404, 'Фото не знайдено');
    q('DELETE FROM photos WHERE id = ?').run(p.id);
    removeFile(config.photoDir, p.file);
    sendJson(req, res, { ok: true });
  }, { body: 'none' }));

  /* ---------- Послуги ---------- */
  r.get('/admin/services', guarded((req, res) => {
    sendHtml(req, res, A.servicesPage(req, { services: q('SELECT * FROM services ORDER BY category DESC, sort, id').all() }));
  }));

  r.post('/admin/services/:id', guarded(async (req, res) => {
    const b = req.body;
    if (req.params.id === 'new') {
      const name = str(b.name, 120);
      if (!name) return redirect(res, flashUrl('/admin/services', 'Вкажіть назву послуги', 'err'));
      const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'service'}-${Date.now().toString(36)}`;
      const sort = (q('SELECT MAX(sort) AS m FROM services').get().m || 0) + 10;
      q(`INSERT INTO services(slug, category, name, price_label, sort) VALUES(?,?,?,?,?)`).run(slug, b.category === 'media' ? 'media' : 'sound', name, str(b.price_label, 80), sort);
      return redirect(res, flashUrl('/admin/services', 'Послугу додано'));
    }
    const s = q('SELECT * FROM services WHERE id = ?').get(Number(req.params.id));
    if (!s) throw new HttpError(404, 'Послугу не знайдено');
    if (b.action === 'delete') {
      q('DELETE FROM services WHERE id = ?').run(s.id);
      return redirect(res, flashUrl('/admin/services', 'Послугу видалено'));
    }
    const mode = ['fixed', 'choose', 'day'].includes(b.duration_mode) ? b.duration_mode : 'fixed';
    q(`UPDATE services SET category = ?, name = ?, price_label = ?, description = ?, home_title = ?, home_price = ?,
        show_on_home = ?, show_on_services = ?, bookable = ?, booking_label = ?, duration_mode = ?, duration_hours = ?, max_hours = ?,
        sort = ?, home_sort = ?, booking_sort = ? WHERE id = ?`).run(
      b.category === 'media' ? 'media' : 'sound', str(b.name, 120) || s.name, str(b.price_label, 80), str(b.description, 1500),
      str(b.home_title, 120), str(b.home_price, 80), bool(b.show_on_home), bool(b.show_on_services), bool(b.bookable),
      str(b.booking_label, 120), mode, Math.min(Math.max(int(b.duration_hours, 1), 1), 14), Math.min(Math.max(int(b.max_hours, 8), 1), 14),
      int(b.sort, s.sort), int(b.home_sort, s.home_sort), int(b.booking_sort, s.booking_sort), s.id,
    );
    redirect(res, `${flashUrl('/admin/services', `«${s.name}» збережено`)}#s${s.id}`);
  }));

  /* ---------- Блоки сайту ---------- */
  r.get('/admin/blocks', guarded((req, res) => {
    sendHtml(req, res, A.blocksPage(req, { blocks: BLOCKS.map((b) => ({ def: b, visible: block(b.key).visible })) }));
  }));
  r.get('/admin/blocks/:key', guarded((req, res) => {
    const def = BLOCK_MAP[req.params.key];
    if (!def) throw new HttpError(404, 'Блок не знайдено');
    sendHtml(req, res, A.blockEditPage(req, { def, data: block(def.key) }));
  }));
  r.post('/admin/blocks/:key', guarded((req, res) => {
    const def = BLOCK_MAP[req.params.key];
    if (!def) throw new HttpError(404, 'Блок не знайдено');
    const back = `/admin/blocks/${encodeURIComponent(def.key)}`;
    if (req.body.action === 'reset') {
      resetBlock(def.key);
      return redirect(res, flashUrl(back, 'Повернуто текст за замовчуванням'));
    }
    saveBlock(def.key, unflatten(req.body), bool(req.body.visible));
    redirect(res, flashUrl(back, 'Збережено. Зміни вже на сайті.'));
  }));

  /* ---------- Налаштування ---------- */
  r.get('/admin/settings', guarded((req, res) => {
    sendHtml(req, res, A.settingsPage(req, { settings: getSettings(), gcal: gcal.status(), telegramOn: !!(config.telegram.token && config.telegram.chatId) }));
  }));
  r.post('/admin/settings', guarded((req, res) => {
    const b = req.body;
    const idOk = (v, re) => { const s = str(v, 40).toUpperCase(); return !s || re.test(s) ? s : null; };
    const gtm = idOk(b.gtm_id, /^GTM-[A-Z0-9]+$/);
    const ga4 = idOk(b.ga4_id, /^G-[A-Z0-9]+$/);
    const pixel = str(b.pixel_id, 30);
    if (gtm === null) return redirect(res, flashUrl('/admin/settings', 'ID Google Tag Manager має вигляд GTM-XXXXXXX', 'err'));
    if (ga4 === null) return redirect(res, flashUrl('/admin/settings', 'ID Google Analytics 4 має вигляд G-XXXXXXXXXX', 'err'));
    if (pixel && !/^\d{6,20}$/.test(pixel)) return redirect(res, flashUrl('/admin/settings', 'ID Meta Pixel складається лише з цифр', 'err'));
    const hours = {};
    for (let d = 0; d <= 6; d++) {
      const v = str(b[`hours_${d}`], 11);
      if (v && !/^\d{1,2}\s*[-–]\s*\d{1,2}$/.test(v)) return redirect(res, flashUrl('/admin/settings', 'Робочі години вказуються як 10-20, або порожньо для вихідного', 'err'));
      hours[d] = v.replace(/\s|–/g, (m) => (m === '–' ? '-' : ''));
    }
    saveSettings({
      company: str(b.company, 80) || 'Wave Records',
      domain: str(b.domain, 120).replace(/^https?:\/\//, '').replace(/\/$/, ''),
      gtm_id: gtm, ga4_id: ga4, pixel_id: pixel, hours,
      lead_hours: Math.min(Math.max(int(b.lead_hours, 3), 0), 168),
      horizon_days: Math.min(Math.max(int(b.horizon_days, 60), 1), 365),
    });
    redirect(res, flashUrl('/admin/settings', 'Налаштування збережено'));
  }));
  r.post('/admin/settings/password', guarded((req, res) => {
    try {
      if (req.body.next !== req.body.next2) throw new HttpError(400, 'Нові паролі не збігаються');
      changePassword(String(req.body.current || ''), String(req.body.next || ''));
      logout(req, res);
      redirect(res, '/admin/login?error=' + encodeURIComponent('Пароль змінено. Увійдіть з новим паролем.'));
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      redirect(res, flashUrl('/admin/settings', err.message, 'err'));
    }
  }));
  r.post('/admin/settings/gcal', guarded(async (req, res) => {
    if (!gcal.isConfigured()) return redirect(res, flashUrl('/admin/settings', 'Google Calendar ще не налаштовано (див. README)', 'err'));
    try {
      const name = await gcal.testConnection();
      await gcal.pullChanges();
      await gcal.flushOutbox();
      redirect(res, flashUrl('/admin/settings', `Синхронізовано з календарем «${name}»`));
    } catch (err) {
      redirect(res, flashUrl('/admin/settings', `Помилка Google Calendar: ${err.message}`, 'err'));
    }
  }));
}

function cleanPeaks(v) {
  return String(v || '').split(',').map((n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)))).slice(0, 200).join(',');
}

/** Поля форми виду «items.0.title» → { items: [{ title }] } */
function unflatten(body) {
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (!k.startsWith('f.')) continue;
    const parts = k.slice(2).split('.');
    let cur = out;
    parts.forEach((p, i) => {
      const last = i === parts.length - 1;
      const nextIsIndex = !last && /^\d+$/.test(parts[i + 1]);
      if (last) cur[p] = v;
      else cur = cur[p] ??= nextIsIndex ? [] : {};
    });
  }
  for (const v of Object.values(out)) if (Array.isArray(v)) for (let i = v.length - 1; i >= 0; i--) if (v[i] == null) v.splice(i, 1);
  return out;
}
