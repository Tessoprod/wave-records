import { kvGet, kvSet } from './db.js';

export const DEFAULT_SETTINGS = {
  company: 'Wave Records',
  domain: 'waverecords.ua',
  gtm_id: '',
  ga4_id: '',
  pixel_id: '',
  // Робочі години за днями тижня (0 = неділя). Порожньо = вихідний.
  hours: { 0: '', 1: '10-20', 2: '10-20', 3: '10-20', 4: '10-20', 5: '10-20', 6: '' },
  lead_hours: 3,      // не раніше ніж за N годин від поточного моменту
  horizon_days: 60,   // наскільки далеко вперед можна бронювати
};

let cached = null;

export function getSettings() {
  if (!cached) {
    const saved = kvGet('settings', {}) || {};
    cached = { ...DEFAULT_SETTINGS, ...saved, hours: { ...DEFAULT_SETTINGS.hours, ...(saved.hours || {}) } };
  }
  return cached;
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  kvSet('settings', next);
  cached = null;
  return getSettings();
}

/** [відкриття, закриття] у годинах або null, якщо вихідний. */
export function workHours(dow) {
  const raw = String(getSettings().hours[dow] || '').trim();
  const m = raw.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})$/);
  if (!m) return null;
  const open = Number(m[1]);
  const close = Number(m[2]);
  if (!(open >= 0 && close <= 24 && close > open)) return null;
  return [open, close];
}
