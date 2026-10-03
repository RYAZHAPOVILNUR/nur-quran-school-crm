// Девять сценариев приёмки заказчика + проверки прав на сервере.
// Запуск: npm test (поднимает сервер на временной базе, рабочие данные не трогает).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nur-test-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.NO_BACKUP = '1';

const { start } = await import('../server/index.js');
const { today } = await import('../server/util.js');
let server, base;

before(async () => {
  server = await start(0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

// Клиент с собственной сессией (cookie) — как отдельный телефон.
async function as(login) {
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };
  const r = await call('POST', '/api/auth/demo', { login });
  assert.equal(r.status, 200, `вход ${login}`);
  return {
    me: r.data,
    get: (u) => call('GET', u),
    post: (u, b = {}) => call('POST', u, b),
    put: (u, b = {}) => call('PUT', u, b),
  };
}

const groupBy = async (client, name) => (await client.get('/api/groups')).data.find((g) => g.name.startsWith(name));

test('1. Заявка → пробный урок → ученик группы «Хифз»', async () => {
  const maryam = await as('maryam');
  const lead = await maryam.post('/api/leads', { name: 'Билял Тестов', age: 10, gender: 'm', contact_name: 'Ринат Тестов', phone: '+7 900 111-22-33', interest: 'hifz', source: 'instagram' });
  assert.equal(lead.status, 200);
  const id = lead.data.id;
  assert.equal((await maryam.post(`/api/leads/${id}/status`, { status: 'contacted' })).status, 200);
  const hifz = await groupBy(maryam, 'Хифз · мальчики');
  assert.equal((await maryam.post(`/api/leads/${id}/status`, { status: 'trial_scheduled', trial_date: today(), trial_group_id: hifz.id })).status, 200);
  assert.equal((await maryam.post(`/api/leads/${id}/status`, { status: 'trial_done' })).status, 200);
  const conv = await maryam.post(`/api/leads/${id}/convert`, { group_id: hifz.id });
  assert.equal(conv.status, 200, JSON.stringify(conv.data));
  assert.equal(conv.data.status, 'active');
  const st = await maryam.get(`/api/students/${conv.data.id}`);
  assert.equal(st.data.student.group_id, hifz.id);
  assert.equal(st.data.student.status, 'active');
  const l = await maryam.get(`/api/leads/${id}`);
  assert.equal(l.data.lead.status, 'enrolled');
  assert.equal(l.data.events.length, 5);
});

test('2. Девочку нельзя записать в мужскую группу', async () => {
  const owner = await as('abdullah');
  const male = await groupBy(owner, 'Хифз · мальчики');
  const girls = (await owner.get('/api/students?status=active&q=Фатима')).data;
  const girl = girls.find((s) => s.gender === 'f');
  const r = await owner.post(`/api/students/${girl.id}/group`, { group_id: male.id });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /только мальчики и мужчины/);
  const created = await owner.post('/api/students', { name: 'Сафия Проверка', gender: 'f', age: 9, group_id: male.id, family: { name: 'Мама', phone: '+7 900 000-00-01' } });
  assert.equal(created.status, 400);
  // Учитель-мужчина не может вести группу девочек.
  const yusuf = (await owner.get('/api/teachers')).data.find((t) => t.name.startsWith('Юсуф'));
  const g = await owner.post('/api/groups', { name: 'Тест', direction: 'hifz', gender: 'f', format: 'offline', capacity: 5, teacher_id: yusuf.id });
  assert.equal(g.status, 400);
});

test('3. Учитель отмечает посещаемость своей группы одним действием', async () => {
  const yusuf = await as('yusuf');
  const groups = (await yusuf.get('/api/groups')).data;
  assert.ok(groups.length >= 1 && groups.every((g) => g.teacher_name.startsWith('Юсуф')), 'видит только свои группы');
  const g = groups.find((x) => x.name.startsWith('Хифз · мальчики'));
  const att = await yusuf.get(`/api/groups/${g.id}/attendance?date=${today()}`);
  assert.equal(att.status, 200);
  const marks = att.data.students.map((s, i) => ({ student_id: s.id, status: i === 0 ? 'late' : 'present' }));
  const t0 = Date.now();
  const save = await yusuf.post(`/api/groups/${g.id}/attendance`, { date: today(), marks });
  assert.equal(save.status, 200);
  assert.ok(Date.now() - t0 < 2000);
  const again = await yusuf.get(`/api/groups/${g.id}/attendance?date=${today()}`);
  assert.equal(again.data.students.filter((s) => s.mark).length, marks.length);
  // Чужую группу отметить нельзя.
  const aishaGroup = (await (await as('abdullah')).get('/api/groups')).data.find((x) => x.name.startsWith('Хифз · девочки'));
  assert.equal((await yusuf.post(`/api/groups/${aishaGroup.id}/attendance`, { date: today(), marks: [] })).status, 403);
});

test('4. Сдача суры сразу меняет прогресс ученика', async () => {
  const yusuf = await as('yusuf');
  const student = (await yusuf.get('/api/students')).data.find((s) => s.direction === 'hifz' && s.status === 'active');
  const before = (await yusuf.get(`/api/students/${student.id}`)).data.hifz;
  const page = before.next_page;
  const r = await yusuf.post(`/api/students/${student.id}/hifz`, { type: 'new', page_from: page, page_to: page, grade: 'excellent', next_task: 'Следующая страница' });
  assert.equal(r.status, 200);
  assert.equal(r.data.progress.pages, before.pages + 1);
  const after = (await yusuf.get(`/api/students/${student.id}`)).data.hifz;
  assert.equal(after.last_new.page_from, page);
  assert.equal(after.last_new.next_task, 'Следующая страница');
  // Сдача суры целиком: страницы подставляются по номеру суры.
  const surah = await yusuf.post(`/api/students/${student.id}/hifz`, { type: 'review', surah: 67, grade: 'errors' });
  assert.equal(surah.status, 200);
});

test('5. Учитель не видит денег школы и чужих учеников', async () => {
  const yusuf = await as('yusuf');
  for (const url of ['/api/payments', '/api/money/debtors', '/api/finance', '/api/salary', '/api/families', '/api/leads', '/api/settings', '/api/backup']) {
    assert.equal((await yusuf.get(url)).status, 403, url);
  }
  const owner = await as('abdullah');
  const aishaStudent = (await owner.get('/api/students')).data.find((s) => s.teacher_name?.startsWith('Аиша'));
  assert.equal((await yusuf.get(`/api/students/${aishaStudent.id}`)).status, 403);
  const own = (await yusuf.get('/api/students')).data;
  assert.ok(own.every((s) => s.teacher_name.startsWith('Юсуф')));
  assert.ok(own.every((s) => s.debt === undefined));
  const card = (await yusuf.get(`/api/students/${own[0].id}`)).data;
  assert.equal(card.money, undefined);
  assert.equal(card.student.is_free, undefined, 'садака скрыта от учителя');
  const dash = (await yusuf.get('/api/dashboard')).data;
  assert.equal(dash.money, undefined);
  const teachers = (await yusuf.get('/api/teachers')).data;
  assert.ok(teachers.every((t) => t.rate === undefined), 'ставки учителей скрыты');
});

test('6. Оплата за двоих детей: скидка второму ребёнку считается сама', async () => {
  const maryam = await as('maryam');
  const reading = await groupBy(maryam, 'Таджвид · мужчины');
  const hifzGirls = await groupBy(maryam, 'Хифз · девочки');
  const first = await maryam.post('/api/students', { name: 'Ахмед Семейный', gender: 'm', age: 16, group_id: reading.id, family: { name: 'Отец Семейный', phone: '+7 900 555-44-33' } });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const second = await maryam.post('/api/students', { name: 'Амина Семейная', gender: 'f', age: 11, group_id: hifzGirls.id, family_id: first.data.family_id });
  assert.equal(second.status, 200, JSON.stringify(second.data));
  const bill = (await maryam.get(`/api/families/${first.data.family_id}/billing`)).data;
  const [a, b] = bill.children;
  assert.equal(a.price.amount, 4000);
  assert.equal(b.price.amount, 3600);
  assert.equal(b.price.discount_pct, 10);
  const month = today().slice(0, 7);
  const pay = await maryam.post('/api/payments', {
    family_id: first.data.family_id, method: 'cash',
    items: [{ student_id: a.id, month, amount: a.price.amount }, { student_id: b.id, month, amount: b.price.amount }],
  });
  assert.equal(pay.status, 200);
  assert.equal(pay.data.total, 7600);
  const fam = (await maryam.get(`/api/families/${first.data.family_id}`)).data;
  assert.equal(fam.debt, 0);
  assert.equal(fam.payments.length, 2);
});

test('7. «Кто должен» и вежливое напоминание', async () => {
  const maryam = await as('maryam');
  const d = (await maryam.get('/api/money/debtors')).data;
  assert.ok(d.list.length >= 3);
  const top = d.list[0];
  assert.ok(top.debt > 0 && top.months_count >= 1);
  const r = (await maryam.get(`/api/families/${top.id}/reminder`)).data;
  assert.match(r.text, /^Ассаляму алейкум, /);
  assert.ok(r.text.includes(top.name.split(' ')[0]));
  assert.match(r.text, /Мягко напоминаем/);
  assert.match(r.text, /Если вы уже оплатили/);
  assert.equal((await maryam.post(`/api/families/${top.id}/reminder`, { channel: 'copy' })).status, 200);
});

test('8. Главный экран владельца: всё нужное одним запросом', async () => {
  const owner = await as('abdullah');
  const d = (await owner.get('/api/dashboard')).data;
  assert.ok(d.students.active >= 60);
  assert.ok(d.students.new_month >= 1);
  assert.ok(d.money.income_month > 0);
  assert.ok(d.money.debt > 0);
  assert.equal(d.money.chart.length, 6);
  assert.ok(d.alerts.some((a) => a.streak >= 3), 'есть ученик с тремя пропусками подряд');
  assert.ok(d.new_leads.length >= 1);
  assert.ok(d.juz_week.length >= 1, 'кто-то закончил джуз на этой неделе');
  assert.equal(typeof d.money.profit, 'number');
  // Администратору прибыль и зарплаты не показываются.
  const admin = (await (await as('maryam')).get('/api/dashboard')).data;
  assert.equal(admin.money.profit, undefined);
  assert.equal(admin.money.salaries, undefined);
});

test('9. Зарплата учителей за месяц', async () => {
  const owner = await as('abdullah');
  const month = today().slice(0, 7);
  const prev = (await owner.get(`/api/salary?month=${month.slice(0, 4)}-${String(Number(month.slice(5)) - 1 || 12).padStart(2, '0')}`)).data;
  assert.equal(prev.list.length, 4);
  for (const t of prev.list) {
    assert.equal(t.amount, t.lessons * t.rate);
    assert.ok(t.lessons > 0);
  }
  assert.equal((await (await as('maryam')).get('/api/salary')).status, 403);
  assert.equal((await (await as('maryam')).get('/api/finance')).status, 403);
});

test('Каникулы: за отмеченный месяц абонемент не берётся', async () => {
  const owner = await as('abdullah');
  const month = today().slice(0, 7);
  const group = await groupBy(owner, 'Таджвид · сёстры');
  const before = (await owner.get('/api/money/debtors')).data.total;
  const r = await owner.post('/api/months-off', { month, group_id: group.id, reason: 'Учительница в отъезде' });
  assert.equal(r.status, 200);
  const g = (await owner.get(`/api/groups/${group.id}`)).data.group;
  assert.ok(g.paused_month);
  const after = (await owner.get('/api/money/debtors')).data.total;
  assert.ok(after.upcoming < before.upcoming);
  assert.equal((await owner.post(`/api/months-off/${r.data.id}/cancel`)).status, 200);
});

test('Ничего не удаляется: ушедший ученик остаётся с историей', async () => {
  const owner = await as('abdullah');
  const s = (await owner.get('/api/students?status=active')).data.find((x) => x.direction === 'tajweed');
  assert.equal((await owner.post(`/api/students/${s.id}/status`, { status: 'left' })).status, 400, 'без причины нельзя');
  assert.equal((await owner.post(`/api/students/${s.id}/status`, { status: 'left', reason: 'Переезд' })).status, 200);
  const card = (await owner.get(`/api/students/${s.id}`)).data;
  assert.equal(card.student.status, 'left');
  assert.ok(card.status_log.length >= 2);
  assert.ok(card.attendance.length > 0);
  const del = await fetch(`${base}/api/students/${s.id}`, { method: 'DELETE' });
  assert.equal(del.status, 404);
});

test('Без входа данные недоступны', async () => {
  const r = await fetch(`${base}/api/students`);
  assert.equal(r.status, 401);
  const csrf = await fetch(`${base}/api/auth/login`, { method: 'POST', body: 'login=x', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(csrf.status, 415);
});
