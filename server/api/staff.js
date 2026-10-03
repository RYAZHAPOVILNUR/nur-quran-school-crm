import { all, get, run, audit } from '../db.js';
import { fail, str, int, today, isMonth, currentMonth } from '../util.js';
import { need, can } from '../auth.js';
import { salaryForMonth } from '../billing.js';
import { backupBuffer } from '../backup.js';

export default function (r) {
  // Ставки видит только владелец; остальным — только имена (для выбора учителя).
  r.get('/api/teachers', (ctx) => {
    need(ctx.user, 'groups.view');
    const full = can(ctx.user, 'salary.view');
    return all(`SELECT t.id, t.name, t.gender, t.phone, ${full ? 't.rate,' : ''} t.active,
                (SELECT COUNT(*) FROM groups g WHERE g.teacher_id = t.id AND g.archived = 0) AS groups
                FROM teachers t ORDER BY t.active DESC, t.id`);
  });

  r.post('/api/teachers', (ctx) => {
    need(ctx.user, 'teachers.edit');
    const b = ctx.body;
    const name = str(b.name, 100) || fail(400, 'Укажите имя');
    const gender = b.gender === 'm' || b.gender === 'f' ? b.gender : fail(400, 'Укажите пол');
    const rate = int(b.rate) ?? 0;
    const id = Number(run('INSERT INTO teachers (name, gender, phone, rate) VALUES (?, ?, ?, ?)', name, gender, str(b.phone, 40), rate).lastInsertRowid);
    audit(ctx.user, 'teacher.create', 'teacher', id, { name });
    return { id };
  });

  r.put('/api/teachers/:id', (ctx) => {
    need(ctx.user, 'teachers.edit');
    const id = Number(ctx.params.id);
    const t = get('SELECT * FROM teachers WHERE id = ?', id) || fail(404, 'Учитель не найден');
    const rate = ctx.body.rate !== undefined ? int(ctx.body.rate) : t.rate;
    if (rate == null || rate < 0 || rate > 100000) fail(400, 'Ставка — от 0 до 100 000 ₽');
    const name = str(ctx.body.name, 100) || t.name;
    const phone = ctx.body.phone !== undefined ? str(ctx.body.phone, 40) : t.phone;
    run('UPDATE teachers SET name = ?, phone = ?, rate = ? WHERE id = ?', name, phone, rate, id);
    audit(ctx.user, 'teacher.update', 'teacher', id, { rate_from: t.rate, rate_to: rate });
    return { ok: true };
  });

  r.get('/api/salary', (ctx) => {
    need(ctx.user, 'salary.view');
    const month = isMonth(ctx.query.month) ? ctx.query.month : currentMonth();
    const list = salaryForMonth(month);
    return { month, list, total: list.reduce((a, t) => a + t.amount, 0), paid: list.reduce((a, t) => a + t.paid, 0) };
  });

  r.post('/api/salary/payout', (ctx) => {
    need(ctx.user, 'salary.view');
    const month = isMonth(ctx.body.month) ? ctx.body.month : fail(400, 'Укажите месяц');
    const teacherId = int(ctx.body.teacher_id) || fail(400, 'Укажите учителя');
    const amount = int(ctx.body.amount);
    if (!amount || amount <= 0) fail(400, 'Укажите сумму');
    run('INSERT INTO salary_payouts (teacher_id, month, amount, paid_at, created_by) VALUES (?, ?, ?, ?, ?)', teacherId, month, amount, today(), ctx.user.id);
    audit(ctx.user, 'salary.payout', 'teacher', teacherId, { month, amount });
    return { ok: true };
  });

  r.get('/api/audit', (ctx) => {
    need(ctx.user, 'settings.edit');
    return all(`SELECT a.*, u.name AS user_name FROM audit a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 50`);
  });

  r.get('/api/backup', (ctx) => {
    need(ctx.user, 'settings.edit');
    audit(ctx.user, 'backup.download');
    return {
      __raw: true,
      buffer: backupBuffer(),
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="nur-backup-${today()}.db"` },
    };
  });
}
