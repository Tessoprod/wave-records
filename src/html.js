// Мінімальний HTML-шаблонізатор з автоматичним екрануванням.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s ?? ''));

function render(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new Raw(out);
}

/** Перенос рядків → <br>, з екрануванням. */
export const nl2br = (s) => raw(esc(s).replace(/\r?\n/g, '<br>'));

/**
 * Дуже простий Markdown для юридичних сторінок:
 * ## заголовок, ### підзаголовок, - список, **жирний**, порожній рядок = новий абзац.
 */
export function miniMarkdown(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  const out = [];
  let para = [];
  let list = null;
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<ul>${list.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`); list = null; } };
  for (const line of lines) {
    const t = line.trim();
    if (!t) { flushPara(); flushList(); continue; }
    let m;
    if ((m = t.match(/^(#{2,3})\s+(.*)$/))) {
      flushPara(); flushList();
      const lvl = m[1].length;
      out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
    } else if ((m = t.match(/^[-–•]\s*(.*)$/))) {
      flushPara();
      (list ||= []).push(m[1]);
    } else {
      flushList();
      para.push(t);
    }
  }
  flushPara(); flushList();
  return raw(out.join('\n'));
}
