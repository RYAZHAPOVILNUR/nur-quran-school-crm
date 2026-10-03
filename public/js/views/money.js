import {
  api, html, raw, icon, rub, plural, fmtDate, fmtDayShort, go, toast, refresh, sheet, onActions, seg, todayStr, monthName,
  monthSwitch, currentMonthStr, copyText, waLink, tgLink, confirmSheet, avatar,
} from '../core.js';
import { setTop } from '../app.js';
import { METHODS, monthLabel } from '/shared/labels.js';

const tabs = (active) => html`<div class="chips">
  <a class="chip ${active === 'debtors' ? 'active' : ''}" href="#/money">Кто должен</a>
  <a class="chip ${active === 'payments' ? 'active' : ''}" href="#/money/payments">Оплаты</a>
  <a class="chip" href="#/pay">${icon('plus', 'xs')} Принять оплату</a>
</div>`;

// Окно с готовым вежливым напоминанием: скопировать или сразу открыть WhatsApp / Telegram.
export async function openReminder(familyId) {
  const r = await api(`/api/families/${familyId}/reminder`);
  if (!r.text) { toast('У этой семьи нет просроченных оплат'); return; }
  const f = r.family;
  const log = (channel) => api(`/api/families/${familyId}/reminder`, { method: 'POST', body: { channel } }).catch(() => {});
  sheet({
    title: 'Напоминание об оплате',
    body: html`<p class="muted small">Текст можно поправить перед отправкой. ${f.name}${f.phone ? ` · ${f.phone}` : ''}</p>
      <textarea class="input reminder-text" name="text" id="rtext">${r.text}</textarea>`,
    footer: html`<button type="button" class="btn primary block" data-r="copy">${icon('copy', 'sm')} Скопировать текст</button>
      <div class="actions stretch">
        ${f.whatsapp || f.phone ? html`<button type="button" class="btn" data-r="wa">${icon('message', 'sm')} WhatsApp</button>` : ''}
        ${f.telegram ? html`<button type="button" class="btn" data-r="tg">${icon('send', 'sm')} Telegram</button>` : ''}
      </div>`,
    onOpen: (form, close) => {
      const text = () => form.querySelector('#rtext').value;
      form.querySelector('[data-r=copy]').addEventListener('click', async () => {
        await copyText(text());
        log('copy');
        toast('Текст скопирован — вставьте его в WhatsApp или Telegram');
        close();
      });
      form.querySelector('[data-r=wa]')?.addEventListener('click', () => {
        log('whatsapp');
        window.open(waLink(f.whatsapp || f.phone, text()), '_blank', 'noopener');
      });
      form.querySelector('[data-r=tg]')?.addEventListener('click', async () => {
        await copyText(text());
        log('telegram');
        toast('Текст скопирован — вставьте его в чат');
        window.open(tgLink(f.telegram), '_blank', 'noopener');
      });
    },
  });
}

export async function debtors({ el }) {
  setTop({ title: 'Кто должен' });
  const d = await api('/api/money/debtors');
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Кто должен</h1><p>Просрочено: прошлые месяцы и текущий после ${d.due_day}-го числа</p></div></div>
    ${tabs('debtors')}
    <div class="tiles">
      <div class="card tile ${d.total.debt ? 'alert' : ''}"><span class="tile-label">Нам должны</span><span class="tile-value">${rub(d.total.debt)}</span>
        <span class="tile-note">${d.total.families} ${plural(d.total.families, 'семья', 'семьи', 'семей')}</span></div>
      <div class="card tile"><span class="tile-label">Ожидаем в этом месяце</span><span class="tile-value">${rub(d.total.upcoming)}</span>
        <span class="tile-note">срок — до ${d.due_day}-го</span></div>
    </div>
    ${d.list.length ? html`<div class="grid-2">${d.list.map((f) => html`<div class="card">
      <div class="row" style="border:0;align-items:flex-start">
        ${avatar(f.name, null)}
        <div class="row-main">
          <a class="row-title" href="#/families/${f.id}" style="display:block;color:inherit">${f.name}</a>
          <div class="row-sub wrap">${f.is_self ? 'платит сам' : f.students.map((s) => s.name.split(' ')[0]).join(', ')} · ${f.months.map(monthName).join(', ')}</div>
          <div class="row-sub">${f.last_payment ? `последняя оплата ${fmtDate(f.last_payment)}` : 'оплат не было'}${f.last_reminder ? ` · напоминали ${fmtDayShort(f.last_reminder)}` : ''}</div>
        </div>
        <div class="row-end"><span class="money red" style="font-size:18px">${rub(f.debt)}</span>
          <span class="badge ${f.months_count >= 2 ? 'red' : 'amber'}">${f.months_count} ${plural(f.months_count, 'месяц', 'месяца', 'месяцев')}</span></div>
      </div>
      <div class="actions stretch" style="padding:0 16px 14px">
        <button class="btn soft" data-action="remind" data-id="${f.id}">${icon('message', 'sm')} Напоминание</button>
        <a class="btn" href="#/pay/${f.id}">${icon('coins', 'sm')} Принять оплату</a>
      </div>
    </div>`)}</div>` : html`<div class="card empty">${icon('check')}<p>Должников нет. Альхамдулиллях!</p></div>`}`);
  onActions(el, { remind: (b) => openReminder(Number(b.dataset.id)) });
}

export async function payments({ el, query, me }) {
  const month = query.month || currentMonthStr();
  setTop({ title: 'Оплаты' });
  const d = await api(`/api/payments?month=${month}`);
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Оплаты</h1><p>Что пришло в кассу за месяц</p></div>${monthSwitch(month)}</div>
    ${tabs('payments')}
    <div class="tiles">
      <div class="card tile accent"><span class="tile-label">Всего</span><span class="tile-value">${rub(d.total)}</span><span class="tile-note">${d.list.filter((p) => !p.canceled).length} оплат</span></div>
      <div class="card tile"><span class="tile-label">Наличные</span><span class="tile-value">${rub(d.by_method.cash)}</span></div>
      <div class="card tile"><span class="tile-label">Переводы</span><span class="tile-value">${rub(d.by_method.transfer)}</span></div>
    </div>
    <div class="card">${d.list.length ? html`<div class="list">${d.list.map((p) => html`<div class="row">
      <div class="row-main">
        <div class="row-title ${p.canceled ? 'strike' : ''}">${p.student_name}</div>
        <div class="row-sub">${fmtDate(p.paid_at)} · за ${monthLabel(p.month)} · ${METHODS[p.method].toLowerCase()} · ${p.user_name || ''}</div>
        ${p.canceled ? html`<div class="row-sub" style="color:var(--danger)">Отменена: ${p.cancel_reason}</div>` : ''}
      </div>
      <div class="row-end"><span class="money ${p.canceled ? 'strike' : ''}">${rub(p.amount)}</span>
        ${!p.canceled && me.can['money.edit'] ? html`<button class="btn sm ghost" data-action="cancel" data-id="${p.id}" data-label="${p.student_name}, ${rub(p.amount)}">Отменить</button>` : ''}</div>
    </div>`)}</div>` : html`<div class="empty">В этом месяце оплат нет</div>`}</div>`);

  onActions(el, {
    month: (b) => go(`/money/payments?month=${b.dataset.month}`),
    cancel: async (b) => {
      const reason = await confirmSheet({ title: 'Отменить оплату?', text: `${b.dataset.label}. Запись не удалится — останется в истории с пометкой «отменена».`, submit: 'Отменить оплату', danger: true, reason: 'Причина отмены' });
      if (!reason) return;
      await api(`/api/payments/${b.dataset.id}/cancel`, { method: 'POST', body: { reason } });
      toast('Оплата отменена');
      refresh();
    },
  });
}

export async function pickFamily({ el }) {
  setTop({ title: 'Принять оплату', back: '/money' });
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Принять оплату</h1><p>Найдите семью или ученика</p></div></div>
    <label class="search">${icon('search')}<input class="input" id="q" placeholder="Имя ученика, родителя или телефон" autofocus autocomplete="off"></label>
    <div class="card" id="res"></div>`);
  const res = el.querySelector('#res');
  const load = async (q) => {
    const rows = await api(`/api/families${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    res.innerHTML = String(html`<div class="list">${rows.slice(0, 40).map((f) => html`<a class="row" href="#/pay/${f.id}">
      <div class="row-main"><div class="row-title">${f.name}</div><div class="row-sub">${f.is_self ? 'платит сам' : f.children.map((c) => c.name.split(' ')[0]).join(', ')}${f.phone ? ` · ${f.phone}` : ''}</div></div>
      ${f.debt ? html`<span class="money red small">${rub(f.debt)}</span>` : ''}${icon('chevron', 'chev')}</a>`)}</div>`);
  };
  await load('');
  let t;
  el.querySelector('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => load(e.target.value.trim()), 200); });
}

// ---------- Приём оплаты за семью: скидка второму ребёнку уже в цене ----------
export async function pay({ el, params }) {
  const d = await api(`/api/families/${params.id}/billing`);
  const f = d.family;
  setTop({ title: 'Принять оплату', back: `/families/${f.id}` });
  const payable = d.children.filter((c) => c.months.length || c.individual);

  el.innerHTML = String(html`
    <div class="page-head"><div><h1 style="font-size:21px">${f.name}</h1><p>${f.is_self ? 'Взрослый ученик, платит сам' : `Семья · ${d.children.length} ${plural(d.children.length, 'ребёнок', 'ребёнка', 'детей')}`}</p></div></div>
    <form id="pay" class="page" novalidate>
      ${payable.length ? payable.map((c) => html`<div class="card" data-child="${c.id}">
        <div class="card-head"><div><h3>${c.name}</h3>
          <div class="small muted">${c.group_name || ''} · ${c.is_free ? 'учится бесплатно (садака)'
            : c.individual ? `${rub(c.individual)} за урок`
              : c.price ? html`<b>${rub(c.price.amount)}</b> в месяц${c.price.discount_pct ? html` <span class="badge green">скидка ${c.price.discount_pct}% — не первый ребёнок в семье</span>` : ''}` : ''}</div></div></div>
        <div class="card-pad" style="padding-top:0;display:grid;gap:12px">
          ${c.months.length ? html`<div class="month-chips">${c.months.map((m) => html`<label class="month-chip">
            <input type="checkbox" data-month="${m.month}" data-left="${m.left}" ${!m.future ? raw('checked') : ''}>
            <span class="${m.overdue ? 'overdue' : ''}"><b>${monthName(m.month)}${m.month.slice(0, 4) !== todayStr().slice(0, 4) ? ` ${m.month.slice(0, 4)}` : ''}</b>
              <small>${m.overdue ? `долг ${rub(m.left)}` : m.future ? `вперёд ${rub(m.left)}` : m.paid ? `осталось ${rub(m.left)}` : rub(m.left)}</small></span></label>`)}</div>`
          : html`<p class="muted small">Долгов нет.</p>`}
          <label class="field"><span>Сумма к оплате</span>
            <input class="input" type="number" inputmode="numeric" min="0" step="100" data-amount="${c.id}"><span class="hint" data-hint="${c.id}"></span></label>
        </div>
      </div>`) : html`<div class="card empty">Нет начислений к оплате</div>`}

      <div class="card card-pad form-grid">
        <div class="field"><span>Способ оплаты</span>${seg('method', METHODS, 'cash')}</div>
        <div class="form-grid two">
          <label class="field"><span>Дата оплаты</span><input class="input" type="date" name="paid_at" value="${todayStr()}" max="${todayStr()}"></label>
          <label class="field"><span>Комментарий</span><input class="input" name="note" placeholder="необязательно"></label>
        </div>
        <div class="pay-total"><span>Итого</span><strong id="total">0 ₽</strong></div>
        <div class="form-error" role="alert"></div>
        <button class="btn primary block" type="submit" id="submit">${icon('check', 'sm')} Принять оплату</button>
      </div>
    </form>`);

  const form = el.querySelector('#pay');
  const recalc = (childId) => {
    const card = form.querySelector(`[data-child="${childId}"]`);
    const sum = [...card.querySelectorAll('[data-month]:checked')].reduce((a, i) => a + Number(i.dataset.left), 0);
    card.querySelector('[data-amount]').value = sum || '';
    updateTotal();
  };
  const updateTotal = () => {
    let total = 0;
    form.querySelectorAll('[data-amount]').forEach((i) => {
      total += Number(i.value) || 0;
      const card = i.closest('[data-child]');
      const sel = [...card.querySelectorAll('[data-month]:checked')].reduce((a, x) => a + Number(x.dataset.left), 0);
      const hint = card.querySelector('[data-hint]');
      const v = Number(i.value) || 0;
      hint.textContent = sel && v && v < sel ? `Частичная оплата: останется ${rub(sel - v)}` : sel && v > sel ? `Переплата ${rub(v - sel)} уйдёт в счёт последнего выбранного месяца` : '';
    });
    form.querySelector('#total').textContent = rub(total);
    form.querySelector('#submit').innerHTML = String(html`${icon('check', 'sm')} Принять ${rub(total)}`);
  };
  payable.forEach((c) => recalc(c.id));
  form.addEventListener('change', (e) => { if (e.target.dataset.month) recalc(e.target.closest('[data-child]').dataset.child); });
  form.addEventListener('input', (e) => { if (e.target.dataset.amount) updateTotal(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('.form-error');
    err.classList.remove('show');
    // Распределяем сумму по выбранным месяцам, начиная со старого долга.
    const items = [];
    for (const c of payable) {
      const card = form.querySelector(`[data-child="${c.id}"]`);
      let amount = Number(card.querySelector('[data-amount]').value) || 0;
      if (amount <= 0) continue;
      const months = [...card.querySelectorAll('[data-month]:checked')].map((i) => ({ month: i.dataset.month, left: Number(i.dataset.left) }));
      if (!months.length) months.push({ month: currentMonthStr(), left: amount });
      months.forEach((m, idx) => {
        if (amount <= 0) return;
        const part = idx === months.length - 1 ? amount : Math.min(amount, m.left);
        items.push({ student_id: c.id, month: m.month, amount: part });
        amount -= part;
      });
    }
    const fd = new FormData(form);
    try {
      const res = await api('/api/payments', { method: 'POST', body: { family_id: f.id, method: fd.get('method'), paid_at: fd.get('paid_at'), note: fd.get('note'), items } });
      toast(`Оплата ${rub(res.total)} принята`);
      go(`/families/${f.id}`);
    } catch (ex) { err.textContent = ex.message; err.classList.add('show'); }
  });
}
