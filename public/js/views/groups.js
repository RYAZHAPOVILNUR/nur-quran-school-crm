import {
  api, html, raw, icon, plural, fmtDate, fmtDay, age, avatar, go, toast, refresh, sheet, onActions, options, seg,
  todayStr, addDays, weekdayName, currentMonthStr, addMonths, monthTitle,
} from '../core.js';
import { setTop } from '../app.js';
import { DIRECTIONS, FORMATS, GROUP_GENDER, WEEKDAYS, WEEKDAYS_FULL, ATTENDANCE, monthLabel } from '/shared/labels.js';
import { statusBadge } from './students.js';

export const scheduleText = (schedule) => {
  const byTime = new Map();
  for (const s of schedule) byTime.set(s.t, [...(byTime.get(s.t) || []), WEEKDAYS[s.d]]);
  return [...byTime].map(([t, days]) => `${days.join(', ')} ${t}`).join(' · ') || 'расписание не задано';
};

function groupCard(g, me) {
  const full = g.free === 0;
  return html`<div class="card">
    <a class="row" href="#/groups/${g.id}" style="border:0;align-items:flex-start">
      <div class="row-main">
        <div class="row-title" style="white-space:normal">${g.name}</div>
        <div class="row-sub">${me.role !== 'teacher' ? `${g.teacher_name} · ` : ''}${FORMATS[g.format]} · ${scheduleText(g.schedule)}</div>
        <div class="actions" style="margin-top:6px">
          <span class="badge ${full ? 'amber' : 'green'}">${g.seats} из ${g.capacity}${full ? ' · мест нет' : ''}</span>
          ${g.waiting ? html`<span class="badge amber">ждут: ${g.waiting}</span>` : ''}
          ${g.paused_month ? html`<span class="badge blue">${icon('pause', 'xs')} пауза в этом месяце</span>` : ''}
          ${g.today ? html`<span class="badge blue">сегодня ${g.today}</span>` : ''}
        </div>
      </div>
      ${icon('chevron', 'chev')}
    </a>
    <div style="padding:0 16px 14px">
      ${g.marked_today ? html`<a class="btn block soft" href="#/groups/${g.id}/attendance">${icon('check', 'sm')} Сегодня отмечено — изменить</a>`
        : html`<a class="btn block ${g.today ? 'primary' : ''}" href="#/groups/${g.id}/attendance">${icon('clipboard', 'sm')} Отметить посещаемость</a>`}
    </div>
  </div>`;
}

export async function list({ el, me }) {
  setTop({ title: me.role === 'teacher' ? 'Мои группы' : 'Группы' });
  const groups = await api('/api/groups');
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>${me.role === 'teacher' ? 'Мои группы' : 'Группы'}</h1><p>${groups.length} ${plural(groups.length, 'группа', 'группы', 'групп')}</p></div>
      ${me.can['groups.edit'] ? html`<button class="btn primary" data-action="new">${icon('plus')} Группа</button>` : ''}</div>
    <div class="grid-2">${groups.map((g) => groupCard(g, me))}</div>`);
  onActions(el, { new: () => groupForm(null) });
}

async function groupForm(g) {
  const teachers = await api('/api/teachers');
  const sched = g?.schedule || [];
  const row = (s = {}) => html`<div class="form-grid two" data-slot>
    <select class="input" name="sd">${options(Object.fromEntries(WEEKDAYS_FULL.slice(1).map((d, i) => [i + 1, d])), s.d, { empty: 'День' })}</select>
    <input class="input" type="time" name="st" value="${s.t || ''}"></div>`;
  sheet({
    title: g ? 'Изменить группу' : 'Новая группа',
    wide: true,
    body: html`
      <label class="field"><span>Название</span><input class="input" name="name" value="${g?.name || ''}" placeholder="Например: Хифз · мальчики"></label>
      <div class="form-grid two">
        <label class="field"><span>Направление</span><select class="input" name="direction">${options(DIRECTIONS, g?.direction)}</select></label>
        <label class="field"><span>Формат</span><select class="input" name="format">${options(FORMATS, g?.format)}</select></label>
      </div>
      <div class="field"><span>Для кого</span>${seg('gender', GROUP_GENDER, g?.gender || 'm')}</div>
      <div class="form-grid two">
        <label class="field"><span>Учитель</span><select class="input" name="teacher_id">${teachers.filter((t) => t.active).map((t) => html`<option value="${t.id}" data-gender="${t.gender}" ${t.id === g?.teacher_id ? raw('selected') : ''}>${t.name}</option>`)}</select>
          <span class="hint">Группы мальчиков и мужчин ведут учителя-мужчины, девочек и женщин — учительница.</span></label>
        <label class="field"><span>Лимит мест</span><input class="input" type="number" name="capacity" min="1" max="60" value="${g?.capacity || 10}"></label>
      </div>
      <div class="field"><span>Дни и время</span><div class="form-grid" id="slots">${(sched.length ? sched : [{}, {}]).map(row)}</div>
        <button type="button" class="btn sm ghost" id="add-slot">${icon('plus', 'sm')} Ещё день</button></div>`,
    onOpen: (form) => {
      form.querySelector('#add-slot').addEventListener('click', () => form.querySelector('#slots').insertAdjacentHTML('beforeend', String(row())));
    },
    onSubmit: async (f, form) => {
      const schedule = [...form.querySelectorAll('[data-slot]')].map((r) => ({ d: Number(r.querySelector('[name=sd]').value), t: r.querySelector('[name=st]').value })).filter((s) => s.d && s.t);
      const body = { ...f, schedule };
      const res = g ? await api(`/api/groups/${g.id}`, { method: 'PUT', body }) : await api('/api/groups', { method: 'POST', body });
      toast('Группа сохранена');
      g ? refresh() : go(`/groups/${res.id}`);
    },
  });
}

export async function detail({ el, params, me }) {
  const d = await api(`/api/groups/${params.id}`);
  const g = d.group;
  setTop({ title: g.name, back: '/groups' });
  const canEnroll = me.can['groups.enroll'];
  el.innerHTML = String(html`
    <div class="card card-pad" style="display:grid;gap:12px">
      <h1 style="font-size:22px">${g.name}</h1>
      <dl class="kv">
        <dt>Направление</dt><dd>${DIRECTIONS[g.direction]}</dd>
        <dt>Учитель</dt><dd>${g.teacher_name}</dd>
        <dt>Для кого</dt><dd>${GROUP_GENDER[g.gender]}</dd>
        <dt>Формат</dt><dd>${FORMATS[g.format]}</dd>
        <dt>Расписание</dt><dd>${scheduleText(g.schedule)}</dd>
        <dt>Места</dt><dd>${g.seats} из ${g.capacity}${g.free === 0 ? ' — группа заполнена' : `, свободно ${g.free}`}</dd>
      </dl>
      ${g.paused_month ? html`<div class="notice">${icon('pause', 'sm')} В этом месяце группа на паузе: ${g.paused_month.reason}. Абонемент не начисляется.</div>` : ''}
      <div class="actions stretch">
        <a class="btn primary" href="#/groups/${g.id}/attendance">${icon('clipboard', 'sm')} Отметить посещаемость</a>
        ${me.can['groups.edit'] ? html`<button class="btn" data-action="edit">${icon('edit', 'sm')} Изменить</button>
          <button class="btn" data-action="pause">${icon('pause', 'sm')} Пауза на месяц</button>` : ''}
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2>${icon('users')} Ученики</h2><span class="badge">${d.students.length}</span></div>
      ${d.students.length ? html`<div class="list">${d.students.map((s) => html`<a class="row" href="#/students/${s.id}">
        ${avatar(s.name, s.gender)}<div class="row-main"><div class="row-title">${s.name}</div><div class="row-sub">${age(s.birth_year)}</div></div>
        ${s.status !== 'active' ? statusBadge(s.status) : ''}${s.is_free ? html`<span class="badge gold">садака</span>` : ''}</a>`)}</div>`
      : html`<div class="empty">В группе пока нет учеников</div>`}
    </div>

    ${me.role !== 'teacher' ? html`<div class="card">
      <div class="card-head"><h2>${icon('clock')} Лист ожидания</h2><span class="badge ${d.waitlist.length ? 'amber' : ''}">${d.waitlist.length}</span></div>
      ${d.waitlist.length ? html`<div class="list">${d.waitlist.map((w) => html`<div class="row">
        <div class="row-main"><a class="row-title" href="#/students/${w.student_id}" style="display:block;color:inherit">${w.name}</a>
          <div class="row-sub">ждёт с ${fmtDate(w.created_at)} · ${w.family_name}${w.phone ? `, ${w.phone}` : ''}</div></div>
        ${canEnroll && g.free > 0 ? html`<button class="btn sm primary" data-action="enroll" data-id="${w.student_id}">Записать</button>` : html`<span class="small muted">нет мест</span>`}
      </div>`)}</div>` : html`<div class="empty">Никто не ждёт места</div>`}
    </div>` : ''}

    <div class="card">
      <div class="card-head"><h2>${icon('calendar')} Последние занятия</h2></div>
      ${d.lessons.length ? html`<div class="list">${d.lessons.map((l) => html`<a class="row" href="#/groups/${g.id}/attendance?date=${l.date}">
        <div class="row-main"><div class="row-title">${fmtDay(l.date)}, ${weekdayName(l.date).toLowerCase()}</div><div class="row-sub">вёл(а): ${l.teacher_name}</div></div>
        <span class="small muted">пришли ${l.came} из ${l.total}</span>${icon('chevron', 'chev')}</a>`)}</div>` : html`<div class="empty">Занятий ещё не отмечали</div>`}
    </div>`);

  onActions(el, {
    edit: () => groupForm(g),
    enroll: async (b) => {
      const res = await api(`/api/students/${b.dataset.id}/group`, { method: 'POST', body: { group_id: g.id } });
      toast(res.status === 'active' ? 'Записан в группу' : 'Мест всё ещё нет');
      refresh();
    },
    pause: () => {
      const months = [0, 1, 2, 3].map((i) => addMonths(currentMonthStr(), i));
      sheet({
        title: 'Пауза группы на месяц',
        body: html`<p class="muted small">За выбранный месяц ученикам этой группы абонемент не начисляется. Уже начисленный за этот месяц — отменится.</p>
          <label class="field"><span>Месяц</span><select class="input" name="month">${months.map((m) => html`<option value="${m}">${monthTitle(m)}</option>`)}</select></label>
          <label class="field"><span>Причина</span><input class="input" name="reason" placeholder="Например: учитель в отъезде"></label>`,
        submit: 'Поставить на паузу',
        onSubmit: async (f) => {
          await api('/api/months-off', { method: 'POST', body: { ...f, group_id: g.id } });
          toast(`Пауза на ${monthLabel(f.month)}`);
          refresh();
        },
      });
    },
  });
}

// ---------- Отметка посещаемости: по умолчанию все «был», учитель меняет только исключения ----------
export async function attendance({ el, params, query, me }) {
  const date = query.date || todayStr();
  const d = await api(`/api/groups/${params.id}/attendance?date=${date}`);
  const g = d.group;
  const individual = g.direction === 'individual';
  setTop({ title: 'Посещаемость', back: me.role === 'teacher' ? '/' : `/groups/${g.id}` });
  const isToday = date === todayStr();

  el.innerHTML = String(html`
    <div class="page-head"><div><h1 style="font-size:21px">${g.name}</h1>
      <p>${weekdayName(date)}, ${fmtDay(date)}${d.scheduled ? '' : ' · не по расписанию'}${d.lesson ? ' · уже отмечено' : ''}</p></div></div>
    <div class="actions">
      <a class="btn sm" href="#/groups/${g.id}/attendance?date=${addDays(date, -1)}">${icon('left', 'sm')} Раньше</a>
      <input class="input" type="date" id="date" value="${date}" max="${todayStr()}" style="width:auto;min-height:38px;padding:6px 10px;font-size:15px">
      ${!isToday ? html`<a class="btn sm" href="#/groups/${g.id}/attendance">Сегодня</a>` : ''}
    </div>
    ${individual ? html`<div class="notice gray">Индивидуальные занятия: отметьте только тех, у кого сегодня был урок. Оплата начисляется за каждый проведённый урок.</div>` : ''}
    ${d.teachers.length ? html`<label class="field"><span>Кто провёл урок</span><select class="input" id="teacher">${d.teachers.map((t) => html`<option value="${t.id}" ${t.id === (d.lesson?.teacher_id || g.teacher_id) ? raw('selected') : ''}>${t.name}${t.id === g.teacher_id ? ' (учитель группы)' : ' (замена)'}</option>`)}</select></label>` : ''}
    <form class="card" id="att">
      ${d.students.length ? html`<div class="att-list">${d.students.map((s) => {
        const mark = s.mark || (individual ? null : 'present');
        return html`<div class="att-row">
          <div class="att-name">${s.name}${s.streak >= 2 ? html` <span class="badge red">${s.streak} ${plural(s.streak, 'пропуск', 'пропуска', 'пропусков')} подряд</span>` : ''}</div>
          <div class="att-opts" role="radiogroup" aria-label="${s.name}">
            ${Object.entries(ATTENDANCE).map(([k, v]) => html`<label><input type="radio" name="s${s.id}" value="${k}" ${mark === k ? raw('checked') : ''}><span class="${k}">${v}</span></label>`)}
          </div></div>`;
      })}</div>` : html`<div class="empty">В группе нет учеников на эту дату</div>`}
    </form>
    ${d.students.length ? html`<div class="sticky-foot">
      <div class="summary" id="summary"></div>
      <button class="btn primary" id="save">${icon('check', 'sm')} Сохранить</button>
    </div>` : ''}`);

  const form = el.querySelector('#att');
  const summary = el.querySelector('#summary');
  const update = () => {
    if (!summary) return;
    const marks = d.students.map((s) => form.querySelector(`[name=s${s.id}]:checked`)?.value).filter(Boolean);
    const came = marks.filter((m) => m === 'present' || m === 'late').length;
    summary.innerHTML = String(html`Пришли <b>${came}</b> из ${individual ? marks.length : d.students.length}`);
  };
  form.addEventListener('change', update);
  update();
  el.querySelector('#date').addEventListener('change', (e) => e.target.value && go(`/groups/${g.id}/attendance?date=${e.target.value}`));
  el.querySelector('#save')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const marks = d.students.map((s) => ({ student_id: s.id, status: form.querySelector(`[name=s${s.id}]:checked`)?.value })).filter((m) => m.status);
    btn.disabled = true;
    try {
      const res = await api(`/api/groups/${g.id}/attendance`, { method: 'POST', body: { date, marks, teacher_id: el.querySelector('#teacher')?.value } });
      if (res.alerts.length) {
        sheet({
          title: 'Внимание',
          body: html`<div class="notice red">${icon('alert', 'sm')}<div>${res.alerts.map((a) => html`<div><b>${a.name}</b> — ${a.streak} ${plural(a.streak, 'пропуск', 'пропуска', 'пропусков')} подряд без уважительной причины.</div>`)}
            <div style="margin-top:6px">Устаз увидит это на главном экране, чтобы связаться с семьёй.</div></div></div>`,
          footer: html`<button type="button" class="btn primary block" data-close>Понятно</button>`,
        });
      } else {
        toast('Посещаемость сохранена');
      }
      go(me.role === 'teacher' ? '/' : `/groups/${g.id}`);
    } catch (ex) {
      toast(ex.message, 'error');
    } finally { btn.disabled = false; }
  });
}

// ---------- Расписание недели ----------
export async function schedule({ el, me }) {
  setTop({ title: 'Расписание' });
  const groups = await api('/api/schedule');
  const today = new Date(todayStr() + 'T00:00:00Z').getUTCDay() || 7;
  const days = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
    d,
    slots: groups.flatMap((g) => g.schedule.filter((s) => s.d === d).map((s) => ({ ...g, time: s.t }))).sort((a, b) => a.time.localeCompare(b.time)),
  }));
  const ordered = window.innerWidth < 960 ? [...days.slice(today - 1), ...days.slice(0, today - 1)] : days;
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Расписание недели</h1><p>${me.role === 'teacher' ? 'Ваши группы' : `${groups.length} групп, все учителя`}</p></div></div>
    <div class="week">${ordered.map((day) => html`<section class="day ${day.d === today ? 'today' : ''}">
      <div class="day-head">${WEEKDAYS_FULL[day.d]}${day.d === today ? html`<span class="badge green">сегодня</span>` : ''}</div>
      ${day.slots.length ? day.slots.map((s) => html`<a class="slot ${s.gender === 'f' ? 'f' : ''}" href="#/groups/${s.id}">
        <time>${s.time}</time><div style="font-weight:600;font-size:14px;line-height:1.3">${s.name}</div>
        <div class="small">${s.teacher_name} · ${s.format === 'online' ? 'онлайн' : 'очно'}</div></a>`)
      : html`<div class="small muted" style="padding:4px 2px">Занятий нет</div>`}
    </section>`)}</div>`);
}
