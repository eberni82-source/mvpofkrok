import test from 'node:test';
import assert from 'node:assert/strict';

// Минимальный DOM smoke-тест: модуль интерфейса загружается, генерирует HTML
// и регистрирует события. Полное UX-тестирование делается отдельно в браузере.
test('Главный интерфейс собирается на тестовых данных',async()=>{
  const listeners={};
  const root={innerHTML:'',addEventListener(name,handler){listeners[name]=handler;}};
  const store=new Map();
  globalThis.document={getElementById:(id)=>id==='app'?root:null};
  globalThis.window={addEventListener:()=>{}};
  globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  await import('../src/main.js');
  assert.match(root.innerHTML,/Cursor/);
  assert.match(root.innerHTML,/Михаил Орлов/);
  assert.match(root.innerHTML,/path.*class="edge"/);
  assert.match(root.innerHTML,/\bC [0-9]/);
  assert.match(root.innerHTML,/Закупочный комитет/);
  assert.match(root.innerHTML,/Записать встречу/);
  assert.equal(typeof listeners.click,'function');
  assert.equal(typeof listeners.submit,'function');
  const click=(action,dataset={})=>listeners.click({target:{closest(selector){return selector==='[data-action]'?{dataset:{action,...dataset}}:null;}}});
  click('mode',{mode:'sandbox'});
  assert.match(root.innerHTML,/Изменения не сохраняются/);
  click('remove-edge',{id:'r8'});
  assert.doesNotMatch(root.innerHTML,/data-edge="r8"/);
  assert.equal(store.size,0,'Черновик не записывается в localStorage');
  click('exit-sandbox');
  click('mode',{mode:'influence'});
  click('select-person',{id:'a2'});
  assert.match(root.innerHTML,/data-edge="r8"/,'Выход восстанавливает удалённую в черновике связь');

});
