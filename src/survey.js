import { ATTITUDE_LABELS, ROLE_OPTIONS, uniqueId, validateRelation } from './model.js';

export const SURVEY_FIELDS = {
  role: 'Роль в решении', attitude: 'Отношение к КРОК', style: 'Стиль общения',
  knows: 'Кто из КРОК знаком', nextStep: 'Следующий шаг',
};
export const isMissing = (p, key) => key === 'role' ? !p.role || p.role === 'Неизвестна'
  : key === 'attitude' ? !p.attitude || p.attitude === 'unknown'
  : key === 'knows' ? !p.knows?.length : !p[key]?.trim();
export const surveyQuestions = (p, review = false) => Object.keys(SURVEY_FIELDS)
  .filter(key => key === 'nextStep' || isMissing(p, key) || (review && ['attitude', 'style'].includes(key)));
export const answerLabel = (key, value) => key === 'attitude' ? ATTITUDE_LABELS[value] || value
  : Array.isArray(value) ? value.join(', ') : value;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const conflictingFields = (p) => [...new Set((p.observations || [])
  .filter(o => ['attitude', 'style'].includes(o.field) && !same(o.value, p[o.field]))
  .map(o => o.field))];

// Возвращает новое состояние: валидация и отмена не меняют исходные данные.
export function recordMeeting(data, input, today = new Date().toLocaleDateString('en-CA')) {
  const { companyId, participantIds, date, type, author: rawAuthor, summary: rawSummary } = input;
  const author = rawAuthor?.trim(), summary = rawSummary?.trim();
  if (!author || !summary) throw new Error('Укажите сотрудника КРОК и краткий результат встречи.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || Number.isNaN(Date.parse(date))
      || new Date(date).toISOString().slice(0, 10) !== date || date > today) {
    throw new Error('Укажите корректную дату касания, не позднее сегодняшнего дня.');
  }
  if (!['Встреча', 'Письмо', 'Звонок', 'Вебинар'].includes(type)) throw new Error('Выберите тип касания.');
  const ids = [...new Set(participantIds || [])];
  if (!ids.length) throw new Error('Выберите хотя бы одного участника со стороны клиента.');
  if (ids.some(id => !data.people.some(p => p.id === id && p.companyId === companyId))) {
    throw new Error('Все участники должны принадлежать выбранной компании.');
  }
  const next = structuredClone(data), meetingId = uniqueId('meeting');
  const changes = [], conflicts = [];
  for (const id of ids) {
    const p = next.people.find(p => p.id === id), answers = input.answers?.[id] || {};
    const touchId = uniqueId('touch'), recordedAnswers = [];
    for (const key of Object.keys(SURVEY_FIELDS)) {
      const raw = answers[key];
      if (typeof raw !== 'string' || !raw.trim() || raw === '__unknown__') continue;
      const value = key === 'knows' ? [...new Set(raw.split(',').map(s => s.trim()).filter(Boolean))] : raw.trim();
      if (key === 'role' && !ROLE_OPTIONS.includes(value)) throw new Error('Неизвестная роль участника.');
      if (key === 'attitude' && !Object.hasOwn(ATTITUDE_LABELS, value)) throw new Error('Неизвестная оценка отношений.');
      if ((key === 'role' && value === 'Неизвестна') || (key === 'attitude' && value === 'unknown') || (Array.isArray(value) && !value.length)) continue;
      const observation = { field: key, value, author, date, basis: summary, source: 'Опрос после встречи', touchId };
      const conflict = ['attitude', 'style'].includes(key) && !isMissing(p, key) && !same(p[key], value);
      if (conflict) {
        p.observations ||= [];
        if (!p.observations.some(o => o.field === key && same(o.value, p[key]))) {
          const meta = p.fieldMeta?.[key] || {};
          p.observations.push({field:key, value:p[key], author:meta.author || 'Ранее в карточке (автор не указан)',
            date:meta.date || p.confirmedAt, source:meta.source || p.source, basis:meta.basis || '', touchId:meta.touchId || null});
        }
        conflicts.push(`${p.name}: ${SURVEY_FIELDS[key]}`);
      }
      p.observations ||= [];
      p.observations.push(observation);
      recordedAnswers.push({ ...observation, conflict });
      if (!conflict) {
        p[key] = key === 'knows' ? [...new Set([...(p.knows || []), ...value])] : value;
        p.fieldMeta ||= {};
        p.fieldMeta[key] = {author, date, basis:summary, source:'Опрос после встречи', touchId};
        changes.push(`${p.name}: ${SURVEY_FIELDS[key]}`);
      }
    }
    const source = answers.influencedBy;
    if (source && source !== '__unknown__') {
      const existing = next.relations.some(r => r.source === source && r.target === id && r.kind === 'influences');
      const problem = validateRelation(next, {source, target:id, kind:'influences'});
      if (problem && !existing) throw new Error(problem);
      if (!existing) {
        next.relations.push({id:uniqueId('relation'), companyId, source, target:id, kind:'influences',
          note:summary, author, date, sourceType:'Опрос после встречи'});
        changes.push(`${p.name}: связь влияния`);
      }
    }
    next.interactions.push({id:touchId, meetingId, companyId, personId:id, participantIds:ids,
      date, type, summary, author, createdAt:new Date().toISOString(), source:'Опрос после встречи', surveyAnswers:recordedAnswers});
  }
  return {data:next, changes, conflicts, meetingId};
}
