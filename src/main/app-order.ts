import type { AppEntry } from "../shared/types.js";

export function validateGroupAppOrder(apps: AppEntry[], groupId: string, orderedVisibleIds: string[]) {
  const seen = new Set<string>();
  const byId = new Map(apps.map((app) => [app.id, app]));

  for (const id of orderedVisibleIds) {
    if (seen.has(id)) throw new Error("排序数据包含重复应用");
    seen.add(id);

    const app = byId.get(id);
    if (!app) throw new Error("排序数据包含未知应用");
    if (app.groupId !== groupId) throw new Error("排序数据包含其他分组的应用");
  }
}

export function mergeVisibleAppOrder(apps: AppEntry[], groupId: string, orderedVisibleIds: string[]) {
  validateGroupAppOrder(apps, groupId, orderedVisibleIds);

  const ordered = orderedVisibleIds.map((id) => apps.find((app) => app.id === id)!);
  let index = 0;

  return apps.map((app) => {
    if (app.groupId !== groupId || !orderedVisibleIds.includes(app.id)) return app;
    const next = ordered[index];
    index += 1;
    return next;
  });
}
