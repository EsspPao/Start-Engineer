import { existsSync } from "node:fs";
import { dirname } from "node:path";
import type { AppEntry, AppRunningStatus, LaunchAppResult, RuntimeSnapshot } from "../shared/types.js";
import { normalizeNativeLaunchResult, type NativeLaunchRequest, type NativeLaunchResult, type NativeRuntimeHost } from "./native-helper.js";
import type { ProcessSnapshot } from "./runtime-monitor.js";
import { isMuMuLikeApp } from "./focus-window.js";
import { inferPackageFamilyName, windowsStoreShellTarget, type WindowsStoreAppIdentity } from "./windows-store-apps.js";

type LaunchServiceOptions = {
  nativeRuntime: NativeRuntimeHost;
  runPowerShell: (script: string) => Promise<string>;
  loadApps: () => AppEntry[];
  saveApps: (apps: AppEntry[]) => AppEntry[] | void;
  getApp: (id: string) => AppEntry | undefined;
  getManagedRunningStatus: () => Promise<AppRunningStatus[]>;
  getProcessSnapshots: () => Promise<ProcessSnapshot[]>;
  buildRuntimeSnapshot: (force: boolean) => Promise<RuntimeSnapshot>;
  runtimeAssociatedPids: Map<string, Set<number>>;
  resolveWindowsStoreApp?: (entry: AppEntry) => Promise<WindowsStoreAppIdentity | undefined>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeFilesystemPath = (value: string) => value.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
const nativeHelperWasUnavailable = (reason: unknown) => reason instanceof Error && /native helper unavailable/i.test(reason.message);

export function runningActivationEntry(entry: AppEntry): AppEntry {
  if (!isMuMuLikeApp(entry) || /(?:^|\s)--from-shortcut(?:\s|$)/i.test(entry.launchArgs ?? "")) return entry;
  return {
    ...entry,
    launchArgs: [entry.launchArgs?.trim(), "--from-shortcut"].filter(Boolean).join(" ")
  };
}

export class LaunchService {
  constructor(private readonly options: LaunchServiceOptions) {}

  async launch(id: string, settings: { waitForAssociation?: boolean } = {}): Promise<LaunchAppResult> {
    let entry = this.options.getApp(id);
    if (!entry) return { status: "failed", apps: this.options.loadApps(), errorCode: 2, message: "未找到该应用配置。" };
    entry = await this.refreshWindowsStoreEntry(entry);
    const status = (await this.options.getManagedRunningStatus()).find((item) => item.appId === id);
    if (status?.isRunning) return { status: "alreadyRunning", apps: this.options.loadApps() };
    if (entry.appUserModelId) {
      const result = await this.launchWindowsStoreApp(entry);
      if (result.status !== "launched") return { ...result, apps: this.options.loadApps() };
      const apps = await this.saveLaunchedPidAndTrack(id, result.pid, settings.waitForAssociation === true);
      return { ...result, apps };
    }
    if (inferPackageFamilyName(entry.executablePath) && !existsSync(entry.executablePath)) {
      return { status: "failed", apps: this.options.loadApps(), errorCode: 1168, message: "未找到对应的 Windows 商店应用注册，请确认应用仍已安装。" };
    }
    if (!entry.executablePath || !existsSync(entry.executablePath)) return { status: "failed", apps: this.options.loadApps(), errorCode: 2, message: "程序路径不存在，请重新选择启动程序。" };
    const workingDirectory = entry.workingDirectory || dirname(entry.executablePath);
    if (!existsSync(workingDirectory)) return { status: "failed", apps: this.options.loadApps(), errorCode: 267, message: "应用配置的工作目录无效。" };
    const result = await this.launchExecutable(entry);
    if (result.status !== "launched") return { ...result, apps: this.options.loadApps() };
    const apps = await this.saveLaunchedPidAndTrack(id, result.pid, settings.waitForAssociation === true);
    return { ...result, apps };
  }

  async activateRunningApp(entry: AppEntry) {
    entry = await this.refreshWindowsStoreEntry(entry);
    if (entry.appUserModelId) {
      const result = await this.launchWindowsStoreApp(entry);
      return { launched: result.status === "launched" };
    }
    if (!entry.executablePath || !existsSync(entry.executablePath)) return { launched: false };
    const workingDirectory = entry.workingDirectory || dirname(entry.executablePath);
    if (!existsSync(workingDirectory)) return { launched: false };
    const result = await this.launchExecutable(runningActivationEntry(entry));
    if (result.status !== "launched") return { launched: false };
    void this.saveLaunchedPidAndTrack(entry.id, result.pid, false);
    return { launched: true };
  }

  private async launchExecutable(entry: AppEntry): Promise<Omit<LaunchAppResult, "apps">> {
    try {
      const request = {
        executablePath: entry.executablePath,
        workingDirectory: entry.workingDirectory || dirname(entry.executablePath),
        argumentLine: entry.launchArgs?.trim() || ""
      } satisfies NativeLaunchRequest;
      const result = normalizeNativeLaunchResult(await this.options.nativeRuntime.request("launch", request));
      if (result.errorCode !== 740) return this.mapResult(result);
      const elevatedResult = normalizeNativeLaunchResult(await this.options.nativeRuntime.request(
        "launch",
        { ...request, elevated: true },
        120_000
      ));
      return this.mapResult(elevatedResult);
    } catch (reason) {
      if (nativeHelperWasUnavailable(reason)) return this.launchWithPowerShell(entry);
      console.warn(`[native-runtime] launch response failed without automatic retry; reason=${reason instanceof Error ? reason.message : String(reason)}`);
      return { status: "failed", message: "启动服务暂时无响应，请稍后重试。" };
    }
  }

  private async launchWindowsStoreApp(entry: AppEntry): Promise<Omit<LaunchAppResult, "apps">> {
    const target = windowsStoreShellTarget(entry.appUserModelId!);
    try {
      const result = normalizeNativeLaunchResult(await this.options.nativeRuntime.request("launch", {
        executablePath: "",
        appUserModelId: entry.appUserModelId,
        argumentLine: entry.launchArgs?.trim() || ""
      } satisfies NativeLaunchRequest));
      return this.mapWindowsStoreResult(result);
    } catch (reason) {
      if (!nativeHelperWasUnavailable(reason)) {
        console.warn(`[native-runtime] Windows Store launch failed; reason=${reason instanceof Error ? reason.message : String(reason)}`);
        return { status: "failed", message: "Windows 商店应用启动服务暂时无响应，请稍后重试。" };
      }
      const mapped = await this.launchWindowsStoreWithPowerShell(target);
      return mapped;
    }
  }

  private async launchWindowsStoreWithPowerShell(target: string): Promise<Omit<LaunchAppResult, "apps">> {
    const encodedTarget = Buffer.from(target, "utf16le").toString("base64");
    const script = `
$target = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodedTarget}'))
try {
  Start-Process -FilePath 'explorer.exe' -ArgumentList @($target) -ErrorAction Stop
  [PSCustomObject]@{ ok = $true; pid = 0; errorCode = 0; detail = '' } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ ok = $false; pid = 0; errorCode = 2; detail = [string]$_.Exception.Message } | ConvertTo-Json -Compress
}`;
    return this.mapWindowsStoreResult(normalizeNativeLaunchResult(JSON.parse((await this.options.runPowerShell(script)).trim())));
  }

  private async launchWithPowerShell(entry: AppEntry, elevated = false): Promise<Omit<LaunchAppResult, "apps">> {
    const payload = Buffer.from(JSON.stringify({ executablePath: entry.executablePath, workingDirectory: entry.workingDirectory || dirname(entry.executablePath), argumentLine: entry.launchArgs?.trim() || "" }), "utf16le").toString("base64");
    const script = `
$payloadJson = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${payload}'))
$payload = $payloadJson | ConvertFrom-Json
try {
  $options = @{ FilePath = [string]$payload.executablePath; WorkingDirectory = [string]$payload.workingDirectory; PassThru = $true; ErrorAction = 'Stop' }
  if (${elevated ? "$true" : "$false"}) { $options.Verb = 'RunAs' }
  if (-not [string]::IsNullOrWhiteSpace([string]$payload.argumentLine)) { $options.ArgumentList = [string]$payload.argumentLine }
  $process = Start-Process @options
  [PSCustomObject]@{ ok = $true; pid = [int]$process.Id; errorCode = 0; detail = '' } | ConvertTo-Json -Compress
} catch {
  $code = 0; $cursor = $_.Exception
  while ($null -ne $cursor) { if ($cursor.PSObject.Properties.Name -contains 'NativeErrorCode' -and $cursor.NativeErrorCode) { $code = [int]$cursor.NativeErrorCode; break }; $cursor = $cursor.InnerException }
  if ($code -eq 0 -and $_.Exception.HResult) { $code = [int]($_.Exception.HResult -band 0xFFFF) }
  [PSCustomObject]@{ ok = $false; pid = 0; errorCode = $code; detail = [string]$_.Exception.Message } | ConvertTo-Json -Compress
}`;
    const result = normalizeNativeLaunchResult(JSON.parse((await this.options.runPowerShell(script)).trim()));
    if (!elevated && result.errorCode === 740) return this.launchWithPowerShell(entry, true);
    return this.mapResult(result);
  }

  private mapResult(result: NativeLaunchResult): Omit<LaunchAppResult, "apps"> {
    if (result.ok) return { status: "launched", pid: result.pid };
    if (result.errorCode === 1223) return { status: "cancelled", errorCode: result.errorCode };
    return { status: "failed", errorCode: result.errorCode, message: this.errorMessage(result.errorCode) };
  }

  private mapWindowsStoreResult(result: NativeLaunchResult): Omit<LaunchAppResult, "apps"> {
    if (result.ok) return { status: "launched", pid: result.pid };
    if (result.errorCode === 1223) return { status: "cancelled", errorCode: result.errorCode };
    const errorCode = result.errorCode === 2 || result.errorCode === 3 ? 1168 : result.errorCode;
    return {
      status: "failed",
      errorCode,
      message: "Windows 商店应用启动失败，请确认该应用已正确安装。"
    };
  }

  private errorMessage(errorCode?: number) {
    if (errorCode === 2 || errorCode === 3) return "程序或工作目录不存在。";
    if (errorCode === 5) return "没有权限启动该程序。";
    if (errorCode === 740) return "此应用需要管理员权限，Windows 授权未完成。";
    if (errorCode === 267) return "应用配置的工作目录无效。";
    return "启动失败，请检查程序路径和启动参数。";
  }

  private async refreshWindowsStoreEntry(entry: AppEntry) {
    const shouldResolve = Boolean(this.options.resolveWindowsStoreApp)
      && (!entry.appUserModelId ? Boolean(inferPackageFamilyName(entry.executablePath)) : !entry.executablePath || !existsSync(entry.executablePath));
    if (!shouldResolve) return entry;
    let identity: WindowsStoreAppIdentity | undefined;
    try {
      identity = await this.options.resolveWindowsStoreApp!(entry);
    } catch (reason) {
      console.warn(`[windows-store] Could not refresh ${entry.name}: ${reason instanceof Error ? reason.message : String(reason)}`);
      return entry;
    }
    if (!identity) return entry;
    const executablePath = identity.executablePath;
    const next: AppEntry = {
      ...entry,
      executablePath,
      processName: identity.processName || entry.processName,
      workingDirectory: identity.workingDirectory,
      appUserModelId: identity.appUserModelId
    };
    const changed = next.executablePath !== entry.executablePath
      || next.processName !== entry.processName
      || next.workingDirectory !== entry.workingDirectory
      || next.appUserModelId !== entry.appUserModelId;
    if (changed) this.options.saveApps(this.options.loadApps().map((app) => app.id === entry.id ? next : app));
    return next;
  }

  private isProcessInsideAppDirectory(processPath: string, entry: AppEntry) {
    if (!processPath || !entry.executablePath) return false;
    const appDirectory = normalizeFilesystemPath(dirname(entry.executablePath));
    const childPath = normalizeFilesystemPath(processPath);
    return childPath === normalizeFilesystemPath(entry.executablePath) || childPath.startsWith(`${appDirectory}\\`);
  }

  private collectDescendants(processes: ProcessSnapshot[], rootPid: number) {
    const byParent = new Map<number, ProcessSnapshot[]>();
    for (const process of processes) {
      if (!process.parentPid) continue;
      const children = byParent.get(process.parentPid) ?? [];
      children.push(process);
      byParent.set(process.parentPid, children);
    }
    const descendants: ProcessSnapshot[] = [];
    const seen = new Set<number>();
    const queue = [...(byParent.get(rootPid) ?? [])];
    while (queue.length) {
      const current = queue.shift()!;
      if (seen.has(current.pid)) continue;
      seen.add(current.pid);
      descendants.push(current);
      queue.push(...(byParent.get(current.pid) ?? []));
    }
    return descendants;
  }

  private async learnAssociations(appId: string, launchedPid: number) {
    const descendants = this.collectDescendants(await this.options.getProcessSnapshots(), launchedPid);
    const current = this.options.getApp(appId);
    if (!current || !descendants.length) return { apps: this.options.loadApps(), learned: false };
    const associated = this.options.runtimeAssociatedPids.get(appId) ?? new Set<number>();
    const before = associated.size;
    for (const process of descendants) if (this.isProcessInsideAppDirectory(process.path, current)) associated.add(process.pid);
    if (associated.size) this.options.runtimeAssociatedPids.set(appId, associated);
    return { apps: this.options.loadApps(), learned: associated.size > before };
  }

  private async settleAssociation(appId: string, launchedPid: number) {
    await sleep(800);
    let learned = await this.learnAssociations(appId, launchedPid);
    let snapshot = await this.options.buildRuntimeSnapshot(true);
    if (snapshot.metrics.find((metric) => metric.appId === appId)?.isRunning) {
      void (async () => { await sleep(1200); await this.learnAssociations(appId, launchedPid); await this.options.buildRuntimeSnapshot(true); })()
        .catch((reason) => console.warn(`[launch] Deferred child process learning failed for ${appId}:`, reason));
      return this.options.loadApps();
    }
    await sleep(1200);
    learned = await this.learnAssociations(appId, launchedPid);
    snapshot = await this.options.buildRuntimeSnapshot(true);
    return learned.learned ? learned.apps : snapshot.apps;
  }

  private saveLaunchedPidAndTrack(appId: string, launchedPid: number | undefined, waitForAssociation: boolean) {
    const apps = this.options.loadApps().map((entry) => entry.id === appId ? { ...entry, launchedPid } : entry);
    this.options.saveApps(apps);
    if (!launchedPid) return Promise.resolve(apps);
    const tracking = this.settleAssociation(appId, launchedPid);
    if (waitForAssociation) return tracking;
    void tracking.catch((reason) => console.warn(`[launch] Failed to learn child process aliases for ${appId}:`, reason));
    return Promise.resolve(apps);
  }
}
