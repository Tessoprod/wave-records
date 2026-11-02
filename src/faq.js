// Питання та відповіді: контент лежить у content/faq.json (і для GitHub Pages, і для повної версії).
// Повна версія читає файл при кожному відкритті сторінки — зміни видно без перезапуску.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

/** Перевіряє структуру faq.json. Повертає список зрозумілих повідомлень про проблеми (порожній — усе гаразд). */
export function checkFaq(faq) {
  const issues = [];
  if (!faq || typeof faq !== 'object' || Array.isArray(faq)) return ['файл має містити об\'єкт з полями title, lead, groups'];
  if (!Array.isArray(faq.groups) || !faq.groups.length) issues.push('немає жодної групи питань (поле «groups»)');
  const ids = new Set();
  (faq.groups || []).forEach((g, gi) => {
    const where = `група №${gi + 1}${g && g.title ? ` «${g.title}»` : ''}`;
    if (!g || typeof g !== 'object') { issues.push(`${where}: має бути об'єктом`); return; }
    if (!g.id) issues.push(`${where}: немає поля «id»`);
    else if (!/^[a-z0-9-]+$/i.test(g.id)) issues.push(`${where}: id «${g.id}» — лише латинські літери, цифри й дефіс`);
    else if (ids.has(g.id)) issues.push(`${where}: id «${g.id}» повторюється`);
    ids.add(g.id);
    if (!Array.isArray(g.items) || !g.items.length) issues.push(`${where}: немає питань (поле «items»)`);
    (g.items || []).forEach((it, ii) => {
      const w = `${where}, питання №${ii + 1}`;
      if (!it || !it.q) issues.push(`${w}: немає тексту питання (поле «q»)`);
      if (!it || !it.a) issues.push(`${w}: немає відповіді (поле «a»)`);
      if (it && it.id) {
        if (!/^[a-z0-9-]+$/i.test(it.id)) issues.push(`${w}: id «${it.id}» — лише латинські літери, цифри й дефіс`);
        else if (ids.has(it.id)) issues.push(`${w}: id «${it.id}» повторюється`);
        ids.add(it.id);
      }
    });
  });
  for (const id of faq.home || []) if (!ids.has(id)) issues.push(`у списку «home» є «${id}», але такого питання немає`);
  return issues;
}

/** Повна версія: читає content/faq.json; якщо файлу немає чи він зіпсований — сторінка однаково відкривається. */
export function loadFaq() {
  try {
    const text = fs.readFileSync(path.join(config.root, 'content', 'faq.json'), 'utf8').replace(/^﻿/, '');
    return JSON.parse(text);
  } catch (err) {
    console.error('content/faq.json не прочитано:', err.message);
    return null;
  }
}
