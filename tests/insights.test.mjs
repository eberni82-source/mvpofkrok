import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decisionInsights} from '../src/insights.js';
const data={people:[{id:'a',companyId:'one',name:'ЛПР',role:'ЛПР',influence:'high'},{id:'b',companyId:'one',name:'Эксперт',attitude:'unknown'},{id:'c',companyId:'two',name:'Чужой',role:'ЛПР'}],relations:[{kind:'influences',source:'b',target:'a'}]};
test('Разбор закупки ограничен участниками и клиентом; пропуск не выдумывает путь',()=>{
 const rows=decisionInsights(data,'one',{participantIds:['a','c']});
 assert.equal(rows[0].personId,'a');assert.equal(rows[1].personId,undefined);
 assert.equal(rows.some(r=>r.personId==='c'),false);
});
test('Путь доступа основан на направленной связи; пробел получает объяснение',()=>{
 const rows=decisionInsights(data,'one',{participantIds:['a','b']});
 assert.equal(rows[1].personId,'b');assert.equal(rows[2].personId,'b');
 assert.match(rows[2].basis,/отношение/);
 const reversed=decisionInsights({...data,relations:[{kind:'influences',source:'a',target:'b'}]},'one');
 assert.equal(reversed[1].personId,undefined);
});
