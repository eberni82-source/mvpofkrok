// Spreadsheet programs interpret formulas even when CSV cells are quoted.
export function csvCell(value) {
  let text=String(value??'');
  if(/^[\s\u0000-\u001f]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
export function contactsCsv(people,attitudes) {
  const rows=[['ФИО','Должность','Подразделение','Роль','Отношение','Знакомые КРОК'],...people.map(p=>[p.name,p.position,p.department,p.role,attitudes[p.attitude],(p.knows||[]).join(', ')])];
  return '\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');
}
