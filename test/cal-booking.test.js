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

test('bookingServices: дані послуги — з services.json, порядок — з booking.json', () => {
  const sound = [
    { id: 'mastering', name: 'Мастеринг', price: '1 000 грн', duration: '1 год' },
    { id: 'recording', name: 'Година запису', price: '700 грн / год', duration: 'від 1 год' },
    { id: 'distribution', name: 'Дистрибуція', price: '500 грн', button: 'telegram' },
  ];
  const ok = bookingServices({ cal_username: 'wave', event_types: { recording: 'rec', mastering: '' } }, sound);
  assert.deepEqual(ok.issues, []);
  assert.deepEqual(ok.services, [
    { id: 'recording', name: 'Година запису', price: '700 грн / год', duration: 'від 1 год', calLink: 'wave/rec' },
    { id: 'mastering', name: 'Мастеринг', price: '1 000 грн', duration: '1 год', calLink: '' },
  ]);
  const bad = bookingServices({ cal_username: '', event_types: { nope: '', distribution: '', recording: 'rec' } }, sound);
  assert.equal(bad.issues.length, 3);
  assert.equal(bookingServices({ event_types: [] }, sound).issues.length, 1);
});

test('content/booking.json валідний і посилається на наявні послуги', () => {
  const booking = JSON.parse(fs.readFileSync(new URL('../content/booking.json', import.meta.url), 'utf8'));
  const services = JSON.parse(fs.readFileSync(new URL('../content/services.json', import.meta.url), 'utf8'));
  const { services: list, issues } = bookingServices(booking, services.sound);
  assert.deepEqual(issues, []);
  assert.ok(list.length > 0);
  for (const s of list) assert.ok(s.name && s.price && s.duration, `у послуги ${s.id} є назва, ціна й тривалість`);
  // Кнопки «Записатися» на головній ведуть на послуги, для яких є онлайн-запис
  for (const h of services.home) if (h.book) assert.ok(list.some((s) => s.id === h.book), `home: book «${h.book}»`);
});
