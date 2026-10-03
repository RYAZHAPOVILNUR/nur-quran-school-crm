import { all, get, run, tx, audit } from './db.js';
import { fail, str, int, today, isDate, oneOf, digits } from './util.js';
import { repriceFamily } from './billing.js';
import { SOURCES } from '../shared/labels.js';

const GENDER_RULE = {
  m: 'В эту группу записываются только мальчики и мужчины',
  f: 'В эту группу записываются только девочки и женщины',
};

export function seatsTaken(groupId, exceptStudentId = 0) {
  return get(`SELECT COUNT(*) AS n FROM students WHERE group_id = ? AND status IN ('active','paused') AND id != ?`, groupId, exceptStudentId).n;
}

// Проверка пола: группы мальчиков/мужчин и девочек/женщин не смешиваются.
export function checkGender(group, gender) {
  if (group.gender !== gender) fail(400, `${GENDER_RULE[group.gender]}. Выберите группу для ${gender === 'f' ? 'девочек и женщин' : 'мальчиков и мужчин'}.`);
}

function logStatus(studentId, from, to, reason, user) {
  run('INSERT INTO student_status_log (student_id, from_status, to_status, reason, user_id) VALUES (?, ?, ?, ?, ?)',
    studentId, from, to, reason, user?.id ?? null);
}

// Записывает ученика в группу. Если мест нет — ставит в лист ожидания.
export function enroll(studentId, groupId, user) {
  const s = get('SELECT * FROM students WHERE id = ?', studentId);
  const g = get('SELECT * FROM groups WHERE id = ? AND archived = 0', groupId);
  if (!g) fail(404, 'Группа не найдена');
  checkGender(g, s.gender);
  return tx(() => {
    run("UPDATE waitlist SET status = 'canceled', resolved_at = datetime('now') WHERE student_id = ? AND status = 'waiting' AND group_id != ?", studentId, groupId);
    if (seatsTaken(groupId, studentId) >= g.capacity) {
      if (!get("SELECT id FROM waitlist WHERE student_id = ? AND group_id = ? AND status = 'waiting'", studentId, groupId)) {
        run('INSERT INTO waitlist (student_id, group_id) VALUES (?, ?)', studentId, groupId);
      }
      // Ученик, который уже учится в другой группе, остаётся в ней, пока ждёт места.
      const studying = s.group_id && ['active', 'paused'].includes(s.status);
      if (!studying) {
        run("UPDATE students SET status = 'waiting', status_reason = ?, status_changed_at = ? WHERE id = ?", `Ждёт место в группе «${g.name}»`, today(), studentId);
        if (s.status !== 'waiting') logStatus(studentId, s.status, 'waiting', `Группа «${g.name}» заполнена`, user);
      }
      audit(user, 'waitlist.add', 'student', studentId, { group_id: groupId });
      repriceFamily(s.family_id);
      return { status: 'waiting', group: g.name };
    }
    run("UPDATE waitlist SET status = 'enrolled', resolved_at = datetime('now') WHERE student_id = ? AND group_id = ? AND status = 'waiting'", studentId, groupId);
    run('UPDATE students SET group_id = ?, status = ?, status_reason = NULL, status_changed_at = ? WHERE id = ?',
      groupId, s.status === 'paused' ? 'paused' : 'active', today(), studentId);
    if (s.status !== 'active' && s.status !== 'paused') logStatus(studentId, s.status, 'active', `Записан в группу «${g.name}»`, user);
    audit(user, 'student.group', 'student', studentId, { from: s.group_id, to: groupId });
    repriceFamily(s.family_id);
    return { status: 'active', group: g.name };
  });
}

export function changeStatus(studentId, status, reason, user) {
  const s = get('SELECT * FROM students WHERE id = ?', studentId);
  if (!s) fail(404, 'Ученик не найден');
  if (!['active', 'paused', 'finished', 'left'].includes(status)) fail(400, 'Неверный статус');
  if ((status === 'left' || status === 'paused') && !reason) fail(400, 'Укажите причину');
  if (status === 'active') {
    if (!s.group_id) fail(400, 'Сначала выберите группу');
    if (s.status !== 'paused') {
      const g = get('SELECT * FROM groups WHERE id = ?', s.group_id);
      if (seatsTaken(s.group_id, studentId) >= g.capacity) fail(400, `В группе «${g.name}» нет свободных мест`);
    }
  }
  tx(() => {
    run('UPDATE students SET status = ?, status_reason = ?, status_changed_at = ? WHERE id = ?', status, reason, today(), studentId);
    if (status !== 'active') run("UPDATE waitlist SET status = 'canceled', resolved_at = datetime('now') WHERE student_id = ? AND status = 'waiting'", studentId);
    logStatus(studentId, s.status, status, reason, user);
    audit(user, 'student.status', 'student', studentId, { from: s.status, to: status, reason });
  });
  repriceFamily(s.family_id);
}

function familyInput(f) {
  return {
    name: str(f.name, 120),
    phone: str(f.phone, 40),
    telegram: str(f.telegram, 60),
    whatsapp: str(f.whatsapp, 40),
    notes: str(f.notes, 1000),
  };
}

export function findFamilyByPhone(phone) {
  const d = digits(phone).slice(-10);
  if (d.length < 10) return null;
  return get(`SELECT * FROM families WHERE substr(digits(phone), -10) = ? OR substr(digits(whatsapp), -10) = ? LIMIT 1`, d, d);
}

export function createStudent(body, user) {
  const name = str(body.name, 120);
  if (!name) fail(400, 'Укажите имя ученика');
  const gender = body.gender === 'm' || body.gender === 'f' ? body.gender : fail(400, 'Укажите пол ученика');
  const year = Number(today().slice(0, 4));
  const birthYear = int(body.birth_year) ?? (int(body.age) != null ? year - int(body.age) : null);
  if (birthYear != null && (birthYear < year - 100 || birthYear > year - 3)) fail(400, 'Проверьте возраст');
  const startDate = isDate(body.start_date) ? body.start_date : today();
  const source = body.source ? oneOf(body.source, SOURCES, 'Откуда пришёл') : null;
  const groupId = int(body.group_id);
  if (groupId) {
    const g = get('SELECT * FROM groups WHERE id = ? AND archived = 0', groupId);
    if (!g) fail(404, 'Группа не найдена');
    checkGender(g, gender);
  }

  return tx(() => {
    let familyId = int(body.family_id);
    if (familyId) {
      if (!get('SELECT id FROM families WHERE id = ?', familyId)) fail(404, 'Семья не найдена');
    } else {
      const f = familyInput(body.family || {});
      const isSelf = body.family?.is_self ? 1 : 0;
      if (isSelf) f.name = f.name || name;
      if (!f.name) fail(400, 'Укажите, кто платит: имя родителя');
      if (!f.phone && !f.telegram && !f.whatsapp) fail(400, 'Укажите хотя бы один контакт: телефон, Telegram или WhatsApp');
      familyId = Number(run('INSERT INTO families (name, phone, telegram, whatsapp, is_self, notes) VALUES (?, ?, ?, ?, ?, ?)',
        f.name, f.phone, f.telegram, f.whatsapp, isSelf, f.notes).lastInsertRowid);
    }
    const id = Number(run(`INSERT INTO students (name, gender, birth_year, family_id, status, status_changed_at, start_date, source, is_free, free_reason, notes, lead_id)
                           VALUES (?, ?, ?, ?, 'waiting', ?, ?, ?, ?, ?, ?, ?)`,
    name, gender, birthYear, familyId, today(), startDate, source, body.is_free ? 1 : 0, body.is_free ? str(body.free_reason, 200) : null,
    str(body.notes, 2000), int(body.lead_id)).lastInsertRowid);
    logStatus(id, null, 'waiting', 'Ученик добавлен', user);
    audit(user, 'student.create', 'student', id, { name });
    const result = groupId ? enroll(id, groupId, user) : { status: 'waiting' };
    if (!groupId) run("UPDATE students SET status_reason = 'Группа не выбрана' WHERE id = ?", id);
    return { id, family_id: familyId, ...result };
  });
}

export function updateStudent(id, body, user) {
  const s = get('SELECT * FROM students WHERE id = ?', id);
  if (!s) fail(404, 'Ученик не найден');
  const year = Number(today().slice(0, 4));
  const patch = {
    name: body.name !== undefined ? (str(body.name, 120) || fail(400, 'Укажите имя')) : s.name,
    birth_year: body.age !== undefined ? (int(body.age) != null ? year - int(body.age) : null) : s.birth_year,
    source: body.source !== undefined ? (body.source ? oneOf(body.source, SOURCES, 'Откуда пришёл') : null) : s.source,
    start_date: isDate(body.start_date) ? body.start_date : s.start_date,
    is_free: body.is_free !== undefined ? (body.is_free ? 1 : 0) : s.is_free,
    free_reason: body.free_reason !== undefined ? str(body.free_reason, 200) : s.free_reason,
    notes: body.notes !== undefined ? str(body.notes, 2000) : s.notes,
  };
  if (body.gender && body.gender !== s.gender) {
    if (!['m', 'f'].includes(body.gender)) fail(400, 'Неверный пол');
    if (s.group_id && ['active', 'paused'].includes(s.status)) checkGender(get('SELECT * FROM groups WHERE id = ?', s.group_id), body.gender);
    patch.gender = body.gender;
  } else patch.gender = s.gender;
  run(`UPDATE students SET name = ?, gender = ?, birth_year = ?, source = ?, start_date = ?, is_free = ?, free_reason = ?, notes = ? WHERE id = ?`,
    patch.name, patch.gender, patch.birth_year, patch.source, patch.start_date, patch.is_free, patch.is_free ? patch.free_reason : null, patch.notes, id);
  audit(user, 'student.update', 'student', id, patch);
  if (patch.is_free !== s.is_free) repriceFamily(s.family_id);
}

export function updateFamily(id, body, user) {
  const fam = get('SELECT * FROM families WHERE id = ?', id);
  if (!fam) fail(404, 'Семья не найдена');
  const f = familyInput({ ...fam, ...body });
  if (!f.name) fail(400, 'Укажите имя');
  run('UPDATE families SET name = ?, phone = ?, telegram = ?, whatsapp = ?, notes = ? WHERE id = ?', f.name, f.phone, f.telegram, f.whatsapp, f.notes, id);
  audit(user, 'family.update', 'family', id, f);
}

export function familyChildren(familyId) {
  return all(`SELECT s.id, s.name, s.gender, s.birth_year, s.status, s.is_free, s.start_date, g.name AS group_name, g.direction
              FROM students s LEFT JOIN groups g ON g.id = s.group_id WHERE s.family_id = ? ORDER BY s.start_date, s.id`, familyId);
}
