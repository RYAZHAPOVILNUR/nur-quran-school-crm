import {
  api, html, icon, rub, plural, fmtDate, go, toast, refresh, sheet, onActions, monthSwitch, currentMonthStr, monthName, monthTitle,
  addMonths, barChart, confirmSheet, avatar,
} from '../core.js';
import { setTop } from '../app.js';
import { METHODS, MONTHS_PREP } from '/shared/labels.js';

// ---------- Учителя и зарплата ----------
export async function teachers({ el, query }) {
  const month = query.month || currentMonthStr();
  setTop({ title: 'Учителя и зарплата' });
  const [s, list] = await Promise.all([api(`/api/salary?month=${month}`), api('/api/teachers')]);
  const groupsCount = new Map(list.map((t) => [t.id, t.groups]));
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Зарплата учителей</h1><p>Оплата за проведённые уроки по ставке</p></div>${monthSwitch(month)}</div>
    <div class="tiles">
      <div class="card tile accent"><span class="tile-label">Начислено за ${monthName(month)}</span><span class="tile-value">${rub(s.total)}</span></div>
      <div class="card tile"><span class="tile-label">Выплачено</span><span class="tile-value">${rub(s.paid)}</span><span class="tile-note">${s.total - s.paid > 0 ? `осталось ${rub(s.total - s.paid)}` : 'всё выплачено'}</span></div>
    </div>
    <div class="grid-2">${s.list.map((t) => {
      const left = t.amount - t.paid;
      return html`<div class="card">
        <div class="row" style="border:0">${avatar(t.name, t.gender)}
          <div class="row-main"><div class="row-title">${t.name}</div><div class="row-sub">${groupsCount.get(t.id) || 0} ${plural(groupsCount.get(t.id) || 0, 'группа', 'группы', 'групп')} · ставка ${rub(t.rate)} за урок</div></div>
          <div class="row-end"><span class="money" style="font-size:18px">${rub(t.amount)}</span>
            ${t.amount === 0 ? '' : left <= 0 ? html`<span class="badge green">${icon('check', 'xs')} выплачено</span>` : t.paid ? html`<span class="badge amber">ещё ${rub(left)}</span>` : html`<span class="badge amber">не выплачено</span>`}</div>
        </div>
        <div class="card-pad" style="padding-top:0;display:grid;gap:10px">
          <div class="small muted">${t.lessons} ${plural(t.lessons, 'урок', 'урока', 'уроков')}: групповых ${t.group_lessons}${t.individual_lessons ? `, индивидуальных ${t.individual_lessons}` : ''} × ${rub(t.rate)}</div>
          <div class="actions stretch">
            ${left > 0 ? html`<button class="btn soft" data-action="payout" data-id="${t.id}" data-name="${t.name}" data-amount="${left}">${icon('coins', 'sm')} Отметить выплату</button>` : ''}
            <button class="btn" data-action="rate" data-id="${t.id}" data-name="${t.name}" data-rate="${t.rate}">${icon('edit', 'sm')} Ставка</button>
          </div>
        </div>
      </div>`;
    })}</div>
    <p class="small muted">Урок засчитывается тому, кто его провёл (отметил посещаемость). Если урок вёл замещающий учитель — он и получит оплату.</p>`);

  onActions(el, {
    month: (b) => go(`/teachers?month=${b.dataset.month}`),
    payout: (b) => sheet({
      title: `Выплата: ${b.dataset.name}`,
      body: html`<label class="field"><span>Сумма за ${monthTitle(month)}</span><input class="input" type="number" name="amount" value="${b.dataset.amount}"></label>`,
      submit: 'Отметить выплату',
      onSubmit: async (f) => { await api('/api/salary/payout', { method: 'POST', body: { teacher_id: Number(b.dataset.id), month, amount: f.amount } }); toast('Выплата отмечена'); refresh(); },
    }),
    rate: (b) => sheet({
      title: `Ставка: ${b.dataset.name}`,
      body: html`<label class="field"><span>Ставка за урок, ₽</span><input class="input" type="number" name="rate" value="${b.dataset.rate}" step="50"></label>
        <p class="small muted">Новая ставка сразу применится к расчёту за выбранный месяц.</p>`,
      onSubmit: async (f) => { await api(`/api/teachers/${b.dataset.id}`, { method: 'PUT', body: f }); toast('Ставка сохранена'); refresh(); },
    }),
  });
}

// ---------- Финансы школы ----------
export async function finance({ el, query }) {
  const month = query.month || currentMonthStr();
  setTop({ title: 'Финансы' });
  const d = await api(`/api/finance?month=${month}`);
  const rate = d.charged ? Math.round((d.collected / d.charged) * 100) : 0;
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Финансы школы</h1><p>Сколько пришло, сколько ушло на зарплаты и сколько должны</p></div>${monthSwitch(month)}</div>
    <div class="tiles">
      <div class="card tile accent"><span class="tile-label">Пришло в ${MONTHS_PREP[Number(month.slice(5, 7)) - 1]}</span><span class="tile-value">${rub(d.income)}</span>
        <span class="tile-note">${Object.entries(d.by_method).map(([k, v]) => `${METHODS[k].toLowerCase()} ${rub(v)}`).join(' · ')}</span></div>
      <div class="card tile"><span class="tile-label">Зарплаты учителей</span><span class="tile-value">${rub(d.salaries)}</span></div>
      <div class="card tile"><span class="tile-label">Остаётся школе</span><span class="tile-value" style="color:var(--accent)">${rub(d.profit)}</span><span class="tile-note">без аренды и прочих расходов</span></div>
      <div class="card tile ${d.debt.debt ? 'alert' : ''}"><span class="tile-label">Должны сейчас</span><span class="tile-value">${rub(d.debt.debt)}</span><span class="tile-note">${d.debt.families} ${plural(d.debt.families, 'семья', 'семьи', 'семей')}</span></div>
    </div>
    <div class="card"><div class="card-head"><h2>${icon('chart')} Приход по месяцам</h2></div>
      <div class="card-pad" style="padding-top:0">${barChart(d.chart.map((c) => ({ label: monthName(c.month).slice(0, 3), value: c.income })))}</div></div>
    <div class="grid-2">
      <div class="card"><div class="card-head"><h2>Собираемость за ${monthName(month)}</h2><span class="badge ${rate >= 90 ? 'green' : 'amber'}">${rate}%</span></div>
        <div class="list">
          <div class="row"><div class="row-main">Начислено за месяц</div><span class="money">${rub(d.charged)}</span></div>
          <div class="row"><div class="row-main">Оплачено за этот месяц</div><span class="money green">${rub(d.collected)}</span></div>
          <div class="row"><div class="row-main">Ещё не оплачено</div><span class="money">${rub(Math.max(0, d.charged - d.collected))}</span></div>
        </div></div>
      <div class="card"><div class="card-head"><h2>${icon('heart')} Садака — учатся бесплатно</h2></div>
        <div class="list">
          <div class="row"><div class="row-main"><div class="row-title">${d.free.count} ${plural(d.free.count, 'ученик', 'ученика', 'учеников')}</div><div class="row-sub">на эту сумму школа учит бесплатно в месяц</div></div><span class="money">${rub(d.free.sum)}</span></div>
          ${d.free.students.map((s) => html`<a class="row" href="#/students/${s.id}"><div class="row-main"><div class="row-title">${s.name}</div><div class="row-sub">${s.free_reason || ''}</div></div>${icon('chevron', 'chev')}</a>`)}
        </div></div>
    </div>`);
  onActions(el, { month: (b) => go(`/finance?month=${b.dataset.month}`) });
}

// ---------- Настройки ----------
export async function settings({ el }) {
  setTop({ title: 'Настройки' });
  const [p, off, groups, log] = await Promise.all([api('/api/settings'), api('/api/months-off'), api('/api/groups'), api('/api/audit')]);
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Настройки</h1><p>Цены, каникулы и сохранность данных</p></div></div>
    <form class="card" id="prices">
      <div class="form-section">
        <h3>Цены</h3>
        <div class="form-grid two">
          <label class="field"><span>Абонемент в группе, ₽/мес</span><input class="input" type="number" name="group" value="${p.group}" step="100"></label>
          <label class="field"><span>Индивидуальный урок, ₽</span><input class="input" type="number" name="individual" value="${p.individual}" step="100"></label>
          <label class="field"><span>Скидка второму и следующим детям, %</span><input class="input" type="number" name="discount" value="${p.discount}" min="0" max="50"></label>
          <label class="field"><span>Оплатить до какого числа</span><input class="input" type="number" name="dueDay" value="${p.dueDay}" min="1" max="28"></label>
        </div>
        <p class="small muted">Новые цены применяются к следующим начислениям. Уже начисленные месяцы не меняются.</p>
        <button class="btn primary" type="submit">Сохранить цены</button>
      </div>
    </form>

    <div class="card">
      <div class="card-head"><h2>${icon('moon')} Каникулы и паузы</h2><button class="btn sm primary" data-action="off">${icon('plus', 'sm')} Добавить</button></div>
      <p class="small muted" style="padding:0 16px 10px">За отмеченный месяц абонемент не берётся: для всей школы (Рамадан, праздники) или для одной группы.</p>
      ${off.length ? html`<div class="list">${off.map((m) => html`<div class="row">
        <div class="row-main"><div class="row-title">${monthTitle(m.month)}</div><div class="row-sub">${m.group_name ? `группа «${m.group_name}»` : 'вся школа'} · ${m.reason}</div></div>
        <button class="btn sm ghost" data-action="unoff" data-id="${m.id}" data-label="${monthTitle(m.month)}">Отменить</button></div>`)}</div>`
      : html`<div class="empty">Каникул не отмечено</div>`}
    </div>

    <div class="card card-pad" style="display:grid;gap:10px">
      <h2>${icon('archive')} Сохранность данных</h2>
      <p class="small muted">Каждый день система сама сохраняет копию базы (хранятся 14 последних). Ученики, оплаты и заявки не удаляются — только меняют статус. Скачайте копию, чтобы хранить её отдельно.</p>
      <a class="btn" href="/api/backup" download>${icon('download', 'sm')} Скачать резервную копию</a>
    </div>

    <div class="card"><div class="card-head"><h2>${icon('list')} Журнал действий</h2><span class="small muted">последние 50</span></div>
      <div class="list">${log.map((a) => html`<div class="row" style="min-height:48px"><div class="row-main">
        <div class="row-title" style="font-weight:550;font-size:14.5px">${ACTIONS[a.action] || a.action}</div>
        <div class="row-sub">${fmtDate(a.created_at)} ${a.created_at.slice(11, 16)} · ${a.user_name || 'система'}</div></div></div>`)}</div></div>`);

  el.querySelector('#prices').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try { await api('/api/settings', { method: 'PUT', body: f }); toast('Цены сохранены'); refresh(); } catch (ex) { toast(ex.message, 'error'); }
  });
  onActions(el, {
    off: () => {
      const months = Array.from({ length: 8 }, (_, i) => addMonths(currentMonthStr(), i));
      sheet({
        title: 'Месяц без оплаты',
        body: html`
          <label class="field"><span>Месяц</span><select class="input" name="month">${months.map((m) => html`<option value="${m}">${monthTitle(m)}</option>`)}</select></label>
          <label class="field"><span>Для кого</span><select class="input" name="group_id"><option value="">Вся школа (каникулы)</option>${groups.map((g) => html`<option value="${g.id}">${g.name}</option>`)}</select></label>
          <label class="field"><span>Причина</span><input class="input" name="reason" placeholder="Например: Рамадан — каникулы"></label>`,
        onSubmit: async (f) => { await api('/api/months-off', { method: 'POST', body: f }); toast('Отмечено'); refresh(); },
      });
    },
    unoff: async (b) => {
      if (!(await confirmSheet({ title: 'Отменить каникулы?', text: `${b.dataset.label}: абонемент снова будет начисляться.`, submit: 'Отменить каникулы' }))) return;
      await api(`/api/months-off/${b.dataset.id}/cancel`, { method: 'POST', body: {} });
      toast('Каникулы отменены');
      refresh();
    },
  });
}

const ACTIONS = {
  'student.create': 'Добавлен ученик', 'student.update': 'Изменены данные ученика', 'student.status': 'Изменён статус ученика',
  'student.group': 'Ученик переведён в группу', 'waitlist.add': 'Ученик в листе ожидания', 'family.update': 'Изменены контакты семьи',
  'group.create': 'Создана группа', 'group.update': 'Изменена группа', 'group.archive': 'Группа в архиве',
  'attendance.save': 'Отмечена посещаемость', 'hifz.add': 'Запись по хифзу', 'payment.create': 'Принята оплата', 'payment.cancel': 'Отменена оплата',
  'lead.create': 'Новая заявка', 'lead.status': 'Изменён этап заявки', 'lead.convert': 'Заявка стала учеником',
  'settings.update': 'Изменены цены', 'month_off.create': 'Отмечены каникулы/пауза', 'month_off.cancel': 'Отменены каникулы',
  'teacher.create': 'Добавлен учитель', 'teacher.update': 'Изменена ставка учителя', 'salary.payout': 'Отмечена выплата зарплаты', 'backup.download': 'Скачана резервная копия',
};
