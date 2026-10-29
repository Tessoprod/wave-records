import http from 'node:http';
import { config } from './config.js';
import './db.js';
import { Router, enhance, HttpError, sendHtml, sendJson } from './http.js';
import { registerSite } from './routes/site.js';
import { registerAdmin } from './routes/admin.js';
import { notFoundPage, errorPage } from './views/public.js';

const router = new Router();
registerSite(router);
registerAdmin(router);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
const ADMIN_CSP = "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

export function createServer() {
  return http.createServer(async (req, res) => {
    enhance(req);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const isApi = req.path.startsWith('/api/') || req.path.startsWith('/admin/api/');
    if (req.path.startsWith('/admin')) res.setHeader('Content-Security-Policy', ADMIN_CSP);

    try {
      const m = router.match(req.method, req.path);
      if (!m) throw new HttpError(404, 'Не знайдено');
      if (m.methodNotAllowed) throw new HttpError(405, 'Метод не підтримується');
      req.params = m.params;
      for (const handler of m.route.handlers) {
        await handler(req, res);
        if (res.writableEnded || res.headersSent) break;
      }
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) console.error(`[${req.method} ${req.path}]`, err);
      if (res.headersSent) { res.destroy(); return; }
      if (isApi || String(req.headers.accept || '').includes('application/json')) {
        sendJson(req, res, { ok: false, error: status >= 500 ? 'Внутрішня помилка сервера' : err.message, code: err.code, field: err.field, errors: err.errors }, status);
      } else if (status === 404) {
        sendHtml(req, res, notFoundPage(), 404);
      } else if (status < 500 && req.path.startsWith('/admin')) {
        sendHtml(req, res, `<!doctype html><meta charset="utf-8"><title>Помилка</title><body style="font:16px system-ui;background:#111;color:#f5f5f5;padding:40px"><h1>${status}</h1><p>${String(err.message).replace(/</g, '&lt;')}</p><p><a style="color:#7aa0ff" href="javascript:history.back()">Назад</a></p>`, status);
      } else {
        sendHtml(req, res, errorPage(), status);
      }
    }
  });
}
