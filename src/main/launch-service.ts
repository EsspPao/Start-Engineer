import { existsSync } from "node:fs";
import { dirname } from "node:path";
import type { AppEntry, AppRunningStatus, LaunchAppResult, RuntimeSnapshot } from "../shared/types.js";
import { normalizeNativeLaunchResult, type NativeLaunchRequest, type NativeLaunchResult, type NativeRuntimeHost } from "./native-helper.js";
import type { ProcessSnapshot } from "./runtime-monitor.js";

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
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeFilesystemPath = (value: string) => value.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
const nativeHelperWasUnavailable = (reason: unknown) => reason instanceof Error && /native helper unavailable/i.test(reason.message);

export class LaunchService {
  constructor(private readonly options: LaunchServiceOptions) {}

  async launch(id: string, settings: { waitForAssociation?: boolean } = {}): Promise<LaunchAppResult> {
    const entry = this.options.getApp(id);
    if (!entry) return { status: "failed", apps: this.options.loadApps(), errorCode: 2, message: "未找到该应用配置。" };
    const status = (await this.options.getManagedRunningStatus()).find((item) => item.appId === id);
    if (status?.isRunning) return { status: "alreadyRunning", apps: this.options.loadApps() };
    if (!entry.executablePath || !existsSync(entry.executablePath)) return { status: "failed", apps: this.options.loadApps(), errorCode: 2, message: "程序路径不存在，请重新选择启动程序。" };
    const workingDirectory = entry.workingDirectory || dirname(entry.executablePath);
    if (!existsSync(workingDirectory)) return { status: "failed", apps: this.options.loadApps(), errorCode: 267, message: "应用配置的工作目录无效。" };
    const result = await this.launchExecutable(entry);
    if (result.status !== "launched") return { ...result, apps: this.options.loadApps() };
    const apps = await this.saveLaunchedPidAndTrack(id, result.pid, settings.waitForAssociation === true);
    return { ...result, apps };
  }

  async activateRunningApp(entry: AppEntry) {
    if (!entry.executablePath || !existsSync(entry.executablePath)) return { launched: false };
    const workingDirectory = entry.workingDirectory || dirname(entry.executablePath);
    if (!existsSync(workingDirectory)) return { launched: false };
    const result = await this.launchExecutable(entry);
    if (result.status !== "launched") return { launched: false };
    void this.saveLaunchedPidAndTrack(entry.id, result.pid, false);
    return { launched: true };
  }

  private async launchExecutable(entry: AppEntry): Promise<Omit<LaunchAppResult, "apps">> {
    try {
      const result = normalizeNativeLaunchResult(await this.options.nativeRuntime.request("launch", {
        executablePath: entry.executablePath,
        workingDirectory: entry.workingDirectory || dirname(entry.executablePath),
        argumentLine: entry.launchArgs?.trim() || ""
      } satisfies NativeLaunchRequest));
      return this.mapResult(result);
    } catch (reason) {
      if (nativeHelperWasUnavailable(reason)) return this.launchWithPowerShell(entry);
      console.warn(`[native-runtime] launch response failed without automatic retry; reason=${reason instanceof Error ? reason.message : String(reason)}`);
      return { status: "failed", message: "启动服务暂时无响应，请稍后重试。" };
    }
  }

  private async launchWithPowerShell(entry: AppEntry): Promise<Omit<LaunchAppResult, "apps">> {
    const payload = Buffer.from(JSON.stringify({ executablePath: entry.executablePath, workingDirectory: entry.workingDirectory || dirname(entry.executablePath), argumentLine: entry.launchArgs?.trim() || "" }), "utf16le").toString("base64");
    const script = `
$payloadJson = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${payload}'))
$payload = $payloadJson | ConvertFrom-Json
try {
  $options = @{ FilePath = [string]$payload.executablePath; WorkingDirectory = [string]$payload.workingDirectory; PassThru = $true; ErrorAction = 'Stop' }
  if (-not [string]::IsNullOrWhiteSpace([string]$payload.argumentLine)) { $options.ArgumentList = [string]$payload.argumentLine }
  $process = Start-Process @options
  [PSCustomObject]@{ ok = $true; pid = [int]$process.Id; errorCode = 0; detail = '' } | ConvertTo-Json -Compress
} catch {
  $code = 0; $cursor = $_.Exception
  while ($null -ne $cursor) { if ($cursor.PSObject.Properties.Name -contains 'NativeErrorCode' -and $cursor.NativeErrorCode) { $code = [int]$cursor.NativeErrorCode; break }; $cursor = $cursor.InnerException }
  if ($code -eq 0 -and $_.Exception.HResult) { $code = [int]($_.Exception.HResult -band 0xFFFF) }
  [PSCustomObject]@{ ok = $false; pid = 0; errorCode = $code; detail = [string]$_.Exception.Message } | ConvertTo-Json -Compress
}`;
    return this.mapResult(normalizeNativeLaunchResult(JSON.parse((await this.options.runPowerShell(script)).trim())));
  }

  private mapResult(result: NativeLaunchResult): Omit<LaunchAppResult, "apps"> {
    if (result.ok) return { status: "launched", pid: result.pid };
    if (result.errorCode === 1223) return { status: "cancelled", errorCode: result.errorCode };
    return { status: "failed", errorCode: result.errorCode, message: this.errorMessage(result.errorCode) };
  }

  private errorMessage(errorCode?: number) {
    if (errorCode === 2 || errorCode === 3) return "程序或工作目录不存在。";
    if (errorCode === 5) return "没有权限启动该程序。";
    if (errorCode === 267) return "应用配置的工作目录无效。";
    return "启动失败，请检查程序路径和启动参数。";
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
