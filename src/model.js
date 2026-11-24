export const ROLE_OPTIONS = ['ЛПР', 'Технический', 'Пользователь', 'Коуч', 'Неизвестна'];
export const ATTITUDE_LABELS = {positive:'Сторонник', neutral:'Нейтрален', skeptical:'Скептически', unknown:'Неизвестно'};
export const ATTITUDE_OPTIONS = Object.entries(ATTITUDE_LABELS);
export const INFLUENCE_LABELS = {high:'Высокое', medium:'Среднее', low:'Низкое', unknown:'Неизвестно'};
export const RELATION_LABELS = {reports_to:'Кто кем руководит', influences:'Влияние на решение', works_with:'Общие встречи / работа'};
export const RELATION_COLORS = {reports_to:'#14213d', influences:'#2f6fed', works_with:'#38761d'};

export const companyPeople = (data, id) => data.people.filter((p) => p.companyId === id);
export const compareInteractions = (a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '');
export const interactionsFor = (data, id) => data.interactions.filter((t) => t.personId === id).sort(compareInteractions);
export const hasGaps = (p) => p.role === 'Неизвестна' || p.attitude === 'unknown' || !p.style?.trim() || !p.knows?.length;
export const daysSince = (date) => date ? Math.floor((Date.now() - new Date(date+'T00:00:00').getTime()) / 86400000) : null;
export const isStale = (p) => { const days = daysSince(p.confirmedAt); return days !== null && days > 180; };
export const lastTouch = (data,id) => interactionsFor(data,id)[0]?.date || null;
export const uniqueId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
export const escapeHtml = (value='') => String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function visiblePeople(data, companyId, filters) {
  return companyPeople(data,companyId).filter(p => {
    const q = filters.search.trim().toLocaleLowerCase('ru');
    const searchable = [p.name,p.position,p.department,p.role,...(p.topics||[])].join(' ').toLocaleLowerCase('ru');
    return (!q || searchable.includes(q))
      && (!filters.department || p.department === filters.department)
      && (!filters.role || p.role === filters.role)
      && (!filters.gapsOnly || hasGaps(p))
      && (!filters.oneThreadOnly || p.knows?.length === 1);
  });
}

export function validateRelation(data,{source,target,kind}) {
  if(!source || !target || !RELATION_LABELS[kind]) return 'Заполните участников и тип связи';
  if(source === target) return 'Нельзя связать человека с самим собой';
  const a = data.people.find(p=>p.id===source); const b = data.people.find(p=>p.id===target);
  if(!a || !b || a.companyId!==b.companyId) return 'Оба человека должны принадлежать одной компании';
  if(data.relations.some(r=>r.source===source&&r.target===target&&r.kind===kind)) return 'Такая связь уже существует';
  return null;
}
