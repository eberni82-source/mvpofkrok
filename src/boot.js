import {eyes} from './mascot.js';
async function start(){
 let loader=document.getElementById('boot-loader');
 try {
  const health=await fetch('/api/health');
  if(!health.ok&&health.status!==404)throw new Error('Сервер недоступен');
  if(health.ok){const {authenticate,configureAccount}=await import('./account.js');const session=await authenticate(await health.json());
   if(!document.getElementById('boot-loader')){const holder=document.createElement('div');holder.id='boot-loader';holder.className='boot-loader';holder.innerHTML=`${eyes()}<strong class="cursor-wordmark">Cursor</strong><p>Подключаем команду</p>`;document.body.append(holder);loader=holder;}
   const {ApiRepository}=await import('./data/api.js');window.cursorRepository=await new ApiRepository(session).init();configureAccount(session,window.cursorRepository);
  }
  await import('./main.js');loader?.classList.add('ready');loader?.addEventListener('transitionend',()=>loader.remove(),{once:true});setTimeout(()=>loader?.remove(),650);
 }catch{loader?.classList.add('failed');const message=loader?.querySelector('[data-boot-message]')||loader?.querySelector('p');if(message)message.textContent='Не удалось подключиться. Проверьте сервер и повторите.';loader?.querySelector('[data-boot-retry]')?.removeAttribute('hidden');}
}
await start();
