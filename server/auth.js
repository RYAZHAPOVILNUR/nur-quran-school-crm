import crypto from 'node:crypto';
import { get, run } from './db.js';
import { fail } from './util.js';

const SESSION_DAYS = 30;
export const COOKIE = 'nur_sid';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(String(password), salt, 32);
  return crypto.timingSafeEqual(check, Buffer.from(hash, 'hex'));
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', token, userId, expires);
  run("DELETE FROM sessions WHERE expires_at < datetime('now')");
  return token;
}

export function destroySession(token) {
  if (token) run('DELETE FROM sessions WHERE token = ?', token);
}

export function sessionCookie(token, req) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  const maxAge = token ? SESSION_DAYS * 86400 : 0;
  return `${COOKIE}=${token || ''}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function userFromRequest(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const user = get(`
    SELECT u.id, u.login, u.name, u.role, u.teacher_id, u.family_id
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ? AND u.active = 1`, token, new Date().toISOString());
  return user || null;
}

// Права по ролям. Проверяются на сервере в каждом обработчике.
// Роль parent заложена на будущее: кабинет родителя получит доступ только к своим детям (scope по family_id).
const CAN = {
  'students.view': ['owner', 'admin', 'teacher'],
  'students.edit': ['owner', 'admin'],
  'families.view': ['owner', 'admin'],
  'groups.view': ['owner', 'admin', 'teacher'],
  'groups.edit': ['owner'],
  'groups.enroll': ['owner', 'admin'],
  'attendance.edit': ['owner', 'admin', 'teacher'],
  'hifz.edit': ['owner', 'teacher'],
  'money.view': ['owner', 'admin'],
  'money.edit': ['owner', 'admin'],
  'leads': ['owner', 'admin'],
  'finance.view': ['owner'],
  'salary.view': ['owner'],
  'settings.edit': ['owner'],
  'teachers.edit': ['owner'],
  'alerts.contact': ['owner', 'admin'],
};

export function can(user, perm) {
  return !!user && (CAN[perm] || []).includes(user.role);
}

export function need(user, perm) {
  if (!user) fail(401, 'Нужно войти в систему');
  if (!can(user, perm)) fail(403, 'Недостаточно прав');
}

// Учитель видит только свои группы и учеников этих групп.
export function teacherScope(user) {
  return user.role === 'teacher' ? user.teacher_id : null;
}

export function assertGroupAccess(user, groupId) {
  const g = get('SELECT id, teacher_id FROM groups WHERE id = ?', groupId);
  if (!g) fail(404, 'Группа не найдена');
  if (user.role === 'teacher' && g.teacher_id !== user.teacher_id) fail(403, 'Это не ваша группа');
  return g;
}

export function assertStudentAccess(user, studentId) {
  const s = get('SELECT s.id, s.group_id, g.teacher_id FROM students s LEFT JOIN groups g ON g.id = s.group_id WHERE s.id = ?', studentId);
  if (!s) fail(404, 'Ученик не найден');
  if (user.role === 'teacher' && s.teacher_id !== user.teacher_id) fail(403, 'Это не ваш ученик');
  return s;
}
