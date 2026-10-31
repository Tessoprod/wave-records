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
   Сенсорні екрани: без власного курсора й магнітних кнопок, секція кроків — без закріплення. */

const { gsap, ScrollTrigger, SplitText, Lenis } = window;
const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const wide = matchMedia('(min-width: 861px)').matches;

const EASE = 'expo.out';
const SOFT = 'power3.out';
const motion = window.wrMotion = { gsap, ScrollTrigger, SplitText, lenis: null, reduceMotion, hero: null, heroReady: null, introDone: Promise.resolve(), stepMood: null, ready: false };
// Сторінку відкрито через View Transition: заголовок уже перетік на місце, повторно його не анімуємо
const cameByTransition = () => root.classList.contains('vt-in');

/* ---------- Плавний скрол ---------- */
function smoothScroll() {
  if (!gsap || !ScrollTrigger || !Lenis || reduceMotion) return;
  // Відступ під шапку для якорів — той самий, що й scroll-padding-top у site.css
  const headerOffset = () => -(parseFloat(getComputedStyle(root).scrollPaddingTop) || 0);
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

/* ---------- Допоміжне ---------- */
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const notInDialog = (el) => !el.closest('dialog, [hidden]');
// Один раз при першій появі; якщо елемент уже вище екрана — анімація відбувається одразу
const onceAt = (trigger, start = 'top 88%') => ({ trigger, start, once: true });

/* Проявити групу елементів каскадом, коли вони доїжджають до екрана */
function cascade(items, { y = 40, x = 0, stagger = 0.08, onEnter } = {}) {
  if (!items.length) return;
  gsap.set(items, { opacity: 0, y: reduceMotion ? 0 : y, x: reduceMotion ? 0 : x });
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

/* ---------- 1. Заголовки й тексти ---------- */
function headings() {
  $$('main .h1, main .h2').filter(notInDialog).filter((el) => !(el.tagName === 'H1' && cameByTransition())).forEach((el) => {
    if (reduceMotion || !SplitText) {
      gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.8, ease: SOFT, scrollTrigger: onceAt(el, 'top 92%') });
      return;
    }
    gsap.set(el, { opacity: 1 });
    // Рядки виїжджають знизу з маски; після анімації розмітка повертається до звичайної
    const split = SplitText.create(el, { type: 'lines', mask: 'lines' });
    gsap.from(split.lines, {
      yPercent: 105, duration: 1, ease: EASE, stagger: 0.08,
      scrollTrigger: onceAt(el, 'top 92%'),
      onComplete: () => split.revert(),
    });
  });
  $$('main .page-lead, main .sec-lead, main .sec-sub, main .chapter').filter(notInDialog).forEach((el) => {
    gsap.fromTo(el, { opacity: 0, y: reduceMotion ? 0 : 18 }, {
      opacity: 1, y: 0, duration: 0.9, ease: SOFT, delay: 0.1, clearProps: 'transform',
      scrollTrigger: onceAt(el, 'top 94%'),
    });
  });
}

/* ---------- 2. Картки, треки, номери ---------- */
function blocks() {
  cascade($$(':is(.svc-grid, .svc-full-grid, .phil-grid, .bento, .book-info, .gallery, .chips) > *'));
  $$('.book-embed, .cta-band, .tl-text, .empty-state').forEach((el) => cascade([el], { y: 30 }));

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
  let current = -1;
  const setStep = (p) => {
    list.style.setProperty('--steps-p', p.toFixed(3));
    const idx = Math.max(0, Math.min(items.length - 1, Math.floor(p * items.length)));
    if (idx === current) return;
    current = idx;
    items.forEach((li, i) => {
      li.classList.toggle('is-on', i <= idx);
      li.classList.toggle('is-current', i === idx);
    });
    motion.stepMood = STEP_MOODS[idx % STEP_MOODS.length];
    if (motion.hero && motion.hero.host === sec.querySelector('[data-steps-scene]')) motion.hero.setMood(motion.stepMood);
  };
  if (reduceMotion) { setStep(1); return; }
  setStep(0);
  if (wide) {
    // Комп'ютер: секція закріплюється, а скрол проводить через 5 кроків
    sec.classList.add('is-pinned');
    ScrollTrigger.create({
      trigger: sec, start: 'top top', end: () => `+=${Math.round(innerHeight * 1.6)}`,
      pin: true, anticipatePin: 1,
      onUpdate: (st) => setStep(st.progress),
    });
  } else {
    // Телефон: без закріплення — кроки підсвічуються, поки список проходить через екран
    ScrollTrigger.create({ trigger: list, start: 'top 75%', end: 'bottom 55%', onUpdate: (st) => setStep(st.progress) });
  }
}

/* ---------- 3. Про студію ---------- */
function about() {
  const timeline = document.querySelector('.timeline');
  if (timeline) {
    if (reduceMotion) timeline.style.setProperty('--tl-p', 1);
    else gsap.fromTo(timeline, { '--tl-p': 0 }, { '--tl-p': 1, ease: 'none', scrollTrigger: { trigger: timeline, start: 'top 70%', end: 'bottom 70%', scrub: 0.4 } });
  }
  // Фото етапів відкриваються маскою, всередині рамки — легкий паралакс
  $$('.tl-media').forEach((media) => {
    if (reduceMotion) {
      gsap.set(media, { clipPath: 'none' });
      gsap.from(media, { opacity: 0, duration: 0.8, scrollTrigger: onceAt(media) });
      return;
    }
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
    let lastY = scrollY;
    let visible = false;
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(m);
    gsap.ticker.add((time, deltaMs) => {
      const dt = Math.min(0.05, deltaMs / 1000);
      const v = (scrollY - lastY) / Math.max(dt, 0.001); // px/с
      lastY = scrollY;
      if (!visible) return;
      if (v > 5) dir = -1; else if (v < -5) dir = 1;
      boost += (Math.min(Math.abs(v) * 0.35, 900) - boost) * Math.min(1, dt * 6);
      const w = set.offsetWidth;
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

function cursor() {
  if (!finePointer || reduceMotion) return;
  const c = document.createElement('div');
  c.className = 'cursor';
  c.setAttribute('aria-hidden', 'true');
  c.innerHTML = '<span class="cursor-label"></span>';
  document.body.appendChild(c);
  root.classList.add('has-cursor');
  const label = c.firstElementChild;
  gsap.set(c, { xPercent: -50, yPercent: -50 });
  const xTo = gsap.quickTo(c, 'x', { duration: 0.35, ease: SOFT });
  const yTo = gsap.quickTo(c, 'y', { duration: 0.35, ease: SOFT });
  let first = true;
  const update = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (first) { gsap.set(c, { x: e.clientX, y: e.clientY }); first = false; }
    xTo(e.clientX);
    yTo(e.clientY);
    const t = e.target instanceof Element ? e.target : null;
    // Над полями вводу та iframe запису — системний курсор
    const native = !t || t.closest('input, textarea, select, iframe, [contenteditable="true"]');
    c.classList.toggle('is-visible', !native);
    const text = t?.closest('.track') ? 'Play' : t?.closest('.g-open') ? 'Відкрити' : '';
    if (text) label.textContent = text;
    c.classList.toggle('is-label', !!text);
    c.classList.toggle('is-link', !text && !!t?.closest('a, button, label, summary, [role="slider"], [role="button"]'));
  };
  addEventListener('pointermove', update, { passive: true });
  addEventListener('pointerover', update, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => c.classList.remove('is-visible'));
}

/* Пункти меню: літери прокручуються при наведенні (дві копії тексту, друга — під першою) */
function menuRoll() {
  if (!finePointer || reduceMotion) return;
  $$('.menu-links a').forEach((a) => {
    const text = a.textContent.trim();
    if (!text || a.querySelector('.roll')) return;
    const copy = (cls) => {
      const s = document.createElement('span');
      s.className = cls;
      s.setAttribute('aria-hidden', 'true');
      [...text].forEach((ch, i) => {
        const c = document.createElement('span');
        c.className = 'roll-c';
        c.style.setProperty('--i', i);
        c.textContent = ch;
        s.appendChild(c);
      });
      return s;
    };
    const roll = document.createElement('span');
    roll.className = 'roll';
    roll.append(copy('roll-a'), copy('roll-b'));
    a.setAttribute('aria-label', text);
    a.textContent = '';
    a.appendChild(roll);
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
  el.style.animation = 'none'; // CSS-запобіжник більше не потрібен
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

/* Поява заголовка першого екрана: літери WAVE RECORDS виїжджають знизу, далі підзаголовок і кнопки.
   До початку анімації текст схований (html.js у site.css); без анімацій — просто показуємо. */
function heroIntro() {
  const intro = document.querySelector('[data-hero-intro]');
  if (!intro) return;
  const show = () => intro.classList.add('is-in');
  if (!gsap || reduceMotion || cameByTransition()) { show(); return; }
  const line1 = intro.querySelector('.hero-l1');
  const rest = intro.querySelectorAll('.hero-l2, .hero-sub, .hero-ctas');
  const run = () => {
    show();
    const split = SplitText && line1 ? SplitText.create(line1, { type: 'chars', mask: 'chars' }) : null;
    const tl = gsap.timeline({ defaults: { ease: EASE }, onComplete: () => split?.revert() });
    if (split) tl.from(split.chars, { yPercent: 110, duration: 1.2, stagger: 0.035 });
    else if (line1) tl.from(line1, { y: 40, opacity: 0, duration: 1.1 });
    tl.from(rest, { y: 28, opacity: 0, duration: 1, stagger: 0.1 }, split ? 0.35 : 0.2);
  };
  // Літери ділимо після завантаження шрифтів (інакше їхня ширина буде хибною) і після інтро
  Promise.all([document.fonts ? document.fonts.ready : null, motion.introDone]).then(run);
}

/* 3D-скульптура (public/js/hero3d.js): на першому екрані, а на комп'ютері ще й у секції «Як це працює».
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
    // Рендер лише коли скульптуру видно і вкладка активна
    (heroVisible || (stepsVisible && stepsHost)) && !document.hidden ? hero.start() : hero.stop();
  };
  new IntersectionObserver(([en]) => { heroVisible = en.isIntersecting; sync(); }).observe(host);
  if (stepsHost) new IntersectionObserver(([en]) => { stepsVisible = en.isIntersecting; sync(); }).observe(stepsHost);
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

/* ---------- Запуск ---------- */
function showAll() {
  root.classList.remove('wr-anim', 'wr-intro');
  document.querySelector('[data-intro]')?.remove();
}
try {
  if (!gsap || !ScrollTrigger) throw new Error('GSAP не завантажився');
  gsap.registerPlugin(...[ScrollTrigger, SplitText].filter(Boolean));
  smoothScroll();
  // Під час інтро 3D-сцена вантажиться одразу — лічильник показує саме її завантаження
  if (root.classList.contains('wr-intro') && document.querySelector('[data-hero-scene]')) motion.heroReady = heroScene();
  motion.introDone = intro();
  heroIntro();
  // Кроки — першими: закріплення змінює позиції всіх наступних тригерів
  steps();
  blocks();
  about();
  marquees();
  magnets();
  cursor();
  menuRoll();
  // Заголовки ділимо на рядки після завантаження шрифтів
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    try { headings(); } catch (err) { console.error(err); showAll(); }
    ScrollTrigger.sort();
    ScrollTrigger.refresh();
  });
  motion.introDone.then(() => ScrollTrigger.refresh());
  motion.ready = true;
} catch (err) {
  console.error('Анімації вимкнено:', err);
  showAll();
  document.querySelector('[data-hero-intro]')?.classList.add('is-in');
  motion.ready = true;
}

// Після першого відображення: коли браузер вільний (або щонайпізніше за 1.5 с після завантаження)
const afterPaint = (fn) => {
  const go = () => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
};
if (!motion.heroReady) afterPaint(heroScene);
if (ScrollTrigger) addEventListener('load', () => ScrollTrigger.refresh());
