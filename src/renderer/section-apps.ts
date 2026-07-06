import type { AppEntry, AppGroup, AppMetrics, SectionId } from "../shared/types";
import { ALL_APPS_SECTION_ID } from "./navigation";

type RuntimeApp = AppEntry & { metrics: AppMetrics };

export function navigationSectionIds(appGroups: AppGroup[]) {
  return ["processes", ALL_APPS_SECTION_ID, ...appGroups.map((group) => group.id), "settings"];
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

export function decorateAllAppsLaunchSelection<T extends AppEntry>(apps: T[], selectedIds: string[]) {
  const selected = new Set(selectedIds);
  return apps.map((app) => ({ ...app, launchSelected: selected.has(app.id) }));
}

export function allAppsSelection(selectedIds: string[], appId: string, selected: boolean) {
  const current = new Set(selectedIds.filter(Boolean));
  if (selected) current.add(appId);
  else current.delete(appId);
  return [...current];
}

export function appSectionApps(activeSection: SectionId, apps: RuntimeApp[], allAppsOrder: string[] = []) {
  return activeSection === ALL_APPS_SECTION_ID ? orderAllApps(apps, allAppsOrder) : apps.filter((item) => item.groupId === activeSection);
}
