/* Wave Records — анімації та плавний скрол.
   Єдине місце, де ініціалізуються ефекти на GSAP, ScrollTrigger, SplitText і three.js.
   Бібліотеки лежать у public/vendor і підключаються в src/views/layout.js звичайними скриптами
   (gsap, ScrollTrigger, SplitText, Lenis — глобальні змінні); three.js — ES-модуль, його імпортуємо тут,
   коли знадобиться: import * as THREE from '../vendor/three.module-0.187.0.min.js';

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

window.wrMotion = { gsap, ScrollTrigger, SplitText, lenis, reduceMotion };
if (ScrollTrigger) addEventListener('load', () => ScrollTrigger.refresh());
