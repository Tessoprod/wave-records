/* Wave Records — «застигла хвиля з рідкого скла» на першому екрані головної.
   Завантажується з motion.js динамічним import() після першого відображення сторінки.

   Сцена:
     • хвиля — процедурна геометрія: 2D-профіль поперечного перерізу (пологий підйом → гребінь → губа,
       що закручується вперед і вниз у трубку) з товщиною — зовнішня й внутрішня лінії; профіль протягнуто
       вздовж осі X, і хвиля поступово закручується сильніше до правого краю, де видно трубку-завиток;
     • висота гребеня вздовж довжини повторює форму звукової хвилі (peaks першого треку з data-peaks
       або згенерована форма); коли грає трек, гребінь у реальному часі м'яко реагує на спектр аналізатора;
     • матеріал — рідке скло MeshPhysicalMaterial (transmission, dispersion — райдужні краї, легка iridescence,
       майже білий attenuationColor, тож без синього відтінку води);
     • неон: рожеве світло й світне ядро в глибині завитка, ціанове контрове світло й френелівський відтінок
       на гребені та краю губи; делікатний bloom (EffectComposer + UnrealBloomPass);
     • край губи розсипається на бризки (THREE.Points із власним шейдером), клік розбризкує жменю крапель;
     • за склом — темний задник із тонкими лініями, щоб заломлення було видно.

   createHeroScene(host) повертає об'єкт стану. motion.js:
     • прив'язує скрол першого екрана (setScroll, useScroll): хвиля повертається завитком і віддаляється;
     • переносить canvas в інший контейнер (attach) — так хвиля супроводжує секцію «Як це працює»;
     • задає «настрій» (setMood): amp — сила гребеня й бризок, detail — кількість бризок, spin — розмах повороту,
       x, y — зсув у кадрі (частки півширини/піввисоти), scale — масштаб. Настрій змінюється плавно. */

import * as THREE from '../vendor/three.module-0.187.0.min.js';
import { EffectComposer } from '../vendor/three.EffectComposer-0.187.0.js';
import { RenderPass } from '../vendor/three.RenderPass-0.187.0.js';
import { UnrealBloomPass } from '../vendor/three.UnrealBloomPass-0.187.0.js';
import { OutputPass } from '../vendor/three.OutputPass-0.187.0.js';

const PINK = new THREE.Color('#FF2E9A');
const CYAN = new THREE.Color('#00E5FF');
const DARK = new THREE.Color('#111111');
const AUDIO_N = 24; // скільки ділянок гребеня реагує на музику

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

/* ---------- Форма звукової хвилі для гребеня ---------- */
function soundShape(n) {
  // peaks першого треку на сторінці (0…100 через кому), інакше — згенерована «запис голосу»
  const raw = (document.querySelector('[data-peaks]')?.dataset.peaks || '').split(',').map(Number).filter(Number.isFinite);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    out[i] = raw.length > 8
      ? raw[Math.floor(x * (raw.length - 1))] / 100
      : 0.55 + 0.25 * Math.sin(x * 17.0 + 1.1) + 0.18 * Math.sin(x * 41.0 + 0.4) + 0.12 * Math.sin(x * 7.0);
  }
  // Згладжуємо, щоб гребінь був пологим, а не пилкою
  for (let pass = 0; pass < 3; pass++) {
    const c = out.slice();
    for (let i = 1; i < n - 1; i++) out[i] = (c[i - 1] + c[i] * 2 + c[i + 1]) / 4;
  }
  let min = Infinity; let max = -Infinity;
  out.forEach((v) => { min = Math.min(min, v); max = Math.max(max, v); });
  return out.map((v) => (max > min ? (v - min) / (max - min) : 0.5));
}

/* ---------- Профіль поперечного перерізу ----------
   Замкнений контур [u, v] (u — вперед, куди котиться хвиля; v — вгору) і параметри кожної точки:
   s — від основи (0) до кінчика губи (1), inner — 1 для внутрішньої лінії. */
function profile(curl, h, nLine, nCap) {
  const cu = 0.35;
  const r0 = 0.52 * h;
  const cv = h - r0; // центр завитка
  const line = [];
  const nSlope = Math.round(nLine * 0.42);
  const nCurl = nLine - nSlope;
  // Пологий підйом: кубічна крива від основи до гребеня, біля гребеня — горизонтально
  const P = [[-1.9, -0.1], [-1.05, 0.05], [cu - 0.85, h], [cu, h]];
  for (let i = 0; i < nSlope; i++) {
    const t = i / nSlope;
    const a = (1 - t) ** 3; const b = 3 * (1 - t) ** 2 * t; const c = 3 * (1 - t) * t * t; const d = t ** 3;
    line.push([a * P[0][0] + b * P[1][0] + c * P[2][0] + d * P[3][0], a * P[0][1] + b * P[1][1] + c * P[2][1] + d * P[3][1]]);
  }
  // Губа: спіраль навколо центру завитка, радіус поступово зменшується
  const thetaEnd = Math.PI / 2 - curl * Math.PI * 1.45;
  for (let j = 0; j <= nCurl; j++) {
    const p = j / nCurl;
    const th = mix(Math.PI / 2, thetaEnd, p);
    const r = r0 * (1 - 0.42 * p);
    line.push([cu + r * Math.cos(th), cv + r * Math.sin(th)]);
  }
  // Довжина по лінії → s від 0 до 1
  const acc = [0];
  for (let i = 1; i < line.length; i++) acc.push(acc[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  const total = acc[acc.length - 1];
  const S = acc.map((a) => a / total);
  // Дотичні й нормалі (назовні — ліворуч від напрямку руху)
  const T = line.map((_, i) => {
    const a = line[Math.max(0, i - 1)]; const b = line[Math.min(line.length - 1, i + 1)];
    const dx = b[0] - a[0]; const dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  });
  const N = T.map(([x, y]) => [-y, x]);
  // Товщина скла: товсте біля основи, тонке на кінчику губи
  const thick = S.map((s) => mix(mix(0.62, 0.42, smooth(0, 0.45, s)), 0.06, smooth(0.55, 1, s) ** 1.3));

  const pts = []; const sArr = []; const inner = [];
  const L = line.length;
  // Зовнішня лінія: основа → кінчик
  for (let i = 0; i < L; i++) { pts.push(line[i]); sArr.push(S[i]); inner.push(0); }
  // Заокруглений кінчик губи
  {
    const i = L - 1; const t = thick[i] / 2;
    const c = [line[i][0] - N[i][0] * t, line[i][1] - N[i][1] * t];
    for (let k = 1; k < nCap; k++) {
      const a = (k / nCap) * Math.PI;
      pts.push([c[0] + (N[i][0] * Math.cos(a) + T[i][0] * Math.sin(a)) * t, c[1] + (N[i][1] * Math.cos(a) + T[i][1] * Math.sin(a)) * t]);
      sArr.push(1); inner.push(0.5);
    }
  }
  // Внутрішня лінія: кінчик → основа
  for (let i = L - 1; i >= 0; i--) {
    pts.push([line[i][0] - N[i][0] * thick[i], line[i][1] - N[i][1] * thick[i]]);
    sArr.push(S[i]); inner.push(1);
  }
  // Заокруглена основа
  {
    const t = thick[0] / 2;
    const c = [line[0][0] - N[0][0] * t, line[0][1] - N[0][1] * t];
    for (let k = 1; k < nCap; k++) {
      const a = (k / nCap) * Math.PI;
      pts.push([c[0] + (-N[0][0] * Math.cos(a) - T[0][0] * Math.sin(a)) * t, c[1] + (-N[0][1] * Math.cos(a) - T[0][1] * Math.sin(a)) * t]);
      sArr.push(0); inner.push(0.5);
    }
  }
  return { pts, s: sArr, inner, tip: line[L - 1], center: [cu, cv], radius: r0 };
}

/* ---------- Геометрія хвилі ---------- */
function buildWave({ lineN, capN, lenN, length }) {
  const shape = soundShape(lenN + 1);
  const pos = []; const aS = []; const aX = []; const aIn = [];
  const tips = []; const cores = [];
  const slices = [];
  let M = 0;
  for (let j = 0; j <= lenN; j++) {
    const xn = (j / lenN) * 2 - 1; // −1 … 1
    const x = (xn * length) / 2;
    // Ліворуч хвиля лише перекидається, праворуч — закручується в трубку
    const curl = mix(0.32, 1.0, smooth(-0.85, 0.75, xn));
    const env = mix(0.62, 1, smooth(-1, 0.2, xn));
    const h = 1.75 * env * (0.86 + 0.26 * shape[j]);
    const pr = profile(curl, h, lineN, capN);
    M = pr.pts.length;
    slices.push(pr);
    pr.pts.forEach(([u, v], i) => {
      pos.push(x, v, u);
      aS.push(pr.s[i]); aX.push(j / lenN); aIn.push(pr.inner[i]);
    });
    tips.push([x, pr.tip[1], pr.tip[0]]);
    cores.push([x, pr.center[1], pr.center[0], pr.radius, curl]);
  }
  const index = [];
  for (let j = 0; j < lenN; j++) {
    for (let i = 0; i < M; i++) {
      const a = j * M + i; const b = j * M + ((i + 1) % M);
      const c = (j + 1) * M + i; const d = (j + 1) * M + ((i + 1) % M);
      index.push(a, c, b, b, c, d);
    }
  }
  // Торці: плоскі «зрізи» профілю (праворуч якраз видно переріз трубки)
  for (const [j, side] of [[0, -1], [lenN, 1]]) {
    const pr = slices[j];
    const x = (((j / lenN) * 2 - 1) * length) / 2;
    const base = pos.length / 3;
    const contour = pr.pts.map(([u, v]) => new THREE.Vector2(u, v));
    pr.pts.forEach(([u, v], i) => { pos.push(x, v, u); aS.push(pr.s[i]); aX.push(j / lenN); aIn.push(pr.inner[i]); });
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const [p, q, r] of tris) index.push(...(side > 0 ? [base + p, base + q, base + r] : [base + p, base + r, base + q]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
  g.setAttribute('aX', new THREE.Float32BufferAttribute(aX, 1));
  g.setAttribute('aIn', new THREE.Float32BufferAttribute(aIn, 1));
  g.setIndex(index);
  g.computeVertexNormals();
  // Нормалі мають дивитися назовні: перевіряємо на гребені посередині й за потреби перевертаємо трикутники
  const mid = Math.floor(lenN / 2) * M + Math.round(lineN * 0.42);
  if (g.attributes.normal.getY(mid) < 0) {
    const idx = g.index.array;
    for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
    g.computeVertexNormals();
  }
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return { geometry: g, tips, cores };
}

/* Підйом гребеня від музики й дихання — спільний для скла і бризок */
const LIFT = /* glsl */`
uniform float uTime;
uniform float uAmp;
uniform float uAudio[${AUDIO_N}];
float wrAudioAt(float x){
  float f = clamp(x, 0.0, 1.0) * float(${AUDIO_N - 1});
  int i = int(floor(f));
  int k = min(i + 1, ${AUDIO_N - 1});
  return mix(uAudio[i], uAudio[k], fract(f));
}
float wrLift(float x, float s){
  float crest = smoothstep(0.32, 0.72, s);
  float breathe = 0.012 * sin(uTime * 0.7 + x * 5.0);
  // Настрій «сильніше» (uAmp > 1) колише гребінь і без музики
  float surge = max(uAmp - 1.0, 0.0) * 0.06 * (0.5 + 0.5 * sin(uTime * 1.4 - x * 9.0));
  return crest * (breathe + surge + uAmp * 0.22 * wrAudioAt(x));
}`;

/* Задник: темний, з тонкими горизонтальними лініями-«доріжками» і ледь помітним неоновим світлом.
   Його видно крізь скло заломленим. */
function makeBackdrop(dark = 1) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      // Тонова корекція (OutputPass) затемнює кадр, тож основу задника беремо світлішою — на виході виходить #111111
      uniforms: { uTime: { value: 0 }, uPink: { value: PINK }, uCyan: { value: CYAN }, uDark: { value: DARK.clone().multiplyScalar(dark) }, uAspect: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform float uTime, uAspect; uniform vec3 uPink, uCyan, uDark; varying vec2 vUv;
        void main(){
          vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * 2.0;
          vec3 col = uDark;
          col += uPink * 0.03 * exp(-pow(length(p - vec2(0.45, -0.15)) / 0.6, 2.0));
          col += uCyan * 0.005 * exp(-pow(length(p - vec2(-0.6, 0.45)) / 0.5, 2.0));
          // Тонкі лінії, як доріжки в DAW, ледь хвилясті
          float y = p.y + 0.03 * sin(p.x * 3.0 + uTime * 0.2);
          float lines = smoothstep(0.012, 0.0, abs(fract(y * 6.0) - 0.5) - 0.48);
          col += vec3(0.85, 0.9, 1.0) * lines * 0.008 * smoothstep(1.6, 0.3, length(p));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
      depthWrite: false,
    }),
  );
}

/* Оточення для відблисків: темна «кімната» з рожевим і ціановим світлом і двома софтбоксами */
function makeEnvironment(renderer) {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.SphereGeometry(10, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { uPink: { value: PINK }, uCyan: { value: CYAN } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform vec3 uPink, uCyan; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          vec3 col = vec3(0.01) + vec3(0.025) * (d.y * 0.5 + 0.5);
          col += uPink * 0.9 * pow(max(dot(d, normalize(vec3(0.8, -0.2, 0.6))), 0.0), 8.0);
          col += uCyan * 0.45 * pow(max(dot(d, normalize(vec3(-0.6, 0.7, -0.4))), 0.0), 10.0);
          col += vec3(2.6) * smoothstep(0.94, 0.975, dot(d, normalize(vec3(-0.5, 0.75, 0.6))));
          col += vec3(1.2) * smoothstep(0.955, 0.985, dot(d, normalize(vec3(0.6, 0.5, 0.7))));
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  env.add(room);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.02);
  pmrem.dispose();
  room.geometry.dispose();
  room.material.dispose();
  return rt.texture;
}

/* Бризки з краю губи: безперервно відлітають уперед і вгору, згасають; розмір і яскравість — від музики */
function makeSpray(tips, count, sharedUniforms) {
  const g = new THREE.BufferGeometry();
  const origin = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  const color = new Float32Array(count * 3);
  const ax = new Float32Array(count);
  const white = new THREE.Color(0xf5f7ff);
  for (let i = 0; i < count; i++) {
    // Більше бризок там, де хвиля закручена сильніше (праворуч)
    const t = Math.pow(Math.random(), 0.6);
    const j = Math.min(tips.length - 1, Math.floor(t * tips.length));
    origin.set(tips[j], i * 3);
    ax[i] = j / (tips.length - 1);
    seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    const r = Math.random();
    const c = r < 0.06 ? PINK : r < 0.32 ? CYAN : white;
    color.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('position', new THREE.BufferAttribute(origin, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  g.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  g.setAttribute('aX', new THREE.BufferAttribute(ax, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: sharedUniforms.uTime, uAmp: sharedUniforms.uAmp, uAudio: sharedUniforms.uAudio, uPulse: { value: 0 }, uDensity: { value: 1 }, uPx: { value: 1 } },
    vertexShader: /* glsl */`
      ${LIFT}
      uniform float uPulse, uDensity, uPx;
      attribute vec4 aSeed; attribute vec3 aColor; attribute float aX;
      varying vec3 vColor; varying float vAlpha;
      void main(){
        float life = 1.6 + aSeed.w * 1.4;
        float age = fract((uTime + aSeed.x * 10.0) / life);
        float t = age * life;
        vec3 vel = vec3((aSeed.y - 0.5) * 0.18, 0.28 + aSeed.z * 0.45, 0.25 + aSeed.y * 0.5);
        vec3 p = position + vec3(0.0, wrLift(aX, 1.0), 0.0) + vel * t + vec3(0.0, -0.22, 0.0) * t * t;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float on = step(aSeed.z, uDensity); // частина бризок «вмикається» лише з музикою чи настроєм
        vAlpha = on * smoothstep(0.0, 0.08, age) * (1.0 - age) * (0.3 + 0.45 * uPulse);
        vColor = aColor;
        float breathe = 0.85 + 0.15 * sin(uTime * 0.9 + aSeed.x * 6.28);
        gl_PointSize = (0.8 + aSeed.w * 1.6) * breathe * (1.0 + uPulse * 0.9) * uPx * (9.0 / -mv.z);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor; varying float vAlpha;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vAlpha;
        gl_FragColor = vec4(vColor * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(g, material);
}

/* Краплі від кліку: розлітаються з точки дотику, падають під дією гравітації й зникають */
function makeSplash(count, sharedUniforms) {
  const g = new THREE.BufferGeometry();
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: sharedUniforms.uTime, uSplash: { value: new THREE.Vector4(0, 0, 0, -10) }, uNormal: { value: new THREE.Vector3(0, 1, 0) }, uPx: { value: 1 } },
    vertexShader: /* glsl */`
      uniform float uTime, uPx; uniform vec4 uSplash; uniform vec3 uNormal;
      attribute vec4 aSeed; varying float vAlpha; varying float vTint;
      void main(){
        float age = uTime - uSplash.w;
        vec3 dir = normalize(vec3(aSeed.x - 0.5, aSeed.y - 0.5, aSeed.z - 0.5) * 1.6 + uNormal * 1.1 + vec3(0.0, 0.6, 0.0));
        float speed = 0.7 + aSeed.w * 1.3;
        vec3 p = uSplash.xyz + dir * speed * age + vec3(0.0, -2.2, 0.0) * age * age;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float alive = step(0.0, age) * step(age, 1.4);
        vAlpha = alive * (1.0 - age / 1.4);
        vTint = aSeed.y;
        gl_PointSize = alive * (1.2 + aSeed.z * 2.4) * uPx * (9.0 / -mv.z);
      }`,
    fragmentShader: /* glsl */`
      varying float vAlpha; varying float vTint;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vAlpha;
        vec3 c = vTint > 0.8 ? vec3(0.0, 0.9, 1.0) : vec3(0.96, 0.97, 1.0);
        gl_FragColor = vec4(c * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, material);
  pts.frustumCulled = false;
  return pts;
}

export function createHeroScene(host, { mobile = false, weak = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile && !weak, alpha: false, powerPreference: 'high-performance' });
  const DPR = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(DARK, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Transmission — найдорожчий ефект: на телефонах і слабких пристроях рахуємо його в меншій роздільності
  renderer.transmissionResolutionScale = mobile || weak ? 0.5 : 1;
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.environment = makeEnvironment(renderer);
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 80);
  camera.position.set(0, 0.6, 12);
  camera.lookAt(0, 0, 0);

  const backdrop = makeBackdrop(2.35);
  backdrop.position.z = -5;
  scene.add(backdrop);

  /* Хвиля */
  const LENGTH = 4.6;
  const { geometry, tips, cores } = buildWave({
    lineN: weak ? 90 : mobile ? 110 : 150,
    capN: 8,
    lenN: weak ? 90 : mobile ? 120 : 200,
    length: LENGTH,
  });
  const uniforms = {
    uTime: { value: 0 },
    uAmp: { value: 1 },
    uAudio: { value: new Array(AUDIO_N).fill(0) },
    uPress: { value: new THREE.Vector4(0, 0, 0, 0) },
    uRim: { value: CYAN.clone().multiplyScalar(0.38) },
    uCore: { value: PINK.clone().multiplyScalar(0.28) },
  };
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.05,
    transmission: 1,
    thickness: 0.7,
    ior: 1.45,
    dispersion: 5,
    iridescence: 0.25,
    iridescenceIOR: 1.3,
    iridescenceThicknessMinimum: 120,
    iridescenceThicknessMaximum: 400,
    clearcoat: 0.6,
    clearcoatRoughness: 0.05,
    specularIntensity: 1,
    envMapIntensity: 1.15,
    attenuationColor: new THREE.Color('#fbf8ff'),
    attenuationDistance: 3,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
${LIFT}
uniform vec4 uPress;
attribute float aS; attribute float aX; attribute float aIn;
varying float vS; varying float vIn;`)
      .replace('#include <begin_vertex>', /* glsl */`
        vec3 transformed = position;
        transformed.y += wrLift(aX, aS);
        // М'яка вм'ятина там, де курсор «тисне» на гребінь
        float wrD = distance(position, uPress.xyz);
        transformed -= normal * uPress.w * 0.09 * exp(-wrD * wrD * 3.0);
        vS = aS; vIn = aIn;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim; uniform vec3 uCore;\nvarying float vS; varying float vIn;')
      .replace('#include <opaque_fragment>', /* glsl */`
        // Ціановий френелівський відтінок на гребені й краю губи, рожева глибина завитка
        float wrFres = pow(1.0 - saturate(abs(dot(normal, normalize(vViewPosition)))), 3.0);
        outgoingLight += uRim * wrFres * (0.08 + 1.0 * smoothstep(0.6, 1.0, vS));
        outgoingLight += uCore * smoothstep(0.6, 0.95, vS) * vIn * (0.4 + 0.6 * wrFres);
        #include <opaque_fragment>`);
  };
  const wave = new THREE.Mesh(geometry, material);

  // Світне ядро в глибині завитка (непрозоре — його видно і крізь скло, і крізь отвір трубки)
  const coreGroup = new THREE.Group();
  const coreMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: PINK }, uGlow: { value: 1 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uGlow; varying vec3 vN; varying vec3 vV;
      void main(){
        float f = pow(max(dot(normalize(vN), normalize(vV)), 0.0), 1.6);
        gl_FragColor = vec4(uColor * (0.2 + 1.9 * f) * uGlow, 1.0);
      }`,
    toneMapped: false,
  });
  {
    // Ядро проходить там, де хвиля вже закрутилася в трубку (права частина)
    const pts = cores.filter((c) => c[4] > 0.82).map(([x, y, z, r]) => new THREE.Vector3(x, y - r * 0.08, z));
    if (pts.length > 2) {
      const curve = new THREE.CatmullRomCurve3(pts);
      coreGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.05, 10, false), coreMat));
    }
  }
  const coreCenter = (() => {
    const c = cores.filter((v) => v[4] > 0.82);
    const m = c[Math.floor(c.length * 0.6)] || cores[cores.length - 1];
    return new THREE.Vector3(m[0], m[1], m[2]);
  })();

  // Бризки й краплі
  const spray = makeSpray(tips, weak ? 260 : mobile ? 520 : 1400, uniforms);
  spray.material.uniforms.uPx.value = DPR;
  const splash = makeSplash(weak ? 60 : 140, uniforms);
  splash.material.uniforms.uPx.value = DPR;

  // Хвиля і все, що рухається разом із нею (sculpt — центрування моделі)
  const sculpt = new THREE.Group();
  sculpt.add(wave, coreGroup, spray, splash);
  // Центр моделі — у початку координат, щоб поворот і масштаб були навколо середини хвилі
  const bs = geometry.boundingSphere;
  sculpt.position.copy(bs.center).multiplyScalar(-1);
  const group = new THREE.Group();
  group.add(sculpt);
  scene.add(group);

  // Світло: рожеве з глибини завитка, ціанове — контрове на гребінь
  const pinkLight = new THREE.PointLight(PINK, 6, 3.5, 2);
  pinkLight.position.copy(coreCenter);
  sculpt.add(pinkLight);
  const pinkLight2 = new THREE.PointLight(PINK, 2.2, 3.5, 2);
  pinkLight2.position.copy(coreCenter).add(new THREE.Vector3(1.2, 0, 0));
  sculpt.add(pinkLight2);
  const rimCyan = new THREE.DirectionalLight(CYAN, 1.1);
  rimCyan.position.set(-2, 4, -5);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(3, 2, 4);
  scene.add(rimCyan, fill);

  /* Bloom: делікатне світіння неону; на слабких пристроях вимкнено */
  let composer = null;
  if (!weak) {
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(DPR);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), mobile ? 0.35 : 0.42, 0.55, 0.9));
    composer.addPass(new OutputPass());
  }

  /* ---------- Стан (його читає й змінює motion.js) ---------- */
  const MOOD = { amp: 1, detail: 0, spin: 1, x: 0, y: 0, scale: 1 };
  const state = {
    scroll: 0,
    useScroll: true,
    yaw: -1.4,   // поворот хвилі навколо вертикалі: видно силует гребеня й завиток
    pitch: 0.06, // легкий погляд згори
    level: 0,
    running: false,
    mood: { ...MOOD },
    moodTarget: { ...MOOD },
    get host() { return host; },
    group, wave, material, uniforms, scene, camera, renderer, composer,
  };

  /* ---------- Розмір і композиція ---------- */
  let W = 0;
  let H = 0;
  let halfW = 1;
  let halfH = 1;
  let place = { x: 0, y: 0, s: 1 };
  function resize() {
    W = host.clientWidth || innerWidth;
    H = host.clientHeight || innerHeight;
    renderer.setSize(W, H, false);
    composer?.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    const dist = camera.position.z - backdrop.position.z;
    const vh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
    backdrop.scale.set(vh * camera.aspect * 1.2, vh * 1.2, 1);
    backdrop.material.uniforms.uAspect.value = camera.aspect;
    halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    halfW = halfH * camera.aspect;
    // Десктоп: хвиля праворуч від центру й трохи нижче; телефон — під заголовком, уся в кадрі
    const narrow = W < 700;
    const R = bs.radius;
    place = narrow
      ? { x: 0, y: -halfH * 0.5, s: Math.min(halfW * 1.25, halfH * 0.55) / R }
      : { x: halfW * 0.3, y: -halfH * 0.04, s: Math.min(halfW * 0.68, halfH * 0.98) / R };
  }
  resize();

  /* ---------- Курсор і дотик ---------- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pressTarget = new THREE.Vector3();
  const pressNow = new THREE.Vector3();
  let pointer = null; // { x, y } у NDC
  let pressAmt = 0;
  let pickQueued = null;

  function toNdc(e) {
    const r = host.getBoundingClientRect();
    if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) return null;
    return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
  }
  function hitAt(p) {
    ndc.set(p.x, p.y);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(wave, false)[0];
    return hit ? { point: wave.worldToLocal(hit.point.clone()), normal: hit.face?.normal.clone() } : null;
  }
  const onMove = (e) => {
    if (e.pointerType !== 'mouse' && e.buttons === 0) return;
    pointer = toNdc(e);
    pickQueued = pointer;
  };
  const onDown = (e) => {
    if (e.target.closest('a, button')) return;
    const p = toNdc(e);
    if (!p) return;
    pointer = p;
    const hit = hitAt(p);
    if (!hit) return;
    pressTarget.copy(hit.point);
    const su = splash.material.uniforms;
    su.uSplash.value.set(hit.point.x, hit.point.y, hit.point.z, uniforms.uTime.value);
    if (hit.normal) su.uNormal.value.copy(hit.normal);
  };
  const onUp = (e) => { if (e.pointerType !== 'mouse') pointer = null; };
  const onLeave = () => { pointer = null; };
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerdown', onDown, { passive: true });
  addEventListener('pointerup', onUp, { passive: true });
  addEventListener('pointercancel', onLeave, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave, { passive: true });

  /* ---------- Кадр ---------- */
  let last = performance.now();
  let time = 0;
  let raf = 0;
  let bass = 0;
  let mid = 0;
  let hasHit = false;
  const audio = uniforms.uAudio.value;
  const tilt = { x: 0, y: 0 };

  function frame(now) {
    raf = state.running ? requestAnimationFrame(frame) : 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    const k = (s) => 1 - Math.exp(-s * dt);
    const m = state.mood;
    for (const key in m) m[key] += (state.moodTarget[key] - m[key]) * k(2.2);

    // Музика: спектр розкладаємо вздовж гребеня (низькі частоти — у глибині завитка, праворуч)
    const a = window.wrAudioLevel;
    bass += ((a ? a.bass : 0) - bass) * k(10);
    mid += ((a ? a.mid : 0) - mid) * k(10);
    state.level = bass;
    const f = a?.freq;
    for (let i = 0; i < AUDIO_N; i++) {
      let v = 0;
      if (f) {
        const bin = Math.floor(Math.pow(1 - i / (AUDIO_N - 1), 1.7) * f.length * 0.6);
        v = f[Math.min(f.length - 1, bin)] / 255;
        v *= v;
      }
      audio[i] += (v - audio[i]) * k(8);
    }
    uniforms.uTime.value = time;
    uniforms.uAmp.value = m.amp;

    // Бризки: ледь «дихають» у спокої, пульсують під музику; настрій додає їх кількість
    const su = spray.material.uniforms;
    su.uPulse.value = Math.min(1.5, bass * 1.4 + m.detail * 0.5 + 0.08 * (1 + Math.sin(time * 0.9)));
    su.uDensity.value = Math.min(1, 0.45 + bass * 0.8 + mid * 0.4 + m.detail * 0.5 + (m.amp - 1) * 0.3);
    coreMat.uniforms.uGlow.value = 0.85 + 0.1 * Math.sin(time * 0.8) + bass * 0.9;
    pinkLight.intensity = 6 + bass * 6;

    // Курсор «тисне» на гребінь: точка через raycaster, не частіше за кадр
    if (pickQueued) {
      const hit = hitAt(pickQueued);
      hasHit = !!hit;
      if (hit) pressTarget.copy(hit.point);
      pickQueued = null;
    }
    if (!pointer) hasHit = false;
    pressAmt += ((hasHit ? 1 : 0) - pressAmt) * k(6);
    if (pressAmt < 0.01) pressNow.copy(pressTarget); else pressNow.lerp(pressTarget, k(10));
    uniforms.uPress.value.set(pressNow.x, pressNow.y, pressNow.z, pressAmt);

    // Майже нерухома: повільний поворот на кілька градусів і легкий нахил до курсора
    tilt.x += ((pointer ? -pointer.y * 0.06 : 0) - tilt.x) * k(3);
    tilt.y += ((pointer ? pointer.x * 0.1 : 0) - tilt.y) * k(3);
    const sway = Math.sin(time * 0.18) * 0.05 * m.spin;

    // Скрол: хвиля повертається завитком до глядача — аж до погляду всередину трубки, потім віддаляється
    const s = state.useScroll ? state.scroll : 0;
    const turn = smooth(0, 0.7, s);
    const away = smooth(0.55, 1, s);
    group.rotation.set(state.pitch + tilt.x + turn * 0.16, state.yaw + sway + tilt.y + turn * 0.55, 0);
    group.scale.setScalar(place.s * m.scale * (1 - 0.45 * away));
    group.position.set(
      place.x + m.x * halfW - turn * halfW * 0.18,
      place.y + m.y * halfH + turn * halfH * 0.12,
      -away * 3,
    );

    backdrop.material.uniforms.uTime.value = time;
    if (composer) composer.render(); else renderer.render(scene, camera);
  }

  state.start = () => { if (!state.running) { state.running = true; last = performance.now(); raf = requestAnimationFrame(frame); } };
  state.stop = () => { state.running = false; cancelAnimationFrame(raf); raf = 0; };
  state.setScroll = (v) => { state.scroll = Math.min(1, Math.max(0, v)); };
  state.setMood = (mood = {}) => { Object.assign(state.moodTarget, MOOD, mood); };
  state.renderOnce = () => frame(performance.now());
  state.resize = resize;
  // Перенести canvas в інший контейнер (розмір, камера й композиція підлаштовуються під нього)
  state.attach = (el) => {
    if (!el || el === host) return;
    host = el;
    el.appendChild(canvas);
    resize();
  };
  state.dispose = () => {
    state.stop();
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerdown', onDown);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onLeave);
    geometry.dispose();
    material.dispose();
    composer?.dispose();
    renderer.dispose();
    canvas.remove();
  };
  return state;
}
