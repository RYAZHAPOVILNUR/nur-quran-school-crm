// Блок хифза в карточке ученика: прогресс, «на чём остановились», сдачи и мураджаа.
import { api, html, raw, icon, fmtDate, fmtDay, plural, sheet, toast, refresh, seg, todayStr, copyText } from '../core.js';
import { SURAHS, surahName, surahPages, pagesLabel, TOTAL_PAGES, juzRange } from '/shared/quran.js';
import { GRADES } from '/shared/labels.js';

const GRADE_BADGE = { excellent: 'green', errors: 'amber', fail: 'red' };
const GRADE_COLOR = { excellent: 'var(--accent)', errors: '#c48a1c', fail: 'var(--danger)' };

function ring(pages) {
  const r = 40, c = 2 * Math.PI * r;
  const p = Math.min(1, pages / TOTAL_PAGES);
  return raw(`<div class="ring"><svg viewBox="0 0 92 92" aria-hidden="true">
    <circle cx="46" cy="46" r="${r}" fill="none" stroke="var(--accent-soft)" stroke-width="9"/>
    ${p > 0 ? `<circle cx="46" cy="46" r="${r}" fill="none" stroke="var(--accent)" stroke-width="9" stroke-linecap="round"
      stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}"/>` : ''}</svg>
    <div class="ring-text"><div><strong>${pages}</strong><small>из ${TOTAL_PAGES} стр.</small></div></div></div>`);
}

function recordLine(r) {
  const where = `${pagesLabel(r.page_from, r.page_to)}${r.surah ? ` · ${surahName(r.surah)}` : ''}`;
  return html`<div class="row" style="align-items:flex-start;min-height:54px">
    <div class="row-main">
      <div class="row-title" style="white-space:normal">${where}</div>
      <div class="row-sub wrap">${fmtDate(r.date)} · ${r.type === 'review' ? 'повторение' : 'сдача'}${r.teacher_name ? ` · ${r.teacher_name}` : ''}${r.note ? ` · ${r.note}` : ''}</div>
    </div>
    <span class="badge ${GRADE_BADGE[r.grade]}">${GRADES[r.grade]}</span></div>`;
}

export function hifzBlock(d, me) {
  const h = d.hifz;
  const canEdit = me.can['hifz.edit'];
  const last = h.last_new;
  const juzText = `${h.juz_done.length} ${plural(h.juz_done.length, 'джуз', 'джуза', 'джузов')} из 30`;
  const recent = d.hifz_records.filter((r) => r.type === 'new').slice(0, 8);
  const reviews = d.hifz_records.filter((r) => r.type === 'review').slice(0, 5);
  return html`<div class="card" id="hifz">
    <div class="card-head"><h2>${icon('book')} Хифз</h2>${h.juz_done.length ? html`<span class="badge gold">${icon('star', 'xs')} ${juzText}</span>` : ''}</div>
    <div class="card-pad" style="padding-top:0;display:grid;gap:16px">
      <div class="hifz-summary">
        ${ring(h.pages)}
        <div style="display:grid;gap:4px">
          <div style="font-size:20px;font-weight:700">${juzText}</div>
          <div class="muted small">${h.pages} ${plural(h.pages, 'страница', 'страницы', 'страниц')} наизусть · ${h.surahs_done.length} ${plural(h.surahs_done.length, 'сура', 'суры', 'сур')} целиком</div>
        </div>
      </div>

      <div class="juz-grid" aria-label="Джузы">${h.juz.map((j) => html`<div class="juz ${j.pages === j.total ? 'done' : j.pages ? 'partial' : ''}"
        style="--p:${Math.round((j.pages / j.total) * 100)}%" title="Джуз ${j.juz}: ${j.pages} из ${j.total} стр."><span>${j.juz}</span></div>`)}</div>

      <div class="stopped">
        <span class="label">На чём остановились</span>
        ${last ? html`
          <div><b>${pagesLabel(last.page_from, last.page_to)}${last.surah ? ` · ${surahName(last.surah)}` : ''}</b> — <span class="badge ${GRADE_BADGE[last.grade]}">${GRADES[last.grade]}</span></div>
          <div class="small muted">${fmtDay(last.date)} · принял(а) ${last.teacher_name || '—'}${last.note ? ` · ${last.note}` : ''}</div>
          ${last.next_task ? html`<div style="margin-top:4px">${icon('right', 'xs')} <b>Задание:</b> ${last.next_task}</div>` : ''}
          ${h.next_page ? html`<div class="small">Следующая по порядку: стр. ${h.next_page} (${surahName(h.next_surah)})</div>` : ''}`
        : html`<div>Пока ничего не сдано. Начинаем с ${h.next_page ? `стр. ${h.next_page} (${surahName(h.next_surah)})` : 'начала'}.</div>`}
        ${h.last_review ? html`<div class="small muted" style="margin-top:4px">Последнее повторение: ${pagesLabel(h.last_review.page_from, h.last_review.page_to)}, ${fmtDay(h.last_review.date)}</div>` : ''}
      </div>

      ${canEdit ? html`<div class="actions stretch">
        <button class="btn primary" data-hifz="new">${icon('plus', 'sm')} Сдал урок</button>
        <button class="btn soft" data-hifz="review">${icon('refresh', 'sm')} Повторение</button>
      </div>` : ''}

      ${h.completions.length ? html`<div>
        <div class="label" style="margin-bottom:6px">Законченные джузы</div>
        <div class="actions">${h.completions.map((c) => html`<span class="badge gold">${icon('star', 'xs')} ${c.juz}-й · ${fmtDate(c.date)}</span>`)}</div>
      </div>` : ''}

      ${h.review_by_juz.length ? html`<div>
        <div class="label" style="margin-bottom:6px">Мураджаа — когда повторяли</div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Джуз</th><th>Выучено</th><th>Повторяли</th></tr></thead><tbody>
          ${h.review_by_juz.map((j) => html`<tr><td>${j.juz}-й</td><td>${j.pages} из ${j.total} стр.</td>
            <td>${j.last_review ? fmtDate(j.last_review) : '—'} ${j.stale ? html`<span class="badge amber">давно</span>` : ''}</td></tr>`)}
        </tbody></table></div>
      </div>` : ''}
    </div>
    ${recent.length ? html`<div class="card-head" style="padding-top:4px"><h3>Последние сдачи</h3></div><div class="list">${recent.map(recordLine)}</div>` : ''}
    ${reviews.length ? html`<div class="card-head"><h3>Последние повторения</h3></div><div class="list">${reviews.map(recordLine)}</div>` : ''}
  </div>`;
}

function surahOptions(selected) {
  return html`<option value="">— по страницам —</option>${SURAHS.map(([n, name, page]) => html`<option value="${n}" ${n === selected ? raw('selected') : ''}>${n}. ${name} (стр. ${page})</option>`)}`;
}

export function celebrate(name, gender, juzList) {
  const done = gender === 'f' ? 'закончила' : 'закончил';
  const first = name.split(' ')[0];
  const juzWord = juzList.map((j) => `${j}-й`).join(' и ');
  const juzGen = juzList.map((j) => `${j}-го`).join(' и ');
  const text = `Ассаляму алейкум! Радостная новость из школы Корана «Нур»: ${first} ${gender === 'f' ? 'завершила' : 'завершил'} заучивание ${juzGen} джуза Корана. Машаллах! Пусть Аллах сделает Коран светом сердца и заступником, а вам воздаст благом за воспитание. БаракаЛлаху фикум!`;
  sheet({
    title: 'Машаллах!',
    body: html`<div class="celebrate">
      <svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/></svg>
      <h2>${first} ${done} ${juzWord} джуз!</h2>
      <p class="muted">Это видно владельцу на главном экране. Поздравьте семью:</p></div>
      <textarea class="input reminder-text" name="text" style="min-height:170px">${text}</textarea>`,
    submit: 'Скопировать поздравление',
    onSubmit: async (f) => { await copyText(f.text); toast('Скопировано — отправьте семье'); },
  });
}

export function bindHifz(el, d, me) {
  const h = d.hifz;
  el.querySelectorAll('[data-hifz]').forEach((b) => b.addEventListener('click', () => {
    const type = b.dataset.hifz;
    let from = h.next_page || 1, to = from;
    if (type === 'review') {
      const last = h.review_by_juz.find((j) => j.stale) || h.review_by_juz[0];
      if (last) {
        const [a, z] = juzRange(last.juz);
        from = a; to = Math.min(z, a + 4);
      }
    }
    sheet({
      title: type === 'new' ? 'Сдача нового урока' : 'Повторение (мураджаа)',
      submit: 'Сохранить',
      body: html`
        ${seg('type', { new: 'Новое', review: 'Повторение' }, type)}
        <label class="field"><span>Сура</span><select class="input" name="surah">${surahOptions(null)}</select>
          <span class="hint">Выберите суру — страницы подставятся сами. Или укажите страницы вручную.</span></label>
        <div class="form-grid two">
          <label class="field"><span>Со страницы</span><input class="input" name="page_from" type="number" inputmode="numeric" min="1" max="604" value="${from}"></label>
          <label class="field"><span>По страницу</span><input class="input" name="page_to" type="number" inputmode="numeric" min="1" max="604" value="${to}"></label>
        </div>
        <div class="field"><span>Оценка</span><div class="grade-opts">
          ${Object.entries(GRADES).map(([k, v], i) => html`<label><input type="radio" name="grade" value="${k}" ${i === 0 ? raw('checked') : ''}><span style="--c:${GRADE_COLOR[k]}">${v}</span></label>`)}
        </div></div>
        <label class="field"><span>Заметка учителя</span><input class="input" name="note" placeholder="Например: ошибки в мадд"></label>
        <label class="field" data-next><span>Задание на следующий урок</span><input class="input" name="next_task" placeholder="Например: выучить стр. 563, повторить 560–562"></label>
        <label class="field"><span>Дата</span><input class="input" name="date" type="date" value="${todayStr()}" max="${todayStr()}"></label>`,
      onOpen: (form) => {
        const sel = form.querySelector('[name=surah]');
        sel.addEventListener('change', () => {
          if (!sel.value) return;
          const [a, z] = surahPages(Number(sel.value));
          form.querySelector('[name=page_from]').value = a;
          form.querySelector('[name=page_to]').value = z;
        });
        const toggle = () => { form.querySelector('[data-next]').hidden = form.querySelector('[name=type]:checked').value !== 'new'; };
        form.querySelectorAll('[name=type]').forEach((r) => r.addEventListener('change', toggle));
        toggle();
      },
      onSubmit: async (f) => {
        const res = await api(`/api/students/${d.student.id}/hifz`, { method: 'POST', body: f });
        if (res.new_juz?.length) {
          setTimeout(() => celebrate(d.student.name, d.student.gender, res.new_juz), 150);
        } else {
          toast(f.type === 'review' ? 'Повторение записано' : `Записано. Выучено ${res.progress.pages} стр.`);
        }
        refresh();
      },
    });
  }));
}
