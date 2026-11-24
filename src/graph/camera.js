export const CANVAS_PADDING=2048;
export const MIN_ZOOM=.25, MAX_ZOOM=2;
export const clampZoom=value=>Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,value));
export function zoomAnchor(camera,nextZoom,point){
 const zoom=clampZoom(nextZoom);
 return {zoom,left:(camera.left+point.x)/camera.zoom*zoom-point.x,top:(camera.top+point.y)/camera.zoom*zoom-point.y};
}
export function frameNodes(nodes,size){
 if(!nodes.length)return {zoom:1,left:0,top:0};
 const left=Math.min(...nodes.map(p=>p.x))-32,top=Math.min(...nodes.map(p=>p.y))-32;
 const right=Math.max(...nodes.map(p=>p.x+240))+32,bottom=Math.max(...nodes.map(p=>p.y+140))+32;
 const zoom=clampZoom(Math.min(size.width/(right-left),size.height/(bottom-top),1));
 return {zoom,left:(left+right)/2*zoom-size.width/2,top:(top+bottom)/2*zoom-size.height/2};
}
