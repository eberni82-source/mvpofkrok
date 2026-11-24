import test from 'node:test';
import assert from 'node:assert/strict';
import {bezierFor,segmentBlocked} from '../src/graph/curves.js';
const card=(id,x,y)=>({id,x,y});
test('Связь огибает промежуточную карточку и заканчивается на границах',()=>{
 const a=card('a',20,100),middle=card('m',350,100),b=card('b',680,100);
 const route=bezierFor(a,b,'influences',[a,middle,b]);
 assert.equal(route.blocked,false);
 assert.equal(route.points[0].x,260);assert.equal(route.points.at(-1).x,680);
 const obstacle={left:middle.x,top:middle.y,right:middle.x+240,bottom:middle.y+140};
 for(let i=1;i<route.points.length;i++) assert.equal(segmentBlocked(route.points[i-1],route.points[i],[obstacle]),false);
 assert.doesNotMatch(route.d,/NaN|Infinity/);
});
test('Подчинение и обратное влияние используют разные порты',()=>{
 const a=card('a',100,100),b=card('b',100,300);
 assert.notEqual(bezierFor(a,b,'reports_to').points[0].x,bezierFor(b,a,'influences').points.at(-1).x);
});
test('Перекрытые карточки не порождают ложную линию через узел',()=>{
 const a=card('a',100,100),b=card('b',110,110);
 assert.equal(bezierFor(a,b,'influences').blocked,true);
});
