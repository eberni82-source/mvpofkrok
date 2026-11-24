import test from 'node:test';
import assert from 'node:assert/strict';
import {zoomAnchor,frameNodes,clampZoom} from '../src/graph/camera.js';
test('При масштабировании мировая точка под указателем остаётся на месте',()=>{
 const camera={zoom:1,left:120,top:340},point={x:250,y:120};const next=zoomAnchor(camera,1.5,point);
 assert.equal((camera.left+point.x)/camera.zoom,(next.left+point.x)/next.zoom);
 assert.equal((camera.top+point.y)/camera.zoom,(next.top+point.y)/next.zoom);
 assert.equal(clampZoom(20),2);assert.equal(clampZoom(.01),.25);
});
test('Вписывание вмещает карточки и корректно работает с пустой картой',()=>{
 const nodes=[{x:100,y:50},{x:600,y:900}],size={width:800,height:600},c=frameNodes(nodes,size);
 assert.ok((840+32)*c.zoom-c.left<=size.width+.001);assert.ok((1040+32)*c.zoom-c.top<=size.height+.001);
 assert.ok(68*c.zoom-c.left>=-.001);assert.deepEqual(frameNodes([],size),{zoom:1,left:0,top:0});
});
