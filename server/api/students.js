import { all, get, run, audit } from '../db.js';
import { fail, str, int, today, isDate, digits, addDays } from '../util.js';
import { need, can, teacherScope, assertStudentAccess } from '../auth.js';
import { createStudent, updateStudent, changeStatus, enroll, updateFamily, familyChildren, findFamilyByPhone } from '../students.js';
import { debtByStudent, monthBalances, subscriptionPricing, prices } from '../billing.js';
import { progress, addRecord, memorizedPages } from '../hifz.js';
import { surahPages } from '../../shared/quran.js';

function searchClause(q) {
  if (!q) return { sql: '', params: [] };
  const text = q.toLowerCase().replaceAll('ё', 'е').trim();
  const d = digits(q);
  if (d.length >= 3) {
    return {
      sql: ' AND (digits(f.phone) LIKE ? OR digits(f.whatsapp) LIKE ? OR ru_lower(s.name) LIKE ?)',
      params: [`%${d}%`, `%${d}%`, `%${text}%`],
    };
  }
  return {
    sql: ' AND (ru_lower(s.name) LIKE ? OR ru_lower(f.name) LIKE ? OR ru_lower(f.telegram) LIKE ?)',
    params: [`%${text}%`, `%${text}%`, `%${text}%`],
  };
}

export default function (r) {
  r.get('/api/students', (ctx) => {
    need(ctx.user, 'students.view');
    const { q, status, group_id: groupId } = ctx.query;
    const tid = teacherScope(ctx.user);
    const s = searchClause(q);
    let where = ' WHERE 1 = 1';
    const params = [];
    if (status && status !== 'all') { where += ' AND s.status = ?'; params.push(status); }
    if (groupId) { where += ' AND s.group_id = ?'; params.push(Number(groupId)); }
    if (tid) { where += " AND g.teacher_id = ? AND s.status IN ('active','paused')"; params.push(tid); }
    const rows = all(`
      SELECT s.id, s.name, s.gender, s.birth_year, s.status, s.status_reason, s.is_free, s.start_date, s.source,
             s.group_id, g.name AS group_name, g.direction, t.name AS teacher_name,
             s.family_id, f.name AS family_name, f.phone, f.is_self
      FROM students s
      LEFT JOIN groups g ON g.id = s.group_id
      LEFT JOIN teachers t ON t.id = g.teacher_id
      JOIN families f ON f.id = s.family_id
      ${where}${s.sql}
      ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'waiting' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END, s.name
      LIMIT 500`, ...params, ...s.params);
    const debts = can(ctx.user, 'money.view') ? debtByStudent() : null;
    for (const row of rows) {
      if (debts) row.debt = debts.get(row.id)?.debt || 0;
      if (row.direction === 'hifz' || row.direction === 'individual') row.hifz_pages = memorizedPages(row.id).size;
      if (tid) { delete row.family_id; delete row.is_free; }
    }
    return rows;
  });

  r.get('/api/students/:id', (ctx) => {
    need(ctx.user, 'students.view');
    const id = Number(ctx.params.id);
    assertStudentAccess(ctx.user, id);
    const s = get(`
      SELECT s.*, g.name AS group_name, g.direction, g.gender AS group_gender, g.teacher_id, g.format, g.schedule,
             t.name AS teacher_name, f.name AS family_name, f.phone, f.telegram, f.whatsapp, f.is_self
      FROM students s LEFT JOIN groups g ON g.id = s.group_id LEFT JOIN teachers t ON t.id = g.teacher_id
      JOIN families f ON f.id = s.family_id WHERE s.id = ?`, id);

    const attendance = all(`
      SELECT l.date, a.status, g.name AS group_name FROM attendance a JOIN lessons l ON l.id = a.lesson_id JOIN groups g ON g.id = l.group_id
      WHERE a.student_id = ? ORDER BY l.date DESC LIMIT 60`, id);
    const att90 = attendance.filter((a) => a.date >= addDays(today(), -90));
    const attended = att90.filter((a) => a.status === 'present' || a.status === 'late').length;

    const hifzRecords = all(`
      SELECT h.*, t.name AS teacher_name FROM hifz_records h LEFT JOIN teachers t ON t.id = h.teacher_id
      WHERE h.student_id = ? ORDER BY h.date DESC, h.id DESC LIMIT 40`, id);

    // Учителю не показываем, кто учится бесплатно и почему: это деликатные сведения о семье.
    if (ctx.user.role === 'teacher') { delete s.is_free; delete s.free_reason; }
    const result = {
      student: s,
      attendance: attendance.slice(0, 30),
      attendance_rate: att90.length ? Math.round((attended / att90.length) * 100) : null,
      hifz: progress(id),
      hifz_records: hifzRecords,
      status_log: all(`SELECT l.*, u.name AS user_name FROM student_status_log l LEFT JOIN users u ON u.id = l.user_id
                       WHERE l.student_id = ? ORDER BY l.id DESC`, id),
      waitlist: all(`SELECT w.*, g.name AS group_name FROM waitlist w JOIN groups g ON g.id = w.group_id
                     WHERE w.student_id = ? AND w.status = 'waiting'`, id),
      contacts: all(`SELECT c.*, u.name AS user_name FROM contact_logs c LEFT JOIN users u ON u.id = c.created_by
                     WHERE c.student_id = ? ORDER BY c.id DESC LIMIT 10`, id),
    };

    if (ctx.user.role !== 'teacher') {
      result.siblings = all(`SELECT s.id, s.name, s.status, g.name AS group_name FROM students s LEFT JOIN groups g ON g.id = s.group_id
                             WHERE s.family_id = ? AND s.id != ?`, s.family_id, id);
    }
    if (can(ctx.user, 'money.view')) {
      const d = debtByStudent({ studentId: id }).get(id) || { debt: 0, months: [], upcoming: 0, credit: 0 };
      const pricing = subscriptionPricing(s.family_id).get(id);
      result.money = {
        debt: d.debt, debt_months: d.months, upcoming: d.upcoming, credit: d.credit,
        price: s.direction === 'individual' ? { per_lesson: prices().individual } : pricing || null,
        balances: monthBalances({ studentId: id }).slice(-12).reverse(),
        payments: all(`SELECT p.*, u.name AS user_name FROM payments p LEFT JOIN users u ON u.id = p.created_by
                       WHERE p.student_id = ? ORDER BY p.paid_at DESC, p.id DESC LIMIT 20`, id),
      };
    }
    return result;
  });

  r.post('/api/students', (ctx) => {
    need(ctx.user, 'students.edit');
    return createStudent(ctx.body, ctx.user);
  });

  r.put('/api/students/:id', (ctx) => {
    need(ctx.user, 'students.edit');
    updateStudent(Number(ctx.params.id), ctx.body, ctx.user);
    return { ok: true };
  });

  r.post('/api/students/:id/status', (ctx) => {
    need(ctx.user, 'students.edit');
    changeStatus(Number(ctx.params.id), ctx.body.status, str(ctx.body.reason, 300), ctx.user);
    return { ok: true };
  });

  r.post('/api/students/:id/group', (ctx) => {
    need(ctx.user, 'groups.enroll');
    const id = Number(ctx.params.id);
    if (!get('SELECT id FROM students WHERE id = ?', id)) fail(404, 'Ученик не найден');
    return enroll(id, int(ctx.body.group_id) || fail(400, 'Выберите группу'), ctx.user);
  });

  r.post('/api/students/:id/hifz', (ctx) => {
    need(ctx.user, 'hifz.edit');
    const id = Number(ctx.params.id);
    const st = assertStudentAccess(ctx.user, id);
    const b = ctx.body;
    const type = b.type === 'review' ? 'review' : 'new';
    let from = int(b.page_from), to = int(b.page_to);
    const surah = int(b.surah);
    if (surah && (!from || !to)) [from, to] = surahPages(surah);
    if (!from || !to || from < 1 || to > 604 || from > 604 || to < 1) fail(400, 'Укажите страницы от 1 до 604');
    if (from > to) [from, to] = [to, from];
    if (to - from > 40) fail(400, 'Слишком большой отрывок за один раз (больше 40 страниц)');
    const grade = ['excellent', 'errors', 'fail'].includes(b.grade) ? b.grade : fail(400, 'Выберите оценку');
    const date = isDate(b.date) && b.date <= today() ? b.date : today();
    const teacherId = ctx.user.teacher_id || get('SELECT teacher_id FROM groups WHERE id = ?', st.group_id)?.teacher_id || null;
    const res = addRecord(id, { type, page_from: from, page_to: to, surah: surah || null, grade, note: str(b.note, 500), next_task: str(b.next_task, 300), date }, ctx.user, teacherId);
    audit(ctx.user, 'hifz.add', 'student', id, { type, from, to, grade });
    return { ...res, progress: progress(id) };
  });

  // Владелец или администратор отмечает, что связались с семьёй пропадающего ученика.
  r.post('/api/students/:id/contact', (ctx) => {
    need(ctx.user, 'alerts.contact');
    const id = Number(ctx.params.id);
    if (!get('SELECT id FROM students WHERE id = ?', id)) fail(404, 'Ученик не найден');
    run('INSERT INTO contact_logs (student_id, note, created_by) VALUES (?, ?, ?)', id, str(ctx.body.note, 500) || 'Связались с семьёй', ctx.user.id);
    return { ok: true };
  });

  r.get('/api/families', (ctx) => {
    need(ctx.user, 'families.view');
    const q = ctx.query.q;
    let rows;
    if (q) {
      const text = `%${q.toLowerCase().replaceAll('ё', 'е')}%`;
      const d = digits(q);
      rows = all(`SELECT DISTINCT f.* FROM families f LEFT JOIN students s ON s.family_id = f.id
                  WHERE ru_lower(f.name) LIKE ? OR ru_lower(s.name) LIKE ? ${d.length >= 3 ? 'OR digits(f.phone) LIKE ? OR digits(f.whatsapp) LIKE ?' : ''}
                  ORDER BY f.name LIMIT 50`, text, text, ...(d.length >= 3 ? [`%${d}%`, `%${d}%`] : []));
    } else {
      rows = all('SELECT * FROM families ORDER BY is_self, name');
    }
    const debts = debtByStudent();
    const famDebt = new Map();
    for (const d of debts.values()) famDebt.set(d.family_id, (famDebt.get(d.family_id) || 0) + d.debt);
    for (const f of rows) {
      f.children = familyChildren(f.id);
      f.debt = famDebt.get(f.id) || 0;
    }
    return rows;
  });

  r.get('/api/families/by-phone', (ctx) => {
    need(ctx.user, 'families.view');
    const f = findFamilyByPhone(ctx.query.phone);
    return { family: f ? { ...f, children: familyChildren(f.id) } : null };
  });

  r.get('/api/families/:id', (ctx) => {
    need(ctx.user, 'families.view');
    const id = Number(ctx.params.id);
    const f = get('SELECT * FROM families WHERE id = ?', id);
    if (!f) fail(404, 'Семья не найдена');
    const debts = debtByStudent({ familyId: id });
    const pricing = subscriptionPricing(id);
    const children = familyChildren(id).map((c) => ({ ...c, debt: debts.get(c.id)?.debt || 0, price: pricing.get(c.id) || null }));
    return {
      family: f,
      children,
      debt: children.reduce((a, c) => a + c.debt, 0),
      payments: all(`SELECT p.*, s.name AS student_name, u.name AS user_name FROM payments p JOIN students s ON s.id = p.student_id
                     LEFT JOIN users u ON u.id = p.created_by WHERE p.family_id = ? ORDER BY p.paid_at DESC, p.id DESC LIMIT 40`, id),
      reminders: all(`SELECT r.*, u.name AS user_name FROM reminders r LEFT JOIN users u ON u.id = r.created_by
                      WHERE r.family_id = ? ORDER BY r.id DESC LIMIT 5`, id),
    };
  });

  r.put('/api/families/:id', (ctx) => {
    need(ctx.user, 'students.edit');
    updateFamily(Number(ctx.params.id), ctx.body, ctx.user);
    return { ok: true };
  });
}
