import type { AppMetrics, AppEntry } from "../shared/types";

type RuntimeApp = AppEntry & { metrics: AppMetrics };

export function sortAppsForDisplay<T extends RuntimeApp>(apps: T[], sortRunningAppsFirst: boolean) {
  if (!sortRunningAppsFirst) return apps;
  return [...apps].sort((a, b) => Number(b.metrics.isRunning) - Number(a.metrics.isRunning));
}
