/* Wave Records — динамічний фон: стрічки звукових хвиль, точки й зерно з паралаксом.
   Шари (від дальнього до ближнього):
     .bg-dots   — сітка точок, при прокрутці зсувається найповільніше (CSS transform);
     canvas     — дві групи стрічок хвиль: дальні (повільні, тьмяні) і ближні;
     .bg-grain  — статичне зерно, згенероване один раз.
   Коли грає трек, site.js кладе рівень звуку у window.wrAudioLevel ({ bass, mid, high } від 0 до 1),
   і амплітуда хвиль м'яко на нього реагує. */
(() => {
  'use strict';
  const host = document.querySelector('[data-bg]');
  if (!host) return;
  const canvas = host.querySelector('canvas');
  const dots = host.querySelector('.bg-dots');
  const grain = host.querySelector('.bg-grain');
  const ctx = canvas && canvas.getContext && canvas.getContext('2d');
  if (!ctx) return; // без canvas лишається CSS-градієнт .bg
  // Скляна хвиля на головній (site.js) бере цей canvas як «фон за склом» і заломлює його
  const shared = window.wrBg = { canvas, dotsY: 0 };

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = matchMedia('(max-width: 760px)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const mobile = small || coarse;
  const DPR = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5);
  const FRAME_MS = mobile ? 1000 / 30 : 0; // на телефонах ~30 кадрів/с

  /* ---------- Зерно: генеруємо один раз, далі це звичайна CSS-картинка ---------- */
  if (grain) {
    const g = document.createElement('canvas');
    g.width = g.height = 140;
    const gc = g.getContext('2d');
    if (gc) {
      const img = gc.createImageData(140, 140);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      gc.putImageData(img, 0, 0);
      grain.style.backgroundImage = `url(${g.toDataURL()})`;
    }
  }

  /* ---------- Стрічки хвиль ----------
     depth: 0 — дальня (повільна при прокрутці, тьмяніша), 1 — ближня. */
  const PINK = [255, 46, 154];
  const CYAN = [0, 229, 255];
  const GREY = [220, 222, 228];
  const ribbonsAll = [
    { depth: 0, y: 0.22, color: GREY, alpha: 0.11, amp: 0.05, strands: 4, spread: 7, speed: 0.06, freq: [1.3, 2.9, 5.1], seed: 0.4 },
    { depth: 0, y: 0.58, color: CYAN, alpha: 0.09, amp: 0.07, strands: 5, spread: 9, speed: 0.05, freq: [1.1, 2.3, 4.4], seed: 2.1 },
    { depth: 0, y: 0.92, color: PINK, alpha: 0.12, amp: 0.06, strands: 4, spread: 8, speed: 0.07, freq: [0.9, 2.6, 4.9], seed: 4.7 },
    { depth: 1, y: 0.36, color: PINK, alpha: 0.19, amp: 0.09, strands: 6, spread: 11, speed: 0.09, freq: [0.8, 1.9, 3.7], seed: 1.3 },
    { depth: 1, y: 0.74, color: GREY, alpha: 0.1, amp: 0.06, strands: 5, spread: 8, speed: 0.08, freq: [1.2, 2.7, 6.1], seed: 3.3 },
    { depth: 1, y: 1.12, color: CYAN, alpha: 0.08, amp: 0.08, strands: 5, spread: 10, speed: 0.1, freq: [1, 2.2, 4.1], seed: 5.9 },
  ];
  // На телефонах — менше стрічок і ниток у кожній
  const ribbons = mobile
    ? ribbonsAll.filter((_, i) => i !== 0 && i !== 4).map((r) => ({ ...r, strands: Math.max(3, r.strands - 2) }))
    : ribbonsAll;
  const PARALLAX = [0.12, 0.32]; // наскільки швидко зсуваються дальні й ближні стрічки при прокрутці
  const DOTS_PARALLAX = 0.05;
  const DOT_STEP = 32; // має збігатися з background-size у .bg-dots

  let W = 0;
  let H = 0;
  function resize() {
    W = innerWidth;
    H = innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  const rgba = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
  const level = { bass: 0, mid: 0 };

  function drawRibbon(r, t, scroll) {
    const span = H * 1.5;
    // Паралакс із «загортанням»: стрічка, що пішла вгору, повертається знизу за межами екрана
    const shift = scroll * PARALLAX[r.depth];
    const baseY = ((((r.y * H - shift) % span) + span) % span) - H * 0.25;
    if (baseY < -H * 0.3 || baseY > H * 1.3) return;
    const phase = t * r.speed + scroll * 0.0012 * (r.depth + 1) + r.seed;
    const react = 1 + level.bass * 0.9 + level.mid * 0.4; // музика м'яко збільшує амплітуду
    // На вузьких екранах хвилі нижчі й довші, щоб не ставали «пилкою»
    const amp = r.amp * Math.min(H, W * 0.75) * react;
    const fs = Math.min(1, Math.max(0.4, W / 1440));
    const step = mobile ? 14 : 10;
    const [f1, f2, f3] = r.freq.map((f) => f * fs);

    // Колір згасає до країв екрана
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, rgba(r.color, 0));
    grad.addColorStop(0.25, rgba(r.color, r.alpha));
    grad.addColorStop(0.75, rgba(r.color, r.alpha));
    grad.addColorStop(1, rgba(r.color, 0));

    for (let s = 0; s < r.strands; s++) {
      const k = s / Math.max(1, r.strands - 1) - 0.5; // -0.5…0.5 — позиція нитки в стрічці
      const off = k * r.spread;
      const twist = 1 - Math.abs(k) * 0.5;
      ctx.beginPath();
      for (let x = -step; x <= W + step; x += step) {
        const u = x / W;
        const env = Math.sin(Math.PI * Math.min(1, Math.max(0, u * 0.9 + 0.05))) ** 0.7;
        const y = baseY + off * (1 + Math.sin(u * 3 + phase) * 0.6)
          + amp * env * twist * (
            Math.sin(u * Math.PI * 2 * f1 + phase)
            + 0.45 * Math.sin(u * Math.PI * 2 * f2 - phase * 1.3 + k)
            + 0.2 * Math.sin(u * Math.PI * 2 * f3 + phase * 2.1)
          );
        if (x === -step) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = grad;
      ctx.lineWidth = s === Math.floor(r.strands / 2) ? 1.6 : 1;
      ctx.globalAlpha = 0.55 + 0.45 * (1 - Math.abs(k) * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function draw(t, scroll) {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    for (const r of ribbons) drawRibbon(r, t, scroll);
    ctx.globalCompositeOperation = 'source-over';
    shared.dotsY = -(scroll * DOTS_PARALLAX) % DOT_STEP;
    if (dots) dots.style.transform = `translate3d(0, ${shared.dotsY.toFixed(2)}px, 0)`;
  }

  resize();
  // Плавна прокрутка для фону: фаза й паралакс «доганяють» реальну прокрутку, без ривків
  let scrollShown = scrollY;
  draw(12, reduceMotion ? 0 : scrollShown);
  host.classList.add('is-ready');

  if (reduceMotion) {
    // Один статичний кадр: без анімації і паралаксу; лише перемальовуємо при зміні розміру
    addEventListener('resize', () => { resize(); draw(12, 0); }, { passive: true });
    return;
  }

  let raf = 0;
  let last = 0;
  let time = 12;
  let prev = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (FRAME_MS && now - last < FRAME_MS) return;
    last = now;
    const dt = Math.min(0.1, (now - prev) / 1000);
    prev = now;
    time += dt;
    const a = window.wrAudioLevel;
    level.bass += ((a ? a.bass : 0) - level.bass) * 0.12;
    level.mid += ((a ? a.mid : 0) - level.mid) * 0.12;
    scrollShown += (scrollY - scrollShown) * 0.18;
    draw(time, scrollShown);
  }
  const start = () => { if (!raf) { prev = performance.now(); raf = requestAnimationFrame(frame); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  let resizeT;
  addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { resize(); draw(time, scrollShown); }, 120);
  }, { passive: true });
  // Пауза, коли вкладка неактивна
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  if (!document.hidden) start();
})();
