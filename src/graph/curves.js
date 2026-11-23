// Плавная кубическая кривая Безье между карточками — не прямые отрезки.
// Путь перестраивается при любом перемещении узла.
const WIDTH = 196, HEIGHT = 100;
export function bezierFor(source, target, kind = 'reports_to') {
  const sx = source.x + WIDTH/2;
  const sy = source.y + HEIGHT;
  const tx = target.x + WIDTH/2;
  const ty = target.y;
  if (kind === 'influences' || kind === 'works_with') {
    const leftToRight = source.x <= target.x;
    const x1 = source.x + (leftToRight ? WIDTH : 0);
    const x2 = target.x + (leftToRight ? 0 : WIDTH);
    const y1 = source.y + HEIGHT/2;
    const y2 = target.y + HEIGHT/2;
    const dx = Math.max(65, Math.abs(x2-x1)*.55);
    const d = `M ${x1} ${y1} C ${x1+(leftToRight?dx:-dx)} ${y1}, ${x2-(leftToRight?dx:-dx)} ${y2}, ${x2} ${y2}`;
    return { d, labelX:(x1+x2)/2, labelY:(y1+y2)/2-10 };
  }
  const dy = Math.max(55, Math.abs(ty-sy)*.55);
  return {d:`M ${sx} ${sy} C ${sx} ${sy+dy}, ${tx} ${ty-dy}, ${tx} ${ty}`, labelX:(sx+tx)/2, labelY:(sy+ty)/2};
}
