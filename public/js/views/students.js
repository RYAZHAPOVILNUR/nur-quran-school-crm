import {
  api, html, raw, icon, rub, plural, fmtDate, fmtDay, fmtDayShort, age, avatar, go, toast, refresh, sheet,
  onActions, options, seg, contactButtons, todayStr, monthName, readForm,
} from '../core.js';
import { setTop } from '../app.js';
import { STUDENT_STATUS, SOURCES, ATTENDANCE, GROUP_GENDER, monthLabel } from '/shared/labels.js';
import { hifzBlock, bindHifz } from './hifz.js';

const STATUS_BADGE = { active: 'green', waiting: 'amber', paused: 'blue', finished: '', left: 'red' };
export const statusBadge = (s) => html`<span class="badge ${STATUS_BADGE[s] || ''}">${STUDENT_STATUS[s]}</span>`;

// ---------- Список ----------
export async function list({ el, me, query }) {
  const status = query.status || (me.role === 'teacher' ? 'all' : 'active');
  setTop({ title: me.role === 'teacher' ? 'Мои ученики' : 'Ученики' });
  const filters = me.role === 'teacher' ? {} : { active: 'Учатся', waiting: 'Ждут места', paused: 'На паузе', finished: 'Закончили', left: 'Ушли', all: 'Все' };

  el.innerHTML = String(html`
    <div class="page-head"><div><h1>${me.role === 'teacher' ? 'Мои ученики' : 'Ученики'}</h1><p id="count"></p></div>
      ${me.can['students.edit'] ? html`<a class="btn primary" href="#/students/new">${icon('plus')} Новый ученик</a>` : ''}</div>
    <label class="search">${icon('search')}<input class="input" type="search" id="q" placeholder="Имя ученика или телефон родителя" value="${query.q || ''}" autocomplete="off" enterkeyhint="search"></label>
    ${Object.keys(filters).length ? html`<div class="chips">${Object.entries(filters).map(([k, v]) => html`<button class="chip ${k === status ? 'active' : ''}" data-action="filter" data-status="${k}">${v}</button>`)}</div>` : ''}
    <div class="card" id="results"></div>`);

  const results = el.querySelector('#results');
  const count = el.querySelector('#count');
  let timer;
  const load = async () => {
    const q = el.querySelector('#q').value.trim();
    const rows = await api(`/api/students?status=${status}&q=${encodeURIComponent(q)}`);
    count.textContent = `${rows.length} ${plural(rows.length, 'ученик', 'ученика', 'учеников')}`;
    results.innerHTML = rows.length ? String(html`<div class="list">${rows.map((s) => html`<a class="row" href="#/students/${s.id}">
      ${avatar(s.name, s.gender)}
      <div class="row-main">
        <div class="row-title">${s.name}</div>
        <div class="row-sub">${[age(s.birth_year), s.group_name || s.status_reason, me.role !== 'teacher' ? s.teacher_name : null].filter(Boolean).join(' · ')}</div>
      </div>
      <div class="row-end">
        ${s.status !== 'active' ? statusBadge(s.status) : ''}
        ${s.debt > 0 ? html`<span class="money red small">−${rub(s.debt)}</span>` : ''}
        ${s.hifz_pages != null && s.status === 'active' ? html`<span class="small muted">${s.hifz_pages} стр.</span>` : ''}
        ${s.is_free ? html`<span class="badge gold">садака</span>` : ''}
      </div>
    </a>`)}</div>`) : String(html`<div class="empty">${icon('search')}<p>Никого не нашли. Попробуйте часть имени или последние цифры телефона.</p></div>`);
  };
  await load();
  el.querySelector('#q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => load().catch((e) => toast(e.message, 'error')), 200); });
  onActions(el, { filter: (b) => go(`/students?status=${b.dataset.status}`) });
}

// ---------- Выбор группы с учётом пола и мест ----------
const otherText = (g) => (g === 'm' ? 'только мальчики и мужчины' : 'только девочки и женщины');

export function groupOptions(groups, gender, selected) {
  const sorted = gender ? [...groups].sort((a, b) => (a.gender !== gender) - (b.gender !== gender)) : groups;
  return html`<option value="">Без группы (запишем позже)</option>${sorted.map((g) => {
    const other = gender && g.gender !== gender;
    const base = `${g.name} · ${g.teacher_name}`;
    const seats = g.free > 0 ? `свободно ${g.free} из ${g.capacity}` : 'мест нет — лист ожидания';
    return html`<option value="${g.id}" data-gender="${g.gender}" data-base="${base}" data-seats="${seats}" ${other ? raw('disabled') : ''} ${String(g.id) === String(selected) ? raw('selected') : ''}>${base} · ${other ? otherText(g.gender) : seats}</option>`;
  })}`;
}

// При смене пола в форме группы другого пола становятся недоступны.
export function bindGenderToGroups(form) {
  const sel = form.querySelector('select[name=group_id]');
  if (!sel) return;
  form.querySelectorAll('input[name=gender]').forEach((r) => r.addEventListener('change', () => {
    for (const o of sel.options) {
      if (!o.dataset.gender) continue;
      const other = o.dataset.gender !== r.value;
      o.disabled = other;
      o.textContent = `${o.dataset.base} · ${other ? otherText(o.dataset.gender) : o.dataset.seats}`;
    }
    if (sel.selectedOptions[0]?.disabled) sel.value = '';
  }));
}

// ---------- Новый ученик ----------
export async function create({ el }) {
  setTop({ title: 'Новый ученик', back: '/students' });
  const groups = await api('/api/groups');
  el.innerHTML = String(html`
    <form class="card" id="f" novalidate>
      <div class="form-section">
        <h3>Ученик</h3>
        <label class="field"><span>Имя и фамилия</span><input class="input" name="name" required autocomplete="off"></label>
        <div class="field"><span>Пол</span>${seg('gender', { m: 'Мальчик / мужчина', f: 'Девочка / женщина' }, null)}</div>
        <div class="form-grid two">
          <label class="field"><span>Возраст</span><input class="input" name="age" type="number" inputmode="numeric" min="4" max="90"></label>
          <label class="field"><span>Дата начала</span><input class="input" name="start_date" type="date" value="${todayStr()}"></label>
        </div>
      </div>
      <div class="form-section">
        <h3>Группа</h3>
        <label class="field"><span>Группа и учитель</span><select class="input" name="group_id">${groupOptions(groups, null)}</select>
          <span class="hint">Мальчиков и девочек записываем только в группы своего пола. Если мест нет — ученик встанет в лист ожидания.</span></label>
      </div>
      <div class="form-section">
        <h3>Кто платит</h3>
        ${seg('payer', { new: 'Родитель', existing: 'Семья уже есть', self: 'Платит сам' }, 'new')}
        <div data-payer="new" class="form-grid">
          <label class="field"><span>Имя родителя</span><input class="input" name="parent_name" autocomplete="off"></label>
          <label class="field"><span>Телефон</span><input class="input" name="phone" type="tel" inputmode="tel" placeholder="+7 900 000-00-00"></label>
          <div class="form-grid two">
            <label class="field"><span>Telegram</span><input class="input" name="telegram" placeholder="@username"></label>
            <label class="field"><span>WhatsApp</span><input class="input" name="whatsapp" type="tel" placeholder="если другой номер"></label>
          </div>
          <div id="family-match"></div>
        </div>
        <div data-payer="existing" class="form-grid" hidden>
          <label class="search">${icon('search')}<input class="input" id="fam-q" placeholder="Имя родителя, ребёнка или телефон"></label>
          <div id="fam-results" class="card"></div>
        </div>
        <div data-payer="self" class="form-grid" hidden>
          <label class="field"><span>Телефон ученика</span><input class="input" name="self_phone" type="tel" inputmode="tel"></label>
          <label class="field"><span>Telegram</span><input class="input" name="self_telegram" placeholder="@username"></label>
        </div>
      </div>
      <div class="form-section">
        <h3>Дополнительно</h3>
        <label class="field"><span>Откуда пришёл</span><select class="input" name="source">${options(SOURCES, '', { empty: 'Не указано' })}</select></label>
        <label class="check"><input type="checkbox" name="is_free"> Учится бесплатно (садака)</label>
        <label class="field" data-free hidden><span>Причина</span><input class="input" name="free_reason" placeholder="Например: сирота"></label>
        <label class="field"><span>Заметки</span><textarea class="input" name="notes"></textarea></label>
      </div>
      <div class="form-section">
        <div class="form-error" role="alert"></div>
        <button class="btn primary block" type="submit">Добавить ученика</button>
      </div>
    </form>`);

  const form = el.querySelector('#f');
  bindGenderToGroups(form);
  let familyId = null;
  const showPayer = (v) => form.querySelectorAll('[data-payer]').forEach((d) => { d.hidden = d.dataset.payer !== v; });
  form.querySelectorAll('input[name=payer]').forEach((r) => r.addEventListener('change', () => showPayer(r.value)));
  form.querySelector('[name=is_free]').addEventListener('change', (e) => { form.querySelector('[data-free]').hidden = !e.target.checked; });

  const famResults = el.querySelector('#fam-results');
  const renderFamilies = (rows) => {
    famResults.innerHTML = rows.length ? String(html`<div class="list">${rows.map((f) => html`<button type="button" class="row" data-fam="${f.id}">
      <div class="row-main"><div class="row-title">${f.name}</div><div class="row-sub">${f.phone || f.telegram || ''} · ${f.children.map((c) => c.name.split(' ')[0]).join(', ') || 'без учеников'}</div></div>
      <span class="badge" data-check>${familyId === f.id ? 'Выбрано' : 'Выбрать'}</span></button>`)}</div>`) : '<div class="empty">Начните вводить имя или телефон</div>';
  };
  renderFamilies([]);
  let t;
  el.querySelector('#fam-q').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(async () => renderFamilies(e.target.value.trim().length >= 2 ? await api(`/api/families?q=${encodeURIComponent(e.target.value.trim())}`) : []), 200);
  });
  famResults.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fam]');
    if (!b) return;
    familyId = Number(b.dataset.fam);
    famResults.querySelectorAll('[data-fam]').forEach((x) => {
      const on = Number(x.dataset.fam) === familyId;
      x.querySelector('[data-check]').textContent = on ? 'Выбрано' : 'Выбрать';
      x.querySelector('[data-check]').className = `badge ${on ? 'green' : ''}`;
    });
  });

  // Если такой телефон уже есть — предлагаем добавить ребёнка в существующую семью (скидка второму ребёнку).
  const match = el.querySelector('#family-match');
  form.querySelector('[name=phone]').addEventListener('blur', async (e) => {
    match.innerHTML = '';
    if (e.target.value.replace(/\D/g, '').length < 10) return;
    const { family: f } = await api(`/api/families/by-phone?phone=${encodeURIComponent(e.target.value)}`);
    if (!f) return;
    match.innerHTML = String(html`<div class="notice green">${icon('family', 'sm')}<div>Этот номер уже есть: <b>${f.name}</b> (${f.children.map((c) => c.name.split(' ')[0]).join(', ')}).
      <div style="margin-top:8px"><button type="button" class="btn sm primary" data-use-family="${f.id}">Добавить в эту семью</button></div></div></div>`);
    match.querySelector('[data-use-family]').addEventListener('click', () => {
      familyId = f.id;
      form.querySelector('input[name=payer][value=existing]').checked = true;
      showPayer('existing');
      renderFamilies([f]);
      famResults.querySelector('[data-check]').textContent = 'Выбрано';
      famResults.querySelector('[data-check]').className = 'badge green';
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = readForm(form);
    const err = form.querySelector('.form-error');
    err.classList.remove('show');
    const body = {
      name: d.name, gender: d.gender, age: d.age, start_date: d.start_date, group_id: d.group_id || null,
      source: d.source || null, is_free: d.is_free, free_reason: d.free_reason, notes: d.notes,
    };
    if (d.payer === 'existing') {
      if (!familyId) { err.textContent = 'Выберите семью из списка'; err.classList.add('show'); return; }
      body.family_id = familyId;
    } else if (d.payer === 'self') {
      body.family = { is_self: true, name: d.name, phone: d.self_phone, telegram: d.self_telegram };
    } else {
      body.family = { name: d.parent_name, phone: d.phone, telegram: d.telegram, whatsapp: d.whatsapp };
    }
    try {
      const res = await api('/api/students', { method: 'POST', body });
      toast(res.status === 'waiting' ? `Группа заполнена — ${d.name} в листе ожидания` : `${d.name} записан(а) в группу «${res.group}»`);
      go(`/students/${res.id}`);
    } catch (ex) { err.textContent = ex.message; err.classList.add('show'); }
  });
}

// ---------- Карточка ученика ----------
export async function detail({ el, params, me }) {
  const d = await api(`/api/students/${params.id}`);
  const s = d.student;
  setTop({ title: s.name, back: '/students' });
  const isHifz = s.direction === 'hifz' || s.direction === 'individual' || d.hifz_records.length > 0;
  const money = d.money;
  const editable = me.can['students.edit'];

  el.innerHTML = String(html`
    <div class="card card-pad" style="display:grid;gap:14px">
      <div style="display:flex;gap:14px;align-items:center">
        ${avatar(s.name, s.gender, 'lg')}
        <div style="flex:1;min-width:0">
          <h1 style="font-size:22px">${s.name}</h1>
          <div class="muted small">${[age(s.birth_year), s.gender === 'f' ? 'девочка/женщина' : 'мальчик/мужчина', `с ${fmtDate(s.start_date)}`].filter(Boolean).join(' · ')}</div>
          <div class="actions" style="margin-top:6px">${statusBadge(s.status)}${s.is_free ? html`<span class="badge gold">${icon('heart', 'xs')} Садака</span>` : ''}${s.source ? html`<span class="badge">${SOURCES[s.source]}</span>` : ''}</div>
        </div>
      </div>
      ${s.status_reason && s.status !== 'active' ? html`<div class="notice gray">${s.status_reason}</div>` : ''}
      <dl class="kv">
        <dt>Группа</dt><dd>${s.group_id ? html`<a href="#/groups/${s.group_id}">${s.group_name}</a>` : 'не выбрана'}</dd>
        ${s.teacher_name ? html`<dt>Учитель</dt><dd>${s.teacher_name}</dd>` : ''}
        ${d.waitlist.length ? html`<dt>Ждёт место</dt><dd>${d.waitlist.map((w) => w.group_name).join(', ')}</dd>` : ''}
        <dt>${s.is_self ? 'Контакт' : 'Родитель'}</dt><dd>${s.family_name}${s.phone ? ` · ${s.phone}` : ''}${s.telegram ? ` · ${s.telegram}` : ''}</dd>
        ${d.attendance_rate != null ? html`<dt>Посещаемость</dt><dd>${d.attendance_rate}% за 3 месяца</dd>` : ''}
        ${s.is_free ? html`<dt>Бесплатно</dt><dd>${s.free_reason || 'садака'}</dd>` : ''}
      </dl>
      ${contactButtons(s)}
      ${editable ? html`<div class="actions stretch">
        <button class="btn" data-action="edit">${icon('edit', 'sm')} Изменить</button>
        <button class="btn" data-action="group">${icon('clipboard', 'sm')} ${s.group_id ? 'Перевести' : 'В группу'}</button>
        <button class="btn" data-action="status">${icon('pause', 'sm')} Статус</button>
      </div>` : ''}
      ${s.notes ? html`<div class="notice gray">${s.notes}</div>` : ''}
    </div>

    ${isHifz ? hifzBlock(d, me) : ''}

    <div class="grid-2">
      <div class="card">
        <div class="card-head"><h2>${icon('clipboard')} Посещаемость</h2>${d.attendance_rate != null ? html`<span class="badge ${d.attendance_rate >= 80 ? 'green' : 'amber'}">${d.attendance_rate}%</span>` : ''}</div>
        <div class="card-pad" style="padding-top:0;display:grid;gap:10px">
          ${d.attendance.length ? html`<div class="dots" aria-label="Последние занятия">${[...d.attendance].reverse().map((a) => html`<span class="dot ${a.status}" title="${fmtDate(a.date)}: ${ATTENDANCE[a.status]}"></span>`)}</div>
          <div class="legend">${Object.entries(ATTENDANCE).map(([k, v]) => html`<span><i class="dot ${k}"></i>${v}</span>`)}</div>
          <div class="list" style="margin:0 -16px">${d.attendance.slice(0, 6).map((a) => html`<div class="row" style="min-height:44px"><div class="row-main">${fmtDay(a.date)}</div><span class="badge ${a.status === 'present' ? 'green' : a.status === 'absent' ? 'red' : a.status === 'late' ? 'amber' : 'blue'}">${ATTENDANCE[a.status]}</span></div>`)}</div>`
          : html`<p class="muted">Отметок пока нет.</p>`}
          ${d.contacts.length ? html`<div class="notice green">${icon('check', 'sm')} Связывались с семьёй ${fmtDayShort(d.contacts[0].created_at)}: ${d.contacts[0].note}</div>` : ''}
        </div>
      </div>

      ${money ? html`<div class="card">
        <div class="card-head"><h2>${icon('wallet')} Оплата</h2>
          ${money.debt > 0 ? html`<span class="money red">долг ${rub(money.debt)}</span>` : html`<span class="badge green">долгов нет</span>`}</div>
        <div class="card-pad" style="padding-top:0;display:grid;gap:12px">
          <div class="muted small">${s.is_free ? 'Учится бесплатно — оплата не начисляется.'
            : money.price?.per_lesson ? `Индивидуально: ${rub(money.price.per_lesson)} за проведённый урок`
              : money.price ? html`Абонемент: <b>${rub(money.price.amount)}</b> в месяц${money.price.discount_pct ? html` · скидка ${money.price.discount_pct}% (не первый ребёнок в семье)` : ''}` : 'Сейчас не начисляется'}</div>
          ${money.debt_months.length ? html`<div class="notice red">Не оплачено: ${money.debt_months.map((m) => `${monthName(m.month)} — ${rub(m.left)}`).join(', ')}</div>` : ''}
          ${!s.is_free ? html`<a class="btn primary block" href="#/pay/${s.family_id}">${icon('coins', 'sm')} Принять оплату</a>` : ''}
          ${money.payments.length ? html`<div class="list" style="margin:0 -16px">${money.payments.slice(0, 6).map((p) => html`<div class="row" style="min-height:48px">
            <div class="row-main"><div class="${p.canceled ? 'strike' : ''}">${monthLabel(p.month)}</div><div class="row-sub">${fmtDate(p.paid_at)} · ${p.method === 'cash' ? 'наличные' : 'перевод'}${p.canceled ? ' · отменена' : ''}</div></div>
            <span class="money ${p.canceled ? 'strike' : ''}">${rub(p.amount)}</span></div>`)}</div>` : html`<p class="muted small">Оплат пока не было.</p>`}
        </div>
      </div>` : ''}
    </div>

    ${d.siblings?.length ? html`<div class="card">
      <div class="card-head"><h2>${icon('family')} Семья</h2>${me.can['families.view'] ? html`<a class="link" href="#/families/${s.family_id}">Вся семья</a>` : ''}</div>
      <div class="list">${d.siblings.map((x) => html`<a class="row" href="#/students/${x.id}"><div class="row-main"><div class="row-title">${x.name}</div><div class="row-sub">${x.group_name || ''}</div></div>${x.status !== 'active' ? statusBadge(x.status) : ''}</a>`)}</div>
    </div>` : ''}

    ${me.role !== 'teacher' && d.status_log.length ? html`<div class="card">
      <div class="card-head"><h2>${icon('list')} История</h2></div>
      <div class="card-pad" style="padding-top:0"><div class="timeline">${d.status_log.map((l) => html`<div class="tl-item"><div>
        <div><b>${STUDENT_STATUS[l.to_status]}</b>${l.reason ? ` — ${l.reason}` : ''}</div>
        <div class="small muted">${fmtDate(l.created_at)}${l.user_name ? ` · ${l.user_name}` : ''}</div></div></div>`)}</div></div>
    </div>` : ''}`);

  bindHifz(el, d, me);

  onActions(el, {
    edit: () => sheet({
      title: 'Изменить данные',
      body: html`
        <label class="field"><span>Имя и фамилия</span><input class="input" name="name" value="${s.name}" required></label>
        <div class="field"><span>Пол</span>${seg('gender', { m: 'Мальчик / мужчина', f: 'Девочка / женщина' }, s.gender)}</div>
        <div class="form-grid two">
          <label class="field"><span>Возраст</span><input class="input" type="number" name="age" value="${s.birth_year ? Number(todayStr().slice(0, 4)) - s.birth_year : ''}"></label>
          <label class="field"><span>Дата начала</span><input class="input" type="date" name="start_date" value="${s.start_date}"></label>
        </div>
        <label class="field"><span>Откуда пришёл</span><select class="input" name="source">${options(SOURCES, s.source, { empty: 'Не указано' })}</select></label>
        <label class="check"><input type="checkbox" name="is_free" ${s.is_free ? raw('checked') : ''}> Учится бесплатно (садака)</label>
        <label class="field"><span>Причина (для садаки)</span><input class="input" name="free_reason" value="${s.free_reason || ''}"></label>
        <label class="field"><span>Заметки</span><textarea class="input" name="notes">${s.notes || ''}</textarea></label>
        <hr style="border:0;border-top:1px solid var(--line);margin:4px 0">
        <h3>${s.is_self ? 'Контакты ученика' : 'Контакты родителя'}</h3>
        <label class="field"><span>Имя</span><input class="input" name="family_name" value="${s.family_name}"></label>
        <label class="field"><span>Телефон</span><input class="input" type="tel" name="phone" value="${s.phone || ''}"></label>
        <div class="form-grid two">
          <label class="field"><span>Telegram</span><input class="input" name="telegram" value="${s.telegram || ''}"></label>
          <label class="field"><span>WhatsApp</span><input class="input" name="whatsapp" value="${s.whatsapp || ''}"></label>
        </div>`,
      onSubmit: async (f) => {
        await api(`/api/students/${s.id}`, { method: 'PUT', body: f });
        await api(`/api/families/${s.family_id}`, { method: 'PUT', body: { name: f.family_name, phone: f.phone, telegram: f.telegram, whatsapp: f.whatsapp } });
        toast('Сохранено');
        refresh();
      },
    }),
    group: async () => {
      const groups = await api('/api/groups');
      sheet({
        title: s.group_id ? 'Перевести в другую группу' : 'Записать в группу',
        body: html`<p class="muted small">${GROUP_GENDER[s.gender]}: группы другого пола недоступны. Если мест нет — ученик встанет в лист ожидания.</p>
          <label class="field"><span>Группа</span><select class="input" name="group_id">${groupOptions(groups.filter((g) => g.id !== s.group_id), s.gender)}</select></label>`,
        submit: 'Записать',
        onSubmit: async (f) => {
          if (!f.group_id) throw new Error('Выберите группу');
          const res = await api(`/api/students/${s.id}/group`, { method: 'POST', body: { group_id: Number(f.group_id) } });
          toast(res.status === 'waiting' ? `Мест нет — добавили в лист ожидания группы «${res.group}»` : `Записан в группу «${res.group}»`);
          refresh();
        },
      });
    },
    status: () => sheet({
      title: 'Статус ученика',
      body: html`<p class="muted small">Удалять учеников нельзя — история посещаемости, хифза и оплат сохраняется.</p>
        <div class="field"><span>Новый статус</span>${seg('status', { active: 'Учится', paused: 'Пауза', finished: 'Закончил', left: 'Ушёл' }, s.status === 'waiting' ? 'active' : s.status)}</div>
        <label class="field"><span>Причина</span><textarea class="input" name="reason" placeholder="Например: переезд, болезнь, не подошло время">${s.status_reason || ''}</textarea>
          <span class="hint">Для «Пауза» и «Ушёл» причина обязательна.</span></label>`,
      onSubmit: async (f) => {
        await api(`/api/students/${s.id}/status`, { method: 'POST', body: f });
        toast('Статус изменён');
        refresh();
      },
    }),
  });
}
