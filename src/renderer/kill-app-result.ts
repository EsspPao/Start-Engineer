import type { AppEntry, AppMetrics, KillAppResult } from "../shared/types";

export function killAppResultHasMetrics(result: KillAppResult | AppEntry[]): result is KillAppResult {
  return !Array.isArray(result) && Array.isArray(result.metrics);
}

export function applyKillAppResult(result: KillAppResult | AppEntry[]): { apps: AppEntry[]; metrics?: AppMetrics[] } {
  if (killAppResultHasMetrics(result)) {
    return { apps: result.apps, metrics: result.metrics };
  }
  return { apps: result };
}
