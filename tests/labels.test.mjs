import test from 'node:test';
import assert from 'node:assert/strict';
import {placeLabel} from '../src/graph/labels.js';
const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
test('Подписи близких параллельных связей не перекрываются',()=>{
 const occupied=[];const first=placeLabel({points:[{x:20,y:100},{x:500,y:100}]},110,[],occupied);
 const second=placeLabel({points:[{x:20,y:116},{x:500,y:116}]},110,[],occupied);
 assert.ok(first);assert.ok(second);assert.equal(overlaps(first.rect,second.rect),false);
});
test('Подпись не закрывает карточку; в тесном коридоре скрывается',()=>{
 const nodes=[{x:170,y:30}];const p=placeLabel({points:[{x:20,y:110},{x:600,y:110}]},110,nodes,[]);
 assert.ok(p);assert.equal(overlaps(p.rect,{left:160,right:420,top:20,bottom:180}),false);
 assert.equal(placeLabel({points:[{x:20,y:100},{x:70,y:100}]},110,[],[]),null);
});
