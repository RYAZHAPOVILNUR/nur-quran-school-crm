import { html, icon, avatar } from '../core.js';
import { setTop, MORE, logout } from '../app.js';
import { ROLES } from '/shared/labels.js';
import { newLead } from './leads.js';

export async function more({ el, me }) {
  setTop({ title: 'Ещё' });
  const items = MORE[me.role] || [];
  el.innerHTML = String(html`
    <div class="card"><div class="row" style="border:0">${avatar(me.name, me.login === 'maryam' || me.login === 'aisha' ? 'f' : 'm')}
      <div class="row-main"><div class="row-title">${me.name}</div><div class="row-sub">${ROLES[me.role]}</div></div>
      <button class="btn sm" id="logout">${icon('logout', 'sm')} Выйти</button></div></div>
    ${me.can.leads ? html`<div class="actions stretch">
      <button class="btn primary" id="new-lead">${icon('inbox', 'sm')} Новая заявка</button>
      <a class="btn" href="#/pay">${icon('coins', 'sm')} Принять оплату</a></div>` : ''}
    <div class="card"><div class="list">${items.map(([p, l, i]) => html`<a class="row" href="#${p}">
      <span class="icon-btn round">${icon(i, 'sm')}</span><div class="row-main"><div class="row-title">${l}</div></div>${icon('chevron', 'chev')}</a>`)}</div></div>`);
  el.querySelector('#logout').addEventListener('click', logout);
  el.querySelector('#new-lead')?.addEventListener('click', newLead);
}
