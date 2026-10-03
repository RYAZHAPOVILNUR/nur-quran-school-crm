// Полный сброс к демо-данным: старая база сохраняется в data/backups, затем создаётся новая.
import fs from 'node:fs';
import path from 'node:path';
import { DB_PATH } from './db.js';

const dir = path.join(path.dirname(DB_PATH), 'backups');
fs.mkdirSync(dir, { recursive: true });
if (fs.existsSync(DB_PATH)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(DB_PATH, path.join(dir, `before-reset-${stamp}.db`));
}
const { db } = await import('./db.js');
db.close();
for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) if (fs.existsSync(f)) fs.unlinkSync(f);
console.log('Старая база сохранена в data/backups. Запустите npm start — демо-данные создадутся заново.');
