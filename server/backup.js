import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { db, DB_PATH } from './db.js';
import { today } from './util.js';

const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups');
const KEEP = 14;

// Раз в день кладёт полную копию базы в data/backups и хранит последние 14 копий.
export function autoBackup() {
  if (process.env.NO_BACKUP === '1') return;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `nur-${today()}.db`);
  if (fs.existsSync(file)) return;
  db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => /^nur-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  for (const old of files.slice(0, Math.max(0, files.length - KEEP))) fs.unlinkSync(path.join(BACKUP_DIR, old));
}

export function backupBuffer() {
  const tmp = path.join(os.tmpdir(), `nur-backup-${process.pid}-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${tmp.replaceAll("'", "''")}'`);
  const buf = fs.readFileSync(tmp);
  fs.unlinkSync(tmp);
  return buf;
}
