import { all, get, run, tx, audit, setting } from '../db.js';
import { fail, str, int, today, isDate, isMonth, currentMonth, addMonths, oneOf } from '../util.js';
import { need } from '../auth.js';
import {
  debtors, totalDebt, monthBalances, subscriptionPricing, prices, isOverdue, incomeByMonth, freeStats,
  salaryForMonth, syncCharges,
} from '../billing.js';
import { familyChildren } from '../students.js';
import { METHODS, MONTHS, monthLabel, rub } from '../../shared/labels.js';

const monthName = (m) => MONTHS[Number(m.slice(5, 7)) - 1];

function joinRu(list) {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} и ${list[list.length - 1]}`;
}

// Вежливое напоминание для родителя или взрослого ученика. Марьям копирует и отправляет сама.
export function reminderText(familyId, user) {
  const fam = get('SELECT * FROM families WHERE id = ?', familyId) || fail(404, 'Семья не найдена');
  const d = debtors().find((x) => x.id === familyId);
  if (!d) return { text: null, debt: 0, family: fam };
  const firstName = fam.name.split(/\s+/)[0];
  const lines = d.students.map((s) => {
    const months = joinRu(s.months.map((m) => monthName(m.month)));
    return fam.is_self ? `• ${months}: ${rub(s.debt)}` : `• ${s.name.split(/\s+/)[0]} — ${months}: ${rub(s.debt)}`;
  });
  const school = setting('school_name', 'Школа Корана «Нур»');
  const thanks = fam.is_self
    ? 'Пусть Аллах вознаградит вас благом за стремление к знанию Корана.'
    : `Пусть Аллах вознаградит вас благом за то, что вы даёте ${d.students.length > 1 ? 'детям' : 'ребёнку'} знание Корана.`;
  const signature = user.role === 'admin' ? `${user.name}, администратор` : `${user.name}, ${school}`;
  const text = [
    `Ассаляму алейкум, ${firstName}!`,
    '',
    `Это ${school.replace(/^Школа/, 'школа')}. ${thanks}`,
    '',
    'Мягко напоминаем об оплате обучения:',
    ...lines,
    d.students.length > 1 ? `Итого: ${rub(d.debt)}` : null,
    '',
    'Оплатить можно наличными в школе или переводом. Если вы уже оплатили — пожалуйста, напишите нам, мы проверим и извинимся за беспокойство.',
    '',
    'БаракаЛлаху фикум!',
    signature,
  ].filter((l) => l !== null).join('\n');
  return { text, debt: d.debt, months_count: d.months_count, family: fam };
}

export default function (r) {
  r.get('/api/money/debtors', (ctx) => {
    need(ctx.user, 'money.view');
    const list = debtors();
    return { list, total: totalDebt(), due_day: prices().dueDay };
  });

  r.get('/api/families/:id/billing', (ctx) => {
    need(ctx.user, 'money.edit');
    const id = Number(ctx.params.id);
    const fam = get('SELECT * FROM families WHERE id = ?', id) || fail(404, 'Семья не найдена');
    const p = prices();
    const pricing = subscriptionPricing(id);
    const cur = currentMonth();
    const balances = monthBalances({ familyId: id });
    const children = familyChildren(id).filter((c) => c.status !== 'finished' && c.status !== 'left' || balances.some((b) => b.student_id === c.id && b.due > b.paid));
    return {
      family: fam,
      prices: p,
      children: children.map((c) => {
        const price = pricing.get(c.id) || null;
        const own = balances.filter((b) => b.student_id === c.id);
        const months = own.filter((b) => b.due - b.paid > 0)
          .map((b) => ({ month: b.month, due: b.due, paid: b.paid, left: b.due - b.paid, overdue: isOverdue(b.month) }));
        if (c.status === 'active' && price && !price.waived) {
          for (const m of [cur, addMonths(cur, 1)]) {
            const b = own.find((x) => x.month === m);
            if (!b) months.push({ month: m, due: price.amount, paid: 0, left: price.amount, overdue: false, expected: true, future: m > cur });
          }
        }
        months.sort((a, b) => a.month.localeCompare(b.month));
        return { ...c, price, individual: c.direction === 'individual' ? p.individual : null, months };
      }),
    };
  });

  r.post('/api/payments', (ctx) => {
    need(ctx.user, 'money.edit');
    const b = ctx.body;
    const familyId = int(b.family_id) || fail(400, 'Выберите семью');
    const method = oneOf(b.method, METHODS, 'Способ оплаты');
    const paidAt = isDate(b.paid_at) ? b.paid_at : today();
    if (paidAt > today()) fail(400, 'Дата оплаты не может быть в будущем');
    const items = (Array.isArray(b.items) ? b.items : []).map((i) => ({ student_id: int(i.student_id), month: i.month, amount: int(i.amount) }))
      .filter((i) => i.amount > 0);
    if (!items.length) fail(400, 'Укажите сумму оплаты');
    const kids = new Set(all('SELECT id FROM students WHERE family_id = ?', familyId).map((s) => s.id));
    for (const i of items) {
      if (!kids.has(i.student_id)) fail(400, 'Ученик не из этой семьи');
      if (!isMonth(i.month)) fail(400, 'Укажите месяц оплаты');
      if (i.amount > 1_000_000) fail(400, 'Слишком большая сумма');
    }
    const note = str(b.note, 300);
    const ids = tx(() => items.map((i) => Number(run(`INSERT INTO payments (family_id, student_id, month, amount, method, paid_at, note, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, familyId, i.student_id, i.month, i.amount, method, paidAt, note, ctx.user.id).lastInsertRowid)));
    const total = items.reduce((a, i) => a + i.amount, 0);
    audit(ctx.user, 'payment.create', 'family', familyId, { total, method, items });
    return { ok: true, ids, total };
  });

  r.get('/api/payments', (ctx) => {
    need(ctx.user, 'money.view');
    const month = isMonth(ctx.query.month) ? ctx.query.month : currentMonth();
    const list = all(`
      SELECT p.*, s.name AS student_name, f.name AS family_name, u.name AS user_name
      FROM payments p JOIN students s ON s.id = p.student_id JOIN families f ON f.id = p.family_id LEFT JOIN users u ON u.id = p.created_by
      WHERE substr(p.paid_at, 1, 7) = ? ORDER BY p.paid_at DESC, p.id DESC`, month);
    const active = list.filter((p) => !p.canceled);
    return {
      month,
      list,
      total: active.reduce((a, p) => a + p.amount, 0),
      by_method: Object.fromEntries(Object.keys(METHODS).map((m) => [m, active.filter((p) => p.method === m).reduce((a, p) => a + p.amount, 0)])),
    };
  });

  // Ошибочную оплату не удаляем, а отменяем с причиной — история остаётся.
  r.post('/api/payments/:id/cancel', (ctx) => {
    need(ctx.user, 'money.edit');
    const id = Number(ctx.params.id);
    const reason = str(ctx.body.reason, 300) || fail(400, 'Укажите причину отмены');
    const p = get('SELECT * FROM payments WHERE id = ?', id) || fail(404, 'Оплата не найдена');
    if (p.canceled) fail(400, 'Оплата уже отменена');
    run('UPDATE payments SET canceled = 1, cancel_reason = ? WHERE id = ?', reason, id);
    audit(ctx.user, 'payment.cancel', 'payment', id, { reason, amount: p.amount });
    return { ok: true };
  });

  r.get('/api/families/:id/reminder', (ctx) => {
    need(ctx.user, 'money.view');
    return reminderText(Number(ctx.params.id), ctx.user);
  });

  r.post('/api/families/:id/reminder', (ctx) => {
    need(ctx.user, 'money.view');
    const id = Number(ctx.params.id);
    const d = debtors().find((x) => x.id === id);
    run('INSERT INTO reminders (family_id, amount, channel, created_by) VALUES (?, ?, ?, ?)', id, d?.debt || 0, str(ctx.body.channel, 20), ctx.user.id);
    return { ok: true };
  });

  r.get('/api/settings', (ctx) => {
    need(ctx.user, 'money.view');
    return { ...prices(), school_name: setting('school_name', 'Школа Корана «Нур»') };
  });

  r.put('/api/settings', (ctx) => {
    need(ctx.user, 'settings.edit');
    const b = ctx.body;
    const checks = {
      price_group: [int(b.group), 0, 100000, 'Цена абонемента'],
      price_individual: [int(b.individual), 0, 100000, 'Цена индивидуального урока'],
      sibling_discount: [int(b.discount), 0, 50, 'Скидка'],
      due_day: [int(b.dueDay), 1, 28, 'День оплаты'],
    };
    tx(() => {
      for (const [key, [v, min, max, label]] of Object.entries(checks)) {
        if (v == null) continue;
        if (v < min || v > max) fail(400, `${label}: от ${min} до ${max}`);
        run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, String(v));
      }
    });
    audit(ctx.user, 'settings.update', 'settings', null, b);
    return prices();
  });

  r.get('/api/months-off', (ctx) => {
    need(ctx.user, 'money.view');
    return all(`SELECT m.*, g.name AS group_name, u.name AS user_name FROM months_off m LEFT JOIN groups g ON g.id = m.group_id
                LEFT JOIN users u ON u.id = m.created_by WHERE m.canceled = 0 ORDER BY m.month DESC`);
  });

  // Каникулы для всей школы или пауза группы: абонемент за этот месяц не начисляется.
  r.post('/api/months-off', (ctx) => {
    need(ctx.user, 'settings.edit');
    const month = isMonth(ctx.body.month) ? ctx.body.month : fail(400, 'Выберите месяц');
    const groupId = int(ctx.body.group_id);
    if (groupId && !get('SELECT id FROM groups WHERE id = ?', groupId)) fail(404, 'Группа не найдена');
    const reason = str(ctx.body.reason, 200) || (groupId ? 'Группа на паузе' : 'Каникулы');
    if (get('SELECT id FROM months_off WHERE month = ? AND canceled = 0 AND (group_id IS NULL OR group_id IS ?)', month, groupId ?? null)) {
      fail(400, `${monthLabel(month)} уже отмечен как месяц без оплаты`);
    }
    const id = tx(() => {
      const newId = Number(run('INSERT INTO months_off (month, group_id, reason, created_by) VALUES (?, ?, ?, ?)', month, groupId, reason, ctx.user.id).lastInsertRowid);
      run(`UPDATE charges SET canceled = 1, cancel_reason = ? WHERE kind = 'subscription' AND month = ? AND canceled = 0
           AND (? IS NULL OR student_id IN (SELECT id FROM students WHERE group_id = ?))`, `month_off:${newId}`, month, groupId, groupId);
      return newId;
    });
    audit(ctx.user, 'month_off.create', 'month_off', id, { month, group_id: groupId, reason });
    return { id };
  });

  r.post('/api/months-off/:id/cancel', (ctx) => {
    need(ctx.user, 'settings.edit');
    const id = Number(ctx.params.id);
    const m = get('SELECT * FROM months_off WHERE id = ?', id) || fail(404, 'Не найдено');
    tx(() => {
      run('UPDATE months_off SET canceled = 1 WHERE id = ?', id);
      run("UPDATE charges SET canceled = 0, cancel_reason = NULL WHERE cancel_reason = ?", `month_off:${id}`);
    });
    if (m.month === currentMonth()) syncCharges(m.month);
    audit(ctx.user, 'month_off.cancel', 'month_off', id);
    return { ok: true };
  });

  r.get('/api/finance', (ctx) => {
    need(ctx.user, 'finance.view');
    const month = isMonth(ctx.query.month) ? ctx.query.month : currentMonth();
    const months = Array.from({ length: 12 }, (_, i) => addMonths(month, i - 11));
    const income = incomeByMonth(months);
    const salaries = months.map((m) => ({ month: m, amount: salaryForMonth(m).reduce((a, t) => a + t.amount, 0) }));
    const pay = all(`SELECT method, SUM(amount) AS s FROM payments WHERE canceled = 0 AND substr(paid_at, 1, 7) = ? GROUP BY method`, month);
    const charged = get(`SELECT COALESCE(SUM(amount), 0) AS s FROM charges WHERE canceled = 0 AND waived = 0 AND month = ?`, month).s;
    const collected = get(`SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE canceled = 0 AND month = ?`, month).s;
    const inc = income[income.length - 1].amount;
    const sal = salaries[salaries.length - 1].amount;
    return {
      month,
      income: inc,
      by_method: Object.fromEntries(pay.map((p) => [p.method, p.s])),
      charged,
      collected,
      debt: totalDebt(),
      free: freeStats(month),
      salaries: sal,
      profit: inc - sal,
      chart: months.map((m, i) => ({ month: m, income: income[i].amount, salaries: salaries[i].amount })),
    };
  });
}
