import { execFile } from "node:child_process";
import { basename } from "node:path";
import type { AppEntry, AppMetrics, AppRunningStatus, BatchKillResult, ProcessInfo, RuntimePerformanceDiagnostics, SnapshotMode } from "../shared/types.js";
import { buildManagedRunningStatus, parseTasklistCsv } from "./managed-running-status.js";
import { normalizeNativeSnapshots, type NativeRuntimeHost } from "./native-helper.js";
import { terminatePids } from "./process-termination.js";
import { RuntimeMonitor, type ProcessSnapshot } from "./runtime-monitor.js";

type RuntimeServiceOptions = {
  nativeRuntime: NativeRuntimeHost;
  runPowerShell: (script: string) => Promise<string>;
  loadApps: () => AppEntry[];
  saveApps: (apps: AppEntry[]) => AppEntry[] | void;
  loadAppsWithRuntimeAssociations: () => AppEntry[];
  runtimeAssociatedPids: Map<string, Set<number>>;
  resolveIcon: (path: string, name: string) => Promise<string>;
  getTerminationBlockReason: (name: string, pids: number[]) => string | undefined;
  runTaskkill: (args: string[]) => Promise<void>;
  terminateElevatedPids: (pids: number[]) => Promise<void>;
  processorCount: number;
};

export class RuntimeService {
  private fallbackWarned = false;
  private readonly monitor: RuntimeMonitor;
  private nativeRequests = 0;
  private fallbackRequests = 0;

  constructor(private readonly options: RuntimeServiceOptions) {
    this.monitor = new RuntimeMonitor({
      collect: (mode) => this.getProcessSnapshots(mode),
      loadApps: options.loadAppsWithRuntimeAssociations,
      resolveIcon: options.resolveIcon,
      getTerminationBlockReason: options.getTerminationBlockReason,
      processorCount: options.processorCount,
      ttlMs: 800
    });
  }

  getSnapshot(mode: SnapshotMode = "full", force = false) { return this.monitor.getSnapshot(mode, force); }
  async metrics(): Promise<AppMetrics[]> { return (await this.getSnapshot("managed")).metrics; }
  async processes(): Promise<ProcessInfo[]> { return (await this.getSnapshot("full")).processes; }

  diagnostics(): RuntimePerformanceDiagnostics {
    return { ...this.monitor.diagnostics(), nativeRequests: this.nativeRequests, fallbackRequests: this.fallbackRequests };
  }

  async getManagedRunningStatus() {
    return buildManagedRunningStatus(this.options.loadAppsWithRuntimeAssociations(), parseTasklistCsv(await this.getTasklistOutput()));
  }

  async getProcessSnapshots(mode: SnapshotMode = "full"): Promise<ProcessSnapshot[]> {
    try {
      this.nativeRequests += 1;
      const snapshots = normalizeNativeSnapshots(await this.options.nativeRuntime.request("snapshot", this.nativeSnapshotRequest(mode), 5000));
      this.fallbackWarned = false;
      return snapshots;
    } catch (reason) {
      this.fallbackRequests += 1;
      if (!this.fallbackWarned) {
        this.fallbackWarned = true;
        console.warn(`[native-runtime] process snapshot unavailable; falling back to PowerShell; reason=${reason instanceof Error ? reason.message : String(reason)}`);
      }
      return this.getPowerShellSnapshots();
    }
  }

  async terminateManagedApps(entries: AppEntry[]): Promise<BatchKillResult> {
    const before: AppRunningStatus[] = await this.getManagedRunningStatus();
    const beforeByApp = new Map(before.map((status) => [status.appId, status]));
    const targets = entries.filter((entry) => beforeByApp.get(entry.id)?.isRunning);
    const pids = [...new Set(targets.flatMap((entry) => beforeByApp.get(entry.id)?.pids ?? []))].sort((a, b) => a - b);
    for (const entry of targets) {
      const blocked = this.options.getTerminationBlockReason(`${entry.processName || ""}.exe`, beforeByApp.get(entry.id)?.pids ?? []);
      if (blocked) throw new Error(`${entry.name}：${blocked}`);
    }
    if (pids.length) await this.terminateProcessPids(pids, true);
    const runningStatuses = await this.getManagedRunningStatus();
    const afterByApp = new Map(runningStatuses.map((status) => [status.appId, status]));
    const results = targets.map((entry) => afterByApp.get(entry.id)?.isRunning
      ? { appId: entry.id, name: entry.name, status: "restarted" as const, message: "应用进程仍在运行，可能已被后台服务重新启动。" }
      : { appId: entry.id, name: entry.name, status: "terminated" as const });
    const stoppedIds = new Set(results.filter((item) => item.status === "terminated").map((item) => item.appId));
    for (const id of stoppedIds) this.options.runtimeAssociatedPids.delete(id);
    const apps = this.options.loadApps().map((entry) => stoppedIds.has(entry.id) ? { ...entry, launchedPid: undefined } : entry);
    this.options.saveApps(apps);
    return { apps, results, runningStatuses };
  }

  async terminateProcessPids(pids: number[], assumeRunning = false) {
    await terminatePids(pids, {
      runNormal: this.options.runTaskkill,
      runElevated: this.options.terminateElevatedPids,
      getRunningPids: (values) => this.getRunningPids(values),
      assumeRunning
    });
  }

  private nativeSnapshotRequest(mode: SnapshotMode) {
    if (mode === "full") return { mode };
    const apps = this.options.loadApps();
    const managedNames = [...new Set(apps.flatMap((entry) => [entry.processName, basename(entry.executablePath), ...(entry.processAliases ?? [])]).map((value) => value.trim()).filter(Boolean))];
    const managedPids = [...new Set(apps.flatMap((entry) => [entry.launchedPid, ...(entry.associatedPids ?? []), ...(this.options.runtimeAssociatedPids.get(entry.id) ?? [])]).filter((pid): pid is number => typeof pid === "number" && Number.isSafeInteger(pid) && pid > 0))];
    return { mode, managedNames, managedPids };
  }

  private async getPowerShellSnapshots(): Promise<ProcessSnapshot[]> {
    const script = `
$processes = Get-Process | Select-Object Id,ProcessName,CPU,WorkingSet64
$cim = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,ExecutablePath,ReadTransferCount,WriteTransferCount
$infoMap = @{}; foreach ($item in $cim) { $infoMap[[int]$item.ProcessId] = $item }
$rows = foreach ($proc in $processes) {
  $info = $infoMap[[int]$proc.Id]
  [PSCustomObject]@{
    pid = [int]$proc.Id; parentPid = if ($null -eq $info -or $null -eq $info.ParentProcessId) { 0 } else { [int]$info.ParentProcessId }
    name = [string]$proc.ProcessName; path = if ($null -eq $info) { "" } else { [string]$info.ExecutablePath }
    cpuSeconds = if ($null -eq $proc.CPU) { 0 } else { [double]$proc.CPU }; memoryBytes = if ($null -eq $proc.WorkingSet64) { 0 } else { [int64]$proc.WorkingSet64 }
    readBytes = if ($null -eq $info -or $null -eq $info.ReadTransferCount) { 0 } else { [int64]$info.ReadTransferCount }
    writeBytes = if ($null -eq $info -or $null -eq $info.WriteTransferCount) { 0 } else { [int64]$info.WriteTransferCount }
  }
}
$rows | ConvertTo-Json -Compress`;
    const output = (await this.options.runPowerShell(script)).trim();
    if (!output) return [];
    const parsed = JSON.parse(output) as ProcessSnapshot[] | ProcessSnapshot;
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  private getTasklistOutput(): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile("tasklist.exe", ["/FO", "CSV", "/NH"], { windowsHide: true, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => error ? reject(new Error(String(stderr || error.message).trim())) : resolve(stdout));
    });
  }

  private async getRunningPids(pids: number[]) {
    const candidates = new Set(pids);
    return parseTasklistCsv(await this.getTasklistOutput()).filter((process) => candidates.has(process.pid)).map((process) => process.pid);
  }
}
