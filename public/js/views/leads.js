import {
  api, html, raw, icon, plural, fmtDate, fmtDay, daysAgo, go, toast, refresh, sheet, onActions, options, seg, todayStr, addDays,
  contactButtons, monthSwitch, currentMonthStr, monthName,
} from '../core.js';
import { setTop } from '../app.js';
import { LEAD_STATUS, LEAD_FLOW, SOURCES, DIRECTIONS, MONTHS_PREP } from '/shared/labels.js';
import { groupOptions } from './students.js';

const STATUS_BADGE = { new: 'red', contacted: 'amber', trial_scheduled: 'blue', trial_done: 'blue', enrolled: 'green', rejected: '' };
const leadBadge = (s) => html`<span class="badge ${STATUS_BADGE[s]}">${LEAD_STATUS[s]}</span>`;

const tabs = (active) => html`<div class="chips">
  <a class="chip ${active === 'list' ? 'active' : ''}" href="#/leads">Заявки</a>
  <a class="chip ${active === 'stats' ? 'active' : ''}" href="#/leads/stats">${icon('chart', 'xs')} Откуда приходят</a>
</div>`;

function leadForm(lead = null) {
  return html`
    <label class="field"><span>Имя ученика</span><input class="input" name="name" value="${lead?.name || ''}" required autocomplete="off"></label>
    <div class="form-grid two">
      <div class="field"><span>Пол</span>${seg('gender', { m: 'Муж.', f: 'Жен.' }, lead?.gender || null)}</div>
      <label class="field"><span>Возраст</span><input class="input" type="number" inputmode="numeric" name="age" value="${lead?.age || ''}"></label>
    </div>
    <label class="field"><span>Кто обратился (если ребёнок)</span><input class="input" name="contact_name" value="${lead?.contact_name || ''}" placeholder="Имя родителя"></label>
    <label class="field"><span>Телефон</span><input class="input" type="tel" inputmode="tel" name="phone" value="${lead?.phone || ''}" placeholder="+7 900 000-00-00"></label>
    <div class="form-grid two">
      <label class="field"><span>Telegram</span><input class="input" name="telegram" value="${lead?.telegram || ''}" placeholder="@username"></label>
      <label class="field"><span>WhatsApp</span><input class="input" name="whatsapp" value="${lead?.whatsapp || ''}" placeholder="если другой номер"></label>
    </div>
    <div class="form-grid two">
      <label class="field"><span>Что хочет изучать</span><select class="input" name="interest">${options(DIRECTIONS, lead?.interest, { empty: 'Не знает' })}</select></label>
      <label class="field"><span>Откуда узнал</span><select class="input" name="source">${options(SOURCES, lead?.source, { empty: 'Не указано' })}</select></label>
    </div>
    <label class="field"><span>Заметка</span><textarea class="input" name="notes">${lead?.notes || ''}</textarea></label>`;
}

export function newLead() {
  sheet({
    title: 'Новая заявка',
    body: leadForm(),
    submit: 'Сохранить заявку',
    onSubmit: async (f) => {
      const res = await api('/api/leads', { method: 'POST', body: f });
      toast('Заявка сохранена');
      go(`/leads/${res.id}`);
    },
  });
}

export async function list({ el, query }) {
  const status = query.status || 'active';
  setTop({ title: 'Заявки' });
  const d = await api(`/api/leads${['active', 'all'].includes(status) ? '' : `?status=${status}`}`);
  const rows = status === 'active' ? d.list.filter((l) => !['enrolled', 'rejected'].includes(l.status)) : d.list;
  const inWork = ['new', 'contacted', 'trial_scheduled', 'trial_done'].reduce((a, s) => a + (d.counts[s] || 0), 0);
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Заявки</h1><p>${inWork} в работе</p></div>
      <button class="btn primary" data-action="new">${icon('plus')} Заявка</button></div>
    ${tabs('list')}
    <div class="chips">
      <a class="chip ${status === 'active' ? 'active' : ''}" href="#/leads">В работе <span class="count">${inWork}</span></a>
      ${Object.entries(LEAD_STATUS).map(([k, v]) => html`<a class="chip ${status === k ? 'active' : ''}" href="#/leads?status=${k}">${v} <span class="count">${d.counts[k] || 0}</span></a>`)}
    </div>
    <div class="card">${rows.length ? html`<div class="list">${rows.map((l) => html`<a class="row" href="#/leads/${l.id}">
      <div class="row-main">
        <div class="row-title">${l.name}${l.age ? `, ${l.age}` : ''}</div>
        <div class="row-sub">${DIRECTIONS[l.interest] || 'направление не выбрано'} · ${SOURCES[l.source] || '—'}${l.trial_date && l.status === 'trial_scheduled' ? ` · пробный ${fmtDay(l.trial_date)}` : ''}</div>
      </div>
      <div class="row-end">${leadBadge(l.status)}<span class="small ${l.status === 'new' && daysAgo(l.created_at) !== 'сегодня' ? '' : 'muted'}" style="${l.status === 'new' && daysAgo(l.created_at) !== 'сегодня' ? 'color:var(--danger);font-weight:600' : ''}">${daysAgo(l.created_at)}</span></div>
    </a>`)}</div>` : html`<div class="empty">${icon('inbox')}<p>Заявок в этом статусе нет</p></div>`}</div>`);
  onActions(el, { new: newLead });
}

export async function detail({ el, params }) {
  const { lead: l, events } = await api(`/api/leads/${params.id}`);
  setTop({ title: l.name, back: '/leads' });
  const idx = LEAD_FLOW.indexOf(l.status);
  const next = {
    new: html`<button class="btn primary block" data-action="status" data-to="contacted">${icon('phone', 'sm')} Связались</button>`,
    contacted: html`<button class="btn primary block" data-action="trial">${icon('calendar', 'sm')} Записать на пробный урок</button>`,
    trial_scheduled: html`<button class="btn primary block" data-action="status" data-to="trial_done">${icon('check', 'sm')} Пришёл на пробный</button>
      <button class="btn block" data-action="trial">Перенести пробный</button>`,
    trial_done: html`<button class="btn primary block" data-action="convert">${icon('user', 'sm')} Сделать учеником</button>`,
    enrolled: l.student_id ? html`<a class="btn soft block" href="#/students/${l.student_id}">${icon('user', 'sm')} Открыть карточку ученика</a>` : '',
    rejected: html`<button class="btn block" data-action="status" data-to="new">Вернуть в работу</button>`,
  }[l.status];

  el.innerHTML = String(html`
    <div class="card card-pad" style="display:grid;gap:14px">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div><h1 style="font-size:22px">${l.name}${l.age ? `, ${l.age} ${plural(l.age, 'год', 'года', 'лет')}` : ''}</h1>
          <div class="muted small">Заявка от ${fmtDate(l.created_at)} · ${SOURCES[l.source] || 'источник не указан'}</div></div>
        ${leadBadge(l.status)}
      </div>
      ${l.status !== 'rejected' ? html`<div class="stepper">${LEAD_FLOW.map((s, i) => html`<div class="step ${i < idx ? 'done' : ''} ${i === idx ? 'current' : ''}">${LEAD_STATUS[s]}</div>`)}</div>` : ''}
      <dl class="kv">
        <dt>Хочет изучать</dt><dd>${DIRECTIONS[l.interest] || 'не знает'}</dd>
        ${l.contact_name ? html`<dt>Обратился</dt><dd>${l.contact_name}</dd>` : ''}
        ${l.phone ? html`<dt>Телефон</dt><dd>${l.phone}</dd>` : ''}
        ${l.telegram ? html`<dt>Telegram</dt><dd>${l.telegram}</dd>` : ''}
        ${l.trial_date ? html`<dt>Пробный урок</dt><dd>${fmtDay(l.trial_date)} · ${l.trial_group_name || ''}</dd>` : ''}
        ${l.reject_reason ? html`<dt>Причина отказа</dt><dd>${l.reject_reason}</dd>` : ''}
      </dl>
      ${l.notes ? html`<div class="notice gray">${l.notes}</div>` : ''}
      ${contactButtons(l)}
      <div style="display:grid;gap:8px">${next}
        ${!['enrolled', 'rejected'].includes(l.status) ? html`<div class="actions stretch">
          <button class="btn" data-action="edit">${icon('edit', 'sm')} Изменить</button>
          <button class="btn danger" data-action="reject">Отказ</button></div>` : ''}
      </div>
    </div>
    <div class="card"><div class="card-head"><h2>${icon('list')} История</h2></div>
      <div class="card-pad" style="padding-top:0"><div class="timeline">${events.map((e) => html`<div class="tl-item"><div>
        <div><b>${LEAD_STATUS[e.status]}</b>${e.note ? ` — ${e.note}` : ''}</div>
        <div class="small muted">${fmtDate(e.created_at)}${e.user_name ? ` · ${e.user_name}` : ''}</div></div></div>`)}</div></div></div>`);

  const setStatus = (body) => api(`/api/leads/${l.id}/status`, { method: 'POST', body });
  onActions(el, {
    status: async (b) => { await setStatus({ status: b.dataset.to }); toast(LEAD_STATUS[b.dataset.to]); refresh(); },
    edit: () => sheet({ title: 'Изменить заявку', body: leadForm(l), onSubmit: async (f) => { await api(`/api/leads/${l.id}`, { method: 'PUT', body: f }); toast('Сохранено'); refresh(); } }),
    reject: () => sheet({
      title: 'Отказ',
      danger: true,
      submit: 'Отметить отказ',
      body: html`<label class="field"><span>Причина</span><textarea class="input" name="reject_reason" placeholder="Например: не подошло время, далеко ездить"></textarea></label>`,
      onSubmit: async (f) => { await setStatus({ status: 'rejected', ...f }); toast('Отмечен отказ'); refresh(); },
    }),
    trial: async () => {
      const groups = await api('/api/groups');
      sheet({
        title: 'Пробный урок',
        submit: 'Записать на пробный',
        body: html`<label class="field"><span>Дата</span><input class="input" type="date" name="trial_date" value="${l.trial_date || addDays(todayStr(), 1)}"></label>
          <label class="field"><span>Группа</span><select class="input" name="trial_group_id">${raw(String(groupOptions(groups, l.gender, l.trial_group_id)).replace('Без группы (запишем позже)', 'Выберите группу'))}</select></label>`,
        onSubmit: async (f) => { await setStatus({ status: 'trial_scheduled', ...f }); toast('Записан на пробный урок'); refresh(); },
      });
    },
    convert: async () => {
      const groups = await api('/api/groups');
      const match = l.phone ? (await api(`/api/families/by-phone?phone=${encodeURIComponent(l.phone)}`)).family : null;
      sheet({
        title: 'Сделать учеником',
        submit: 'Записать учеником',
        body: html`
          <label class="field"><span>Имя и фамилия</span><input class="input" name="name" value="${l.name}"></label>
          <div class="form-grid two">
            <div class="field"><span>Пол</span>${seg('gender', { m: 'Муж.', f: 'Жен.' }, l.gender)}</div>
            <label class="field"><span>Возраст</span><input class="input" type="number" name="age" value="${l.age || ''}"></label>
          </div>
          <label class="field"><span>Группа</span><select class="input" name="group_id">${groupOptions(groups, l.gender, l.trial_group_id)}</select>
            <span class="hint">Если в группе нет мест — ученик встанет в лист ожидания.</span></label>
          <label class="field"><span>Дата начала</span><input class="input" type="date" name="start_date" value="${todayStr()}"></label>
          ${match ? html`<label class="check"><input type="checkbox" name="use_family" checked> Добавить в семью «${match.name}» (${match.children.map((c) => c.name.split(' ')[0]).join(', ')}) — скидка второму ребёнку посчитается сама</label>`
            : html`<div class="notice gray">Будет создана семья: ${l.contact_name || l.name}${l.phone ? `, ${l.phone}` : ''}${!l.contact_name ? ' (платит сам)' : ''}</div>`}
          <label class="check"><input type="checkbox" name="is_free"> Учится бесплатно (садака)</label>`,
        onOpen: (form) => {
          const sel = form.querySelector('select[name=group_id]');
          form.querySelectorAll('input[name=gender]').forEach((r) => r.addEventListener('change', () => {
            for (const o of sel.options) if (o.dataset.gender) o.disabled = o.dataset.gender !== r.value;
            if (sel.selectedOptions[0]?.disabled) sel.value = '';
          }));
        },
        onSubmit: async (f) => {
          if (!f.group_id) throw new Error('Выберите группу');
          const body = { ...f, group_id: Number(f.group_id) };
          if (match && f.use_family) body.family_id = match.id;
          const res = await api(`/api/leads/${l.id}/convert`, { method: 'POST', body });
          toast(res.status === 'waiting' ? `Мест нет — ${f.name} в листе ожидания` : `${f.name} — теперь ученик группы «${res.group}»`);
          go(`/students/${res.id}`);
        },
      });
    },
  });
}

export async function stats({ el, query }) {
  const month = query.month || currentMonthStr();
  setTop({ title: 'Откуда приходят' });
  const d = await api(`/api/leads/stats?month=${month}`);
  const conv = d.total ? Math.round((d.enrolled / d.total) * 100) : 0;
  const ranked = d.by_source.filter((s) => s.students >= 3).sort((a, b) => (b.retention * 2 + b.attendance) - (a.retention * 2 + a.attendance));
  const best = ranked[0];
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Откуда приходят ученики</h1><p>Заявки за месяц и качество учеников по источникам</p></div>${monthSwitch(month)}</div>
    ${tabs('stats')}
    <div class="tiles">
      <div class="card tile"><span class="tile-label">Заявок в ${MONTHS_PREP[Number(month.slice(5, 7)) - 1]}</span><span class="tile-value">${d.total}</span></div>
      <div class="card tile accent"><span class="tile-label">Дошли до учёбы</span><span class="tile-value">${d.enrolled}</span><span class="tile-note">${conv}% заявок месяца</span></div>
      <div class="card tile"><span class="tile-label">Отказались</span><span class="tile-value">${d.rejected}</span></div>
      <div class="card tile ${d.unanswered ? 'alert' : ''}"><span class="tile-label">Без ответа сейчас</span><span class="tile-value">${d.unanswered}</span></div>
    </div>
    ${best ? html`<div class="notice green">${icon('star', 'sm')}<div>Лучшие ученики приходят из источника «${SOURCES[best.source]}»: остаются ${best.retention}%, посещаемость ${best.attendance}%. Сюда стоит вкладывать силы.</div></div>` : ''}
    <div class="card">
      <div class="card-head"><h2>Воронка за ${monthName(month)}</h2></div>
      <div class="card-pad" style="padding-top:0;display:grid;gap:8px">${d.funnel.map((f) => html`<div style="display:grid;grid-template-columns:150px 1fr 32px;gap:10px;align-items:center;font-size:14px">
        <span>${LEAD_STATUS[f.status]}</span>
        <div style="height:12px;border-radius:6px;background:var(--surface-2);overflow:hidden"><div style="height:100%;width:${d.total ? Math.round((f.n / d.total) * 100) : 0}%;background:${f.status === 'rejected' ? '#d9a9a0' : 'var(--accent)'};border-radius:6px"></div></div>
        <b style="text-align:right">${f.n}</b></div>`)}</div>
    </div>
    <div class="card"><div class="card-head"><h2>По источникам — за всё время</h2></div>
      <div class="table-wrap"><table class="table"><thead><tr>
        <th>Источник</th><th class="num">Заявок</th><th class="num">→ учеников</th><th class="num">Учатся</th><th class="num">Ушли</th><th class="num">Остаются</th><th class="num">Посещаемость</th>
      </tr></thead><tbody>${d.by_source.map((s) => html`<tr class="${best && s.source === best.source ? 'best' : ''}">
        <td><b>${SOURCES[s.source]}</b></td><td class="num">${s.leads_total}</td><td class="num">${s.enrolled_total}${s.conversion != null ? html` <span class="muted">(${s.conversion}%)</span>` : ''}</td>
        <td class="num">${s.active}</td><td class="num">${s.left}</td><td class="num">${s.retention != null ? `${s.retention}%` : '—'}</td><td class="num">${s.attendance != null ? `${s.attendance}%` : '—'}</td></tr>`)}
      </tbody></table></div></div>
    ${d.reject_reasons.length ? html`<div class="card"><div class="card-head"><h2>Почему отказываются</h2></div>
      <div class="list">${d.reject_reasons.map((r) => html`<div class="row"><div class="row-main">${r.reject_reason}</div><span class="badge">${r.n}</span></div>`)}</div></div>` : ''}`);
  onActions(el, { month: (b) => go(`/leads/stats?month=${b.dataset.month}`) });
}
