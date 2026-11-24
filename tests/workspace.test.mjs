import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../src/data/seed.js';
import {layoutPeople,clientRisks,meetingBrief} from '../src/workspace.js';
test('Группы отделов вмещают людей, раскладка сохраняет ручное перемещение',()=>{
 const people=structuredClone(seed.people.filter(p=>p.companyId==='alpha'));
 const board=layoutPeople(people);
 for(const p of people){const z=board.zones.find(z=>z.ids.includes(p.id));assert.ok(p.x>=z.x&&p.x+240<=z.x+z.width);assert.ok(p.y>=z.y&&p.y+140<=z.y+z.height);}
 people[0].x+=12;const x=people[0].x;layoutPeople(people);assert.equal(people[0].x,x);
});
test('Удаление влияния меняет сигнал риска без выдуманной вероятности сделки',()=>{
 const data=structuredClone(seed),before=clientRisks(data,'alpha');
 data.relations=data.relations.filter(r=>r.id!=='r8');
 const after=clientRisks(data,'alpha');assert.equal(after.length,before.length+1);
 assert.ok(after.some(r=>r.personId==='a2'&&r.kind==='influence'));
 assert.ok(after.every(r=>seed.people.find(p=>p.id===r.personId).companyId==='alpha'));
});
test('Бриф использует автора и записи выбранного человека',()=>{
 const brief=meetingBrief(seed,'a2');assert.match(brief,/Анна Соколова/);assert.match(brief,/Елена Смирнова/);assert.match(brief,/модернизации ЦОД/);assert.doesNotMatch(brief,/технический аудит/);
});
