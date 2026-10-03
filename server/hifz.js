import { all, get, run } from './db.js';
import { HIFZ_ORDER, TOTAL_JUZ, juzRange, surahPages, SURAHS, surahAtPage } from '../shared/quran.js';
import { today, addDays } from './util.js';

const PASSED = new Set(['excellent', 'errors']);

export function memorizedPages(studentId) {
  const set = new Set();
  for (const r of all("SELECT page_from, page_to, grade FROM hifz_records WHERE student_id = ? AND type = 'new'", studentId)) {
    if (!PASSED.has(r.grade)) continue;
    for (let p = Math.min(r.page_from, r.page_to); p <= Math.max(r.page_from, r.page_to); p++) set.add(p);
  }
  return set;
}

export function completedJuz(pages) {
  const done = [];
  for (let j = 1; j <= TOTAL_JUZ; j++) {
    const [a, b] = juzRange(j);
    let ok = true;
    for (let p = a; p <= b; p++) if (!pages.has(p)) { ok = false; break; }
    if (ok) done.push(j);
  }
  return done;
}

// Полная картина хифза ученика: что выучено, где остановились, что давно не повторяли.
export function progress(studentId) {
  const pages = memorizedPages(studentId);
  const juz = [];
  for (let j = 1; j <= TOTAL_JUZ; j++) {
    const [a, b] = juzRange(j);
    let n = 0;
    for (let p = a; p <= b; p++) if (pages.has(p)) n++;
    juz.push({ juz: j, pages: n, total: b - a + 1 });
  }
  const juzDone = juz.filter((j) => j.pages === j.total).map((j) => j.juz);

  const surahsDone = [];
  for (const [n] of SURAHS) {
    const [a, b] = surahPages(n);
    let ok = true;
    for (let p = a; p <= b; p++) if (!pages.has(p)) { ok = false; break; }
    if (ok) surahsDone.push(n);
  }

  const lastNew = get(`SELECT h.*, t.name AS teacher_name FROM hifz_records h LEFT JOIN teachers t ON t.id = h.teacher_id
                       WHERE h.student_id = ? AND h.type = 'new' ORDER BY h.date DESC, h.id DESC LIMIT 1`, studentId);
  const lastReview = get(`SELECT h.*, t.name AS teacher_name FROM hifz_records h LEFT JOIN teachers t ON t.id = h.teacher_id
                          WHERE h.student_id = ? AND h.type = 'review' ORDER BY h.date DESC, h.id DESC LIMIT 1`, studentId);

  const nextPage = HIFZ_ORDER.find((p) => !pages.has(p)) || null;

  // Мураджаа: когда последний раз повторяли каждый выученный джуз (целиком или частично).
  const reviews = all("SELECT page_from, page_to, date, grade FROM hifz_records WHERE student_id = ? AND type = 'review' ORDER BY date", studentId);
  const reviewByJuz = juz.filter((j) => j.pages > 0).map((j) => {
    const [a, b] = juzRange(j.juz);
    let last = null, grade = null;
    for (const r of reviews) {
      if (Math.max(r.page_from, r.page_to) >= a && Math.min(r.page_from, r.page_to) <= b) { last = r.date; grade = r.grade; }
    }
    const stale = !last || last < addDays(today(), -14);
    return { juz: j.juz, pages: j.pages, total: j.total, last_review: last, grade, stale };
  });

  const completions = all(`SELECT c.juz, c.date, t.name AS teacher_name FROM juz_completions c LEFT JOIN teachers t ON t.id = c.teacher_id
                           WHERE c.student_id = ? ORDER BY c.date`, studentId);

  return {
    pages: pages.size,
    juz_done: juzDone,
    juz,
    surahs_done: surahsDone,
    last_new: lastNew || null,
    last_review: lastReview || null,
    next_page: nextPage,
    next_surah: nextPage ? surahAtPage(nextPage) : null,
    review_by_juz: reviewByJuz,
    completions,
  };
}

// Сохраняет сдачу или повторение и фиксирует новые законченные джузы.
export function addRecord(studentId, rec, user, teacherId) {
  const before = new Set(completedJuz(memorizedPages(studentId)));
  const r = run(`INSERT INTO hifz_records (student_id, type, page_from, page_to, surah, grade, note, next_task, date, teacher_id, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  studentId, rec.type, rec.page_from, rec.page_to, rec.surah, rec.grade, rec.note, rec.next_task, rec.date, teacherId, user?.id ?? null);
  const newJuz = [];
  if (rec.type === 'new' && PASSED.has(rec.grade)) {
    for (const j of completedJuz(memorizedPages(studentId))) {
      if (!before.has(j)) {
        run('INSERT OR IGNORE INTO juz_completions (student_id, juz, date, teacher_id) VALUES (?, ?, ?, ?)', studentId, j, rec.date, teacherId);
        newJuz.push(j);
      }
    }
  }
  return { id: Number(r.lastInsertRowid), new_juz: newJuz };
}
