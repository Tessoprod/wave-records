// Невеликий HTTP-фреймворк на вбудованому node:http: маршрути, тіло запиту, cookies, статика з Range.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config } from './config.js';

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = /^(text\/|application\/(json|xml|manifest)|image\/svg)/;

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

export class Router {
  constructor() { this.routes = []; }
  add(method, pattern, handlers) {
    const keys = [];
    const src = pattern.replace(/[.]/g, '\\.').replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
    this.routes.push({ method, re: new RegExp(`^${src}/?$`), keys, handlers });
  }
  get(p, ...h) { this.add('GET', p, h); }
  post(p, ...h) { this.add('POST', p, h); }
  put(p, ...h) { this.add('PUT', p, h); }
  delete(p, ...h) { this.add('DELETE', p, h); }
  match(method, pathname) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
    return pathMatched ? { methodNotAllowed: true } : null;
  }
}

export function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { out[k] = part.slice(i + 1).trim(); }
  }
  return out;
}

export function enhance(req) {
  const url = new URL(req.url, 'http://localhost');
  req.path = url.pathname.replace(/\/{2,}/g, '/');
  req.query = Object.fromEntries(url.searchParams);
  req.cookies = parseCookies(req.headers.cookie);
  const fwd = config.trustProxy ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  req.ip = fwd || req.socket.remoteAddress || '';
  req.secure = config.trustProxy ? req.headers['x-forwarded-proto'] === 'https' : !!req.socket.encrypted;
  return req;
}

export function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Запит завеликий')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Розбирає urlencoded або JSON тіло. Повторювані ключі form-urlencoded стають масивами. */
export async function parseBody(req, limit) {
  if (req.body !== undefined) return req.body;
  const buf = await readBody(req, limit);
  const type = String(req.headers['content-type'] || '');
  let body = {};
  if (type.includes('application/json')) {
    try { body = JSON.parse(buf.toString('utf8') || '{}'); } catch { throw new HttpError(400, 'Некоректний JSON'); }
  } else {
    const sp = new URLSearchParams(buf.toString('utf8'));
    for (const k of new Set(sp.keys())) {
      const all = sp.getAll(k);
      body[k] = k.endsWith('[]') ? all : all[all.length - 1];
    }
  }
  req.body = body;
  return body;
}

function acceptsGzip(req) {
  return /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
}

export function send(req, res, status, body, type = 'text/plain; charset=utf-8', headers = {}) {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ''));
  const h = { 'Content-Type': type, ...headers };
  if (buf.length > 1024 && COMPRESSIBLE.test(type) && acceptsGzip(req)) {
    buf = zlib.gzipSync(buf, { level: 6 });
    h['Content-Encoding'] = 'gzip';
    h.Vary = 'Accept-Encoding';
  }
  h['Content-Length'] = buf.length;
  res.writeHead(status, h);
  res.end(req.method === 'HEAD' ? undefined : buf);
}

export const sendHtml = (req, res, body, status = 200, headers = {}) =>
  send(req, res, status, String(body), MIME['.html'], { 'Cache-Control': 'no-cache', ...headers });

export const sendJson = (req, res, obj, status = 200, headers = {}) =>
  send(req, res, status, JSON.stringify(obj), MIME['.json'], { 'Cache-Control': 'no-store', ...headers });

export function redirect(res, location, status = 303) {
  res.writeHead(status, { Location: location, 'Content-Length': 0 });
  res.end();
}

export function setCookie(res, name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path || '/'}`];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  parts.push(`SameSite=${opts.sameSite || 'Lax'}`);
  if (opts.secure) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(Array.isArray(prev) ? prev : prev ? [prev] : []), parts.join('; ')]);
}

const gzCache = new Map();

/** Віддає файл з підтримкою ETag, Range (перемотування аудіо) і gzip для текстових типів. */
export function serveFile(req, res, filePath, { cache = 'no-cache', download } = {}) {
  let st;
  try { st = fs.statSync(filePath); } catch { return false; }
  if (!st.isFile()) return false;

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': type,
    'Cache-Control': cache,
    ETag: etag,
    'Last-Modified': st.mtime.toUTCString(),
    'Accept-Ranges': 'bytes',
  };
  if (download) headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(download)}`;

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return true;
  }

  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    let start; let end;
    if (m && (m[1] || m[2])) {
      if (m[1] === '') { start = Math.max(0, st.size - Number(m[2])); end = st.size - 1; }
      else { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1; }
    }
    if (start === undefined || start > end || start >= st.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
      res.end();
      return true;
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') { res.end(); return true; }
    fs.createReadStream(filePath, { start, end }).on('error', () => res.destroy()).pipe(res);
    return true;
  }

  if (COMPRESSIBLE.test(type) && acceptsGzip(req) && st.size > 1024 && st.size < 5 * 1024 * 1024) {
    const key = `${filePath}:${etag}`;
    let gz = gzCache.get(key);
    if (!gz) { gz = zlib.gzipSync(fs.readFileSync(filePath), { level: 9 }); gzCache.set(key, gz); }
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', 'Content-Length': gz.length });
    res.end(req.method === 'HEAD' ? undefined : gz);
    return true;
  }

  res.writeHead(200, { ...headers, 'Content-Length': st.size });
  if (req.method === 'HEAD') { res.end(); return true; }
  fs.createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
  return true;
}

/** Безпечне з'єднання шляху (захист від ../). */
export function safeJoin(base, rel) {
  const p = path.resolve(base, '.' + path.sep + rel);
  return p.startsWith(path.resolve(base) + path.sep) ? p : null;
}

/** Простий ліміт запитів у пам'яті. */
export function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return (key) => {
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < now) { h = { count: 0, reset: now + windowMs }; hits.set(key, h); }
    h.count++;
    return h.count <= max;
  };
}
