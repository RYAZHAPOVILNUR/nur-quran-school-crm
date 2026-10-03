import { all, get } from './db.js';

export const ABSENCE_LIMIT = 3;

// Ученики, пропустившие подряд 3 и более занятия без уважительной причины.
export function absenceAlerts(teacherId = null) {
  const rows = all(`
    SELECT a.student_id, a.status, l.date
    FROM attendance a
    JOIN lessons l ON l.id = a.lesson_id
    JOIN students s ON s.id = a.student_id
    JOIN groups g ON g.id = s.group_id
    WHERE s.status = 'active' AND (? IS NULL OR g.teacher_id = ?)
    ORDER BY a.student_id, l.date DESC`, teacherId, teacherId);

  const byStudent = new Map();
  for (const r of rows) {
    if (!byStudent.has(r.student_id)) byStudent.set(r.student_id, []);
    byStudent.get(r.student_id).push(r);
  }

  const alerts = [];
  for (const [studentId, list] of byStudent) {
    let streak = 0;
    const dates = [];
    for (const r of list) {
      if (r.status !== 'absent') break;
      streak++;
      dates.push(r.date);
    }
    if (streak < ABSENCE_LIMIT) continue;
    const lastSeen = list.find((r) => r.status === 'present' || r.status === 'late')?.date || null;
    const s = get(`
      SELECT s.id, s.name, s.gender, g.id AS group_id, g.name AS group_name, t.name AS teacher_name,
             f.name AS family_name, f.phone, f.telegram, f.whatsapp, f.is_self
      FROM students s JOIN groups g ON g.id = s.group_id LEFT JOIN teachers t ON t.id = g.teacher_id
      JOIN families f ON f.id = s.family_id WHERE s.id = ?`, studentId);
    const firstMiss = dates[dates.length - 1];
    const contact = get(`SELECT c.note, c.created_at, u.name AS user_name FROM contact_logs c LEFT JOIN users u ON u.id = c.created_by
                         WHERE c.student_id = ? AND substr(c.created_at, 1, 10) >= ? ORDER BY c.id DESC LIMIT 1`, studentId, firstMiss);
    alerts.push({ ...s, streak, missed_dates: dates.reverse(), last_seen: lastSeen, contact: contact || null });
  }
  return alerts.sort((a, b) => b.streak - a.streak);
}
