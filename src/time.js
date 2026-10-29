// Робота з часом у часовому поясі студії (Europe/Kyiv) незалежно від часового поясу сервера.
const TZ = 'Europe/Kyiv';
const HOUR = 3600_000;
const DAY = 24 * HOUR;

const dtf = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

export { HOUR, DAY, TZ };

export function kyivParts(ms) {
  const o = {};
  for (const p of dtf.formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, min: +o.minute, s: +o.second };
}

function offsetMs(ms) {
  const p = kyivParts(ms);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(ms / 1000) * 1000;
}

/** Локальна дата+час у Києві → UTC мілісекунди. */
export function kyivToUtc(dateStr, hour = 0, minute = 0) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  let t = guess - offsetMs(guess);
  t = guess - offsetMs(t);
  return t;
}

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' у Києві для моменту часу. */
export function dateKey(ms) {
  const p = kyivParts(ms);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function timeLabel(ms) {
  const p = kyivParts(ms);
  return `${pad(p.h)}:${pad(p.min)}`;
}

export function isValidDateStr(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 0 = неділя … 6 = субота */
export function weekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function daysInMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const longDate = new Intl.DateTimeFormat('uk-UA', { timeZone: TZ, day: 'numeric', month: 'long', weekday: 'long' });
const shortDate = new Intl.DateTimeFormat('uk-UA', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTime = new Intl.DateTimeFormat('uk-UA', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const fmt = {
  long: (ms) => longDate.format(new Date(ms)),
  short: (ms) => shortDate.format(new Date(ms)),
  dateTime: (ms) => dateTime.format(new Date(ms)),
  time: timeLabel,
  range: (a, b) => `${timeLabel(a)}–${timeLabel(b)}`,
};
