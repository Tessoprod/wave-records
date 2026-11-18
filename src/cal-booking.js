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

/** id послуги без власного id: «блок-номер» (media-1, business-3…) — для ?service= і чекбоксів у списку. */
export const serviceId = (s, group, i) => (s && /^[a-z0-9-]+$/i.test(s.id || '') ? String(s.id) : `${group}-${i + 1}`);

/**
 * Перевіряє booking.json і збирає список послуг для сторінки запису.
 * catalog — увесь services.json ({ sound, media, business }) або (як раніше) лише масив блоку sound.
 * На сторінці запису — усі послуги з усіх блоків (у групах, як на сторінці Послуг). Календар Cal.com — лише в тих,
 * що є в event_types з заповненим значенням (запис на дату в студії); решта — дистанційні, деталі в Telegram.
 * packages — id пакетів, з яких можна обрати лише один; без поля — послуги, назва яких починається зі слова «Пакет».
 * Повертає { services: [{ id, group, name, price, duration, description, calLink, package }], issues: [...] }.
 */
export const GROUPS = ['sound', 'media', 'business'];
export function bookingServices(booking, catalog = {}) {
  const issues = [];
  if (Array.isArray(catalog)) catalog = { sound: catalog };
  if (!booking || typeof booking !== 'object' || Array.isArray(booking)) return { services: [], issues: ["файл має містити об'єкт з полями cal_username, event_types і texts"] };
  const types = booking.event_types;
  if (!types || typeof types !== 'object' || Array.isArray(types)) return { services: [], issues: [`поле «event_types» має бути об'єктом { "id послуги": "тип запису Cal.com" }`] };
  const user = String(booking.cal_username || '').trim();
  if (user && !SLUG.test(user.replace(/^@/, ''))) issues.push(`cal_username «${user}» — лише латинські літери, цифри, крапка, дефіс і підкреслення`);
  const byName = booking.packages === undefined;
  const packages = byName ? [] : booking.packages;
  if (!Array.isArray(packages)) issues.push('поле «packages» має бути списком id послуг-пакетів');
  const services = [];
  for (const group of GROUPS) {
    (Array.isArray(catalog[group]) ? catalog[group] : []).forEach((s, i) => {
      if (!s || !s.name) return;
      const id = serviceId(s, group, i);
      if (services.some((x) => x.id === id)) { issues.push(`services.json: id «${id}» повторюється`); return; }
      services.push({
        id, group, name: String(s.name), price: String(s.price || ''), duration: String(s.duration || ''),
        description: String(s.description || ''), calLink: '', package: byName ? /^пакет\s/i.test(String(s.name)) : Array.isArray(packages) && packages.includes(id),
      });
    });
  }
  const byId = new Map(services.map((s) => [s.id, s]));
  for (const [id, value] of Object.entries(types)) {
    const s = byId.get(id);
    if (!s) { issues.push(`event_types: послуги з id «${id}» немає в services.json`); continue; }
    const src = (catalog[s.group] || []).find((x, i) => serviceId(x, s.group, i) === id);
    if (src && src.button === 'telegram' && value) { issues.push(`event_types: послуга «${s.name}» на сторінці Послуг замовляється через Telegram — приберіть її звідси або поле «button» у services.json`); continue; }
    const { link, error } = calLink(value, user);
    if (error) { issues.push(`event_types → «${id}»: ${error}`); continue; }
    s.calLink = link;
  }
  if (Array.isArray(packages)) for (const id of packages) if (!byId.has(id)) issues.push(`packages: послуги з id «${id}» немає в services.json`);
  if (!services.length && !issues.length) issues.push('у services.json немає жодної послуги');
  return { services, issues };
}
