// Deterministic evidence, scoped to the current client and procurement.
export function decisionInsights(data, companyId, deal) {
 const all=data.people.filter(p=>p.companyId===companyId);
 const members=deal?all.filter(p=>deal.participantIds.includes(p.id)):all;
 const assigned=data.committee?.find(r=>r.companyId===companyId&&r.slot==='ЛПР');
 const decision=members.find(p=>p.id===assigned?.personId)||members.find(p=>p.role==='ЛПР'&&p.influence==='high')||members.find(p=>p.role==='ЛПР');
 const influence=decision&&data.relations.find(r=>r.kind==='influences'&&r.target===decision.id&&members.some(p=>p.id===r.source));
 const bridge=influence&&members.find(p=>p.id===influence.source);
 const gap=members.find(p=>p.attitude==='unknown'||p.influence==='unknown'||p.role==='Неизвестна');
 return [
 {kind:'decision',label:'ЛПР закупки',personId:decision?.id,title:decision?.name||'ЛПР не определён',detail:decision?.position||'Назначьте роль в закупке',basis:decision?`Выбран ${assigned?.personId===decision.id?'из закупочного комитета':'из записанных ЛПР'}. Другие контакты с ролью ЛПР: ${members.filter(p=>p.role==='ЛПР'&&p.id!==decision.id).map(p=>p.name).join(', ')||'не записаны'}. Роль: ${decision.role}. Влияние: ${decision.influence==='high'?'высокое':'требует проверки'}. Источник: ${decision.source||'не указан'}. Подтверждено: ${decision.confirmedAt||'дата не указана'}.`:'В составе закупки нет контакта с ролью ЛПР.'},
 {kind:'access',label:'Через кого зайти',personId:bridge?.id,title:bridge?.name||'Путь пока не описан',detail:bridge?`Связь с ЛПР: ${decision.name}`:'Уточните связи с ЛПР',basis:bridge?`${influence.note||'Записана связь влияния'}. Это записанная связь, а не гарантия доступа. Источник: ${influence.author||bridge.source||'не указан'}.`:'Нет записанной связи влияния на выбранного ЛПР среди участников закупки.'},
 {kind:'question',label:'Что уточнить',personId:gap?.id,title:gap?.name||'Проверить актуальность',detail:gap?'Не хватает оценки контакта':'Сверьте записи перед встречей',basis:gap?`Неизвестные параметры: ${[gap.attitude==='unknown'?'отношение':null,gap.influence==='unknown'?'влияние':null,gap.role==='Неизвестна'?'роль':null].filter(Boolean).join(', ')}. Пробел не считается отрицательной оценкой.`:'Явных пробелов в трёх параметрах не найдено. Это не означает отсутствия рисков.'}
 ];
}
