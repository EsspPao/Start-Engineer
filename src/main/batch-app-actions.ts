import type { AppEntry, AppMetrics, BatchLaunchItemResult, LaunchAppResult } from "../shared/types.js";

type LaunchAppsSequentiallyOptions = {
  includeUnselected?: boolean;
  onProgress?: (result: BatchLaunchItemResult | { appId: string; name: string; status: "launching" }) => void;
};

export async function launchAppsSequentially(
  apps: AppEntry[],
  launch: (app: AppEntry) => Promise<LaunchAppResult>,
  options: LaunchAppsSequentiallyOptions = {}
): Promise<BatchLaunchItemResult[]> {
  const results: BatchLaunchItemResult[] = [];
  for (const app of apps) {
    if (!options.includeUnselected && !app.launchSelected) continue;
    options.onProgress?.({ appId: app.id, name: app.name, status: "launching" });
    try {
      const result = await launch(app);
      const item = { appId: app.id, name: app.name, status: result.status, message: result.message } satisfies BatchLaunchItemResult;
      results.push(item);
      options.onProgress?.(item);
    } catch (reason) {
      const item = { appId: app.id, name: app.name, status: "failed", message: reason instanceof Error ? reason.message : String(reason) } satisfies BatchLaunchItemResult;
      results.push(item);
      options.onProgress?.(item);
    }
  }
  return results;
}

export function collectGroupTermination(apps: AppEntry[], metrics: AppMetrics[]) {
  const metricsByApp = new Map(metrics.map((metric) => [metric.appId, metric]));
  const runningApps = apps.filter((app) => metricsByApp.get(app.id)?.isRunning);
  const pids = [...new Set(runningApps.flatMap((app) => metricsByApp.get(app.id)?.pids ?? []))].sort((a, b) => a - b);
  return { apps: runningApps, pids };
}
