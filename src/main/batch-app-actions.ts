import type { AppEntry, AppMetrics, BatchLaunchItemResult, LaunchAppResult } from "../shared/types.js";

export async function launchAppsSequentially(
  apps: AppEntry[],
  launch: (app: AppEntry) => Promise<LaunchAppResult>
): Promise<BatchLaunchItemResult[]> {
  const results: BatchLaunchItemResult[] = [];
  for (const app of apps) {
    if (!app.launchSelected) continue;
    try {
      const result = await launch(app);
      results.push({ appId: app.id, name: app.name, status: result.status, message: result.message });
    } catch (reason) {
      results.push({ appId: app.id, name: app.name, status: "failed", message: reason instanceof Error ? reason.message : String(reason) });
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
