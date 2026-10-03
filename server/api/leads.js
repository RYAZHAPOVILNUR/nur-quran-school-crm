import { all, get, run, tx, audit } from '../db.js';
import { fail, str, int, today, isDate, isMonth, currentMonth, oneOf } from '../util.js';
import { need } from '../auth.js';
import { createStudent, checkGender } from '../students.js';
import { LEAD_STATUS, SOURCES, DIRECTIONS } from '../../shared/labels.js';

const LEAD_SQL = `SELECT l.*, g.name AS trial_group_name, u.name AS created_by_name FROM leads l
                  LEFT JOIN groups g ON g.id = l.trial_group_id LEFT JOIN users u ON u.id = l.created_by`;

function leadInput(b, old = {}) {
  const pick = (k, fn) => (b[k] !== undefined ? fn(b[k]) : old[k] ?? null);
  return {
    name: pick('name', (v) => str(v, 120)),
    age: pick('age', int),
    gender: pick('gender', (v) => (v === 'm' || v === 'f' ? v : null)),
    contact_name: pick('contact_name', (v) => str(v, 120)),
    phone: pick('phone', (v) => str(v, 40)),
    telegram: pick('telegram', (v) => str(v, 60)),
    whatsapp: pick('whatsapp', (v) => str(v, 40)),
    interest: pick('interest', (v) => (v ? oneOf(v, DIRECTIONS, 'Что хочет изучать') : null)),
    source: pick('source', (v) => (v ? oneOf(v, SOURCES, 'Откуда узнал') : null)),
    notes: pick('notes', (v) => str(v, 1000)),
  };
}

function event(leadId, status, note, user) {
  run('INSERT INTO lead_events (lead_id, status, note, user_id) VALUES (?, ?, ?, ?)', leadId, status, note, user.id);
}

export default function (r) {
  r.get('/api/leads', (ctx) => {
    need(ctx.user, 'leads');
    const status = ctx.query.status;
    const list = all(`${LEAD_SQL} WHERE (? IS NULL OR l.status = ?) ORDER BY
      CASE l.status WHEN 'new' THEN 0 WHEN 'contacted' THEN 1 WHEN 'trial_scheduled' THEN 2 WHEN 'trial_done' THEN 3 ELSE 4 END,
      COALESCE(l.trial_date, l.created_at) DESC LIMIT 300`, status || null, status || null);
    const counts = Object.fromEntries(all('SELECT status, COUNT(*) AS n FROM leads GROUP BY status').map((c) => [c.status, c.n]));
    return { list, counts };
  });

  r.get('/api/leads/stats', (ctx) => {
    need(ctx.user, 'leads');
    const month = isMonth(ctx.query.month) ? ctx.query.month : currentMonth();
    const leads = all('SELECT * FROM leads WHERE substr(created_at, 1, 7) = ?', month);
    const enrolledInMonth = get(`SELECT COUNT(DISTINCT lead_id) AS n FROM lead_events WHERE status = 'enrolled' AND substr(created_at, 1, 7) = ?`, month).n;
    const bySource = Object.keys(SOURCES).map((src) => {
      const ls = all('SELECT status FROM leads WHERE source = ?', src);
      const students = all(`SELECT s.id, s.status FROM students s WHERE s.source = ?`, src);
      const att = get(`SELECT SUM(a.status IN ('present','late')) AS came, COUNT(*) AS total FROM attendance a
                       JOIN students s ON s.id = a.student_id WHERE s.source = ?`, src);
      const stayed = students.filter((s) => ['active', 'paused', 'finished'].includes(s.status)).length;
      return {
        source: src,
        leads_month: leads.filter((l) => l.source === src).length,
        leads_total: ls.length,
        enrolled_total: ls.filter((l) => l.status === 'enrolled').length,
        conversion: ls.length ? Math.round((ls.filter((l) => l.status === 'enrolled').length / ls.length) * 100) : null,
        students: students.length,
        active: students.filter((s) => s.status === 'active').length,
        left: students.filter((s) => s.status === 'left').length,
        retention: students.length ? Math.round((stayed / students.length) * 100) : null,
        attendance: att.total ? Math.round((att.came / att.total) * 100) : null,
      };
    });
    const funnel = Object.keys(LEAD_STATUS).map((s) => ({ status: s, n: leads.filter((l) => l.status === s).length }));
    return {
      month,
      total: leads.length,
      enrolled: leads.filter((l) => l.status === 'enrolled').length,
      enrolled_in_month: enrolledInMonth,
      rejected: leads.filter((l) => l.status === 'rejected').length,
      unanswered: get("SELECT COUNT(*) AS n FROM leads WHERE status = 'new'").n,
      funnel,
      by_source: bySource,
      reject_reasons: all("SELECT reject_reason, COUNT(*) AS n FROM leads WHERE status = 'rejected' GROUP BY reject_reason ORDER BY n DESC"),
    };
  });

  r.get('/api/leads/:id', (ctx) => {
    need(ctx.user, 'leads');
    const lead = get(`${LEAD_SQL} WHERE l.id = ?`, Number(ctx.params.id)) || fail(404, 'Заявка не найдена');
    return {
      lead,
      events: all(`SELECT e.*, u.name AS user_name FROM lead_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.lead_id = ? ORDER BY e.id`, lead.id),
    };
  });

  r.post('/api/leads', (ctx) => {
    need(ctx.user, 'leads');
    const l = leadInput(ctx.body);
    if (!l.name) fail(400, 'Укажите имя');
    if (!l.phone && !l.telegram && !l.whatsapp) fail(400, 'Укажите контакт: телефон, Telegram или WhatsApp');
    const id = Number(run(`INSERT INTO leads (name, age, gender, contact_name, phone, telegram, whatsapp, interest, source, notes, created_by)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    l.name, l.age, l.gender, l.contact_name, l.phone, l.telegram, l.whatsapp, l.interest, l.source, l.notes, ctx.user.id).lastInsertRowid);
    event(id, 'new', 'Заявка создана', ctx.user);
    audit(ctx.user, 'lead.create', 'lead', id, { name: l.name });
    return { id };
  });

  r.put('/api/leads/:id', (ctx) => {
    need(ctx.user, 'leads');
    const id = Number(ctx.params.id);
    const old = get('SELECT * FROM leads WHERE id = ?', id) || fail(404, 'Заявка не найдена');
    const l = leadInput(ctx.body, old);
    if (!l.name) fail(400, 'Укажите имя');
    run(`UPDATE leads SET name = ?, age = ?, gender = ?, contact_name = ?, phone = ?, telegram = ?, whatsapp = ?, interest = ?, source = ?, notes = ?,
         updated_at = datetime('now') WHERE id = ?`, l.name, l.age, l.gender, l.contact_name, l.phone, l.telegram, l.whatsapp, l.interest, l.source, l.notes, id);
    return { ok: true };
  });

  r.post('/api/leads/:id/status', (ctx) => {
    need(ctx.user, 'leads');
    const id = Number(ctx.params.id);
    const lead = get('SELECT * FROM leads WHERE id = ?', id) || fail(404, 'Заявка не найдена');
    const status = ctx.body.status;
    if (!['new', 'contacted', 'trial_scheduled', 'trial_done', 'rejected'].includes(status)) fail(400, 'Неверный этап');
    if (lead.status === 'enrolled') fail(400, 'Заявка уже стала учеником');
    const note = str(ctx.body.note, 500);
    if (status === 'trial_scheduled') {
      const date = isDate(ctx.body.trial_date) ? ctx.body.trial_date : fail(400, 'Укажите дату пробного урока');
      const groupId = int(ctx.body.trial_group_id) || fail(400, 'Выберите группу для пробного урока');
      const g = get('SELECT * FROM groups WHERE id = ?', groupId) || fail(404, 'Группа не найдена');
      if (lead.gender) checkGender(g, lead.gender);
      run("UPDATE leads SET status = ?, trial_date = ?, trial_group_id = ?, updated_at = datetime('now') WHERE id = ?", status, date, groupId, id);
      event(id, status, note || `Пробный урок ${date.split('-').reverse().join('.')}, группа «${g.name}»`, ctx.user);
    } else if (status === 'rejected') {
      const reason = str(ctx.body.reject_reason, 300) || fail(400, 'Укажите причину отказа');
      run("UPDATE leads SET status = ?, reject_reason = ?, updated_at = datetime('now') WHERE id = ?", status, reason, id);
      event(id, status, reason, ctx.user);
    } else {
      run("UPDATE leads SET status = ?, updated_at = datetime('now') WHERE id = ?", status, id);
      event(id, status, note, ctx.user);
    }
    audit(ctx.user, 'lead.status', 'lead', id, { from: lead.status, to: status });
    return { ok: true };
  });

  // Заявка становится учеником: создаём ученика (и семью, если её ещё нет) и записываем в группу.
  r.post('/api/leads/:id/convert', (ctx) => {
    need(ctx.user, 'leads');
    need(ctx.user, 'students.edit');
    const id = Number(ctx.params.id);
    const lead = get('SELECT * FROM leads WHERE id = ?', id) || fail(404, 'Заявка не найдена');
    if (lead.status === 'enrolled') fail(400, 'Заявка уже стала учеником');
    const b = ctx.body;
    return tx(() => {
      const res = createStudent({
        name: b.name || lead.name,
        gender: b.gender || lead.gender,
        age: b.age ?? lead.age,
        group_id: b.group_id,
        start_date: b.start_date || today(),
        source: lead.source,
        is_free: b.is_free,
        free_reason: b.free_reason,
        notes: b.notes ?? lead.notes,
        lead_id: id,
        family_id: b.family_id,
        family: b.family || {
          name: lead.contact_name || lead.name, phone: lead.phone, telegram: lead.telegram, whatsapp: lead.whatsapp,
          is_self: !lead.contact_name,
        },
      }, ctx.user);
      run("UPDATE leads SET status = 'enrolled', student_id = ?, updated_at = datetime('now') WHERE id = ?", res.id, id);
      event(id, 'enrolled', res.status === 'waiting' ? `Стал учеником, ждёт место в группе «${res.group}»` : `Стал учеником, группа «${res.group}»`, ctx.user);
      audit(ctx.user, 'lead.convert', 'lead', id, { student_id: res.id });
      return res;
    });
  });
}
