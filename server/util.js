export const TZ = process.env.APP_TZ || 'Europe/Moscow';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const fail = (status, message) => { throw new HttpError(status, message); };

const dateFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

// Сегодняшняя дата в часовом поясе школы, формат YYYY-MM-DD. NUR_TODAY позволяет зафиксировать дату в тестах.
export function today() {
  return process.env.NUR_TODAY || dateFmt.format(new Date());
}

export const monthOf = (date) => date.slice(0, 7);
export const currentMonth = () => monthOf(today());

export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function addDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 1 = понедельник … 7 = воскресенье
export function weekday(date) {
  const d = new Date(date + 'T00:00:00Z').getUTCDay();
  return d === 0 ? 7 : d;
}

export const weekStart = (date) => addDays(date, 1 - weekday(date));

export function monthEnd(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isMonth = (s) => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s);

export function str(v, max = 500) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

export function int(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function oneOf(v, allowed, field) {
  if (!Object.prototype.hasOwnProperty.call(allowed, v)) fail(400, `Неверное значение поля «${field}»`);
  return v;
}

export const digits = (s) => String(s || '').replace(/\D/g, '');
