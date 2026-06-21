export type AppDragRect = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

export function getReorderedIds(ids: string[], draggedId: string, targetIndex: number) {
  const currentIndex = ids.indexOf(draggedId);
  if (currentIndex < 0) return ids;

  const next = ids.filter((id) => id !== draggedId);
  const boundedIndex = Math.max(0, Math.min(targetIndex, next.length));
  next.splice(boundedIndex, 0, draggedId);
  return next;
}

export function hitTestAppOrder(ids: string[], rects: AppDragRect[], draggedId: string, x: number, y: number) {
  const orderedRects = ids
    .map((id) => rects.find((rect) => rect.id === id))
    .filter((rect): rect is AppDragRect => Boolean(rect));
  const targetRects = orderedRects.filter((rect) => rect.id !== draggedId);
  if (!targetRects.length) return ids;

  const rowTolerance = Math.max(8, Math.min(...targetRects.map((rect) => rect.height)) / 2);
  const rows: AppDragRect[][] = [];
  for (const rect of targetRects) {
    const row = rows.find((items) => Math.abs(items[0].top - rect.top) <= rowTolerance);
    if (row) row.push(rect);
    else rows.push([rect]);
  }
  for (const row of rows) row.sort((a, b) => a.left - b.left);
  rows.sort((a, b) => a[0].top - b[0].top);

  const targetRow = rows.find((row) => {
    const top = Math.min(...row.map((rect) => rect.top));
    const bottom = Math.max(...row.map((rect) => rect.top + rect.height));
    return y >= top && y <= bottom;
  }) ?? rows.reduce((nearest, row) => {
    const rowCenter = (Math.min(...row.map((rect) => rect.top)) + Math.max(...row.map((rect) => rect.top + rect.height))) / 2;
    const nearestCenter = (Math.min(...nearest.map((rect) => rect.top)) + Math.max(...nearest.map((rect) => rect.top + rect.height))) / 2;
    return Math.abs(y - rowCenter) < Math.abs(y - nearestCenter) ? row : nearest;
  });

  let targetIndex = targetRects.length;
  for (const rect of targetRow) {
    const centerX = rect.left + rect.width / 2;
    if (x < centerX) {
      targetIndex = targetRects.indexOf(rect);
      break;
    }
    targetIndex = targetRects.indexOf(rect) + 1;
  }

  return getReorderedIds(ids, draggedId, targetIndex);
}
