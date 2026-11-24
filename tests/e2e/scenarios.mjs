// Shared browser scenarios: run in Playwright Test or through the CUA browser.
function check(condition,message){if(!condition)throw new Error(message);}
const button=(p,name)=>['Структура','Влияние','Закупка','Песочница'].includes(name)?p.locator('.mode-tabs').getByRole('button',{name,exact:true}):p.getByRole('button',{name,exact:true});
const field=(p,name)=>p.getByRole('textbox',{name,exact:true});
export const scenarios = {
 async 'Навигация и брендинг'(p,env) {
   await p.locator('#boot-loader').waitFor({state:'detached'});
   check(await p.getByRole('heading',{name:'Карта клиента',exact:true}).isVisible(),'Карта не открылась');
   check(!await p.getByText('Локальный прототип',{exact:true}).count(),'Осталась лишняя плашка');
   for(const name of ['Влияние','Закупка','Песочница','Структура']){await button(p,name).click();await env.observe();}
   check(await button(p,'Структура').getAttribute('aria-current')==='page','Режим не переключился');
 },
 async 'Поиск и пустая выдача'(p,env) {
   await p.getByRole('searchbox',{name:'Поиск',exact:true}).fill('Анна Соколова');await env.observe();
   check(await p.locator('.person-node').count()===1,'Поиск не отфильтровал карту');
   await p.getByRole('searchbox',{name:'Поиск',exact:true}).fill('Неттакогоконтакта123');await env.observe();
   check(await p.getByText('Никого не нашли',{exact:true}).isVisible(),'Нет пустого состояния');
   await button(p,'Показать всех').click();await env.observe();
   check(await p.locator('.person-node').count()>=8,'Фильтр не сброшен');
 },
 async 'Встреча, расхождение, экранирование и перезагрузка'(p,env) {
   await p.locator('[data-person="a2"]').click();await env.observe();
   await button(p,'Записать встречу').click();await env.observe();
   await field(p,'Сотрудник КРОК').fill('E2E редактор');
   await field(p,'Итог встречи').fill('E2E: <img data-e2e src=x onerror=alert(1)> — нужны расчёты');
   await p.getByRole('checkbox',{name:'Уточнить уже заполненные оценки',exact:true}).check();await env.observe();
   await p.getByRole('combobox',{name:'Отношение к КРОК',exact:true}).selectOption('skeptical');
   await button(p,'Сохранить').click();await env.observe();
   check(!await p.getByRole('dialog').count(),'Форма не закрылась');
   await env.reload();await env.observe();
   await p.locator('[data-person="a2"]').click();await env.observe();
   const detail=await p.locator('.detail').textContent();
   check(detail.includes('E2E редактор')&&detail.includes('Скептически')&&detail.includes('Сторонник'),'Ответ не сохранился');
   check(detail.includes('<img data-e2e'),'Пользовательский текст потерян');
   check(!await p.locator('img[data-e2e]').count(),'Пользовательский HTML выполнился');
 },
 async 'Изоляция песочницы и доступ к связи с клавиатуры'(p,env) {
   await button(p,'Песочница').click();await env.observe();
   check((await p.locator('.sandbox-banner').textContent()).includes('Изменения не сохраняются.'),'Нет обозначения черновика');
   const label='Связь: Алексей Морозов — влияет — Анна Соколова';
   let focused=false;
   for(let i=0;i<80;i++) {
     await env.key('Tab');await env.observe();
     focused=await p.evaluate(()=>document.activeElement.getAttribute('aria-label'))===label;
     if(focused)break;
   }
   check(focused,'Связь недоступна с клавиатуры');
   await env.key('Enter');await env.observe();
   await button(p,'Удалить связь в черновике').click();await env.observe();
   check(!await p.getByRole('button',{name:label,exact:true}).count(),'Связь не удалилась в черновике');
   await button(p,'Выйти').click();await env.observe();
   await button(p,'Влияние').click();await env.observe();
   check(await p.getByRole('button',{name:label,exact:true}).count()===1,'Исходная карта повреждена');
   await env.reload();await env.observe();
   await button(p,'Влияние').click();await env.observe();
   check(await p.getByRole('button',{name:label,exact:true}).count()===1,'Черновик попал в постоянное хранилище');
 },
 async 'Ошибка формы и отмена без записи'(p,env) {
   const count=await p.locator('.feed-list .feed-row').count();
   await button(p,'Записать встречу').click();await env.observe();
   await button(p,'Сохранить').click();await env.observe();
   check(await p.getByRole('alert').isVisible(),'Пустая форма не отклонена');
   await button(p,'Отмена').click();await env.observe();
   check(await p.locator('.feed-list .feed-row').count()===count,'Отмена добавила запись');
 },
 async 'Изоляция клиентов'(p,env) {
   await p.getByRole('combobox',{name:'Компания',exact:true}).selectOption('vector');await env.observe();
   const text=await p.locator('#map-stage').textContent();
   check(text.includes('Ольга Федорова')&&!text.includes('Анна Соколова'),'Клиенты смешались');
   await p.getByRole('combobox',{name:'Компания',exact:true}).selectOption('alpha');await env.observe();
 },
 async 'Отмена сброса и восстановление примера'(p,env) {
   const marker='E2E проверка сброса примера';
   await button(p,'Записать встречу').click();await env.observe();
   await field(p,'Сотрудник КРОК').fill('E2E редактор');
   await field(p,'Итог встречи').fill(marker);
   await button(p,'Сохранить').click();await env.observe();
   const hasMarker=async()=>(await p.locator('.feed-list').textContent()).includes(marker);
   check(await hasMarker(),'Запись для проверки не создана');
   const openReset=async()=>{
     await p.locator('summary').filter({hasText:'О данных'}).click();await env.observe();
     await button(p,'Сбросить пример').click();await env.observe();
   };
   await openReset();
   check(await p.getByRole('dialog').count()===1,'Нет подтверждения сброса');
   await button(p,'Отмена').click();await env.observe();
   await env.reload();await env.observe();
   check(await hasMarker(),'Отмена сброса удалила правки');
   await openReset();await button(p,'Сбросить').click();await env.observe();
   await env.reload();await env.observe();
   check(!await hasMarker(),'Сброс не восстановил пример');
 },
 async 'Скачивание CSV'(p,env) {
   const [download]=await Promise.all([p.waitForEvent('download'),button(p,'Экспорт CSV').click()]);await env.observe();
   check(/\.csv$/.test(await download.path()),'CSV не скачался');
 },
};
