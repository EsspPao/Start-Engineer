import type { AppMetrics, AppRunningStatus } from "../shared/types";

export function applyRunningStatusToMetrics(metrics: AppMetrics[], statuses: AppRunningStatus[]) {
  if (!statuses.length) return metrics;
  const byApp = new Map(statuses.map((status) => [status.appId, status]));
  return metrics.map((metric) => {
    const status = byApp.get(metric.appId);
    if (!status) return metric;
    if (!status.isRunning) {
      return {
        ...metric,
        isRunning: false,
        cpuPercent: 0,
        memoryBytes: 0,
        diskBytesPerSecond: 0,
        pids: [],
        matchedPids: [],
        associatedPids: []
      };
    }
    return {
      ...metric,
      isRunning: true,
      pids: status.pids,
      matchedPids: status.pids
    };
  });
}
