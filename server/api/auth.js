import { get, setting } from '../db.js';
import { fail, str } from '../util.js';
import { createSession, destroySession, sessionCookie, verifyPassword, readCookie, COOKIE, can } from '../auth.js';

export const DEMO_LOGINS = ['abdullah', 'maryam', 'yusuf', 'aisha'];
const demoEnabled = () => process.env.DEMO_MODE !== '0';

function me(user) {
  const perms = ['students.edit', 'families.view', 'groups.edit', 'groups.enroll', 'hifz.edit', 'money.view', 'money.edit', 'leads',
    'finance.view', 'salary.view', 'settings.edit', 'teachers.edit', 'alerts.contact'];
  return {
    ...user,
    can: Object.fromEntries(perms.map((p) => [p, can(user, p)])),
    school: setting('school_name', 'Школа Корана «Нур»'),
  };
}

function login(ctx, user) {
  const token = createSession(user.id);
  ctx.headers = { 'Set-Cookie': sessionCookie(token, ctx.req) };
  return me({ id: user.id, login: user.login, name: user.name, role: user.role, teacher_id: user.teacher_id, family_id: user.family_id });
}

export default function (r) {
  r.get('/api/auth/me', (ctx) => (ctx.user ? me(ctx.user) : { guest: true, demo: demoEnabled() }), { public: true });

  r.post('/api/auth/login', (ctx) => {
    const loginName = str(ctx.body.login, 50)?.toLowerCase();
    const user = loginName && get('SELECT * FROM users WHERE login = ? AND active = 1', loginName);
    if (!user || !verifyPassword(ctx.body.password || '', user.password_hash)) fail(401, 'Неверный логин или пароль');
    return login(ctx, user);
  }, { public: true });

  // Быстрый вход для показа. В рабочем режиме отключается переменной DEMO_MODE=0.
  r.post('/api/auth/demo', (ctx) => {
    if (!demoEnabled()) fail(403, 'Демо-вход отключён');
    const loginName = String(ctx.body.login || '');
    if (!DEMO_LOGINS.includes(loginName)) fail(400, 'Нет такого демо-входа');
    const user = get('SELECT * FROM users WHERE login = ? AND active = 1', loginName);
    if (!user) fail(404, 'Пользователь не найден');
    return login(ctx, user);
  }, { public: true });

  r.post('/api/auth/logout', (ctx) => {
    destroySession(readCookie(ctx.req, COOKIE));
    ctx.headers = { 'Set-Cookie': sessionCookie(null, ctx.req) };
    return { ok: true };
  }, { public: true });
}
