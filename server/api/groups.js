import { all, get, run, tx, audit } from '../db.js';
import { fail, str, int, today, isDate, oneOf, monthOf, weekday, currentMonth } from '../util.js';
import { need, teacherScope, assertGroupAccess } from '../auth.js';
import { seatsTaken } from '../students.js';
import { syncLessonCharge, monthOffFor } from '../billing.js';
import { absenceAlerts, ABSENCE_LIMIT } from '../alerts.js';
import { DIRECTIONS, FORMATS } from '../../shared/labels.js';

function parseSchedule(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((x) => ({ d: int(x.d), t: /^\d{2}:\d{2}$/.test(x.t) ? x.t : null }))
    .filter((x) => x.d >= 1 && x.d <= 7 && x.t)
    .sort((a, b) => a.d - b.d || a.t.localeCompare(b.t));
}

function groupRow(g) {
  const seats = seatsTaken(g.id);
  return {
    ...g,
    schedule: JSON.parse(g.schedule || '[]'),
    seats,
    free: Math.max(0, g.capacity - seats),
    waiting: get("SELECT COUNT(*) AS n FROM waitlist WHERE group_id = ? AND status = 'waiting'", g.id).n,
    paused_month: monthOffFor(currentMonth(), g.id) || null,
  };
}

const GROUP_SQL = `SELECT g.*, t.name AS teacher_name, t.gender AS teacher_gender FROM groups g LEFT JOIN teachers t ON t.id = g.teacher_id`;

export default function (r) {
  r.get('/api/groups', (ctx) => {
    need(ctx.user, 'groups.view');
    const tid = teacherScope(ctx.user);
    const rows = all(`${GROUP_SQL} WHERE g.archived = 0 AND (? IS NULL OR g.teacher_id = ?) ORDER BY g.direction = 'individual', g.gender, g.name`, tid, tid);
    const td = today();
    return rows.map((g) => {
      const row = groupRow(g);
      row.today = row.schedule.find((s) => s.d === weekday(td))?.t || null;
      row.marked_today = !!get('SELECT id FROM lessons WHERE group_id = ? AND date = ?', g.id, td);
      return row;
    });
  });

  r.get('/api/groups/:id', (ctx) => {
    need(ctx.user, 'groups.view');
    const id = Number(ctx.params.id);
    assertGroupAccess(ctx.user, id);
    const g = groupRow(get(`${GROUP_SQL} WHERE g.id = ?`, id));
    return {
      group: g,
      students: all(`SELECT s.id, s.name, s.gender, s.birth_year, s.status, s.status_reason, ${ctx.user.role === 'teacher' ? '0 AS is_free' : 's.is_free'} FROM students s
                     WHERE s.group_id = ? AND s.status IN ('active','paused') ORDER BY s.status, s.name`, id),
      waitlist: ctx.user.role === 'teacher' ? [] : all(`
        SELECT w.id, w.created_at, s.id AS student_id, s.name, s.birth_year, s.status, f.phone, f.name AS family_name
        FROM waitlist w JOIN students s ON s.id = w.student_id JOIN families f ON f.id = s.family_id
        WHERE w.group_id = ? AND w.status = 'waiting' ORDER BY w.created_at`, id),
      lessons: all(`
        SELECT l.id, l.date, t.name AS teacher_name,
               SUM(a.status IN ('present','late')) AS came, COUNT(a.id) AS total
        FROM lessons l LEFT JOIN attendance a ON a.lesson_id = l.id LEFT JOIN teachers t ON t.id = l.teacher_id
        WHERE l.group_id = ? GROUP BY l.id ORDER BY l.date DESC LIMIT 12`, id),
      months_off: all('SELECT * FROM months_off WHERE group_id = ? AND canceled = 0 ORDER BY month DESC', id),
    };
  });

  const saveGroup = (ctx, id) => {
    need(ctx.user, 'groups.edit');
    const b = ctx.body;
    const name = str(b.name, 100) || fail(400, 'Укажите название группы');
    const direction = oneOf(b.direction, DIRECTIONS, 'Направление');
    const gender = b.gender === 'm' || b.gender === 'f' ? b.gender : fail(400, 'Укажите, для кого группа');
    const format = oneOf(b.format, FORMATS, 'Формат');
    const capacity = int(b.capacity);
    if (!capacity || capacity < 1 || capacity > 60) fail(400, 'Лимит мест — от 1 до 60');
    const teacherId = int(b.teacher_id);
    const teacher = teacherId ? get('SELECT * FROM teachers WHERE id = ? AND active = 1', teacherId) : null;
    if (!teacher) fail(400, 'Выберите учителя');
    if (teacher.gender !== gender) {
      fail(400, gender === 'm' ? 'Группы мальчиков и мужчин ведут учителя-мужчины' : 'Группы девочек и женщин ведёт учительница');
    }
    const schedule = JSON.stringify(parseSchedule(b.schedule));
    const duration = int(b.duration) || 60;
    if (id) {
      const old = get('SELECT * FROM groups WHERE id = ?', id) || fail(404, 'Группа не найдена');
      if (old.gender !== gender && seatsTaken(id) > 0) fail(400, 'Нельзя сменить пол группы, пока в ней есть ученики');
      run('UPDATE groups SET name = ?, direction = ?, gender = ?, teacher_id = ?, format = ?, capacity = ?, schedule = ?, duration = ? WHERE id = ?',
        name, direction, gender, teacherId, format, capacity, schedule, duration, id);
      audit(ctx.user, 'group.update', 'group', id, { teacher_from: old.teacher_id, teacher_to: teacherId });
      return { id };
    }
    const newId = Number(run('INSERT INTO groups (name, direction, gender, teacher_id, format, capacity, schedule, duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      name, direction, gender, teacherId, format, capacity, schedule, duration).lastInsertRowid);
    audit(ctx.user, 'group.create', 'group', newId, { name });
    return { id: newId };
  };
  r.post('/api/groups', (ctx) => saveGroup(ctx, null));
  r.put('/api/groups/:id', (ctx) => saveGroup(ctx, Number(ctx.params.id)));

  r.post('/api/groups/:id/archive', (ctx) => {
    need(ctx.user, 'groups.edit');
    const id = Number(ctx.params.id);
    if (seatsTaken(id) > 0) fail(400, 'Сначала переведите учеников в другие группы');
    run('UPDATE groups SET archived = 1 WHERE id = ?', id);
    audit(ctx.user, 'group.archive', 'group', id);
    return { ok: true };
  });

  r.get('/api/schedule', (ctx) => {
    need(ctx.user, 'groups.view');
    const tid = teacherScope(ctx.user);
    return all(`${GROUP_SQL} WHERE g.archived = 0 AND (? IS NULL OR g.teacher_id = ?)`, tid, tid).map(groupRow);
  });

  r.get('/api/groups/:id/attendance', (ctx) => {
    need(ctx.user, 'attendance.edit');
    const id = Number(ctx.params.id);
    assertGroupAccess(ctx.user, id);
    const date = isDate(ctx.query.date) ? ctx.query.date : today();
    const g = groupRow(get(`${GROUP_SQL} WHERE g.id = ?`, id));
    const lesson = get('SELECT l.*, t.name AS teacher_name FROM lessons l LEFT JOIN teachers t ON t.id = l.teacher_id WHERE l.group_id = ? AND l.date = ?', id, date);
    const marks = new Map(lesson ? all('SELECT student_id, status FROM attendance WHERE lesson_id = ?', lesson.id).map((a) => [a.student_id, a.status]) : []);
    const students = all(`SELECT id, name, gender, status FROM students WHERE group_id = ? AND status = 'active' AND start_date <= ? ORDER BY name`, id, date);
    // Ученики, которые были отмечены в этот день, но позже ушли из группы, остаются в истории.
    for (const sid of marks.keys()) {
      if (!students.find((s) => s.id === sid)) students.push(get('SELECT id, name, gender, status FROM students WHERE id = ?', sid));
    }
    const streaks = new Map(absenceAlerts().map((a) => [a.id, a.streak]));
    return {
      group: g,
      date,
      scheduled: g.schedule.some((s) => s.d === weekday(date)),
      lesson: lesson || null,
      students: students.map((s) => ({ ...s, mark: marks.get(s.id) || null, streak: streaks.get(s.id) || 0 })),
      teachers: ctx.user.role === 'teacher' ? [] : all('SELECT id, name FROM teachers WHERE active = 1 AND gender = ? ORDER BY name', g.gender),
    };
  });

  r.post('/api/groups/:id/attendance', (ctx) => {
    need(ctx.user, 'attendance.edit');
    const id = Number(ctx.params.id);
    const g = get('SELECT * FROM groups WHERE id = ?', id);
    assertGroupAccess(ctx.user, id);
    const date = isDate(ctx.body.date) ? ctx.body.date : today();
    if (date > today()) fail(400, 'Нельзя отметить урок в будущем');
    const marks = Array.isArray(ctx.body.marks) ? ctx.body.marks : [];
    const valid = marks.filter((m) => ['present', 'late', 'excused', 'absent'].includes(m.status) && int(m.student_id));
    if (!valid.length) fail(400, 'Отметьте хотя бы одного ученика');
    const allowed = new Set(all('SELECT id FROM students WHERE group_id = ?', id).map((s) => s.id));
    for (const m of valid) if (!allowed.has(int(m.student_id))) fail(400, 'Ученик не из этой группы');
    // Учитель отмечает урок как проведённый им самим (так считается зарплата, в том числе при замене).
    const teacherId = ctx.user.role === 'teacher' ? ctx.user.teacher_id : (int(ctx.body.teacher_id) || g.teacher_id);

    tx(() => {
      let lesson = get('SELECT id FROM lessons WHERE group_id = ? AND date = ?', id, date);
      if (!lesson) {
        lesson = { id: Number(run('INSERT INTO lessons (group_id, date, teacher_id, created_by) VALUES (?, ?, ?, ?)', id, date, teacherId, ctx.user.id).lastInsertRowid) };
      } else {
        run('UPDATE lessons SET teacher_id = ? WHERE id = ?', teacherId, lesson.id);
      }
      for (const m of valid) {
        run(`INSERT INTO attendance (lesson_id, student_id, status) VALUES (?, ?, ?)
             ON CONFLICT (lesson_id, student_id) DO UPDATE SET status = excluded.status`, lesson.id, int(m.student_id), m.status);
        if (g.direction === 'individual') syncLessonCharge(lesson.id, int(m.student_id), m.status, monthOf(date));
      }
    });
    audit(ctx.user, 'attendance.save', 'group', id, { date, count: valid.length });
    const ids = new Set(valid.map((m) => int(m.student_id)));
    const alerts = absenceAlerts().filter((a) => ids.has(a.id));
    return { ok: true, alerts: alerts.map((a) => ({ id: a.id, name: a.name, streak: a.streak })), limit: ABSENCE_LIMIT };
  });

  r.get('/api/alerts', (ctx) => {
    need(ctx.user, 'students.view');
    return absenceAlerts(teacherScope(ctx.user));
  });
}
