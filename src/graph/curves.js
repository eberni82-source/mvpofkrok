// Rectilinear routing with rounded corners. Card bounds are shared with CSS.
export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 140;
const CLEARANCE = 12;
const key = (x, y) => `${x},${y}`;
const inside = (p, r) => p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom;
export function segmentBlocked(a, b, obstacles) {
  return obstacles.some(r => a.x === b.x
    ? a.x > r.left && a.x < r.right && Math.max(a.y,b.y) > r.top && Math.min(a.y,b.y) < r.bottom
    : a.y > r.top && a.y < r.bottom && Math.max(a.x,b.x) > r.left && Math.min(a.x,b.x) < r.right);
}
// Stable min-heap avoids sorting the entire frontier on every routing step.
class Frontier {
  constructor(){this.items=[];this.order=0;}
  less(a,b){return a.cost<b.cost||a.cost===b.cost&&a.order<b.order;}
  push(item){item.order=this.order++;const a=this.items;a.push(item);let i=a.length-1;while(i){const p=(i-1)>>1;if(!this.less(a[i],a[p]))break;[a[i],a[p]]=[a[p],a[i]];i=p;}}
  pop(){const a=this.items,first=a[0],last=a.pop();if(a.length){a[0]=last;let i=0;while(true){let n=i,l=i*2+1,r=l+1;if(l<a.length&&this.less(a[l],a[n]))n=l;if(r<a.length&&this.less(a[r],a[n]))n=r;if(n===i)break;[a[i],a[n]]=[a[n],a[i]];i=n;}}return first;}
  get length(){return this.items.length;}
}
function pathThrough(start, end, rectangles) {
  const xs = [...new Set([start.x,end.x,...rectangles.flatMap(r=>[r.left,r.right])])].sort((a,b)=>a-b);
  const ys = [...new Set([start.y,end.y,...rectangles.flatMap(r=>[r.top,r.bottom])])].sort((a,b)=>a-b);
  const points = new Map();
  for(let xi=0;xi<xs.length;xi++) for(let yi=0;yi<ys.length;yi++) {
    const p={x:xs[xi],y:ys[yi],xi,yi};
    if(!rectangles.some(r=>inside(p,r))) points.set(key(p.x,p.y),p);
  }
  const first=points.get(key(start.x,start.y));
  if(!first)return null;
  const open=new Frontier();open.push({p:first,cost:0,dir:'',route:[start]});
  const best=new Map();
  while(open.length) {
    const current=open.pop(),{p,dir,cost,route}=current;
    const state=key(p.x,p.y)+dir;
    if(best.has(state)&&best.get(state)<cost)continue;
    if(p.x===end.x&&p.y===end.y)return route;
    for(const [dx,dy,nextDir] of [[1,0,'x'],[-1,0,'x'],[0,1,'y'],[0,-1,'y']]) {
      const next=points.get(key(xs[p.xi+dx],ys[p.yi+dy]));
      if(!next||segmentBlocked(p,next,rectangles))continue;
      const nextCost=cost+Math.abs(next.x-p.x)+Math.abs(next.y-p.y)+(dir&&dir!==nextDir?28:0);
      const nextKey=key(next.x,next.y)+nextDir;
      if(best.has(nextKey)&&best.get(nextKey)<=nextCost)continue;
      best.set(nextKey,nextCost);open.push({p:next,cost:nextCost,dir:nextDir,route:[...route,next]});
    }
  }
  return null;
}
function simplify(points) {
  return points.filter((p,i)=>!i||i===points.length-1||!(points[i-1].x===p.x&&p.x===points[i+1].x||points[i-1].y===p.y&&p.y===points[i+1].y));
}
function rounded(points) {
  let d=`M ${points[0].x} ${points[0].y}`;
  for(let i=1;i<points.length-1;i++) {
    const a=points[i-1],b=points[i],c=points[i+1];
    const prev=Math.hypot(b.x-a.x,b.y-a.y),next=Math.hypot(c.x-b.x,c.y-b.y);
    const radius=Math.min(12,prev/2,next/2);
    const entry={x:b.x+(a.x-b.x)*radius/prev,y:b.y+(a.y-b.y)*radius/prev};
    const exit={x:b.x+(c.x-b.x)*radius/next,y:b.y+(c.y-b.y)*radius/next};
    d+=` L ${entry.x} ${entry.y} C ${b.x} ${b.y}, ${b.x} ${b.y}, ${exit.x} ${exit.y}`;
  }
  const end=points.at(-1);return d+` L ${end.x} ${end.y}`;
}
export function bezierFor(source,target,kind='reports_to',nodes=[source,target],lane=0) {
  const offset=(kind==='influences'? -16:kind==='works_with'?16:0)+lane*8;
  const vertical=Math.abs(target.y-source.y)>=NODE_HEIGHT+24 && Math.abs(target.x-source.x)<NODE_WIDTH;
  let from,to,start,end;
  if(vertical) {
    const down=target.y>source.y;
    from={x:source.x+NODE_WIDTH/2+offset,y:source.y+(down?NODE_HEIGHT:0)};
    to={x:target.x+NODE_WIDTH/2+offset,y:target.y+(down?0:NODE_HEIGHT)};
    start={x:from.x,y:from.y+(down?CLEARANCE:-CLEARANCE)};
    end={x:to.x,y:to.y+(down?-CLEARANCE:CLEARANCE)};
  } else {
    const right=target.x>source.x;
    from={x:source.x+(right?NODE_WIDTH:0),y:source.y+NODE_HEIGHT/2+offset};
    to={x:target.x+(right?0:NODE_WIDTH),y:target.y+NODE_HEIGHT/2+offset};
    start={x:from.x+(right?CLEARANCE:-CLEARANCE),y:from.y};
    end={x:to.x+(right?-CLEARANCE:CLEARANCE),y:to.y};
  }
  const obstacles=nodes.map(p=>({left:p.x-CLEARANCE,right:p.x+NODE_WIDTH+CLEARANCE,top:p.y-CLEARANCE,bottom:p.y+NODE_HEIGHT+CLEARANCE}));
  const route=pathThrough(start,end,obstacles);
  // Overlapping cards may make a route impossible. Show no misleading line through people.
  if(!route)return {d:'',points:[],blocked:true,labelX:0,labelY:0};
  const points=simplify([from,...route,to]);
  const segments=points.slice(1).map((p,i)=>({a:points[i],b:p,length:Math.hypot(p.x-points[i].x,p.y-points[i].y)}));
  const horizontal=segments.filter(s=>s.a.y===s.b.y&&s.length>=120);
  const label=(horizontal.length?horizontal:segments).sort((a,b)=>b.length-a.length)[0];
  return {d:rounded(points),points,blocked:false,labelX:(label.a.x+label.b.x)/2,labelY:(label.a.y+label.b.y)/2,labelLength:label.length};
}
