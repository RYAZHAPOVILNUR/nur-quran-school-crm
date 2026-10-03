import { all, get, run, settingNum, tx } from './db.js';
import { currentMonth, today, monthOf } from './util.js';

export function prices() {
  return {
    group: settingNum('price_group', 4000),
    individual: settingNum('price_individual', 1200),
    discount: settingNum('sibling_discount', 10),
    dueDay: settingNum('due_day', 10),
    lateJoinDay: settingNum('late_join_day', 20),
  };
}

// Первый месяц, за который берётся абонемент: месяц начала, если пришёл до 20-го числа, иначе следующий.
function firstBillableMonth(startDate, lateJoinDay) {
  const day = Number(startDate.slice(8, 10));
  const m = monthOf(startDate);
  if (day <= lateJoinDay) return m;
  const [y, mm] = m.split('-').map(Number);
  return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`;
}

// Цена абонемента для каждого активного ученика группового занятия.
// Скидка: второй и следующие платящие дети одной семьи (по дате начала). Бесплатные (садака) в очередь не входят.
export function subscriptionPricing(familyId = null) {
  const p = prices();
  const rows = all(`
    SELECT s.id, s.family_id, s.is_free, s.start_date, f.is_self
    FROM students s
    JOIN groups g ON g.id = s.group_id
    JOIN families f ON f.id = s.family_id
    WHERE s.status = 'active' AND g.direction != 'individual' AND (? IS NULL OR s.family_id = ?)
    ORDER BY s.family_id, s.start_date, s.id`, familyId, familyId);
  const result = new Map();
  const paidIndex = new Map();
  for (const r of rows) {
    if (r.is_free) {
      result.set(r.id, { base: p.group, discount_pct: 0, amount: p.group, waived: 1 });
      continue;
    }
    const idx = paidIndex.get(r.family_id) || 0;
    paidIndex.set(r.family_id, idx + 1);
    const discount = idx >= 1 && !r.is_self ? p.discount : 0;
    const amount = Math.round(p.group * (100 - discount) / 100);
    result.set(r.id, { base: p.group, discount_pct: discount, amount, waived: 0 });
  }
  return result;
}

export function monthOffFor(month, groupId) {
  return get(`SELECT id, reason FROM months_off WHERE canceled = 0 AND month = ? AND (group_id IS NULL OR group_id = ?)
              ORDER BY group_id IS NOT NULL LIMIT 1`, month, groupId);
}

// Начисляет абонементы за месяц всем, кому положено. Повторный вызов безопасен.
export function syncCharges(month = currentMonth()) {
  const p = prices();
  const pricing = subscriptionPricing();
  const students = all(`
    SELECT s.id, s.family_id, s.group_id, s.start_date FROM students s
    JOIN groups g ON g.id = s.group_id
    WHERE s.status = 'active' AND g.direction != 'individual'`);
  tx(() => {
    for (const s of students) {
      if (firstBillableMonth(s.start_date, p.lateJoinDay) > month) continue;
      if (monthOffFor(month, s.group_id)) continue;
      const pr = pricing.get(s.id);
      if (!pr) continue;
      run(`INSERT OR IGNORE INTO charges (student_id, family_id, month, kind, base_amount, discount_pct, amount, waived)
           VALUES (?, ?, ?, 'subscription', ?, ?, ?, ?)`,
        s.id, s.family_id, month, pr.base, pr.discount_pct, pr.amount, pr.waived);
    }
  });
}

// Пересчёт скидок семьи за текущий месяц после изменений состава (новый ребёнок, уход, садака).
export function repriceFamily(familyId, month = currentMonth()) {
  const pricing = subscriptionPricing(familyId);
  tx(() => {
    for (const [sid, pr] of pricing) {
      run(`UPDATE charges SET base_amount = ?, discount_pct = ?, amount = ?, waived = ?
           WHERE student_id = ? AND month = ? AND kind = 'subscription' AND canceled = 0`,
        pr.base, pr.discount_pct, pr.amount, pr.waived, sid, month);
    }
  });
  syncCharges(month);
}

// Индивидуальное занятие оплачивается за каждый проведённый урок (был / опоздал).
export function syncLessonCharge(lessonId, studentId, status, month) {
  const st = get('SELECT family_id, is_free FROM students WHERE id = ?', studentId);
  const attended = status === 'present' || status === 'late';
  const existing = get("SELECT id, canceled FROM charges WHERE kind = 'lesson' AND lesson_id = ? AND student_id = ?", lessonId, studentId);
  if (attended) {
    if (existing) {
      if (existing.canceled) run("UPDATE charges SET canceled = 0, cancel_reason = NULL WHERE id = ?", existing.id);
    } else {
      const price = prices().individual;
      run(`INSERT INTO charges (student_id, family_id, month, kind, lesson_id, base_amount, amount, waived)
           VALUES (?, ?, ?, 'lesson', ?, ?, ?, ?)`, studentId, st.family_id, month, lessonId, price, price, st.is_free ? 1 : 0);
    }
  } else if (existing && !existing.canceled) {
    run("UPDATE charges SET canceled = 1, cancel_reason = 'Урок не состоялся' WHERE id = ?", existing.id);
  }
}

// Остатки по каждому ученику и месяцу: начислено и оплачено.
export function monthBalances({ familyId = null, studentId = null } = {}) {
  return all(`
    SELECT student_id, MAX(family_id) AS family_id, month, SUM(due) AS due, SUM(paid) AS paid FROM (
      SELECT student_id, family_id, month, amount AS due, 0 AS paid FROM charges
        WHERE canceled = 0 AND waived = 0 AND (? IS NULL OR family_id = ?) AND (? IS NULL OR student_id = ?)
      UNION ALL
      SELECT student_id, family_id, month, 0, amount FROM payments
        WHERE canceled = 0 AND (? IS NULL OR family_id = ?) AND (? IS NULL OR student_id = ?)
    ) GROUP BY student_id, month ORDER BY month`,
  familyId, familyId, studentId, studentId, familyId, familyId, studentId, studentId);
}

// Месяц считается просроченным, если он уже прошёл или в текущем месяце наступил день оплаты.
export function isOverdue(month) {
  const cur = currentMonth();
  if (month < cur) return true;
  if (month > cur) return false;
  return Number(today().slice(8, 10)) > prices().dueDay;
}

export function debtByStudent(opts = {}) {
  const map = new Map();
  for (const r of monthBalances(opts)) {
    const left = r.due - r.paid;
    const entry = map.get(r.student_id) || { student_id: r.student_id, family_id: r.family_id, debt: 0, months: [], upcoming: 0, credit: 0 };
    if (left > 0 && isOverdue(r.month)) {
      entry.debt += left;
      entry.months.push({ month: r.month, left, due: r.due, paid: r.paid });
    } else if (left > 0) {
      entry.upcoming += left;
    } else if (left < 0) {
      entry.credit += -left;
    }
    map.set(r.student_id, entry);
  }
  return map;
}

export function debtors() {
  const byStudent = debtByStudent();
  const families = new Map();
  for (const d of byStudent.values()) {
    if (d.debt <= 0) continue;
    const f = families.get(d.family_id) || { family_id: d.family_id, debt: 0, months: new Set(), students: [] };
    f.debt += d.debt;
    d.months.forEach((m) => f.months.add(m.month));
    f.students.push(d);
    families.set(d.family_id, f);
  }
  const list = [];
  for (const f of families.values()) {
    const fam = get('SELECT id, name, phone, telegram, whatsapp, is_self FROM families WHERE id = ?', f.family_id);
    const names = new Map(all('SELECT id, name, status FROM students WHERE family_id = ?', f.family_id).map((s) => [s.id, s]));
    const lastPay = get('SELECT MAX(paid_at) AS d FROM payments WHERE family_id = ? AND canceled = 0', f.family_id).d;
    const lastReminder = get('SELECT MAX(created_at) AS d FROM reminders WHERE family_id = ?', f.family_id).d;
    list.push({
      ...fam,
      debt: f.debt,
      months_count: f.months.size,
      months: [...f.months].sort(),
      students: f.students.map((s) => ({
        id: s.student_id, name: names.get(s.student_id)?.name, status: names.get(s.student_id)?.status,
        debt: s.debt, months: s.months,
      })),
      last_payment: lastPay,
      last_reminder: lastReminder,
    });
  }
  return list.sort((a, b) => b.debt - a.debt);
}

export function totalDebt() {
  let debt = 0, upcoming = 0;
  const families = new Set();
  for (const d of debtByStudent().values()) {
    debt += d.debt;
    upcoming += d.upcoming;
    if (d.debt > 0) families.add(d.family_id);
  }
  return { debt, upcoming, families: families.size };
}

export function incomeByMonth(months) {
  const rows = all(`SELECT substr(paid_at, 1, 7) AS month, SUM(amount) AS amount FROM payments
                    WHERE canceled = 0 GROUP BY month`);
  const map = new Map(rows.map((r) => [r.month, r.amount]));
  return months.map((m) => ({ month: m, amount: map.get(m) || 0 }));
}

export function freeStats(month = currentMonth()) {
  const students = all(`SELECT s.id, s.name, s.free_reason FROM students s WHERE s.is_free = 1 AND s.status = 'active' ORDER BY s.name`);
  const sum = get(`SELECT COALESCE(SUM(amount), 0) AS s FROM charges WHERE waived = 1 AND canceled = 0 AND month = ?`, month).s;
  return { count: students.length, sum, students };
}

export function salaryForMonth(month) {
  const teachers = all('SELECT id, name, gender, rate, active FROM teachers ORDER BY id');
  return teachers.map((t) => {
    const group = get(`SELECT COUNT(*) AS n FROM lessons l JOIN groups g ON g.id = l.group_id
                       WHERE l.teacher_id = ? AND substr(l.date, 1, 7) = ? AND g.direction != 'individual'`, t.id, month).n;
    const individual = get(`SELECT COUNT(*) AS n FROM attendance a JOIN lessons l ON l.id = a.lesson_id JOIN groups g ON g.id = l.group_id
                            WHERE l.teacher_id = ? AND substr(l.date, 1, 7) = ? AND g.direction = 'individual'
                            AND a.status IN ('present','late')`, t.id, month).n;
    const paid = get('SELECT COALESCE(SUM(amount), 0) AS s, MAX(paid_at) AS d FROM salary_payouts WHERE teacher_id = ? AND month = ? AND canceled = 0', t.id, month);
    const lessons = group + individual;
    return { ...t, group_lessons: group, individual_lessons: individual, lessons, amount: lessons * t.rate, paid: paid.s, paid_at: paid.d };
  });
}
