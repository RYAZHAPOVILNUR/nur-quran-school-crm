import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
export const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'nur.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');

// Поиск без учёта регистра для кириллицы (встроенный LOWER в SQLite понимает только латиницу).
db.function('ru_lower', (s) => (s == null ? null : String(s).toLowerCase().replaceAll('ё', 'е')));
db.function('digits', (s) => (s == null ? '' : String(s).replace(/\D/g, '')));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('m','f')),
  phone TEXT,
  rate INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Плательщик: родитель (одна семья — несколько детей) или взрослый ученик, который платит сам.
CREATE TABLE IF NOT EXISTS families (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  telegram TEXT,
  whatsapp TEXT,
  is_self INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','teacher','parent')),
  password_hash TEXT NOT NULL,
  teacher_id INTEGER REFERENCES teachers(id),
  family_id INTEGER REFERENCES families(id),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('reading','tajweed','hifz','individual')),
  gender TEXT NOT NULL CHECK (gender IN ('m','f')),
  teacher_id INTEGER REFERENCES teachers(id),
  format TEXT NOT NULL CHECK (format IN ('offline','online')),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  schedule TEXT NOT NULL DEFAULT '[]',
  duration INTEGER NOT NULL DEFAULT 60,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('m','f')),
  birth_year INTEGER,
  family_id INTEGER NOT NULL REFERENCES families(id),
  group_id INTEGER REFERENCES groups(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','waiting','paused','finished','left')),
  status_reason TEXT,
  status_changed_at TEXT,
  start_date TEXT NOT NULL,
  source TEXT,
  is_free INTEGER NOT NULL DEFAULT 0,
  free_reason TEXT,
  notes TEXT,
  lead_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS students_group ON students(group_id, status);
CREATE INDEX IF NOT EXISTS students_family ON students(family_id);

CREATE TABLE IF NOT EXISTS student_status_log (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  group_id INTEGER NOT NULL REFERENCES groups(id),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','enrolled','canceled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

-- Каникулы: group_id IS NULL — для всей школы, иначе пауза одной группы. Оплата за месяц не начисляется.
CREATE TABLE IF NOT EXISTS months_off (
  id INTEGER PRIMARY KEY,
  month TEXT NOT NULL,
  group_id INTEGER REFERENCES groups(id),
  reason TEXT,
  canceled INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES groups(id),
  date TEXT NOT NULL,
  teacher_id INTEGER REFERENCES teachers(id),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (group_id, date)
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  status TEXT NOT NULL CHECK (status IN ('present','late','excused','absent')),
  UNIQUE (lesson_id, student_id)
);
CREATE INDEX IF NOT EXISTS attendance_student ON attendance(student_id);

CREATE TABLE IF NOT EXISTS hifz_records (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  type TEXT NOT NULL CHECK (type IN ('new','review')),
  page_from INTEGER NOT NULL CHECK (page_from BETWEEN 1 AND 604),
  page_to INTEGER NOT NULL CHECK (page_to BETWEEN 1 AND 604),
  surah INTEGER,
  grade TEXT NOT NULL CHECK (grade IN ('excellent','errors','fail')),
  note TEXT,
  next_task TEXT,
  date TEXT NOT NULL,
  teacher_id INTEGER REFERENCES teachers(id),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS hifz_student ON hifz_records(student_id, type, date);

CREATE TABLE IF NOT EXISTS juz_completions (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  juz INTEGER NOT NULL,
  date TEXT NOT NULL,
  teacher_id INTEGER REFERENCES teachers(id),
  UNIQUE (student_id, juz)
);

-- Начисления: абонемент за месяц или индивидуальный урок. waived = обучение бесплатно (садака).
CREATE TABLE IF NOT EXISTS charges (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  family_id INTEGER NOT NULL REFERENCES families(id),
  month TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('subscription','lesson')),
  lesson_id INTEGER REFERENCES lessons(id),
  base_amount INTEGER NOT NULL,
  discount_pct INTEGER NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL,
  waived INTEGER NOT NULL DEFAULT 0,
  canceled INTEGER NOT NULL DEFAULT 0,
  cancel_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS charges_sub ON charges(student_id, month) WHERE kind = 'subscription';
CREATE UNIQUE INDEX IF NOT EXISTS charges_lesson ON charges(lesson_id, student_id) WHERE kind = 'lesson';

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  month TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('cash','transfer')),
  paid_at TEXT NOT NULL,
  note TEXT,
  canceled INTEGER NOT NULL DEFAULT 0,
  cancel_reason TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS payments_student ON payments(student_id, month);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id),
  amount INTEGER NOT NULL,
  channel TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contact_logs (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  age INTEGER,
  gender TEXT CHECK (gender IN ('m','f')),
  contact_name TEXT,
  phone TEXT,
  telegram TEXT,
  whatsapp TEXT,
  interest TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  trial_date TEXT,
  trial_group_id INTEGER REFERENCES groups(id),
  reject_reason TEXT,
  notes TEXT,
  student_id INTEGER REFERENCES students(id),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lead_events (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id),
  status TEXT NOT NULL,
  note TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS salary_payouts (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  month TEXT NOT NULL,
  amount INTEGER NOT NULL,
  paid_at TEXT NOT NULL,
  canceled INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

db.exec(SCHEMA);

const cache = new Map();
function stmt(sql) {
  let s = cache.get(sql);
  if (!s) { s = db.prepare(sql); cache.set(sql, s); }
  return s;
}

export const all = (sql, ...params) => stmt(sql).all(...params);
export const get = (sql, ...params) => stmt(sql).get(...params);
export const run = (sql, ...params) => stmt(sql).run(...params);

let depth = 0;
export function tx(fn) {
  if (depth > 0) return fn();
  depth++;
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

export function setting(key, fallback = null) {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : fallback;
}

export function settingNum(key, fallback) {
  const v = setting(key);
  return v == null ? fallback : Number(v);
}

export function audit(user, action, entity = null, entityId = null, details = null) {
  run('INSERT INTO audit (user_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)',
    user?.id ?? null, action, entity, entityId, details == null ? null : JSON.stringify(details));
}

export function isEmpty() {
  return get('SELECT COUNT(*) AS n FROM users').n === 0;
}
