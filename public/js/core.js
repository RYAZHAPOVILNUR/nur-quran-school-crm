// Общие помощники интерфейса: шаблоны, запросы к серверу, окна, форматирование.
import { MONTHS, MONTHS_GEN, WEEKDAYS_FULL, rub, plural } from '/shared/labels.js';

export const state = { me: null };

// ---------- Безопасные шаблоны ----------
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function renderVal(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(renderVal).join('');
  return esc(v);
}
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += renderVal(vals[i]); });
  return new Raw(out);
}

// ---------- Иконки ----------
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  users: '<circle cx="9" cy="8" r="3.6"/><path d="M2.5 20.5c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5"/><path d="M15.5 4.6a3.6 3.6 0 0 1 0 6.8"/><path d="M21.5 20.5c0-2.8-1.6-5.1-4-6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3"/><rect x="3" y="8" width="18" height="13" rx="2.5"/><circle cx="16.5" cy="14.5" r="1.3"/>',
  inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13l2.5 8v5.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V13z"/>',
  book: '<path d="M2.5 5.5c3-1.6 6.6-1.6 9.5.8 2.9-2.4 6.5-2.4 9.5-.8v13.5c-3-1.6-6.6-1.6-9.5.8-2.9-2.4-6.5-2.4-9.5-.8z"/><path d="M12 6.3v13.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 2.5h6v3.5H9z"/><path d="m9 13.5 2 2 4-4"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  phone: '<path d="M5 4h3.5l2 5-2.4 1.5a11 11 0 0 0 5.4 5.4L15 13.5l5 2V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  message: '<path d="M20.5 12a8.5 8.5 0 0 1-12.3 7.6L3.5 21l1.4-4.6A8.5 8.5 0 1 1 20.5 12z"/>',
  send: '<path d="m21 3-8.5 18-2.5-7.5L2.5 11z"/><path d="M21 3 10 13.5"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  logout: '<path d="M9 21H5.5A2.5 2.5 0 0 1 3 18.5v-13A2.5 2.5 0 0 1 5.5 3H9"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chart: '<path d="M4 20V11M10 20V5M16 20v-6M21 20H3"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  archive: '<rect x="3" y="4" width="18" height="4.5" rx="1"/><path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5M10 12.5h4"/>',
  online: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  place: '<path d="M12 21s-7-6-7-11.5a7 7 0 0 1 14 0C19 15 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  download: '<path d="M12 4v11m-5-5 5 5 5-5M4 20h16"/>',
  teacher: '<circle cx="12" cy="7.5" r="3.5"/><path d="M5 21v-2.5A5.5 5.5 0 0 1 10.5 13h3a5.5 5.5 0 0 1 5.5 5.5V21"/><path d="M12 13v4"/>',
  family: '<circle cx="8" cy="7" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M2.5 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6"/><path d="M14 20c0-2.6 1.4-4.8 3-4.8s3.5 2.2 3.5 4.8"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.7-2.7-3-6-3"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
};
export const icon = (name, cls = '') => raw(`<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`);
export const logo = (cls = 'brand-mark') => raw(`<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true">
  <g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round">
    <rect x="11" y="11" width="26" height="26" rx="1.5"/><rect x="11" y="11" width="26" height="26" rx="1.5" transform="rotate(45 24 24)"/>
  </g><circle cx="24" cy="24" r="5" fill="currentColor"/></svg>`);

// ---------- Сервер ----------
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* пустой ответ */ }
  if (res.status === 401 && !path.startsWith('/api/auth')) {
    state.me = null;
    window.dispatchEvent(new Event('nur:logout'));
  }
  if (!res.ok) throw new Error(data?.error || 'Что-то пошло не так. Попробуйте ещё раз.');
  return data;
}

// ---------- Навигация ----------
export const go = (path) => { location.hash = '#' + path; };
export const refresh = () => { window.__keepScroll = true; window.dispatchEvent(new Event('hashchange')); };

// ---------- Форматирование ----------
export { rub, plural };
export const fmtDate = (d) => (d ? d.slice(0, 10).split('-').reverse().join('.') : '—');
export function fmtDay(d) {
  if (!d) return '—';
  const [, m, day] = d.slice(0, 10).split('-').map(Number);
  return `${day} ${MONTHS_GEN[m - 1]}`;
}
export function fmtDayShort(d) {
  if (!d) return '—';
  const [, m, day] = d.slice(0, 10).split('-').map(Number);
  return `${day}.${String(m).padStart(2, '0')}`;
}
export function todayStr() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date());
}
export function addDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
export function daysAgo(dateTime) {
  const d = dateTime.slice(0, 10);
  const diff = Math.round((new Date(todayStr() + 'T00:00:00Z') - new Date(d + 'T00:00:00Z')) / 864e5);
  if (diff <= 0) return 'сегодня';
  if (diff === 1) return 'вчера';
  return `${diff} ${plural(diff, 'день', 'дня', 'дней')} назад`;
}
export function weekdayName(date) {
  const d = new Date(date + 'T00:00:00Z').getUTCDay();
  return WEEKDAYS_FULL[d === 0 ? 7 : d];
}
export const monthName = (m) => MONTHS[Number(m.slice(5, 7)) - 1];
export function monthTitle(m) {
  const name = monthName(m);
  return `${name[0].toUpperCase()}${name.slice(1)} ${m.slice(0, 4)}`;
}
export function age(birthYear) {
  if (!birthYear) return '';
  const a = Number(todayStr().slice(0, 4)) - birthYear;
  return `${a} ${plural(a, 'год', 'года', 'лет')}`;
}
export const initials = (name) => (name || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
export const avatar = (name, gender, cls = '') => html`<span class="avatar ${gender === 'f' ? 'f' : ''} ${cls}">${initials(name)}</span>`;
export const phoneDigits = (p) => String(p || '').replace(/\D/g, '');
export function waLink(phone, text = '') {
  let d = phoneDigits(phone);
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
export const tgLink = (username) => `https://t.me/${String(username || '').replace(/^@/, '')}`;

export function contactButtons(c, { text = '' } = {}) {
  return html`<div class="contact-actions">
    ${c.phone ? html`<a class="btn sm" href="tel:${phoneDigits(c.phone)}">${icon('phone', 'sm')} Позвонить</a>` : ''}
    ${c.whatsapp || c.phone ? html`<a class="btn sm" href="${waLink(c.whatsapp || c.phone, text)}" target="_blank" rel="noopener">${icon('message', 'sm')} WhatsApp</a>` : ''}
    ${c.telegram ? html`<a class="btn sm" href="${tgLink(c.telegram)}" target="_blank" rel="noopener">${icon('send', 'sm')} Telegram</a>` : ''}
  </div>`;
}

// ---------- Уведомления ----------
export function toast(message, type = '') {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 3200);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

// ---------- Формы ----------
export function readForm(form) {
  const data = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') { data[el.name] = el.checked; continue; }
    if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; continue; }
    data[el.name] = el.value.trim();
  }
  return data;
}

export function options(map, selected, { empty } = {}) {
  return html`${empty ? html`<option value="">${empty}</option>` : ''}${Object.entries(map).map(([v, l]) => html`<option value="${v}" ${String(v) === String(selected ?? '') ? raw('selected') : ''}>${l}</option>`)}`;
}

export function seg(name, map, selected) {
  return html`<div class="seg" role="radiogroup">${Object.entries(map).map(([v, l]) => html`
    <label><input type="radio" name="${name}" value="${v}" ${v === selected ? raw('checked') : ''}><span>${l}</span></label>`)}</div>`;
}

// Окно: снизу на телефоне, по центру на компьютере. onSubmit может вернуть false, чтобы не закрывать.
export function sheet({ title, body, submit = 'Сохранить', onSubmit, wide = false, danger = false, footer = null, onOpen }) {
  const dlg = document.createElement('dialog');
  dlg.className = `sheet ${wide ? 'wide' : ''}`;
  dlg.innerHTML = String(html`<form class="sheet-inner" novalidate>
    <div class="sheet-head"><h2>${title}</h2><button type="button" class="icon-btn" data-close aria-label="Закрыть">${icon('x')}</button></div>
    <div class="sheet-body">${body}</div>
    <div class="sheet-foot">
      <div class="form-error" role="alert"></div>
      ${footer || (onSubmit ? html`<button type="submit" class="btn ${danger ? 'danger' : 'primary'} block">${submit}</button>` : '')}
    </div>
  </form>`);
  document.body.append(dlg);
  const form = dlg.querySelector('form');
  const errBox = dlg.querySelector('.form-error');
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) close(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!onSubmit) return;
    const btn = form.querySelector('[type=submit]');
    errBox.classList.remove('show');
    if (btn) btn.disabled = true;
    try {
      const keep = await onSubmit(readForm(form), form);
      if (keep !== false) close();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.add('show');
    } finally {
      if (btn) btn.disabled = false;
    }
  });
  dlg.showModal();
  onOpen?.(form, close);
  return { dlg, form, close };
}

export function confirmSheet({ title, text, submit = 'Подтвердить', danger = false, reason = null }) {
  return new Promise((resolve) => {
    let done = false;
    const s = sheet({
      title,
      danger,
      submit,
      body: html`<p>${text}</p>${reason ? html`<label class="field"><span>${reason}</span><textarea class="input" name="reason" required></textarea></label>` : ''}`,
      onSubmit: (d) => {
        if (reason && !d.reason) throw new Error('Заполните причину');
        done = true;
        resolve(reason ? d.reason : true);
      },
    });
    s.dlg.addEventListener('close', () => { if (!done) resolve(null); });
  });
}

// Делегирование кликов: data-action="имя" → handlers.имя(элемент, событие)
export function onActions(root, handlers) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !root.contains(el)) return;
    const fn = handlers[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    Promise.resolve(fn(el, e)).catch((err) => toast(err.message, 'error'));
  });
}

// ---------- Простой столбчатый график ----------
export function barChart(data, { height = 180, format = rub, highlightLast = true } = {}) {
  const w = 600, top = 26, bottom = 30, gap = 14;
  const max = Math.max(1, ...data.map((d) => d.value));
  const bw = (w - gap * (data.length - 1)) / data.length;
  const h = height - top - bottom;
  const short = (n) => (n >= 1000 ? `${Math.round(n / 1000)} тыс` : String(n));
  const bars = data.map((d, i) => {
    const bh = Math.max(2, (d.value / max) * h);
    const x = i * (bw + gap);
    const y = top + h - bh;
    const last = highlightLast && i === data.length - 1;
    return `<g><title>${esc(d.label)}: ${esc(format(d.value))}</title>
      <rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="6" fill="${last ? 'var(--accent)' : '#9cc3b2'}"/>
      <text x="${x + bw / 2}" y="${y - 7}" text-anchor="middle" font-size="13" font-weight="650" fill="var(--ink-2)">${esc(short(d.value))}</text>
      <text x="${x + bw / 2}" y="${height - 8}" text-anchor="middle" font-size="13" fill="var(--muted)">${esc(d.label)}</text></g>`;
  }).join('');
  return raw(`<svg class="chart" viewBox="0 0 ${w} ${height}" role="img" aria-label="График">${bars}</svg>`);
}

export function monthSwitch(month, action = 'month') {
  return html`<div class="month-switch">
    <button class="icon-btn" data-action="${action}" data-month="${addMonths(month, -1)}" aria-label="Предыдущий месяц">${icon('left')}</button>
    <strong>${monthTitle(month)}</strong>
    <button class="icon-btn" data-action="${action}" data-month="${addMonths(month, 1)}" aria-label="Следующий месяц">${icon('right')}</button>
  </div>`;
}

export const currentMonthStr = () => todayStr().slice(0, 7);
