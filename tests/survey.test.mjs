import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../src/data/seed.js';
import {recordMeeting, surveyQuestions, conflictingFields} from '../src/survey.js';
import {hasGaps} from '../src/model.js';
import {MockRepository} from '../src/data/repository.js';
const input = (extra={}) => ({companyId:'alpha',participantIds:['a4'],date:'2026-11-24',type:'Встреча',author:'  Эдем  ',summary:'Уточнили бюджет и следующий контакт.',answers:{},...extra});
const save = (data, extra={}) => recordMeeting(data,input(extra),'2026-11-24');

test('Вопросы зависят от пробелов; заполненные оценки доступны для уточнения',()=>{
  const complete=seed.people.find(p=>p.id==='a2'), sparse=seed.people.find(p=>p.id==='a4');
  assert.deepEqual(surveyQuestions(complete),['nextStep']);
  assert.deepEqual(surveyQuestions(sparse),['attitude','style','knows','nextStep']);
  assert.ok(surveyQuestions(complete,true).includes('attitude'));
});
test('Опрос дополняет карточку, историю и влияние без обновления всех старых сведений',()=>{
  const before=structuredClone(seed);
  const result=save(seed,{answers:{a4:{attitude:'positive',style:'Коротко, с расчётом бюджета',knows:'Эдем, Елена Смирнова, Эдем',nextStep:'Прислать расчёт',influencedBy:'a5'}}});
  const p=result.data.people.find(p=>p.id==='a4');
  assert.equal(hasGaps(p),false);
  assert.deepEqual(p.knows,['Эдем','Елена Смирнова']);
  assert.equal(p.fieldMeta.attitude.author,'Эдем');
  assert.equal(p.fieldMeta.attitude.date,'2026-11-24');
  assert.equal(p.confirmedAt,'2026-05-10');
  assert.equal(p.source,'CRM');
  assert.equal(p.nextStep,'Прислать расчёт');
  assert.ok(result.data.relations.some(r=>r.source==='a5'&&r.target==='a4'&&r.kind==='influences'));
  assert.equal(result.data.interactions.at(-1).surveyAnswers.length,4);
  assert.deepEqual(seed,before);
});
test('Одно касание с несколькими участниками имеет общую встречу и отдельные ответы',()=>{
  const {data}=save(seed,{participantIds:['a4','a8','a4'],answers:{a4:{style:'Кратко'},a8:{style:'Подробно'}}});
  const events=data.interactions.slice(-2);
  assert.equal(events.length,2);
  assert.equal(events[0].meetingId,events[1].meetingId);
  assert.deepEqual(events[0].participantIds,['a4','a8']);
  assert.equal(data.people.find(p=>p.id==='a4').style,'Кратко');
  assert.equal(data.people.find(p=>p.id==='a8').style,'Подробно');
});
test('Пропуск и «Не знаю» оставляют пробелы, заметка не создаёт вымышленных оценок',()=>{
  const {data}=save(seed,{answers:{a4:{attitude:'__unknown__',style:'',knows:' ',influencedBy:'__unknown__'}}});
  assert.deepEqual(data.people,seed.people);
  assert.deepEqual(data.relations,seed.relations);
  assert.equal(data.interactions.at(-1).surveyAnswers.length,0);
});
test('Расхождение не усредняется и не заменяет прежнее мнение',()=>{
  const first=save(seed,{answers:{a4:{attitude:'positive'}}});
  const second=save(first.data,{author:'Эрнест',answers:{a4:{attitude:'skeptical'}}});
  const p=second.data.people.find(p=>p.id==='a4');
  assert.equal(p.attitude,'positive');
  assert.deepEqual(conflictingFields(p),['attitude']);
  assert.deepEqual(p.observations.filter(o=>o.field==='attitude').map(o=>[o.author,o.value]),[['Эдем','positive'],['Эрнест','skeptical']]);
  assert.equal(second.data.interactions.at(-1).surveyAnswers[0].conflict,true);
  assert.equal(second.conflicts.length,1);
});
test('Расхождение с исходными данными сохраняет источник, не выдумывая автора',()=>{
  const {data}=save(seed,{participantIds:['a2'],answers:{a2:{attitude:'skeptical'}}});
  const p=data.people.find(p=>p.id==='a2');
  assert.equal(p.observations[0].source,'Протокол встречи');
  assert.match(p.observations[0].author,/автор не указан/);
  assert.equal(p.attitude,'positive');
});
test('Ошибки участников, дат и связей отклоняют всю операцию без частичных записей',()=>{
  const before=structuredClone(seed);
  for(const extra of [
    {participantIds:[]},{participantIds:['v1']},{author:' '}, {date:'2026-11-25'},
    {date:'2026-02-30'}, {answers:{a4:{style:'Новый стиль',influencedBy:'v1'}}},
    {answers:{a4:{influencedBy:'a4'}}}, {answers:{a4:{attitude:'invented'}}},
  ]) assert.throws(()=>save(seed,extra));
  assert.deepEqual(seed,before);
});
test('Существующая связь влияния не дублируется',()=>{
  const {data}=save(seed,{participantIds:['a2'],answers:{a2:{influencedBy:'a6'}}});
  assert.equal(data.relations.length,seed.relations.length);
});
test('Ответы, авторство и расхождения переживают сохранение и повторную загрузку',()=>{
  const store=new Map();
  globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  const repo=new MockRepository();
  const result=save(repo.load(),{participantIds:['a2'],answers:{a2:{attitude:'skeptical'}}});
  repo.save(result.data);
  const restored=repo.load();
  assert.deepEqual(restored,result.data);
  assert.deepEqual(conflictingFields(restored.people.find(p=>p.id==='a2')),['attitude']);
});
