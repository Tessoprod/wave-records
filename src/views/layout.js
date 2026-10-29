import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { html, raw, esc } from '../html.js';
import { getSettings } from '../settings.js';
import { block } from '../content.js';

/* ---------- Версіонування статичних файлів ---------- */
const versions = new Map();
export function asset(rel) {
  let v = versions.get(rel);
  if (!v || !config.isProd) {
    try {
      v = crypto.createHash('md5').update(fs.readFileSync(path.join(config.root, 'public', rel))).digest('hex').slice(0, 10);
    } catch { v = '0'; }
    versions.set(rel, v);
  }
  return `/assets/${rel}?v=${v}`;
}

/* ---------- Іконки ---------- */
export const icon = {
  arrow: raw('<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  arrowUp: raw('<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  play: raw('<svg class="i i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor"/></svg>'),
  pause: raw('<svg class="i i-pause" viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.4" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.4" fill="currentColor"/></svg>'),
  close: raw('<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'),
  pin: raw('<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9.5" r="2.5" fill="currentColor"/></svg>'),
  phone: raw('<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'),
  telegram: raw('<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4 3 11l6 2 2 6 3-4 5 4 2-15Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m9 13 8-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'),
  mail: raw('<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'),
  clock: raw('<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'),
};

/** Логотип: п'ять заокруглених смуг рівня гучності, одна — червона. */
export const logoMark = raw(`<svg class="logo-mark" viewBox="0 0 30 24" aria-hidden="true">
  <rect x="0" y="9" width="4" height="6" rx="2"/><rect x="6.5" y="4" width="4" height="16" rx="2"/>
  <rect x="13" y="0" width="4" height="24" rx="2" class="logo-red"/><rect x="19.5" y="5" width="4" height="14" rx="2"/>
  <rect x="26" y="9.5" width="4" height="5" rx="2"/></svg>`);

export const NAV = [
  ['/', 'Головна'],
  ['/services', 'Послуги'],
  ['/portfolio', 'Портфоліо'],
  ['/about', 'Про студію'],
  ['/book', 'Запис'],
  ['/contacts', 'Контакти'],
];

export function telLink(phone) {
  return `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;
}

function analyticsHead(s) {
  const gtm = /^GTM-[A-Z0-9]+$/.test(s.gtm_id) ? s.gtm_id : '';
  const ga4 = /^G-[A-Z0-9]+$/.test(s.ga4_id) ? s.ga4_id : '';
  const pixel = /^\d{6,20}$/.test(s.pixel_id) ? s.pixel_id : '';
  return raw(`
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('consent', 'default', {ad_storage:'denied', ad_user_data:'denied', ad_personalization:'denied', analytics_storage:'denied', wait_for_update: 500});
    try { if (localStorage.getItem('wr_consent') === 'all') gtag('consent', 'update', {ad_storage:'granted', ad_user_data:'granted', ad_personalization:'granted', analytics_storage:'granted'}); } catch (e) {}
    window.WR_PIXEL_ID = ${JSON.stringify(pixel)};
    window.WR_GA4 = ${ga4 ? 'true' : 'false'};
  </script>
  ${gtm ? `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtm}');</script>` : ''}
  ${ga4 ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${ga4}"></script><script>gtag('js', new Date()); gtag('config', '${ga4}');</script>` : ''}`);
}

function analyticsBody(s) {
  const gtm = /^GTM-[A-Z0-9]+$/.test(s.gtm_id) ? s.gtm_id : '';
  return gtm ? raw(`<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${gtm}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`) : '';
}

export function layout({ title, description, path: current = '/', body, bodyClass = '', scripts = [], ogImage }) {
  const s = getSettings();
  const c = block('contacts');
  const base = config.publicUrl || '';
  const fullTitle = title ? `${title} — ${s.company}` : `${s.company} — студія звукозапису у Львові`;
  const desc = description || 'Запис, продакшн, зведення та мастеринг у Львові. Від ідеї до релізу.';
  const navLinks = NAV.map(([href, label]) => html`<li><a href="${href}" ${href === current ? raw('aria-current="page"') : ''}>${label}</a></li>`);

  return '<!doctype html>' + html`
<html lang="uk"${config.staticSite ? raw(' data-static') : ''}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${fullTitle}</title>
  <meta name="description" content="${desc}">
  <meta name="theme-color" content="#111111">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${fullTitle}">
  <meta property="og:description" content="${desc}">
  <meta property="og:locale" content="uk_UA">
  ${base ? html`<meta property="og:url" content="${base + current}"><link rel="canonical" href="${base + current}">` : ''}
  ${ogImage ? html`<meta property="og:image" content="${ogImage}">` : ''}
  <link rel="icon" href="${asset('img/favicon.svg')}" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter+Tight:wght@800;900&family=Inter:wght@400;500;600;700&display=swap">
  <link rel="stylesheet" href="${asset('css/site.css')}">
  ${analyticsHead(s)}
</head>
<body class="${bodyClass}">
  ${analyticsBody(s)}
  <a class="skip" href="#main">Перейти до вмісту</a>
  <div class="ambient" aria-hidden="true"><span class="orb orb-red"></span><span class="orb orb-blue"></span></div>

  <header class="site-header" data-header>
    <a class="logo" href="/" aria-label="${s.company} — на головну">${logoMark}<span>WAVE</span><span class="logo-sub">RECORDS</span></a>
    <div class="header-actions">
      <a class="btn btn-red btn-sm header-book" href="/book">Записатися</a>
      <button class="btn btn-glass btn-sm menu-toggle" type="button" aria-expanded="false" aria-controls="site-menu" data-menu-toggle>
        <span class="menu-label">Меню</span><span class="burger" aria-hidden="true"><i></i><i></i></span>
      </button>
    </div>
  </header>

  <div class="menu" id="site-menu" role="dialog" aria-modal="true" aria-label="Меню сайту" hidden data-menu>
    <nav class="menu-inner container">
      <ul class="menu-links">${navLinks}</ul>
      <div class="menu-meta">
        <p>${c.city}<br>${c.address}</p>
        <p><a href="${telLink(c.phone)}">${c.phone}</a><br>${c.telegram ? html`<a href="https://t.me/${c.telegram}" rel="noopener">Telegram @${c.telegram}</a>` : ''}</p>
        <p>${c.schedule_days}, ${c.schedule_hours}</p>
      </div>
    </nav>
  </div>

  <main id="main">${body}</main>

  <footer class="site-footer">
    <div class="container footer-grid">
      <div class="footer-brand">
        <a class="logo logo-lg" href="/">${logoMark}<span>WAVE</span><span class="logo-sub">RECORDS</span></a>
        <p>Студія звукозапису та музичного продакшну у Львові.</p>
      </div>
      <div>
        <h2 class="footer-h">Студія</h2>
        <p>${c.city}<br>${c.address}<br>${c.schedule_days}, ${c.schedule_hours}</p>
      </div>
      <div>
        <h2 class="footer-h">Зв'язок</h2>
        <p><a href="${telLink(c.phone)}">${c.phone}</a><br><a href="mailto:${c.email}">${c.email}</a>
        ${c.telegram ? html`<br><a href="https://t.me/${c.telegram}" rel="noopener">Telegram @${c.telegram}</a>` : ''}
        ${c.instagram ? html`<br><a href="https://instagram.com/${c.instagram}" rel="noopener">Instagram @${c.instagram}</a>` : ''}</p>
      </div>
      <div>
        <h2 class="footer-h">Сторінки</h2>
        <ul class="footer-links">${NAV.slice(1).map(([href, label]) => html`<li><a href="${href}">${label}</a></li>`)}</ul>
      </div>
    </div>
    <div class="container footer-bottom">
      <span>© ${new Date().getFullYear()} ${s.company}</span>
      <span class="footer-legal"><a href="/privacy-policy">Політика конфіденційності</a><a href="/agreement">Договір оферти</a><button type="button" class="link-btn" data-consent-open>Налаштування cookies</button></span>
    </div>
  </footer>

  <div class="mini-player glass" data-mini hidden>
    <button class="mini-btn" type="button" data-mini-toggle aria-label="Пауза">${icon.play}${icon.pause}</button>
    <div class="mini-meta"><span class="mini-title" data-mini-title></span><span class="mini-time" data-mini-time>00:00</span></div>
    <div class="mini-meter meter" data-live aria-hidden="true"></div>
    <button class="mini-close" type="button" data-mini-close aria-label="Зупинити і закрити плеєр">${icon.close}</button>
  </div>

  <div class="consent glass" data-consent hidden role="dialog" aria-label="Налаштування cookies">
    <p>Ми використовуємо cookies, щоб рахувати відвідування та показувати рекламу тим, кому вона цікава. <a href="/privacy-policy">Детальніше</a></p>
    <div class="consent-actions">
      <button type="button" class="btn btn-sm btn-glass" data-consent-choice="necessary">Лише необхідні</button>
      <button type="button" class="btn btn-sm btn-light" data-consent-choice="all">Прийняти всі</button>
    </div>
  </div>

  <script src="${asset('js/site.js')}" defer></script>
  ${scripts.map((src) => html`<script src="${asset(src)}" defer></script>`)}
</body>
</html>`;
}

export { esc };
