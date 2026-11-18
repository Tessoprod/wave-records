/* Wave Records — анімації та плавний скрол.
   Єдине місце, де ініціалізуються ефекти на GSAP, ScrollTrigger, SplitText і three.js.
   Бібліотеки лежать у public/vendor і підключаються в src/views/layout.js звичайними скриптами
   (gsap, ScrollTrigger, SplitText, Lenis — глобальні змінні); three.js — ES-модуль, його імпортує
   public/js/hero3d.js, а той вантажиться звідси динамічним import().

   Плавний скрол (Lenis) і ScrollTrigger працюють від одного циклу — gsap.ticker.
   Стартові приховані стани задає site.css лише з класом html.wr-anim (ставить вбудований скрипт у <head>);
   тут кожен прихований елемент обов'язково проявляється. Якщо щось пішло не так — клас знімається
   і весь вміст видно.
   prefers-reduced-motion: без Lenis, без руху — лише проявлення прозорістю.
   Сенсорні екрани: без магнітних кнопок. Курсор — завжди системний. */

const { gsap, ScrollTrigger, SplitText, Lenis } = window;
const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const wide = matchMedia('(min-width: 861px)').matches;

const EASE = 'expo.out';
const SOFT = 'power3.out';
const motion = window.wrMotion = {
  gsap, ScrollTrigger, SplitText, lenis: null, reduceMotion, hero: null, heroReady: null,
  introDone: Promise.resolve(), entered: Promise.resolve(), contentStarted: false, stepMood: null, ready: false,
};
// pagereveal (з <head>) каже, чи прийшли через View Transition; motion.js може запуститися раніше за нього
const revealed = window.wrRevealed || Promise.resolve();
const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
// Шрифти для появи назви: назву ділимо на рядки й показуємо лише зі справжніми шрифтами заголовків (Inter Tight 900 для
// кирилиці й Archivo Black для латиниці; раніше чекали лише Archivo Black, у якому кирилиці немає, — тобто ні на що).
// З запасним шрифтом інакше переносяться рядки і змінюється
// розмір — заголовок «стрибав» би після завантаження. Відлік іде від старту сторінки, паралельно з інтро чи шторкою;
// крайній строк 6 с (якщо шрифт так і не завантажився — показуємо запасним).
const fontsForTitle = Promise.race([
  Promise.all([
    fontsReady,
    // Кирилицю заголовків малює Inter Tight 900 (в Archivo Black кирилиці немає), латиницю — Archivo Black
    document.fonts?.load('900 1em "Inter Tight"', 'ВІДЄЇҐ').catch(() => {}),
    document.fonts?.load('400 1em "Archivo Black"', 'WAVE').catch(() => {}),
  ]),
  new Promise((r) => setTimeout(r, 6000)),
]);

/* ---------- Плавний скрол ---------- */
function smoothScroll() {
  if (!gsap || !ScrollTrigger || !Lenis || reduceMotion) return;
  const lenis = motion.lenis = new Lenis({
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

  // Смуга прокрутки займає місце (Windows)? Тоді зупинений Lenis не міняє overflow сторінки (інакше смуга зникає
  // й ширина стрибає на ~15 px — див. html.sb-classic у site.css). Міряємо зараз: Lenis ще не зупинявся.
  // Колесо й дотик блокує сам Lenis, клавіші прокрутки — тут.
  root.classList.toggle('sb-classic', innerWidth - root.clientWidth > 0);
  // Поля вводу, кнопки й елементи з власною прокруткою ([data-lenis-prevent], як меню) свої клавіші отримують
  const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
  addEventListener('keydown', (e) => {
    if (!lenis.isStopped || !SCROLL_KEYS.has(e.key) || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest('input, textarea, select, button, summary, [contenteditable], [role="slider"]')) return;
    const own = t?.closest('[data-lenis-prevent]');
    if (own && own.scrollHeight > own.clientHeight + 1) return;
    e.preventDefault();
  });

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
      // Відступ під шапку Lenis бере сам зі scroll-padding-top у site.css (додатковий offset подвоїв би його)
      lenis.scrollTo(target);
      history.replaceState(null, '', a.hash);
    }, body.classList.contains('menu-open') ? 380 : 0);
  });
}

/* ---------- Допоміжне ---------- */
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
// Перехід з меню: контент першого екрана з'являється м'якше — лише згасання і зсув до 16 px (без масок рядків),
// щоб разом із підйомом шторки не було різких рухів. Решта сторінки (нижче екрана) — як завжди.
const GENTLE = !reduceMotion && root.classList.contains('from-menu');
const inFirstView = (el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; };
const gentle = (el) => GENTLE && inFirstView(el);
const GENTLE_Y = 16;
const notInDialog = (el) => !el.closest('dialog, [hidden]');
// Один раз при першій появі; якщо елемент уже вище екрана — анімація відбувається одразу
const onceAt = (trigger, start = 'top 88%') => ({ trigger, start, once: true });

/* Проявити групу елементів каскадом, коли вони доїжджають до екрана */
function cascade(items, { y = 40, x = 0, stagger = 0.08, onEnter } = {}) {
  if (!items.length) return;
  const cap = (v, el) => (gentle(el) ? Math.sign(v) * Math.min(Math.abs(v), GENTLE_Y) : v);
  gsap.set(items, { opacity: 0, y: (i, el) => (reduceMotion ? 0 : cap(y, el)), x: (i, el) => (reduceMotion ? 0 : cap(x, el)) });
  ScrollTrigger.batch(items, {
    start: 'top 92%',
    once: true,
    onEnter: (batch) => {
      // Прозорість лишається вбудованою (opacity: 1): інакше знову спрацює приховане правило з site.css
      gsap.to(batch, { opacity: 1, x: 0, y: 0, duration: 0.9, ease: EASE, stagger, overwrite: true, clearProps: 'transform' });
      onEnter?.(batch);
    },
  });
}

/* ---------- 1. Заголовки й тексти ----------
   pageTitle() — назва сторінки (перший h1), стартує першою; headings() — решта заголовків і лідів. */
const titleEl = () => document.querySelector('main h1.h1');
function splitLines(el, trigger = true) {
  if (gentle(el)) {
    gsap.fromTo(el, { opacity: 0, y: GENTLE_Y }, { opacity: 1, y: 0, duration: 0.8, ease: EASE, clearProps: 'transform' });
    return;
  }
  gsap.set(el, { opacity: 1 });
  // Рядки виїжджають знизу з маски; після анімації розмітка повертається до звичайної
  const split = SplitText.create(el, { type: 'lines', mask: 'lines' });
  gsap.from(split.lines, {
    yPercent: 105, duration: 1, ease: EASE, stagger: 0.08,
    scrollTrigger: trigger ? onceAt(el, 'top 92%') : undefined,
    onComplete: () => split.revert(),
  });
}
function pageTitle() {
  const el = titleEl();
  if (!el) return;
  if (!SplitText) gsap.to(el, { opacity: 1, duration: 0.8, ease: SOFT });
  else splitLines(el, false);
}
// queue — як виконати роботу для кожного заголовка (за замовчуванням одразу; conductor() може розкласти її на частини)
function headings(queue = (fn) => fn()) {
  $$('main .h1, main .h2').filter(notInDialog).filter((el) => el !== titleEl())
    .filter((el) => !(motion.stage && el.closest('.svc-section'))).forEach((el) => queue(() => {
    if (!SplitText) {
      gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.8, ease: SOFT, scrollTrigger: onceAt(el, 'top 92%') });
      return;
    }
    splitLines(el);
  }));
  queue(() => $$('main .page-lead, main .sec-lead, main .sec-sub, main .chapter').filter(notInDialog).forEach((el) => {
    gsap.fromTo(el, { opacity: 0, y: 18 }, {
      opacity: 1, y: 0, duration: 0.9, ease: SOFT, delay: 0.1, clearProps: 'transform',
      scrollTrigger: onceAt(el, 'top 94%'),
    });
  }));
}
// Вміст без власної анімації (текст юридичних сторінок, кнопки, фото, футер) — м'яке проявлення.
// Прозорість лишається вбудованою (opacity: 1): інакше знову спрацює приховане правило з site.css
const PLAIN = 'main .prose, .legal .muted, .error-page .hero-ctas, .about-hero-photo, .final-cta, .sec-head > .btn, .section-steps .steps, .steps-cta, .marquee, .book-help, .book-pick > .book-step-head, .book-picker, .faq-nav, .faq-group-title, .faq-help, .faq-home-ctas, .site-footer';
function plainFade() {
  // Блок Послуг на головній (сцена з закріпленням) проявляє сама сцена — тут його не чіпаємо
  $$(PLAIN).filter((el) => !(motion.stage && el.closest('.svc-section'))).forEach((el) => {
    gsap.fromTo(el, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8, ease: SOFT, clearProps: 'transform', scrollTrigger: onceAt(el, 'top 96%') });
  });
}

/* ---------- Плавне зникнення першого екрана ----------
   Прив'язане до прогресу прокрутки (scrub, синхронно з Lenis), без перемикання класів:
   заголовок піднімається на ~70 px і згасає; підзаголовок із кнопками — з невеликою затримкою.
   autoAlpha вмикає visibility: hidden лише при непрозорості рівно 0 і знімає, щойно вона починає зростати,
   тож нагорі кнопки завжди клікабельні. prefers-reduced-motion — лише згасання, без руху.
   Анімуються тільки transform і opacity: розмиття (filter) великого заголовка з тінню тексту браузер перемальовував
   на кожному кадрі прокрутки — текст рухався ривками, «слайдшоу». Шари заголовка й кнопок — will-change у site.css. */
function heroFadeTweens(tl, at = 0) {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const out = (el, offset, span, dy) => {
    if (!el) return;
    tl.fromTo(el,
      { autoAlpha: 1, y: 0 },
      { autoAlpha: 0, y: reduceMotion ? 0 : dy, duration: span, ease: 'none' },
      at + offset);
  };
  out(hero.querySelector('.hero-title'), 0, 0.62, -70);
  out(hero.querySelector('.hero-bottom'), 0.1, 0.6, -48);
}
// Без закріплення (телефон, планшет, prefers-reduced-motion): той самий ефект, поки перший екран іде вгору
function heroFadeStandalone() {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const tl = gsap.timeline({ scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: reduceMotion ? true : 0.8 } });
  heroFadeTweens(tl, 0);
}

/* ---------- Поява Послуг на головній ----------
   Перший екран закріплюється (pin + scrub, синхронно з Lenis). Під час прокрутки текст іде вгору й згасає,
   3D-сцена віддаляється, а з центру екрана виїжджають картки послуг: спершу купкою, зменшені, напівпрозорі
   й розмиті, потім каскадом розходяться на свої місця; заголовок проявляється разом із ними.
   Щойно всі картки на місцях (мітка settled), закріплення триває ще ~0,5 екрана — «стопор»: картки нерухомі,
   стають клікабельними, по краях пробігає відблиск; прокрутка м'яко примагнічується до settled. Лише широкий екран (від 1101 px), де Послуги
   вміщаються в один екран; на телефоні й при prefers-reduced-motion — звичайна поява (blocks()). */
function servicesStage() {
  const stage = document.querySelector('[data-stage]');
  const svc = stage?.querySelector('.svc-section');
  const hero = stage?.querySelector('.hero');
  if (!svc || !hero || reduceMotion || !matchMedia('(min-width: 1101px)').matches) return false;
  root.classList.add('stage-on');
  if (svc.offsetHeight > innerHeight) { root.classList.remove('stage-on'); return false; }
  const items = $$('.svc-grid > li', svc);
  const head = $$('.sec-head > *', svc);
  const hint = hero.querySelector('[data-scroll-hint]');
  // Зсув картки від її місця до центру екрана (без урахування transform — рахуємо через offset*)
  const pos = (el) => {
    let x = 0; let y = 0;
    for (let n = el; n && n !== stage; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
    return { x: x + el.offsetWidth / 2, y: y + el.offsetHeight / 2 };
  };
  const toCenterX = (i, el) => innerWidth / 2 - pos(el).x + (i - (items.length - 1) / 2) * 6;
  const toCenterY = (i, el) => innerHeight / 2 - pos(el).y + (i % 2 ? 5 : -5);
  // Порожнє місце під картками всередині першого екрана (картки по центру екрана): біжучий рядок після нього
  // підтягується вгору на цю величину (--stage-tail у site.css), щоб проміжки над і під рядком були рівні.
  // Рахуємо перед кожним перерахунком ScrollTrigger (закріплення тоді знято — звичайне розташування)
  const grid = svc.querySelector('.svc-grid');
  const setTail = () => root.style.setProperty('--stage-tail', `${Math.max(0, Math.round(stage.getBoundingClientRect().bottom - grid.getBoundingClientRect().bottom))}px`);
  setTail();
  ScrollTrigger.addEventListener('refreshInit', setTail);

  // Довжина закріплення: BASE екрана — поява карток, PAUSE — «стопор»: картки вже на місцях і нерухомі
  const BASE = 1.3;
  const PAUSE = 0.5;
  const SCENE_GONE = 1; // час таймлайну, коли 3D-сцена згасла повністю (fromTo нижче: 0.75 + 0.25)
  let placedAt = Infinity;
  let settled = false;
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: stage,
      start: 'top top',
      end: () => `+=${Math.round(innerHeight * (BASE + PAUSE))}`,
      pin: true,
      scrub: 0.8,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: (st) => motion.hero?.setScroll(Math.min(1, st.progress * 1.4 * (BASE + PAUSE) / BASE)),
    },
    // Стан карток беремо з самого таймлайну (зі згладжуванням scrub), а не з прокрутки: клікабельні лише тоді,
    // коли справді стали на місця (мітка settled)
    onUpdate: () => {
      const now = tl.time() >= placedAt - 0.001;
      if (now !== settled) {
        settled = now;
        svc.classList.toggle('is-placed', now);
        if (now && !reduceMotion) {
          // Сигнал «картки активні»: по краях коротко пробігає ледь помітний відблиск (один раз)
          svc.classList.remove('is-glint');
          void svc.offsetWidth;
          svc.classList.add('is-glint');
          setTimeout(() => svc.classList.remove('is-glint'), 1000);
        }
      }
      // 3D-сцена наприкінці згасає (autoAlpha у таймлайні) — тоді не рендеримо її
      const hidden = tl.time() >= SCENE_GONE - 0.001;
      if (hidden !== motion.heroCovered) { motion.heroCovered = hidden; motion.heroSync?.(); }
    },
  });
  // Заголовок і кнопки першого екрана плавно йдуть угору й згасають у першій половині появи карток
  // (картки збираються з 0.18 і розходяться з 0.32 — рух безперервний). «Scroll» ховається сам із початком прокрутки.
  heroFadeTweens(tl, 0);
  // Картки з'являються купкою в центрі…
  tl.fromTo(items, { x: toCenterX, y: toCenterY, scale: 0.5, rotate: (i) => (i % 2 ? 1 : -1) * (3 + i), opacity: 0, filter: 'blur(10px)' },
    { scale: 0.6, opacity: 0.45, filter: 'blur(6px)', duration: 0.12, ease: 'power1.out', stagger: 0.015 }, 0.18)
  // …і каскадом розходяться на свої місця
    .to(items, { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, filter: 'blur(0px)', duration: 0.5, ease: 'power3.out', stagger: 0.07 }, 0.32)
    .fromTo(head, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out', stagger: 0.06 }, 0.34);
  // Наприкінці 3D-сцена першого екрана згасає повністю (opacity 0 + visibility: hidden)
  const scene = hero.querySelector('[data-hero-scene]');
  if (scene) tl.fromTo(scene, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.25, ease: 'power1.in' }, 0.75);
  // Картки на місцях — мітка settled; далі порожній відрізок (пауза), поки закріплення ще триває
  placedAt = tl.duration();
  tl.addLabel('settled', placedAt);
  tl.to({}, { duration: placedAt * PAUSE / BASE });
  // М'яке примагнічування до settled: коли прокрутка зупинилась поблизу — доводимо точно до карток
  magnetTo(() => {
    const st = tl.scrollTrigger;
    return st.start + (st.end - st.start) * (placedAt / tl.duration());
  }, () => innerHeight * 0.22, 0.5);

  // «Scroll» веде одразу в кінець анімації, де картки вже на місцях
  hint?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const end = tl.scrollTrigger.end;
    if (motion.lenis) motion.lenis.scrollTo(end); else scrollTo({ top: end, behavior: 'smooth' });
  });
  return true;
}

/* М'яке примагнічування прокрутки до точки (синхронно з Lenis): коли прокрутка зупинилась на відстані до range()
   від target(), за duration с плавно доводимо до неї. Не блокує: далі можна гортати в будь-який бік. */
function magnetTo(target, range, duration) {
  if (reduceMotion) return;
  let idle = 0;
  let busy = false;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const check = () => {
    if (busy || document.body.classList.contains('menu-open')) return;
    const y = target();
    const d = y - scrollY;
    if (Math.abs(d) < 2 || Math.abs(d) > range()) return;
    busy = true;
    const done = () => { busy = false; };
    if (motion.lenis) motion.lenis.scrollTo(y, { duration, easing: ease, onComplete: done });
    else { scrollTo({ top: y, behavior: 'smooth' }); setTimeout(done, duration * 1000); }
  };
  const onScroll = () => { if (busy) return; clearTimeout(idle); idle = setTimeout(check, 160); };
  if (motion.lenis) motion.lenis.on('scroll', onScroll); else addEventListener('scroll', onScroll, { passive: true });
}

/* Головна без сцени (телефон, планшет): коротка пауза на Послугах — секція закріплюється на ~30 % висоти екрана,
   прокрутка м'яко примагнічується до її початку. Без prefers-reduced-motion. */
function servicesPause() {
  const svc = document.querySelector('[data-stage] .svc-section');
  // На телефоні (до 860 px) — без паузи й примагнічування: картки з'являються, сторінка гортається далі звичайно
  if (!svc || reduceMotion || matchMedia('(max-width: 860px)').matches) return;
  const top = () => (document.querySelector('.site-header')?.offsetHeight || 0) + 8;
  const st = ScrollTrigger.create({
    trigger: svc,
    start: () => `top top+=${top()}`,
    end: () => `+=${Math.round(innerHeight * 0.3)}`,
    pin: true,
    invalidateOnRefresh: true,
  });
  magnetTo(() => st.start, () => innerHeight * 0.12, 0.6);
}

/* ---------- 2. Картки, треки, номери ---------- */
function blocks() {
  const groups = motion.stage ? '.svc-full-grid, .phil-grid, .bento, .book-info, .book-how, .gallery, .chips' : '.svc-grid, .svc-full-grid, .phil-grid, .bento, .book-info, .book-how, .gallery, .chips';
  cascade($$(`:is(${groups}) > *`));
  cascade($$('.faq-list > .faq-item'), { y: 24, stagger: 0.06 });
  $$('.cta-band, .tl-text, .empty-state').forEach((el) => cascade([el], { y: 30 }));

  // Треки в'їжджають по черзі, хвиля промальовується зліва направо
  cascade($$('.tracks > .track'), {
    y: 0, x: -40,
    onEnter: (batch) => {
      if (reduceMotion) return;
      batch.forEach((track, i) => {
        const wave = track.querySelector('.track-wave');
        if (wave) gsap.fromTo(wave, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 1.2, ease: SOFT, delay: 0.15 + i * 0.08, clearProps: 'clipPath' });
      });
    },
  });

  // Чому Wave: великі номери виростають
  cascade($$('.why-grid > *'), {
    onEnter: (batch) => {
      if (reduceMotion) return;
      batch.forEach((item, i) => {
        const num = item.querySelector('.num');
        if (num) gsap.from(num, { scale: 0.35, transformOrigin: '0% 100%', duration: 1.1, ease: EASE, delay: i * 0.08, clearProps: 'transform' });
      });
    },
  });
}

/* ---------- Як це працює: кроки підсвічуються по черзі, лінія заповнюється ---------- */
// Настрій скульптури на кожному кроці; на «Записуємо» вона хвилюється найсильніше
const STEP_MOODS = [
  { amp: 0.7, spin: 0.1, x: 1.8, y: 0.85, scale: 0.5 },
  { amp: 0.95, detail: 0.15, spin: 0.3, x: 1.8, y: 0.85, scale: 0.52 },
  { amp: 1.2, detail: 0.3, spin: 0.22, x: 1.8, y: 0.85, scale: 0.54 },
  { amp: 1.9, detail: 0.7, spin: 0.45, x: 1.8, y: 0.85, scale: 0.56 },
  { amp: 0.45, spin: 0.6, x: 1.8, y: 0.85, scale: 0.6 },
];
function steps() {
  const sec = document.querySelector('[data-steps]');
  const list = sec?.querySelector('.steps');
  if (!list) return;
  const items = [...list.children];
  const dots = items.map((li) => li.querySelector('.step-dot')).filter(Boolean);
  if (dots.length < 2) return;
  /* Лінія — від центру першої точки до центру останньої (на комп'ютері по горизонталі, на телефоні по вертикалі),
     один раз за 1,8 с, power1.inOut. Лінія й доріжка лежать під колами (кола непрозорі, z-index 1), тож усередині
     кола лінії не видно. Коли голова лінії заходить під коло, воно поступово заливається з того боку, звідки прийшла
     лінія (--f від 0 до 1 → clip-path шару .step-dot::before); заливка доходить до протилежного краю саме тоді, коли
     лінія виходить з-під кола. Перше коло — від центру до краю (лінія стартує в його центрі), останнє — від краю до
     центру (там лінія зупиняється). Світіння голови (.steps-head) теж під колами й згасає наприкінці. Номер і назва
     кроку підсвічуються з початком заливки. Анімуються лише transform, opacity і clip-path. */
  const head = document.createElement('span');
  head.className = 'steps-head';
  head.setAttribute('aria-hidden', 'true');
  list.appendChild(head);
  const st = { p: reduceMotion ? 1 : 0 };
  let geo = null;
  let current = -2;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const measure = () => {
    const r = list.getBoundingClientRect();
    const rects = dots.map((d) => d.getBoundingClientRect());
    const vertical = Math.abs(rects[rects.length - 1].left - rects[0].left) < 1;
    const c = rects.map((b) => (vertical ? b.top + b.height / 2 - r.top : b.left + b.width / 2 - r.left));
    const cross = vertical ? rects[0].left + rects[0].width / 2 - r.left : rects[0].top + rects[0].height / 2 - r.top;
    const rad = (vertical ? rects[0].height : rects[0].width) / 2;
    const size = vertical ? r.height : r.width;
    list.style.setProperty('--steps-from', `${c[0].toFixed(1)}px`);
    list.style.setProperty('--steps-to', `${(size - c[c.length - 1]).toFixed(1)}px`);
    geo = { vertical, c, cross, rad };
    render();
  };
  const render = () => {
    if (!geo) return;
    const { vertical, c, cross, rad } = geo;
    const last = c.length - 1;
    const h = c[0] + (c[last] - c[0]) * st.p; // голова лінії
    list.style.setProperty('--steps-p', st.p.toFixed(4));
    let idx = -1;
    dots.forEach((d, i) => {
      const from = i === 0 ? c[0] : c[i] - rad;
      const to = i === last ? c[last] : c[i] + rad;
      const f = clamp01((h - from) / (to - from));
      d.style.setProperty('--f', f.toFixed(3));
      if (f > 0 || i === 0) idx = i;
    });
    head.style.transform = vertical ? `translate3d(${cross.toFixed(1)}px, ${h.toFixed(1)}px, 0)` : `translate3d(${h.toFixed(1)}px, ${cross.toFixed(1)}px, 0)`;
    if (idx === current) return;
    current = idx;
    items.forEach((li, i) => {
      li.classList.toggle('is-on', i <= idx);
      li.classList.toggle('is-current', i === idx);
    });
    motion.stepMood = STEP_MOODS[idx % STEP_MOODS.length];
    if (motion.hero && motion.hero.host === sec.querySelector('[data-steps-scene]')) motion.hero.setMood(motion.stepMood);
  };
  measure();
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(list);
  if (reduceMotion) return; // одразу кінцевий стан: усі кола залиті, лінія до останнього, без світіння
  // Коли блок з'являється, лінія один раз заповнюється; прокрутка назад нічого не повертає
  ScrollTrigger.create({
    trigger: list,
    start: 'top 80%',
    once: true,
    onEnter: () => {
      gsap.to(head, { opacity: 1, duration: 0.25, ease: 'power2.out' });
      gsap.to(st, {
        p: 1, duration: 1.8, ease: 'power1.inOut', onUpdate: render,
        onComplete: () => gsap.to(head, { opacity: 0, duration: 0.6, ease: 'power2.inOut' }),
      });
    },
  });
}

/* ---------- 3. Про студію ---------- */
function about() {
  const timeline = document.querySelector('.timeline');
  if (timeline) {
    if (reduceMotion) timeline.style.setProperty('--tl-p', 1);
    else gsap.fromTo(timeline, { '--tl-p': 0 }, { '--tl-p': 1, ease: 'none', scrollTrigger: { trigger: timeline, start: 'top 70%', end: 'bottom 70%', scrub: 0.4 } });
  }
  // Номери етапів: на своєму місці на лінії з першого кадру, лише проявляються й трохи виростають (окремо від тексту)
  $$('.tl-num').forEach((num) => {
    if (reduceMotion) return;
    gsap.fromTo(num, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.7, ease: EASE, clearProps: 'transform', scrollTrigger: onceAt(num.parentElement) });
  });
  // Фото етапів відкриваються маскою, всередині рамки — легкий паралакс
  $$('.tl-media').forEach((media) => {
    if (reduceMotion) return; // без руху фото видно одразу
    gsap.to(media, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.2, ease: EASE, scrollTrigger: onceAt(media), onComplete: () => gsap.set(media, { clipPath: 'none' }) });
    const inner = media.firstElementChild;
    if (inner) gsap.fromTo(inner, { yPercent: -7, scale: 1.16 }, { yPercent: 7, scale: 1.16, ease: 'none', scrollTrigger: { trigger: media, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
  // Галерея: фото рухаються з різною швидкістю всередині своїх рамок
  if (!reduceMotion) {
    const speeds = [-6, 10, -12, 8, -9, 12];
    $$('.g-item').forEach((item, i) => {
      const inner = item.firstElementChild;
      const s = speeds[i % speeds.length];
      if (inner) gsap.fromTo(inner, { yPercent: -s, scale: 1.25 }, { yPercent: s, scale: 1.25, ease: 'none', scrollTrigger: { trigger: item, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    // Фінальний заклик плавно збільшується при наближенні
    $$('.final-cta').forEach((el) => {
      gsap.fromTo(el, { scale: 0.92 }, { scale: 1, ease: 'none', clearProps: 'transform', scrollTrigger: { trigger: el, start: 'top bottom', end: 'center 60%', scrub: 0.5 } });
    });
  }
}

/* Підказка прокрутки на першому екрані: зникає, щойно почали гортати, і повертається нагорі.
   Клік — плавний перехід до наступного блоку (якір #after-hero обробляє smoothScroll). */
function scrollHint() {
  const hint = document.querySelector('[data-scroll-hint]');
  if (!hint) return;
  let hidden = false;
  const update = () => {
    const h = scrollY > 24;
    if (h !== hidden) { hidden = h; hint.classList.toggle('is-hidden', h); }
  };
  addEventListener('scroll', update, { passive: true });
  update();
}

/* ---------- 4. Біжучий рядок: швидкість від швидкості скролу, напрям — від напрямку ---------- */
function marquees() {
  $$('[data-marquee]').forEach((m) => {
    if (reduceMotion) return;
    const track = m.querySelector('.marquee-track');
    const set = track?.firstElementChild;
    if (!set) return;
    let x = 0;
    let dir = -1;
    let boost = 0;
    // Прокрутка — з події scroll: читання scrollY у кожному кадрі змушувало браузер перераховувати розкладку посеред
    // кадру, якщо розмітка щойно змінилась (поділ заголовків на рядки, поява першого екрана) — ривки
    let y = scrollY;
    addEventListener('scroll', () => { y = scrollY; }, { passive: true });
    let lastY = y;
    let visible = false;
    // Ширину одного набору слів міряємо лише при зміні розміру, а не щокадру
    let w = set.offsetWidth;
    addEventListener('resize', () => { w = set.offsetWidth; }, { passive: true });
    if (document.fonts) document.fonts.ready.then(() => { w = set.offsetWidth; });
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(m);
    gsap.ticker.add((time, deltaMs) => {
      const dt = Math.min(0.05, deltaMs / 1000);
      const v = (y - lastY) / Math.max(dt, 0.001); // px/с
      lastY = y;
      if (!visible) return;
      if (v > 5) dir = -1; else if (v < -5) dir = 1;
      boost += (Math.min(Math.abs(v) * 0.35, 900) - boost) * Math.min(1, dt * 6);
      x += dir * (60 + boost) * dt;
      if (x <= -w) x += w;
      if (x > 0) x -= w;
      gsap.set(track, { x });
    });
  });
}

/* ---------- 5. Мікровзаємодії (лише миша) ---------- */
function magnets() {
  if (!finePointer || reduceMotion) return;
  $$('.btn').forEach((btn) => {
    if (btn.closest('.lightbox')) return;
    btn.addEventListener('pointermove', (e) => {
      const r = btn.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      gsap.to(btn, { '--magx': `${(dx * 0.25).toFixed(1)}px`, '--magy': `${(dy * 0.3).toFixed(1)}px`, duration: 0.6, ease: SOFT, overwrite: 'auto' });
    });
    btn.addEventListener('pointerleave', () => gsap.to(btn, { '--magx': '0px', '--magy': '0px', duration: 0.8, ease: EASE, overwrite: 'auto' }));
  });
}

/* Живий логотип у шапці й футері: 12 смужок — міні-еквалайзер.
   Поява — смужки по черзі виростають (шапка — одразу після інтро, футер — коли з'являється на екрані);
   у спокої ледь помітно дихають; при наведенні чи фокусі по них проходить хвиля з неоновим відтінком;
   коли грає трек, реагують на спектр аналізатора (window.wrAudioLevel.freq із site.js).
   Висоту й відтінок передаємо змінними --eq і --glow (стилі .logo-bars у site.css). */
function logoEq() {
  if (reduceMotion) return;
  const logos = $$('.site-header .logo, .site-footer .logo').map((logo) => {
    const bars = $$('.logo-bars i', logo);
    return { logo, bars, st: bars.map(() => ({ grow: 0, wave: 0 })), visible: false, last: [] };
  }).filter((l) => l.bars.length);
  if (!logos.length) return;
  root.classList.add('eq-on');

  const appear = (l) => gsap.to(l.st, { grow: 1, duration: 0.9, ease: EASE, stagger: 0.05 });
  const wave = (l) => l.st.forEach((st, i) => gsap.to(st, {
    keyframes: [{ wave: 1, duration: 0.22, ease: 'sine.out' }, { wave: 0, duration: 0.5, ease: 'sine.inOut' }],
    delay: i * 0.035, overwrite: true,
  }));

  logos.forEach((l) => {
    const inFooter = !!l.logo.closest('.site-footer');
    new IntersectionObserver(([en]) => {
      l.visible = en.isIntersecting;
      // Футер: смужки виростають, коли він уперше з'являється на екрані
      if (inFooter && en.isIntersecting && !l.appeared) { l.appeared = true; appear(l); }
    }).observe(l.logo);
    // Шапка: смужки виростають лише при першому вході (після інтро). При переходах між сторінками
    // (з меню, View Transition, повторне відкриття) логотип уже на місці — не зникає й не мигає
    if (!inFooter) {
      l.appeared = true;
      if (root.classList.contains('wr-intro')) { l.st.forEach((st) => { st.grow = 0; }); motion.entered.then(() => appear(l)); }
      else l.st.forEach((st) => { st.grow = 1; });
    }
    if (finePointer) l.logo.addEventListener('mouseenter', () => wave(l));
    // Сенсорний екран: дотик до логотипа в шапці програє ту саму хвилю, що наведення мишею, і лише через ~250 мс —
    // перехід на головну (чи плавна прокрутка нагору, якщо вже на ній), щоб хвилю було видно
    if (!finePointer && !inFooter) {
      l.logo.addEventListener('click', (e) => {
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
        e.preventDefault();
        e.stopPropagation(); // homeLinks() не прокручує одразу — зробимо це самі після хвилі
        wave(l);
        const href = l.logo.href;
        const samePage = l.logo.pathname === location.pathname;
        setTimeout(() => {
          if (!samePage) { location.assign(href); return; }
          if (document.body.classList.contains('menu-open')) document.querySelector('[data-menu-toggle]')?.click();
          if (motion.lenis) motion.lenis.scrollTo(0, { duration: 1.2 });
          else scrollTo({ top: 0, behavior: 'smooth' });
        }, 250);
      });
    }
    l.logo.addEventListener('focus', () => { if (l.logo.matches(':focus-visible')) wave(l); });
  });

  gsap.ticker.add((time) => {
    const f = window.wrAudioLevel?.freq;
    for (const l of logos) {
      if (!l.visible) continue;
      l.bars.forEach((bar, i) => {
        const st = l.st[i];
        // Дихання: повільно і з малою амплітудою, щоб не відволікати
        const breathe = 0.022 * Math.sin(time * 0.9 + i * 0.55);
        const music = f ? (f[Math.min(f.length - 1, 2 + i * 4)] / 255) ** 2 : 0;
        const eq = (st.grow * (1 + breathe + st.wave * 0.32 + music * 0.45)).toFixed(3);
        const glow = Math.min(1, st.wave + music * 0.7).toFixed(2);
        if (l.last[i] !== eq + glow) {
          l.last[i] = eq + glow;
          bar.style.setProperty('--eq', eq);
          bar.style.setProperty('--glow', glow);
        }
      });
    }
  });
}

/* Меню-хвиля: темна SVG-форма з хвилястим краєм накриває екран згори донизу, сайт позаду розмивається,
   потім каскадом з'являються пункти; закриття — та сама хвиля назад угору.
   site.js викликає wrMotion.menuAnim(open) і чекає завершення (фокус, hidden). */
/* Край хвилі (меню й шторка переходу): дві кубічні дуги; y — висота краю (у % екрана), a — амплітуда, ph — фаза */
function waveDrawer(fill, edge, w) {
  return () => {
    const v = (k) => w.y + w.a * Math.sin(w.ph + k * 1.9);
    const e = (k) => v(k).toFixed(2);
    // Друга дуга починається з дзеркальної контрольної точки — стик посередині гладкий, без зламу
    const mirror = (2 * v(3) - v(2)).toFixed(2);
    const curve = `C83 ${e(1)} 67 ${e(2)} 50 ${e(3)} C33 ${mirror} 17 ${e(5)} 0 ${e(6)}`;
    fill.setAttribute('d', `M0 0 L100 0 L100 ${e(0)} ${curve} Z`);
    edge.setAttribute('d', `M100 ${e(0)} ${curve}`);
  };
}

/* Шторка переходу з меню: на новій сторінці вона опущена з першого кадру (html.from-menu). Піднімає її вбудований
   скрипт у layout.js (window.wrCurtainLift) — одразу, без очікування GSAP; код нижче — запасний варіант. */
function curtainLift() {
  // Зазвичай шторку вже піднімає вбудований скрипт у layout.js (не чекаючи GSAP) — лише дочекатися його
  if (window.wrCurtainLift) return window.wrCurtainLift.then(() => { motion.lenis?.start(); });
  const c = document.querySelector('[data-page-curtain]');
  const finish = () => {
    root.classList.remove('from-menu');
    try { sessionStorage.removeItem('wr_from_menu'); } catch { /* приватний режим */ }
  };
  if (!c) { finish(); return Promise.resolve(); }
  const fill = c.querySelector('.page-curtain-fill');
  const edge = c.querySelector('.page-curtain-edge');
  const w = { y: 112, a: 0, ph: 3.2 };
  const draw = waveDrawer(fill, edge, w);
  draw();
  motion.lenis?.stop();
  const firstPaint = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  // Чекаємо лише шрифти (не довше ~300 мс) і першу відмальовку; 3D, фото, аудіо й рідина догружаються вже після
  const fontsOrTimeout = Promise.race([fontsReady, new Promise((r) => setTimeout(r, 300))]);
  return fontsOrTimeout.then(firstPaint).then(() => new Promise((resolve) => {
    gsap.set(edge, { opacity: 0.85 });
    gsap.timeline({ onComplete: () => { finish(); motion.lenis?.start(); resolve(); } })
      .to(w, { y: -14, ph: 0, duration: 0.75, ease: 'power3.inOut', onUpdate: draw }, 0)
      .to(w, { a: 8, duration: 0.32, ease: 'sine.out' }, 0)
      .to(w, { a: 0, duration: 0.4, ease: 'sine.in' }, 0.32);
  }));
}

function menuWave() {
  const menu = document.querySelector('[data-menu]');
  if (!menu || reduceMotion) return;
  const fill = menu.querySelector('.menu-wave-fill');
  const edge = menu.querySelector('.menu-wave-edge');
  const blur = menu.querySelector('.menu-blur');
  const links = menu.querySelectorAll('.menu-links li');
  const foot = menu.querySelector('.menu-foot');
  const faqPill = menu.querySelector('.menu-faq-wrap');
  if (!fill || !edge) return;
  menu.classList.add('is-animated');
  const w = { y: -14, a: 0, ph: 0 };
  const draw = waveDrawer(fill, edge, w);
  draw();
  let tl = null;
  motion.menuAnim = (open) => new Promise((resolve) => {
    tl?.kill();
    tl = gsap.timeline();
    if (open) {
      // Пункти в'їжджають від країв екрана до центру: ліва колонка — зліва, права — справа
      // (на телефоні, в одну колонку, — знизу)
      const oneCol = matchMedia('(max-width: 640px)').matches;
      links.forEach((li, i) => gsap.set(li, oneCol ? { opacity: 0, x: 0, y: 24 } : { opacity: 0, y: 0, x: i < 3 ? -70 : 70 }));
      gsap.set(foot, { opacity: 0, y: 14 });
      if (faqPill) gsap.set(faqPill, { opacity: 0, scale: 0.85 });
      gsap.set(edge, { opacity: 0.85 });
      Object.assign(w, { y: -14, a: 0, ph: 0 });
      tl.to(blur, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 0)
        .to(w, { y: 112, ph: 3.2, duration: 0.85, ease: 'power3.inOut', onUpdate: draw }, 0)
        .to(w, { a: 9, duration: 0.4, ease: 'sine.out' }, 0)
        .to(w, { a: 0, duration: 0.45, ease: 'sine.in' }, 0.4)
        .to(edge, { opacity: 0, duration: 0.2 }, 0.68)
        .call(resolve, null, 0.6)
        .to(links, { opacity: 1, x: 0, y: 0, duration: 0.8, ease: EASE, stagger: (i) => (i % 3) * 0.08 + (i < 3 ? 0 : 0.04) }, 0.5)
        .to(foot, { opacity: 1, y: 0, duration: 0.6, ease: SOFT }, 0.8);
      // FAQ на центральній лінії — останнім, стримано (масштаб; центрування — властивість translate у CSS)
      if (faqPill) tl.to(faqPill, { opacity: 1, scale: 1, duration: 0.6, ease: SOFT }, 0.85);
    } else {
      gsap.set(edge, { opacity: 0.85 });
      tl.to([links, foot, faqPill].filter(Boolean), { opacity: 0, duration: 0.25, ease: 'power2.in', stagger: 0.02 }, 0)
        .to(w, { y: -14, ph: 0, duration: 0.7, ease: 'power3.inOut', onUpdate: draw }, 0.12)
        .to(w, { a: 8, duration: 0.32, ease: 'sine.out' }, 0.12)
        .to(w, { a: 0, duration: 0.38, ease: 'sine.in' }, 0.44)
        .to(blur, { opacity: 0, duration: 0.45, ease: 'power2.in' }, 0.4)
        .call(resolve, null, 0.85);
    }
  });
}

/* ---------- Питання та відповіді: розгортання відповіді ----------
   site.js викликає wrMotion.faqAnim(details, open) і чекає завершення (true — дійшла до кінця,
   false — перервана новим кліком). Відкриття: висота 0 → авто й проявлення (0,5 с), лінія-хвиля
   промальовується зліва направо (маска clip-path); закриття — навпаки. */
function faqAnim() {
  if (!document.querySelector('[data-faq]') || reduceMotion) return;
  const running = new WeakMap();
  motion.faqAnim = (item, open) => new Promise((resolve) => {
    const panel = item.querySelector('.faq-a');
    const wave = item.querySelector('.faq-wave');
    const body = item.querySelector('.faq-a-body');
    if (!panel) { resolve(true); return; }
    // Попередня анімація цього питання (клік посеред руху) зупиняється там, де була
    const from = panel.style.height ? panel.offsetHeight : 0;
    running.get(item)?.kill();
    const end = (ok) => () => resolve(ok);
    let tl;
    if (open) {
      tl = gsap.timeline({ onComplete: end(true), onInterrupt: end(false) })
        .fromTo(panel, { height: from }, { height: 'auto', duration: 0.5, ease: 'power3.inOut', clearProps: 'height' }, 0)
        .fromTo(body, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.45, ease: SOFT, clearProps: 'transform' }, 0.1)
        .fromTo(wave, { clipPath: 'inset(-4px 100% -4px 0)' }, { clipPath: 'inset(-4px 0% -4px 0)', duration: 0.6, ease: 'power2.inOut' }, 0);
    } else {
      tl = gsap.timeline({ onComplete: () => { gsap.set([panel, body, wave], { clearProps: 'all' }); resolve(true); }, onInterrupt: end(false) })
        .to(body, { opacity: 0, duration: 0.25, ease: 'power2.in' }, 0)
        .to(wave, { clipPath: 'inset(-4px 100% -4px 0)', duration: 0.4, ease: 'power2.inOut' }, 0)
        .fromTo(panel, { height: panel.offsetHeight }, { height: 0, duration: 0.45, ease: 'power3.inOut' }, 0.05);
    }
    running.set(item, tl);
  });
}

/* ---------- Інтро при першому вході в сесії ----------
   Логотип із 12 смужок грає, як еквалайзер, смужки стискаються в лінію, лінія стає хвилею,
   а потім розкривається — дві темні половини роз'їжджаються і відкривають перший екран.
   Лічильник 0–100 показує справжнє завантаження: шрифти і (на головній) three.js зі сценою.
   Прелоадер триває не довше 2 с; «Пропустити», будь-який клік чи Esc закривають інтро одразу. */
function intro() {
  const el = document.querySelector('[data-intro]');
  if (!el || !root.classList.contains('wr-intro')) { el?.remove(); return Promise.resolve(); }
  motion.lenis?.stop();
  const logoImg = el.querySelector('.logo-img');
  const logoBars = el.querySelector('.logo-bars');
  const bars = $$('.logo-bars i', el);
  const line = el.querySelector('.intro-line');
  const path = line.querySelector('path');
  const count = el.querySelector('.intro-count');
  const halves = [el.querySelector('.intro-top'), el.querySelector('.intro-bottom')];

  // Що вантажимо насправді
  const tasks = [document.fonts ? document.fonts.ready : Promise.resolve()];
  if (motion.heroReady) tasks.push(motion.heroReady);
  let loaded = 0;
  tasks.forEach((p) => p.then(() => { loaded++; }, () => { loaded++; }));

  // Лінія-хвиля: синусоїда з обвідною, амплітуда a (0 — пряма лінія)
  const wave = { a: 0, ph: 0 };
  const drawWave = () => {
    let d = '';
    for (let i = 0; i <= 60; i++) {
      const x = (i / 60) * 1000;
      const env = Math.sin((Math.PI * i) / 60);
      const y = 100 + wave.a * 70 * env * Math.sin(i * 0.42 + wave.ph);
      d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    path.setAttribute('d', d);
  };

  gsap.set(logoImg, { opacity: 0 });
  gsap.set(logoBars, { opacity: 1 });
  gsap.set(bars, { transformOrigin: '50% 50%' });
  const t0 = performance.now();
  const shown = { v: 0 };
  const eq = gsap.timeline();
  eq.from(logoBars, { opacity: 0, scale: 0.94, duration: 0.4, ease: SOFT })
    .to(bars, { scaleY: () => gsap.utils.random(0.3, 1.35), duration: 0.16, ease: 'sine.inOut', repeat: 7, yoyo: true, stagger: { each: 0.02, from: 'random' } }, 0.25);

  return new Promise((resolve) => {
    let closing = false;
    const counter = () => {
      // Поки задача вантажиться, лічильник повзе до наступної позначки, але не перескакує її
      const elapsed = (performance.now() - t0) / 1000;
      const part = loaded < tasks.length ? Math.min(0.85, elapsed / 1.3) : 0;
      const target = ((loaded + part) / tasks.length) * 100;
      shown.v += (target - shown.v) * 0.15;
      count.textContent = String(Math.min(100, Math.round(shown.v)));
    };
    gsap.ticker.add(counter);

    const finish = (fast = false) => {
      if (closing) return;
      closing = true;
      gsap.ticker.remove(counter);
      eq.kill();
      cleanupInput();
      const tl = gsap.timeline({
        onComplete: () => {
          root.classList.remove('wr-intro');
          el.remove();
          motion.lenis?.start();
          resolve();
        },
      });
      tl.to(shown, { v: 100, duration: fast ? 0.15 : 0.35, ease: SOFT, onUpdate: () => { count.textContent = String(Math.round(shown.v)); } }, 0);
      if (!fast) {
        // Смужки стискаються в лінію, лінія вигинається хвилею і знову випрямляється
        tl.to(bars, { scaleY: 0.03, duration: 0.3, ease: 'power3.in', stagger: { each: 0.012, from: 'center' } }, 0)
          .to(logoBars, { opacity: 0, duration: 0.2 }, 0.22)
          .fromTo(line, { opacity: 0, scaleX: 0.2 }, { opacity: 1, scaleX: 1, duration: 0.35, ease: SOFT }, 0.2)
          .to(wave, { a: 1, ph: 3, duration: 0.3, ease: 'sine.out', onUpdate: drawWave }, 0.35)
          .to(wave, { a: 0, ph: 5, duration: 0.25, ease: 'sine.in', onUpdate: drawWave }, 0.65);
      }
      // Лінія розкривається: половини роз'їжджаються, відкриваючи перший екран
      const at = fast ? 0.05 : 0.88;
      tl.to(count, { opacity: 0, duration: 0.25 }, at - 0.1)
        .to(el.querySelector('.intro-skip'), { opacity: 0, duration: 0.2 }, at - 0.1)
        .to(halves[0], { yPercent: -100, duration: fast ? 0.55 : 0.9, ease: 'expo.inOut' }, at)
        .to(halves[1], { yPercent: 100, duration: fast ? 0.55 : 0.9, ease: 'expo.inOut' }, at)
        .to(line, { opacity: 0, scaleY: 3, duration: 0.5, ease: SOFT }, at + 0.1)
        .to(el.querySelector('.intro-logo'), { opacity: 0, duration: 0.2 }, at);
    };

    // Прелоадер: щонайменше ~0,9 с (щоб еквалайзер встиг зіграти), щонайбільше 2 с
    Promise.all(tasks.map((p) => p.catch(() => {}))).then(() => {
      const wait = Math.max(0, 900 - (performance.now() - t0));
      setTimeout(() => finish(), wait);
    });
    setTimeout(() => finish(), 2000);

    const skip = () => finish(true);
    const onKey = (e) => { if (e.key === 'Escape') skip(); };
    el.addEventListener('click', skip);
    addEventListener('keydown', onKey);
    const cleanupInput = () => { el.removeEventListener('click', skip); removeEventListener('keydown', onKey); };
  });
}

/* Поділ рядка на літери без зсуву. Окремі літери втрачають кернінг (пари AV, WA…): розбитий WAVE RECORDS
   ширший за цілий на ~8 px, і після split.revert() центрований рядок стискався — краї стрибали на ~4 px.
   Тому до поділу запам'ятовуємо, де стоїть кожна літера в цілому рядку, а після — ставимо кожну на те саме
   місце відступом (в em, щоб пережити зміну розміру). Тоді розбитий і цілий рядок однакові до долі пікселя. */
function splitCharsKerned(line) {
  const range = document.createRange();
  const before = [];
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode());) {
    for (let i = 0; i < node.length; i++) {
      if (/\s/.test(node.data[i])) continue;
      range.setStart(node, i); range.setEnd(node, i + 1);
      before.push(range.getBoundingClientRect().left);
    }
  }
  const split = SplitText.create(line, { type: 'chars', mask: 'chars' });
  const chars = split.chars;
  if (chars.length !== before.length) return split;
  const fs = parseFloat(getComputedStyle(line).fontSize) || 1;
  // Відступ літери i зсуває всі наступні, тож міряємо по черзі, відносно першої літери
  for (let i = 1; i < chars.length; i++) {
    const box = chars[i].parentElement !== line && chars[i].parentElement.childElementCount === 1 ? chars[i].parentElement : chars[i];
    const delta = (before[i] - before[0]) - (chars[i].getBoundingClientRect().left - chars[0].getBoundingClientRect().left);
    if (Math.abs(delta) > 0.01) box.style.marginLeft = `${delta / fs}em`;
  }
  return split;
}

/* Поява першого екрана (його «назва сторінки»): викликає диригент після інтро чи шторки.
   Текст і 3D-сцена проявляються разом, один раз; якщо сцена ще не готова — проявиться, щойно буде.
   Літери WAVE RECORDS виїжджають знизу, далі решта.
   Рух — Web Animations (не GSAP): браузер веде такі анімації transform/opacity окремо від основного потоку, тож вони
   плавні, навіть коли основний потік зайнятий 3D-сценою, що якраз стартує. Раніше GSAP міняв transform кожної літери
   з основного потоку, і на кожному кадрі великі літери з тінню перемальовувались — поява йшла ривками. */
const RISE_EASE = 'cubic-bezier(.19, 1, .22, 1)'; // ≈ expo.out
// Затримка — частина самої анімації (утримання початкового кадру), а не delay: так усі анімації активні з першого
// кадру й одразу йдуть окремими шарами; із delay кожна вмикалась пізніше окремо, і в ті кадри браузер перераховував
// стилі й шари (на слабкому процесорі — ривок на ~0,37 с). Траєкторія й таймінг ті самі: easing на відрізку руху.
// Прозорість 0 → 0,001 (оком не відрізнити): з нульовою браузер зовсім не малює елемент, і скляна кнопка
// (backdrop-filter) уперше потрапляла на екран посеред руху — відеокарта компілювала для неї шейдер ~90 мс,
// кадр пропускався. Так усе малюється з першого кадру, ще до того, як щось помітно рушить.
function rise(els, from0, { duration, delay = 0, stagger = 0 }) {
  const from = from0.opacity === 0 ? { ...from0, opacity: 0.001 } : from0;
  return [...els].filter(Boolean).map((el, i) => {
    const wait = (delay + i * stagger) * 1000;
    const total = wait + duration * 1000;
    const hold = wait / total;
    const frames = hold > 0
      ? [{ ...from, offset: 0 }, { ...from, offset: hold, easing: RISE_EASE }, { opacity: 1, transform: 'none' }]
      : [{ ...from, easing: RISE_EASE }, { opacity: 1, transform: 'none' }];
    return el.animate?.(frames, { duration: total, easing: 'linear' });
  }).filter(Boolean);
}
// Рух першого екрана закінчився (або його немає) — для відкладеного запуску 3D-сцени без інтро
let openHeroGate;
const heroGate = new Promise((r) => { openHeroGate = r; });
function heroIntro(still = false) {
  const intro = document.querySelector('[data-hero-intro]');
  const host = document.querySelector('[data-hero-scene]');
  const revealScene = () => host?.classList.add('is-ready');
  if (!intro) { openHeroGate(); motion.heroReady?.then(revealScene); return; }
  const show = () => { intro.classList.add('is-in'); motion.heroReady?.then(revealScene); };
  if (!gsap || reduceMotion || still) { openHeroGate(); show(); return; }
  const line1 = intro.querySelector('.hero-l1');
  const rest = intro.querySelectorAll('.hero-l2, .hero-sub, .hero-ctas');
  // Коли рух першого екрана закінчився — для conductor(): решту сторінки він готує вже після цього
  // Перші кадри — початковий стан на паузі: браузер уперше малює рядки й кнопки (скло з backdrop-filter — компіляція
  // шейдера на відеокарті до ~120 мс), і лише через три кадри, коли відеокарта це відмалювала, починається рух.
  // Інакше ця пауза відеокарти припадала на перші кадри руху літер — помітний ривок на старті
  const settle = (anims) => {
    anims.forEach((a) => a.pause());
    const play = (n) => requestAnimationFrame(() => (n ? play(n - 1) : anims.forEach((a) => a.play())));
    play(2);
    motion.heroMoved = Promise.allSettled(anims.map((a) => a.finished));
    motion.heroMoved.then(openHeroGate);
    return anims;
  };
  {
    show();
    if (gentle(intro)) {
      settle(rise([line1, ...rest], { opacity: 0, transform: `translateY(${GENTLE_Y}px)` }, { duration: 0.8, stagger: 0.06 }));
      return;
    }
    // На телефоні рядок не ділимо на літери: при поділі змінюється кернінг і ширина рядка (~2 px), а після анімації
    // (split.revert) центрований рядок «стрибав» на кілька пікселів. Там рядок виїжджає цілим
    const phone = matchMedia('(max-width: 860px)').matches;
    const split = SplitText && line1 && !phone ? splitCharsKerned(line1) : null;
    const letters = split
      ? rise(split.chars, { opacity: 1, transform: 'translateY(110%)' }, { duration: 1.2, stagger: 0.035 })
      : rise([line1], { opacity: 0, transform: 'translateY(40px)' }, { duration: 1.1 });
    const lines = rise(rest, { opacity: 0, transform: 'translateY(28px)' }, { duration: 1, delay: split ? 0.35 : 0.2, stagger: 0.1 });
    settle([...letters, ...lines]);
    // Літери повертаються в цілий рядок, коли браузер вільний: це зміна розмітки з перерахунком розкладки
    // (на слабкому процесорі ~15 мс) — не в останньому кадрі руху. Літери стоять на тих самих місцях (splitCharsKerned),
    // тож на екрані нічого не змінюється
    if (split) motion.heroMoved.then(() => idle(() => split.revert(), 400));
  }
}

/* 3D-скульптура (public/js/hero3d.js): на першому екрані, а на комп'ютері ще й у секції «Як це працює».
   three.js вантажиться лише тут, динамічним import(), одразу після запуску motion.js.
   Проміс завершується, коли сцена вже відрендерила кілька анімованих кадрів (canvas ще прихований),
   або коли вирішено показати статичний кадр (без WebGL, prefers-reduced-motion, помилка). */
// Лише перевірка наявності API: окремий пробний WebGL-контекст коштує стільки ж, скільки справжній
// (сотні мілісекунд на слабких пристроях). Якщо контекст не створиться, createHeroScene кине помилку → статичний кадр.
const hasWebGL = () => !!window.WebGLRenderingContext;
async function heroScene() {
  const host = document.querySelector('[data-hero-scene]');
  if (!host) return;
  const fallback = () => host.classList.add('is-fallback'); // статичний кадр проявить heroIntro()
  if (reduceMotion || !hasWebGL()) { fallback(); return; }
  const mobile = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
  // Слабкі пристрої: мало ядер чи пам'яті — менша деталізація і без згладжування
  const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  let hero;
  try {
    const { createHeroScene } = await import('./hero3d.js');
    hero = await createHeroScene(host, { mobile, weak });
  } catch (err) {
    console.warn('3D-сцена недоступна, лишаю статичний кадр', err);
    fallback();
    return;
  }
  motion.hero = hero;

  // Де показувати: перший екран, а коли він пішов — секція кроків (лише на широкому екрані)
  const stepsHost = wide && !mobile ? document.querySelector('[data-steps-scene]') : null;
  let heroVisible = true;
  let stepsVisible = false;
  const sync = () => {
    if (heroVisible || !stepsVisible || !stepsHost) {
      hero.attach(host);
      hero.useScroll = true;
      hero.setMood({});
    } else {
      hero.attach(stepsHost);
      hero.useScroll = false;
      hero.setMood(motion.stepMood || STEP_MOODS[0]);
    }
    // Рендер лише коли скульптуру видно (перший екран не прихований Послугами) і вкладка активна
    const onHero = heroVisible && !motion.heroCovered;
    (onHero || (stepsVisible && stepsHost)) && !document.hidden ? hero.start() : hero.stop();
  };
  motion.heroSync = sync;
  new IntersectionObserver(([en]) => { heroVisible = en.isIntersecting; sync(); }).observe(host);
  if (stepsHost) new IntersectionObserver(([en]) => { stepsVisible = en.isIntersecting; sync(); }).observe(stepsHost);
  document.addEventListener('visibilitychange', sync);
  let resizeT;
  addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { hero.resize(); if (!hero.running) hero.renderOnce(); }, 120);
  }, { passive: true });

  // Скрол: поки перший екран їде вгору, скульптура віддаляється, зменшується і зміщується
  await motion.stageReady;
  if (ScrollTrigger && !motion.stage) {
    ScrollTrigger.create({
      trigger: host.closest('.hero') || host,
      start: 'top top',
      end: 'bottom top',
      onUpdate: (st) => hero.setScroll(st.progress),
    });
  }
  sync();
  // Чекаємо кілька відрендерених кадрів анімації (або 1,5 с, якщо сцена поза екраном чи вкладка неактивна)
  const t0 = performance.now();
  await new Promise((resolve) => {
    (function check() {
      if (hero.frames >= 4 || !hero.running || performance.now() - t0 > 1500) resolve();
      else requestAnimationFrame(check);
    })();
  });
  if (!hero.running) hero.renderOnce();
}

/* ---------- Запуск ---------- */
// Коли браузер вільний (не пізніше timeout мс); fn отримує deadline з requestIdleCallback (або null)
function idle(fn, timeout = 200) {
  if ('requestIdleCallback' in window) requestIdleCallback((deadline) => fn(deadline), { timeout }); else setTimeout(() => fn(null), 16);
}
// Після першої відмальовки, коли браузер вільний (запасний варіант — setTimeout)
function afterFirstPaint() {
  return revealed.then(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(() => {
    if ('requestIdleCallback' in window) requestIdleCallback(resolve, { timeout: 700 }); else setTimeout(resolve, 120);
  }, 0))));
}

/* Логотип: на головній — плавно нагору без перезавантаження; при наведенні на посилання на головну
   заздалегідь вантажимо сторінку і модулі three.js, щоб перехід був миттєвим */
function homeLinks() {
  const home = (a) => a && a.origin === location.origin && /\/$/.test(a.pathname) && document.querySelector('.site-header .logo')?.pathname === a.pathname;
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!home(a) || a.pathname !== location.pathname || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    if (a.closest('[data-menu]')) return; // пункт меню на поточну сторінку просто закриває меню (site.js)
    e.preventDefault();
    if (document.body.classList.contains('menu-open')) document.querySelector('[data-menu-toggle]')?.click();
    if (motion.lenis) motion.lenis.scrollTo(0, { duration: 1.2 });
    else scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  });
  let warmed = false;
  const warm = (e) => {
    const a = e.target.closest?.('a');
    if (warmed || !home(a) || a.pathname === location.pathname) return;
    warmed = true;
    const add = (rel, href, as) => { const l = document.createElement('link'); l.rel = rel; l.href = href; if (as) l.as = as; document.head.appendChild(l); };
    add('prefetch', a.href, 'document');
    for (const m of ['./hero3d.js', '../vendor/three.module-0.187.0.min.js', '../vendor/three.core-0.187.0.min.js']) add('modulepreload', new URL(m, import.meta.url).href.replace(/\?.*$/, ''));
  };
  addEventListener('pointerover', warm, { passive: true });
  addEventListener('focusin', warm);
}

/* ---------- Диригент завантаження ----------
   Чітка послідовність, без таймерів:
     1) перша відмальовка — стани з першого кадру задають класи з <head> (wr-anim, wr-intro, from-menu);
     2) вхід — інтро (перше відвідування) | шторка з меню (from-menu) | View Transition (звичайне посилання) | нічого;
     3) лише після повного завершення входу — назва сторінки (перший екран на головній);
     4) за мить — решта контенту.
   Запобіжник із <head> (wrArmFailsafe) починає відлік лише після входу: якщо поява не почалась за 3 с — усе видно.
   Якщо сторінку вже показав запобіжник (html.wr-failsafe), поява не запускається — текст не ховається повторно. */
async function entrance() {
  await revealed;
  if (root.classList.contains('wr-intro')) return motion.introDone;
  if (root.classList.contains('from-menu')) {
    // Контент починає з'являтися вже під час підйому шторки (за ~0,1 с після його початку), а не після нього
    const lifted = curtainLift();
    if (!window.wrCurtainLifting) return lifted;
    await window.wrCurtainLifting;
    return new Promise((r) => setTimeout(r, 100));
  }
  const vt = window.wrViewTransition;
  if (vt) { try { await vt.finished; } catch { /* перехід пропущено */ } }
  return undefined;
}
async function conductor() {
  await motion.entered;
  if (failed()) { staticPage(); return; }
  // Поява вже почалась: запобіжник не показує заголовок, поки чекаємо шрифт (інакше — запасним шрифтом, а потім стрибок)
  motion.contentStarted = true;
  window.wrArmFailsafe?.();
  await fontsForTitle; // рядки ділимо за справжніми шрифтами (див. fontsForTitle)
  await motion.stageReady; // headings(), blocks() і plainFade() мають знати, чи працює сцена Послуг
  // Головна: перший екран займає весь екран — решта сторінки нижче і поки невидима
  const hero = document.querySelector('.hero [data-hero-intro]') && document.querySelector('.hero');
  const heroFills = !!hero && hero.getBoundingClientRect().bottom >= innerHeight - 2;
  // Вхід щойно завершився (інтро запускає Lenis, шторка — свій рух) — поява стартує з наступного кадру, окремою
  // задачею: інакше перший кадр руху чекав на всю роботу кінця входу (на слабкому процесорі — 50+ мс)
  await new Promise((r) => requestAnimationFrame(() => r()));
  heroIntro();
  pageTitle();
  // Решта — слідом за назвою, щоб рух був шаруватим
  await new Promise((r) => setTimeout(r, GENTLE ? 60 : titleEl() ? 300 : 120));
  // Підготовка решти (поділ заголовків на рядки, твіни, ScrollTrigger) — це десятки мілісекунд основного потоку
  // (×4 повільніший процесор — понад 300 мс). Посеред появи WAVE RECORDS вона крала кадри: ривок на ~0,13 с руху.
  // На головній її невидно, поки перший екран не прокрутили, тож готуємо її, коли рух першого екрана закінчився
  // (або одразу, щойно людина почала прокручувати), і частинами, з паузами між ними
  const jobs = [];
  headings((fn) => jobs.push(fn));
  jobs.push(steps, blocks, about, plainFade);
  if (heroFills && motion.heroMoved) {
    await Promise.race([motion.heroMoved, scrollIntent()]);
    await runIdle(jobs);
  } else jobs.forEach(runJob);
  ScrollTrigger.sort();
  ScrollTrigger.refresh();
}
function runJob(fn) {
  try { fn(); } catch (err) { console.error(err); showAll(); }
}
// Виконати роботи невеликими порціями, коли браузер вільний між кадрами (кожна — кілька мілісекунд),
// не пізніше ніж за 150 мс на порцію; людина почала прокручувати — решта одразу
function runIdle(jobs) {
  return new Promise((resolve) => {
    let rush = false;
    scrollIntent().then(() => { rush = true; });
    const tick = (deadline) => {
      do runJob(jobs.shift());
      while (jobs.length && (rush || (deadline && deadline.timeRemaining() > 6)));
      if (jobs.length) idle(tick, 150); else resolve();
    };
    if (jobs.length) idle(tick, 150); else resolve();
  });
}
// Людина почала прокручувати (колесо, дотик, клавіші, прокрутка) — проміс одразу виконується
function scrollIntent() {
  return new Promise((resolve) => {
    const types = ['wheel', 'touchstart', 'keydown', 'scroll'];
    const go = () => { types.forEach((t) => removeEventListener(t, go, true)); resolve(); };
    types.forEach((t) => addEventListener(t, go, { capture: true, passive: true }));
  });
}

// Запобіжник із <head> уже показав сторінку без анімації (клас wr-failsafe) — нічого не ховаємо повторно
const failed = () => root.classList.contains('wr-failsafe');
function staticPage() {
  motion.contentStarted = true;
  showAll();
  heroIntro(true);
}
function showAll() {
  root.classList.remove('wr-anim', 'wr-intro', 'from-menu');
  try { sessionStorage.removeItem('wr_from_menu'); } catch { /* приватний режим */ }
  document.querySelector('[data-intro]')?.remove();
}
try {
  if (!gsap || !ScrollTrigger) throw new Error('GSAP не завантажився');
  gsap.registerPlugin(...[ScrollTrigger, SplitText].filter(Boolean));
  smoothScroll();
  homeLinks();
  // 3D-сцена: під час інтро вантажиться одразу (лічильник показує її завантаження) і проявляється разом із текстом.
  // Без інтро (повторний візит, перехід з меню) — лише коли рух першого екрана закінчився (heroGate) або людина почала
  // прокручувати: підготовка three.js і шейдерів — сотні мілісекунд основного потоку, перший рендер — до ~120 мс,
  // і посеред появи WAVE RECORDS це були пропущені кадри (до 100 мс). Текст сцену не чекає, вона проявляється слідом
  const sceneHost = document.querySelector('[data-hero-scene]');
  if (sceneHost) {
    const start = () => heroScene().catch(() => sceneHost.classList.add('is-fallback'));
    const gate = () => Promise.race([heroGate, scrollIntent(), new Promise((r) => setTimeout(r, 6000))]);
    motion.heroReady = root.classList.contains('wr-intro') ? start() : afterFirstPaint().then(gate).then(start);
  }
  motion.introDone = intro();
  motion.entered = reduceMotion ? Promise.resolve() : entrance();
  scrollHint();
  // Сцена Послуг і згасання першого екрана лише задають стани, прив'язані до прокрутки (без появи).
  // Чи вміщаються Послуги в екран — міряємо зі справжніми шрифтами (не довше 2 с): Safari часто отримує шрифти
  // пізніше, а запасний шрифт на Mac інший — секція здавалася вищою за екран, і виліт вимикався до кінця візиту.
  motion.stage = false;
  motion.stageReady = Promise.race([fontsForTitle, new Promise((r) => setTimeout(r, 2000))]).then(() => {
    try { motion.stage = servicesStage(); } catch (err) { console.error(err); root.classList.remove('stage-on'); motion.stage = false; }
    if (!motion.stage) { heroFadeStandalone(); servicesPause(); }
    ScrollTrigger.refresh();
  });
  marquees();
  magnets();
  menuWave();
  faqAnim();
  logoEq();
  motion.ready = true;
  if (failed()) {
    // motion.js запустився надто пізно, сторінку вже показано — лишаємо як є, без появ
    staticPage();
  } else if (reduceMotion) {
    // Без руху: усе видно одразу, жодних появ
    motion.contentStarted = true;
    heroIntro();
    steps();
    about();
  } else {
    conductor().catch((err) => { console.error(err); showAll(); });
  }
} catch (err) {
  console.error('Анімації вимкнено:', err);
  showAll();
  document.querySelector('[data-hero-intro]')?.classList.add('is-in');
  document.querySelector('[data-hero-scene]')?.classList.add('is-fallback', 'is-ready');
  motion.ready = true;
}

if (ScrollTrigger) addEventListener('load', () => ScrollTrigger.refresh());
