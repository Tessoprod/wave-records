/* Wave Records — «звукова скульптура з рідкого скла» на першому екрані головної.
   Завантажується з motion.js динамічним import() після першого відображення сторінки.

   Сцена:
     • скульптура — ікосфера високої деталізації; вершини зміщує вершинний шейдер (simplex noise,
       концентричні хвилі, вм'ятина під курсором, брижі від кліку, музика з аналізатора site.js);
       нормалі рахуються в тому ж шейдері, тож світло й заломлення йдуть за формою;
     • матеріал — MeshPhysicalMaterial: transmission, thickness, ior 1.45, dispersion (райдужні краї),
       легка iridescence;
     • за склом — темний задник із тонкими кільцями «звукових хвиль», точками й неоновим світлом:
       саме його видно крізь скло заломленим;
     • оточення для відблисків — власне градієнтне (PMREM), без HDR-файлів;
     • світло — рожеве #FF2E9A і ціанове #00E5FF з різних боків.

   createHeroScene(host) повертає об'єкт стану: motion.js прив'язує до нього скрол (setScroll),
   а наступні етапи можуть рухати скульптуру через state. */

import * as THREE from '../vendor/three.module-0.187.0.min.js';

const PINK = new THREE.Color('#FF2E9A');
const CYAN = new THREE.Color('#00E5FF');
const DARK = new THREE.Color('#111111');

// Simplex noise 3D (Ashima Arts / Stefan Gustavson, MIT)
const NOISE = /* glsl */`
vec3 wrMod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 wrMod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 wrPermute(vec4 x){ return wrMod289(((x * 34.0) + 10.0) * x); }
vec4 wrTaylor(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = wrMod289(i);
  vec4 p = wrPermute(wrPermute(wrPermute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = wrTaylor(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}`;

// Висота поверхні над одиничною сферою в напрямку n
const SURFACE = /* glsl */`
uniform float uTime;
uniform float uAmp;     // загальна сила хвилювання (дихання + музика)
uniform float uDetail;  // дрібна брижа (середні частоти музики)
uniform vec4 uPress;    // xyz — точка під курсором (на одиничній сфері), w — сила вм'ятини
uniform vec4 uRip[4];   // xyz — центр брижів, w — час старту (від'ємний — вимкнено)
${NOISE}
float wrHeight(vec3 n){
  float h = snoise(n * 1.1 + vec3(0.0, uTime * 0.16, uTime * 0.05)) * 0.075;
  h += snoise(n * 2.4 - vec3(uTime * 0.11)) * 0.018 * (1.0 + uDetail * 3.0);
  // Концентричні хвилі, що біжать від «полюса», як звук від джерела
  float a = acos(clamp(dot(n, normalize(vec3(0.35, 0.55, 0.75))), -1.0, 1.0));
  h += sin(a * 10.0 - uTime * 1.5) * 0.014 * smoothstep(0.0, 0.6, a);
  h *= uAmp;
  // Вм'ятина під курсором
  float dp = distance(n, uPress.xyz);
  h -= uPress.w * 0.2 * exp(-dp * dp * 9.0);
  // Брижі від кліку: кільце розходиться по поверхні й згасає
  for (int i = 0; i < 4; i++) {
    float age = uTime - uRip[i].w;
    if (uRip[i].w < 0.0 || age > 3.0) continue;
    float d = acos(clamp(dot(n, uRip[i].xyz), -1.0, 1.0));
    float front = age * 1.6;
    h += sin((d - front) * 16.0) * 0.06 * exp(-age * 1.3) * exp(-pow((d - front) * 3.0, 2.0));
  }
  return h;
}
vec3 wrDisplace(vec3 n){ return n * (1.0 + wrHeight(n)); }`;

/* Задник за склом: темний, з тонкими кільцями, сіткою точок і плямами неонового світла.
   Неон приглушений — він видний лише крізь скло та як легке світіння навколо. */
function makeBackdrop() {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPink: { value: PINK }, uCyan: { value: CYAN }, uDark: { value: DARK }, uAspect: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform float uTime, uAspect; uniform vec3 uPink, uCyan, uDark; varying vec2 vUv;
        void main(){
          vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * 2.0;
          float r = length(p);
          vec3 col = uDark;
          // Неонове світло: рожеве зліва вгорі, ціанове справа внизу
          col += uPink * 0.045 * exp(-pow(length(p - vec2(-0.45, 0.25)) / 0.45, 2.0));
          col += uCyan * 0.018 * exp(-pow(length(p - vec2(0.55, -0.3)) / 0.4, 2.0));
          // Кільця звукових хвиль
          float rings = abs(fract(r * 4.0 - uTime * 0.08) - 0.5);
          float line = smoothstep(0.035, 0.0, rings) * smoothstep(1.6, 0.2, r);
          col += mix(uPink, vec3(0.96), 0.6) * line * 0.035;
          // Сітка точок
          vec2 g = fract(p * 9.0) - 0.5;
          col += vec3(0.9) * smoothstep(0.09, 0.0, length(g)) * 0.012 * smoothstep(1.8, 0.4, r);
          // Згасання до країв — далі сторінка темна
          col = mix(uDark, col, smoothstep(1.9, 0.7, r));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
      depthWrite: false,
    }),
  );
}

/* Оточення для відблисків: темна «кімната» з рожевим і ціановим світлом і двома білими софтбоксами */
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
          vec3 col = vec3(0.012) + vec3(0.03) * (d.y * 0.5 + 0.5);
          col += uPink * 1.6 * pow(max(dot(d, normalize(vec3(-1.0, 0.5, 0.4))), 0.0), 6.0);
          col += uCyan * 1.2 * pow(max(dot(d, normalize(vec3(1.0, -0.3, 0.3))), 0.0), 6.0);
          // Софтбокси: дають білі блики на склі
          col += vec3(3.0) * smoothstep(0.93, 0.97, dot(d, normalize(vec3(-0.4, 0.8, 0.6))));
          col += vec3(1.4) * smoothstep(0.95, 0.985, dot(d, normalize(vec3(0.7, 0.4, 0.8))));
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

export function createHeroScene(host, { mobile = false, weak = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile && !weak, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.setClearColor(DARK, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.environment = makeEnvironment(renderer);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0, 7);

  const backdrop = makeBackdrop();
  backdrop.position.z = -4;
  scene.add(backdrop);

  // Світло з різних боків: рожеве зліва вгорі, ціанове справа внизу
  const keyPink = new THREE.DirectionalLight(PINK, 1.8);
  keyPink.position.set(-4, 3, 3);
  const keyCyan = new THREE.DirectionalLight(CYAN, 1.1);
  keyCyan.position.set(4, -2.5, 2.5);
  const rim = new THREE.DirectionalLight(0xffffff, 0.6);
  rim.position.set(0, 4, -3);
  scene.add(keyPink, keyCyan, rim);

  // Скульптура
  const uniforms = {
    uTime: { value: 0 },
    uAmp: { value: 1 },
    uDetail: { value: 0 },
    uPress: { value: new THREE.Vector4(0, 0, 1, 0) },
    uRip: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 1, -1)) },
  };
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.05,
    transmission: 1,
    thickness: 1.4,
    ior: 1.45,
    dispersion: 5,
    iridescence: 0.35,
    iridescenceIOR: 1.3,
    iridescenceThicknessMinimum: 120,
    iridescenceThicknessMaximum: 420,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    specularIntensity: 1,
    envMapIntensity: 1.3,
    attenuationColor: new THREE.Color('#f3e6ff'),
    attenuationDistance: 4,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SURFACE}`)
      // Нормаль — з двох сусідніх зміщених точок, тож світло й заломлення йдуть за хвилями
      .replace('#include <beginnormal_vertex>', /* glsl */`
        vec3 wrN = normalize(position);
        vec3 wrT = normalize(cross(wrN, abs(wrN.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 wrB = cross(wrN, wrT);
        vec3 wrP0 = wrDisplace(wrN);
        vec3 wrP1 = wrDisplace(normalize(wrN + wrT * 0.01));
        vec3 wrP2 = wrDisplace(normalize(wrN + wrB * 0.01));
        vec3 objectNormal = normalize(cross(wrP1 - wrP0, wrP2 - wrP0));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`)
      .replace('#include <begin_vertex>', 'vec3 transformed = wrP0;');
  };
  const detail = weak ? 28 : mobile ? 40 : 72;
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, detail), material);
  const group = new THREE.Group();
  group.add(mesh);
  scene.add(group);

  /* ---------- Стан (його читає й змінює motion.js) ---------- */
  const state = {
    scroll: 0,         // 0 — перший екран на місці, 1 — прокручений
    tiltX: 0, tiltY: 0, // поточний нахил
    level: 0,          // рівень музики, 0…1
    running: false,
    group, mesh, material, uniforms, scene, camera, renderer,
  };

  /* ---------- Розмір ---------- */
  let W = 0;
  let H = 0;
  function resize() {
    W = host.clientWidth || innerWidth;
    H = host.clientHeight || innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    // Задник накриває весь кадр на своїй глибині
    const dist = camera.position.z - backdrop.position.z;
    const vh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
    backdrop.scale.set(vh * camera.aspect * 1.15, vh * 1.15, 1);
    backdrop.material.uniforms.uAspect.value = camera.aspect;
    // На вузьких екранах скульптура менша, щоб не впиралася в краї
    state.baseScale = W < 700 ? 0.82 : W < 1100 ? 1.05 : 1.22;
  }
  resize();

  /* ---------- Курсор і дотик ---------- */
  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const inv = new THREE.Matrix4();
  const hitSphere = new THREE.Sphere(new THREE.Vector3(), 1.08);
  const local = new THREE.Ray();
  const hitPoint = new THREE.Vector3();
  const pressTarget = new THREE.Vector3(0, 0, 1);
  let pointer = null; // { x, y } у NDC
  let pressAmt = 0;
  let ripIndex = 0;
  const pressNow = new THREE.Vector3(0, 0, 1);

  function pick(e) {
    const r = host.getBoundingClientRect();
    if (e.clientY < r.top || e.clientY > r.bottom) return null;
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    inv.copy(mesh.matrixWorld).invert();
    local.copy(ray.ray).applyMatrix4(inv);
    const hit = local.intersectSphere(hitSphere, hitPoint);
    return { x: ndc.x, y: ndc.y, point: hit ? hitPoint.clone().normalize() : null };
  }
  const onMove = (e) => {
    if (e.pointerType !== 'mouse' && e.buttons === 0) return;
    const p = pick(e);
    pointer = p;
    if (p?.point) pressTarget.copy(p.point);
  };
  const onDown = (e) => {
    if (e.target.closest('a, button')) return;
    const p = pick(e);
    if (!p) return;
    pointer = p;
    if (p.point) {
      pressTarget.copy(p.point);
      const rp = uniforms.uRip.value[ripIndex++ % 4];
      rp.set(p.point.x, p.point.y, p.point.z, uniforms.uTime.value);
    }
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

  function frame(now) {
    raf = state.running ? requestAnimationFrame(frame) : 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    const k = (s) => 1 - Math.exp(-s * dt); // плавне наближення, незалежне від частоти кадрів

    // Музика: рівень від аналізатора site.js (null, коли трек не грає)
    const a = window.wrAudioLevel;
    bass += ((a ? a.bass : 0) - bass) * k(10);
    mid += ((a ? a.mid : 0) - mid) * k(10);
    state.level = bass;

    // Дихання в спокої + музика
    const breathe = 0.85 + 0.15 * Math.sin(time * 0.8);
    uniforms.uTime.value = time;
    uniforms.uAmp.value = breathe * (1 + bass * 2.2);
    uniforms.uDetail.value = mid;

    // Вм'ятина під курсором
    pressAmt += ((pointer?.point ? 1 : 0) - pressAmt) * k(6);
    pressNow.lerp(pressTarget, k(10)).normalize();
    uniforms.uPress.value.set(pressNow.x, pressNow.y, pressNow.z, pressAmt);

    // Нахил до курсора і повільне обертання
    state.tiltX += ((pointer ? -pointer.y * 0.35 : 0) - state.tiltX) * k(3);
    state.tiltY += ((pointer ? pointer.x * 0.5 : 0) - state.tiltY) * k(3);
    mesh.rotation.y = time * 0.12;
    mesh.rotation.x = Math.sin(time * 0.2) * 0.12;
    group.rotation.x = state.tiltX;
    group.rotation.y = state.tiltY;

    // Скрол: скульптура віддаляється, зменшується і зміщується вгору й вправо
    const s = state.scroll;
    const e = s * s * (3 - 2 * s);
    group.scale.setScalar(state.baseScale * (1 - 0.4 * e) * (1 + bass * 0.06));
    group.position.set(e * 1.3, e * 0.9, -e * 2.5);

    backdrop.material.uniforms.uTime.value = time;
    renderer.render(scene, camera);
  }

  state.start = () => { if (!state.running) { state.running = true; last = performance.now(); raf = requestAnimationFrame(frame); } };
  state.stop = () => { state.running = false; cancelAnimationFrame(raf); raf = 0; };
  state.setScroll = (v) => { state.scroll = Math.min(1, Math.max(0, v)); };
  state.renderOnce = () => frame(performance.now());
  state.resize = resize;
  state.dispose = () => {
    state.stop();
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerdown', onDown);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onLeave);
    mesh.geometry.dispose();
    material.dispose();
    renderer.dispose();
    canvas.remove();
  };
  return state;
}
