import { all, get } from '../db.js';
import { today, currentMonth, addMonths, weekStart, weekday } from '../util.js';
import { can, teacherScope } from '../auth.js';
import { totalDebt, incomeByMonth, freeStats, salaryForMonth } from '../billing.js';
import { absenceAlerts } from '../alerts.js';

export default function (r) {
  r.get('/api/dashboard', (ctx) => {
    const user = ctx.user;
    const tid = teacherScope(user);
    const td = today();
    const month = currentMonth();
    const wd = weekday(td);

    const groupsToday = all(`SELECT g.id, g.name, g.schedule, g.format, t.name AS teacher_name,
                             (SELECT COUNT(*) FROM students s WHERE s.group_id = g.id AND s.status = 'active') AS students,
                             (SELECT COUNT(*) FROM lessons l WHERE l.group_id = g.id AND l.date = ?) AS marked
                             FROM groups g LEFT JOIN teachers t ON t.id = g.teacher_id
                             WHERE g.archived = 0 AND (? IS NULL OR g.teacher_id = ?)`, td, tid, tid)
      .map((g) => ({ ...g, time: JSON.parse(g.schedule).find((s) => s.d === wd)?.t, schedule: undefined }))
      .filter((g) => g.time)
      .sort((a, b) => a.time.localeCompare(b.time));

    const juzWeek = all(`SELECT c.juz, c.date, s.id AS student_id, s.name, s.gender, g.name AS group_name, t.name AS teacher_name
                         FROM juz_completions c JOIN students s ON s.id = c.student_id LEFT JOIN groups g ON g.id = s.group_id
                         LEFT JOIN teachers t ON t.id = c.teacher_id
                         WHERE c.date >= ? AND (? IS NULL OR g.teacher_id = ?) ORDER BY c.date DESC`, weekStart(td), tid, tid);

    const base = { role: user.role, name: user.name, today: td, groups_today: groupsToday, alerts: absenceAlerts(tid), juz_week: juzWeek };

    if (user.role === 'teacher') {
      base.students = get(`SELECT COUNT(*) AS n FROM students s JOIN groups g ON g.id = s.group_id WHERE s.status = 'active' AND g.teacher_id = ?`, tid).n;
      base.groups = get('SELECT COUNT(*) AS n FROM groups WHERE teacher_id = ? AND archived = 0', tid).n;
      return base;
    }

    base.students = {
      active: get("SELECT COUNT(*) AS n FROM students WHERE status = 'active'").n,
      new_month: get("SELECT COUNT(*) AS n FROM students WHERE status IN ('active','paused') AND substr(start_date, 1, 7) = ?", month).n,
      waiting: get("SELECT COUNT(*) AS n FROM students WHERE status = 'waiting'").n,
      paused: get("SELECT COUNT(*) AS n FROM students WHERE status = 'paused'").n,
    };
    base.new_leads = can(user, 'leads')
      ? all(`SELECT id, name, age, interest, source, phone, created_at FROM leads WHERE status = 'new' ORDER BY created_at`)
      : [];
    if (can(user, 'money.view')) {
      const months = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5));
      const chart = incomeByMonth(months);
      base.money = {
        income_month: chart[chart.length - 1].amount,
        ...totalDebt(),
        free: freeStats(month),
        chart,
      };
    }
    if (can(user, 'finance.view')) {
      const salaries = salaryForMonth(month).reduce((a, t) => a + t.amount, 0);
      base.money.salaries = salaries;
      base.money.profit = base.money.income_month - salaries;
    }
    return base;
  });
}
