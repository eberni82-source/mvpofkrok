import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../src/data/seed.js';
import {bezierFor} from '../src/graph/curves.js';
import {companyPeople,visiblePeople,hasGaps,validateRelation,escapeHtml} from '../src/model.js';

const data=structuredClone(seed);
test('Клиенты не смешиваются',()=>{
  assert.equal(companyPeople(data,'alpha').length,8);
  assert.equal(companyPeople(data,'vector').length,4);
  assert.ok(companyPeople(data,'vector').every(p=>p.companyId==='vector'));
});
test('Поиск и фильтр по роли дают ожидаемое подмножество',()=>{
  const filter={search:'директор',department:'',role:'ЛПР',gapsOnly:false,oneThreadOnly:false};
  const people=visiblePeople(data,'alpha',filter);
  assert.ok(people.length>=2);
  assert.ok(people.every(p=>p.role==='ЛПР'&&[p.name,p.position,p.department].join(' ').toLowerCase().includes('директор')));
});
test('Пробелы в данных обнаруживаются',()=>{
  assert.equal(hasGaps(data.people.find(p=>p.id==='a4')),true);
  assert.equal(hasGaps(data.people.find(p=>p.id==='a2')),false);
});
test('Связь не бывает петлёй, дублем и межклиентской',()=>{
  assert.match(validateRelation(data,{source:'a2',target:'a2',kind:'influences'}),/самим собой/);
  assert.match(validateRelation(data,{source:'a1',target:'v1',kind:'influences'}),/одной компании/);
  assert.match(validateRelation(data,{source:'a1',target:'a2',kind:'reports_to'}),/существует/);
  assert.equal(validateRelation(data,{source:'a2',target:'a8',kind:'influences'}),null);
});
test('Кривые Безье содержат C, а не прямые отрезки',()=>{
  const a=data.people.find(p=>p.id==='a1'),b=data.people.find(p=>p.id==='a2');
  const parent=bezierFor(a,b,'reports_to');
  const influence=bezierFor(a,b,'influences');
  assert.match(parent.d,/^M .* C /);
  assert.match(influence.d,/^M .* C /);
  const moved=bezierFor({...a,x:a.x+100},b,'reports_to');
  assert.notEqual(parent.d,moved.d);
});
test('Поле ввода безопасно экранируется',()=>{
  assert.equal(escapeHtml('<script>alert("x")</script>'),'&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
});
