import {clampZoom,zoomAnchor,frameNodes} from './camera.js';
export function installCanvas(root,{getZoom,setZoom,getNodes,getSelected,getCompany,getPadding,hasModal}){
 let hand=false,space=false,pan=null,suppress=false,company=getCompany(),focused=false,pageScroll=null,viewReady=false;
 const viewport=()=>root.querySelector('#map-wrap');
 const editing=e=>e.target?.closest?.('input,textarea,select,[contenteditable="true"]')||document.querySelector('[role="dialog"]');
 function afterRender(){
   const wrap=viewport();if(!wrap)return;
   if(!viewReady||company!==getCompany()){company=getCompany();viewReady=true;wrap.scrollLeft=getPadding()*getZoom();wrap.scrollTop=getPadding()*getZoom();}
   wrap.classList.toggle('can-pan',hand||space);wrap.classList.toggle('is-panning',!!pan);
   const app=root.querySelector('.app');app?.classList.toggle('canvas-focus',focused);
   for(const button of root.querySelectorAll('[data-canvas-action="hand"]')){button.setAttribute('aria-pressed',String(hand));button.classList.toggle('active',hand);}
   for(const button of root.querySelectorAll('[data-canvas-action="focus"]')){button.setAttribute('aria-pressed',String(focused));button.textContent=focused?'Закрыть холст':'Режим холста';}
 }
 function apply(camera){const wrap=viewport();if(!wrap)return;setZoom(camera.zoom);wrap.scrollLeft=Math.max(0,camera.left);wrap.scrollTop=Math.max(0,camera.top);}
 function zoom(value,point){const wrap=viewport();if(!wrap)return;apply(zoomAnchor({zoom:getZoom(),left:wrap.scrollLeft,top:wrap.scrollTop},value,point||{x:wrap.clientWidth/2,y:wrap.clientHeight/2}));}
 function fit(){const wrap=viewport();if(wrap)apply(frameNodes(getNodes(),{width:wrap.clientWidth,height:wrap.clientHeight}));}
 function centerSelection(){const p=getSelected(),wrap=viewport();if(!p||!wrap)return;wrap.scrollLeft=Math.max(0,(p.x+120)*getZoom()-wrap.clientWidth/2);wrap.scrollTop=Math.max(0,(p.y+70)*getZoom()-wrap.clientHeight/2);}
 function focus(){focused=!focused;if(focused)pageScroll={left:window.scrollX,top:window.scrollY};document.body.classList.toggle('canvas-focused',focused);afterRender();if(!focused&&pageScroll)window.scrollTo(pageScroll.left,pageScroll.top);}
 root.addEventListener('click',e=>{if(suppress){suppress=false;e.preventDefault();e.stopImmediatePropagation();return;}const b=e.target.closest('[data-canvas-action]');if(!b)return;e.preventDefault();e.stopPropagation();switch(b.dataset.canvasAction){case 'hand':hand=!hand;afterRender();break;case 'fit':fit();break;case 'selected':centerSelection();break;case 'focus':focus();break;case 'in':zoom(getZoom()*1.15);break;case 'out':zoom(getZoom()/1.15);break;case 'reset':zoom(1);break;}},{capture:true});
 root.addEventListener('wheel',e=>{const wrap=e.target.closest('#map-wrap');if(!wrap||(!e.ctrlKey&&!e.metaKey)||hasModal())return;e.preventDefault();const r=wrap.getBoundingClientRect();zoom(clampZoom(getZoom()*Math.exp(-e.deltaY*.007)),{x:e.clientX-r.left,y:e.clientY-r.top});},{passive:false});
 root.addEventListener('pointerdown',e=>{const wrap=e.target.closest('#map-wrap');const background=!e.target.closest('.person-node,.edge-group,.map-hud,button,a,input,select,textarea');if(!wrap||hasModal()||!(e.button===1||e.button===0&&(hand||space||background)))return;if(e.target.closest('.map-hud'))return;e.preventDefault();e.stopPropagation();pan={id:e.pointerId,x:e.clientX,y:e.clientY,left:wrap.scrollLeft,top:wrap.scrollTop,moved:false};wrap.focus({preventScroll:true});wrap.setPointerCapture(e.pointerId);afterRender();},{capture:true});
 root.addEventListener('pointermove',e=>{if(!pan||pan.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();const wrap=viewport(),dx=e.clientX-pan.x,dy=e.clientY-pan.y;pan.moved ||=Math.abs(dx)+Math.abs(dy)>4;wrap.scrollLeft=pan.left-dx;wrap.scrollTop=pan.top-dy;},{capture:true});
 function finish(e){if(!pan||pan.id!==e.pointerId)return;e.stopPropagation();suppress=pan.moved&&e.button===0;pan=null;afterRender();}
 root.addEventListener('pointerup',finish,{capture:true});root.addEventListener('pointercancel',()=>{pan=null;suppress=false;space=false;afterRender();},{capture:true});
 window.addEventListener('keydown',e=>{
   if(e.key==='Escape'&&focused&&!hasModal()&&!document.querySelector('[role="dialog"]')){e.preventDefault();focus();return;}
   if(editing(e)||hasModal())return;
   if(e.key==='/'){e.preventDefault();const search=root.querySelector('#search');search?.focus({preventScroll:true});search?.select();return;}
   if(e.code==='Space'&&!e.target?.closest?.('.edge-group,button:not(.person-node)')){e.preventDefault();space=true;afterRender();return;}
   if(e.ctrlKey||e.metaKey||e.altKey)return;
   if(e.key==='+'||e.key==='='){e.preventDefault();zoom(getZoom()*1.15);}
   if(e.key==='-'){e.preventDefault();zoom(getZoom()/1.15);}
   if(e.key==='0'){e.preventDefault();zoom(1);}
   if(e.shiftKey&&e.code==='Digit1'){e.preventDefault();fit();}
   if(e.shiftKey&&e.code==='Digit2'){e.preventDefault();centerSelection();}
 });
 window.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;afterRender();}});
 window.addEventListener('blur',()=>{space=false;pan=null;suppress=false;afterRender();});
 return {afterRender,zoom,fit,centerSelection};
}
