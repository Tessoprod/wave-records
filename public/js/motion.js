/* Wave Records — анімації та плавний скрол.
   Єдине місце, де ініціалізуються ефекти на GSAP, ScrollTrigger, SplitText і three.js.
   Бібліотеки лежать у public/vendor і підключаються в src/views/layout.js звичайними скриптами
   (gsap, ScrollTrigger, SplitText, Lenis — глобальні змінні); three.js — ES-модуль, його імпортує
   public/js/hero3d.js, а той вантажиться звідси динамічним import().

   Плавний скрол (Lenis) і ScrollTrigger працюють від одного циклу — gsap.ticker,
   тож анімації на скролі не відстають від сторінки. При prefers-reduced-motion Lenis вимкнений:
   сторінка гортається звичайно, а ефекти мають показувати кінцевий стан без руху. */

const { gsap, ScrollTrigger, SplitText, Lenis } = window;
const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (gsap) gsap.registerPlugin(...[ScrollTrigger, SplitText].filter(Boolean));

/* ---------- Плавний скрол ---------- */
let lenis = null;
if (gsap && ScrollTrigger && Lenis && !reduceMotion) {
  // Відступ під шапку для якорів — той самий, що й scroll-padding-top у site.css
  const headerOffset = () => -(parseFloat(getComputedStyle(root).scrollPaddingTop) || 0);
  lenis = new Lenis({
    autoRaf: false,
    lerp: 0.1,
    // Пальцем телефон гортає сам (нативна інерція); Lenis згладжує колесо миші й тачпад
    syncTouch: false,
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // Поки відкрите меню (body.menu-open), сторінка під ним не гортається
  const body = document.body;
  const syncMenu = () => (body.classList.contains('menu-open') ? lenis.stop() : lenis.start());
  new MutationObserver(syncMenu).observe(body, { attributes: true, attributeFilter: ['class'] });

  // Якорі на цій самій сторінці (зокрема «Перейти до вмісту» і пункти меню): плавний перехід з відступом під шапку;
  // якщо відкрите меню — спершу воно закривається
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href*="#"]');
    if (!a || a.origin !== location.origin || a.pathname !== location.pathname || !a.hash) return;
    const target = document.getElementById(decodeURIComponent(a.hash.slice(1)));
    if (!target) return;
    e.preventDefault();
    setTimeout(() => {
      lenis.start();
      lenis.scrollTo(target, { offset: headerOffset() });
      history.replaceState(null, '', a.hash);
    }, body.classList.contains('menu-open') ? 380 : 0);
  });
}

/* ---------- Анімації ----------
   Наступні етапи додаватимуть ефекти сюди. Кожен ефект — окрема функція,
   яка нічого не робить, якщо потрібних елементів на сторінці немає. */

const motion = window.wrMotion = { gsap, ScrollTrigger, SplitText, lenis, reduceMotion, hero: null };

/* Поява заголовка першого екрана: літери WAVE RECORDS виїжджають знизу, далі підзаголовок і кнопки.
   До початку анімації текст схований (html.js у site.css); без анімацій — просто показуємо. */
function heroIntro() {
  const intro = document.querySelector('[data-hero-intro]');
  if (!intro) return;
  const show = () => intro.classList.add('is-in');
  if (!gsap || reduceMotion) { show(); return; }
  const line1 = intro.querySelector('.hero-l1');
  const rest = intro.querySelectorAll('.hero-l2, .hero-sub, .hero-ctas');
  const run = () => {
    show();
    const split = SplitText && line1 ? SplitText.create(line1, { type: 'chars', mask: 'chars' }) : null;
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete: () => split?.revert() });
    if (split) tl.from(split.chars, { yPercent: 110, duration: 1.2, stagger: 0.035 });
    else if (line1) tl.from(line1, { y: 40, opacity: 0, duration: 1.1 });
    tl.from(rest, { y: 28, opacity: 0, duration: 1, stagger: 0.1 }, split ? 0.35 : 0.2);
  };
  // Літери ділимо після завантаження шрифтів, інакше їхня ширина буде хибною
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(run);
}

/* 3D-скульптура на першому екрані головної (public/js/hero3d.js).
   three.js вантажиться лише тут, динамічним import(), коли сторінка вже показана.
   Без WebGL і з prefers-reduced-motion лишається статичний кадр (.hero-scene у site.css). */
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}
async function heroScene() {
  const host = document.querySelector('[data-hero-scene]');
  if (!host) return;
  const fallback = () => host.classList.add('is-fallback');
  if (reduceMotion || !hasWebGL()) { fallback(); return; }
  const mobile = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
  // Слабкі пристрої: мало ядер чи пам'яті — менша деталізація і без згладжування
  const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  let hero;
  try {
    const { createHeroScene } = await import('./hero3d.js');
    hero = createHeroScene(host, { mobile, weak });
  } catch (err) {
    console.warn('3D-сцена недоступна, лишаю статичний кадр', err);
    fallback();
    return;
  }
  motion.hero = hero;

  // Рендер лише коли перший екран видно і вкладка активна
  let visible = true;
  const sync = () => (visible && !document.hidden ? hero.start() : hero.stop());
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; sync(); }).observe(host);
  document.addEventListener('visibilitychange', sync);
  let resizeT;
  addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { hero.resize(); if (!hero.running) hero.renderOnce(); }, 120);
  }, { passive: true });

  // Скрол: поки перший екран їде вгору, скульптура віддаляється, зменшується і зміщується
  if (ScrollTrigger) {
    ScrollTrigger.create({
      trigger: host.closest('.hero') || host,
      start: 'top top',
      end: 'bottom top',
      onUpdate: (st) => hero.setScroll(st.progress),
    });
  }
  hero.renderOnce();
  sync();
  requestAnimationFrame(() => host.classList.add('is-ready'));
}

heroIntro();
// Після першого відображення: коли браузер вільний (або щонайпізніше за 1.5 с після завантаження)
const afterPaint = (fn) => {
  const go = () => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
};
afterPaint(heroScene);
if (ScrollTrigger) addEventListener('load', () => ScrollTrigger.refresh());
