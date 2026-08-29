import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AppEntry, AppFolder, AppMetrics, FolderLaunchVisualStatus, SectionId, StartEngineerApi } from "../shared/types";
import { applyKillAppResult, killAppResultHasMetrics, killAppResultHasRunningStatuses } from "./kill-app-result";
import { buildLaunchFeedbackMessage } from "./launch-feedback";
import { applyRunningStatusToMetrics } from "./running-status";
import { focusHintsForApp, focusResultMessage, type RuntimeApp } from "./window-focus-feedback";
import { useAppRuntimeActions, type RuntimeActionTicket } from "./use-app-runtime-actions";
import { useRuntimePolling } from "./use-runtime-polling";
import { appActionFailureMessage, exceptionActionFailure, launchActionFailure } from "./app-action-error";

type UseAppActionsOptions = {
  client: StartEngineerApi;
  activeSection: SectionId;
  runtimeApps: RuntimeApp[];
  metrics: AppMetrics[];
  folders: AppFolder[];
  startupDelayMs: number;
  canApplyRuntimeResult: () => boolean;
  onAppsChange: Dispatch<SetStateAction<AppEntry[]>>;
  onMetricsChange: Dispatch<SetStateAction<AppMetrics[]>>;
  onError: Dispatch<SetStateAction<string>>;
  onNotice: Dispatch<SetStateAction<string>>;
  onExecutableReplacementRequired: (app: AppEntry) => void;
  onCloseExpandedFolder: (folderId: string) => void;
};

const ticketSubset = (ticket: RuntimeActionTicket, appIds: string[]): RuntimeActionTicket => ({ token: ticket.token, appIds });

export function useAppActions({
  client,
  activeSection,
  runtimeApps,
  metrics,
  folders,
  startupDelayMs,
  canApplyRuntimeResult,
  onAppsChange,
  onMetricsChange,
  onError,
  onNotice,
  onExecutableReplacementRequired,
  onCloseExpandedFolder,
}: UseAppActionsOptions) {
  const [folderLaunchStatuses, setFolderLaunchStatuses] = useState<Record<string, FolderLaunchVisualStatus>>({});
  const [invalidAppIds, setInvalidAppIds] = useState<Set<string>>(new Set());
  const folderLaunchClearTimersRef = useRef(new Map<string, number>());
  const focusRequestSequenceRef = useRef(0);
  const runtimeAppsRef = useRef(runtimeApps);
  runtimeAppsRef.current = runtimeApps;

  const {
    beginRuntimeAction,
    finishRuntimeAction,
    finishRuntimeActions,
    hasPendingAction,
    hasPendingActions,
    isRuntimeActionCurrent,
    pendingActionCount,
    runtimeStates,
  } = useAppRuntimeActions(runtimeApps, metrics);
  const { refreshRuntimeData } = useRuntimePolling({
    client,
    activeSection,
    pendingActionCount,
    hasPendingActions,
    startupDelayMs,
    canApplyResult: canApplyRuntimeResult,
    onSnapshot: (snapshot) => {
      onAppsChange(snapshot.apps);
      onMetricsChange(snapshot.metrics);
    },
    onManagedStatuses: (statuses) => onMetricsChange((current) => applyRunningStatusToMetrics(current, statuses)),
    onError,
  });

  const clearLaunchStatusLater = useCallback((appId: string, delayMs: number, nextStatus?: FolderLaunchVisualStatus) => {
    const previousTimer = folderLaunchClearTimersRef.current.get(appId);
    if (previousTimer) window.clearTimeout(previousTimer);
    folderLaunchClearTimersRef.current.set(appId, window.setTimeout(() => {
      setFolderLaunchStatuses((current) => {
        const next = { ...current };
        if (nextStatus) next[appId] = nextStatus;
        else delete next[appId];
        return next;
      });
      folderLaunchClearTimersRef.current.delete(appId);
    }, delayMs));
  }, []);

  useEffect(() => {
    const unsubscribe = client.onFolderLaunchProgress((progress) => {
      const visualStatus = progress.status === "launched" ? "waiting" : progress.status;
      setFolderLaunchStatuses((current) => ({ ...current, [progress.appId]: visualStatus }));
      if (progress.status === "launching" || progress.status === "launched") {
        if (!hasPendingAction(progress.appId)) beginRuntimeAction([progress.appId], "launch");
      } else finishRuntimeActions([progress.appId]);
    });
    return () => {
      unsubscribe();
      for (const timer of folderLaunchClearTimersRef.current.values()) window.clearTimeout(timer);
      folderLaunchClearTimersRef.current.clear();
    };
  }, [beginRuntimeAction, client, finishRuntimeActions, hasPendingAction]);

  useEffect(() => {
    const confirmed = metrics
      .filter((metric) => metric.isRunning && folderLaunchStatuses[metric.appId] === "waiting")
      .map((metric) => metric.appId);
    if (!confirmed.length) return;
    setFolderLaunchStatuses((current) => ({ ...current, ...Object.fromEntries(confirmed.map((id) => [id, "launched" as const])) }));
    finishRuntimeActions(confirmed);
    for (const id of confirmed) clearLaunchStatusLater(id, 4_200);
  }, [clearLaunchStatusLater, finishRuntimeActions, folderLaunchStatuses, metrics]);

  const launchApp = useCallback(async (appId: string) => {
    const ticket = beginRuntimeAction([appId], "launch");
    if (!ticket) return;
    const app = runtimeAppsRef.current.find((item) => item.id === appId);
    const appName = app?.name ?? "应用";
    setFolderLaunchStatuses((current) => ({ ...current, [appId]: "launching" }));
    let waitingForRuntime = false;
    try {
      onError("");
      onNotice(buildLaunchFeedbackMessage("starting", appName));
      const result = await client.launchApp(appId);
      if (!isRuntimeActionCurrent(ticket)) return;
      onAppsChange(result.apps);
      if (result.status === "failed") {
        onNotice("");
        const failure = launchActionFailure(result, app) ?? exceptionActionFailure("launch", result.message);
        if (failure.code === "executable-missing") {
          setInvalidAppIds((current) => new Set(current).add(appId));
          onError(appActionFailureMessage(failure));
          if (app) onExecutableReplacementRequired(app);
          return;
        }
        onError(appActionFailureMessage(failure));
        return;
      }
      setInvalidAppIds((current) => {
        if (!current.has(appId)) return current;
        const next = new Set(current);
        next.delete(appId);
        return next;
      });
      onNotice(buildLaunchFeedbackMessage(result.status, appName));
      if (result.status === "launched") {
        waitingForRuntime = true;
        setFolderLaunchStatuses((current) => ({ ...current, [appId]: "waiting" }));
        const previousTimer = folderLaunchClearTimersRef.current.get(appId);
        if (previousTimer) window.clearTimeout(previousTimer);
        folderLaunchClearTimersRef.current.set(appId, window.setTimeout(() => {
          finishRuntimeAction(ticket);
          setFolderLaunchStatuses((current) => {
            const next = { ...current };
            delete next[appId];
            return next;
          });
          folderLaunchClearTimersRef.current.delete(appId);
          onNotice(`${appName} 已收到启动请求，仍在等待运行状态`);
        }, 60_000));
        void client.getManagedRunningStatus()
          .then((statuses) => onMetricsChange((current) => applyRunningStatusToMetrics(current, statuses)))
          .catch(() => undefined);
      } else if (result.status === "alreadyRunning") {
        const statuses = await client.getManagedRunningStatus();
        if (isRuntimeActionCurrent(ticket)) {
          onMetricsChange((current) => applyRunningStatusToMetrics(current, statuses));
        }
      }
    } catch (reason) {
      if (isRuntimeActionCurrent(ticket)) {
        onNotice("");
        onError(appActionFailureMessage(exceptionActionFailure("launch", reason)));
      }
    } finally {
      if (!waitingForRuntime) {
        finishRuntimeAction(ticket);
        setFolderLaunchStatuses((current) => {
          const next = { ...current };
          delete next[appId];
          return next;
        });
      }
    }
  }, [beginRuntimeAction, client, finishRuntimeAction, isRuntimeActionCurrent, onAppsChange, onError, onExecutableReplacementRequired, onMetricsChange, onNotice]);

  const focusAppWindow = useCallback(async (app: RuntimeApp) => {
    const ticket = beginRuntimeAction([app.id], "wake");
    if (!ticket) return;
    const requestId = ++focusRequestSequenceRef.current;
    try {
      onError("");
      const result = await client.focusAppWindow(app.id, focusHintsForApp(app));
      if (requestId !== focusRequestSequenceRef.current || !isRuntimeActionCurrent(ticket)) return;
      const message = focusResultMessage(result);
      if (message) onNotice(message);
    } catch (reason) {
      if (requestId === focusRequestSequenceRef.current && isRuntimeActionCurrent(ticket)) {
        onError(appActionFailureMessage(exceptionActionFailure("wake", reason)));
      }
    } finally {
      finishRuntimeAction(ticket);
    }
  }, [beginRuntimeAction, client, finishRuntimeAction, isRuntimeActionCurrent, onError, onNotice]);

  const closeApp = useCallback(async (appId: string) => {
    const ticket = beginRuntimeAction([appId], "close");
    if (!ticket) return;
    onError("");
    let refreshedByKill = false;
    try {
      const result = await client.killApp(appId);
      if (!isRuntimeActionCurrent(ticket)) return;
      const next = applyKillAppResult(result);
      onAppsChange(next.apps);
      if (next.metrics) {
        onMetricsChange(next.metrics);
        refreshedByKill = killAppResultHasMetrics(result);
      }
      if (next.runningStatuses) {
        onMetricsChange((current) => applyRunningStatusToMetrics(current, next.runningStatuses!));
        refreshedByKill = killAppResultHasRunningStatuses(result);
      }
    } catch (reason) {
      if (isRuntimeActionCurrent(ticket)) onError(appActionFailureMessage(exceptionActionFailure("close", reason)));
    } finally {
      if (!refreshedByKill && isRuntimeActionCurrent(ticket)) {
        await refreshRuntimeData(true);
      }
      finishRuntimeAction(ticket);
    }
  }, [activeSection, beginRuntimeAction, client, finishRuntimeAction, isRuntimeActionCurrent, onAppsChange, onError, onMetricsChange, refreshRuntimeData]);

  const closeFolderApps = useCallback(async (folderId: string) => {
    const memberIds = folders.find((folder) => folder.id === folderId)?.appIds
      .filter((id) => runtimeAppsRef.current.find((app) => app.id === id)?.metrics.isRunning) ?? [];
    const ticket = beginRuntimeAction(memberIds, "close");
    if (!ticket) return;
    try {
      onError("");
      const result = await client.killFolderApps(folderId);
      if (!isRuntimeActionCurrent(ticket)) return;
      onAppsChange(result.apps);
      if (result.runningStatuses) onMetricsChange((current) => applyRunningStatusToMetrics(current, result.runningStatuses!));
      else await refreshRuntimeData(true);
      const stopped = result.results.filter((item) => item.status === "terminated").length;
      const remaining = result.results.filter((item) => item.status !== "terminated");
      onNotice(`已关闭 ${stopped} 个应用`);
      if (remaining.length) onError(remaining.map((item) => `${item.name}：${item.message || "结束失败"}`).join("；"));
    } catch (reason) {
      if (isRuntimeActionCurrent(ticket)) onError(appActionFailureMessage(exceptionActionFailure("close", reason)));
    } finally {
      finishRuntimeAction(ticket);
    }
  }, [activeSection, beginRuntimeAction, client, finishRuntimeAction, folders, isRuntimeActionCurrent, onAppsChange, onError, onMetricsChange, onNotice, refreshRuntimeData]);

  const closeBatch = useCallback(async (appIds: string[], operation: () => ReturnType<StartEngineerApi["killAllApps"]>) => {
    const ticket = beginRuntimeAction(appIds, "close");
    if (!ticket) return;
    try {
      onError("");
      const result = await operation();
      if (!isRuntimeActionCurrent(ticket)) return;
      onAppsChange(result.apps);
      if (result.runningStatuses) onMetricsChange((current) => applyRunningStatusToMetrics(current, result.runningStatuses!));
      else await refreshRuntimeData(true);
      const stopped = result.results.filter((item) => item.status === "terminated").length;
      const remaining = result.results.filter((item) => item.status !== "terminated");
      onNotice(`已关闭 ${stopped} 个应用`);
      if (remaining.length) onError(remaining.map((item) => `${item.name}：${item.message || "结束失败"}`).join("；"));
    } catch (reason) {
      if (isRuntimeActionCurrent(ticket)) onError(appActionFailureMessage(exceptionActionFailure("close", reason)));
    } finally {
      finishRuntimeAction(ticket);
    }
  }, [activeSection, beginRuntimeAction, finishRuntimeAction, isRuntimeActionCurrent, onAppsChange, onError, onMetricsChange, onNotice, refreshRuntimeData]);

  const closeAllApps = useCallback((appIds: string[]) => closeBatch(appIds, () => client.killAllApps()), [client, closeBatch]);
  const closeGroupApps = useCallback((groupId: string, appIds: string[]) => closeBatch(appIds, () => client.killGroupApps(groupId)), [client, closeBatch]);

  const launchFolder = useCallback(async (folderId: string) => {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) return;
    const memberIds = folder.appIds.filter((id) => runtimeAppsRef.current.some((app) => app.id === id));
    const ticket = beginRuntimeAction(memberIds, "launch");
    if (!ticket) return;
    onCloseExpandedFolder(folderId);
    for (const id of memberIds) {
      const timer = folderLaunchClearTimersRef.current.get(id);
      if (timer) window.clearTimeout(timer);
      folderLaunchClearTimersRef.current.delete(id);
    }
    setFolderLaunchStatuses((current) => ({ ...current, ...Object.fromEntries(memberIds.map((id) => [id, "queued" as const])) }));
    try {
      onError("");
      const result = await client.launchFolder(folderId);
      if (!isRuntimeActionCurrent(ticket)) return;
      onAppsChange(result.apps);
      setFolderLaunchStatuses((current) => ({ ...current, ...Object.fromEntries(result.results.map((item) => [item.appId, item.status === "launched" ? "waiting" : item.status])) }));
      const finishedIds = result.results.filter((item) => item.status !== "launched").map((item) => item.appId);
      finishRuntimeAction(ticketSubset(ticket, finishedIds));
      const failed = result.results.filter((item) => item.status === "failed");
      if (failed.length) onError(`${failed.length} 个应用启动失败`);
      void client.getManagedRunningStatus()
        .then((statuses) => onMetricsChange((current) => applyRunningStatusToMetrics(current, statuses)))
        .catch(() => undefined);
      for (const item of result.results) {
        if (item.status === "launched") {
          const launchedTicket = ticketSubset(ticket, [item.appId]);
          const previousTimer = folderLaunchClearTimersRef.current.get(item.appId);
          if (previousTimer) window.clearTimeout(previousTimer);
          folderLaunchClearTimersRef.current.set(item.appId, window.setTimeout(() => {
            finishRuntimeAction(launchedTicket);
            setFolderLaunchStatuses((current) => ({ ...current, [item.appId]: "launched" }));
            clearLaunchStatusLater(item.appId, 4_200);
          }, 60_000));
        } else clearLaunchStatusLater(item.appId, item.status === "failed" ? 8_000 : 4_200);
      }
    } catch (reason) {
      if (isRuntimeActionCurrent(ticket)) {
        setFolderLaunchStatuses((current) => ({ ...current, ...Object.fromEntries(memberIds.map((id) => [id, "failed" as const])) }));
        onError(appActionFailureMessage(exceptionActionFailure("launch", reason)));
        finishRuntimeAction(ticket);
        for (const id of memberIds) clearLaunchStatusLater(id, 8_000);
      }
    }
  }, [beginRuntimeAction, clearLaunchStatusLater, client, finishRuntimeAction, folders, isRuntimeActionCurrent, onAppsChange, onCloseExpandedFolder, onError, onMetricsChange]);

  return {
    closeApp,
    closeAllApps,
    closeFolderApps,
    closeGroupApps,
    focusAppWindow,
    folderLaunchStatuses,
    invalidAppIds,
    launchApp,
    launchFolder,
    refreshRuntimeData,
    runtimeStates,
  };
}
