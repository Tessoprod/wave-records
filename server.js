// Точка запуску сайту: node server.js
import { config } from './src/config.js';
import { createServer } from './src/app.js';
import { initAdmin } from './src/auth.js';
import * as gcal from './src/gcal.js';
import { prune } from './src/stats.js';

process.on('uncaughtException', (err) => {
  console.error('\nПомилка під час роботи сайту:', err);
});

initAdmin();
const server = createServer();
server.requestTimeout = 0;      // великі WAV-файли завантажуються довго
server.headersTimeout = 60_000;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nПорт ${config.port} вже зайнятий. Можливо, сайт уже запущено в іншому вікні.`);
    console.error('Закрийте те вікно або запустіть на іншому порту: set PORT=3001 && npm start\n');
  } else {
    console.error('\nНе вдалося запустити сервер:', err.message);
  }
  process.exit(1);
});

// Без явного HOST слухаємо всі адреси, включно з IPv6 (::1) — на Windows localhost часто веде саме туди.
const onListen = () => {
  console.log('\n================================================================');
  console.log(' Сайт Wave Records запущено!');
  console.log(`   Сайт:    http://localhost:${config.port}`);
  console.log(`   Адмінка: http://localhost:${config.port}/admin`);
  console.log(' Не закривайте це вікно, поки користуєтесь сайтом.');
  console.log(' Щоб зупинити — натисніть Ctrl+C.');
  console.log('================================================================\n');
  gcal.start();
};
if (config.host) server.listen(config.port, config.host, onListen);
else server.listen(config.port, onListen);

setInterval(prune, 24 * 3600_000).unref();
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(); process.exit(0); });
