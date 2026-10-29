// Вхід в адмінку: пароль (scrypt), сесії в БД, CSRF-токени.
import crypto from 'node:crypto';
import { config } from './config.js';
import { q, kvGet, kvSet } from './db.js';
import { setCookie, HttpError, redirect, rateLimiter } from './http.js';

const COOKIE = 'wr_admin';
const SESSION_TTL = 14 * 24 * 3600_000;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [, saltHex, hashHex] = String(stored || '').split('$');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(actual, expected);
}

/** При першому запуску створює пароль адміністратора. */
export function initAdmin() {
  if (kvGet('admin.hash')) return;
  let password = config.admin.password;
  if (!password) {
    password = crypto.randomBytes(9).toString('base64url');
    console.log('\n================================================================');
    console.log(' Створено адміністратора.');
    console.log(`   Логін:  ${config.admin.user}`);
    console.log(`   Пароль: ${password}`);
    console.log(' Змініть пароль в адмінці → Налаштування після першого входу.');
    console.log('================================================================\n');
  }
  kvSet('admin.hash', hashPassword(password));
}

export function changePassword(current, next) {
  if (!verifyPassword(current, kvGet('admin.hash'))) throw new HttpError(400, 'Поточний пароль невірний');
  if (String(next).length < 10) throw new HttpError(400, 'Новий пароль має містити щонайменше 10 символів');
  kvSet('admin.hash', hashPassword(next));
  q('DELETE FROM sessions').run();
}

const loginLimiter = rateLimiter({ windowMs: 15 * 60_000, max: 8 });

export function login(req, res, user, password) {
  if (!loginLimiter(req.ip)) throw new HttpError(429, 'Забагато спроб. Спробуйте за 15 хвилин.');
  const okUser = crypto.timingSafeEqual(Buffer.from(sha256(String(user || ''))), Buffer.from(sha256(config.admin.user)));
  const okPass = verifyPassword(String(password || ''), kvGet('admin.hash'));
  if (!okUser || !okPass) throw new HttpError(401, 'Невірний логін або пароль');
  const token = crypto.randomBytes(32).toString('base64url');
  const csrf = crypto.randomBytes(24).toString('base64url');
  q('INSERT INTO sessions(token_hash, csrf, expires_at) VALUES(?,?,?)').run(sha256(token), csrf, Date.now() + SESSION_TTL);
  q('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  setCookie(res, COOKIE, token, { maxAge: SESSION_TTL / 1000, sameSite: 'Lax', secure: req.secure, path: '/' });
}

export function logout(req, res) {
  const token = req.cookies[COOKIE];
  if (token) q('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  setCookie(res, COOKIE, '', { maxAge: 0, secure: req.secure });
}

export function currentSession(req) {
  const token = req.cookies[COOKIE];
  if (!token) return null;
  const s = q('SELECT * FROM sessions WHERE token_hash = ?').get(sha256(token));
  if (!s || s.expires_at < Date.now()) return null;
  return s;
}

/** Обробник маршруту: вимагає вхід і перевіряє CSRF для запитів, що змінюють дані. */
export function requireAdmin(req, res) {
  const s = currentSession(req);
  if (!s) {
    if (req.method === 'GET' && !req.path.startsWith('/admin/api/')) return redirect(res, `/admin/login?next=${encodeURIComponent(req.path)}`);
    throw new HttpError(401, 'Потрібно увійти');
  }
  req.session = s;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.origin;
    let originHost = null;
    try { originHost = origin ? new URL(origin).host : null; } catch { originHost = 'invalid'; }
    if (origin && originHost !== req.headers.host) throw new HttpError(403, 'Запит з іншого сайту відхилено');
  }
}

export function checkCsrf(req, bodyToken) {
  const t = req.headers['x-csrf-token'] || bodyToken;
  if (!t || !req.session || t.length !== req.session.csrf.length
    || !crypto.timingSafeEqual(Buffer.from(t), Buffer.from(req.session.csrf))) {
    throw new HttpError(403, 'Сесія застаріла. Оновіть сторінку і спробуйте ще раз.');
  }
}
