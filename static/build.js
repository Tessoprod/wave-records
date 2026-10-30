// Збірка статичної версії сайту для GitHub Pages.
//
// Бере тексти, ціни й контакти з папки content/, треки й фото з папки media/
// і генерує готові HTML-сторінки в папку _site/. Запускається автоматично
// на GitHub (див. .github/workflows/pages.yml) після кожної зміни в репозиторії.
//
// Локально: node --disable-warning=ExperimentalWarning static/build.js
//   BASE_PATH=/wave-records  — якщо сайт відкривається з підпапки (username.github.io/wave-records)
//   BASE_URL=https://...      — повна адреса сайту (для sitemap і посилань у соцмережах)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_site');
const CONTENT = path.join(ROOT, 'content');
const MEDIA = path.join(ROOT, 'media');
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');
const BASE_URL = (process.env.BASE_URL || '').replace(/\/+$/, '');

const AUDIO_EXT = new Set(['.mp3', '.wav']);
const PHOTO_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/* ---------- Зручні повідомлення про помилки в контенті ---------- */
const problems = [];
const warn = (msg) => { console.warn(`⚠️  ${msg}`); };
const fail = (msg) => { problems.push(msg); };

function readJson(name) {
  const file = path.join(CONTENT, name);
  if (!fs.existsSync(file)) { fail(`Не знайдено файл content/${name}`); return null; }
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  try {
    return JSON.parse(text);
  } catch (err) {
    const pos = Number((err.message.match(/position (\d+)/) || [])[1]);
    let where = '';
    if (Number.isFinite(pos)) {
      const before = text.slice(0, pos);
      const line = before.split('\n').length;
      const col = pos - before.lastIndexOf('\n');
      where = ` (рядок ${line}, символ ${col})`;
    }
    fail(`Помилка у файлі content/${name}${where}: ${err.message}\n   Найчастіше це пропущена або зайва кома, або лапки " всередині тексту (пишіть «ось так»).`);
    return null;
  }
}

function readText(name) {
  const file = path.join(CONTENT, name);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/^﻿/, '') : '';
}

/* ---------- Аналіз аудіо: тривалість і форма хвилі ---------- */
let hasFfmpeg = null;
function ffmpegAvailable() {
  if (hasFfmpeg === null) hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
  return hasFfmpeg;
}

function analyseAudio(file) {
  if (ffmpegAvailable()) {
    const RATE = 4000;
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'], { maxBuffer: 1024 * 1024 * 200 });
    if (r.status === 0 && r.stdout.length > 1000) {
      const samples = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 2));
      const N = 120;
      const size = Math.floor(samples.length / N);
      const vals = [];
      for (let i = 0; i < N; i++) {
        let sum = 0;
        for (let j = i * size; j < (i + 1) * size; j++) sum += samples[j] * samples[j];
        vals.push(Math.sqrt(sum / Math.max(1, size)));
      }
      const max = Math.max(...vals) || 1;
      return { duration: samples.length / RATE, peaks: vals.map((v) => Math.round((v / max) * 100)).join(',') };
    }
  }
  return { duration: 0, peaks: '' };
}

/* ---------- Треки й фото з папок ---------- */
const enc = (rel) => rel.split('/').map(encodeURIComponent).join('/');
const byName = (a, b) => a.localeCompare(b, 'uk', { numeric: true, sensitivity: 'base' });

/** «01 - MAKS - Нічне місто.mp3» → { artist: 'MAKS', title: 'Нічне місто' } */
function parseTrackName(fileName) {
  let name = path.parse(fileName).name.replace(/_/g, ' ').trim();
  name = name.replace(/^\d{1,3}\s*[-.)_]\s*/, '');
  const parts = name.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(' — ').trim() };
  return { artist: '', title: name };
}

let trackId = 0;
function tracksIn(section) {
  const dir = path.join(MEDIA, 'audio', section);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => AUDIO_EXT.has(path.extname(f).toLowerCase())).sort(byName).map((f) => {
    const abs = path.join(dir, f);
    const sizeMb = fs.statSync(abs).size / 1024 / 1024;
    if (sizeMb > 95) warn(`Файл media/audio/${section}/${f} важить ${sizeMb.toFixed(0)} МБ — GitHub не прийме файли понад 100 МБ. Краще MP3 320 kbps.`);
    const { artist, title } = parseTrackName(f);
    const { duration, peaks } = analyseAudio(abs);
    return { id: ++trackId, artist, title, file: enc(`${section}/${f}`), duration, peaks };
  });
}

function photosIn(rel, placement) {
  const dir = path.join(MEDIA, 'photos', rel);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => PHOTO_EXT.has(path.extname(f).toLowerCase())).sort(byName).map((f) => {
    const sizeMb = fs.statSync(path.join(dir, f)).size / 1024 / 1024;
    if (sizeMb > 3) warn(`Фото media/photos/${rel}/${f} важить ${sizeMb.toFixed(1)} МБ — сторінка вантажитиметься повільно. Зменште його до ~2000 px по довшій стороні.`);
    const alt = path.parse(f).name.replace(/^\d{1,3}\s*[-.)_]\s*/, '').replace(/[_-]+/g, ' ').trim();
    return { file: enc(`${rel}/${f}`), alt: /^(img|dsc|photo|image|p)\s*\d+$/i.test(alt) ? 'Студія Wave Records' : alt, placement, width: 0, height: 0 };
  });
}

/** Юридична сторінка з .md: перший рядок «# Назва», рядок «Останнє оновлення: …» — дата. */
function readLegal(name) {
  const lines = readText(name).replace(/\r/g, '').split('\n');
  let title = '';
  let updated = '';
  const body = [];
  for (const line of lines) {
    const t = line.trim();
    if (!title && /^#\s+/.test(t)) { title = t.replace(/^#\s+/, ''); continue; }
    const m = t.match(/^Останнє оновлення:\s*(.+)$/i);
    if (m && !updated) { updated = m[1]; continue; }
    body.push(line);
  }
  return { title, updated, body: body.join('\n').trim() };
}

/* ---------- Збірка ---------- */
async function main() {
  // Тимчасова база лише для рендерингу шаблонів
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-static-'));
  Object.assign(process.env, { DATA_DIR: tmp, WR_STATIC: '1', NODE_ENV: 'production', PUBLIC_URL: BASE_URL });

  const { saveBlock, BLOCK_MAP } = await import('../src/content.js');
  const { saveSettings } = await import('../src/settings.js');
  const views = await import('../src/views/public.js');

  const settings = readJson('settings.json') || {};
  const contacts = readJson('contacts.json') || {};
  const services = readJson('services.json') || {};
  const texts = readJson('texts.json') || {};
  if (problems.length) return;

  saveSettings({
    company: String(settings.company || 'Wave Records'),
    domain: String(settings.domain || '').replace(/^https?:\/\//, '').replace(/\/$/, ''),
    gtm_id: String(settings.google_tag_manager_id || '').trim().toUpperCase(),
    ga4_id: String(settings.google_analytics_id || '').trim().toUpperCase(),
    pixel_id: String(settings.meta_pixel_id || '').trim(),
  });
  if (settings.google_tag_manager_id && !/^GTM-[A-Z0-9]+$/i.test(settings.google_tag_manager_id)) warn('google_tag_manager_id має вигляд GTM-XXXXXXX — зараз його проігноровано.');
  if (settings.google_analytics_id && !/^G-[A-Z0-9]+$/i.test(settings.google_analytics_id)) warn('google_analytics_id має вигляд G-XXXXXXXXXX — зараз його проігноровано.');
  if (settings.meta_pixel_id && !/^\d{6,20}$/.test(settings.meta_pixel_id)) warn('meta_pixel_id складається лише з цифр — зараз його проігноровано.');

  const save = (key, data) => {
    const def = BLOCK_MAP[key];
    if (!def) { warn(`У texts.json є невідомий блок «${key}» — пропущено.`); return; }
    const { visible = true, ...rest } = data || {};
    saveBlock(key, { ...structuredClone(def.defaults), ...rest }, visible !== false);
  };
  save('contacts', contacts);
  for (const [key, data] of Object.entries(texts)) if (!key.startsWith('_')) save(key, data);
  const privacy = readLegal('privacy-policy.md');
  const agreement = readLegal('agreement.md');
  if (privacy.body) save('legal.privacy', privacy);
  if (agreement.body) save('legal.agreement', agreement);

  // Послуги
  const row = (s, i, bookable) => ({
    id: i + 1, slug: '', name: String(s.name || ''), price_label: String(s.price || ''), description: String(s.description || ''),
    home_title: String(s.name || ''), home_price: String(s.price || ''), bookable: bookable ? 1 : 0,
    category: bookable ? 'sound' : 'media',
  });
  const homeServices = (services.home || []).map((s, i) => row(s, i, s.button !== 'services'));
  const sound = (services.sound || []).map((s, i) => row(s, i, s.button !== 'telegram'));
  const media = (services.media || []).map((s, i) => ({ ...row(s, i, s.button === 'book'), category: 'media' }));

  // Треки
  const vocal = tracksIn('vocal');
  const music = tracksIn('music');
  const b2b = tracksIn('b2b');
  if (!ffmpegAvailable()) warn('ffmpeg не знайдено — форма хвилі треків буде рівною, а тривалість з\'явиться після натискання ▶.');
  const homeTracks = (vocal.length ? vocal : [...music, ...b2b]).slice(0, 4);

  // Фото
  const photos = [
    ...photosIn('about', 'about-hero').slice(0, 1),
    ...['record', 'produce', 'mix', 'master', 'release'].flatMap((n, i) => photosIn(n, `process-${i + 1}`).slice(0, 1)),
    ...photosIn('gallery', 'gallery'),
  ];

  const booking = views.parseBookingUrl(readText('booking-link.txt'));
  if (!booking.url) warn('content/booking-link.txt порожній — на сторінці запису поки показуються кнопки Telegram і телефону.');

  // Рендер сторінок
  const pages = {
    'index.html': views.homePage({ homeServices, tracks: homeTracks }),
    'services/index.html': views.servicesPage({ sound, media }),
    'portfolio/index.html': views.portfolioPage({ vocal, music, b2b }),
    'about/index.html': views.aboutPage({ photos }),
    'book/index.html': views.staticBookPage({ booking }),
    'contacts/index.html': views.contactsPage(),
    'privacy-policy/index.html': views.legalPage('legal.privacy', '/privacy-policy'),
    'agreement/index.html': views.legalPage('legal.agreement', '/agreement'),
    '404.html': views.notFoundPage(),
  };

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  // Посилання виду href="/services" → href="/wave-records/services", якщо сайт живе в підпапці
  const withBase = (htmlText) => (BASE_PATH
    ? htmlText.replace(/((?:href|src|data-src|data-full|action)=")\/(?!\/)/g, `$1${BASE_PATH}/`)
    : htmlText);
  for (const [rel, htmlText] of Object.entries(pages)) {
    const file = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, withBase(String(htmlText)));
  }

  // Статичні файли сайту (без адмінки)
  const skip = new Set(['admin.css', 'admin.js', 'book.js']);
  fs.cpSync(path.join(ROOT, 'public'), path.join(OUT, 'assets'), { recursive: true, filter: (src) => !skip.has(path.basename(src)) });
  // Треки й фото
  if (fs.existsSync(MEDIA)) {
    fs.cpSync(MEDIA, path.join(OUT, 'media'), {
      recursive: true,
      filter: (src) => {
        if (fs.statSync(src).isDirectory()) return true;
        const ext = path.extname(src).toLowerCase();
        return AUDIO_EXT.has(ext) || PHOTO_EXT.has(ext);
      },
    });
  }
  fs.copyFileSync(path.join(ROOT, 'public/img/favicon.ico'), path.join(OUT, 'favicon.ico'));
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

  const urls = ['/', '/services/', '/portfolio/', '/about/', '/book/', '/contacts/', '/privacy-policy/', '/agreement/'];
  if (BASE_URL) {
    fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${BASE_URL}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
  }
  fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n${BASE_URL ? `Sitemap: ${BASE_URL}/sitemap.xml\n` : ''}`);

  // На Windows файл бази лишається заблокованим, доки вона відкрита — спершу закриваємо її
  (await import('../src/db.js')).db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n✅ Сайт зібрано: ${Object.keys(pages).length} сторінок, треків: ${vocal.length + music.length + b2b.length}, фото: ${photos.length}.`);
  console.log(`   Запис: ${booking.url ? (booking.embed ? 'календар Google вбудовано на сторінку' : 'кнопка-посилання на сторінку запису Google') : 'ще не підключено'}.`);
}

await main();
if (problems.length) {
  console.error('\n❌ Сайт не зібрано. Виправте, будь ласка:\n');
  for (const p of problems) console.error(` • ${p}\n`);
  process.exit(1);
}
