import {enhancePasswordFields} from './password-field.js';
import {eyes} from './mascot.js';
import {escapeHtml as h} from './model.js';
const roleName=role=>({admin:'Администратор',editor:'Редактор',reader:'Только просмотр'}[role]||role);
const actionName=action=>({save:'Сохранение карты',create_user:'Добавлен сотрудник',disable_user:'Доступ сотрудника отключён',change_password:'Изменён пароль'}[action]||action);
export async function authenticate(health){
 const response=await fetch('/api/session');if(response.ok)return response.json();
 const root=document.getElementById('app');document.getElementById('boot-loader')?.remove();
 return new Promise(resolve=>{
 root.innerHTML=`<main class="auth-screen"><section class="auth-art"><div class="auth-brand">${eyes('auth-eyes')}<span class="cursor-wordmark">Cursor</span></div><strong class="auth-slogan">Кто решает.<br>С кем говорить.</strong><p class="auth-description">Карта контактов и связей клиента</p><div class="auth-orbit orbit-blue"></div><div class="auth-orbit orbit-green"></div></section><section class="auth-card"><h1>${health.setup?'Первый запуск':'Вход в Cursor'}</h1><p>${health.setup?'Создайте аккаунт администратора. С него вы сможете добавлять сотрудников и назначать им доступ.':'Введите логин и пароль, которые вы получили от администратора команды.'}</p><form id="login-form"><label class="field"><span>Логин</span><input name="username" autocomplete="username" placeholder="Например, alex.petrov" required minlength="3" maxlength="80" pattern="[a-zA-Z0-9_.@-]+" title="От 3 символов: латинские буквы, цифры, точка, дефис, подчёркивание или @" ${health.setup?'aria-describedby="username-hint"':''}>${health.setup?'<small class="hint" id="username-hint">Для входа в Cursor. Без пробелов и русских букв.</small>':''}</label><label class="field"><span>Пароль</span><input name="password" type="password" placeholder="${health.setup?'Придумайте пароль':'Ваш пароль'}" autocomplete="${health.setup?'new-password':'current-password'}" required minlength="12" maxlength="128" ${health.setup?'aria-describedby="password-hint"':''}>${health.setup?'<small class="hint" id="password-hint">Не менее 12 символов</small>':''}</label><p role="alert" id="login-error" hidden></p><button class="btn primary" type="submit">${health.setup?'Создать аккаунт':'Войти'}</button></form></section></main>`;
 enhancePasswordFields(root);
 const form=root.querySelector('form');form.addEventListener('submit',async e=>{e.preventDefault();const button=form.querySelector('button[type=submit]');button.disabled=true;try{const fd=new FormData(form);const r=await fetch(health.setup?'/api/setup':'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(fd))});const b=await r.json();if(!r.ok)throw new Error(typeof b.detail==='string'?b.detail:'Проверьте логин и пароль');resolve(b);}catch(error){const box=document.getElementById('login-error');box.textContent=error.message;box.hidden=false;}finally{button.disabled=false;}});
 });
}
export function configureAccount(session,repository){
 let savedTimer;
 const status=document.createElement('div');status.className='sync-status';status.setAttribute('role','status');document.body.append(status);
 window.addEventListener('cursor:sync',e=>{const {state,message}=e.detail;clearTimeout(savedTimer);status.className='sync-status '+state;status.replaceChildren();if(state==='saving')status.textContent='Сохраняем…';if(state==='saved'){status.textContent='Сохранено';savedTimer=setTimeout(()=>{status.className='sync-status';status.replaceChildren();},1800);}if(state==='error'){status.textContent=message;const b=document.createElement('button');b.className='btn';b.textContent='Скачать правки';b.onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(repository.current,null,2)],{type:'application/json'}));a.download='cursor-unsaved.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};status.append(b);}});
 window.addEventListener('beforeunload',e=>{if(status.classList.contains('saving')||repository.failed){e.preventDefault();e.returnValue='';}});
 const request=async(path,method='GET',body)=>{const r=await fetch(path,{method,headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrf},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw new Error(typeof data.detail==='string'?data.detail:'Проверьте введённые данные');return data;};
 window.cursorAccount={session,open:async()=>{
 const overlay=document.createElement('div');overlay.className='modal-overlay account-overlay';overlay.innerHTML=`<section class="modal account-modal" role="dialog" aria-modal="true" aria-label="Команда">
 <div class="modal-head"><h2>Команда</h2><button class="modal-close" data-close aria-label="Закрыть">×</button></div>
 <div class="modal-body account-body">
  <div class="account-identity"><span>Вы вошли как <strong>${h(session.username)}</strong></span><span class="account-role">${h(roleName(session.role))}</span></div>
  ${session.role==='admin'?`<section class="account-section"><h3>Сотрудники</h3><div id="team-users"></div></section>
  <form id="team-form" class="account-section account-form"><h3>Добавить сотрудника</h3>
   <label class="field"><span>Логин сотрудника</span><input name="username" required minlength="3" maxlength="80" autocomplete="off" placeholder="Например, alex.petrov"></label>
   <label class="field"><span>Временный пароль</span><input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password" placeholder="Не менее 12 символов"></label>
   <label class="field"><span>Доступ</span><select name="role"><option value="editor">Редактор</option><option value="reader">Только просмотр</option><option value="admin">Администратор</option></select></label>
   <button class="btn primary" type="submit">Добавить сотрудника</button>
  </form>
  <details class="account-disclosure"><summary>Журнал изменений</summary><div id="team-audit"></div></details>`:''}
  <details class="account-disclosure"><summary>Изменить пароль</summary>
   <form id="password-form" class="account-form">
    <label class="field"><span>Текущий пароль</span><input type="password" name="current_password" autocomplete="current-password" required minlength="12" maxlength="128"></label>
    <label class="field"><span>Новый пароль</span><input type="password" name="password" autocomplete="new-password" required minlength="12" maxlength="128"></label>
    <button class="btn" type="submit">Сохранить пароль</button><p role="status" id="password-status"></p>
   </form>
  </details>
  <p id="team-error" role="alert"></p>
  <div class="account-footer"><button class="btn" data-logout>Выйти из Cursor</button></div>
 </div>
</section>`;document.body.append(overlay);enhancePasswordFields(overlay);
 const previous=document.activeElement;const close=()=>{overlay.remove();previous?.focus();};overlay.querySelector('[data-close]').onclick=close;
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}if(e.key==='Tab'){const list=[...overlay.querySelectorAll('button,input,select,summary')].filter(e=>e.getClientRects().length&&!e.disabled);const first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});overlay.querySelector('[data-close]').focus();
 const error=e=>overlay.querySelector('#team-error').textContent=e.message;
 const refresh=async()=>{try{const users=await request('/api/admin/users');overlay.querySelector('#team-users').innerHTML=users.map(u=>`<div class="team-row"><div class="team-person"><strong>${h(u.username)}</strong><small>${h(roleName(u.role))}</small></div><span class="team-status">${u.active?'Доступ открыт':'Доступ закрыт'}</span>${u.active&&u.username!==session.username?`<button class="btn" data-disable="${u.id}">Отключить</button>`:''}</div>`).join('');const audit=await request('/api/admin/audit');overlay.querySelector('#team-audit').innerHTML=audit.map(r=>`<article class="team-audit-row"><time>${h(new Date(r.at*1000).toLocaleString('ru-RU'))}</time><strong>${h(r.username||'Система')}</strong><span>${h(actionName(r.action))}</span></article>`).join('')||'<p class="hint">Изменений пока нет.</p>';}catch(e){error(e);}};
 if(session.role==='admin'){await refresh();overlay.querySelector('#team-form').onsubmit=async e=>{e.preventDefault();try{await request('/api/admin/users','POST',Object.fromEntries(new FormData(e.target)));e.target.reset();await refresh();}catch(e){error(e);}};overlay.addEventListener('click',async e=>{const b=e.target.closest('[data-disable]');if(b)try{await request(`/api/admin/users/${b.dataset.disable}/sessions`,'DELETE');await refresh();}catch(e){error(e);}});}
 overlay.querySelector('#password-form').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button[type=submit]');button.disabled=true;try{await repository.queue;if(repository.failed)throw new Error('Сначала скачайте несохранённые правки.');const updated=await request('/api/account/password','POST',Object.fromEntries(new FormData(e.target)));session.csrf=updated.csrf;e.target.reset();overlay.querySelector('#password-status').textContent='Пароль изменён. На других устройствах нужно войти снова.';}catch(e){error(e);}finally{button.disabled=false;}};
 overlay.querySelector('[data-logout]').onclick=async()=>{if(repository.failed){error(new Error('Сначала скачайте несохранённые правки.'));return;}await repository.queue;if(repository.failed){error(new Error('Сначала скачайте несохранённые правки.'));return;}try{await request('/api/logout','POST');location.reload();}catch(e){error(e);}};
 }};
}
