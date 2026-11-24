import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {enhancePasswordFields} from '../src/password-field.js';

function fixture(run) {
  const dom=new JSDOM('<form><label>Пароль<input type="password" value="test-only-value"></label><input type="password"></form>');
  const previous=globalThis.document;
  globalThis.document=dom.window.document;
  try { run(document.querySelector('form')); }
  finally { if(previous===undefined)delete globalThis.document;else globalThis.document=previous;dom.window.close(); }
}

test('Глазки сохраняют SVG при повторных переключениях и не отправляют форму',()=>fixture(form=>{
  let submissions=0;
  form.addEventListener('submit',e=>{e.preventDefault();submissions++;});
  enhancePasswordFields(form);
  const input=form.querySelector('input'),button=form.querySelector('button');
  const svg=button.querySelector('svg'),pupils=svg.querySelector('.password-pupils');
  for(let i=0;i<8;i++) {
    button.click();
    const visible=i%2===0;
    assert.equal(input.type,visible?'text':'password');
    assert.equal(button.getAttribute('aria-pressed'),String(visible));
    assert.equal(button.getAttribute('aria-label'),visible?'Скрыть пароль':'Показать пароль');
    assert.equal(button.querySelector('svg'),svg);
    assert.equal(svg.querySelector('.password-pupils'),pupils);
  }
  assert.equal(input.value,'test-only-value');
  assert.equal(submissions,0);
}));

test('Переключатели независимы и не дублируются при повторной настройке',()=>fixture(form=>{
  enhancePasswordFields(form);enhancePasswordFields(form);
  const buttons=[...form.querySelectorAll('button')],inputs=[...form.querySelectorAll('input')];
  assert.equal(buttons.length,2);
  buttons[1].click();
  assert.equal(inputs[0].type,'password');
  assert.equal(inputs[1].type,'text');
  assert.equal(buttons[0].getAttribute('aria-pressed'),'false');
}));
