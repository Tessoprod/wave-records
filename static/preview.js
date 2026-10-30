// Локальний перегляд зібраного сайту (папка _site) на http://localhost:4000.
//
// Запуск: npm run preview  — спершу збирає сайт, потім запускає цей сервер.
// Або окремо: node static/preview.js  (якщо _site уже зібрано).
// Порт можна змінити: PORT=5000 node static/preview.js
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '_site');
const PORT = Number(process.env.PORT) || 4000;

const MIME = {
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

/** Шукає файл для адреси: сам файл, папка/index.html або адреса.html. */
function resolveFile(urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath); } catch { return null; }
  const file = path.resolve(ROOT, '.' + path.posix.normalize('/' + rel));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return null;
  for (const f of [file, path.join(file, 'index.html'), file + '.html']) {
    try { if (fs.statSync(f).isFile()) return f; } catch { /* далі */ }
  }
  return null;
}

function sendFile(req, res, file, status = 200) {
  const size = fs.statSync(file).size;
  const headers = {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  };
  const range = status === 200 && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    let start, end;
    if (range[1]) { start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1; }
    else { start = Math.max(0, size - Number(range[2])); end = size - 1; }
    if (start > end || start >= size) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(status, { ...headers, 'Content-Length': size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

if (!fs.existsSync(ROOT)) {
  console.error('Папку _site не знайдено. Спершу зберіть сайт: node --disable-warning=ExperimentalWarning static/build.js');
  process.exit(1);
}

http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  const urlPath = new URL(req.url, 'http://localhost').pathname;
  const file = resolveFile(urlPath);
  if (file) return sendFile(req, res, file);
  const notFound = path.join(ROOT, '404.html');
  if (fs.existsSync(notFound)) return sendFile(req, res, notFound, 404);
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Не знайдено');
}).listen(PORT, () => {
  console.log(`👀 Перегляд сайту: http://localhost:${PORT}  (зупинити — Ctrl+C)`);
});
