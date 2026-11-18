// Тести налаштувань онлайн-запису через Cal.com (content/booking.json → сторінка /book).
// Запуск: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calLink, bookingServices } from '../src/cal-booking.js';

test('calLink: коротка назва, «ім\'я/назва» і повне посилання', () => {
  assert.deepEqual(calLink('', 'wave'), { link: '' });
  assert.deepEqual(calLink('recording', 'wave'), { link: 'wave/recording' });
  assert.deepEqual(calLink('recording', '@wave'), { link: 'wave/recording' });
  assert.deepEqual(calLink('other/mix', 'wave'), { link: 'other/mix' });
  assert.deepEqual(calLink('https://cal.com/wave/mastering?month=2026-12', ''), { link: 'wave/mastering' });
  assert.deepEqual(calLink('https://app.cal.com/wave/mastering/', ''), { link: 'wave/mastering' });
  assert.ok(calLink('recording', '').error, 'коротка назва без імені — помилка');
  assert.ok(calLink('https://calendly.com/wave/x', '').error, 'не cal.com — помилка');
  assert.ok(calLink('wave/a/b', '').error);
  assert.ok(calLink('wave/"><script>', '').error);
});

test('bookingServices: усі послуги з усіх блоків, календар — лише в event_types, пакети', () => {
  const catalog = {
    sound: [
      { id: 'recording', name: 'Година запису', price: '700 грн / год', duration: '1–4 год', description: 'Опис' },
      { id: 'wave-plus', name: 'Пакет Wave Plus', price: '3 999 грн', duration: '2 год' },
      { id: 'mastering', name: 'Мастеринг', price: '1 000 грн', duration: '1 год' },
      { id: 'distribution', name: 'Дистрибуція', price: '500 грн', button: 'telegram' },
    ],
    media: [{ name: 'Обкладинка', price: '1 100 грн' }],
    business: [{ name: 'Подкасти', price: 'Ціна за домовленістю' }],
  };
  const ok = bookingServices({ cal_username: 'wave', event_types: { recording: 'rec', 'wave-plus': 'plus' }, packages: ['wave-plus'] }, catalog);
  assert.deepEqual(ok.issues, []);
  assert.deepEqual(ok.services.map((s) => [s.id, s.group, s.calLink, s.package]), [
    ['recording', 'sound', 'wave/rec', false],
    ['wave-plus', 'sound', 'wave/plus', true],
    ['mastering', 'sound', '', false],
    ['distribution', 'sound', '', false],
    ['media-1', 'media', '', false],
    ['business-1', 'business', '', false],
  ]);
  assert.equal(ok.services[0].description, 'Опис');
  const bad = bookingServices({ cal_username: '', event_types: { nope: 'x', distribution: 'd', recording: 'rec' }, packages: ['zzz'] }, catalog);
  assert.equal(bad.issues.length, 4);
  assert.equal(bookingServices({ event_types: [] }, catalog).issues.length, 1);
  // Старий виклик — лише блок sound
  assert.equal(bookingServices({ cal_username: 'wave', event_types: { recording: 'rec' } }, catalog.sound).services.length, 4);
});

test('content/booking.json валідний: календар лише в запису й пакетах, два пакети', () => {
  const booking = JSON.parse(fs.readFileSync(new URL('../content/booking.json', import.meta.url), 'utf8'));
  const services = JSON.parse(fs.readFileSync(new URL('../content/services.json', import.meta.url), 'utf8'));
  const { services: list, issues } = bookingServices(booking, services);
  assert.deepEqual(issues, []);
  const total = ['sound', 'media', 'business'].reduce((n, g) => n + services[g].length, 0);
  assert.equal(list.length, total, 'на сторінці запису — усі послуги');
  assert.deepEqual(list.filter((s) => s.calLink).map((s) => s.id), ['recording', 'wave-plus', 'wave-pro']);
  assert.deepEqual(list.filter((s) => s.package).map((s) => s.id), ['wave-plus', 'wave-pro']);
  for (const s of list) assert.ok(s.name && s.price, `у послуги ${s.id} є назва й ціна`);
  for (const s of list.filter((x) => x.calLink)) assert.ok(s.duration, `у послуги ${s.id} є тривалість`);
  // Кнопки «Записатися» на головній ведуть на послуги зі сторінки запису
  for (const h of services.home) if (h.book) assert.ok(list.some((s) => s.id === h.book), `home: book «${h.book}»`);
  for (const k of ['remote_one', 'remote_many', 'package_limit']) assert.ok(booking.texts[k], `texts.${k}`);
});
