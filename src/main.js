import { CANVAS_PADDING } from './graph/camera.js';
import { placeLabel } from './graph/labels.js';
import { patchChildren } from './render-dom.js';
import { installCanvas } from './graph/canvas.js';
import { decisionInsights } from './insights.js';
import { MockRepository } from './data/repository.js';
import { ATTITUDE_LABELS, ATTITUDE_OPTIONS, INFLUENCE_LABELS, ROLE_OPTIONS, RELATION_LABELS, companyPeople, interactionsFor, hasGaps, isStale, lastTouch, uniqueId, escapeHtml, visiblePeople, validateRelation, daysSince, compareInteractions } from './model.js';
import { surveyQuestions, SURVEY_FIELDS, recordMeeting, conflictingFields, answerLabel } from './survey.js';
import { MODES, layoutPeople, clientRisks, meetingBrief } from './workspace.js';
import { contactsCsv } from './export.js';
import { eyes } from './mascot.js';
import { bezierFor } from './graph/curves.js';

// Адаптер выбирается при загрузке: серверный API или отдельное статическое демо.
const repository = window.cursorRepository || new MockRepository();
let data = repository.load();
const defaultFilters = () => ({search:'',department:'',role:'',gapsOnly:false,oneThreadOnly:false,staleOnly:false,coverageOnly:false});
const ui = {mode:'org',collapsed:[],original:null,risksOnly:false,companyId:data.companies[0]?.id, personId:data.people[0]?.id, filters:defaultFilters(), layers:{reports_to:true,influences:true,works_with:true}, zoom:1, modal:null, edgeId:null, toast:'', timer:null};
const root=document.getElementById('app');
let canvas=null, previousModal=null, modalOpener=null;
const routeCache=new Map();
const h=escapeHtml;
const person=(id)=>data.people.find(p=>p.id===id);
const currentDeal=()=>data.deals?.find(d=>d.id===ui.dealId&&d.companyId===ui.companyId)||data.deals?.find(d=>d.companyId===ui.companyId);
const currentCompany=()=>data.companies.find(c=>c.id===ui.companyId);
const people=()=>companyPeople(data,ui.companyId);
const visible=()=>visiblePeople(data,ui.companyId,ui.filters).filter(p=>(!ui.filters.staleOnly||!lastTouch(data,p.id)||daysSince(lastTouch(data,p.id))>90)&&(!['process','sandbox'].includes(ui.mode)||currentDeal()?.participantIds.includes(p.id))&&(!ui.collapsed.includes(p.department))&&(!ui.risksOnly||clientRisks(data,ui.companyId).some(r=>r.personId===p.id))&&(!ui.filters.coverageOnly||(p.role!=='Неизвестна'&&lastTouch(data,p.id)&&daysSince(lastTouch(data,p.id))<=90)));
const allTouches=()=>data.interactions.filter(t=>t.companyId===ui.companyId).sort(compareInteractions);
const eDate=(d)=>d?new Date(d+'T00:00:00').toLocaleDateString('ru-RU',{day:'2-digit',month:'short',year:'numeric'}):'Нет данных';
const opt=(values,current)=>values.map(([value,label])=>`<option value="${h(value)}" ${value===current?'selected':''}>${h(label)}</option>`).join('');
const textOption=(values,current)=>values.map(value=>`<option value="${h(value)}" ${value===current?'selected':''}>${h(value)}</option>`).join('');
const A=(label,value)=>`<div class="info-row"><span>${h(label)}</span><strong>${h(value||'Не указано')}</strong></div>`;
const initials=(name)=>name.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase();
const saveData=()=>{if(!ui.original)repository.save(data);};
const update=(cb)=>{if(repository.failed){toast('Запись остановлена. Скачайте правки перед обновлением страницы.');return;}cb();saveData();render();};
const toast=(message)=>{ui.toast=message;render();clearTimeout(ui.timer);ui.timer=setTimeout(()=>{ui.toast='';root.querySelector('.toast')?.remove();},6500)};

function stats(){const all=people();return {coverage:all.filter(p=>p.role!=='Неизвестна'&&lastTouch(data,p.id)&&daysSince(lastTouch(data,p.id))<=90).length, stale:all.filter(p=>!lastTouch(data,p.id)||daysSince(lastTouch(data,p.id))>90).length, one:all.filter(p=>p.knows?.length===1).length, gaps:all.filter(hasGaps).length};}
function decisionDesk(){const rows=decisionInsights(data,ui.companyId,currentDeal());return `<section data-region="decision-desk" class="decision-desk" aria-label="Разбор закупки"><div class="desk-intro"><span class="eyebrow">В ФОКУСЕ</span><strong>${h(currentDeal()?.name||currentCompany()?.topic||'Клиент')}</strong><button class="text-button" data-action="explain-analysis">Почему эти параметры</button></div>${rows.map((r,i)=>`<button class="insight-card insight-${r.kind}" data-action="inspect-insight" data-index="${i}"><span class="insight-label">${h(r.label)}</span><strong>${h(r.title)}</strong><span>${h(r.detail)}</span><small>Открыть основание</small></button>`).join('')}</section>`;}
function header(){const c=currentCompany(),s=stats();return `
<header data-region="header" class="topbar"><div class="brand"><button class="cursor-brand brand-mascot-button" data-action="preview-loader" aria-label="Cursor — посмотреть маскота" title="Посмотреть маскота Cursor">${eyes()}<span class="cursor-wordmark">Cursor</span></button><span class="brand-divider" aria-hidden="true"></span><label class="sr-only" for="company-select">Компания</label><select id="company-select" class="top-select">${data.companies.map(x=>`<option value="${h(x.id)}" ${x.id===ui.companyId?'selected':''}>${h(x.name)}</option>`).join('')}</select></div><div class="header-tools">${window.cursorAccount?'<button class="btn" data-action="account">Команда</button>':''}</div></header>
<div data-region="page-heading" class="page-heading"><div><h1>Карта клиента</h1></div><div class="top-actions"><button class="btn" data-action="new-person">+ Контакт</button><button class="btn primary" data-action="new-touch">Записать встречу</button></div></div>
<nav data-region="modes" class="mode-tabs" aria-label="Режим карты">${Object.entries(MODES).map(([key,label])=>`<button data-action="mode" data-mode="${key}" class="mode-tab ${ui.mode===key?'active':''}" aria-current="${ui.mode===key?'page':'false'}">${label}</button>`).join('')}</nav>
<div data-region="meta" class="meta-bar"><div class="quick-filters"><button class="chip ${ui.filters.coverageOnly?'active':''}" data-action="coverage" aria-pressed="${ui.filters.coverageOnly?'true':'false'}"><span class="chip-label">На связи</span><b>${s.coverage} из ${people().length}</b></button><button class="chip ${ui.filters.staleOnly?'active':''}" data-action="toggle-stale" aria-pressed="${ui.filters.staleOnly?'true':'false'}"><span class="chip-label">Без общения более 90 дней</span><b>${s.stale}</b></button><button class="chip ${ui.filters.oneThreadOnly?'active':''}" data-action="toggle-one" aria-pressed="${ui.filters.oneThreadOnly?'true':'false'}"><span class="chip-label">Один знакомый в КРОК</span><b>${s.one}</b></button><button class="chip ${ui.filters.gapsOnly?'active':''}" data-action="toggle-gaps" aria-pressed="${ui.filters.gapsOnly?'true':'false'}"><span class="chip-label">Нужно дополнить</span><b>${s.gaps}</b></button></div><button class="text-button" data-action="export">Экспорт CSV</button></div>
${['process','sandbox'].includes(ui.mode)?`<div data-region="deal" class="deal-bar"><div><span class="deal-caption">Закупка</span><strong>${h(currentDeal()?.name)}</strong><span class="hint">${h(currentDeal()?.stage)}</span><span class="deal-next">${h(currentDeal()?.nextStep)}</span></div><button class="btn" data-action="edit-deal">Настроить закупку</button></div>`:''}
${ui.original?`<div data-region="sandbox" class="sandbox-actions"><button class="btn" data-action="reset-sandbox">Начать заново</button><button class="btn primary" data-action="exit-sandbox">Выйти</button></div>`:''}`;}

function sidebar(){const arr=people(),deps=[...new Set(arr.map(p=>p.department))].sort();return `<aside data-region="filters" class="panel sidebar">
<div><label for="search" class="search-control"><span class="sr-only">Поиск</span><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input id="search" class="search" type="search" placeholder="Имя, должность, тема" value="${h(ui.filters.search)}" /></label>
<label class="field"><span>Подразделение</span><select id="department-filter"><option value="" ${!ui.filters.department?'selected':''}>Все подразделения</option>${textOption(deps,ui.filters.department)}</select></label>
<label class="field"><span>Роль в решении</span><select id="role-filter"><option value="" ${!ui.filters.role?'selected':''}>Все роли</option>${textOption(ROLE_OPTIONS,ui.filters.role)}</select></label>
<button class="text-button filter-reset" data-action="reset-filters" aria-label="Сбросить фильтры">Сбросить</button></div>
<div><div class="section-head">Подразделения</div>${deps.map(dep=>`<button class="department-toggle" data-action="fold" data-department="${h(dep)}" aria-expanded="${!ui.collapsed.includes(dep)}"><span>${h(dep)}</span><b>${arr.filter(p=>p.department===dep).length}</b></button>`).join('')}<div class="section-head" style="margin-top:20px">Контакты</div><div class="side-stat"><span class="side-stat-number">${visible().length}</span><span class="side-stat-label">из ${arr.length} на карте</span></div></div>
<details class="sidebar-footer detail-extra"><summary>О данных</summary><p class="hint">Пример на вымышленных данных. ${repository.session?'Карта хранится в базе команды.':'Правки хранятся в этом браузере.'}</p><button data-action="reset-data" class="text-button">Сбросить пример</button></details></aside>`;}
function node(p){const selected=p.id===ui.personId;const att=p.attitude||'unknown';return `<button class="person-node ${selected?'selected':''} ${isStale(p)?'stale':''}" style="left:${Number(p.x)||0}px;top:${Number(p.y)||0}px" data-person="${h(p.id)}" data-attitude="${h(att)}" data-role="${h(p.role)}" aria-pressed="${selected?'true':'false'}" title="Открыть карточку: ${h(p.name)}"><div class="node-head"><div class="avatar">${h(initials(p.name))}</div><div class="node-person"><div class="node-name">${h(p.name)}</div><div class="node-position">${h(p.position)}</div></div></div><div class="node-foot"><span class="role-badge">${h(p.role)}</span><span class="attitude"><i class="dot ${h(att)}"></i>${h(ATTITUDE_LABELS[att]||'Неизвестно')}</span></div>${conflictingFields(p).length?'<span class="opinion-flag">Есть разные оценки</span>':''}</button>`;}
function edges(nodes){ui.blockedEdges=[];
 const byId=new Map(nodes.map(p=>[p.id,p]));
 const relations=data.relations.filter(r=>r.companyId===ui.companyId&&ui.layers[r.kind]&&(ui.mode!=='org'||r.kind==='reports_to')&&byId.has(r.source)&&byId.has(r.target));
 const occupiedLabels=[];
 const geometry=nodes.map(p=>`${p.id}:${p.x},${p.y}`).join(';');
 return relations.map(r=>{
   const source=byId.get(r.source),target=byId.get(r.target);
   const key=`${r.companyId}|${r.id}|${r.kind}|${r.source}|${r.target}|${geometry}`;
   let route=routeCache.get(key);if(!route){route=bezierFor(source,target,r.kind,nodes);if(routeCache.size>=256)routeCache.delete(routeCache.keys().next().value);routeCache.set(key,route);}
   if(route.blocked){ui.blockedEdges.push(r.id);return '';}
   const labels={reports_to:'руководит',influences:'влияет',works_with:'вместе работают'};
   const label=labels[r.kind],width=label.length*7+24;
   const c=r.kind==='influences'?'#2f6fed':r.kind==='works_with'?'#8491a6':'#4c586c';
   const focused=r.source===ui.personId||r.target===ui.personId;
   const labelPosition=route.labelLength>=96&&(focused||ui.mode!=='influence')?placeLabel(route,width,nodes,occupiedLabels):null;
   const accessible=`Связь: ${source.name} — ${label} — ${target.name}`;
   return `<g class="edge-group ${focused?'connected':''} ${ui.mode==='influence'&&!focused?'dimmed':''}" data-edge="${h(r.id)}" role="button" tabindex="0" aria-label="${h(accessible)}">
     <path class="edge-hit" d="${route.d}" />
     <path class="edge-casing" d="${route.d}" fill="none"/>
     <path class="edge-halo" d="${route.d}" fill="none" stroke="${c}"/>
     <path d="${route.d}" fill="none" stroke="${c}" stroke-width="2" stroke-dasharray="${r.kind==='works_with'?'6 6':'none'}" stroke-linecap="round" ${r.kind!=='works_with'?`marker-end="url(#arrow-${r.kind})"`:''} class="edge"><title>${h(RELATION_LABELS[r.kind])}: ${h(r.note||'')}</title></path>
     ${labelPosition?`<g class="edge-label" transform="translate(${labelPosition.x},${labelPosition.y})"><rect x="${-width/2}" y="-11" width="${width}" height="22" rx="7"/><text y="4" text-anchor="middle">${label}</text></g>`:''}
   </g>`;
 }).join('');
}
function edgeMarkers(){return `<defs>${[['reports_to','#4c586c'],['influences','#2f6fed']].map(([type,color])=>`<marker id="arrow-${type}" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1 L9 5 L1 9" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></marker>`).join('')}</defs>`;}
function map(){const layout=layoutPeople(people()),arr=visible();return `<section data-region="map" class="panel map-panel"><div class="map-toolbar"><div><div class="map-title">${h(MODES[ui.mode])}</div><label class="canvas-mode-picker"><span class="sr-only">Режим карты на холсте</span><select id="canvas-mode">${Object.entries(MODES).map(([key,label])=>`<option value="${key}" ${ui.mode===key?'selected':''}>${label}</option>`).join('')}</select></label>${ui.original?'<span class="canvas-draft-note">Изменения не сохраняются</span>':''}</div><div class="layer-controls">${ui.mode!=='org'?Object.entries(RELATION_LABELS).map(([kind,label])=>`<button class="layer ${ui.layers[kind]?'active':''}" data-action="layer" data-kind="${h(kind)}" aria-pressed="${ui.layers[kind]}">${h(kind==='reports_to'?'Кто кем руководит':kind==='influences'?'Влияние':'Встречи')}</button>`).join(''):''}<button class="btn" data-action="add-relation">+ Связь</button><button class="btn canvas-toggle" data-canvas-action="focus" aria-pressed="false">Режим холста</button></div></div>
<div class="map-viewport" data-region="canvas-viewport"><div class="map-wrap" id="map-wrap" tabindex="0" aria-label="Холст контактов"><div class="map-space" id="map-space" style="width:${(layout.width+2*CANVAS_PADDING)*ui.zoom}px;height:${(layout.height+2*CANVAS_PADDING)*ui.zoom}px"><div class="map-stage" id="map-stage" style="left:${CANVAS_PADDING*ui.zoom}px;top:${CANVAS_PADDING*ui.zoom}px;width:${layout.width}px;height:${layout.height}px;transform:scale(${ui.zoom})">
${layout.zones.map(z=>`<div class="department-zone" data-department="${h(z.name)}" style="left:${z.x}px;top:${z.y}px;width:${z.width}px;height:${z.height}px"><span>${h(z.name)}</span><small>${z.ids.filter(id=>arr.some(p=>p.id===id)).length} из ${z.ids.length}</small></div>`).join('')}
<svg class="edge-layer" style="width:${layout.width}px;height:${layout.height}px" viewBox="0 0 ${layout.width} ${layout.height}" aria-label="Связи между контактами">${edgeMarkers()}${edges(arr)}</svg>${arr.map(node).join('')}${arr.length?'':'<div class="empty-graph">${eyes()}<strong>Никого не нашли</strong><button class="text-button" data-action="show-all">Показать всех</button></div>'}</div></div>
</div><div class="map-hud" role="toolbar" aria-label="Инструменты карты"><div class="hud-group"><button class="hud-button hud-pan" data-canvas-action="hand" aria-pressed="false" aria-label="Перемещение холста" title="Перемещение · пробел + перетаскивание"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13V5a2 2 0 0 1 4 0v7M12 7a2 2 0 0 1 4 0v6M16 9a2 2 0 0 1 4 0v7c0 4-2 6-6 6h-1c-2 0-3-1-4-2l-5-6a2 2 0 0 1 3-3l1 2"/></svg><span>Двигать</span></button></div><div class="hud-group hud-zoom"><button class="hud-button hud-icon" data-canvas-action="out" aria-label="Уменьшить масштаб" title="Уменьшить · −">−</button><button class="hud-button hud-scale" data-canvas-action="reset" aria-label="Сбросить масштаб" title="100% · 0"><span class="zoom-label">${Math.round(ui.zoom*100)}%</span></button><button class="hud-button hud-icon" data-canvas-action="in" aria-label="Увеличить масштаб" title="Увеличить · +">+</button></div><div class="hud-group hud-navigation"><button class="hud-button hud-fit" data-canvas-action="fit" aria-label="Вписать карту" title="Вся карта · Shift+1"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M8 8h8v8H8z"/></svg><span>Вся карта</span></button><button class="hud-button hud-selected" data-canvas-action="selected" aria-label="Перейти к выбранному контакту" title="К контакту · Shift+2"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="6.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg><span>К контакту</span></button></div></div></div>${ui.blockedEdges?.length?`<div class="edge-warning">${ui.blockedEdges.length} связей скрыто: раздвиньте карточки</div>`:''}<div class="map-footer">${arr.length<people().length?`<span class="map-count">Показано ${arr.length} из ${people().length}</span>`:''}<div class="legend"><span><i></i>Кто кем руководит</span>${ui.mode!=='org'?'<span class="blue-line"><i></i>Влияние</span><span class="dashed-line"><i></i>Общие встречи</span>':''}</div></div></section>`;}

function detail(){const p=person(ui.personId);if(!p||p.companyId!==ui.companyId) return `<aside data-region="detail-${h(p?.id||'empty')}" class="panel detail"><div class="empty-detail"><div class="empty-icon">◎</div><b>Выберите человека на карте</b><span></span></div></aside>`;
const interactions=interactionsFor(data,p.id);return `<aside data-region="detail-${h(p?.id||'empty')}" class="panel detail"><div class="detail-top"><div class="detail-header"><div><div class="detail-name">${h(p.name)}</div><div class="detail-position">${h(p.position)} · ${h(p.department)}</div></div>${isStale(p)||hasGaps(p)?`<span class="detail-data-note">${isStale(p)?'Сведения стоит обновить':'Есть незаполненные сведения'}</span>`:''}</div></div><div class="detail-content">${A('Роль в решении',p.role)}${A('Влияние',INFLUENCE_LABELS[p.influence])}${A('Отношение',ATTITUDE_LABELS[p.attitude])}${A('Контакты в КРОК',(p.knows||[]).join(', ')||'Не указаны')}${ui.mode==='process'||ui.mode==='sandbox'?A('Следующий шаг',p.nextStep):''}${A('Дата общения',lastTouch(data,p.id)?eDate(lastTouch(data,p.id)):'Не записано')}${connectionList(p)}${opinionHistory(p)}
<details class="detail-extra"><summary>Контекст</summary>${A('Темы',(p.topics||[]).join(', '))}${A('Стиль общения',p.style)}<p class="hint">${h(p.note||'Нет заметок')}</p></details><div class="section-head" style="margin-top:18px">История</div>${interactions.length?interactions.slice(0,3).map(t=>`<button class="feed-row" style="display:block;width:100%" data-action="show-touch" data-touch="${h(t.id)}"><span class="feed-date">${h(eDate(t.date))} · ${h(t.type)}</span><span class="feed-description" style="display:block;margin-top:4px">${h(t.summary)}</span></button>`).join(''):'<p class="hint">Встреч пока нет.</p>'}<div class="hint" style="margin-top:14px">Источник: ${h(p.source||'Неизвестно')} · проверено ${h(eDate(p.confirmedAt))}</div></div><div class="detail-actions"><button class="btn primary wide" data-action="brief">Бриф к встрече</button><button class="btn primary" data-action="edit-person">Изменить</button><button class="btn" data-action="new-touch">+ Касание</button><button class="btn wide" data-action="add-relation">+ Добавить связь</button></div></aside>`;}
function connectionList(p){const relations=data.relations.filter(r=>r.source===p.id||r.target===p.id);return `<div class="detail-section-title"><span>Связи</span><span>${relations.length}</span></div>${relations.map(r=>{const other=person(r.source===p.id?r.target:r.source),label=r.kind==='reports_to'?(r.source===p.id?'Подчинённый':'Руководитель'):r.kind==='influences'?(r.source===p.id?'Исходящее влияние':'Входящее влияние'):'Совместная работа';return `<button class="connection-row" data-action="select-person" data-id="${h(other?.id)}"><span>${h(other?.name)}</span><small>${h(label)}</small></button>`}).join('')||'<p class="hint">Связи пока не записаны.</p>'}`;}

function risksPanel(){const risks=clientRisks(data,ui.companyId).filter(r=>currentDeal()?.participantIds.includes(r.personId)),base=ui.original?clientRisks(ui.original,ui.companyId).filter(r=>currentDeal()?.participantIds.includes(r.personId)).length:null;return `<section data-region="risks" class="risks-section"><div class="bottom-heading"><div><h2>Что проверить${base!==null?` <small>${base} до изменений → ${risks.length} сейчас</small>`:''}</h2></div><button class="btn ${ui.risksOnly?'selected':''}" data-action="risk-filter">${ui.risksOnly?'Показать всех':'Показать на карте'}</button></div><div class="risk-list">${risks.map(r=>`<button class="risk-row" data-action="select-person" data-id="${h(r.personId)}"><div><strong>${h(person(r.personId)?.name)}</strong><span class="risk-label">${h(r.label)}</span><span>${h(r.reason)}</span></div></button>`).join('')||'<p class="hint">По правилам демо риски не найдены.</p>'}</div><details class="detail-extra"><summary>Как считаем</summary><p class="hint">Один контакт КРОК, нет встреч за 90 дней, пропущены сведения или связи влияния. Это сигналы для проверки.</p></details></section>`;}
function eventGlyph(type){const paths={'Встреча':'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0','Письмо':'M3 5h18v14H3zM3 5l9 7 9-7','Звонок':'M6 3H3v4c0 7.73 6.27 14 14 14h4v-3l-5-3-3 3a15 15 0 0 1-7-7l3-3z','Вебинар':'M3 4h18v16H3zM10 8l6 4-6 4z'};return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[type]||paths['Встреча']}"></path></svg>`;}
function bottom(){
 const slots=['ЛПР','Технический','Пользователь','Коуч'];
 const purpose={'ЛПР':'Принимает решение','Технический':'Проверяет требования','Пользователь':'Работает с решением','Коуч':'Помогает понять клиента'};
 const ts=allTouches().slice(0,5);
 const assigned=slot=>person(data.committee.find(x=>x.companyId===ui.companyId&&x.slot===slot)?.personId);
 const filled=slots.filter(slot=>assigned(slot)).length;
 return `<div data-region="bottom" class="bottom-grid">
 <section class="panel bottom-panel committee-panel">
  <div class="bottom-heading"><div><h3>Закупочный комитет</h3><span class="committee-coverage">${filled} из ${slots.length} ролей назначены</span></div><button data-action="committee" class="section-action">Изменить состав</button></div>
  <div class="committee-progress" aria-hidden="true">${slots.map(slot=>`<span data-slot="${h(slot)}" class="${assigned(slot)?'filled':''}"></span>`).join('')}</div>
  <div class="committee-grid">${slots.map((slot,index)=>{const p=assigned(slot);return `<button class="committee-slot ${p?'':'empty'} ${p?.id===ui.personId?'current-contact':''}" data-action="${p?'select-person':'committee'}" ${p?`data-id="${h(p.id)}" data-jump-to-map="true"`:''} data-slot="${h(slot)}">
   <span class="committee-card-top"><span class="committee-role">${h(slot)}</span><span class="committee-number" aria-hidden="true">0${index+1}</span></span>
   <span class="committee-purpose">${h(purpose[slot])}</span>
   <strong class="committee-person">${h(p?.name||'Пока не назначен')}</strong>
   <span class="committee-hint">${h(p?.position||'')}</span>
   <span class="committee-card-action">${p?(p.id===ui.personId?'Выбран на карте':'Показать на карте'):'Назначить контакт'}</span>
  </button>`}).join('')}</div>
 </section>
 <section class="panel bottom-panel events-panel">
  <div class="bottom-heading"><div><h3>История общения</h3><span class="committee-coverage">Последние записи команды</span></div><button class="section-action" data-action="new-touch">+ Записать</button></div>
  <div class="feed-list">${ts.length?ts.map((t,index)=>{const date=new Date(t.date+'T00:00:00');return `<button class="feed-row ${index===0?'latest-event':''}" data-action="show-touch" data-touch="${h(t.id)}" data-event-type="${h(t.type)}">
   <time class="event-calendar" datetime="${h(t.date)}"><strong>${date.getDate()}</strong><span>${h(date.toLocaleDateString('ru-RU',{month:'short'}).replace(/\.$/,''))}</span><small>${date.getFullYear()}</small></time>
   <span class="event-content"><span class="event-meta"><span class="feed-type">${eventGlyph(t.type)}${h(t.type)}</span>${index===0?'<span class="latest-event-label">Последняя запись</span>':''}</span>
   <span class="feed-description"><strong>${h(person(t.personId)?.name||'Контакт')}</strong><span class="event-summary">${h(t.summary)}</span></span></span>
  </button>`}).join(''):'<div class="events-empty">Пока нет событий<button class="text-button" data-action="new-touch">Записать первую встречу</button></div>'}</div>
 </section></div>`;
}

const field=(title,name,type,value='',options=null)=>`<label class="field"><span>${h(title)}</span>${options?`<select name="${h(name)}">${options}</select>`:type==='textarea'?`<textarea name="${h(name)}">${h(value)}</textarea>`:`<input name="${h(name)}" type="${type}" value="${h(value)}"/>`}</label>`;
const dateNow=()=>new Date().toLocaleDateString('en-CA');
function opinionHistory(p) {
  const conflicts = conflictingFields(p);
  if (!p.observations?.length) return '';
  return `<details class="survey-history" ${conflicts.length?'open':''}><summary>${conflicts.length?'Есть разные оценки — '+conflicts.map(k=>h(SURVEY_FIELDS[k])).join(', '):'Ответы после встреч и источники'}</summary>
    ${conflicts.length?'<p class="hint">Оценки сотрудников различаются.</p>':''}
    ${[...p.observations].reverse().sort((a,b)=>Number(conflicts.includes(b.field))-Number(conflicts.includes(a.field))).map(o=>`<div class="observation"><strong>${h(SURVEY_FIELDS[o.field])}: ${h(answerLabel(o.field,o.value))}</strong><span>${h(o.author)} · ${h(eDate(o.date))}</span>${o.basis?`<p>${h(o.basis)}</p>`:''}<span>${h(o.source||'Источник не указан')}</span></div>`).join('')}</details>`;
}
function surveyBody() {
  return ui.modal.participantIds.map(id => {
    const p=person(id), answers=ui.modal.answers[id]||{}, review=ui.modal.review[id];
    return `<section class="survey-person"><h3>${h(p.name)}</h3><p class="hint">${h(p.position)} · ${h(p.department)}</p>
      <label class="survey-check"><input type="checkbox" name="review:${h(id)}" ${review?'checked':''}> Уточнить уже заполненные оценки</label>
      ${surveyQuestions(p,review).map(key => {
        const name=`survey:${id}:${key}`, value=answers[key]||'';
        const options=key==='role'?ROLE_OPTIONS.filter(x=>x!=='Неизвестна').map(x=>[x,x]):key==='attitude'?ATTITUDE_OPTIONS.filter(([v])=>v!=='unknown'):null;
        return `<div class="survey-question">${field(SURVEY_FIELDS[key],name,key==='nextStep'?'textarea':'text',value,options?opt([['','Пропустить'],['__unknown__','Не знаю'],...options],value):null)}${!options?`<button type="button" class="text-button" data-action="survey-unknown" data-field="${h(name)}">Не знаю</button>`:''}${review&&!['nextStep','knows','role'].includes(key)&&p[key]?`<p class="hint">Сейчас: ${h(answerLabel(key,p[key]))}. Отличающийся ответ сохранится отдельным мнением.</p>`:''}</div>`;
      }).join('')}
      ${field('Кто на него влияет?',`survey:${id}:influencedBy`,'select','',opt([['','Пропустить'],['__unknown__','Не знаю'],...people().filter(x=>x.id!==id).map(x=>[x.id,x.name])],answers.influencedBy||''))}
      <p class="hint"></p>
    </section>`;
  }).join('') || '<p class="hint">Выберите участников встречи, чтобы дополнить сведения о них.</p>';
}
function rememberSurvey(form) {
  if (!form || ui.modal?.type!=='touch') return;
  for (const [key,value] of new FormData(form)) {
    if (!key.startsWith('survey:')) continue;
    const [,id,field]=key.split(':');
    (ui.modal.answers[id] ||= {})[field]=String(value);
  }
}
function modal(){if(!ui.modal)return '';const p=person(ui.personId);let title='',subtitle='',body='',submit='Сохранить',action='';
switch(ui.modal.type){
case 'analysis':{title='Почему эти параметры';body='<div class="analysis-grid"><article><strong>Роль ≠ должность</strong><p>Оргструктура показывает подчинение. Роль в закупке — кто решает, оценивает, использует и помогает.</p></article><article><strong>Влияние ≠ отношение</strong><p>Сторонник может не влиять на решение. Влиятельный скептик требует отдельного плана общения.</p></article><article><strong>Связь + источник</strong><p>Направление показывает, кто на кого влияет. Автор, дата и основание позволяют проверить оценку.</p></article><article><strong>Неизвестно ≠ плохо</strong><p>Пробел превращается в вопрос после встречи. Разные мнения сохраняются отдельно.</p></article></div><p class="hint">Карта показывает отношения, список — историю, карточка — основания. Сигналы считаются по явным правилам; вероятность сделки не выдумывается.</p>';action='close-modal';submit='Понятно';break;}
case 'insight':{const row=decisionInsights(data,ui.companyId,currentDeal())[ui.modal.index];title=row.label;body=`<h3>${h(row.title)}</h3><p>${h(row.basis)}</p>${row.personId?`<button type="button" class="btn primary" data-action="inspect-person" data-id="${h(row.personId)}">Показать контакт</button>`:''}`;action='close-modal';submit='Понятно';break;}
case 'reset':{title='Сбросить пример?';action='confirm-reset';submit='Сбросить';body=repository.session?'<p>Карта команды будет заменена исходным примером. Действие затронет всех сотрудников.</p>':'<p>Правки в этом браузере будут удалены. Вернётся исходная карта.</p>';break;}
case 'create':{title='Новый контакт';subtitle='Добавить человека в тестовую карту текущего клиента';action='save-new-person';body=`${field('ФИО','name','text','')}${field('Должность','position','text','')}<div class="modal-grid">${field('Подразделение','department','text','')}${field('Роль в решении','role','select','',textOption(ROLE_OPTIONS,'Неизвестна'))}</div>${field('Темы (через запятую)','topics','text','')}${field('Источник','source','text','Ручной ввод')}${field('Комментарий','note','textarea','')}`;break;}
case 'edit':{title='Редактирование контакта';subtitle='';action='save-person';body=`${field('ФИО','name','text',p?.name)}${field('Должность','position','text',p?.position)}<div class="modal-grid">${field('Подразделение','department','text',p?.department)}${field('Роль в решении','role','select','',textOption(ROLE_OPTIONS,p?.role))}${field('Влияние','influence','select','',opt(Object.entries(INFLUENCE_LABELS),p?.influence))}${field('Отношение к КРОК','attitude','select','',opt(ATTITUDE_OPTIONS,p?.attitude))}</div>${field('Кто из КРОК знает (через запятую)','knows','text',(p?.knows||[]).join(', '))}${field('Темы (через запятую)','topics','text',(p?.topics||[]).join(', '))}${field('Стиль общения','style','text',p?.style)}${field('Контекст','note','textarea',p?.note)}<div class="modal-grid">${field('Источник','source','text',p?.source)}${field('Дата подтверждения','confirmedAt','date',p?.confirmedAt)}</div>`;break;}
case 'touch':{title='После встречи';subtitle='';action='save-touch';submit='Сохранить';body=`
<fieldset class="survey-participants"><legend>С кем общались?</legend>${people().map(x=>`<label class="survey-check"><input type="checkbox" name="participantIds" value="${h(x.id)}" ${ui.modal.participantIds.includes(x.id)?'checked':''}> ${h(x.name)} <span class="hint">${h(x.position)}</span></label>`).join('')}</fieldset>
<div class="modal-grid">${field('Тип события','type','select','',textOption(['Встреча','Письмо','Звонок','Вебинар'],'Встреча'))}${field('Дата','date','date',dateNow())}</div>
${field('Сотрудник КРОК','author','text','')}${field('Итог встречи','summary','textarea')}
<div class="survey-intro"><strong>Что удалось узнать?</strong><p class="hint">Необязательно. Можно пропустить.</p></div>
<div id="survey-questions">${surveyBody()}</div>`;break;}
case 'relation':{title='Добавить связь';subtitle='';action='save-relation';const pOpt=(value)=>people().map(x=>`<option value="${h(x.id)}" ${x.id===value?'selected':''}>${h(x.name)}</option>`).join('');body=`${field('От кого','source','select','',pOpt(ui.personId))}${field('К кому','target','select','',pOpt(people().find(x=>x.id!==ui.personId)?.id))}${field('Тип','kind','select','',opt(Object.entries(RELATION_LABELS),'influences'))}${field('Комментарий','note','text','')}`;break;}
case 'committee':{title='Состав закупочного комитета';subtitle='';action='save-committee';const slot=ui.modal.slot||'ЛПР',row=data.committee.find(x=>x.companyId===ui.companyId&&x.slot===slot);body=`${field('Место в комитете','slot','select','',textOption(['ЛПР','Технический','Пользователь','Коуч'],slot))}${field('Человек','personId','select','',`<option value="">— Не назначен —</option>${people().map(x=>`<option value="${h(x.id)}" ${x.id===row?.personId?'selected':''}>${h(x.name)}</option>`).join('')}`)}`;break;}
case 'event':{const t=data.interactions.find(x=>x.id===ui.modal.id);title=t?.type||'Касание';subtitle=eDate(t?.date);body=`<div class="detail-note"><b>${h(person(t?.personId)?.name||'Контакт')}</b>${h(t?.summary||'')}</div><p class="hint">Ответственный: ${h(t?.author||'Неизвестно')}</p>${t?.participantIds?`<p class="hint">Участники: ${t.participantIds.map(id=>h(person(id)?.name||'Контакт')).join(', ')}</p>`:''}${(t?.surveyAnswers||[]).map(a=>`<div class="observation"><strong>${h(SURVEY_FIELDS[a.field])}: ${h(answerLabel(a.field,a.value))}</strong><span>${a.conflict?'Сохранено отдельным мнением':'Добавлено в карточку'} · ${h(a.author)} · ${h(eDate(a.date))}</span></div>`).join('')}`;submit='Закрыть';action='close-modal';break;}
case 'deal':{title='Настройки закупки';subtitle='';action='save-deal';const d=currentDeal();body=`${field('Название закупки','dealName','text',d.name)}${field('Этап','stage','select','',textOption(['Знакомство','Сбор требований','Подготовка предложения','Согласование','Решение'],d.stage))}${field('Следующий шаг команды','dealNextStep','text',d.nextStep)}<fieldset class="survey-participants"><legend>Участники закупки</legend>${people().map(p=>`<label class="survey-check"><input type="checkbox" name="dealParticipants" value="${h(p.id)}" ${d.participantIds.includes(p.id)?'checked':''}>${h(p.name)}</label>`).join('')}</fieldset>`;break;}
case 'brief':{title='Подготовка к встрече';subtitle='Из записей команды';body=`<pre class="brief-text">${h(meetingBrief(data,ui.personId))}</pre>`;submit='Закрыть';action='close-modal';break;}
case 'edge':{const r=data.relations.find(x=>x.id===ui.modal.id);title='Связь между контактами';subtitle=RELATION_LABELS[r?.kind]||'Связь';body=`<p><strong>${h(person(r?.source)?.name||'')}</strong> → <strong>${h(person(r?.target)?.name||'')}</strong></p><div class="detail-note">${h(r?.note||'Комментария нет')}</div>${r?.author?`<p class="hint">${h(r.author)} · ${h(eDate(r.date))} · ${h(r.sourceType||'Ручной ввод')}</p>`:''}${ui.original?`<button type="button" class="btn danger" data-action="remove-edge" data-id="${h(r?.id)}">Удалить связь в черновике</button>`:''}`;submit='Закрыть';action='close-modal';break;}
}
return `<div data-region="modal-${h(ui.modal.type)}-${h(ui.modal.id||'')}" class="modal-overlay" data-action="modal-backdrop"><div class="modal ${ui.modal.type==='touch'?'survey-modal':''}" role="dialog" aria-modal="true" aria-labelledby="modal-heading"><div class="modal-head"><div><div class="modal-title" id="modal-heading">${h(title)}</div><div class="modal-subtitle">${h(subtitle)}</div></div><button type="button" class="modal-close" data-action="close-modal" aria-label="Закрыть">×</button></div><form id="modal-form" data-form="${h(action)}"><div class="modal-body">${body}<p id="form-error" class="form-error" role="alert" hidden></p><div class="modal-actions">${ui.modal.type==='touch'?'<button type="submit" name="skipSurvey" value="skip" class="btn">Без ответов</button>':''}<button type="button" data-action="close-modal" class="btn">Отмена</button><button class="btn primary" type="submit">${h(submit)}</button></div></div></form></div></div>`;}
function render(){
if(!data.deals)data.deals=data.companies.map(c=>({id:'deal-'+c.id,companyId:c.id,name:c.topic,stage:'Подготовка предложения',participantIds:data.people.filter(p=>p.companyId===c.id).map(p=>p.id),nextStep:'Уточнить состав участников и критерии решения'}));
layoutPeople(people());
const oldMap=root.querySelector?.('#map-wrap'),oldDetail=root.querySelector?.('.detail');
const scroll=oldMap?{map:oldMap,top:oldMap.scrollTop,left:oldMap.scrollLeft}:null;
const detailScroll=oldDetail?.scrollTop||0,oldInspector=root.querySelector?.('.detail-content'),inspectorScroll=oldInspector?.scrollTop||0;
const nextModal=ui.modal?`${ui.modal.type}:${ui.modal.id||''}`:null;
if(nextModal&&!previousModal)modalOpener=document.activeElement;
patchChildren(root,`<div data-region="app" class="app" data-access="${window.cursorAccount?.session.role||'editor'}">${header()}${decisionDesk()}<main data-region="workspace" class="workspace">${sidebar()}${map()}${detail()}</main>${ui.mode==='process'||ui.mode==='sandbox'?risksPanel():''}${bottom()}${modal()}${ui.toast?`<div data-region="toast" class="toast" role="status">${h(ui.toast)}</div>`:''}</div>`);
if(scroll&&scroll.map.isConnected){scroll.map.scrollTop=scroll.top;scroll.map.scrollLeft=scroll.left;}
if(oldDetail?.isConnected)oldDetail.scrollTop=detailScroll;
if(oldInspector?.isConnected)oldInspector.scrollTop=inspectorScroll;
canvas?.afterRender();
if(nextModal&&!previousModal)root.querySelector?.('.modal-close')?.focus({preventScroll:true});
if(!nextModal&&previousModal&&modalOpener?.isConnected)modalOpener.focus({preventScroll:true});
previousModal=nextModal;
if(window.cursorAccount?.session.role==='reader'){root.querySelectorAll('[data-action="new-person"],[data-action="new-touch"],[data-action="edit-person"],[data-action="add-relation"],[data-action="committee"],[data-action="edit-deal"],[data-action="reset-data"]').forEach(b=>b.disabled=true);}}
function filterUpdate(key,value){ui.filters[key]=value;render();}
function act(action,button){switch(action){
case 'account':window.cursorAccount?.open();return;
case 'preview-loader':{const opener=document.activeElement,overlay=document.createElement('div');overlay.className='boot-loader loader-demo';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Маскот Cursor');overlay.innerHTML=`${eyes()}<strong class="cursor-wordmark">Cursor</strong><p>Держим нужных людей в поле зрения</p><button class="btn primary" type="button">Вернуться к карте</button>`;document.body.append(overlay);const close=()=>{overlay.remove();if(opener?.isConnected)opener.focus({preventScroll:true});};overlay.querySelector('button').onclick=close;overlay.querySelector('button').focus();overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}if(e.key==='Tab'){e.preventDefault();overlay.querySelector('button').focus();}});return;}
case 'explain-analysis':ui.modal={type:'analysis'};break;
case 'inspect-insight':ui.modal={type:'insight',index:Number(button.dataset.index)};break;
case 'inspect-person':if(ui.original){data=ui.original;ui.original=null;}ui.personId=button.dataset.id;ui.filters=defaultFilters();ui.collapsed=[];ui.mode='influence';ui.modal=null;break;
case 'mode': {const next=button.dataset.mode;if(ui.original&&next!=='sandbox'){data=ui.original;ui.original=null;}if(next==='sandbox'&&!ui.original){ui.original=data;data=structuredClone(data);}ui.mode=next;ui.personId=people().some(p=>p.id===ui.personId)?ui.personId:people()[0]?.id;ui.risksOnly=false;break;}
case 'reset-sandbox':data=structuredClone(ui.original);break;
case 'exit-sandbox':data=ui.original;ui.original=null;ui.mode='org';ui.personId=people().some(p=>p.id===ui.personId)?ui.personId:people()[0]?.id;break;
case 'remove-edge':if(ui.original){data.relations=data.relations.filter(r=>r.id!==button.dataset.id);ui.modal=null;}break;
case 'fold':ui.collapsed=ui.collapsed.includes(button.dataset.department)?ui.collapsed.filter(x=>x!==button.dataset.department):[...ui.collapsed,button.dataset.department];break;
case 'show-all':ui.filters=defaultFilters();ui.collapsed=[];ui.risksOnly=false;break;
case 'risk-filter':ui.risksOnly=!ui.risksOnly;break;
case 'select-person':ui.personId=button.dataset.id;ui.collapsed=ui.collapsed.filter(dep=>dep!==person(ui.personId)?.department);ui.filters=defaultFilters();break;
case 'edit-deal':ui.modal={type:'deal'};break;
case 'brief':ui.modal={type:'brief'};break;
case 'export':{const csv=contactsCsv(visible(),ATTITUDE_LABELS);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='contacts.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);return;}

case 'new-touch': ui.modal={type:'touch',participantIds:person(ui.personId)?.companyId===ui.companyId?[ui.personId]:[],answers:{},review:{}};break;
case 'survey-unknown': {const input=document.getElementsByName(button.dataset.field)[0];if(input){input.value='';input.placeholder='Не знаю — пробел сохранится';input.focus();}return;}
case 'new-person': ui.modal={type:'create'};break;
case 'edit-person': ui.modal={type:'edit'};break;
case 'add-relation': ui.modal={type:'relation'};break;
case 'committee': ui.modal={type:'committee',slot:button.dataset.slot||'ЛПР'};break;
case 'show-touch': ui.modal={type:'event',id:button.dataset.touch};break;
case 'close-modal':ui.modal=null;break;
case 'modal-backdrop':if(button.classList.contains('modal-overlay'))ui.modal=null;else return;break;
case 'toggle-stale':ui.filters.staleOnly=!ui.filters.staleOnly;break;
case 'toggle-one':ui.filters.oneThreadOnly=!ui.filters.oneThreadOnly;break;
case 'toggle-gaps':ui.filters.gapsOnly=!ui.filters.gapsOnly;break;
case 'reset-filters':ui.filters=defaultFilters();break;
case 'coverage':ui.filters.coverageOnly=!ui.filters.coverageOnly;break;
case 'layer':ui.layers[button.dataset.kind]=!ui.layers[button.dataset.kind];break;
case 'zoom-in':ui.zoom=Math.min(1.6,Math.round((ui.zoom+.15)*100)/100);break;
case 'zoom-out':ui.zoom=Math.max(.55,Math.round((ui.zoom-.15)*100)/100);break;
case 'zoom-reset':ui.zoom=1;break;
case 'reset-data':if(repository.session&&repository.session.role!=='admin'){toast('Сброс карты доступен администратору');return;}if(ui.original){toast('Сначала выйдите из песочницы');return;}ui.modal={type:'reset'};break;
default:return;
}render();if(['select-person','inspect-person'].includes(action))canvas?.centerSelection();if(button.dataset.jumpToMap)root.querySelector('.map-panel')?.scrollIntoView?.({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
root.addEventListener('click',event=>{if(suppressClick){suppressClick=false;return;}const edge=event.target.closest('[data-edge]');if(edge){ui.modal={type:'edge',id:edge.dataset.edge};render();return;}const action=event.target.closest('[data-action]');if(action){if(action.dataset.action==='modal-backdrop' && event.target!==action)return;act(action.dataset.action,action);return;}const node=event.target.closest('[data-person]');if(node){ui.personId=node.dataset.person;render();}});
root.addEventListener('change',e=>{const el=e.target;
if(ui.modal?.type==='touch'&&(el.name==='participantIds'||el.name?.startsWith('review:'))){
  rememberSurvey(el.form);
  if(el.name==='participantIds')ui.modal.participantIds=[...new FormData(el.form).getAll('participantIds')];
  else ui.modal.review[el.name.slice(7)]=el.checked;
  patchChildren(document.getElementById('survey-questions'),surveyBody());return;
}
switch(el.id){case 'canvas-mode':act('mode',{dataset:{mode:el.value}});break;case 'company-select':if(ui.original){data=ui.original;ui.original=null;ui.mode='org';}ui.collapsed=[];ui.companyId=el.value;ui.filters=defaultFilters();ui.personId=people()[0]?.id;ui.zoom=1;render();break;case 'department-filter':filterUpdate('department',el.value);break;case 'role-filter':filterUpdate('role',el.value);break;}});
root.addEventListener('input',e=>{if(e.target.id!=='search')return;const s=e.target.selectionStart;const value=e.target.value;ui.filters.search=value;render();const fieldEl=document.getElementById('search');if(fieldEl!==document.activeElement)fieldEl?.focus({preventScroll:true});fieldEl?.setSelectionRange(s,s);});
root.addEventListener('submit',e=>{if(e.target.id!=='modal-form')return;e.preventDefault();const kind=e.target.dataset.form;const fd=new FormData(e.target);const get=(k)=>String(fd.get(k)||'').trim();const split=(s)=>s.split(',').map(x=>x.trim()).filter(Boolean);let problem='';
if(kind==='close-modal'){ui.modal=null;render();return;}
if(kind==='confirm-reset'){data=repository.reset();ui.companyId=data.companies.some(c=>c.id===ui.companyId)?ui.companyId:data.companies[0]?.id;ui.personId=people()[0]?.id;ui.filters=defaultFilters();ui.collapsed=[];ui.mode='org';ui.zoom=1;ui.risksOnly=false;ui.modal=null;toast('Пример восстановлен');return;}
if(kind==='save-deal'){if(!get('dealName')){const box=document.getElementById('form-error');box.textContent='Укажите название закупки';box.hidden=false;return;}update(()=>{Object.assign(currentDeal(),{name:get('dealName'),stage:get('stage'),nextStep:get('dealNextStep'),participantIds:fd.getAll('dealParticipants').map(String)});ui.modal=null;});}
if(kind==='save-new-person'){if(!get('name')||!get('position'))problem='Укажите ФИО и должность';else update(()=>{const id=uniqueId('person');const count=people().length;data.people.push({id,companyId:ui.companyId,name:get('name'),position:get('position'),department:get('department')||'Не указано',role:get('role'),influence:'unknown',attitude:'unknown',knows:[],topics:split(get('topics')),style:'',note:get('note'),source:get('source')||'Ручной ввод',confirmedAt:dateNow(),x:60+(count%4)*250,y:50+Math.floor(count/4)*155});if(['process','sandbox'].includes(ui.mode)&&currentDeal())currentDeal().participantIds.push(id);ui.personId=id;ui.filters=defaultFilters();ui.modal=null;});}
if(kind==='save-person'){if(!get('name')||!get('position')){problem='Укажите ФИО и должность';}else update(()=>{Object.assign(person(ui.personId),{name:get('name'),position:get('position'),department:get('department'),role:get('role'),influence:get('influence'),attitude:get('attitude'),knows:split(get('knows')),topics:split(get('topics')),style:get('style'),note:get('note'),source:get('source'),confirmedAt:get('confirmedAt')});ui.modal=null;});}
if(kind==='save-touch'){
  rememberSurvey(e.target);
  try {
    const ids=fd.getAll('participantIds').map(String);
    const answers=Object.fromEntries(ids.map(id=>{
      const allowed=[...surveyQuestions(person(id),ui.modal.review[id]),'influencedBy'];
      return [id,Object.fromEntries(Object.entries(ui.modal.answers[id]||{}).filter(([key])=>allowed.includes(key)))];
    }));
    const result=recordMeeting(data,{companyId:ui.companyId,participantIds:ids,date:get('date'),type:get('type'),
      summary:get('summary'),author:get('author'),answers:e.submitter?.value==='skip'?{}:answers});
    if(!ui.original)repository.save(result.data);data=result.data;ui.personId=ids[0];ui.filters=defaultFilters();ui.modal=null;
    toast(result.conflicts.length?`Встреча сохранена. Есть разные оценки: ${result.conflicts.length}.`:'Встреча сохранена');
    return;
  } catch(error) {
    const box=document.getElementById('form-error');box.textContent=error.message;box.hidden=false;box.scrollIntoView({block:'nearest'});return;
  }
}
if(kind==='save-relation'){problem=validateRelation(data,{source:get('source'),target:get('target'),kind:get('kind')});if(!problem)update(()=>{data.relations.push({id:uniqueId('relation'),companyId:ui.companyId,source:get('source'),target:get('target'),kind:get('kind'),note:get('note')});ui.modal=null;});}
if(kind==='save-committee')update(()=>{let row=data.committee.find(x=>x.companyId===ui.companyId&&x.slot===get('slot'));if(!row){row={companyId:ui.companyId,slot:get('slot'),personId:null};data.committee.push(row);}row.personId=get('personId')||null;ui.modal=null;});
if(problem){alert(problem);return;}if(kind!=='close-modal')toast('Сохранено');});
// Нативный drag без библиотек. SVG кривые перестраиваются после каждого движения.
let dragging=null, suppressClick=false,dragFrame=0;
function paintDrag(){if(!dragging)return;const p=person(dragging.id),n=root.querySelector(`[data-person="${p.id}"]`);if(n){n.style.left=`${p.x}px`;n.style.top=`${p.y}px`;n.classList.add('dragging');}const svg=root.querySelector('.edge-layer');if(svg)patchChildren(svg,`${edgeMarkers()}${edges(visible())}`);}
root.addEventListener('pointerdown',e=>{const node=e.target.closest('.person-node');if(!node||e.button!==0||ui.modal||window.cursorAccount?.session.role==='reader')return;const p=person(node.dataset.person);if(!p)return;dragging={id:p.id,x:e.clientX,y:e.clientY,startX:p.x,startY:p.y,moved:false,pointerId:e.pointerId};node.setPointerCapture(e.pointerId);});
root.addEventListener('pointermove',e=>{if(!dragging||dragging.pointerId!==e.pointerId)return;const deltaX=(e.clientX-dragging.x)/ui.zoom,deltaY=(e.clientY-dragging.y)/ui.zoom;if(Math.abs(deltaX)+Math.abs(deltaY)>4)dragging.moved=true;if(!dragging.moved)return;const p=person(dragging.id);p.x=Math.max(8,Math.min(layoutPeople(people()).width-248,dragging.startX+deltaX));p.y=Math.max(8,Math.min(layoutPeople(people()).height-140,dragging.startY+deltaY));if(!dragFrame)dragFrame=window.requestAnimationFrame(()=>{dragFrame=0;paintDrag();});});
root.addEventListener('pointerup',e=>{if(!dragging||dragging.pointerId!==e.pointerId)return;if(dragFrame){window.cancelAnimationFrame(dragFrame);dragFrame=0;}if(dragging.moved){suppressClick=true;saveData();ui.personId=dragging.id;render();}dragging=null;});
root.addEventListener('pointercancel',()=>{if(!dragging)return;if(dragFrame){window.cancelAnimationFrame(dragFrame);dragFrame=0;}const p=person(dragging.id);p.x=dragging.startX;p.y=dragging.startY;dragging=null;render();});
window.addEventListener('keydown',e=>{
 if((e.key==='Enter'||e.key===' ')&&!ui.modal){const edge=e.target?.closest?.('[data-edge]');if(edge){e.preventDefault();ui.modal={type:'edge',id:edge.dataset.edge};render();return;}}
 if(e.key==='Escape'&&ui.modal){e.preventDefault();e.stopImmediatePropagation();ui.modal=null;render();return;}
 if(e.key==='Tab'&&ui.modal){const dialog=root.querySelector('.modal');const controls=[...dialog.querySelectorAll('button,input,select,textarea,[tabindex]')].filter(el=>!el.disabled&&el.getClientRects().length);const first=controls[0],last=controls.at(-1);if(!dialog.contains(document.activeElement)||(!e.shiftKey&&document.activeElement===last)){e.preventDefault();first?.focus();}else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}}
});
render();
if(root.ownerDocument)canvas=installCanvas(root,{getZoom:()=>ui.zoom,setZoom:value=>{ui.zoom=value;render();},getNodes:()=>visible().map(p=>({...p,x:p.x+CANVAS_PADDING,y:p.y+CANVAS_PADDING})),getSelected:()=>{const p=person(ui.personId);return p?{...p,x:p.x+CANVAS_PADDING,y:p.y+CANVAS_PADDING}:null;},getPadding:()=>CANVAS_PADDING,getCompany:()=>ui.companyId,hasModal:()=>!!ui.modal});
canvas?.afterRender();

root.addEventListener('pointermove',e=>{if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;const mascot=root.querySelector('.cursor-eyes');if(!mascot)return;const r=mascot.getBoundingClientRect();mascot.style.setProperty('--look-x',`${Math.max(-3,Math.min(3,(e.clientX-r.left)/90))}px`);mascot.style.setProperty('--look-y',`${Math.max(-2,Math.min(2,(e.clientY-r.top)/140))}px`);});

let edgePreview=null;
function previewEdge(group){
 const id=group?.dataset.edge||null;if(id===edgePreview)return;
 root.querySelectorAll('.edge-endpoint').forEach(n=>n.classList.remove('edge-endpoint'));
 edgePreview=id;if(!id)return;
 const relation=data.relations.find(r=>r.id===id);if(!relation)return;
 for(const id of [relation.source,relation.target])root.querySelector(`[data-person="${id}"]`)?.classList.add('edge-endpoint');
}
root.addEventListener('pointerover',e=>previewEdge(e.target.closest('[data-edge]')));
root.addEventListener('pointerout',e=>{if(!e.relatedTarget?.closest?.('[data-edge]'))previewEdge(null);});
root.addEventListener('focusin',e=>previewEdge(e.target.closest('[data-edge]')));
root.addEventListener('focusout',()=>previewEdge(null));
