import test from 'node:test';
import assert from 'node:assert/strict';
import {ApiRepository} from '../src/data/api.js';
function environment(handler){const events=[];globalThis.window={dispatchEvent:e=>events.push(e.detail)};globalThis.fetch=handler;return events;}
test('API сохраняет очередь снимков последовательно с новой ревизией и CSRF',async()=>{
 const writes=[];environment(async(url,options)=>{if(!options)return {ok:true,json:async()=>({revision:4,data:{people:[]}})};const b=JSON.parse(options.body);writes.push([b,options.headers]);return {ok:true,json:async()=>({revision:b.revision+1})};});
 const repo=await new ApiRepository({csrf:'test-only'}).init();const data={people:[{name:'Первое'}]};repo.save(data);data.people[0].name='Второе';await repo.save(data);
 assert.deepEqual(writes.map(([b])=>b.revision),[4,5]);assert.equal(writes[0][0].data.people[0].name,'Первое');assert.equal(writes[1][1]['X-CSRF-Token'],'test-only');
});
test('При конфликте запись останавливается, несохранённый снимок остаётся доступен',async()=>{
 let writes=0;const events=environment(async()=>{writes++;return {ok:false,json:async()=>({detail:'Конфликт ревизий'})};});
 const repo=new ApiRepository({csrf:'test-only'});repo.save({people:['первое']});await repo.save({people:['последнее']});assert.equal(writes,1);assert.equal(repo.failed,true);assert.deepEqual(repo.current.people,['последнее']);assert.equal(events.at(-1).state,'error');
});
test('Ошибка соединения не считается успешным сохранением',async()=>{
 const events=environment(async()=>{throw new Error('offline');});const repo=new ApiRepository({csrf:'test-only'});await repo.save({people:[]});assert.equal(repo.failed,true);assert.equal(events.some(e=>e.state==='saved'),false);
});
