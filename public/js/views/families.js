import { api, html, icon, rub, plural, fmtDate, age, avatar, toast, refresh, sheet, onActions, contactButtons } from '../core.js';
import { setTop } from '../app.js';
import { METHODS, monthLabel } from '/shared/labels.js';
import { statusBadge } from './students.js';
import { openReminder } from './money.js';

export async function list({ el }) {
  setTop({ title: 'Семьи' });
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Семьи</h1><p>Родители и взрослые ученики, которые платят сами</p></div></div>
    <label class="search">${icon('search')}<input class="input" id="q" placeholder="Имя родителя, ребёнка или телефон" autocomplete="off"></label>
    <div class="card" id="res"></div>`);
  const res = el.querySelector('#res');
  const load = async (q) => {
    const rows = await api(`/api/families${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    res.innerHTML = rows.length ? String(html`<div class="list">${rows.map((f) => html`<a class="row" href="#/families/${f.id}">
      ${avatar(f.name, null)}
      <div class="row-main"><div class="row-title">${f.name}</div>
        <div class="row-sub">${f.is_self ? 'платит сам' : `${f.children.length} ${plural(f.children.length, 'ребёнок', 'ребёнка', 'детей')}: ${f.children.map((c) => c.name.split(' ')[0]).join(', ')}`}</div></div>
      ${f.debt ? html`<span class="money red small">${rub(f.debt)}</span>` : ''}${icon('chevron', 'chev')}</a>`)}</div>`)
      : '<div class="empty">Ничего не нашли</div>';
  };
  await load('');
  let t;
  el.querySelector('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => load(e.target.value.trim()), 200); });
}

export async function detail({ el, params, me }) {
  const d = await api(`/api/families/${params.id}`);
  const f = d.family;
  setTop({ title: f.name, back: '/families' });
  el.innerHTML = String(html`
    <div class="card card-pad" style="display:grid;gap:12px">
      <div style="display:flex;gap:14px;align-items:center">${avatar(f.name, null, 'lg')}
        <div><h1 style="font-size:22px">${f.name}</h1><div class="muted small">${f.is_self ? 'Взрослый ученик, платит сам' : 'Родитель'}</div></div></div>
      <dl class="kv">
        ${f.phone ? html`<dt>Телефон</dt><dd>${f.phone}</dd>` : ''}
        ${f.telegram ? html`<dt>Telegram</dt><dd>${f.telegram}</dd>` : ''}
        ${f.whatsapp ? html`<dt>WhatsApp</dt><dd>${f.whatsapp}</dd>` : ''}
      </dl>
      ${contactButtons(f)}
      <div class="tiles" style="grid-template-columns:1fr 1fr">
        <div class="card tile ${d.debt ? 'alert' : ''}" style="min-height:0"><span class="tile-label">Долг семьи</span><span class="tile-value">${rub(d.debt)}</span></div>
        <div class="card tile" style="min-height:0"><span class="tile-label">В месяц</span><span class="tile-value">${rub(d.children.reduce((a, c) => a + (c.price && !c.price.waived ? c.price.amount : 0), 0))}</span></div>
      </div>
      <div class="actions stretch">
        <a class="btn primary" href="#/pay/${f.id}">${icon('coins', 'sm')} Принять оплату</a>
        ${d.debt ? html`<button class="btn soft" data-action="remind">${icon('message', 'sm')} Напоминание</button>` : ''}
        ${me.can['students.edit'] ? html`<button class="btn" data-action="edit">${icon('edit', 'sm')} Контакты</button>` : ''}
      </div>
      ${d.reminders.length ? html`<div class="small muted">Напоминание отправляли ${fmtDate(d.reminders[0].created_at)} (${d.reminders[0].user_name})</div>` : ''}
    </div>

    <div class="card">
      <div class="card-head"><h2>${icon('users')} ${f.is_self ? 'Ученик' : 'Дети'}</h2></div>
      <div class="list">${d.children.map((c) => html`<a class="row" href="#/students/${c.id}">
        ${avatar(c.name, c.gender)}
        <div class="row-main"><div class="row-title">${c.name}</div>
          <div class="row-sub">${[age(c.birth_year), c.group_name].filter(Boolean).join(' · ')}</div>
          <div class="row-sub">${c.is_free ? 'бесплатно (садака)' : c.price ? `${rub(c.price.amount)} в месяц${c.price.discount_pct ? ` · скидка ${c.price.discount_pct}%` : ''}` : c.direction === 'individual' ? 'индивидуально, оплата за урок' : ''}</div></div>
        <div class="row-end">${c.status !== 'active' ? statusBadge(c.status) : ''}${c.debt ? html`<span class="money red small">${rub(c.debt)}</span>` : ''}</div>
      </a>`)}</div>
    </div>

    <div class="card">
      <div class="card-head"><h2>${icon('wallet')} История оплат</h2></div>
      ${d.payments.length ? html`<div class="list">${d.payments.map((p) => html`<div class="row">
        <div class="row-main"><div class="row-title ${p.canceled ? 'strike' : ''}">${p.student_name.split(' ')[0]} · ${monthLabel(p.month)}</div>
          <div class="row-sub">${fmtDate(p.paid_at)} · ${METHODS[p.method].toLowerCase()}${p.user_name ? ` · принял(а) ${p.user_name}` : ''}${p.canceled ? ` · отменена: ${p.cancel_reason}` : ''}</div></div>
        <span class="money ${p.canceled ? 'strike' : ''}">${rub(p.amount)}</span></div>`)}</div>` : html`<div class="empty">Оплат пока не было</div>`}
    </div>`);

  onActions(el, {
    remind: () => openReminder(f.id),
    edit: () => sheet({
      title: 'Контакты',
      body: html`<label class="field"><span>Имя</span><input class="input" name="name" value="${f.name}"></label>
        <label class="field"><span>Телефон</span><input class="input" type="tel" name="phone" value="${f.phone || ''}"></label>
        <div class="form-grid two"><label class="field"><span>Telegram</span><input class="input" name="telegram" value="${f.telegram || ''}"></label>
        <label class="field"><span>WhatsApp</span><input class="input" name="whatsapp" value="${f.whatsapp || ''}"></label></div>
        <label class="field"><span>Заметки</span><textarea class="input" name="notes">${f.notes || ''}</textarea></label>`,
      onSubmit: async (data) => { await api(`/api/families/${f.id}`, { method: 'PUT', body: data }); toast('Сохранено'); refresh(); },
    }),
  });
}
