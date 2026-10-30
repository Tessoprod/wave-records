# CLAUDE.md — пам'ятка для роботи з сайтом Wave Records

## Як публікується сайт
- Сайт живе на **GitHub Pages**. Публікує його GitHub Actions (`.github/workflows/pages.yml`) після кожного push у гілку `main`, а також за кнопкою «Run workflow».
- Статичні сторінки генерує `static/build.js` за шаблонами з `src/views/` (`layout.js` — шапка, меню, футер; `public.js` — сторінки). Результат лягає в `_site/`.
- На GitHub збірка отримує `BASE_PATH` і `BASE_URL`, бо сайт відкривається з підпапки (`ЛОГІН.github.io/wave-records/`).
- У репозиторії є ще повна серверна версія з адмінкою і базою SQLite (`server.js`, `src/routes/`, `src/views/admin.js`). На GitHub Pages вона не потрапляє, але шаблони спільні, тож зміни в `src/views/` впливають на обидві.
- Детальні інструкції для власника: `README.md` (серверна версія) і `GITHUB-PAGES.md` (публікація, треки, фото, тексти).

## Де контент
- `content/`:
  - `contacts.json` — контакти й графік;
  - `services.json` — послуги й ціни;
  - `texts.json` — тексти сторінок;
  - `settings.json` — назва, домен, ID аналітики;
  - `booking-link.txt` — посилання або код запису Google Calendar;
  - `privacy-policy.md`, `agreement.md` — юридичні сторінки.
- Треки: `media/audio/{vocal,music,b2b}`. Назва файлу — `01 - Артист - Назва.mp3`; число задає порядок.
- Фото: `media/photos/{about,gallery,record,produce,mix,master,release}`.
- Логотип: оригінал лежить у `media/photos/logo/Logo_White_PNG.png`. На сайті використовуються `public/img/logo.png`, `favicon.png`, `favicon.ico` і `apple-touch-icon.png`.

## Оформлення
- Стилі: `public/css/site.css`. Скрипти: `public/js/site.js` (`book.js` і `admin.*` — лише для серверної версії).
- Фірмові кольори: `#111111` (чорний фон), `#F5F5F5` (білий текст), `#FF2E2E` (червоний — дія, запис), `#292929` (графіт), `#356BFF` (синій — прослуховування, фокус).
- Шрифти: **Archivo Black** (заголовки) і **Inter** (текст).
- Сайт темний, логотип світлий; усе має добре виглядати на телефоні.

## Правила роботи
- Проєкт без npm-залежностей. **Не додавати жодних пакетів.**
- Після будь-яких змін запускати `node --disable-warning=ExperimentalWarning static/build.js` і переконуватися, що збірка проходить без помилок. Попередження про ffmpeg і порожній `booking-link.txt` — норма.
- JSON-файли в `content/` мають залишатися валідними. Лапки всередині тексту — лише «ялинки».
- Не комітити папки `data/` і `_site/`.
- **Не робити `git push` без прямого прохання власника.**
- Відповідати українською, просто, без технічного жаргону.
