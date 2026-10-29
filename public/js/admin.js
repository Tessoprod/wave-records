/* Wave Records — адмін-панель */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const csrf = $('meta[name="csrf"]')?.content || '';

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: { 'X-CSRF-Token': csrf, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Помилка ${res.status}`);
    return data;
  }

  /** Завантаження файлу з прогресом (XHR дає події прогресу, fetch — ні). */
  function uploadFile(url, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('X-CSRF-Token', csrf);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch { /* порожня відповідь */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || `Помилка ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('Зв\'язок перервався. Перевірте інтернет і спробуйте ще раз.'));
      xhr.send(file);
    });
  }

  /* ---------- Підтвердження ---------- */
  document.addEventListener('submit', (e) => {
    const msg = e.target.dataset.confirm;
    if (msg && !confirm(msg)) e.preventDefault();
  }, true);
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-confirm-click]');
    if (b && !confirm(b.dataset.confirmClick)) e.preventDefault();
  });

  /* ---------- Аналіз аудіо: тривалість і форма хвилі ---------- */
  async function analyseAudio(file) {
    const result = { duration: 0, peaks: '' };
    // Тривалість — через елемент <audio> (працює навіть для великих WAV)
    result.duration = await new Promise((resolve) => {
      const a = document.createElement('audio');
      const url = URL.createObjectURL(file);
      a.preload = 'metadata';
      a.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(a.duration) ? a.duration : 0); };
      a.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
      a.src = url;
    });
    // Форма хвилі — декодуємо файл (до ~150 МБ, щоб не перевантажити браузер)
    if (file.size < 150 * 1024 * 1024) {
      try {
        const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const ctx = new AC(1, 44100, 44100);
        const buf = await ctx.decodeAudioData(await file.arrayBuffer());
        const ch = buf.getChannelData(0);
        const N = 120;
        const block = Math.floor(ch.length / N);
        const vals = [];
        for (let i = 0; i < N; i++) {
          let sum = 0;
          const start = i * block;
          const step = Math.max(1, Math.floor(block / 2000));
          let count = 0;
          for (let j = 0; j < block; j += step) { const v = ch[start + j]; sum += v * v; count++; }
          vals.push(Math.sqrt(sum / Math.max(1, count)));
        }
        const max = Math.max(...vals) || 1;
        result.peaks = vals.map((v) => Math.round((v / max) * 100)).join(',');
        if (!result.duration) result.duration = buf.duration;
      } catch { /* браузер не зміг декодувати — хвиля буде рівною */ }
    }
    return result;
  }

  /* ---------- Стиснення фото перед завантаженням ---------- */
  async function shrinkImage(file, maxSide = 2400) {
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) return { blob: file, width: 0, height: 0 };
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    let blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.86));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
    if (!blob || (blob.size > file.size && scale === 1)) return { blob: file, width: w, height: h };
    return { blob, width: w, height: h };
  }

  /* ---------- Форми завантаження ---------- */
  $$('[data-upload]').forEach((form) => {
    const kind = form.dataset.upload;
    const bar = $('.progress', form);
    const status = $('.upload-status', form);
    const btn = $('button[type="submit"]', form);
    const setProgress = (p) => { bar.hidden = false; $('span', bar).style.width = `${Math.round(p * 100)}%`; };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const files = [...form.elements.file.files];
      if (!files.length) return;
      btn.setAttribute('aria-busy', 'true');
      try {
        if (kind === 'track') {
          const file = files[0];
          status.textContent = 'Аналізуємо файл…';
          const meta = await analyseAudio(file);
          const qs = new URLSearchParams({
            category: form.elements.category.value, artist: form.elements.artist.value, title: form.elements.title.value,
            duration: meta.duration.toFixed(2), peaks: meta.peaks,
          });
          status.textContent = 'Завантажуємо…';
          await uploadFile(`/admin/api/tracks?${qs}`, file, setProgress);
        } else {
          for (let i = 0; i < files.length; i++) {
            status.textContent = `Обробляємо фото ${i + 1} з ${files.length}…`;
            const { blob, width, height } = await shrinkImage(files[i]);
            const qs = new URLSearchParams({ placement: form.elements.placement.value, alt: form.elements.alt.value, width, height });
            await uploadFile(`/admin/api/photos?${qs}`, blob, (p) => setProgress((i + p) / files.length));
          }
        }
        status.textContent = 'Готово!';
        location.reload();
      } catch (err) {
        status.textContent = err.message;
        status.classList.remove('muted');
        btn.removeAttribute('aria-busy');
      }
    });
  });

  /* ---------- Редагування треків і фото ---------- */
  function wireItemForm(attr, url) {
    $$(`[${attr}]`).forEach((form) => {
      const id = form.getAttribute(attr);
      const status = $('.item-status', form);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        data.on_home = form.elements.on_home ? form.elements.on_home.checked : undefined;
        try {
          await api('POST', `${url}/${id}`, data);
          status.textContent = 'Збережено';
          setTimeout(() => { status.textContent = ''; }, 2500);
          const orig = form.elements.category ? [...form.elements.category.options].find((o) => o.defaultSelected)?.value : null;
          if (orig && data.category !== orig) location.reload();
        } catch (err) { status.textContent = err.message; }
      });
    });
  }
  wireItemForm('data-track-form', '/admin/api/tracks');
  wireItemForm('data-photo-form', '/admin/api/photos');

  $$('[data-replace]').forEach((input) => input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const status = $('.item-status', input.closest('form'));
    try {
      status.textContent = 'Аналізуємо файл…';
      const meta = await analyseAudio(file);
      const qs = new URLSearchParams({ duration: meta.duration.toFixed(2), peaks: meta.peaks });
      await uploadFile(`/admin/api/tracks/${input.dataset.replace}/file?${qs}`, file, (p) => { status.textContent = `Завантажуємо… ${Math.round(p * 100)}%`; });
      location.reload();
    } catch (err) { status.textContent = err.message; }
  }));

  $$('[data-delete]').forEach((btn) => btn.addEventListener('click', async () => {
    if (btn.dataset.confirm && !confirm(btn.dataset.confirm)) return;
    try {
      await api('DELETE', btn.dataset.delete);
      btn.closest('.item')?.remove();
    } catch (err) { alert(err.message); }
  }));

  $$('[data-sortable]').forEach((list) => {
    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-move]');
      if (!btn) return;
      const item = btn.closest('.item');
      const dir = Number(btn.dataset.move);
      const sibling = dir < 0 ? item.previousElementSibling : item.nextElementSibling;
      if (!sibling) return;
      if (dir < 0) list.insertBefore(item, sibling); else list.insertBefore(sibling, item);
      btn.focus();
      const ids = $$('.item', list).map((li) => Number(li.dataset.id));
      try { await api('POST', '/admin/api/reorder', { kind: list.dataset.sortable, ids }); } catch (err) { alert(err.message); }
    });
  });

  /* ---------- Списки в редакторі блоків ---------- */
  $$('[data-list]').forEach((fs) => {
    const items = $('.list-items', fs);
    const tpl = $('template', fs);
    const renumber = () => {
      $$('.list-item', items).forEach((li, i) => {
        $$('[name]', li).forEach((el) => { el.name = el.name.replace(/\.(\d+|__i__)\./, `.${i}.`); });
      });
    };
    $('[data-add-item]', fs).addEventListener('click', () => {
      items.insertAdjacentHTML('beforeend', tpl.innerHTML);
      renumber();
      $$('.list-item', items).at(-1).querySelector('input, textarea')?.focus();
    });
    items.addEventListener('click', (e) => {
      if (!e.target.closest('[data-remove-item]')) return;
      e.target.closest('.list-item').remove();
      renumber();
    });
  });
})();
