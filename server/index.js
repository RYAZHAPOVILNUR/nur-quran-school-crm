import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, isEmpty } from './db.js';
import { HttpError } from './util.js';
import { userFromRequest } from './auth.js';
import { syncCharges } from './billing.js';
import { autoBackup } from './backup.js';
import { seed } from './seed.js';
import registerAuth from './api/auth.js';
import registerDashboard from './api/dashboard.js';
import registerStudents from './api/students.js';
import registerGroups from './api/groups.js';
import registerMoney from './api/money.js';
import registerLeads from './api/leads.js';
import registerStaff from './api/staff.js';

const routes = [];
const router = {};
for (const method of ['get', 'post', 'put']) {
  router[method] = (pattern, handler, opts = {}) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method: method.toUpperCase(), re, keys, handler, opts });
  };
}

[registerAuth, registerDashboard, registerStudents, registerGroups, registerMoney, registerLeads, registerStaff].forEach((r) => r(router));

const STATIC = {
  '/': path.join(ROOT, 'public'),
  '/shared/': path.join(ROOT, 'shared'),
};
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
};

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const payload = isBuf ? body : JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': isBuf ? 'application/octet-stream' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 1e6) throw new HttpError(413, 'Слишком большой запрос');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Неверный формат данных'); }
}

function serveStatic(req, res, pathname) {
  let base = STATIC['/'];
  let rel = pathname;
  if (pathname.startsWith('/shared/')) { base = STATIC['/shared/']; rel = pathname.slice('/shared'.length); }
  let file = path.normalize(path.join(base, decodeURIComponent(rel)));
  if (!file.startsWith(base)) return send(res, 403, { error: 'Нет доступа' });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(STATIC['/'], 'index.html');
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);

    const route = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
    if (!route) return send(res, 404, { error: 'Не найдено' });
    try {
      // Защита от CSRF: изменяющие запросы принимаем только как JSON (кросс-доменная форма так не отправит).
      if (req.method !== 'GET' && !String(req.headers['content-type'] || '').includes('application/json')) {
        throw new HttpError(415, 'Ожидается JSON');
      }
      const m = url.pathname.match(route.re);
      const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const user = userFromRequest(req);
      if (!route.opts.public && !user) throw new HttpError(401, 'Нужно войти в систему');
      const body = req.method === 'GET' ? {} : await readBody(req);
      const ctx = { req, res, user, params, query: Object.fromEntries(url.searchParams), body };
      const result = await route.handler(ctx);
      if (res.writableEnded) return;
      if (result && result.__raw) return send(res, 200, result.buffer, result.headers);
      send(res, 200, result ?? { ok: true }, ctx.headers || {});
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      if (String(e.message).includes('CHECK constraint') || String(e.message).includes('FOREIGN KEY')) {
        return send(res, 400, { error: 'Данные заполнены неверно' });
      }
      console.error(e);
      send(res, 500, { error: 'Ошибка сервера. Попробуйте ещё раз.' });
    }
  });
}

export function start(port = Number(process.env.PORT) || 3000, host = process.env.HOST || '0.0.0.0') {
  if (isEmpty()) {
    console.log('База пустая — заполняю демо-данными…');
    seed();
  }
  syncCharges();
  autoBackup();
  setInterval(() => { syncCharges(); autoBackup(); }, 60 * 60 * 1000).unref();
  const server = createServer();
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) {
  const server = await start();
  const { port } = server.address();
  console.log(`\n  Школа Корана «Нур» — CRM запущена\n  Откройте: http://localhost:${port}\n`);
}
