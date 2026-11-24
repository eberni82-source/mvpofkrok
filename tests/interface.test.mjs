import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost',pretendToBeVisual:true});
const {window}=dom;
Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,localStorage:window.localStorage,FormData:window.FormData});
window.scrollTo=()=>{};
await import('../src/main.js');
const root=document.getElementById('app');
const click=selector=>root.querySelector(selector).click();
test('Выбор и режим не заменяют холст, карточки и поиск; камера сохраняется',()=>{
 const wrap=root.querySelector('#map-wrap'),input=root.querySelector('#search'),node=root.querySelector('[data-person="a2"]'),brand=root.querySelector('.cursor-eyes');
 wrap.scrollTop=350;wrap.scrollLeft=60;node.click();
 assert.equal(root.querySelector('#map-wrap'),wrap);assert.equal(root.querySelector('#search'),input);assert.equal(root.querySelector('[data-person="a2"]'),node);assert.equal(root.querySelector('.cursor-eyes'),brand);
 assert.equal(wrap.scrollTop,350);assert.equal(wrap.scrollLeft,60);
 click('[data-mode="influence"]');assert.equal(root.querySelector('#map-wrap'),wrap);assert.equal(wrap.scrollTop,350);
});
test('Поиск сохраняет DOM, фокус и положение курсора при вводе',()=>{
 const input=root.querySelector('#search');input.focus();input.value='Анна';input.setSelectionRange(2,2);input.dispatchEvent(new window.Event('input',{bubbles:true}));
 assert.equal(root.querySelector('#search'),input);assert.equal(document.activeElement,input);assert.equal(input.selectionStart,2);assert.equal(root.querySelectorAll('.person-node').length,1);
 click('[data-action="reset-filters"]');
});
test('Открытие и закрытие формы не сбрасывает холст, возвращает фокус',()=>{
 const wrap=root.querySelector('#map-wrap');wrap.scrollTop=270;
 const button=root.querySelector('[data-action="new-touch"]');button.focus();button.click();
 assert.equal(root.querySelector('#map-wrap'),wrap);assert.equal(wrap.scrollTop,270);assert.equal(document.activeElement,root.querySelector('.modal-close'));
 click('[data-action="close-modal"]');assert.equal(document.activeElement,button);assert.equal(wrap.scrollTop,270);
});
test('Уточнение вопроса сохраняет заполненный итог и сам checkbox',()=>{
 click('[data-action="new-touch"]');const summary=root.querySelector('[name="summary"]');summary.value='Не терять при уточнении';
 const checkbox=root.querySelector('[name^="review:"]');checkbox.checked=true;checkbox.dispatchEvent(new window.Event('change',{bubbles:true}));
 assert.equal(root.querySelector('[name="summary"]'),summary);assert.equal(summary.value,'Не терять при уточнении');assert.equal(root.querySelector(`[name="${checkbox.name}"]`),checkbox);
 click('[data-action="close-modal"]');
});

test('Модальное окно на холсте закрывается Escape без выхода из рабочего режима',()=>{
 click('[data-canvas-action="focus"]');assert.equal(root.querySelector('.app').classList.contains('canvas-focus'),true);
 click('[data-action="new-touch"]');
 document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(root.querySelector('[role="dialog"]'),null);assert.equal(root.querySelector('.app').classList.contains('canvas-focus'),true);
 click('[data-canvas-action="focus"]');
});
test('Ctrl + колесо сохраняет точку под курсором на холсте',()=>{
 const wrap=root.querySelector('#map-wrap');wrap.getBoundingClientRect=()=>({left:20,top:30});wrap.scrollLeft=100;wrap.scrollTop=200;
 wrap.dispatchEvent(new window.WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,clientX:220,clientY:130,deltaY:-20}));
 const zoom=Number(root.querySelector('.zoom-label').textContent.replace('%',''))/100;
 assert.ok(zoom>1);assert.ok(Math.abs(wrap.scrollLeft-(300*Math.exp(.14)-200))<.001);assert.ok(Math.abs(wrap.scrollTop-(300*Math.exp(.14)-100))<.001);
});
test('Перемещение фона меняет камеру, не карточки и не данные',()=>{
 const wrap=root.querySelector('#map-wrap'),node=root.querySelector('[data-person="a2"]'),x=node.style.left,y=node.style.top;
 wrap.setPointerCapture=()=>{};wrap.scrollLeft=250;wrap.scrollTop=300;
 const saved=localStorage.getItem('krok-lpr-mvp-v1');
 wrap.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,cancelable:true,button:0,clientX:100,clientY:100}));
 wrap.dispatchEvent(new window.MouseEvent('pointermove',{bubbles:true,cancelable:true,clientX:70,clientY:50}));
 wrap.dispatchEvent(new window.MouseEvent('pointerup',{bubbles:true,button:0}));wrap.click();
 assert.equal(wrap.scrollLeft,280);assert.equal(wrap.scrollTop,350);assert.equal(node.style.left,x);assert.equal(node.style.top,y);assert.equal(localStorage.getItem('krok-lpr-mvp-v1'),saved);
});

test('Сброс очищает видимый поиск и возвращает оба списка к пункту «Все»',()=>{
 const search=root.querySelector('#search');search.focus();search.value='Анна';search.dispatchEvent(new window.Event('input',{bubbles:true}));
 const department=root.querySelector('#department-filter');department.value='ИТ';department.dispatchEvent(new window.Event('change',{bubbles:true}));
 const role=root.querySelector('#role-filter');role.value='Технический';role.dispatchEvent(new window.Event('change',{bubbles:true}));
 click('[data-action="reset-filters"]');assert.equal(search.value,'');assert.equal(department.value,'');assert.equal(department.selectedIndex,0);assert.equal(role.selectedIndex,0);assert.equal(department.selectedOptions[0].textContent,'Все подразделения');assert.equal(role.selectedOptions[0].textContent,'Все роли');assert.equal(root.querySelectorAll('.person-node').length,8);
});

test('Счётчик карты появляется только при скрытых контактах',()=>{
 assert.equal(root.querySelector('.map-count'),null);
 click('[data-action="toggle-gaps"]');assert.match(root.querySelector('.map-count').textContent,/Показано 2 из 8/);
 click('[data-action="reset-filters"]');assert.equal(root.querySelector('.map-count'),null);
});
