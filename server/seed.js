// Демо-данные школы «Нур»: правдоподобная картина на сегодняшний день.
import { db, run, get, all, tx } from './db.js';
import { hashPassword } from './auth.js';
import { today, addDays, addMonths, monthOf, weekday, weekStart, currentMonth } from './util.js';
import { subscriptionPricing, syncCharges } from './billing.js';
import { addRecord } from './hifz.js';
import { HIFZ_ORDER, surahAtPage } from '../shared/quran.js';

// Детерминированный генератор случайных чисел: демо одинаковое при каждом сбросе.
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const female = (surname) => (/(ов|ев|ин)$/.test(surname) ? surname + 'а' : surname);

const TEACHERS = [
  { key: 'yusuf', name: 'Юсуф Ахмадов', gender: 'm', phone: '+7 928 100-20-01', rate: 700 },
  { key: 'ibragim', name: 'Ибрагим Магомедов', gender: 'm', phone: '+7 928 100-20-02', rate: 600 },
  { key: 'abdurahman', name: 'Абдурахман Исмаилов', gender: 'm', phone: '+7 928 100-20-03', rate: 650 },
  { key: 'aisha', name: 'Аиша Каримова', gender: 'f', phone: '+7 928 100-20-04', rate: 650 },
];

// d: 1 = Пн … 7 = Вс
const GROUPS = [
  { key: 'G1', name: 'Хифз · мальчики', direction: 'hifz', gender: 'm', teacher: 'yusuf', format: 'offline', capacity: 12, schedule: [{ d: 1, t: '16:00' }, { d: 3, t: '16:00' }, { d: 6, t: '10:00' }] },
  { key: 'G2', name: 'Хифз · мужчины (онлайн)', direction: 'hifz', gender: 'm', teacher: 'yusuf', format: 'online', capacity: 8, schedule: [{ d: 2, t: '20:00' }, { d: 4, t: '20:00' }] },
  { key: 'G3', name: 'Чтение с нуля · мальчики 7–10 лет', direction: 'reading', gender: 'm', teacher: 'ibragim', format: 'offline', capacity: 10, schedule: [{ d: 2, t: '16:00' }, { d: 4, t: '16:00' }, { d: 6, t: '12:00' }] },
  { key: 'G4', name: 'Таджвид · мужчины', direction: 'tajweed', gender: 'm', teacher: 'ibragim', format: 'offline', capacity: 12, schedule: [{ d: 6, t: '18:00' }, { d: 7, t: '18:00' }] },
  { key: 'G5', name: 'Чтение с нуля · мужчины (онлайн)', direction: 'reading', gender: 'm', teacher: 'abdurahman', format: 'online', capacity: 10, schedule: [{ d: 1, t: '20:30' }, { d: 4, t: '20:30' }] },
  { key: 'G6', name: 'Хифз · девочки', direction: 'hifz', gender: 'f', teacher: 'aisha', format: 'offline', capacity: 10, schedule: [{ d: 2, t: '15:00' }, { d: 4, t: '15:00' }, { d: 6, t: '15:00' }] },
  { key: 'G7', name: 'Таджвид · сёстры (онлайн)', direction: 'tajweed', gender: 'f', teacher: 'aisha', format: 'online', capacity: 12, schedule: [{ d: 1, t: '11:00' }, { d: 3, t: '11:00' }] },
  { key: 'G8', name: 'Индивидуально · хифз', direction: 'individual', gender: 'm', teacher: 'abdurahman', format: 'offline', capacity: 4, schedule: [{ d: 6, t: '10:00' }, { d: 7, t: '10:00' }] },
];

// Семьи: родитель и дети [имя, пол, возраст, группа, опции]
const FAMILIES = [
  { surname: 'Алиев', parent: 'Руслан Алиев', phone: '+7 928 512-34-01', telegram: '@ruslan_aliev', source: 'mosque',
    kids: [['Мухаммад', 'm', 12, 'G1', { hifz: 64 }], ['Фатима', 'f', 10, 'G6', { hifz: 30 }], ['Умар', 'm', 8, 'G3']] },
  { surname: 'Магомедов', parent: 'Патимат Магомедова', phone: '+7 928 512-34-02', whatsapp: '+7 928 512-34-02', source: 'friends',
    kids: [['Ахмад', 'm', 11, 'G1', { hifz: 43, juzThisWeek: true }], ['Хадиджа', 'f', 9, 'G6', { hifz: 23, juzThisWeek: true }]] },
  { surname: 'Гасанов', parent: 'Шамиль Гасанов', phone: '+7 928 512-34-03', telegram: '@shamil_g', source: 'mosque', debt: 'three',
    kids: [['Билал', 'm', 13, 'G1', { hifz: 92 }], ['Ибрахим', 'm', 9, 'G3'], ['Зайнаб', 'f', 7, 'G6', { hifz: 9 }]] },
  { surname: 'Исмаилов', parent: 'Заира Исмаилова', phone: '+7 928 512-34-04', whatsapp: '+7 928 512-34-04', source: 'instagram', debt: 'one',
    kids: [['Хамза', 'm', 10, 'G1', { hifz: 18 }], ['Амина', 'f', 12, 'G6', { hifz: 52 }]] },
  { surname: 'Хасанов', parent: 'Тимур Хасанов', phone: '+7 928 512-34-05', whatsapp: '+7 928 512-34-05', source: 'friends',
    kids: [['Умар', 'm', 9, 'G3', { absent3: true }], ['Сафия', 'f', 11, 'G6', { hifz: 36 }]] },
  { surname: 'Юсупов', parent: 'Ильдар Юсупов', phone: '+7 928 512-34-06', telegram: '@ildar_yu', source: 'site', debt: 'partial',
    kids: [['Абдуллах', 'm', 12, 'G1', { hifz: 27 }], ['Исмаил', 'm', 8, 'G3']] },
  { surname: 'Курбанов', parent: 'Мадина Курбанова', phone: '+7 928 512-34-07', whatsapp: '+7 928 512-34-07', source: 'mosque',
    kids: [['Яхья', 'm', 10, 'G1', { hifz: 14 }], ['Марьям', 'f', 8, 'G6', { hifz: 6 }], ['Муса', 'm', 7, 'G3', { waiting: true }]] },
  { surname: 'Сафаров', parent: 'Рустам Сафаров', phone: '+7 928 512-34-08', telegram: '@rustam_safarov', source: 'friends',
    kids: [['Салих', 'm', 11, 'G8', { hifz: 48 }], ['Асия', 'f', 13, 'G6', { hifz: 71 }]] },
  { surname: 'Закиров', parent: 'Айгуль Закирова', phone: '+7 928 512-34-09', whatsapp: '+7 928 512-34-09', source: 'instagram', debt: 'two',
    kids: [['Хасан', 'm', 7, 'G3'], ['Хусейн', 'm', 7, 'G3']] },
  { surname: 'Омаров', parent: 'Арслан Омаров', phone: '+7 928 512-34-10', telegram: '@arslan_omarov', source: 'mosque',
    kids: [['Халид', 'm', 12, 'G1', { hifz: 33 }], ['Сулейман', 'm', 10, 'G1', { paused: 'Уехали к родственникам до ноября', hifz: 11 }]] },
  { surname: 'Рахимов', parent: 'Эльвира Рахимова', phone: '+7 928 512-34-11', whatsapp: '+7 928 512-34-11', source: 'site',
    kids: [['Анас', 'm', 10, 'G1', { hifz: 21 }]] },
  { surname: 'Нуриев', parent: 'Рамиль Нуриев', phone: '+7 928 512-34-12', telegram: '@ramil_nur', source: 'friends',
    kids: [['Идрис', 'm', 11, 'G1', { hifz: 39 }], ['Айша', 'f', 13, 'G6', { finished: 'Закончила курс, продолжает хифз в медресе' }]] },
  { surname: 'Шарипов', parent: 'Хадижат Шарипова', phone: '+7 928 512-34-13', whatsapp: '+7 928 512-34-13', source: 'mosque',
    kids: [['Закария', 'm', 13, 'G1', { hifz: 58, free: 'Сирота, обучение за счёт школы' }]] },
  { surname: 'Мамедов', parent: 'Эльчин Мамедов', phone: '+7 928 512-34-14', telegram: '@elchin_m', source: 'instagram',
    kids: [['Адам', 'm', 7, 'G3', { newThisMonth: true }]] },
  { surname: 'Ахмедов', parent: 'Залина Ахмедова', phone: '+7 928 512-34-15', whatsapp: '+7 928 512-34-15', source: 'friends',
    kids: [['Ильяс', 'm', 8, 'G3']] },
  { surname: 'Байрамов', parent: 'Тагир Байрамов', phone: '+7 928 512-34-16', telegram: '@tagir_b', source: 'mosque',
    kids: [['Али', 'm', 9, 'G3']] },
  { surname: 'Халилов', parent: 'Сабина Халилова', phone: '+7 928 512-34-17', whatsapp: '+7 928 512-34-17', source: 'site',
    kids: [['Рамазан', 'm', 8, 'G3']] },
  { surname: 'Садыков', parent: 'Ринат Садыков', phone: '+7 928 512-34-18', telegram: '@rinat_sadykov', source: 'instagram',
    kids: [['Абубакр', 'm', 8, 'G3', { waiting: true }], ['Амир', 'm', 15, 'G4', { finished: 'Закончил курс таджвида' }]] },
  { surname: 'Каримов', parent: 'Лиана Каримова', phone: '+7 928 512-34-19', whatsapp: '+7 928 512-34-19', source: 'friends',
    kids: [['Хафса', 'f', 10, 'G6', { hifz: 15 }]] },
  { surname: 'Валиев', parent: 'Гульнара Валиева', phone: '+7 928 512-34-20', whatsapp: '+7 928 512-34-20', source: 'mosque',
    kids: [['Сумайя', 'f', 12, 'G6', { hifz: 26, free: 'Семье сейчас трудно — садака' }], ['Тимур', 'm', 9, 'G3', { left: 'Переезд в другой город' }]] },
  { surname: 'Гаджиев', parent: 'Магомед Гаджиев', phone: '+7 928 512-34-21', telegram: '@m_gadzhiev', source: 'friends',
    kids: [['Тимур', 'm', 15, 'G8', { hifz: 37 }]] },
];

// Взрослые ученики платят сами: [имя, фамилия, пол, возраст, группа, источник, опции]
const ADULTS = [
  ['Ислам', 'Мусаев', 'm', 28, 'G2', 'instagram', { hifz: 46 }],
  ['Абдурахман', 'Курбанов', 'm', 41, 'G2', 'mosque', { hifz: 88 }],
  ['Руслан', 'Нуриев', 'm', 33, 'G2', 'friends', { hifz: 25 }],
  ['Арсен', 'Омаров', 'm', 25, 'G2', 'site', { hifz: 12, debt: 'one' }],
  ['Камиль', 'Сафаров', 'm', 38, 'G2', 'friends', { hifz: 61 }],
  ['Ибрагим', 'Халилов', 'm', 45, 'G2', 'mosque', { hifz: 31 }],
  ['Магомед', 'Гаджиев', 'm', 52, 'G4', 'mosque', {}],
  ['Шамиль', 'Абдуллаев', 'm', 30, 'G4', 'friends', {}],
  ['Рашид', 'Каримов', 'm', 36, 'G4', 'instagram', { debt: 'two' }],
  ['Эльдар', 'Ахмедов', 'm', 29, 'G4', 'site', {}],
  ['Артур', 'Валиев', 'm', 24, 'G4', 'instagram', { absent2: true }],
  ['Марат', 'Шарипов', 'm', 40, 'G4', 'mosque', {}],
  ['Аслан', 'Рахимов', 'm', 31, 'G4', 'friends', {}],
  ['Ренат', 'Закиров', 'm', 47, 'G4', 'mosque', {}],
  ['Рустам', 'Ибрагимов', 'm', 37, 'G4', 'friends', { paused: 'Болеет, вернётся после лечения' }],
  ['Абдуллах', 'Волков', 'm', 34, 'G5', 'site', {}],
  ['Тагир', 'Мамедов', 'm', 27, 'G5', 'instagram', {}],
  ['Анзор', 'Байрамов', 'm', 39, 'G5', 'friends', {}],
  ['Рамиль', 'Садыков', 'm', 44, 'G5', 'mosque', {}],
  ['Азат', 'Нуриев', 'm', 22, 'G5', 'site', { newThisMonth: true }],
  ['Карим', 'Халилов', 'm', 50, 'G5', 'friends', {}],
  ['Арслан', 'Халилов', 'm', 30, 'G5', 'instagram', { left: 'Не подходит время занятий' }],
  ['Махмуд', 'Абдуллаев', 'm', 34, 'G8', 'mosque', { hifz: 19 }],
  ['Лейла', 'Гасанова', 'f', 31, 'G7', 'friends', {}],
  ['Мадина', 'Омарова', 'f', 26, 'G7', 'instagram', {}],
  ['Камила', 'Юсупова', 'f', 35, 'G7', 'mosque', {}],
  ['Алина', 'Ахмедова', 'f', 29, 'G7', 'instagram', { debt: 'one' }],
  ['Сабина', 'Мамедова', 'f', 42, 'G7', 'friends', {}],
  ['Ясмина', 'Рахимова', 'f', 24, 'G7', 'instagram', { newThisMonth: true }],
  ['Халима', 'Абдуллаева', 'f', 38, 'G7', 'site', {}],
  ['Эльмира', 'Каримова', 'f', 33, 'G7', 'friends', {}],
];

const USERS = [
  ['abdullah', 'Абдуллах', 'owner', 'nur-owner', null],
  ['maryam', 'Марьям', 'admin', 'nur-admin', null],
  ['yusuf', 'Юсуф', 'teacher', 'nur-teacher', 'yusuf'],
  ['ibragim', 'Ибрагим', 'teacher', 'nur-teacher', 'ibragim'],
  ['abdurahman', 'Абдурахман', 'teacher', 'nur-teacher', 'abdurahman'],
  ['aisha', 'Аиша', 'teacher', 'nur-teacher', 'aisha'],
];

export function seed() {
  const rand = rng(20261003);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const TODAY = today();
  const CUR = currentMonth();
  const YEAR = Number(TODAY.slice(0, 4));
  const FIRST_MONTH = addMonths(CUR, -5);
  const ATT_FROM = addDays(TODAY, -91);
  const dayIn = (month, day) => `${month}-${String(day).padStart(2, '0')}`;
  const curDay = Number(TODAY.slice(8, 10));

  tx(() => {
    for (const [k, v] of Object.entries({ school_name: 'Школа Корана «Нур»', price_group: 4000, price_individual: 1200, sibling_discount: 10, due_day: 10, late_join_day: 20 })) {
      run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', k, String(v));
    }

    const T = {};
    for (const t of TEACHERS) {
      T[t.key] = Number(run('INSERT INTO teachers (name, gender, phone, rate) VALUES (?, ?, ?, ?)', t.name, t.gender, t.phone, t.rate).lastInsertRowid);
    }
    const userIds = {};
    for (const [login, name, role, pass, tkey] of USERS) {
      userIds[login] = Number(run('INSERT INTO users (login, name, role, password_hash, teacher_id) VALUES (?, ?, ?, ?, ?)',
        login, name, role, hashPassword(pass), tkey ? T[tkey] : null).lastInsertRowid);
    }
    const maryam = userIds.maryam;

    const G = {};
    const GDEF = {};
    for (const g of GROUPS) {
      G[g.key] = Number(run('INSERT INTO groups (name, direction, gender, teacher_id, format, capacity, schedule) VALUES (?, ?, ?, ?, ?, ?, ?)',
        g.name, g.direction, g.gender, T[g.teacher], g.format, g.capacity, JSON.stringify(g.schedule)).lastInsertRowid);
      GDEF[G[g.key]] = g;
    }

    // ---------- Ученики ----------
    const students = [];
    const addStudent = (familyId, name, gender, age, groupKey, source, opts = {}) => {
      let start;
      if (opts.newThisMonth) start = dayIn(CUR, Math.min(2, curDay));
      else start = addDays(dayIn(addMonths(CUR, -(7 + Math.floor(rand() * 20))), 1), Math.floor(rand() * 25));
      let status = 'active', reason = null, changed = start;
      if (opts.waiting) { status = 'waiting'; reason = `Ждёт место в группе «${GDEF[G[groupKey]].name}»`; start = addDays(TODAY, -12); changed = start; }
      if (opts.paused) { status = 'paused'; reason = opts.paused; changed = dayIn(addMonths(CUR, -1), 5); }
      if (opts.finished) { status = 'finished'; reason = opts.finished; changed = dayIn(addMonths(CUR, -2), 28); }
      if (opts.left) { status = 'left'; reason = opts.left; changed = dayIn(addMonths(CUR, -2), 14); }
      const id = Number(run(`INSERT INTO students (name, gender, birth_year, family_id, group_id, status, status_reason, status_changed_at, start_date, source, is_free, free_reason, created_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      name, gender, YEAR - age, familyId, opts.waiting ? null : G[groupKey], status, reason, changed, start, source,
      opts.free ? 1 : 0, opts.free || null, start + ' 10:00:00').lastInsertRowid);
      run('INSERT INTO student_status_log (student_id, from_status, to_status, reason, user_id, created_at) VALUES (?, NULL, ?, ?, ?, ?)',
        id, 'active', 'Записан в группу', maryam, start + ' 10:00:00');
      if (status !== 'active') {
        run('INSERT INTO student_status_log (student_id, from_status, to_status, reason, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          id, 'active', status, reason, maryam, changed + ' 12:00:00');
      }
      if (opts.waiting) run('INSERT INTO waitlist (student_id, group_id, created_at) VALUES (?, ?, ?)', id, G[groupKey], start + ' 11:00:00');
      students.push({ id, familyId, name, gender, groupId: G[groupKey], groupKey, start, status, changed, opts });
      return id;
    };

    const families = [];
    for (const f of FAMILIES) {
      const fid = Number(run('INSERT INTO families (name, phone, telegram, whatsapp, is_self) VALUES (?, ?, ?, ?, 0)',
        f.parent, f.phone, f.telegram || null, f.whatsapp || null).lastInsertRowid);
      families.push({ id: fid, debt: f.debt });
      for (const [name, gender, age, gk, opts] of f.kids) {
        addStudent(fid, `${name} ${gender === 'f' ? female(f.surname) : f.surname}`, gender, age, gk, f.source, opts || {});
      }
    }
    for (const [name, surname, gender, age, gk, source, opts] of ADULTS) {
      const n = Math.floor(rand() * 900) + 100;
      const phone = `+7 9${gender === 'm' ? '64' : '89'} ${n}-${String(10 + Math.floor(rand() * 89))}-${String(10 + Math.floor(rand() * 89))}`;
      const fid = Number(run('INSERT INTO families (name, phone, telegram, whatsapp, is_self) VALUES (?, ?, ?, ?, 1)',
        `${name} ${surname}`, phone, rand() > 0.5 ? `@${surname.toLowerCase().replace(/[^a-z]/g, '') || 'user'}${n}` : null, rand() > 0.4 ? phone : null).lastInsertRowid);
      families.push({ id: fid, debt: opts.debt });
      addStudent(fid, `${name} ${surname}`, gender, age, gk, source, opts);
    }
    // Латиница для telegram-ников взрослых.
    for (const f of all("SELECT id, telegram FROM families WHERE telegram LIKE '@user%'")) {
      run('UPDATE families SET telegram = ? WHERE id = ?', `@nur_student${f.id}`, f.id);
    }

    // ---------- Посещаемость за 3 месяца ----------
    const lessonDates = new Map(); // groupId -> [date]
    for (const g of GROUPS) {
      const gid = G[g.key];
      const days = new Set(g.schedule.map((s) => s.d));
      const dates = [];
      for (let d = ATT_FROM; d < TODAY; d = addDays(d, 1)) if (days.has(weekday(d))) dates.push(d);
      lessonDates.set(gid, dates);
    }
    const activeOn = (s, date) => {
      if (s.status === 'waiting') return false;
      if (date < s.start) return false;
      if (s.status !== 'active' && date >= s.changed) return false;
      return true;
    };
    const individualDay = new Map(); // ученик индивидуальных занятий занимается раз в неделю в свой день
    students.filter((s) => GDEF[s.groupId]?.direction === 'individual').forEach((s, i) => individualDay.set(s.id, i % 2 === 0 ? 6 : 7));

    for (const g of GROUPS) {
      const gid = G[g.key];
      const dates = lessonDates.get(gid);
      const members = students.filter((s) => s.groupId === gid);
      dates.forEach((date, idx) => {
        const present = members.filter((s) => activeOn(s, date) && (g.direction !== 'individual' || individualDay.get(s.id) === weekday(date)));
        if (!present.length) return;
        // Замена: в середине периода у Ибрагима одну неделю уроки вёл Абдурахман.
        let teacher = T[g.teacher];
        if (g.teacher === 'ibragim' && idx >= 14 && idx <= 15) teacher = T.abdurahman;
        const lessonId = Number(run('INSERT INTO lessons (group_id, date, teacher_id, created_by, created_at) VALUES (?, ?, ?, ?, ?)',
          gid, date, teacher, userIds[g.teacher], date + ' 19:00:00').lastInsertRowid);
        const fromEnd = dates.length - idx; // 1 = последний урок
        for (const s of present) {
          let st;
          const x = rand();
          st = x < 0.84 ? 'present' : x < 0.91 ? 'late' : x < 0.96 ? 'excused' : 'absent';
          if (s.opts.absent3 && fromEnd <= 3) st = 'absent';
          if (s.opts.absent2 && fromEnd <= 2) st = 'absent';
          if (s.opts.absent2 && fromEnd === 3) st = 'present';
          run('INSERT INTO attendance (lesson_id, student_id, status) VALUES (?, ?, ?)', lessonId, s.id, st);
          if (g.direction === 'individual' && (st === 'present' || st === 'late')) {
            run(`INSERT INTO charges (student_id, family_id, month, kind, lesson_id, base_amount, amount, created_at)
                 VALUES (?, ?, ?, 'lesson', ?, 1200, 1200, ?)`, s.id, s.familyId, monthOf(date), lessonId, date + ' 19:00:00');
          }
        }
      });
    }
    // Случайно получившиеся «три пропуска подряд» у других учеников убираем: в демо пропадает ровно один ученик.
    for (const s of students) {
      if (s.opts.absent3) continue;
      const last = all(`SELECT a.id, a.status FROM attendance a JOIN lessons l ON l.id = a.lesson_id WHERE a.student_id = ? ORDER BY l.date DESC LIMIT 3`, s.id);
      if (last.length === 3 && last.every((a) => a.status === 'absent')) run("UPDATE attendance SET status = 'present' WHERE id = ?", last[0].id);
    }

    // ---------- Начисления за полгода ----------
    // Для истории считаем по сегодняшнему составу семей: у кого было больше детей в прошлом, сейчас это не важно для демо.
    const pricing = subscriptionPricing();
    for (let i = 5; i >= 0; i--) {
      const m = addMonths(CUR, -i);
      for (const s of students) {
        const g = GDEF[s.groupId];
        if (!g || g.direction === 'individual' || s.status === 'waiting') continue;
        const firstMonth = Number(s.start.slice(8, 10)) <= 20 ? monthOf(s.start) : addMonths(monthOf(s.start), 1);
        if (m < firstMonth) continue;
        if (s.status !== 'active' && m > monthOf(s.changed)) continue;
        if (s.status === 'paused' && m === monthOf(s.changed)) continue;
        const pr = pricing.get(s.id) || { base: 4000, discount_pct: 0, amount: 4000, waived: s.opts.free ? 1 : 0 };
        run(`INSERT INTO charges (student_id, family_id, month, kind, base_amount, discount_pct, amount, waived, created_at)
             VALUES (?, ?, ?, 'subscription', ?, ?, ?, ?, ?)`, s.id, s.familyId, m, pr.base, pr.discount_pct, pr.amount, pr.waived, m + '-01 06:00:00');
      }
    }

    // ---------- Оплаты ----------
    // debt: 'one' — не оплачен прошлый месяц; 'two' — два месяца; 'three' — три месяца без оплаты; 'partial' — прошлый оплачен частично.
    const famDebt = new Map(families.map((f) => [f.id, f.debt]));
    const charges = all(`SELECT c.student_id, c.family_id, c.month, SUM(c.amount) AS amount FROM charges c
                         WHERE c.canceled = 0 AND c.waived = 0 GROUP BY c.student_id, c.month ORDER BY c.month`);
    for (const c of charges) {
      const debt = famDebt.get(c.family_id);
      const back = (Number(CUR.slice(0, 4)) - Number(c.month.slice(0, 4))) * 12 + Number(CUR.slice(5, 7)) - Number(c.month.slice(5, 7));
      let amount = c.amount;
      if (back === 0) {
        // Текущий месяц: часть семей уже заплатила в первые дни.
        if (curDay < 2 || debt === 'three' || rand() > 0.55) continue;
      }
      if (debt === 'three' && back <= 3) continue;
      if (debt === 'two' && back >= 1 && back <= 2) continue;
      if (debt === 'one' && back === 1) continue;
      if (debt === 'partial' && back === 1) amount = Math.round(c.amount / 2 / 100) * 100;
      const maxDay = back === 0 ? Math.max(1, curDay - 1) : 12;
      const paidAt = dayIn(c.month, 1 + Math.floor(rand() * maxDay));
      run(`INSERT INTO payments (family_id, student_id, month, amount, method, paid_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        c.family_id, c.student_id, c.month, amount, rand() < 0.45 ? 'cash' : 'transfer', paidAt, maryam, paidAt + ' 12:00:00');
    }
    // Напоминание семье Гасановых уже отправляли.
    const gasanov = get("SELECT id FROM families WHERE name = 'Шамиль Гасанов'");
    run('INSERT INTO reminders (family_id, amount, channel, created_by, created_at) VALUES (?, ?, ?, ?, ?)',
      gasanov.id, 8000, 'whatsapp', maryam, addDays(TODAY, -20) + ' 11:00:00');

    // ---------- Хифз ----------
    const week0 = weekStart(TODAY);
    const finishDay = addDays(TODAY, -1) >= week0 ? addDays(TODAY, -1) : TODAY;
    const boundaries = [23, 43, 64, 84, 104, 124];
    for (const s of students) {
      let target = s.opts.hifz;
      if (!target) continue;
      // Чтобы на этой неделе джуз закончили ровно двое, у остальных граница джуза не попадает на последние уроки.
      if (!s.opts.juzThisWeek) while (boundaries.some((b) => target >= b && target <= b + 3)) target += 4;
      const teacherId = T[GDEF[s.groupId].teacher];
      // Последняя сдача — за 1–6 дней до сегодня, предыдущие с шагом 2–4 дня назад.
      let date = s.opts.juzThisWeek ? finishDay : addDays(TODAY, -(2 + Math.floor(rand() * 5)));
      if (s.status === 'paused') date = addDays(s.changed, -2);
      const plan = [];
      let i = 0;
      while (i < target) {
        const size = rand() < 0.25 && i + 2 <= target ? 2 : 1;
        plan.push(HIFZ_ORDER.slice(i, i + size));
        i += size;
      }
      const dated = [];
      for (let k = plan.length - 1; k >= 0; k--) {
        dated.unshift({ pages: plan[k], date });
        date = addDays(date, -(2 + Math.floor(rand() * 3)));
      }
      for (const [k, rec] of dated.entries()) {
        const from = Math.min(...rec.pages), to = Math.max(...rec.pages);
        const isLast = k === dated.length - 1;
        if (!isLast && rand() < 0.06) {
          addRecord(s.id, { type: 'new', page_from: from, page_to: to, surah: surahAtPage(from), grade: 'fail', note: 'Путал аяты, повторить дома', next_task: null, date: addDays(rec.date, -1) }, { id: userIds[GDEF[s.groupId].teacher] }, teacherId);
        }
        const grade = rand() < 0.78 ? 'excellent' : 'errors';
        const nextIdx = HIFZ_ORDER.indexOf(rec.pages[rec.pages.length - 1]) + 1;
        const nextPage = HIFZ_ORDER[nextIdx];
        addRecord(s.id, {
          type: 'new', page_from: from, page_to: to, surah: surahAtPage(from), grade,
          note: grade === 'errors' ? pick(['Ошибки в мадд, повторить', 'Запинался в середине страницы', 'Нужно поработать над гунной']) : null,
          next_task: isLast && nextPage ? `Выучить стр. ${nextPage}, повторить последние 3 страницы` : null,
          date: rec.date,
        }, { id: userIds[GDEF[s.groupId].teacher] }, teacherId);
      }
      // Мураджаа: раз в неделю повторение части выученного, у одного ученика давно не было повторения.
      const learned = HIFZ_ORDER.slice(0, target);
      const stale = s.name.startsWith('Билал');
      for (let d = addDays(TODAY, -84); d < TODAY; d = addDays(d, 7)) {
        if (stale && d > addDays(TODAY, -35)) break;
        const avail = learned.filter((p) => dated.find((r) => r.pages.includes(p) && r.date < d));
        if (avail.length < 3) continue;
        const startIdx = Math.floor(rand() * Math.max(1, avail.length - 4));
        const chunk = avail.slice(startIdx, startIdx + 3 + Math.floor(rand() * 4));
        const reviewDate = addDays(d, Math.floor(rand() * 3));
        addRecord(s.id, {
          type: 'review', page_from: Math.min(...chunk), page_to: Math.max(...chunk), surah: null,
          grade: rand() < 0.85 ? 'excellent' : 'errors', note: null, next_task: null,
          date: reviewDate < TODAY ? reviewDate : addDays(TODAY, -1),
        }, { id: userIds[GDEF[s.groupId].teacher] }, teacherId);
      }
    }

    // ---------- Выплаты зарплаты за прошлые месяцы ----------
    for (let i = 3; i >= 1; i--) {
      const m = addMonths(CUR, -i);
      for (const t of TEACHERS) {
        const tid = T[t.key];
        const group = get(`SELECT COUNT(*) AS n FROM lessons l JOIN groups g ON g.id = l.group_id WHERE l.teacher_id = ? AND substr(l.date,1,7) = ? AND g.direction != 'individual'`, tid, m).n;
        const ind = get(`SELECT COUNT(*) AS n FROM attendance a JOIN lessons l ON l.id = a.lesson_id JOIN groups g ON g.id = l.group_id
                         WHERE l.teacher_id = ? AND substr(l.date,1,7) = ? AND g.direction = 'individual' AND a.status IN ('present','late')`, tid, m).n;
        const amount = (group + ind) * t.rate;
        if (amount > 0) run('INSERT INTO salary_payouts (teacher_id, month, amount, paid_at, created_by) VALUES (?, ?, ?, ?, ?)', tid, m, amount, dayIn(addMonths(m, 1), 1), userIds.abdullah);
      }
    }

    // ---------- Каникулы ----------
    run('INSERT INTO months_off (month, group_id, reason, created_by) VALUES (?, NULL, ?, ?)', '2027-02', 'Рамадан — каникулы', userIds.abdullah);

    // ---------- Заявки ----------
    const leadDefs = [
      { name: 'Зайнаб Алиева', age: 9, gender: 'f', contact: 'Патимат Алиева', phone: '+7 928 777-01-01', interest: 'reading', source: 'instagram', status: 'new', created: addDays(TODAY, -1) },
      { name: 'Абдулла Гаджиев', age: 35, gender: 'm', phone: '+7 928 777-01-02', interest: 'tajweed', source: 'mosque', status: 'new', created: addDays(TODAY, -3), notes: 'Подошёл после джума-намаза' },
      { name: 'Хадиджа Османова', age: 12, gender: 'f', contact: 'Аминат Османова', phone: '+7 928 777-01-03', whatsapp: '+7 928 777-01-03', interest: 'hifz', source: 'friends', status: 'new', created: TODAY },
      { name: 'Ильяс Курбанов', age: 8, gender: 'm', contact: 'Расул Курбанов', phone: '+7 928 777-01-04', interest: 'reading', source: 'site', status: 'contacted', created: addDays(TODAY, -6) },
      { name: 'Марьям Юсупова', age: 27, gender: 'f', telegram: '@maryam_yu', phone: '+7 928 777-01-05', interest: 'tajweed', source: 'instagram', status: 'contacted', created: addDays(TODAY, -9) },
      { name: 'Салих Мусаев', age: 10, gender: 'm', contact: 'Ислам Мусаев', phone: '+7 928 777-01-06', interest: 'hifz', source: 'friends', status: 'trial_scheduled', created: addDays(TODAY, -8), trial: addDays(TODAY, 2), group: 'G1' },
      { name: 'Асия Валиева', age: 30, gender: 'f', phone: '+7 928 777-01-07', whatsapp: '+7 928 777-01-07', interest: 'tajweed', source: 'instagram', status: 'trial_scheduled', created: addDays(TODAY, -5), trial: addDays(TODAY, 3), group: 'G7' },
      { name: 'Юсуф Ибрагимов', age: 11, gender: 'm', contact: 'Марат Ибрагимов', phone: '+7 928 777-01-08', interest: 'hifz', source: 'mosque', status: 'trial_done', created: addDays(TODAY, -14), trial: addDays(TODAY, -2), group: 'G1', notes: 'Читает уверенно, знает 10 коротких сур' },
      { name: 'Камаль Исаев', age: 40, gender: 'm', phone: '+7 928 777-01-09', interest: 'reading', source: 'site', status: 'rejected', created: dayIn(addMonths(CUR, -1), 12), reason: 'Не подошло время, ждёт утреннюю группу' },
      { name: 'Лиана Сулейманова', age: 8, gender: 'f', contact: 'Эльмира Сулейманова', phone: '+7 928 777-01-10', interest: 'reading', source: 'instagram', status: 'rejected', created: dayIn(addMonths(CUR, -1), 20), reason: 'Далеко ездить, ждут онлайн-группу для детей' },
      { name: 'Рахим Магомаев', age: 9, gender: 'm', contact: 'Заур Магомаев', phone: '+7 928 777-01-11', interest: 'reading', source: 'friends', status: 'contacted', created: dayIn(addMonths(CUR, -1), 25) },
      { name: 'Гульнара Ахметова', age: 45, gender: 'f', phone: '+7 928 777-01-12', interest: 'reading', source: 'mosque', status: 'rejected', created: dayIn(addMonths(CUR, -2), 8), reason: 'Передумала' },
    ];
    for (const l of leadDefs) {
      const id = Number(run(`INSERT INTO leads (name, age, gender, contact_name, phone, telegram, whatsapp, interest, source, status, trial_date, trial_group_id, reject_reason, notes, created_by, created_at, updated_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      l.name, l.age, l.gender, l.contact || null, l.phone, l.telegram || null, l.whatsapp || null, l.interest, l.source, l.status,
      l.trial || null, l.group ? G[l.group] : null, l.reason || null, l.notes || null, maryam, l.created + ' 10:30:00', l.created + ' 10:30:00').lastInsertRowid);
      run('INSERT INTO lead_events (lead_id, status, note, user_id, created_at) VALUES (?, ?, ?, ?, ?)', id, 'new', 'Заявка создана', maryam, l.created + ' 10:30:00');
      const steps = { contacted: ['contacted'], trial_scheduled: ['contacted', 'trial_scheduled'], trial_done: ['contacted', 'trial_scheduled', 'trial_done'], rejected: ['contacted', 'rejected'] }[l.status] || [];
      steps.forEach((st, i) => {
        const note = st === 'trial_scheduled' ? `Пробный урок ${l.trial.split('-').reverse().join('.')}` : st === 'rejected' ? l.reason : null;
        run('INSERT INTO lead_events (lead_id, status, note, user_id, created_at) VALUES (?, ?, ?, ?, ?)', id, st, note, maryam, addDays(l.created, i + 1) + ' 12:00:00');
      });
    }
    // Новые ученики этого месяца пришли через заявки.
    for (const s of students.filter((x) => x.opts.newThisMonth)) {
      const st = get('SELECT s.*, f.phone, f.name AS fname, f.is_self FROM students s JOIN families f ON f.id = s.family_id WHERE s.id = ?', s.id);
      const created = addDays(s.start, -10);
      const id = Number(run(`INSERT INTO leads (name, age, gender, contact_name, phone, interest, source, status, student_id, created_by, created_at, updated_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, 'enrolled', ?, ?, ?, ?)`,
      st.name, YEAR - st.birth_year, st.gender, st.is_self ? null : st.fname, st.phone, GDEF[s.groupId].direction, st.source, s.id, maryam, created + ' 10:00:00', s.start + ' 10:00:00').lastInsertRowid);
      run('UPDATE students SET lead_id = ? WHERE id = ?', id, s.id);
      for (const [st2, d] of [['new', created], ['contacted', addDays(created, 1)], ['trial_scheduled', addDays(created, 2)], ['trial_done', addDays(s.start, -3)], ['enrolled', s.start]]) {
        run('INSERT INTO lead_events (lead_id, status, note, user_id, created_at) VALUES (?, ?, ?, ?, ?)', id, st2, st2 === 'enrolled' ? `Стал учеником, группа «${GDEF[s.groupId].name}»` : null, maryam, d + ' 12:00:00');
      }
    }
  });
  syncCharges();
  db.exec('ANALYZE');
}

if (import.meta.main) {
  if (get('SELECT COUNT(*) AS n FROM users').n > 0) {
    console.log('База уже заполнена. Для пересоздания: npm run reset');
  } else {
    seed();
    console.log('Демо-данные загружены.');
  }
}
