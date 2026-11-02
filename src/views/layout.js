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

/** Логотип Wave Records (білий, для темного фону). Файл: public/img/logo.png. */
/** Смужки поверх логотипа: на наведенні вони коротко «грають», як еквалайзер (стилі .logo-bars у site.css). */
/** header: true — логотип у шапці: декодується синхронно й вантажиться першим, щоб шапка з логотипом була на першому
    ж кадрі нової сторінки (з decoding="async" браузер малював шапку без логотипа, поки картинка декодувалась). */
export const logoMark = ({ header = false } = {}) => raw(`<span class="logo-box"><img class="logo-img" src="${asset('img/logo.png')}" alt="Wave Records" width="587" height="160" ${header ? 'decoding="sync" fetchpriority="high"' : 'decoding="async"'}><span class="logo-bars" aria-hidden="true">${'<i></i>'.repeat(12)}</span></span>`);
/** Іконки сайту: favicon і значок для домашнього екрана телефона. */
export const faviconLinks = () => raw(`<link rel="icon" href="${asset('img/favicon.png')}" type="image/png" sizes="96x96">
  <link rel="apple-touch-icon" href="${asset('img/apple-touch-icon.png')}">`);

export const NAV = [
  ['/', 'Головна'],
  ['/services', 'Послуги'],
  ['/portfolio', 'Портфоліо'],
  ['/about', 'Про студію'],
  ['/book', 'Запис'],
  ['/contacts', 'Контакти'],
];

/** Футер, «Сторінки»: дві колонки по три (заповнюються згори донизу), FAQ — одразу після «Запис». */
const FOOTER_PAGES = [...NAV.slice(1, 5), ['/faq', 'FAQ'], ...NAV.slice(5)];

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
  // Пункти меню: номер, назва і лінія-хвиля, що промальовується при наведенні
  const navLinks = NAV.map(([href, label], i) => html`<li><a href="${href}" ${href === current ? raw('aria-current="page"') : ''}><span class="menu-num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><span class="menu-text">${label}</span><svg class="menu-line" viewBox="0 0 120 8" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0 4 Q7.5 0 15 4 T30 4 T45 4 T60 4 T75 4 T90 4 T105 4 T120 4" pathLength="1"/></svg></a></li>`);

  return '<!doctype html>' + html`
<html lang="uk"${config.staticSite ? raw(' data-static') : ''}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <!-- Перший скрипт сторінки, до будь-якого CSS: класи стану на <html>, тож CSS з першого кадру знає, що ховати.
       js — є JavaScript; wr-anim — приховані стани анімацій (не з prefers-reduced-motion);
       wr-intro — інтро при першому вході в сесії; from-menu — прийшли з меню (позначка wr_from_menu у sessionStorage):
       шторка опущена з першого кадру. Порядок появи веде диригент у motion.js.
       Запобіжники: motion.js (модуль) виконується до DOMContentLoaded — якщо на той момент він не запустився
       (помилка чи не завантажився), усе видно одразу; крайній строк — 10 с. Після інтро чи шторки motion.js
       викликає wrArmFailsafe(): якщо за 3 с поява не почалась — усе видно без анімації. Показану так сторінку
       motion.js уже не анімує (клас wr-failsafe) — текст не мигає. -->
  <script>(function(d,w){var s=null;try{s=w.sessionStorage}catch(e){}
function get(k){try{return s&&s.getItem(k)}catch(e){return null}}function del(k){try{s&&s.removeItem(k)}catch(e){}}
var still=matchMedia('(prefers-reduced-motion: reduce)').matches,fm=+get('wr_from_menu');d.classList.add('js');
if(!still){d.classList.add('wr-anim');if(!get('wr_intro')){d.classList.add('wr-intro');try{s.setItem('wr_intro','1')}catch(e){}}else if(fm&&Date.now()-fm<15000)d.classList.add('from-menu')}
if(!d.classList.contains('from-menu'))del('wr_from_menu');
function quiet(v){function n(){}v.ready.catch(n);v.finished.catch(n);if(v.updateCallbackDone)v.updateCallbackDone.catch(n);return v}
w.wrRevealed=new Promise(function(r){if(!('onpagereveal' in w))return r();w.addEventListener('pagereveal',function(e){var v=e.viewTransition&&quiet(e.viewTransition);if(v&&!d.classList.contains('from-menu')){d.classList.add('vt-in');w.wrViewTransition=v}r()},{once:true});setTimeout(r,1500)});
w.addEventListener('pageswap',function(e){if(e.viewTransition)quiet(e.viewTransition)});
function reveal(){d.classList.remove('wr-anim','wr-intro','from-menu');d.classList.add('wr-failsafe');del('wr_from_menu')}
function check(){if(!(w.wrMotion&&w.wrMotion.ready))reveal()}document.addEventListener('DOMContentLoaded',function(){setTimeout(check,0)});setTimeout(check,10000);
w.wrArmFailsafe=function(){setTimeout(function(){if(!(w.wrMotion&&w.wrMotion.contentStarted))reveal()},3000)}})(document.documentElement,window)</script>
  <meta name="color-scheme" content="dark">
  <!-- Критичний CSS: темний фон з першого кадру — лише на html (body прозорий: власний фон body лежав би над
       canvas хвиль і рідини з z-index -1 і ховав їх) — і опущена шторка
       в стані from-menu — така сама, як шторка меню (темна заливка #111111 на весь екран); лоадер-хвиля з інтро
       (.nav-loader) — видно з першої відмальовки в стані from-menu і на старій сторінці після кліку (nav-leaving). Решта — у site.css -->
  <style>html{background:#111111;color-scheme:dark}body{background:transparent}.page-curtain{display:none}html.from-menu .page-curtain{display:block;position:fixed;inset:0;z-index:45}.page-curtain svg{position:absolute;inset:0;width:100%;height:100%}.page-curtain-fill{fill:#111111}.page-curtain-edge{fill:none;opacity:0}.nav-loader{display:none;position:fixed;left:0;right:0;top:50%;height:160px;margin-top:-80px;z-index:46;pointer-events:none;transition:opacity .5s cubic-bezier(.2,.8,.2,1),transform .5s cubic-bezier(.2,.8,.2,1)}html.from-menu .nav-loader,html.nav-leaving .nav-loader{display:block}.nav-loader svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}.nav-loader path{fill:none;stroke:url(#nav-loader-grad);stroke-width:2;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 6px rgba(255,46,154,.35))}.nav-loader.is-out{opacity:0;transform:scaleY(3)}</style>
  <title>${fullTitle}</title>
  <meta name="description" content="${desc}">
  <meta name="theme-color" content="#111111">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${fullTitle}">
  <meta property="og:description" content="${desc}">
  <meta property="og:locale" content="uk_UA">
  ${base ? html`<meta property="og:url" content="${base + current}"><link rel="canonical" href="${base + current}">` : ''}
  ${ogImage ? html`<meta property="og:image" content="${ogImage}">` : ''}
  <link rel="preload" href="${asset('img/logo.png')}" as="image" fetchpriority="high">
  ${faviconLinks()}
  <!-- Шрифти — на самому сайті (public/fonts, @font-face у site.css). Шрифти заголовків вантажимо заздалегідь:
       кирилиця заголовків — Inter Tight 900, латиниця — Archivo Black; основний текст — Inter -->
  <link rel="preload" href="/assets/fonts/inter-tight-cyrillic-900-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/assets/fonts/archivo-black-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/assets/fonts/inter-cyrillic-400-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="${asset('vendor/lenis-1.3.27.css')}">
  <link rel="stylesheet" href="${asset('css/site.css')}">
  ${current === '/' ? raw(`<link rel="modulepreload" href="/assets/js/hero3d.js">
  <link rel="modulepreload" href="/assets/vendor/three.module-0.187.0.min.js">
  <link rel="modulepreload" href="/assets/vendor/three.core-0.187.0.min.js">`) : ''}
  ${analyticsHead(s)}
</head>
<body class="${bodyClass}">
  ${analyticsBody(s)}
  <!-- Шторка переходу з меню: видно лише з html.from-menu (див. скрипт у <head>), піднімає її motion.js -->
  <div class="page-curtain" data-page-curtain aria-hidden="true">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
      <defs><linearGradient id="curtain-edge" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#FF2E9A"/><stop offset="1" stop-color="#00E5FF"/></linearGradient></defs>
      <path class="page-curtain-fill" d="M0 0 L100 0 L100 112 L0 112 Z"/>
      <path class="page-curtain-edge" d="M100 112 L0 112" stroke="url(#curtain-edge)" vector-effect="non-scaling-stroke"/>
    </svg>
  </div>
  <!-- Підйом шторки після переходу з меню — тут, а не в motion.js: не чекає GSAP, 3D, фото, аудіо й рідину.
       Лоадер-хвиля показується щонайменше ~400 мс і не довше, ніж до готовності сторінки (шрифти, фон bg.js, перша
       відмальовка), але не більше ~1,5 с; потім хвиля розгортається, і шторка піднімається тією самою хвилею, що при
       закритті меню (0,75 с). Після підйому знімає from-menu і позначку; motion.js чекає window.wrCurtainLift. -->
  <!-- Лоадер переходу з меню: та сама хвиля, що в інтро (графіка, кольори, формула), без лічильника й «Пропустити».
       Фаза хвилі рахується від годинника (Date.now), тож на старій і новій сторінці вона та сама — продовження без стрибка.
       wrNavLoader.start() — запускає (на старій сторінці викликає site.js після кліку по пункту меню, на новій — одразу),
       out() — хвиля вирівнюється й м'яко розгортається (як у кінці інтро), stop() — зупиняє. -->
  <div class="nav-loader" data-nav-loader aria-hidden="true">
    <svg viewBox="0 0 1000 200" preserveAspectRatio="none" focusable="false">
      <defs><linearGradient id="nav-loader-grad" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#FF2E9A" stop-opacity="0"/><stop offset=".3" stop-color="#FF2E9A"/><stop offset=".7" stop-color="#00E5FF"/><stop offset="1" stop-color="#00E5FF" stop-opacity="0"/></linearGradient></defs>
      <path d="M0 100 L1000 100"/>
    </svg>
  </div>
  <script>(function(d,w){var L=document.querySelector('[data-nav-loader]'),P=L&&L.querySelector('path'),raf=0,amp=1;
function draw(){var t=Date.now()/1000,a=(.55+.12*Math.sin(t*2.1))*amp,ph=t*5,s='';for(var i=0;i<=60;i++){var e=Math.sin(Math.PI*i/60),y=100+a*70*e*Math.sin(i*.42+ph);s+=(i?'L':'M')+(i/60*1000).toFixed(1)+' '+y.toFixed(1)}P.setAttribute('d',s)}
function loop(){draw();raf=requestAnimationFrame(loop)}
w.wrNavLoader={start:function(){if(!P||raf)return;L.classList.remove('is-out');amp=1;loop()},
out:function(){return new Promise(function(res){if(!P||!raf)return res();var t0=performance.now();(function f(now){var k=Math.min(1,Math.max(0,now-t0)/250);amp=1-k*k*(3-2*k);if(k<1)requestAnimationFrame(f);else{L.classList.add('is-out');res()}})(t0)})},
stop:function(){cancelAnimationFrame(raf);raf=0;amp=1;if(L)L.classList.remove('is-out')}};
if(d.classList.contains('from-menu'))w.wrNavLoader.start()})(document.documentElement,window)</script>
  <script>(function(d,w){if(!d.classList.contains('from-menu'))return;
var c=document.querySelector('[data-page-curtain]'),fill=c.querySelector('.page-curtain-fill'),edge=c.querySelector('.page-curtain-edge');
function draw(y,a,ph){function v(k){return y+a*Math.sin(ph+k*1.9)}function e(k){return v(k).toFixed(2)}var m=(2*v(3)-v(2)).toFixed(2),cv='C83 '+e(1)+' 67 '+e(2)+' 50 '+e(3)+' C33 '+m+' 17 '+e(5)+' 0 '+e(6);fill.setAttribute('d','M0 0 L100 0 L100 '+e(0)+' '+cv+' Z');edge.setAttribute('d','M100 '+e(0)+' '+cv)}
function wait(ms){return new Promise(function(r){setTimeout(r,ms)})}
w.wrCurtainLift=new Promise(function(done){
var fonts=document.fonts?document.fonts.ready:Promise.resolve();
var bg=new Promise(function(r){(function chk(){var b=document.querySelector('[data-bg]');if(!b||b.classList.contains('is-ready'))r();else requestAnimationFrame(chk)})()});
Promise.all([wait(400),Promise.race([Promise.all([fonts,bg]),wait(1500)])]).then(function(){requestAnimationFrame(function(){requestAnimationFrame(function(){if(w.wrNavLoader)w.wrNavLoader.out();start()})})});
function start(){var t0=performance.now();edge.style.opacity='.85';
(function f(now){var s=Math.max(0,now-t0),t=Math.min(1,s/750),p=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2,a=s<320?8*Math.sin(s/320*Math.PI/2):s<720?8*Math.cos((s-320)/400*Math.PI/2):0;
draw(112-126*p,a,3.2*(1-p));if(t<1)requestAnimationFrame(f);else{d.classList.remove('from-menu');if(w.wrNavLoader)w.wrNavLoader.stop();try{sessionStorage.removeItem('wr_from_menu')}catch(e){}done()}})(t0)}
})})(document.documentElement,window)</script>
  <!-- Інтро: показується лише з html.wr-intro (див. скрипт у <head>), анімацію веде motion.js -->
  <div class="intro" data-intro>
    <div class="intro-half intro-top" aria-hidden="true"></div>
    <div class="intro-half intro-bottom" aria-hidden="true"></div>
    <div class="intro-stage" aria-hidden="true">
      <span class="intro-logo">${logoMark()}</span>
      <svg class="intro-line" viewBox="0 0 1000 200" preserveAspectRatio="none" focusable="false">
        <defs><linearGradient id="intro-grad" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#FF2E9A" stop-opacity="0"/><stop offset=".3" stop-color="#FF2E9A"/><stop offset=".7" stop-color="#00E5FF"/><stop offset="1" stop-color="#00E5FF" stop-opacity="0"/></linearGradient></defs>
        <path d="M0 100 L1000 100" stroke="url(#intro-grad)" stroke-width="2" fill="none" vector-effect="non-scaling-stroke"/>
      </svg>
      <span class="intro-count">0</span>
    </div>
    <button type="button" class="intro-skip" data-intro-skip>Пропустити</button>
  </div>
  <a class="skip" href="#main">Перейти до вмісту</a>
  <div class="bg" data-bg aria-hidden="true"><div class="bg-dots"></div><canvas></canvas><div class="bg-grain"></div></div>
  <!-- Рідина за курсором (public/js/fluid.js): над фоном і під вмістом; коли відкрите меню, fluid.js переносить її в меню -->
  <canvas class="fluid" data-fluid aria-hidden="true"></canvas>

  <header class="site-header glass" data-header>
    <a class="logo" href="/" aria-label="${s.company} — на головну">${logoMark({ header: true })}</a>
    <div class="header-actions">
      <a class="btn btn-neon btn-sm header-book" href="/book">Записатися</a>
      <button class="btn btn-glass btn-sm menu-toggle" type="button" aria-expanded="false" aria-controls="site-menu" data-menu-toggle>
        <span class="menu-label">Меню</span><span class="burger" aria-hidden="true"><i></i><i></i></span>
      </button>
    </div>
  </header>

  <!-- Меню: сайт позаду розмивається (.menu-blur), хвиля (SVG) накриває екран згори донизу, потім каскадом пункти.
       Анімацію веде motion.js (wrMotion.menuAnim), стан і фокус — site.js -->
  <div class="menu" id="site-menu" role="dialog" aria-modal="true" aria-label="Меню сайту" hidden data-menu data-lenis-prevent>
    <div class="menu-blur" aria-hidden="true"></div>
    <svg class="menu-wave" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs><linearGradient id="menu-edge" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#FF2E9A"/><stop offset="1" stop-color="#00E5FF"/></linearGradient></defs>
      <path class="menu-wave-fill" d="M0 0 L100 0 L100 100 L0 100 Z"/>
      <path class="menu-wave-edge" d="M100 100 L0 100" stroke="url(#menu-edge)" vector-effect="non-scaling-stroke"/>
    </svg>
    <nav class="menu-inner container" aria-label="Головне меню">
      <!-- Сітка 2×3 пунктів; FAQ — скляна пігулка рівно в центрі екрана (на телефоні — така сама пігулка в нижній групі) -->
      <div class="menu-main">
        <ol class="menu-links" role="list">${navLinks}</ol>
        <div class="menu-faq-wrap"><a class="btn btn-glass btn-sm menu-faq" href="/faq" ${current === '/faq' ? raw('aria-current="page"') : ''}>FAQ</a></div>
      </div>
      <!-- Низ меню — одна лінія: адреса — телефон — Telegram — «Записатися» (на телефоні — компактна група по центру) -->
      <!-- Дві половини — точно під дві колонки пунктів меню: ліворуч адреса й телефон, праворуч Telegram і «Записатися»;
           телефон і Telegram на однаковій відстані від центральної лінії — ряд симетричний за будь-якої довжини тексту.
           На вузьких екранах половини «розчиняються» (display: contents) у компактну групу по центру -->
      <div class="menu-foot">
        <div class="menu-foot-half">
          <p class="menu-contact menu-addr">м. ${String(c.city || '').split(',')[0].trim()}, ${c.address}</p>
          <p class="menu-contact menu-phone"><a href="${telLink(c.phone)}">${c.phone}</a></p>
        </div>
        <div class="menu-foot-half">
          ${c.telegram ? html`<p class="menu-contact menu-tg"><a href="https://t.me/${c.telegram}" rel="noopener">Telegram @${c.telegram}</a></p>` : ''}
          <a class="btn btn-glass btn-sm menu-faq-mob" href="/faq" ${current === '/faq' ? raw('aria-current="page"') : ''}>FAQ</a>
          <a class="btn btn-neon menu-book" href="/book">Записатися${icon.arrow}</a>
        </div>
      </div>
    </nav>
  </div>

  <main id="main">${body}</main>

  <!-- Заломлення рідкого скла (лише Chromium, вмикає site.js класом lg-refract на <html>) -->
  <svg class="lg-defs" width="0" height="0" aria-hidden="true" focusable="false">
    <filter id="lg-refract" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.006 0.009" numOctaves="2" seed="11" result="noise"/>
      <feGaussianBlur in="noise" stdDeviation="3" result="soft"/>
      <feDisplacementMap in="SourceGraphic" in2="soft" scale="26" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </svg>

  <footer class="site-footer">
    <div class="container footer-grid">
      <div class="footer-brand">
        <a class="logo logo-lg" href="/">${logoMark()}</a>
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
        <ul class="footer-links">${FOOTER_PAGES.map(([href, label]) => html`<li><a href="${href}">${label}</a></li>`)}</ul>
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

  <!-- Неонова шторка для переходів між сторінками (View Transitions, site.css) -->
  <div class="vt-curtain" aria-hidden="true"></div>

  <script src="${asset('js/bg.js')}" defer></script>
  <script src="${asset('js/fluid.js')}" defer></script>
  <script src="${asset('js/site.js')}" defer></script>
  <!-- Анімації: бібліотеки з public/vendor (версія в назві файлу), ініціалізація — public/js/motion.js -->
  <script src="${asset('vendor/gsap-3.15.0.min.js')}" defer></script>
  <script src="${asset('vendor/ScrollTrigger-3.15.0.min.js')}" defer></script>
  <script src="${asset('vendor/SplitText-3.15.0.min.js')}" defer></script>
  <script src="${asset('vendor/lenis-1.3.27.min.js')}" defer></script>
  <script type="module" src="${asset('js/motion.js')}"></script>
  ${scripts.map((src) => html`<script src="${asset(src)}" defer></script>`)}
</body>
</html>`;
}

export { esc };
