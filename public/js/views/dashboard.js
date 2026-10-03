import { api, html, icon, rub, plural, fmtDay, fmtDayShort, daysAgo, weekdayName, monthName, barChart, onActions, contactButtons, sheet, toast, refresh, copyText, avatar } from '../core.js';
import { setTop } from '../app.js';
import { DIRECTIONS, SOURCES, MONTHS_PREP } from '/shared/labels.js';

const greetingDate = (d) => `${weekdayName(d)}, ${fmtDay(d)}`;

function alertsCard(alerts, me) {
  if (!alerts.length) {
    return html`<div class="card"><div class="card-head"><h2>${icon('check')} Пропусков подряд нет</h2></div>
      <p class="empty" style="padding-top:0">Никто не пропустил три занятия подряд без уважительной причины.</p></div>`;
  }
  return html`<div class="card danger">
    <div class="card-head"><h2>${icon('alert')} Начали пропадать</h2><span class="badge red">${alerts.length}</span></div>
    <div class="list">${alerts.map((a) => html`<div class="row" style="align-items:flex-start">
      ${avatar(a.name, a.gender)}
      <div class="row-main">
        <a class="row-title" href="#/students/${a.id}" style="color:inherit;display:block">${a.name}</a>
        <div class="row-sub wrap">${a.group_name} · ${a.streak} ${plural(a.streak, 'пропуск', 'пропуска', 'пропусков')} подряд: ${a.missed_dates.map(fmtDayShort).join(', ')}</div>
        <div class="row-sub wrap">${a.is_self ? 'Сам ученик' : 'Родитель'}: ${a.family_name}${a.phone ? ` · ${a.phone}` : ''}${a.last_seen ? ` · последний раз был ${fmtDayShort(a.last_seen)}` : ''}</div>
        ${a.contact ? html`<div class="row-sub"><span class="badge green">${icon('check', 'xs')} Связались ${fmtDayShort(a.contact.created_at)} · ${a.contact.user_name}</span></div>` : ''}
        ${me.role !== 'teacher' ? html`<div style="margin-top:10px" class="actions">
          ${contactButtons(a)}
          ${!a.contact && me.can['alerts.contact'] ? html`<button class="btn sm soft" data-action="contacted" data-id="${a.id}" data-name="${a.name}">${icon('check', 'sm')} Связались</button>` : ''}
        </div>` : ''}
      </div></div>`)}
    </div></div>`;
}

function juzCard(list) {
  return html`<div class="card gold">
    <div class="card-head"><h2>${icon('star')} Закончили джуз на этой неделе</h2></div>
    ${list.length ? html`<div class="list">${list.map((j) => html`<div class="row">
      <span class="avatar f">${j.juz}</span>
      <div class="row-main"><a class="row-title" href="#/students/${j.student_id}" style="color:inherit;display:block">${j.name}</a>
        <div class="row-sub">${j.juz}-й джуз · ${fmtDay(j.date)} · ${j.teacher_name || ''}</div></div>
      <button class="btn sm gold" data-action="congrats" data-name="${j.name}" data-gender="${j.gender}" data-juz="${j.juz}">Поздравить</button>
    </div>`)}</div>` : html`<p class="empty" style="padding-top:0">На этой неделе пока никто не закончил джуз.</p>`}
  </div>`;
}

function todayCard(groups, me) {
  return html`<div class="card">
    <div class="card-head"><h2>${icon('clock')} Занятия сегодня</h2>${me.role !== 'teacher' ? html`<a class="link" href="#/schedule">Неделя</a>` : ''}</div>
    ${groups.length ? html`<div class="list">${groups.map((g) => html`<a class="row" href="#/groups/${g.id}/attendance">
      <div style="min-width:52px;font-weight:700;font-variant-numeric:tabular-nums">${g.time}</div>
      <div class="row-main"><div class="row-title">${g.name}</div>
        <div class="row-sub">${me.role !== 'teacher' ? `${g.teacher_name} · ` : ''}${g.students} ${plural(g.students, 'ученик', 'ученика', 'учеников')}</div></div>
      ${g.marked ? html`<span class="badge green">${icon('check', 'xs')} Отмечено</span>` : html`<span class="btn sm primary">Отметить</span>`}
    </a>`)}</div>` : html`<p class="empty" style="padding-top:0">Сегодня по расписанию занятий нет.</p>`}
  </div>`;
}

function congratsText(name, gender, juz) {
  const first = name.split(' ')[0];
  const done = gender === 'f' ? 'завершила' : 'завершил';
  return `Ассаляму алейкум! Радостная новость из школы Корана «Нур»: ${first} ${done} заучивание ${juz}-го джуза Корана. Машаллах! Пусть Аллах сделает Коран светом сердца и заступником в Судный день, а вам воздаст благом за воспитание. БаракаЛлаху фикум!`;
}

export async function dashboard({ el, me }) {
  const d = await api('/api/dashboard');
  setTop({ title: me.role === 'teacher' ? 'Сегодня' : 'Главная' });

  const header = html`<div class="page-head"><div><h1>Ассаляму алейкум, ${me.name}</h1><p>${greetingDate(d.today)}</p></div></div>`;

  if (me.role === 'teacher') {
    el.innerHTML = String(html`${header}
      <div class="tiles">
        <a class="card tile" href="#/students"><span class="tile-label">${icon('users', 'sm')} Мои ученики</span><span class="tile-value">${d.students}</span><span class="tile-note">в ${d.groups} ${plural(d.groups, 'группе', 'группах', 'группах')}</span></a>
        <a class="card tile ${d.alerts.length ? 'alert' : ''}" href="#/students"><span class="tile-label">${icon('alert', 'sm')} Пропадают</span><span class="tile-value">${d.alerts.length}</span><span class="tile-note">3 пропуска подряд</span></a>
      </div>
      ${todayCard(d.groups_today, me)}
      ${alertsCard(d.alerts, me)}
      ${juzCard(d.juz_week)}`);
  } else {
    const m = d.money;
    const cur = monthName(d.today.slice(0, 7));
    const curPrep = MONTHS_PREP[Number(d.today.slice(5, 7)) - 1];
    el.innerHTML = String(html`${header}
      <div class="tiles">
        <a class="card tile" href="#/students"><span class="tile-label">${icon('users', 'sm')} Учатся</span><span class="tile-value">${d.students.active}</span>
          <span class="tile-note">${d.students.new_month ? html`<span class="up">+${d.students.new_month}</span> ${plural(d.students.new_month, 'новый', 'новых', 'новых')} в ${curPrep}` : 'новых в этом месяце нет'}</span></a>
        ${m ? html`<a class="card tile accent" href="#/money/payments"><span class="tile-label">${icon('coins', 'sm')} Пришло за ${cur}</span><span class="tile-value">${rub(m.income_month)}</span>
          <span class="tile-note">ожидаем ещё ${rub(m.upcoming)}</span></a>
        <a class="card tile ${m.debt ? 'alert' : ''}" href="#/money"><span class="tile-label">${icon('wallet', 'sm')} Нам должны</span><span class="tile-value">${rub(m.debt)}</span>
          <span class="tile-note">${m.families} ${plural(m.families, 'семья', 'семьи', 'семей')} просрочили</span></a>` : ''}
        <a class="card tile ${d.new_leads.length ? 'alert' : ''}" href="#/leads?status=new"><span class="tile-label">${icon('inbox', 'sm')} Новые заявки</span><span class="tile-value">${d.new_leads.length}</span>
          <span class="tile-note">ещё не ответили</span></a>
      </div>

      ${alertsCard(d.alerts, me)}

      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h2>${icon('inbox')} Заявки без ответа</h2><a class="link" href="#/leads">Все заявки</a></div>
          ${d.new_leads.length ? html`<div class="list">${d.new_leads.map((l) => html`<a class="row" href="#/leads/${l.id}">
            <div class="row-main"><div class="row-title">${l.name}${l.age ? `, ${l.age}` : ''}</div>
              <div class="row-sub">${DIRECTIONS[l.interest] || 'Направление не выбрано'} · ${SOURCES[l.source] || ''}</div></div>
            <span class="badge ${daysAgo(l.created_at) === 'сегодня' ? 'amber' : 'red'}">${daysAgo(l.created_at)}</span>
          </a>`)}</div>` : html`<p class="empty" style="padding-top:0">На все заявки ответили.</p>`}
        </div>
        ${juzCard(d.juz_week)}
      </div>

      ${m ? html`<div class="card">
        <div class="card-head"><h2>${icon('chart')} Приход денег за полгода</h2>${me.can['finance.view'] ? html`<a class="link" href="#/finance">Финансы</a>` : ''}</div>
        <div class="card-pad" style="padding-top:0">${barChart(m.chart.map((c) => ({ label: monthName(c.month).slice(0, 3), value: c.amount })))}</div>
        <div class="list">
          ${m.salaries != null ? html`<div class="row"><div class="row-main"><div class="row-title">Зарплаты учителей за ${cur}</div><div class="row-sub">по проведённым урокам на сегодня</div></div><span class="money">${rub(m.salaries)}</span></div>
          <div class="row"><div class="row-main"><div class="row-title">Остаётся школе</div><div class="row-sub">пришло минус зарплаты</div></div><span class="money green">${rub(m.profit)}</span></div>` : ''}
          <div class="row"><div class="row-main"><div class="row-title">${icon('heart', 'xs')} Учатся бесплатно (садака)</div><div class="row-sub">${m.free.students.map((s) => s.name).join(', ')}</div></div>
            <div class="row-end"><span class="money">${rub(m.free.sum)}</span><span class="small muted">${m.free.count} ${plural(m.free.count, 'ученик', 'ученика', 'учеников')} в месяц</span></div></div>
        </div>
      </div>` : ''}

      ${todayCard(d.groups_today, me)}`);
  }

  onActions(el, {
    contacted: (b) => sheet({
      title: `Связались с семьёй`,
      submit: 'Сохранить',
      body: html`<p class="muted">${b.dataset.name}: отметьте, что поговорили с семьёй. Предупреждение останется, пока ученик снова не придёт на занятие.</p>
        <label class="field"><span>О чём договорились</span><textarea class="input" name="note" placeholder="Например: болел, вернётся в понедельник"></textarea></label>`,
      onSubmit: async (data) => {
        await api(`/api/students/${b.dataset.id}/contact`, { method: 'POST', body: data });
        toast('Отмечено');
        refresh();
      },
    }),
    congrats: async (b) => {
      const text = congratsText(b.dataset.name, b.dataset.gender, b.dataset.juz);
      sheet({
        title: 'Поздравление семье',
        body: html`<textarea class="input reminder-text" name="text" style="min-height:200px">${text}</textarea>`,
        submit: 'Скопировать текст',
        onSubmit: async (data) => { await copyText(data.text); toast('Текст скопирован — отправьте его семье'); },
      });
    },
  });
}
