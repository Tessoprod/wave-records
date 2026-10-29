// Редаговані блоки сайту. Щоб додати новий блок у майбутньому — опишіть його тут,
// і він автоматично з'явиться в адмінці → «Блоки сайту».
import { q } from './db.js';
import { PRIVACY, AGREEMENT } from './legal.js';

const item = (title, text) => ({ title, text });

export const BLOCKS = [
  {
    key: 'home.hero', page: 'Головна', label: 'Перший екран',
    fields: [
      { name: 'line1', label: 'Заголовок, рядок 1', type: 'text' },
      { name: 'line2', label: 'Заголовок, рядок 2', type: 'text' },
      { name: 'subtitle', label: 'Підзаголовок', type: 'textarea' },
      { name: 'cta_book', label: 'Кнопка запису', type: 'text' },
      { name: 'cta_listen', label: 'Кнопка робіт', type: 'text' },
    ],
    defaults: {
      line1: 'WAVE RECORDS',
      line2: 'Від ідеї до релізу.',
      subtitle: 'Запис, продакшн, зведення та мастеринг у Wave Records.',
      cta_book: 'Записатися',
      cta_listen: 'Послухати роботи',
    },
  },
  {
    key: 'home.services', page: 'Головна', label: 'Послуги',
    fields: [
      { name: 'title', label: 'Заголовок', type: 'text' },
      { name: 'cta', label: 'Кнопка', type: 'text' },
    ],
    defaults: { title: 'Послуги', cta: 'Усі послуги' },
  },
  {
    key: 'home.works', page: 'Головна', label: 'Роботи',
    fields: [
      { name: 'title', label: 'Заголовок', type: 'text' },
      { name: 'text', label: 'Текст', type: 'textarea' },
      { name: 'cta', label: 'Кнопка', type: 'text' },
    ],
    defaults: {
      title: 'Роботи',
      text: 'Натисніть ▶ і послухайте, як звучать треки, записані та зведені у Wave.',
      cta: 'Портфоліо',
    },
  },
  {
    key: 'home.why', page: 'Головна', label: 'Чому Wave Records',
    fields: [
      { name: 'title', label: 'Заголовок', type: 'text' },
      { name: 'items', label: 'Пункти', type: 'list', item: [{ name: 'title', label: 'Назва', type: 'text' }, { name: 'text', label: 'Текст', type: 'textarea' }] },
    ],
    defaults: {
      title: 'Чому Wave Records',
      items: [
        item('Якість', 'Професійний запис та постпродакшн.'),
        item('Вайб', 'Студія, в якій комфортно працювати, а не просто «записати вокал».'),
        item('Допомога', 'Інженер допомагає довести пісню до результату.'),
        item('Від ідеї до релізу', 'Запис → продакшн → mix → master → дизайн → дистрибуція.'),
      ],
    },
  },
  {
    key: 'home.steps', page: 'Головна', label: 'Як це працює',
    fields: [
      { name: 'title', label: 'Заголовок', type: 'text' },
      { name: 'items', label: 'Кроки', type: 'list', item: [{ name: 'title', label: 'Крок', type: 'text' }] },
    ],
    defaults: {
      title: 'Як це працює',
      items: [
        { title: 'Обираєш послугу' },
        { title: 'Обираєш дату та час' },
        { title: 'Приходиш у Wave' },
        { title: 'Записуємо / створюємо' },
        { title: 'Отримуєш готовий результат' },
      ],
    },
  },
  {
    key: 'book.info', page: 'Запис', label: 'Інформація над формою',
    fields: [
      { name: 'title', label: 'Заголовок сторінки', type: 'text' },
      { name: 'address', label: 'Адреса', type: 'text' },
      { name: 'address_note', label: 'Примітка до адреси', type: 'text' },
      { name: 'price_note', label: 'Примітка про ціну', type: 'textarea' },
      { name: 'calendar_note', label: 'Підказка над календарем (версія для GitHub Pages)', type: 'textarea' },
      { name: 'success_title', label: 'Заголовок після успішного запису', type: 'text' },
      { name: 'success_text', label: 'Текст після успішного запису', type: 'textarea' },
    ],
    defaults: {
      title: 'Запис на сесію',
      address: 'м. Львів, вул. Братів Міхновських, 9',
      address_note: 'На місці вас зустрінуть.',
      price_note: 'Ціна на запис та аранжування/біт залежить від складності проєкту. Після підтвердження бронювання наш менеджер зв\'яжеться з Вами і буде домовлено остаточну ціну.',
      calendar_note: 'Оберіть зручний день і час. У коментарі до запису вкажіть послугу — менеджер зв\'яжеться з вами, щоб узгодити деталі.',
      success_title: 'Запис підтверджено',
      success_text: 'Час закріплено за вами. Менеджер зв\'яжеться з вами, щоб узгодити деталі та остаточну ціну.',
    },
  },
  {
    key: 'portfolio', page: 'Портфоліо', label: 'Розділи портфоліо',
    fields: [
      { name: 'title', label: 'Заголовок сторінки', type: 'text' },
      { name: 'text', label: 'Вступ', type: 'textarea' },
      { name: 'vocal_title', label: 'Розділ 1 — назва', type: 'text' },
      { name: 'vocal_sub', label: 'Розділ 1 — підпис', type: 'text' },
      { name: 'music_title', label: 'Розділ 2 — назва', type: 'text' },
      { name: 'music_sub', label: 'Розділ 2 — підпис', type: 'text' },
      { name: 'b2b_title', label: 'Розділ 3 — назва', type: 'text' },
      { name: 'b2b_sub', label: 'Розділ 3 — підпис', type: 'text' },
    ],
    defaults: {
      title: 'Портфоліо',
      text: 'Зведення вокалу, біти та музика для брендів — усе записано й зібрано у Wave.',
      vocal_title: 'Vocal Mixing', vocal_sub: 'Зведення вокалу',
      music_title: 'Music', music_sub: 'Аранжування / біт',
      b2b_title: 'B2B', b2b_sub: 'Продакшн для бізнесів',
    },
  },
  {
    key: 'services', page: 'Послуги', label: 'Сторінка послуг',
    fields: [
      { name: 'title', label: 'Заголовок сторінки', type: 'text' },
      { name: 'text', label: 'Вступ', type: 'textarea' },
      { name: 'sound_title', label: 'Блок 1 — назва', type: 'text' },
      { name: 'media_title', label: 'Блок 2 — назва', type: 'text' },
      { name: 'media_cta', label: 'Кнопка для Media | PR', type: 'text' },
    ],
    defaults: {
      title: 'Послуги',
      text: 'Від години запису до готового релізу з обкладинкою та розсилкою.',
      sound_title: 'Sound',
      media_title: 'Media | PR',
      media_cta: 'Замовити в Telegram',
    },
  },
  {
    key: 'about.intro', page: 'Про студію', label: '01 / Intro',
    fields: [
      { name: 'title', label: 'Заголовок', type: 'text' },
      { name: 'text', label: 'Текст', type: 'textarea' },
    ],
    defaults: {
      title: 'Ми допомагаємо ідеям стати музикою.',
      text: 'Wave Records — студія звукозапису та музичного продакшну у Львові. Від першого запису до готового релізу.',
    },
  },
  {
    key: 'about.philosophy', page: 'Про студію', label: '02 / Philosophy',
    fields: [
      { name: 'title', label: 'Заголовок', type: 'text' },
      { name: 'lead', label: 'Вступ', type: 'textarea' },
      { name: 'items', label: 'Принципи', type: 'list', item: [{ name: 'title', label: 'Назва', type: 'text' }, { name: 'text', label: 'Текст', type: 'textarea' }] },
    ],
    defaults: {
      title: 'Хороший запис — це лише початок.',
      lead: 'Не просто оренда студії, а допомога артисту в реалізації задуму.',
      items: [
        item('Ідея важливіша за обладнання', 'Техніка допомагає досягти результату, але головне — задум артиста і те, як ми допоможемо його реалізувати.'),
        item('Ми працюємо разом', 'Допомагаємо з виконанням, подачею та звучанням. Не просто натискаємо кнопку запису, а залучаємося до процесу.'),
        item('Від ідеї до релізу', 'Запис, продакшн, зведення, мастеринг і, за потреби, допомога з випуском музики.'),
        item('Комфорт творить результат', 'Атмосфера, комунікація та відчуття, що ти можеш експериментувати й шукати власне звучання.'),
      ],
    },
  },
  {
    key: 'about.process', page: 'Про студію', label: '03 / Process',
    fields: [
      { name: 'title', label: 'Заголовок', type: 'text' },
      { name: 'lead', label: 'Вступ', type: 'textarea' },
      { name: 'items', label: 'Етапи', type: 'list', item: [{ name: 'title', label: 'Назва', type: 'text' }, { name: 'text', label: 'Текст', type: 'textarea' }] },
    ],
    defaults: {
      title: 'Як ми працюємо',
      lead: 'Від першого запису до фінального звучання.',
      items: [
        item('Record', 'Записуємо вокал та інструменти, працюємо над виконанням і подачею.'),
        item('Produce', 'Допомагаємо сформувати звучання, створюємо біти й аранжування.'),
        item('Mix', 'Об\'єднуємо всі елементи треку в цілісне звучання.'),
        item('Master', 'Готуємо фінальну версію треку до публікації.'),
        item('Release', 'За потреби допомагаємо з дистрибуцією та іншими етапами випуску.'),
      ],
    },
  },
  {
    key: 'about.atmosphere', page: 'Про студію', label: '04 / Atmosphere',
    fields: [
      { name: 'title', label: 'Заголовок', type: 'text' },
      { name: 'text', label: 'Текст', type: 'textarea' },
    ],
    defaults: {
      title: 'Атмосфера студії',
      text: 'Простір, у якому хочеться залишитися ще на один дубль.',
    },
  },
  {
    key: 'about.cta', page: 'Про студію', label: 'Фінальний блок',
    fields: [
      { name: 'label', label: 'Підпис', type: 'text' },
      { name: 'title', label: 'Заголовок', type: 'text' },
      { name: 'text', label: 'Текст', type: 'textarea' },
      { name: 'cta_book', label: 'Кнопка 1', type: 'text' },
      { name: 'cta_services', label: 'Кнопка 2', type: 'text' },
    ],
    defaults: {
      label: 'Your next step / 002',
      title: 'Є ідея? Давайте над нею працювати.',
      text: 'Неважливо, чи це перший запис, чи трек, який майже готовий до релізу. Розкажіть нам про свій задум.',
      cta_book: 'Записатися',
      cta_services: 'Усі послуги',
    },
  },
  {
    key: 'contacts', page: 'Контакти', label: 'Контактна інформація',
    fields: [
      { name: 'title', label: 'Заголовок сторінки', type: 'text' },
      { name: 'studio', label: 'Назва студії', type: 'text' },
      { name: 'city', label: 'Місто', type: 'text' },
      { name: 'address', label: 'Адреса', type: 'text' },
      { name: 'phone', label: 'Телефон', type: 'text' },
      { name: 'email', label: 'Email', type: 'text' },
      { name: 'schedule_days', label: 'Дні роботи', type: 'text' },
      { name: 'schedule_hours', label: 'Години роботи', type: 'text' },
      { name: 'telegram', label: 'Telegram (нікнейм без @)', type: 'text' },
      { name: 'instagram', label: 'Instagram (нікнейм без @, необов\'язково)', type: 'text' },
    ],
    defaults: {
      title: 'Контактна інформація',
      studio: 'Wave Records',
      city: 'Львів, Україна',
      address: 'вул. Братів Міхновських, 9',
      phone: '+380 XX XXX XX XX',
      email: 'hello@waverecords.ua',
      schedule_days: 'Пн–Пт',
      schedule_hours: '10:00–20:00',
      telegram: 'nick_name',
      instagram: '',
    },
  },
  {
    key: 'legal.privacy', page: 'Юридичні сторінки', label: 'Політика конфіденційності',
    fields: [
      { name: 'title', label: 'Заголовок', type: 'text' },
      { name: 'updated', label: 'Дата оновлення', type: 'text' },
      { name: 'body', label: 'Текст (## заголовок, - пункт списку, **жирний**)', type: 'markdown' },
    ],
    defaults: { title: 'Політика конфіденційності', updated: '14 жовтня 2026 року', body: PRIVACY },
  },
  {
    key: 'legal.agreement', page: 'Юридичні сторінки', label: 'Договір публічної оферти',
    fields: [
      { name: 'title', label: 'Заголовок', type: 'text' },
      { name: 'updated', label: 'Дата оновлення', type: 'text' },
      { name: 'body', label: 'Текст (## заголовок, - пункт списку, **жирний**)', type: 'markdown' },
    ],
    defaults: { title: 'Договір публічної оферти', updated: '14 жовтня 2026 року', body: AGREEMENT },
  },
];

export const BLOCK_MAP = Object.fromEntries(BLOCKS.map((b) => [b.key, b]));

/** Повертає дані блоку (збережені поверх значень за замовчуванням) + прапорець видимості. */
export function block(key) {
  const def = BLOCK_MAP[key];
  if (!def) throw new Error(`Невідомий блок ${key}`);
  const row = q('SELECT data, visible FROM content WHERE key = ?').get(key);
  let saved = {};
  if (row) { try { saved = JSON.parse(row.data); } catch { saved = {}; } }
  return { ...structuredClone(def.defaults), ...saved, visible: row ? !!row.visible : true };
}

export function saveBlock(key, data, visible) {
  const def = BLOCK_MAP[key];
  if (!def) throw new Error(`Невідомий блок ${key}`);
  const clean = {};
  for (const f of def.fields) {
    const v = data[f.name];
    if (f.type === 'list') {
      clean[f.name] = (Array.isArray(v) ? v : []).map((it) => {
        const o = {};
        for (const sf of f.item) o[sf.name] = String(it?.[sf.name] ?? '').slice(0, 2000);
        return o;
      }).filter((o) => Object.values(o).some((x) => x.trim()));
    } else {
      clean[f.name] = String(v ?? '').slice(0, f.type === 'markdown' ? 100_000 : 5000);
    }
  }
  q(`INSERT INTO content(key, data, visible, updated_at) VALUES(?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET data = excluded.data, visible = excluded.visible, updated_at = excluded.updated_at`)
    .run(key, JSON.stringify(clean), visible ? 1 : 0, Date.now());
}

export function resetBlock(key) {
  q('DELETE FROM content WHERE key = ?').run(key);
}
