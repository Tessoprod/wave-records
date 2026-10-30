import { html, raw, nl2br, miniMarkdown } from '../html.js';
import { layout, icon, telLink } from './layout.js';
import { block } from '../content.js';
import { getSettings } from '../settings.js';
import { config } from '../config.js';

/* ---------- Спільні компоненти ---------- */

export const fmtDur = (sec) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const btn = (href, label, variant = 'glass', ic = icon.arrow, attrs = '') =>
  html`<a class="btn btn-${variant}" href="${href}" ${raw(attrs)}><span>${label}</span>${ic}</a>`;

const chapter = (label) => html`<p class="chapter">${label}</p>`;

function trackTitle(t) {
  return t.artist ? `${t.artist} — ${t.title}` : t.title;
}

export function trackList(tracks, emptyText) {
  if (!tracks.length) {
    return html`<div class="empty-state"><p>${emptyText || 'Треки з\'являться тут найближчим часом.'}</p></div>`;
  }
  return html`<ul class="tracks" role="list">${tracks.map((t) => html`
    <li class="track" data-track data-id="${t.id}" data-src="/media/audio/${t.file}" data-title="${trackTitle(t)}" data-duration="${t.duration}" data-peaks="${t.peaks}">
      <button class="track-play" type="button" aria-label="Відтворити: ${trackTitle(t)}">${icon.play}${icon.pause}</button>
      <div class="track-body">
        <p class="track-title">${t.artist ? html`<span class="track-artist">${t.artist}</span> <span class="track-dash" aria-hidden="true">—</span> ` : ''}<span>${t.title}</span></p>
        <div class="track-wave" role="slider" tabindex="0" aria-label="Позиція відтворення: ${trackTitle(t)}" aria-valuemin="0" aria-valuemax="${Math.round(t.duration)}" aria-valuenow="0" aria-valuetext="00:00"></div>
      </div>
      <p class="track-time"><span data-cur>00:00</span><span class="track-time-sep" aria-hidden="true">/</span><span data-dur>${fmtDur(t.duration)}</span></p>
    </li>`)}</ul>`;
}

function photoImg(p, { sizes = '100vw', cls = '', eager = false } = {}) {
  return html`<img class="${cls}" src="/media/photos/${p.file}" alt="${p.alt}" ${p.width ? raw(`width="${p.width}" height="${p.height}"`) : ''} sizes="${sizes}" loading="${eager ? 'eager' : 'lazy'}" decoding="async">`;
}

/** Графічний фрагмент на місці фото, поки студія не завантажила свої кадри. */
const fragment = (n, label = '') => html`<div class="fragment fragment-${n % 4}" role="img" aria-label="${label || 'Графічний фрагмент Wave Records'}"><span></span><span></span><span></span></div>`;

const bookHref = (s) => (s.slug ? `/book?service=${s.slug}` : '/book');

function telegramUrl() {
  const c = block('contacts');
  return c.telegram ? `https://t.me/${c.telegram}` : '/contacts';
}

/* ---------- /home ---------- */

export function homePage({ homeServices, tracks }) {
  const hero = block('home.hero');
  const svc = block('home.services');
  const works = block('home.works');
  const why = block('home.why');
  const steps = block('home.steps');

  const body = html`
  ${hero.visible ? html`
  <section class="hero">
    <div class="container hero-inner">
      <h1 class="hero-title">
        <span class="hero-l1">${hero.line1}</span>
        <span class="hero-l2">${hero.line2}</span>
      </h1>
      <div class="hero-bottom">
        <p class="hero-sub">${hero.subtitle}</p>
        <div class="hero-ctas">
          ${btn('/book', hero.cta_book, 'red', icon.arrow, 'data-cta="hero_book"')}
          ${btn('/portfolio', hero.cta_listen, 'glass', icon.play, 'data-cta="hero_listen"')}
        </div>
      </div>
    </div>
    <div class="hero-meter meter" data-live data-hero aria-hidden="true"></div>
  </section>` : ''}

  ${svc.visible && homeServices.length ? html`
  <section class="section">
    <div class="container">
      <header class="sec-head">
        <h2 class="h2">${svc.title}</h2>
        ${btn('/services', svc.cta, 'glass')}
      </header>
      <ul class="svc-grid" role="list">
        ${homeServices.map((s) => html`
        <li>
          <a class="svc-card" href="${s.bookable ? bookHref(s) : '/services'}">
            <h3 class="svc-name">${s.home_title || s.name}</h3>
            <p class="svc-price">${s.home_price || s.price_label}</p>
            <span class="svc-go">${s.bookable ? 'Записатися' : 'Детальніше'}${icon.arrow}</span>
          </a>
        </li>`)}
      </ul>
    </div>
  </section>` : ''}

  ${works.visible ? html`
  <section class="section section-works" id="works">
    <div class="container">
      <header class="sec-head">
        <div>
          <h2 class="h2">${works.title}</h2>
          ${works.text ? html`<p class="sec-lead">${works.text}</p>` : ''}
        </div>
        ${btn('/portfolio', works.cta, 'glass')}
      </header>
      ${trackList(tracks)}
    </div>
  </section>` : ''}

  ${why.visible ? html`
  <section class="section">
    <div class="container">
      <header class="sec-head"><h2 class="h2">${why.title}</h2></header>
      <ol class="why-grid" role="list">
        ${why.items.map((it, i) => html`
        <li class="why-item">
          <span class="num">${String(i + 1).padStart(2, '0')}</span>
          <h3 class="h3">${it.title}</h3>
          <p>${it.text}</p>
        </li>`)}
      </ol>
    </div>
  </section>` : ''}

  ${steps.visible ? html`
  <section class="section section-steps">
    <div class="container">
      <header class="sec-head"><h2 class="h2">${steps.title}</h2></header>
      <ol class="steps" role="list">
        ${steps.items.map((it, i) => html`
        <li class="step"><span class="step-dot" aria-hidden="true"></span><span class="num">${String(i + 1).padStart(2, '0')}</span><p class="step-title">${it.title}</p></li>`)}
      </ol>
      <div class="steps-cta">${btn('/book', hero.cta_book || 'Записатися', 'red', icon.arrow, 'data-cta="steps_book"')}</div>
    </div>
  </section>` : ''}`;

  return layout({ path: '/', body });
}

/* ---------- /services ---------- */

export function servicesPage({ sound, media }) {
  const c = block('services');
  const tg = telegramUrl();
  const card = (s) => {
    const cta = s.bookable
      ? html`<a class="btn btn-red btn-sm" href="${bookHref(s)}">Записатися${icon.arrow}</a>`
      : html`<a class="btn btn-glass btn-sm" href="${tg}" rel="noopener">${s.category === 'media' ? c.media_cta : 'Обговорити'}${icon.arrowUp}</a>`;
    return html`
    <li class="svc-full glass-card">
      <div class="svc-full-top">
        <h3 class="svc-name">${s.name}</h3>
        <p class="svc-price">${s.price_label}</p>
      </div>
      ${s.description ? html`<p class="svc-desc">${s.description}</p>` : ''}
      <div class="svc-full-cta">${cta}</div>
    </li>`;
  };
  const body = html`
  <section class="page-head container">
    <h1 class="h1">${c.title}</h1>
    ${c.text ? html`<p class="page-lead">${c.text}</p>` : ''}
  </section>
  <section class="section section-tight">
    <div class="container">
      <h2 class="h2 h-latin">${c.sound_title}</h2>
      <ul class="svc-full-grid" role="list">${sound.map(card)}</ul>
    </div>
  </section>
  ${media.length ? html`
  <section class="section">
    <div class="container">
      <h2 class="h2 h-latin">${c.media_title}</h2>
      <ul class="svc-full-grid" role="list">${media.map(card)}</ul>
    </div>
  </section>` : ''}`;
  return layout({ title: c.title, path: '/services', description: 'Ціни на запис, зведення, мастеринг, біти, пісні під ключ та послуги для релізу у Wave Records.', body });
}

/* ---------- /portfolio ---------- */

export function portfolioPage({ vocal, music, b2b }) {
  const c = block('portfolio');
  const part = (id, title, sub, tracks) => html`
  <section class="section section-tight" id="${id}">
    <div class="container">
      <header class="sec-head sec-head-stack">
        <h2 class="h2 h-latin">${title}</h2>
        ${sub ? html`<p class="sec-sub">${sub}</p>` : ''}
      </header>
      ${trackList(tracks)}
    </div>
  </section>`;
  const body = html`
  <section class="page-head container">
    <h1 class="h1">${c.title}</h1>
    ${c.text ? html`<p class="page-lead">${c.text}</p>` : ''}
    <nav class="chips" aria-label="Розділи портфоліо">
      <a class="chip" href="#vocal">${c.vocal_title}</a><a class="chip" href="#music">${c.music_title}</a><a class="chip" href="#b2b">${c.b2b_title}</a>
    </nav>
  </section>
  ${part('vocal', c.vocal_title, c.vocal_sub, vocal)}
  ${part('music', c.music_title, c.music_sub, music)}
  ${part('b2b', c.b2b_title, c.b2b_sub, b2b)}
  <section class="section">
    <div class="container cta-band">
      <h2 class="h2">Хочете так само?</h2>
      ${btn('/book', 'Записатися', 'red', icon.arrow, 'data-cta="portfolio_book"')}
    </div>
  </section>`;
  return layout({ title: c.title, path: '/portfolio', description: 'Послухайте роботи Wave Records: зведення вокалу, біти та аранжування, музика для бізнесу.', body });
}

/* ---------- /about ---------- */

export function aboutPage({ photos }) {
  const intro = block('about.intro');
  const phil = block('about.philosophy');
  const proc = block('about.process');
  const atm = block('about.atmosphere');
  const cta = block('about.cta');
  const heroPhoto = photos.find((p) => p.placement === 'about-hero');
  const gallery = photos.filter((p) => p.placement === 'gallery');
  const processPhoto = (i) => photos.find((p) => p.placement === `process-${i + 1}`);

  const body = html`
  ${intro.visible ? html`
  <section class="about-intro container">
    ${chapter('01 / Intro')}
    <h1 class="h1 about-title">${intro.title}</h1>
    <p class="page-lead">${intro.text}</p>
    <figure class="about-hero-photo">
      ${heroPhoto ? photoImg(heroPhoto, { sizes: '(min-width: 1320px) 1280px, 100vw', eager: true }) : fragment(0, 'Місце для фото студії')}
    </figure>
  </section>` : ''}

  ${atm.visible ? html`
  <section class="section">
    <div class="container">
      ${chapter('02 / Atmosphere')}
      <header class="sec-head sec-head-stack"><h2 class="h2">${atm.title}</h2>${atm.text ? html`<p class="sec-lead">${atm.text}</p>` : ''}</header>
      <ul class="gallery" role="list" data-gallery>
        ${gallery.length
          ? gallery.map((p, i) => html`<li class="g-item g-${i % 6}"><button type="button" class="g-open" data-full="/media/photos/${p.file}" data-alt="${p.alt}" aria-label="Відкрити фото${p.alt ? `: ${p.alt}` : ''}">${photoImg(p, { sizes: '(min-width: 900px) 33vw, 100vw' })}</button></li>`)
          : [0, 1, 2, 3].map((i) => html`<li class="g-item g-${i}">${fragment(i, 'Місце для фото студії')}</li>`)}
      </ul>
    </div>
    <dialog class="lightbox" data-lightbox aria-label="Фото студії">
      <button type="button" class="lightbox-close btn btn-glass btn-icon" data-lightbox-close aria-label="Закрити">${icon.close}</button>
      <img alt="" data-lightbox-img>
    </dialog>
  </section>` : ''}

  ${phil.visible ? html`
  <section class="section">
    <div class="container">
      ${chapter('03 / Philosophy')}
      <div class="phil-head">
        <h2 class="h2">${phil.title}</h2>
        <p class="sec-lead">${phil.lead}</p>
      </div>
      <ol class="phil-grid" role="list">
        ${phil.items.map((it, i) => html`
        <li class="phil-item glass-card">
          <span class="num">${String(i + 1).padStart(2, '0')}</span>
          <h3 class="h3">${it.title}</h3>
          <p>${it.text}</p>
        </li>`)}
      </ol>
    </div>
  </section>` : ''}

  ${proc.visible ? html`
  <section class="section">
    <div class="container">
      ${chapter('04 / Process')}
      <header class="sec-head sec-head-stack"><h2 class="h2">${proc.title}</h2><p class="sec-lead">${proc.lead}</p></header>
      <ol class="timeline" role="list">
        ${proc.items.map((it, i) => {
          const p = processPhoto(i);
          return html`
          <li class="tl-item">
            <div class="tl-text">
              <span class="tl-num">${String(i + 1).padStart(2, '0')}</span>
              <h3 class="tl-title">${it.title}</h3>
              <p>${it.text}</p>
            </div>
            <figure class="tl-media">${p ? photoImg(p, { sizes: '(min-width: 900px) 40vw, 100vw' }) : fragment(i + 1)}</figure>
          </li>`;
        })}
      </ol>
    </div>
  </section>` : ''}

  ${cta.visible ? html`
  <section class="section">
    <div class="container final-cta">
      ${chapter(cta.label)}
      <h2 class="h1">${cta.title}</h2>
      <p class="page-lead">${cta.text}</p>
      <div class="hero-ctas">
        ${btn('/book', cta.cta_book, 'red', icon.arrowUp, 'data-cta="about_book"')}
        ${btn('/services', cta.cta_services, 'glass', icon.arrowUp)}
      </div>
    </div>
  </section>` : ''}`;
  return layout({ title: 'Про студію', path: '/about', description: intro.text, body });
}

/* ---------- /book ---------- */

export function bookPage({ services, preselect }) {
  const info = block('book.info');
  const c = block('contacts');
  const s = getSettings();
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${info.address}, ${c.city}`)}`;
  const data = {
    services: services.map((x) => ({ id: x.id, slug: x.slug, label: x.booking_label || x.name, price: x.price_label, mode: x.duration_mode, hours: x.duration_hours, max: x.max_hours })),
    preselect: preselect || '',
    address: info.address,
    successTitle: info.success_title,
    successText: info.success_text,
    leadHours: s.lead_hours,
    horizonDays: s.horizon_days,
  };
  const body = html`
  <section class="page-head container">
    <h1 class="h1">${info.title}</h1>
  </section>
  <section class="container book-wrap">
    <div class="book-info">
      <div class="info-card glass-card">
        <span class="info-icon">${icon.pin}</span>
        <div>
          <p class="info-title">${info.address}</p>
          <p class="muted">${info.address_note}</p>
          <a class="text-link" href="${mapUrl}" rel="noopener" target="_blank">Відкрити на мапі${icon.arrowUp}</a>
        </div>
      </div>
      <div class="info-card glass-card">
        <span class="info-icon">₴</span>
        <p>${info.price_note}</p>
      </div>
    </div>

    <form class="book-form glass-panel" id="book-form" novalidate>
      <noscript><p class="form-error">Для бронювання увімкніть JavaScript або зателефонуйте: <a href="${telLink(c.phone)}">${c.phone}</a>.</p></noscript>

      <fieldset class="bf-step">
        <legend><span class="bf-num">1</span>Послуга</legend>
        <div class="bf-row">
          <label class="field field-grow">
            <span class="field-label">Що плануєте?</span>
            <select name="service" id="bf-service" required>
              <option value="">Оберіть послугу</option>
              ${services.map((x) => html`<option value="${x.slug}">${x.booking_label || x.name}</option>`)}
            </select>
          </label>
          <label class="field" id="bf-hours-wrap" hidden>
            <span class="field-label">Тривалість</span>
            <select name="hours" id="bf-hours"></select>
          </label>
        </div>
        <p class="bf-hint" id="bf-duration-note" aria-live="polite"></p>
      </fieldset>

      <div class="bf-split">
      <fieldset class="bf-step">
        <legend><span class="bf-num">2</span>Дата</legend>
        <div class="cal" id="bf-cal" aria-live="polite">
          <p class="bf-hint">Спочатку оберіть послугу.</p>
        </div>
      </fieldset>

      <fieldset class="bf-step">
        <legend><span class="bf-num">3</span>Час</legend>
        <div class="times" id="bf-times" role="radiogroup" aria-label="Час початку">
          <p class="bf-hint">Оберіть дату, щоб побачити вільний час.</p>
        </div>
      </fieldset>
      </div>

      <fieldset class="bf-step">
        <legend><span class="bf-num">4</span>Контакти</legend>
        <div class="bf-grid">
          <label class="field"><span class="field-label">Ім'я</span><input name="name" autocomplete="name" required maxlength="80"></label>
          <label class="field"><span class="field-label">Телефон</span><input name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="+380" required maxlength="32"></label>
          <label class="field"><span class="field-label">Telegram <em>необов'язково</em></span><input name="telegram" autocomplete="off" placeholder="@nickname" maxlength="64"></label>
          <label class="field"><span class="field-label">Email <em>необов'язково</em></span><input name="email" type="email" autocomplete="email" maxlength="120"></label>
          <label class="field field-wide"><span class="field-label">Коментар <em>необов'язково</em></span><textarea name="comment" rows="3" maxlength="1500" placeholder="Розкажіть коротко про трек чи ідею"></textarea></label>
        </div>
        <label class="hp" aria-hidden="true">Сайт<input name="website" tabindex="-1" autocomplete="off"></label>
        <label class="check">
          <input type="checkbox" name="consent" required>
          <span>Погоджуюсь з <a href="/privacy-policy" target="_blank">політикою конфіденційності</a> та <a href="/agreement" target="_blank">договором оферти</a></span>
        </label>
      </fieldset>

      <div class="bf-submit">
        <p class="bf-summary" id="bf-summary" aria-live="polite"></p>
        <p class="form-error" id="bf-error" role="alert" hidden></p>
        <button class="btn btn-red btn-lg" type="submit" id="bf-submit">Підтвердити запис${icon.arrow}</button>
      </div>
    </form>
  </section>

  <dialog class="success glass-panel" id="bf-success" aria-labelledby="bf-success-title">
    <div class="success-mark" aria-hidden="true"><span></span></div>
    <h2 class="h2" id="bf-success-title" tabindex="-1"></h2>
    <dl class="success-list" id="bf-success-list"></dl>
    <p class="muted" id="bf-success-text"></p>
    <div class="success-actions">
      <a class="btn btn-glass" id="bf-ics" href="#">Додати в календар</a>
      <a class="btn btn-light" href="/">На головну</a>
    </div>
  </dialog>

  <script type="application/json" id="book-data">${raw(JSON.stringify(data).replace(/</g, '\\u003c'))}</script>`;
  return layout({ title: info.title, path: '/book', description: 'Онлайн-запис на студійну сесію у Wave Records, Львів.', body, scripts: ['js/book.js'], bodyClass: 'page-book' });
}

/* ---------- /book для GitHub Pages: запис через Google Calendar ---------- */

/** Приймає посилання на сторінку запису Google Calendar або весь код вбудовування з Google. */
export function parseBookingUrl(input) {
  const text = String(input || '').trim();
  const m = text.match(/https:\/\/[^\s"'<>]+/);
  if (!m) return { url: '', embed: false };
  let url = m[0].replace(/&amp;/g, '&');
  const embed = /calendar\.google\.com\/calendar\/appointments\//.test(url);
  if (embed && !/[?&]gv=true/.test(url)) url += (url.includes('?') ? '&' : '?') + 'gv=true';
  return { url, embed };
}

export function staticBookPage({ booking }) {
  const info = block('book.info');
  const c = block('contacts');
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${info.address}, ${c.city}`)}`;
  const tg = c.telegram ? `https://t.me/${c.telegram}` : '';
  const contactsRow = html`
    <div class="hero-ctas">
      ${tg ? html`<a class="btn btn-glass" href="${tg}" rel="noopener" data-cta="book_telegram">Написати в Telegram${icon.arrowUp}</a>` : ''}
      <a class="btn btn-glass" href="${telLink(c.phone)}" data-cta="book_phone">Зателефонувати${icon.phone}</a>
    </div>`;
  let calendar;
  if (booking.url && booking.embed) {
    calendar = html`
      <p class="book-embed-note">${info.calendar_note}</p>
      <div class="book-embed-frame">
        <iframe src="${booking.url}" title="Онлайн-запис у Wave Records" loading="lazy"></iframe>
      </div>
      <p class="muted book-embed-alt">Календар не завантажився? <a class="text-link" href="${booking.url.replace(/[?&]gv=true/, '')}" target="_blank" rel="noopener" data-cta="book_open_calendar">Відкрити запис в окремій вкладці${icon.arrowUp}</a></p>`;
  } else if (booking.url) {
    calendar = html`
      <p class="book-embed-note">${info.calendar_note}</p>
      <a class="btn btn-red btn-lg" href="${booking.url}" target="_blank" rel="noopener" data-cta="book_open_calendar">Обрати дату й час${icon.arrowUp}</a>`;
  } else {
    calendar = html`
      <p class="book-embed-note">Онлайн-запис скоро запрацює. Поки що напишіть або зателефонуйте нам — підберемо зручний час.</p>
      ${contactsRow}`;
  }
  const body = html`
  <section class="page-head container">
    <h1 class="h1">${info.title}</h1>
  </section>
  <section class="container book-wrap">
    <div class="book-info">
      <div class="info-card glass-card">
        <span class="info-icon">${icon.pin}</span>
        <div>
          <p class="info-title">${info.address}</p>
          <p class="muted">${info.address_note}</p>
          <a class="text-link" href="${mapUrl}" rel="noopener" target="_blank">Відкрити на мапі${icon.arrowUp}</a>
        </div>
      </div>
      <div class="info-card glass-card">
        <span class="info-icon">₴</span>
        <p>${info.price_note}</p>
      </div>
    </div>
    <div class="book-embed glass-panel">
      ${calendar}
    </div>
    ${booking.url ? html`<div class="book-help"><p class="muted">Не знайшли зручний час або є питання?</p>${contactsRow}</div>` : ''}
  </section>`;
  return layout({ title: info.title, path: '/book', description: 'Онлайн-запис на студійну сесію у Wave Records, Львів.', body, bodyClass: 'page-book' });
}

/* ---------- /contacts ---------- */

export function contactsPage() {
  const c = block('contacts');
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.address}, ${c.city}`)}`;
  const body = html`
  <section class="page-head container">
    <h1 class="h1">${c.title}</h1>
  </section>
  <section class="container bento">
    <article class="bento-card bento-studio">
      <p class="bento-label">Студія</p>
      <p class="bento-big">${c.studio}</p>
      <p class="bento-text">${c.address}<br>${c.city}</p>
      <div class="bento-actions">
        <a class="btn btn-glass btn-sm" href="${mapUrl}" target="_blank" rel="noopener">Маршрут${icon.arrowUp}</a>
        <a class="btn btn-red btn-sm" href="/book">Записатися${icon.arrow}</a>
      </div>
    </article>
    <a class="bento-card bento-link" href="${telLink(c.phone)}">
      <p class="bento-label">${icon.phone}Телефон</p>
      <p class="bento-value">${c.phone}</p>
    </a>
    <a class="bento-card bento-link" href="mailto:${c.email}">
      <p class="bento-label">${icon.mail}Email</p>
      <p class="bento-value">${c.email}</p>
    </a>
    <article class="bento-card">
      <p class="bento-label">${icon.clock}Графік</p>
      <p class="bento-value">${c.schedule_days}<br>${c.schedule_hours}</p>
    </article>
    ${c.telegram ? html`
    <a class="bento-card bento-link bento-tg" href="https://t.me/${c.telegram}" rel="noopener">
      <p class="bento-label">${icon.telegram}Telegram</p>
      <p class="bento-value">@${c.telegram}</p>
    </a>` : ''}
  </section>`;
  return layout({ title: 'Контакти', path: '/contacts', description: `${c.studio}: ${c.address}, ${c.city}. ${c.phone}`, body });
}

/* ---------- Юридичні сторінки ---------- */

export function legalPage(key, path) {
  const b = block(key);
  const s = getSettings();
  const text = String(b.body || '').replaceAll('{{company}}', s.company).replaceAll('{{domain}}', config.publicUrl || `https://${s.domain}`);
  const body = html`
  <article class="container legal">
    <h1 class="h1">${b.title}</h1>
    ${b.updated ? html`<p class="muted">Останнє оновлення: ${b.updated}</p>` : ''}
    <div class="prose">${miniMarkdown(text)}</div>
  </article>`;
  return layout({ title: b.title, path, body });
}

/* ---------- Помилки ---------- */

export function notFoundPage() {
  const body = html`
  <section class="container page-head error-page">
    <h1 class="h1">Сторінку не знайдено</h1>
    <p class="page-lead">Можливо, посилання застаріло. Почніть з головної або одразу оберіть час для запису.</p>
    <div class="hero-ctas">${btn('/', 'На головну', 'glass')}${btn('/book', 'Записатися', 'red')}</div>
  </section>`;
  return layout({ title: 'Сторінку не знайдено', path: '/404', body });
}

export function errorPage() {
  const body = html`
  <section class="container page-head error-page">
    <h1 class="h1">Щось пішло не так</h1>
    <p class="page-lead">Сервер не зміг обробити запит. Оновіть сторінку за хвилину або напишіть нам напряму.</p>
    <div class="hero-ctas">${btn('/', 'На головну', 'glass')}${btn('/contacts', 'Контакти', 'red')}</div>
  </section>`;
  return layout({ title: 'Помилка', path: '/500', body });
}

export { nl2br };
