/* Wave Records — рідина за курсором: рух миші (чи пальця) ніби омиває фон.
   Легка WebGL-симуляція «stable fluids»: адвекція, завихреність, дивергенція, тиск, віднімання градієнта.
   Основа — WebGL-Fluid-Simulation Павла Добрякова (MIT, текст ліцензії — fluid-LICENSE.txt поруч),
   спрощена під сайт: без bloom і sunrays, власна палітра й прозорий вивід.

   Як влаштовано:
     • один canvas [data-fluid] (розмітка в layout.js) — фіксований на весь екран, під вмістом сторінки
       і над фоном .bg; коли відкрите меню, той самий canvas переїжджає в меню — над шторкою, під пунктами
       (меню — окремий шар, тож змінити тільки z-index замало: потрібна ще й зміна батька);
     • фарба — рожевий і ціановий з низькою насиченістю; на екрані непрозорість не вище ~0,3, м'яке
       насичення без яскравих плям; згасає за 1–2 с;
     • легке «викривлення»: поверхня фарби має світлотінь (нормалі з градієнта), а стрічки хвиль у bg.js
       розступаються там, де пройшов курсор (дані сліду — window.wrWake);
     • продуктивність: швидкість — 1/4 роздільності екрана, фарба й вивід — 1/2 (на сенсорних — 1/6 і 1/3),
       мало ітерацій тиску; коли рідина вщухла — рендер стоїть до наступного руху; у фоновій вкладці — пауза;
     • вимкнено: prefers-reduced-motion, слабкі пристрої (мало пам'яті чи ядер, економія трафіку,
       програмний WebGL), браузери без half-float текстур. */
(() => {
  'use strict';
  const canvas = document.querySelector('[data-fluid]');
  if (!canvas) return;
  const nav = navigator;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const off = matchMedia('(prefers-reduced-motion: reduce)').matches
    || (nav.deviceMemory || 8) < 4
    || (nav.hardwareConcurrency || 8) < (coarse ? 6 : 4)
    || (nav.connection && nav.connection.saveData);
  if (off) { canvas.remove(); return; }

  const CFG = coarse
    ? { SIM: 1 / 6, DYE: 1 / 3, ITER: 6, RADIUS: 0.32, FORCE: 3200 }
    : { SIM: 1 / 4, DYE: 1 / 2, ITER: 10, RADIUS: 0.2, FORCE: 4200 };
  const CURL = 12; // сила завихрень
  const PRESSURE = 0.8;
  const VELOCITY_DISSIPATION = 1.4;
  const DYE_DISSIPATION = 2.1; // фарба майже зникає за ~1,5 с
  const OPACITY = 0.3; // найбільша непрозорість фарби на екрані
  const IDLE_MS = 2600; // скільки після останнього руху ще рахувати, поки все не вщухне

  /* ---------- WebGL-контекст і формати текстур ---------- */
  const params = { alpha: true, depth: false, stencil: false, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: true, powerPreference: 'low-power' };
  let gl = canvas.getContext('webgl2', params);
  const isGL2 = !!gl;
  if (!gl) gl = canvas.getContext('webgl', params);
  if (!gl) { canvas.remove(); return; }

  let halfFloat = null;
  let linear;
  if (isGL2) {
    gl.getExtension('EXT_color_buffer_float');
    linear = gl.getExtension('OES_texture_float_linear');
  } else {
    halfFloat = gl.getExtension('OES_texture_half_float');
    linear = gl.getExtension('OES_texture_half_float_linear');
  }
  const HALF = isGL2 ? gl.HALF_FLOAT : halfFloat && halfFloat.HALF_FLOAT_OES;
  if (!HALF) { canvas.remove(); return; }

  function canRender(internalFormat, format) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, HALF, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    return ok;
  }
  function format(internalFormat, fmt) {
    if (canRender(internalFormat, fmt)) return { internalFormat, format: fmt };
    if (!isGL2) return null;
    if (internalFormat === gl.R16F) return format(gl.RG16F, gl.RG);
    if (internalFormat === gl.RG16F) return format(gl.RGBA16F, gl.RGBA);
    return null;
  }
  const RGBA = isGL2 ? format(gl.RGBA16F, gl.RGBA) : format(gl.RGBA, gl.RGBA);
  const RG = isGL2 ? format(gl.RG16F, gl.RG) : RGBA;
  const R = isGL2 ? format(gl.R16F, gl.RED) : RGBA;
  if (!RGBA || !RG || !R) { canvas.remove(); return; }

  /* ---------- Шейдери ---------- */
  const VERT = `
    precision highp float;
    attribute vec2 aPosition;
    varying vec2 vUv, vL, vR, vT, vB;
    uniform vec2 texelSize;
    void main () {
      vUv = aPosition * 0.5 + 0.5;
      vL = vUv - vec2(texelSize.x, 0.0);
      vR = vUv + vec2(texelSize.x, 0.0);
      vT = vUv + vec2(0.0, texelSize.y);
      vB = vUv - vec2(0.0, texelSize.y);
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }`;
  const HEAD = 'precision highp float; precision highp sampler2D; varying vec2 vUv, vL, vR, vT, vB;';
  const FRAG = {
    clear: `${HEAD} uniform sampler2D uTexture; uniform float value;
      void main () { gl_FragColor = value * texture2D(uTexture, vUv); }`,
    splat: `${HEAD} uniform sampler2D uTarget; uniform float aspectRatio; uniform vec3 color; uniform vec2 point; uniform float radius;
      void main () {
        vec2 p = vUv - point.xy; p.x *= aspectRatio;
        vec3 splat = exp(-dot(p, p) / radius) * color;
        gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + splat, 1.0);
      }`,
    advection: `${HEAD} uniform sampler2D uVelocity, uSource; uniform vec2 texelSize, dyeTexelSize; uniform float dt, dissipation;
      vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
        vec2 st = uv / tsize - 0.5; vec2 iuv = floor(st); vec2 fuv = fract(st);
        vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
        vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
        vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
        vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
        return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
      }
      void main () {
      #ifdef MANUAL_FILTERING
        vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
        vec4 result = bilerp(uSource, coord, dyeTexelSize);
      #else
        vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
        vec4 result = texture2D(uSource, coord);
      #endif
        gl_FragColor = result / (1.0 + dissipation * dt);
      }`,
    divergence: `${HEAD} uniform sampler2D uVelocity;
      void main () {
        float L = texture2D(uVelocity, vL).x; float R = texture2D(uVelocity, vR).x;
        float T = texture2D(uVelocity, vT).y; float B = texture2D(uVelocity, vB).y;
        vec2 C = texture2D(uVelocity, vUv).xy;
        if (vL.x < 0.0) L = -C.x; if (vR.x > 1.0) R = -C.x;
        if (vT.y > 1.0) T = -C.y; if (vB.y < 0.0) B = -C.y;
        gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
      }`,
    curl: `${HEAD} uniform sampler2D uVelocity;
      void main () {
        float L = texture2D(uVelocity, vL).y; float R = texture2D(uVelocity, vR).y;
        float T = texture2D(uVelocity, vT).x; float B = texture2D(uVelocity, vB).x;
        gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
      }`,
    vorticity: `${HEAD} uniform sampler2D uVelocity, uCurl; uniform float curl, dt;
      void main () {
        float L = texture2D(uCurl, vL).x; float R = texture2D(uCurl, vR).x;
        float T = texture2D(uCurl, vT).x; float B = texture2D(uCurl, vB).x;
        float C = texture2D(uCurl, vUv).x;
        vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
        force /= length(force) + 0.0001;
        force *= curl * C; force.y *= -1.0;
        vec2 vel = texture2D(uVelocity, vUv).xy + force * dt;
        gl_FragColor = vec4(clamp(vel, -1000.0, 1000.0), 0.0, 1.0);
      }`,
    pressure: `${HEAD} uniform sampler2D uPressure, uDivergence;
      void main () {
        float L = texture2D(uPressure, vL).x; float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x; float B = texture2D(uPressure, vB).x;
        float div = texture2D(uDivergence, vUv).x;
        gl_FragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
      }`,
    gradient: `${HEAD} uniform sampler2D uPressure, uVelocity;
      void main () {
        float L = texture2D(uPressure, vL).x; float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x; float B = texture2D(uPressure, vB).x;
        vec2 vel = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B);
        gl_FragColor = vec4(vel, 0.0, 1.0);
      }`,
    // Вивід: м'яке насичення (без яскравих плям), трохи менше насиченості, світлотінь поверхні
    // й ледь помітний відблиск на краях — рідина ніби злегка заломлює фон. Вихід premultiplied alpha.
    display: `${HEAD} uniform sampler2D uTexture; uniform vec2 texelSize; uniform float opacity;
      void main () {
        vec3 c = texture2D(uTexture, vUv).rgb;
        float dx = length(texture2D(uTexture, vR).rgb) - length(texture2D(uTexture, vL).rgb);
        float dy = length(texture2D(uTexture, vT).rgb) - length(texture2D(uTexture, vB).rgb);
        vec3 n = normalize(vec3(dx, dy, length(texelSize)));
        vec3 l = normalize(vec3(-0.35, 0.55, 1.0));
        float diffuse = clamp(dot(n, l) + 0.6, 0.6, 1.0);
        float spec = pow(clamp(dot(n, normalize(l + vec3(0.0, 0.0, 1.0))), 0.0, 1.0), 40.0) * (1.0 - n.z);
        // Насичення за найяскравішим каналом: густа фарба не вигорає в біле, відтінок лишається
        float m = max(c.r, max(c.g, c.b));
        c *= (1.0 - exp(-m * 2.2)) / max(m, 0.0001);
        c = mix(vec3(dot(c, vec3(0.3333))), c, 0.9) * diffuse;
        c = c * opacity + vec3(0.96) * spec * opacity * 0.35;
        gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
      }`,
  };

  function compile(type, src, keywords) {
    const s = gl.createShader(type);
    gl.shaderSource(s, (keywords || []).map((k) => `#define ${k}\n`).join('') + src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  }
  let vert;
  function program(frag, keywords) {
    const p = gl.createProgram();
    gl.attachShader(p, vert);
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, frag, keywords));
    gl.bindAttribLocation(p, 0, 'aPosition');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'program');
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u, use() { gl.useProgram(p); } };
  }

  let P;
  try {
    vert = compile(gl.VERTEX_SHADER, VERT);
    P = {
      clear: program(FRAG.clear),
      splat: program(FRAG.splat),
      advection: program(FRAG.advection, linear ? [] : ['MANUAL_FILTERING']),
      divergence: program(FRAG.divergence),
      curl: program(FRAG.curl),
      vorticity: program(FRAG.vorticity),
      pressure: program(FRAG.pressure),
      gradient: program(FRAG.gradient),
      display: program(FRAG.display),
    };
  } catch (err) {
    console.warn('Рідину вимкнено:', err.message);
    canvas.remove();
    return;
  }

  // Повноекранний прямокутник
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);

  function blit(target) {
    if (target) {
      gl.viewport(0, 0, target.w, target.h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    } else {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  /* ---------- Текстури-поля ---------- */
  function fbo(w, h, f, filter) {
    gl.activeTexture(gl.TEXTURE0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, f.internalFormat, w, h, 0, f.format, HALF, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return {
      tex, fbo: fb, w, h, tx: 1 / w, ty: 1 / h,
      attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, tex); return id; },
      free() { gl.deleteFramebuffer(fb); gl.deleteTexture(tex); },
    };
  }
  function double(w, h, f, filter) {
    let a = fbo(w, h, f, filter);
    let b = fbo(w, h, f, filter);
    return {
      w, h, tx: 1 / w, ty: 1 / h,
      get read() { return a; },
      get write() { return b; },
      swap() { const t = a; a = b; b = t; },
      free() { a.free(); b.free(); },
    };
  }

  const filter = linear ? gl.LINEAR : gl.NEAREST;
  let dye;
  let velocity;
  let divergence;
  let curl;
  let pressure;
  function initFields() {
    [dye, velocity, divergence, curl, pressure].forEach((f) => f && f.free());
    const W = innerWidth;
    const H = innerHeight;
    const dw = Math.max(16, Math.round(W * CFG.DYE));
    const dh = Math.max(16, Math.round(H * CFG.DYE));
    const sw = Math.max(16, Math.round(W * CFG.SIM));
    const sh = Math.max(16, Math.round(H * CFG.SIM));
    canvas.width = dw;
    canvas.height = dh;
    dye = double(dw, dh, RGBA, filter);
    velocity = double(sw, sh, RG, filter);
    divergence = fbo(sw, sh, R, gl.NEAREST);
    curl = fbo(sw, sh, R, gl.NEAREST);
    pressure = double(sw, sh, R, gl.NEAREST);
  }
  initFields();

  /* ---------- Крок симуляції ---------- */
  function step(dt) {
    const { tx, ty } = velocity;
    P.curl.use();
    gl.uniform2f(P.curl.u.texelSize, tx, ty);
    gl.uniform1i(P.curl.u.uVelocity, velocity.read.attach(0));
    blit(curl);

    P.vorticity.use();
    gl.uniform2f(P.vorticity.u.texelSize, tx, ty);
    gl.uniform1i(P.vorticity.u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(P.vorticity.u.uCurl, curl.attach(1));
    gl.uniform1f(P.vorticity.u.curl, CURL);
    gl.uniform1f(P.vorticity.u.dt, dt);
    blit(velocity.write);
    velocity.swap();

    P.divergence.use();
    gl.uniform2f(P.divergence.u.texelSize, tx, ty);
    gl.uniform1i(P.divergence.u.uVelocity, velocity.read.attach(0));
    blit(divergence);

    P.clear.use();
    gl.uniform1i(P.clear.u.uTexture, pressure.read.attach(0));
    gl.uniform1f(P.clear.u.value, PRESSURE);
    blit(pressure.write);
    pressure.swap();

    P.pressure.use();
    gl.uniform2f(P.pressure.u.texelSize, tx, ty);
    gl.uniform1i(P.pressure.u.uDivergence, divergence.attach(0));
    for (let i = 0; i < CFG.ITER; i++) {
      gl.uniform1i(P.pressure.u.uPressure, pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    P.gradient.use();
    gl.uniform2f(P.gradient.u.texelSize, tx, ty);
    gl.uniform1i(P.gradient.u.uPressure, pressure.read.attach(0));
    gl.uniform1i(P.gradient.u.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    P.advection.use();
    gl.uniform2f(P.advection.u.texelSize, tx, ty);
    if (!linear) gl.uniform2f(P.advection.u.dyeTexelSize, tx, ty);
    const vid = velocity.read.attach(0);
    gl.uniform1i(P.advection.u.uVelocity, vid);
    gl.uniform1i(P.advection.u.uSource, vid);
    gl.uniform1f(P.advection.u.dt, dt);
    gl.uniform1f(P.advection.u.dissipation, VELOCITY_DISSIPATION);
    blit(velocity.write);
    velocity.swap();

    if (!linear) gl.uniform2f(P.advection.u.dyeTexelSize, dye.tx, dye.ty);
    gl.uniform1i(P.advection.u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(P.advection.u.uSource, dye.read.attach(1));
    gl.uniform1f(P.advection.u.dissipation, DYE_DISSIPATION);
    blit(dye.write);
    dye.swap();
  }

  function render() {
    P.display.use();
    gl.uniform2f(P.display.u.texelSize, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight);
    gl.uniform1i(P.display.u.uTexture, dye.read.attach(0));
    gl.uniform1f(P.display.u.opacity, OPACITY);
    blit(null);
  }

  const aspect = () => canvas.width / canvas.height;
  function splat(x, y, dx, dy, color) {
    P.splat.use();
    gl.uniform1i(P.splat.u.uTarget, velocity.read.attach(0));
    gl.uniform1f(P.splat.u.aspectRatio, aspect());
    gl.uniform2f(P.splat.u.point, x, y);
    gl.uniform3f(P.splat.u.color, dx, dy, 0);
    let r = CFG.RADIUS / 100;
    if (aspect() > 1) r *= aspect();
    gl.uniform1f(P.splat.u.radius, r);
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(P.splat.u.uTarget, dye.read.attach(0));
    gl.uniform3f(P.splat.u.color, color[0], color[1], color[2]);
    blit(dye.write);
    dye.swap();
  }

  /* ---------- Фарба: рожевий #FF2E9A і ціановий #00E5FF, приглушені ---------- */
  const PINK = [1, 0.18, 0.6];
  const CYAN = [0, 0.9, 1];
  // Колір чергується ділянками: здебільшого рожевий (головний акцент), зрідка ціановий.
  // Без проміжних відтінків — суміш рожевого й ціанового дала б сірувато-бузковий колір.
  let tone = PINK;
  let toneUntil = 0;
  function paint(t) {
    if (t > toneUntil) {
      tone = tone === PINK && Math.random() < 0.45 ? CYAN : PINK;
      toneUntil = t + (tone === PINK ? 1.1 : 0.6) + Math.random() * 0.5;
    }
    const grey = (tone[0] + tone[1] + tone[2]) / 3;
    return tone.map((v) => (v + (grey - v) * 0.15) * 0.12);
  }

  /* ---------- Вхід: миша й палець ---------- */
  const ptr = { x: 0, y: 0, px: 0, py: 0, dx: 0, dy: 0, has: false, moved: false };
  const wake = (window.wrWake = window.wrWake || []);
  let lastInput = 0;
  function move(cx, cy, fresh) {
    const x = cx / innerWidth;
    const y = 1 - cy / innerHeight;
    if (fresh || !ptr.has) { ptr.px = x; ptr.py = y; ptr.has = true; return; }
    const a = innerWidth / innerHeight;
    let ddx = x - ptr.px;
    let ddy = y - ptr.py;
    if (a < 1) ddx *= a; else ddy /= a;
    ptr.dx += ddx;
    ptr.dy += ddy;
    ptr.x = x; ptr.y = y; ptr.px = x; ptr.py = y;
    if (Math.abs(ddx) + Math.abs(ddy) < 1e-5) return;
    ptr.moved = true;
    // Слід для bg.js: стрічки хвиль розступаються там, де пройшов курсор
    const now = performance.now();
    const last = wake[wake.length - 1];
    if (!last || now - last.t > 30) {
      const near = last && now - last.t < 200; // інакше це новий жест — швидкість невідома
      const dtS = near ? (now - last.t) / 1000 : 1;
      wake.push({ x: cx, y: cy, vx: near ? (cx - last.x) / dtS : 0, vy: near ? (cy - last.y) / dtS : 0, t: now });
      while (wake.length > 24 || (wake.length && now - wake[0].t > 1600)) wake.shift();
    }
    wakeUp();
  }
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return; // палець — через touch-події (працюють і під час прокрутки)
    move(e.clientX, e.clientY, false);
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { ptr.has = false; }, { passive: true });
  addEventListener('touchstart', (e) => { const t = e.touches[0]; if (t) move(t.clientX, t.clientY, true); }, { passive: true });
  addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) move(t.clientX, t.clientY, false); }, { passive: true });
  addEventListener('touchend', () => { ptr.has = false; }, { passive: true });

  /* ---------- Цикл: працює лише поки рідина рухається ---------- */
  let raf = 0;
  let prev = 0;
  let time = 0;
  function frame(now) {
    const dt = Math.min(0.033, Math.max(0.001, (now - prev) / 1000));
    prev = now;
    time += dt;
    if (ptr.moved) {
      ptr.moved = false;
      splat(ptr.x, ptr.y, ptr.dx * CFG.FORCE, ptr.dy * CFG.FORCE, paint(time));
      ptr.dx = 0; ptr.dy = 0;
    }
    step(dt);
    render();
    if (now - lastInput > IDLE_MS) { sleep(); return; }
    raf = requestAnimationFrame(frame);
  }
  function wakeUp() {
    lastInput = performance.now();
    if (raf || document.hidden) return;
    prev = performance.now();
    raf = requestAnimationFrame(frame);
  }
  // Вщухло: обнуляємо поля і чистимо canvas — до наступного руху нічого не рахується
  function sleep() {
    raf = 0;
    [dye.read, dye.write, velocity.read, velocity.write, pressure.read, pressure.write].forEach((f) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
      gl.clear(gl.COLOR_BUFFER_BIT);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  // Фонова вкладка — пауза; після повернення продовжуємо лише з наступним рухом
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && raf) { cancelAnimationFrame(raf); sleep(); }
  });

  let resizeT;
  let lastW = innerWidth;
  let lastH = innerHeight;
  addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      // На телефоні панель адреси змінює висоту під час прокрутки — дрібні зміни ігноруємо
      if (Math.abs(innerWidth - lastW) < 2 && Math.abs(innerHeight - lastH) < 120) return;
      lastW = innerWidth; lastH = innerHeight;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      initFields();
      sleep();
    }, 150);
  }, { passive: true });

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; canvas.remove(); });

  /* ---------- Меню: той самий canvas переходить у меню — над шторкою, під пунктами ---------- */
  const menu = document.querySelector('[data-menu]');
  const home = canvas.parentNode;
  const anchor = canvas.nextSibling;
  if (menu) {
    const wave = menu.querySelector('.menu-wave');
    const place = () => {
      const open = !menu.hidden;
      if (open && canvas.parentNode !== menu) {
        menu.insertBefore(canvas, wave ? wave.nextSibling : menu.firstChild);
        canvas.classList.add('is-in-menu');
      } else if (!open && canvas.parentNode === menu) {
        home.insertBefore(canvas, anchor && anchor.parentNode === home ? anchor : null);
        canvas.classList.remove('is-in-menu');
      }
    };
    new MutationObserver(place).observe(menu, { attributes: true, attributeFilter: ['hidden'] });
    place();
  }
  canvas.classList.add('is-ready');
})();
