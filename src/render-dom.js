// Vendored morphdom is served with the application; no CDN or runtime build.
const morphdom=typeof document.createElement==='function'?(await import('./vendor/morphdom.js')).default:null;
function nodeKey(node){
 if(node.nodeType!==1)return;
 return node.id||((node.hasAttribute('name')&&/^(INPUT|SELECT|TEXTAREA)$/.test(node.tagName))?'field:'+node.tagName+':'+node.getAttribute('name')+(['checkbox','radio'].includes(node.type)?':'+node.value:''):null)||node.getAttribute('data-region')||(node.hasAttribute('data-person')?'person:'+node.getAttribute('data-person'):null)||(node.hasAttribute('data-edge')?'edge:'+node.getAttribute('data-edge'):null);
}
export function patchChildren(root,html){
 if(!morphdom||!root.firstElementChild){root.innerHTML=html;return;}
 const next=root.cloneNode(false);next.innerHTML=html;
 morphdom(root,next,{childrenOnly:true,getNodeKey:nodeKey,onBeforeElUpdated(from,to){
   // Disclosure state and the mascot's live gaze belong to the user, not the template.
   if(from.classList?.contains('app')&&from.classList.contains('canvas-focus'))to.classList.add('canvas-focus');
   if(from.id==='map-wrap')for(const name of ['can-pan','is-panning'])to.classList.toggle(name,from.classList.contains(name));
   if(from.tagName==='DETAILS')to.open=from.open;
   if(from.classList?.contains('cursor-eyes'))return false;
   if(from===document.activeElement&&from.id==='search'&&from.value===to.value)return false;
   if(/^(INPUT|SELECT|TEXTAREA)$/.test(from.tagName)||from.querySelector('input,select,textarea'))return true;
   return !from.isEqualNode(to);
 }});
}
