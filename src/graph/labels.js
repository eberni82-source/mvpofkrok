// A label may be omitted on a crowded segment; its relation remains selectable.
const intersects=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
export function placeLabel(route,width,nodes,occupied){
 const obstacles=[...occupied,...nodes.map(p=>({left:p.x-10,right:p.x+250,top:p.y-10,bottom:p.y+150}))];
 const segments=route.points.slice(1).map((b,i)=>({a:route.points[i],b,length:Math.hypot(b.x-route.points[i].x,b.y-route.points[i].y)})).sort((a,b)=>Number(b.a.y===b.b.y)-Number(a.a.y===a.b.y)||b.length-a.length);
 for(const {a,b,length} of segments){
   const horizontal=a.y===b.y,needed=horizontal?width+20:44;if(length<needed)continue;
   const inset=horizontal?width/2+8:20;
   for(const fraction of [.5,.25,.75,0,1]){
     const distance=Math.max(inset,Math.min(length-inset,length*fraction));
     const x=a.x+(b.x-a.x)*distance/length,y=a.y+(b.y-a.y)*distance/length;
     const rect={left:x-width/2-6,right:x+width/2+6,top:y-17,bottom:y+17};
     if(rect.left<4||rect.top<4||obstacles.some(other=>intersects(rect,other)))continue;
     occupied.push(rect);return {x,y,rect};
   }
 }
 return null;
}
