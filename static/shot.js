// Скріншоти сайту для перевірки верстки (потрібен запущений перегляд: npm run preview).
//
//   node static/shot.js about 1440,1024,390,360 --full
//   node static/shot.js home 390 --height=844
// (у Git Bash пишіть назву без скісних рисок — about, а не /about/)
//
// Відкриває сторінку в headless Microsoft Edge (або Chrome) з точною шириною екрана
// (звичайний --window-size у headless не дає вікно вужче ~500 px) і зберігає PNG у _shots/.
// --full     — уся сторінка від верху до низу (інакше лише перший екран).
// --height=N — висота екрана, за замовчуванням 900 (для ширини < 800 — 844).
// --cookies  — не ховати банер cookies.
// --tag=X    — префікс назви файлу: _shots/X-about-390.png.
// --hover=S  — навести мишу на перший елемент за CSS-селектором S (стан наведення); з --full не поєднується.
// --intro    — показати інтро першого входу (за замовчуванням воно пропускається, щоб знімати саму сторінку).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_shots');
const BASE = process.env.PREVIEW_URL || 'http://localhost:4000';
const PORT = 9333;

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}`));
const [pageArg = '/', widthsArg = '1440,1024,390,360'] = args.filter((a) => !a.startsWith('--'));
// Сторінку можна вказати і без скісних рисок: home, about, services
const page = pageArg === 'home' ? '/' : pageArg.startsWith('/') ? pageArg : `/${pageArg}/`;
const widths = widthsArg.split(',').map(Number).filter(Boolean);
const full = !!flag('full');
const fixedHeight = Number((flag('height') || '').split('=')[1]) || 0;
const tag = (flag('tag') || '').split('=')[1];
const hover = (flag('hover') || '').split('=').slice(1).join('=');
const name = page.replace(/^\/|\/$/g, '').replace(/[\/?#=&]+/g, '-') || 'home';

const browser = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge',
].find((p) => fs.existsSync(p));
if (!browser) { console.error('Не знайдено Microsoft Edge або Google Chrome.'); process.exit(1); }

// Один тимчасовий профіль браузера — у _shots/.profile (не в %TEMP%, де профілі накопичуються); після зйомки видаляється
const profile = path.join(OUT, '.profile');
fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(profile, { recursive: true });
const proc = spawn(browser, ['--headless=new', '--hide-scrollbars', '--disable-gpu', '--no-first-run',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const target = list.find((t) => t.type === 'page');
      if (target) return target.webSocketDebuggerUrl;
    } catch { /* браузер ще стартує */ }
    await sleep(200);
  }
  throw new Error('Браузер не відповідає');
}

let ws;
let nextId = 1;
const waiting = new Map();
const listeners = [];
function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => waiting.set(id, { resolve, reject }));
}
const once = (method) => new Promise((resolve) => listeners.push({ method, resolve }));

try {
  ws = new WebSocket(await connect());
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && waiting.has(msg.id)) {
      const w = waiting.get(msg.id); waiting.delete(msg.id);
      msg.error ? w.reject(new Error(msg.error.message)) : w.resolve(msg.result);
    } else if (msg.method) {
      const i = listeners.findIndex((l) => l.method === msg.method);
      if (i >= 0) listeners.splice(i, 1)[0].resolve(msg.params);
    }
  };
  await send('Page.enable');
  // Інтро показується раз на сесію — позначаємо, що вже бачили, щоб знімати саму сторінку
  if (!flag('intro')) await send('Page.addScriptToEvaluateOnNewDocument', { source: "try { sessionStorage.setItem('wr_intro', '1') } catch (e) {}" });
  fs.mkdirSync(OUT, { recursive: true });

  for (const width of widths) {
    const height = fixedHeight || (width < 800 ? 844 : 900);
    const mobile = width < 800;
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    const loaded = once('Page.loadEventFired');
    await send('Page.navigate', { url: BASE + page });
    await loaded;
    await send('Runtime.evaluate', {
      expression: `document.fonts.ready.then(() => {
        ${flag('cookies') ? '' : "document.querySelectorAll('.consent').forEach((el) => el.remove());"}
        return document.documentElement.scrollWidth;
      })`,
      awaitPromise: true,
    });
    // 3D-сцена на головній запускається після завантаження — чекаємо її (або запасний кадр), до 12 с
    await send('Runtime.evaluate', {
      expression: `new Promise((ok) => { const t0 = Date.now(); (function wait() {
        const h = document.querySelector('[data-hero-scene]');
        if (!h || h.matches('.is-ready, .is-fallback') || Date.now() - t0 > 12000) return ok(true);
        setTimeout(wait, 100); })(); })`,
      awaitPromise: true,
    });
    await sleep(page === '/' ? 2200 : 600); // на головній — ще й поява заголовка
    if (full) {
      // Анімації на скролі запускаються при першій появі: прогортаємо сторінку донизу й назад
      await send('Runtime.evaluate', {
        expression: `(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms));
          for (let y = 0; y <= document.documentElement.scrollHeight; y += innerHeight * 0.5) { scrollTo(0, y); window.wrMotion?.lenis?.scrollTo(y, { immediate: true }); await w(150); }
          await w(1500); scrollTo(0, 0); window.wrMotion?.lenis?.scrollTo(0, { immediate: true }); await w(600); })()`,
        awaitPromise: true,
      });
    }
    if (hover) {
      const { result: pos } = await send('Runtime.evaluate', {
        expression: `(() => { const el = document.querySelector(${JSON.stringify(hover)}); if (!el) return null;
          el.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = el.getBoundingClientRect();
          return [r.left + r.width * 0.7, r.top + r.height * 0.3]; })()`,
        returnByValue: true,
      });
      if (!pos.value) throw new Error(`немає елемента ${hover}`);
      await sleep(300);
      for (const k of [0.4, 0.7, 1]) {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.value[0] * k + (1 - k) * width / 2, y: pos.value[1] });
        await sleep(60);
      }
      await sleep(700);
    }
    const { result } = await send('Runtime.evaluate', { expression: 'document.documentElement.scrollWidth' });
    const { cssContentSize } = await send('Page.getLayoutMetrics');
    const shotHeight = full ? Math.ceil(cssContentSize.height) : height;
    const { result: scrolled } = await send('Runtime.evaluate', { expression: 'scrollY' });
    const shotY = full ? 0 : scrolled.value;
    const { data } = await send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: full,
      clip: { x: 0, y: shotY, width, height: shotHeight, scale: 1 },
    });
    const file = path.join(OUT, `${tag ? tag + '-' : ''}${name}${hover ? '-hover' : ''}-${width}.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    const overflow = result.value > width ? `  ⚠️ сторінка ширша за екран: ${result.value}px` : '';
    console.log(`📸 ${path.relative(ROOT, file)} (${width}×${shotHeight})${overflow}`);
  }
} catch (err) {
  console.error(`Не вдалося зробити скріншот: ${err.message}. Чи запущено перегляд (npm run preview)?`);
  process.exitCode = 1;
} finally {
  ws?.close();
  proc.kill();
  await sleep(500);
  // Браузер може ще кілька секунд тримати файли профілю — пробуємо видалити кілька разів
  for (let i = 0; i < 10; i++) {
    try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(500); }
  }
}
