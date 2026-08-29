import type { AppEntry, AppMetrics, InternalSearchResult } from "../shared/types";

export function normalizeSearch(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

export function matchesAppSearch(app: Pick<AppEntry, "name" | "processName">, query: string) {
  const normalized = normalizeSearch(query);
  if (!normalized) return true;
  return [app.name, app.processName].some((value) => normalizeSearch(value).includes(normalized));
}

type SearchableApp = Pick<AppEntry, "id" | "name" | "groupId" | "processName"> & Partial<Pick<AppEntry, "executablePath">> & { metrics: AppMetrics };

export function buildInternalSearchResults(query: string, apps: SearchableApp[]): InternalSearchResult[] {
  const normalized = normalizeSearch(query);
  if (!normalized) return [];
  const appResults = apps
    .filter((app) => matchesAppSearch(app, query))
    .map<InternalSearchResult>((app) => ({ kind: "app", id: app.id, name: app.name, groupId: app.groupId, processName: app.processName, isRunning: app.metrics.isRunning }));
  return appResults.slice(0, 80);
}
