import type { AppEntry, AppGroup, AppMetrics, SectionId } from "../shared/types";
import { ALL_APPS_SECTION_ID } from "./navigation";

type RuntimeApp = AppEntry & { metrics: AppMetrics };

export function navigationSectionIds(appGroups: AppGroup[]) {
  return [ALL_APPS_SECTION_ID, ...appGroups.map((group) => group.id), "settings"];
}

export function mergeAllAppsOrder(existingOrder: string[], orderedVisibleIds: string[], availableAppIds: string[]) {
  const available = new Set(availableAppIds);
  const next = new Set<string>();
  for (const id of orderedVisibleIds) {
    if (id && available.has(id)) next.add(id);
  }
  for (const id of existingOrder) {
    if (id && available.has(id)) next.add(id);
  }
  return [...next];
}

export function orderAllApps<T extends { id: string }>(apps: T[], orderedAppIds: string[]) {
  if (!orderedAppIds.length) return apps;
  const byId = new Map(apps.map((app) => [app.id, app]));
  const ordered = orderedAppIds.map((id) => byId.get(id)).filter((app): app is T => Boolean(app));
  const included = new Set(ordered.map((app) => app.id));
  return ordered.length ? [...ordered, ...apps.filter((app) => !included.has(app.id))] : apps;
}

function normalizeExecutablePath(value: string) {
  return value.trim().replace(/\//g, "\\").toLocaleLowerCase();
}

export function dedupeAllApps<T extends Pick<AppEntry, "id" | "executablePath" | "appUserModelId">>(apps: T[]) {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const app of apps) {
    const pathKey = normalizeExecutablePath(app.executablePath);
    const key = app.appUserModelId?.trim().toLocaleLowerCase()
      ? `aumid:${app.appUserModelId.trim().toLocaleLowerCase()}`
      : pathKey || `id:${app.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(app);
  }
  return result;
}

export function appSectionApps(activeSection: SectionId, apps: RuntimeApp[], allAppsOrder: string[] = []) {
  return activeSection === ALL_APPS_SECTION_ID ? dedupeAllApps(orderAllApps(apps, allAppsOrder)) : apps.filter((item) => item.groupId === activeSection);
}
