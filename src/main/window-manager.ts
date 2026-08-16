import type { AppEntry, AppMetrics, FocusAppWindowResult } from "../shared/types.js";
import {
  collectFocusCandidateStages,
  findFocusWindowCandidateForStages,
  focusWindowHandleDetailed,
  isMuMuLikeApp,
  isWeGameLikeApp,
  isWeChatLikeApp,
  listFocusWindowCandidatesForStages,
  restoreWeChatFromTray,
  scanFocusWindowsForStages,
  type FocusProcessSnapshot,
  type FocusWindowCandidate,
  type FocusWindowScanResult,
  type FocusWindowStage,
  type WindowFocusHelperRunner,
  type PowerShellRunner
} from "./focus-window.js";

export type AppWindowInfo = {
  handle: number;
  pid: number;
  title: string;
  stage?: string;
  visible?: boolean;
  minimized?: boolean;
};

export type WindowManagerDependencies = {
  runPowerShell: PowerShellRunner;
  runWindowFocusHelper?: WindowFocusHelperRunner;
  getProcesses: () => Promise<FocusProcessSnapshot[]>;
  activateRunningApp?: (app: AppEntry) => Promise<{ launched: boolean }>;
  waitAfterSafeActivation?: () => Promise<void>;
};

type RestoreMethod = "hwndRestore" | "trayRestore" | "fallbackRelaunch" | "none";
type RestoreResult = "success" | "failed" | "partial";

type FocusAttemptDiagnostics = {
  selectedCandidate?: FocusWindowCandidate;
  restoreMethod: RestoreMethod;
  restoreResult: RestoreResult;
  reason?: FocusAppWindowResult["reason"];
  postRestoreForegroundWindow?: FocusWindowCandidate;
  postRestoreWindows?: FocusWindowCandidate[];
};

export function focusStagesFromCandidates(app: AppEntry, metrics: AppMetrics | undefined, processes: FocusProcessSnapshot[], includeFallbacks: boolean): FocusWindowStage[] {
  const stages = collectFocusCandidateStages(app, metrics, processes);
  const ordered: FocusWindowStage[] = [
    {
      label: "matched",
      pids: stages.matchedPids,
      titleKeywords: stages.titleKeywords,
      classKeywords: stages.classKeywords,
      processNameKeywords: stages.processNameKeywords,
      pathKeywords: stages.pathKeywords
    }
  ];
  if (includeFallbacks) {
    ordered.push(
      { label: "children", pids: stages.childPids, classKeywords: stages.classKeywords, processNameKeywords: stages.processNameKeywords, pathKeywords: stages.pathKeywords },
      { label: "directory", pids: stages.directoryPids, classKeywords: stages.classKeywords, processNameKeywords: stages.processNameKeywords, pathKeywords: stages.pathKeywords },
      { label: "name", pids: stages.namePids, classKeywords: stages.classKeywords, processNameKeywords: stages.processNameKeywords, pathKeywords: stages.pathKeywords }
    );
  }
  ordered.push({ label: "title", pids: [], titleKeywords: stages.titleKeywords, classKeywords: stages.classKeywords, processNameKeywords: stages.processNameKeywords, pathKeywords: stages.pathKeywords });
  return ordered;
}

export function focusStagePids(stages: FocusWindowStage[]) {
  return [...new Set(stages.flatMap((stage) => stage.pids).filter((pid) => Number.isSafeInteger(pid) && pid > 0))];
}

export function toAppWindowInfo(candidate: FocusWindowCandidate): AppWindowInfo {
  return {
    handle: candidate.handle,
    pid: candidate.pid,
    title: candidate.title,
    stage: candidate.stage,
    visible: candidate.visible,
    minimized: candidate.iconic
  };
}

export function buildWindowDiagnostics(app: AppEntry, stages: FocusWindowStage[], scan: FocusWindowScanResult, attempt?: FocusAttemptDiagnostics) {
  const lines = [
    `App: ${app.name} (${app.id})`,
    `Executable: ${app.executablePath || "(empty)"}`,
    `Process name: ${app.processName || "(empty)"}`,
    "Stages:"
  ];
  for (const stage of stages) {
    const pids = stage.pids.length ? stage.pids.join(",") : "(none)";
    const titles = stage.titleKeywords?.length ? stage.titleKeywords.join(",") : "(none)";
    const classes = stage.classKeywords?.length ? stage.classKeywords.join(",") : "(none)";
    const processes = stage.processNameKeywords?.length ? stage.processNameKeywords.join(",") : "(none)";
    const paths = stage.pathKeywords?.length ? stage.pathKeywords.join(",") : "(none)";
    lines.push(`- Stage ${stage.label}: pids=${pids}; titleKeywords=${titles}; classKeywords=${classes}; processKeywords=${processes}; pathKeywords=${paths}`);
  }
  const appendWindows = (title: string, candidates: FocusWindowCandidate[]) => {
    lines.push(`${title}:`);
    if (!candidates.length) {
      lines.push("- (none)");
    } else {
      for (const candidate of candidates) {
        lines.push(`- hwnd=${candidate.handle} pid=${candidate.pid} processName=${candidate.processName ?? ""} executablePath=${candidate.executablePath ?? ""} processError=${candidate.processError ?? ""} title=${candidate.title} className=${candidate.className ?? ""} visible=${candidate.visible ?? false} minimized=${candidate.iconic ?? false} hasOwner=${Boolean(candidate.owner)} exStyle=${candidate.exStyle ?? ""} stage=${candidate.stage ?? ""} score=${candidate.score} matchReason=${candidate.matchReason ?? ""} filterReason=${candidate.filterReason ?? ""}`);
      }
    }
  };
  lines.push(`allWindowsScanned: ${scan.allWindowsScanned}`);
  if (attempt) {
    lines.push(`selectedCandidate: ${attempt.selectedCandidate ? `hwnd=${attempt.selectedCandidate.handle} pid=${attempt.selectedCandidate.pid} title=${attempt.selectedCandidate.title} className=${attempt.selectedCandidate.className ?? ""}` : "(none)"}`);
    lines.push(`restoreMethod: ${attempt.restoreMethod}`);
    lines.push(`restoreResult: ${attempt.restoreResult}`);
    lines.push(`reason: ${attempt.reason ?? ""}`);
    lines.push(`postRestoreForegroundWindow: ${attempt.postRestoreForegroundWindow ? `hwnd=${attempt.postRestoreForegroundWindow.handle} pid=${attempt.postRestoreForegroundWindow.pid} title=${attempt.postRestoreForegroundWindow.title} className=${attempt.postRestoreForegroundWindow.className ?? ""}` : "(none)"}`);
  } else {
    lines.push("selectedCandidate: (none)");
    lines.push("restoreMethod: none");
    lines.push("restoreResult: failed");
    lines.push("reason: ");
    lines.push("postRestoreForegroundWindow: (none)");
  }
  appendWindows("relatedWindows", scan.relatedWindows);
  appendWindows("filteredWindows", scan.filteredWindows);
  appendWindows("finalCandidates", scan.finalCandidates);
  appendWindows("postRestoreWindows", attempt?.postRestoreWindows ?? []);
  return lines.join("\n");
}

export function shouldUseSafeActivation(app: AppEntry) {
  if (isWeChatLikeApp(app)) return false;
  const haystack = `${app.name} ${app.processName} ${app.executablePath} ${(app.processAliases ?? []).join(" ")}`.toLowerCase();
  return haystack.includes("codex");
}

const defaultSafeActivationWait = () => new Promise<void>((resolve) => setTimeout(resolve, 900));

export class AppWindowManager {
  private latestRequestId = 0;
  private cache = new Map<string, FocusWindowCandidate>();
  private lastAttempts = new Map<string, FocusAttemptDiagnostics>();

  constructor(public readonly dependencies: WindowManagerDependencies) {}

  rememberWindow(appId: string, candidate: FocusWindowCandidate) {
    this.cache.set(appId, candidate);
  }

  forgetWindow(appId: string) {
    this.cache.delete(appId);
  }

  async listWindows(app: AppEntry, metrics?: AppMetrics) {
    const processes = await this.dependencies.getProcesses();
    const stages = focusStagesFromCandidates(app, metrics, processes, true);
    const candidates = await listFocusWindowCandidatesForStages(`${app.name}:list`, stages, this.dependencies.runPowerShell, this.dependencies.runWindowFocusHelper);
    return candidates.map(toAppWindowInfo);
  }

  async diagnostics(app: AppEntry, metrics?: AppMetrics) {
    const processes = await this.dependencies.getProcesses();
    const stages = focusStagesFromCandidates(app, metrics, processes, true);
    const scan = await scanFocusWindowsForStages(`${app.name}:diagnostics`, stages, this.dependencies.runPowerShell, this.dependencies.runWindowFocusHelper);
    return buildWindowDiagnostics(app, stages, scan, this.lastAttempts.get(app.id));
  }

  async focusHandle(app: AppEntry, handle: number, metrics?: AppMetrics): Promise<FocusAppWindowResult> {
    const processes = await this.dependencies.getProcesses();
    const stages = focusStagesFromCandidates(app, metrics, processes, true);
    const candidate: FocusWindowCandidate = { handle, pid: 0, title: "", score: 0 };
    const result = await focusWindowHandleDetailed(candidate, this.dependencies.runPowerShell, focusStagePids(stages), this.dependencies.runWindowFocusHelper);
    return result;
  }

  async focusAppWindow(app: AppEntry, metrics?: AppMetrics): Promise<FocusAppWindowResult> {
    const requestId = ++this.latestRequestId;
    // MuMu owns its single-instance restoration path. Directly restoring one of
    // its Qt/renderer handles can only highlight the taskbar entry while leaving
    // the main surface minimized. Invoke the application's activation entry once
    // and stop: a delayed HWND restore would override a user's immediate minimize.
    if (isMuMuLikeApp(app)) {
      return this.activateSelfManagedAppOnce(app, requestId);
    }
    const fastStages = focusStagesFromCandidates(app, metrics, [], false);
    const cached = this.cache.get(app.id);
    if (cached) {
      const result = await focusWindowHandleDetailed(cached, this.dependencies.runPowerShell, focusStagePids(fastStages), this.dependencies.runWindowFocusHelper);
      console.info(`[focus-window] ${app.name}:cache: ${result.focused ? "focused" : result.reason ?? "not-focused"}; handle=${cached.handle}; pid=${cached.pid}`);
      if (result.focused) return { focused: true };
      this.cache.delete(app.id);
    }

    // WeGame owns its tray restoration flow. Restoring one of its renderer hosts
    // directly can surface an empty black window instead of the main client.
    if (isWeGameLikeApp(app)) {
      return this.activateSelfManagedAppOnce(app, requestId);
    }

    const fastResult = await this.focusCandidate(app, "fast", fastStages, requestId);
    if (fastResult.focused) return { focused: true };
    if (requestId !== this.latestRequestId) return { focused: false, reason: "stale" };
    if (focusStagePids(fastStages).length) {
      if (isWeChatLikeApp(app)) {
        return this.restoreWeChatFromTrayThenFocus(app, "fast-tray", fastStages, requestId, fastResult.reason);
      }
      const safeActivationResult = await this.safeActivateThenFocus(app, "safe-activate", metrics, requestId, fastResult.reason);
      if (safeActivationResult.focused || safeActivationResult.reason !== "fallbackRelaunchDisabled") return safeActivationResult;
      return {
        focused: false,
        reason: fastResult.reason ?? "no-window"
      };
    }

    const processes = await this.dependencies.getProcesses();
    const fallbackStages = focusStagesFromCandidates(app, metrics, processes, true);
    const fallbackResult = await this.focusCandidate(app, "fallback", fallbackStages, requestId);
    if (fallbackResult.focused) return { focused: true };
    if (isWeChatLikeApp(app)) {
      return this.restoreWeChatFromTrayThenFocus(app, "fallback-tray", fallbackStages, requestId, fallbackResult.reason ?? fastResult.reason);
    }
    return {
      focused: false,
      reason: fallbackResult.reason === "tray-hidden" || fastResult.reason === "tray-hidden"
        ? "tray-hidden"
        : fallbackResult.reason ?? fastResult.reason ?? "no-window"
    };
  }

  private async focusCandidate(app: AppEntry, label: string, stages: FocusWindowStage[], requestId: number): Promise<FocusAppWindowResult> {
    const candidate = await findFocusWindowCandidateForStages(`${app.name}:${label}`, stages, this.dependencies.runPowerShell, this.dependencies.runWindowFocusHelper);
    if (!candidate) return { focused: false, reason: "no-window" };
    if (candidate.filterReason) {
      this.lastAttempts.set(app.id, {
        selectedCandidate: candidate,
        restoreMethod: "none",
        restoreResult: "failed",
        reason: candidate.filterReason === "suspected-wechat-shell" ? "suspectedWrongWindow" : "no-window"
      });
      return {
        focused: false,
        reason: candidate.filterReason === "suspected-wechat-shell" ? "suspectedWrongWindow" : "no-window"
      };
    }
    if (requestId !== this.latestRequestId) {
      console.info(`[focus-window] ${app.name}:${label}: cancelled stale request ${requestId}; latest=${this.latestRequestId}`);
      return { focused: false, reason: "stale" };
    }
    const result = await focusWindowHandleDetailed(candidate, this.dependencies.runPowerShell, focusStagePids(stages), this.dependencies.runWindowFocusHelper);
    console.info(`[focus-window] ${app.name}:${label}: ${result.focused ? "focused" : result.reason ?? "not-focused"}; handle=${candidate.handle}; pid=${candidate.pid}; visible=${candidate.visible}; iconic=${candidate.iconic}; tool=${candidate.toolWindow}; owner=${candidate.owner}; rect=${candidate.width}x${candidate.height}`);
    this.lastAttempts.set(app.id, {
      selectedCandidate: candidate,
      restoreMethod: "hwndRestore",
      restoreResult: result.focused ? "success" : "failed",
      reason: result.reason
    });
    if (result.focused) this.cache.set(app.id, candidate);
    return result;
  }

  private async activateSelfManagedAppOnce(app: AppEntry, requestId: number): Promise<FocusAppWindowResult> {
    if (!this.dependencies.activateRunningApp) {
      return { focused: false, reason: "fallbackRelaunchDisabled" };
    }

    const activation = await this.dependencies.activateRunningApp(app);
    if (requestId !== this.latestRequestId) return { focused: false, reason: "stale" };
    if (!activation.launched) {
      this.lastAttempts.set(app.id, {
        restoreMethod: "fallbackRelaunch",
        restoreResult: "failed",
        reason: "no-window"
      });
      return { focused: false, reason: "no-window" };
    }

    this.lastAttempts.set(app.id, {
      restoreMethod: "fallbackRelaunch",
      restoreResult: "success"
    });
    return { focused: true };
  }

  private async safeActivateThenFocus(app: AppEntry, label: string, metrics: AppMetrics | undefined, requestId: number, previousReason?: FocusAppWindowResult["reason"]): Promise<FocusAppWindowResult> {
    if (!shouldUseSafeActivation(app) || !this.dependencies.activateRunningApp) {
      return { focused: false, reason: "fallbackRelaunchDisabled" };
    }

    const activation = await this.dependencies.activateRunningApp(app);
    if (requestId !== this.latestRequestId) return { focused: false, reason: "stale" };
    if (!activation.launched) {
      this.lastAttempts.set(app.id, {
        restoreMethod: "fallbackRelaunch",
        restoreResult: "failed",
        reason: previousReason ?? "no-window"
      });
      return { focused: false, reason: previousReason ?? "no-window" };
    }

    await (this.dependencies.waitAfterSafeActivation ?? defaultSafeActivationWait)();
    if (requestId !== this.latestRequestId) return { focused: false, reason: "stale" };

    const processes = await this.dependencies.getProcesses();
    const stages = focusStagesFromCandidates(app, metrics, processes, true);
    const scan = await scanFocusWindowsForStages(`${app.name}:${label}:post`, stages, this.dependencies.runPowerShell, this.dependencies.runWindowFocusHelper);
    const candidate = scan.finalCandidates[0];
    if (!candidate || candidate.filterReason) {
      const reason = candidate?.filterReason === "suspected-wechat-shell" ? "suspectedWrongWindow" : previousReason ?? "no-window";
      this.lastAttempts.set(app.id, {
        selectedCandidate: candidate,
        restoreMethod: "fallbackRelaunch",
        restoreResult: "partial",
        reason,
        postRestoreWindows: scan.relatedWindows
      });
      return { focused: false, reason };
    }

    const result = await focusWindowHandleDetailed(candidate, this.dependencies.runPowerShell, focusStagePids(stages), this.dependencies.runWindowFocusHelper);
    this.lastAttempts.set(app.id, {
      selectedCandidate: candidate,
      restoreMethod: "fallbackRelaunch",
      restoreResult: result.focused ? "success" : "partial",
      reason: result.reason,
      postRestoreWindows: scan.relatedWindows
    });
    if (result.focused) this.cache.set(app.id, candidate);
    return result.focused ? { focused: true } : result.reason ? result : { focused: false, reason: "restoredButNotInteractive" };
  }

  private async restoreWeChatFromTrayThenFocus(app: AppEntry, label: string, stages: FocusWindowStage[], requestId: number, previousReason?: FocusAppWindowResult["reason"]): Promise<FocusAppWindowResult> {
    const tray = await restoreWeChatFromTray(this.dependencies.runPowerShell);
    if (requestId !== this.latestRequestId) {
      console.info(`[focus-window] ${app.name}:${label}: cancelled stale tray restore ${requestId}; latest=${this.latestRequestId}`);
      return { focused: false, reason: "stale" };
    }
    if (!tray.success) {
      const reason = tray.reason ?? (previousReason === "suspectedWrongWindow" ? "suspectedWrongWindow" : "trayRestoreFailed");
      this.lastAttempts.set(app.id, {
        restoreMethod: "trayRestore",
        restoreResult: "failed",
        reason
      });
      return { focused: false, reason };
    }

    const scan = await scanFocusWindowsForStages(`${app.name}:${label}:post`, stages, this.dependencies.runPowerShell, this.dependencies.runWindowFocusHelper);
    const candidate = scan.finalCandidates[0];
    if (!candidate) {
      this.lastAttempts.set(app.id, {
        restoreMethod: "trayRestore",
        restoreResult: "partial",
        reason: "trayRestoreFailed",
        postRestoreWindows: scan.relatedWindows
      });
      return { focused: false, reason: "trayRestoreFailed" };
    }
    if (candidate.filterReason) {
      this.lastAttempts.set(app.id, {
        selectedCandidate: candidate,
        restoreMethod: "trayRestore",
        restoreResult: "partial",
        reason: "suspectedWrongWindow",
        postRestoreWindows: scan.relatedWindows
      });
      return { focused: false, reason: "suspectedWrongWindow" };
    }

    const result = await focusWindowHandleDetailed(candidate, this.dependencies.runPowerShell, focusStagePids(stages), this.dependencies.runWindowFocusHelper);
    this.lastAttempts.set(app.id, {
      selectedCandidate: candidate,
      restoreMethod: "trayRestore",
      restoreResult: result.focused ? "success" : "partial",
      reason: result.reason,
      postRestoreWindows: scan.relatedWindows
    });
    if (result.focused) this.cache.set(app.id, candidate);
    return result.focused ? { focused: true } : result.reason ? result : { focused: false, reason: "restoredButNotInteractive" };
  }
}
