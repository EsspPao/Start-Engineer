import type { AppEntry, AppMetrics, AppRuntimeAction, AppRuntimeState, AppRuntimeStateMap } from "../shared/types";

export type PendingRuntimeAction = {
  action: AppRuntimeAction;
  startedAt: number;
};

export type PendingRuntimeActionMap = Record<string, PendingRuntimeAction>;

export function reconcileAppRuntimeStates(
  apps: AppEntry[],
  metrics: AppMetrics[],
  pendingActions: PendingRuntimeActionMap,
  previous: AppRuntimeStateMap,
  now = Date.now()
): AppRuntimeStateMap {
  const metricsByApp = new Map(metrics.map((metric) => [metric.appId, metric]));
  return Object.fromEntries(apps.map((app) => {
    const metric = metricsByApp.get(app.id);
    const pending = pendingActions[app.id];
    const state = resolveLifecycleState(Boolean(metric?.isRunning), pending?.action);
    const prior = previous[app.id];
    const value: AppRuntimeState = {
      appId: app.id,
      state,
      stateSince: prior?.state === state ? prior.stateSince : pending?.startedAt ?? now,
      matchedPids: [...(metric?.matchedPids ?? metric?.pids ?? [])],
      associatedPids: [...(metric?.associatedPids ?? [])],
      lastAction: pending?.action ?? prior?.lastAction
    };
    return [app.id, value];
  }));
}

export function resolveLifecycleState(isRunning: boolean, action?: AppRuntimeAction) {
  if (action === "close") return isRunning ? "closing" : "stopped";
  if (action === "launch") return isRunning ? "running" : "launching";
  if (action === "wake") return isRunning ? "waking" : "unknown";
  return isRunning ? "running" : "stopped";
}

export function folderRuntimeState(appIds: string[], states: AppRuntimeStateMap) {
  const memberStates = appIds.map((id) => states[id]?.state ?? "unknown");
  return {
    isLaunching: memberStates.some((state) => state === "launching"),
    isClosing: memberStates.some((state) => state === "closing"),
    runningCount: memberStates.filter((state) => state === "running" || state === "waking" || state === "closing").length
  };
}
