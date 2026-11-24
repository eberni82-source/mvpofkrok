import {hasGaps, lastTouch, daysSince} from './model.js';
export const MODES = {org:'Структура',influence:'Влияние',process:'Закупка',sandbox:'Песочница'};
export function layoutPeople(people) {
  const departments=[...new Set(people.map(p=>p.department))];
  let y=32;
  const zones=[];
  for(let i=0;i<departments.length;i+=2){
    const row=departments.slice(i,i+2);
    const height=Math.max(...row.map(dep=>Math.ceil(people.filter(p=>p.department===dep).length)))*172+92;
    row.forEach((dep,col)=>{
      const members=people.filter(p=>p.department===dep);
      zones.push({name:dep,x:20+col*418,y,width:398,height:height-20,ids:members.map(p=>p.id)});
      members.forEach((p,j)=>{if(p.layoutVersion!==3){p.x=100+col*418;p.y=y+62+j*172;p.layoutVersion=3;}});
    });y+=height;
  }
  return {zones,width:856,height:Math.max(640,y+20)};
}
export function clientRisks(data, companyId) {
  const people=data.people.filter(p=>p.companyId===companyId);
  return people.flatMap(p=>{
    const rows=[];const add=(kind,label,reason)=>rows.push({personId:p.id,kind,label,reason});
    if(p.knows?.length===1)add('one','Один контакт КРОК',`Знаком только ${p.knows[0]}`);
    if(!lastTouch(data,p.id))add('stale','Нет касаний','Встреч ещё не было');
    else if(daysSince(lastTouch(data,p.id))>90)add('stale','Давно без общения',`Без встреч больше 90 дней`);
    if(p.role==='ЛПР'&&!data.relations.some(r=>r.target===p.id&&r.kind==='influences'))add('influence','Влияние не описано','Не записано, кто влияет на решение этого человека');
    if(hasGaps(p))add('gap','Не хватает сведений','Заполните сведения о контакте');
    return rows;
  });
}
export function meetingBrief(data, id) {
  const p=data.people.find(p=>p.id===id);if(!p)return '';
  const history=data.interactions.filter(t=>t.personId===id).sort((a,b)=>b.date.localeCompare(a.date));
  return [`Подготовка к встрече: ${p.name}`,p.position,`Темы: ${(p.topics||[]).join(', ')||'не указаны'}`,`Как общаться: ${p.style||'нужно уточнить'}`,`Знакомые КРОК: ${(p.knows||[]).join(', ')||'неизвестны'}`,`Следующий шаг: ${p.nextStep||'согласовать'}`,'Последние касания:',...history.slice(0,3).map(t=>`${t.date} · ${t.author}: ${t.summary}`)].join('\n');
}
