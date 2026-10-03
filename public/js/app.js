import { state, api, html, icon, logo, esc, go, toast, avatar } from './core.js';
import { ROLES } from '/shared/labels.js';

const app = document.getElementById('app');

// Маршруты: путь → [модуль, функция, кому доступно]
const ROUTES = [
  ['/', 'dashboard', 'dashboard'],
  ['/students', 'students', 'list'],
  ['/students/new', 'students', 'create', ['owner', 'admin']],
  ['/students/:id', 'students', 'detail'],
  ['/families', 'families', 'list', ['owner', 'admin']],
  ['/families/:id', 'families', 'detail', ['owner', 'admin']],
  ['/groups', 'groups', 'list'],
  ['/groups/:id', 'groups', 'detail'],
  ['/groups/:id/attendance', 'groups', 'attendance'],
  ['/schedule', 'groups', 'schedule'],
  ['/leads', 'leads', 'list', ['owner', 'admin']],
  ['/leads/stats', 'leads', 'stats', ['owner', 'admin']],
  ['/leads/:id', 'leads', 'detail', ['owner', 'admin']],
  ['/money', 'money', 'debtors', ['owner', 'admin']],
  ['/money/payments', 'money', 'payments', ['owner', 'admin']],
  ['/pay', 'money', 'pickFamily', ['owner', 'admin']],
  ['/pay/:id', 'money', 'pay', ['owner', 'admin']],
  ['/teachers', 'staff', 'teachers', ['owner']],
  ['/finance', 'staff', 'finance', ['owner']],
  ['/settings', 'staff', 'settings', ['owner']],
  ['/more', 'more', 'more'],
].map(([path, mod, fn, roles]) => {
  const keys = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  return { path, mod, fn, roles, keys, re };
});

const NAV = {
  owner: [['/', 'Главная', 'home'], ['/students', 'Ученики', 'users'], ['/leads', 'Заявки', 'inbox'], ['/money', 'Деньги', 'wallet'], ['/more', 'Ещё', 'more']],
  admin: [['/', 'Главная', 'home'], ['/students', 'Ученики', 'users'], ['/leads', 'Заявки', 'inbox'], ['/money', 'Оплаты', 'wallet'], ['/more', 'Ещё', 'more']],
  teacher: [['/', 'Сегодня', 'home'], ['/groups', 'Группы', 'clipboard'], ['/students', 'Ученики', 'users'], ['/schedule', 'Расписание', 'calendar']],
};
export const MORE = {
  owner: [['/groups', 'Группы и посещаемость', 'clipboard'], ['/schedule', 'Расписание недели', 'calendar'], ['/families', 'Семьи', 'family'],
    ['/teachers', 'Учителя и зарплата', 'teacher'], ['/finance', 'Финансы школы', 'chart'], ['/settings', 'Цены, каникулы, копии', 'settings']],
  admin: [['/groups', 'Группы и посещаемость', 'clipboard'], ['/schedule', 'Расписание недели', 'calendar'], ['/families', 'Семьи', 'family']],
  teacher: [],
};

const DEMO = [
  ['abdullah', 'Абдуллах', 'Владелец — видит всё', 'm'],
  ['maryam', 'Марьям', 'Администратор — ученики, заявки, оплаты', 'f'],
  ['yusuf', 'Юсуф', 'Учитель — группы хифза мальчиков и мужчин', 'm'],
  ['aisha', 'Аиша', 'Учительница — группы девочек и сестёр', 'f'],
];

function loginScreen(info = {}) {
  document.title = 'Вход — школа «Нур»';
  app.innerHTML = String(html`<div class="login"><div class="login-box">
    <div class="login-brand">${logo()}<h1>Школа Корана «Нур»</h1><p>Ученики, хифз, посещаемость и оплаты</p></div>
    ${info.demo !== false ? html`
      <div class="demo-grid" aria-label="Быстрый демо-вход">
        ${DEMO.map(([login, name, sub, g]) => html`<button class="demo-btn" data-demo="${login}">
          ${avatar(name, g)}<span><strong>Войти как ${name}</strong><small>${sub}</small></span></button>`)}
      </div>
      <div class="divider">или по логину и паролю</div>` : ''}
    <form class="card card-pad form-grid" id="login-form">
      <label class="field"><span>Логин</span><input class="input" name="login" autocomplete="username" autocapitalize="none" required></label>
      <label class="field"><span>Пароль</span><input class="input" name="password" type="password" autocomplete="current-password" required></label>
      <div class="form-error" role="alert"></div>
      <button class="btn primary block" type="submit">Войти</button>
    </form>
  </div></div>`);
  const err = app.querySelector('.form-error');
  const done = (me) => { state.me = me; if (!location.hash || location.hash === '#/') render(); else render(); };
  app.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', async () => {
    try { done(await api('/api/auth/demo', { method: 'POST', body: { login: b.dataset.demo } })); } catch (e) { toast(e.message, 'error'); }
  }));
  app.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      done(await api('/api/auth/login', { method: 'POST', body: { login: f.get('login'), password: f.get('password') } }));
    } catch (ex) { err.textContent = ex.message; err.classList.add('show'); }
  });
}

function shell() {
  const me = state.me;
  const nav = NAV[me.role] || [];
  const side = [...nav.filter(([p]) => p !== '/more'), ...(MORE[me.role] || [])];
  app.innerHTML = String(html`<div class="shell">
    <aside class="sidebar">
      <a href="#/" class="brand">${logo()}<span>«Нур»<small>Школа Корана</small></span></a>
      ${side.map(([p, l, i]) => html`<a class="nav-item" href="#${p}" data-path="${p}">${icon(i)}<span>${l}</span></a>`)}
      <div class="side-foot">
        <div class="user-chip">${avatar(me.name, me.login === 'maryam' || me.login === 'aisha' ? 'f' : 'm')}<div><strong>${me.name}</strong><div class="small muted">${ROLES[me.role]}</div></div></div>
        <button class="btn sm" data-logout>${icon('logout', 'sm')} Выйти</button>
      </div>
    </aside>
    <div class="content">
      <header class="topbar" id="topbar"></header>
      <main id="main"></main>
    </div>
    <nav class="bottom-nav" aria-label="Разделы">
      ${nav.map(([p, l, i]) => html`<a href="#${p}" data-path="${p}">${icon(i)}<span>${l}</span></a>`)}
    </nav>
  </div>`);
  app.querySelector('[data-logout]').addEventListener('click', logout);
  window.addEventListener('scroll', () => document.getElementById('topbar')?.classList.toggle('scrolled', window.scrollY > 4), { passive: true });
}

export async function logout() {
  await api('/api/auth/logout', { method: 'POST', body: {} }).catch(() => {});
  state.me = null;
  location.hash = '#/';
  loginScreen(await api('/api/auth/me').catch(() => ({})));
}

// Заголовок страницы: кнопка «назад» на вложенных экранах, имя пользователя на главной.
export function setTop({ title, back, actions = '' } = {}) {
  const top = document.getElementById('topbar');
  if (!top) return;
  const me = state.me;
  top.innerHTML = String(html`
    ${back ? html`<a class="icon-btn back" href="#${back}" aria-label="Назад">${icon('back')}</a>` : html`<a href="#/" class="brand">${logo()}</a>`}
    <div class="topbar-title">${title || ''}</div>
    ${actions}
    ${!back ? html`<button class="icon-btn" data-logout-top aria-label="Выйти" title="Выйти (${me.name})">${icon('logout')}</button>` : ''}`);
  top.querySelector('[data-logout-top]')?.addEventListener('click', logout);
  document.title = `${title ? title + ' — ' : ''}«Нур»`;
}

let renderToken = 0;
async function render() {
  if (!state.me) {
    const me = await api('/api/auth/me').catch(() => ({ guest: true }));
    if (me.guest) return loginScreen(me);
    state.me = me;
  }
  if (!document.getElementById('main')) shell();
  const path = (location.hash.slice(1) || '/').split('?')[0];
  const query = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
  const route = ROUTES.find((r) => r.re.test(path));
  const main = document.getElementById('main');
  const token = ++renderToken;

  document.querySelectorAll('[data-path]').forEach((a) => {
    const p = a.dataset.path;
    a.classList.toggle('active', p === '/' ? path === '/' : path === p || path.startsWith(p + '/'));
  });
  const moreLink = document.querySelector('.bottom-nav [data-path="/more"]');
  if (moreLink) moreLink.classList.toggle('active', (MORE[state.me.role] || []).some(([p]) => path === p || path.startsWith(p + '/')) || path === '/more');

  const el = document.createElement('div');
  el.className = 'page';
  if (!route || (route.roles && !route.roles.includes(state.me.role))) {
    setTop({ title: 'Нет доступа', back: '/' });
    el.innerHTML = String(html`<div class="card empty">${icon('alert')}<p>Этот раздел вам недоступен.</p></div>`);
    main.replaceChildren(el);
    return;
  }
  const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(path.match(route.re)[i + 1])]));
  if (!window.__keepScroll) main.innerHTML = '<div class="loading">Загрузка…</div>';
  try {
    const mod = await import(`./views/${route.mod}.js`);
    await mod[route.fn]({ el, params, query, me: state.me, isCurrent: () => token === renderToken });
    if (token !== renderToken) return;
    main.replaceChildren(el);
    if (!window.__keepScroll) window.scrollTo(0, 0);
    window.__keepScroll = false;
  } catch (e) {
    if (token !== renderToken) return;
    console.error(e);
    el.innerHTML = String(html`<div class="card empty">${icon('alert')}<p>${e.message}</p><p><a href="#/">На главную</a></p></div>`);
    main.replaceChildren(el);
  }
}

window.addEventListener('hashchange', render);
window.addEventListener('nur:logout', () => loginScreen({}));
render();

export { esc, go };
