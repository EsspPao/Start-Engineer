import type {
  AppEntry,
  AppMetrics,
  FocusAppWindowResult,
  ResolvedWakeStrategy,
  WakeFailureReason
} from "../shared/types.js";
import {
  collectFocusCandidateStages,
  focusWindowHandleDetailed,
  listFocusWindowCandidatesForStages,
  scanFocusWindowsForStages,
  type FocusProcessSnapshot,
  type FocusWindowCandidate,
  type FocusWindowHandleResult,
  type FocusWindowScanResult,
  type FocusWindowStage,
  type PowerShellRunner,
  type WindowFocusHelperRunner
} from "./focus-window.js";
import { resolveWakePolicy, type WakePolicy } from "./wake-profiles.js";

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
  activateRunningApp?: (app: AppEntry, strategy: "self-launch" | "aumid") => Promise<{ launched: boolean }>;
  waitAfterSafeActivation?: () => Promise<void>;
};

type RestoreMethod = "hwnd-restore" | "self-launch" | "aumid" | "none";
type RestoreResult = "success" | "failed" | "partial" | "requested";

type WakeAttemptDiagnostics = {
  profileId: string;
  profileSource: WakePolicy["profileSource"];
  strategy: ResolvedWakeStrategy;
  externalActionsPerformed: number;
  selectedCandidate?: FocusWindowCandidate;
  restoreMethod: RestoreMethod;
  restoreResult: RestoreResult;
  failureReason?: WakeFailureReason;
  postActivationWindows?: FocusWindowCandidate[];
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

export function buildWindowDiagnostics(
  app: AppEntry,
  metrics: AppMetrics | undefined,
  stages: FocusWindowStage[],
  scan: FocusWindowScanResult,
  wakePolicy: WakePolicy,
  attempt?: WakeAttemptDiagnostics
) {
  return JSON.stringify({
    appId: app.id,
    appName: app.name,
    processName: app.processName,
    executablePath: app.executablePath,
    appUserModelId: app.appUserModelId ?? null,
    configuredWakeStrategy: app.wakeStrategy ?? "auto",
    matchedPids: metrics?.matchedPids ?? metrics?.pids ?? [],
    associatedPids: metrics?.associatedPids ?? [],
    matchedProcessNames: metrics?.matchedProcessNames ?? [],
    matchedPaths: metrics?.matchedPaths ?? [],
    selectedWakeProfile: wakePolicy.profileId,
    selectedWakeStrategy: wakePolicy.strategy,
    wakeProfileSource: wakePolicy.profileSource,
    wakePolicy: {
      allowWindowFocus: wakePolicy.allowWindowFocus,
      allowSelfLaunchWake: wakePolicy.allowSelfLaunchWake,
      allowAumidActivation: wakePolicy.allowAumidActivation,
      allowSecondScan: wakePolicy.allowSecondScan,
      allowHiddenWindowRestore: wakePolicy.allowHiddenWindowRestore,
      trayRestoreUnsupported: wakePolicy.trayRestoreUnsupported,
      maxExternalStateChangingActions: wakePolicy.maxExternalStateChangingActions,
      forbiddenWindowClasses: wakePolicy.forbiddenWindowClasses,
      forbiddenTitleKeywords: wakePolicy.forbiddenTitleKeywords
    },
    stages,
    allWindowsScanned: scan.allWindowsScanned,
    relatedWindows: scan.relatedWindows,
    filteredWindows: scan.filteredWindows,
    finalCandidates: scan.finalCandidates,
    selectedCandidate: attempt?.selectedCandidate ?? null,
    restoreMethod: attempt?.restoreMethod ?? "none",
    restoreResult: attempt?.restoreResult ?? "failed",
    externalActionsPerformed: attempt?.externalActionsPerformed ?? 0,
    failureReason: attempt?.failureReason ?? null,
    postActivationWindows: attempt?.postActivationWindows ?? []
  }, null, 2);
}

const defaultSafeActivationWait = () => new Promise<void>((resolve) => setTimeout(resolve, 900));

function mapFocusFailure(reason: FocusWindowHandleResult["reason"], wakePolicy: WakePolicy): WakeFailureReason {
  if (reason === "foreground-blocked") return "focus-blocked-by-windows";
  if (reason === "tray-hidden" && wakePolicy.trayRestoreUnsupported) return "tray-restore-unsupported";
  if (reason === "no-window" || reason === "tray-hidden") return "no-interactive-window";
  return "unknown";
}

function canRestoreWindow(candidate: FocusWindowCandidate, wakePolicy: WakePolicy) {
  return wakePolicy.allowHiddenWindowRestore || candidate.visible === true || candidate.iconic === true;
}

export function selectWakeCandidate(candidates: FocusWindowCandidate[], wakePolicy: WakePolicy, lastSuccessfulHandle?: number) {
  return candidates
    .filter((candidate) => canRestoreWindow(candidate, wakePolicy))
    .map((candidate) => ({ candidate, rank: candidate.score
      + (candidate.handle === lastSuccessfulHandle ? 10_000 : 0)
      + (candidate.handle === candidate.foregroundHandle ? 2_000 : 0)
      + (candidate.visible ? 400 : 0)
      + (candidate.iconic ? 250 : 0)
      + Math.min(200, Math.max(0, (candidate.width ?? 0) * (candidate.height ?? 0) / 20_000))
      - (candidate.toolWindow ? 2_000 : 0)
      - (candidate.owner ? 300 : 0) }))
    .sort((left, right) => right.rank - left.rank || left.candidate.handle - right.candidate.handle)[0]?.candidate;
}

function wakeResult(
  wakePolicy: WakePolicy,
  externalActionsPerformed: number,
  result: Pick<FocusAppWindowResult, "success" | "focused" | "outcome" | "reason">
): FocusAppWindowResult {
  return {
    ...result,
    strategy: wakePolicy.strategy,
    diagnostics: {
      profileId: wakePolicy.profileId,
      profileSource: wakePolicy.profileSource,
      externalActionsPerformed
    }
  };
}

export class AppWindowManager {
  private latestRequestId = 0;
  private cache = new Map<string, FocusWindowCandidate>();
  private lastAttempts = new Map<string, WakeAttemptDiagnostics>();

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
    const wakePolicy = resolveWakePolicy(app);
    const processes = await this.dependencies.getProcesses();
    const stages = focusStagesFromCandidates(app, metrics, processes, true);
    const scan = await scanFocusWindowsForStages(`${app.name}:diagnostics`, stages, this.dependencies.runPowerShell, this.dependencies.runWindowFocusHelper);
    return buildWindowDiagnostics(app, metrics, stages, scan, wakePolicy, this.lastAttempts.get(app.id));
  }

  async focusHandle(app: AppEntry, handle: number, metrics?: AppMetrics): Promise<FocusAppWindowResult> {
    const wakePolicy = resolveWakePolicy(app);
    const processes = await this.dependencies.getProcesses();
    const stages = focusStagesFromCandidates(app, metrics, processes, true);
    if (!wakePolicy.allowHiddenWindowRestore) {
      const scan = await scanFocusWindowsForStages(`${app.name}:focus-handle:verify`, stages, this.dependencies.runPowerShell, this.dependencies.runWindowFocusHelper);
      const current = scan.finalCandidates.find((item) => item.handle === handle);
      if (!current || !canRestoreWindow(current, wakePolicy)) {
        return this.failure(app, wakePolicy, 0, "tray-restore-unsupported", "none", "failed", current);
      }
    }
    const candidate: FocusWindowCandidate = { handle, pid: 0, title: "", score: 0 };
    const result = await focusWindowHandleDetailed(candidate, this.dependencies.runPowerShell, focusStagePids(stages), this.dependencies.runWindowFocusHelper);
    const failureReason = result.focused ? undefined : mapFocusFailure(result.reason, wakePolicy);
    const actionCount = result.reason === "no-window" ? 0 : 1;
    this.recordAttempt(app, wakePolicy, {
      externalActionsPerformed: actionCount,
      selectedCandidate: candidate,
      restoreMethod: "hwnd-restore",
      restoreResult: result.focused ? "success" : "failed",
      failureReason
    });
    return result.focused
      ? wakeResult(wakePolicy, 1, { success: true, focused: true, outcome: "focused" })
      : wakeResult(wakePolicy, actionCount, { success: false, focused: false, outcome: "failed", reason: failureReason });
  }

  async focusAppWindow(app: AppEntry, metrics?: AppMetrics): Promise<FocusAppWindowResult> {
    const requestId = ++this.latestRequestId;
    const wakePolicy = resolveWakePolicy(app);
    if (metrics && !metrics.isRunning) {
      return this.failure(app, wakePolicy, 0, "app-not-running", "none", "failed");
    }

    let stages: FocusWindowStage[] = [];
    if (wakePolicy.allowWindowFocus) {
      const cached = wakePolicy.allowHiddenWindowRestore ? this.cache.get(app.id) : undefined;
      if (cached) {
        const fastStages = focusStagesFromCandidates(app, metrics, [], false);
        const cachedResult = await focusWindowHandleDetailed(cached, this.dependencies.runPowerShell, focusStagePids(fastStages), this.dependencies.runWindowFocusHelper);
        console.info(`[wake] ${app.name}:cache: ${cachedResult.focused ? "focused" : cachedResult.reason ?? "not-focused"}; hwnd=${cached.handle}`);
        if (cachedResult.focused) {
          return this.success(app, wakePolicy, 1, "focused", cached, "hwnd-restore", "success");
        }
        this.cache.delete(app.id);
        if (cachedResult.reason !== "no-window") {
          return this.failure(app, wakePolicy, 1, mapFocusFailure(cachedResult.reason, wakePolicy), "hwnd-restore", "failed", cached);
        }
      }

      stages = focusStagesFromCandidates(app, metrics, [], false);
      let scan = await scanFocusWindowsForStages(`${app.name}:wake:fast`, stages, this.dependencies.runPowerShell, this.dependencies.runWindowFocusHelper);
      if (!scan.finalCandidates.length && focusStagePids(stages).length === 0) {
        const processes = await this.dependencies.getProcesses();
        stages = focusStagesFromCandidates(app, metrics, processes, true);
        scan = await scanFocusWindowsForStages(`${app.name}:wake:fallback`, stages, this.dependencies.runPowerShell, this.dependencies.runWindowFocusHelper);
      }
      const candidate = selectWakeCandidate(scan.finalCandidates, wakePolicy, this.cache.get(app.id)?.handle);
      if (candidate) {
        if (requestId !== this.latestRequestId) return this.failure(app, wakePolicy, 0, "stale-request", "none", "failed", candidate);
        const focusResult = await focusWindowHandleDetailed(candidate, this.dependencies.runPowerShell, focusStagePids(stages), this.dependencies.runWindowFocusHelper);
        console.info(`[wake] ${app.name}:${wakePolicy.profileId}: ${focusResult.focused ? "focused" : focusResult.reason ?? "not-focused"}; hwnd=${candidate.handle}; strategy=${wakePolicy.strategy}`);
        if (focusResult.focused) {
          this.cache.set(app.id, candidate);
          return this.success(app, wakePolicy, 1, "focused", candidate, "hwnd-restore", "success");
        }
        return this.failure(app, wakePolicy, focusResult.reason === "no-window" ? 0 : 1, mapFocusFailure(focusResult.reason, wakePolicy), "hwnd-restore", "failed", candidate);
      }
    }

    if (requestId !== this.latestRequestId) return this.failure(app, wakePolicy, 0, "stale-request", "none", "failed");
    if (wakePolicy.strategy === "window-only") {
      return this.failure(app, wakePolicy, 0, wakePolicy.trayRestoreUnsupported ? "tray-restore-unsupported" : "no-interactive-window", "none", "failed");
    }
    if (wakePolicy.strategy === "unsupported") {
      return this.failure(app, wakePolicy, 0, "self-launch-not-allowed", "none", "failed");
    }
    return this.activateOnce(app, metrics, wakePolicy, requestId);
  }

  private async activateOnce(app: AppEntry, metrics: AppMetrics | undefined, wakePolicy: WakePolicy, requestId: number): Promise<FocusAppWindowResult> {
    const strategy = wakePolicy.strategy;
    const method = strategy === "aumid" ? "aumid" : "self-launch";
    if (strategy !== "self-launch" && strategy !== "aumid") {
      return this.failure(app, wakePolicy, 0, "self-launch-not-allowed", "none", "failed");
    }
    if ((strategy === "self-launch" && !wakePolicy.allowSelfLaunchWake)
      || (strategy === "aumid" && (!wakePolicy.allowAumidActivation || !app.appUserModelId))) {
      return this.failure(app, wakePolicy, 0, strategy === "aumid" ? "aumid-activation-failed" : "self-launch-not-allowed", method, "failed");
    }
    if (!this.dependencies.activateRunningApp) {
      return this.failure(app, wakePolicy, 0, strategy === "aumid" ? "aumid-activation-failed" : "self-launch-not-allowed", method, "failed");
    }
    if (wakePolicy.maxExternalStateChangingActions < 1) {
      return this.failure(app, wakePolicy, 0, "external-action-limit-reached", method, "failed");
    }

    const activation = await this.dependencies.activateRunningApp(app, strategy);
    const externalActionsPerformed = 1;
    if (requestId !== this.latestRequestId) {
      return this.failure(app, wakePolicy, externalActionsPerformed, "stale-request", method, "partial");
    }
    if (!activation.launched) {
      return this.failure(app, wakePolicy, externalActionsPerformed, strategy === "aumid" ? "aumid-activation-failed" : "self-launch-failed", method, "failed");
    }
    if (!wakePolicy.allowSecondScan) {
      return this.success(app, wakePolicy, externalActionsPerformed, "activation-requested", undefined, method, "requested");
    }

    await (this.dependencies.waitAfterSafeActivation ?? defaultSafeActivationWait)();
    if (requestId !== this.latestRequestId) {
      return this.failure(app, wakePolicy, externalActionsPerformed, "stale-request", method, "partial");
    }
    const processes = await this.dependencies.getProcesses();
    const stages = focusStagesFromCandidates(app, metrics, processes, true);
    const scan = await scanFocusWindowsForStages(`${app.name}:wake:${strategy}:post`, stages, this.dependencies.runPowerShell, this.dependencies.runWindowFocusHelper);
    const candidate = selectWakeCandidate(scan.finalCandidates, wakePolicy, this.cache.get(app.id)?.handle);
    if (candidate?.visible && candidate.iconic !== true) {
      this.cache.set(app.id, candidate);
      return this.success(app, wakePolicy, externalActionsPerformed, "focused", candidate, method, "success", scan.relatedWindows);
    }
    const reason: WakeFailureReason = candidate ? "restored-but-not-interactive" : "no-interactive-window";
    return this.failure(app, wakePolicy, externalActionsPerformed, reason, method, "partial", candidate, scan.relatedWindows);
  }

  private success(
    app: AppEntry,
    wakePolicy: WakePolicy,
    externalActionsPerformed: number,
    outcome: "focused" | "activation-requested",
    selectedCandidate: FocusWindowCandidate | undefined,
    restoreMethod: RestoreMethod,
    restoreResult: RestoreResult,
    postActivationWindows?: FocusWindowCandidate[]
  ) {
    this.recordAttempt(app, wakePolicy, { externalActionsPerformed, selectedCandidate, restoreMethod, restoreResult, postActivationWindows });
    return wakeResult(wakePolicy, externalActionsPerformed, {
      success: true,
      focused: outcome === "focused",
      outcome
    });
  }

  private failure(
    app: AppEntry,
    wakePolicy: WakePolicy,
    externalActionsPerformed: number,
    failureReason: WakeFailureReason,
    restoreMethod: RestoreMethod,
    restoreResult: RestoreResult,
    selectedCandidate?: FocusWindowCandidate,
    postActivationWindows?: FocusWindowCandidate[]
  ) {
    this.recordAttempt(app, wakePolicy, { externalActionsPerformed, selectedCandidate, restoreMethod, restoreResult, failureReason, postActivationWindows });
    return wakeResult(wakePolicy, externalActionsPerformed, {
      success: false,
      focused: false,
      outcome: "failed",
      reason: failureReason
    });
  }

  private recordAttempt(app: AppEntry, wakePolicy: WakePolicy, attempt: Omit<WakeAttemptDiagnostics, "profileId" | "profileSource" | "strategy">) {
    this.lastAttempts.set(app.id, {
      profileId: wakePolicy.profileId,
      profileSource: wakePolicy.profileSource,
      strategy: wakePolicy.strategy,
      ...attempt
    });
  }
}
