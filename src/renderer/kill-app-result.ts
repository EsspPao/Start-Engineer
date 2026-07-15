import type { AppEntry, AppMetrics, AppRunningStatus, KillAppResult } from "../shared/types";

export function killAppResultHasMetrics(result: KillAppResult | AppEntry[]): result is KillAppResult {
  return !Array.isArray(result) && Array.isArray(result.metrics);
}

export function killAppResultHasRunningStatuses(result: KillAppResult | AppEntry[]): result is KillAppResult & { runningStatuses: AppRunningStatus[] } {
  return !Array.isArray(result) && Array.isArray(result.runningStatuses);
}

export function applyKillAppResult(result: KillAppResult | AppEntry[]): { apps: AppEntry[]; metrics?: AppMetrics[]; runningStatuses?: AppRunningStatus[] } {
  if (killAppResultHasMetrics(result)) {
    return { apps: result.apps, metrics: result.metrics, runningStatuses: result.runningStatuses };
  }
  if (killAppResultHasRunningStatuses(result)) {
    return { apps: result.apps, runningStatuses: result.runningStatuses };
  }
  return { apps: result };
}
