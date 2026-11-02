Шрифти сайту (woff2, лише потрібні накреслення й набори: кирилиця і латиниця).
Підключені через @font-face на початку public/css/site.css; шрифти заголовків заздалегідь вантажаться
через <link rel="preload"> у src/views/layout.js.

Джерело — npm-пакети Fontsource 5.3.0 (https://fontsource.org), ліцензія SIL Open Font License 1.1:
  Archivo Black — @fontsource/archivo-black (лише латиниця; кирилиці в цьому шрифті немає)   → archivo-black-OFL.txt
  Inter Tight 800, 900 — @fontsource/inter-tight (кирилиця в заголовках)                      → inter-tight-OFL.txt
  Inter 400, 500, 600, 700 — @fontsource/inter (основний текст)                               → inter-OFL.txt

Як оновити: npm pack @fontsource/<назва> у тимчасовій папці, розпакувати й скопіювати потрібні
files/<назва>-<набір>-<вага>-normal.woff2 сюди; unicode-range взяти з <вага>.css того ж пакета.
Пакети в package.json не додавати.
