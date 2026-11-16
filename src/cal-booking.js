// Онлайн-запис через Cal.com для сторінки /book (статична версія для GitHub Pages).
// Налаштування — content/booking.json: ім'я на Cal.com і відповідність «id послуги → тип запису Cal.com».
// Назва, тривалість і ціна послуги беруться з content/services.json (блок sound) — тут вони не повторюються.

const SLUG = /^[a-z0-9][a-z0-9._-]*$/i;

/**
 * Значення з event_types → шлях типу запису для Cal.com («ім'я/назва»), '' — ще не заповнено.
 * Приймає: «назва» (разом з cal_username), «ім'я/назва», «https://cal.com/ім'я/назва» (і app.cal.com).
 * Неправильне значення — { error }.
 */
export function calLink(value, username = '') {
  let v = String(value || '').trim();
  if (!v) return { link: '' };
  const url = v.match(/^https?:\/\/(?:www\.|app\.)?cal\.com\/(.+)$/i);
  if (/^https?:\/\//i.test(v) && !url) return { error: `посилання «${v}» не схоже на адресу cal.com` };
  if (url) v = url[1];
  v = v.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
  const parts = v.split('/');
  if (parts.length === 1) {
    const user = String(username || '').trim().replace(/^@/, '');
    if (!user) return { error: `для «${v}» потрібне ім'я на Cal.com (поле «cal_username») або повне посилання` };
    parts.unshift(user);
  }
  if (parts.length !== 2 || !parts.every((p) => SLUG.test(p))) return { error: `«${value}» — очікується «назва», «ім'я/назва» або https://cal.com/ім'я/назва` };
  return { link: parts.join('/') };
}

/**
 * Перевіряє booking.json і збирає список послуг для сторінки запису.
 * sound — блок sound із services.json. Повертає { services: [{ id, name, price, duration, calLink }], issues: [...] }.
 */
export function bookingServices(booking, sound = []) {
  const issues = [];
  if (!booking || typeof booking !== 'object' || Array.isArray(booking)) return { services: [], issues: ['файл має містити об\'єкт з полями cal_username, event_types і texts'] };
  const types = booking.event_types;
  if (!types || typeof types !== 'object' || Array.isArray(types)) return { services: [], issues: ['поле «event_types» має бути об\'єктом { "id послуги": "тип запису Cal.com" }'] };
  const user = String(booking.cal_username || '').trim();
  if (user && !SLUG.test(user.replace(/^@/, ''))) issues.push(`cal_username «${user}» — лише латинські літери, цифри, крапка, дефіс і підкреслення`);
  const byId = new Map(sound.filter((s) => s && s.id).map((s) => [String(s.id), s]));
  const services = [];
  for (const [id, value] of Object.entries(types)) {
    const s = byId.get(id);
    if (!s) { issues.push(`event_types: послуги з id «${id}» немає в services.json (блок sound)`); continue; }
    if (s.button === 'telegram') { issues.push(`event_types: послуга «${s.name}» на сторінці Послуг замовляється через Telegram — приберіть її звідси або поле «button» у services.json`); continue; }
    const { link, error } = calLink(value, user);
    if (error) { issues.push(`event_types → «${id}»: ${error}`); continue; }
    services.push({ id, name: String(s.name || ''), price: String(s.price || ''), duration: String(s.duration || ''), calLink: link });
  }
  if (!services.length && !issues.length) issues.push('у «event_types» немає жодної послуги');
  return { services, issues };
}
