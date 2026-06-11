import type { AppEntry, AppMetrics, ProcessInfo, RuntimeSnapshot, SnapshotMode } from "../shared/types.js";

export type ProcessSnapshot = {
  pid: number;
  name: string;
  path: string;
  cpuSeconds: number;
  memoryBytes: number;
  readBytes: number;
  writeBytes: number;
};

type CounterSample = {
  at: number;
  cpuSeconds: number;
  readBytes: number;
  writeBytes: number;
};

type RuntimeMonitorOptions = {
  collect: () => Promise<ProcessSnapshot[]>;
  loadApps: () => AppEntry[];
  resolveIcon: (path: string, name: string) => Promise<string>;
  getTerminationBlockReason: (name: string, pids: number[]) => string | undefined;
  processorCount: number;
  ttlMs?: number;
  now?: () => number;
};

type AppIndex = {
  byPid: Map<number, AppEntry>;
  byName: Map<string, AppEntry>;
  byPath: Map<string, AppEntry>;
};

const normalizeName = (value: string) => (value.split(/[\\/]/).pop() ?? value).replace(/\.exe$/i, "").trim().toLowerCase();
const normalizePath = (value: string) => value.trim().toLowerCase();

export function buildAppIndex(apps: AppEntry[]): AppIndex {
  const index: AppIndex = { byPid: new Map(), byName: new Map(), byPath: new Map() };
  for (const app of apps) {
    if (app.launchedPid) index.byPid.set(app.launchedPid, app);
    const name = normalizeName(app.processName || app.executablePath);
    if (name && !index.byName.has(name)) index.byName.set(name, app);
    const path = normalizePath(app.executablePath);
    if (path && !index.byPath.has(path)) index.byPath.set(path, app);
  }
  return index;
}

export function findManagedApp(snapshot: ProcessSnapshot, index: AppIndex) {
  return index.byPid.get(snapshot.pid)
    ?? index.byPath.get(normalizePath(snapshot.path))
    ?? index.byName.get(normalizeName(snapshot.name));
}

export class RuntimeMonitor {
  private readonly samples = new Map<number, CounterSample>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private inFlight: Promise<RuntimeSnapshot> | null = null;
  private cached: { at: number; snapshot: RuntimeSnapshot } | null = null;

  constructor(private readonly options: RuntimeMonitorOptions) {
    this.ttlMs = options.ttlMs ?? 800;
    this.now = options.now ?? Date.now;
  }

  async getSnapshot(mode: SnapshotMode = "full", force = false): Promise<RuntimeSnapshot> {
    const now = this.now();
    if (!force && this.cached && now - this.cached.at < this.ttlMs) {
      return this.selectMode(this.cached.snapshot, mode);
    }
    if (!this.inFlight) {
      this.inFlight = this.collectSnapshot().finally(() => {
        this.inFlight = null;
      });
    }
    const snapshot = await this.inFlight;
    return this.selectMode(snapshot, mode);
  }

  get sampleCount() {
    return this.samples.size;
  }

  private selectMode(snapshot: RuntimeSnapshot, mode: SnapshotMode): RuntimeSnapshot {
    return mode === "managed" ? { ...snapshot, processes: [] } : snapshot;
  }

  private async collectSnapshot(): Promise<RuntimeSnapshot> {
    const at = this.now();
    const snapshots = await this.options.collect();
    const activePids = new Set(snapshots.map((item) => item.pid));
    for (const pid of this.samples.keys()) {
      if (!activePids.has(pid)) this.samples.delete(pid);
    }

    const rates = new Map<number, { cpuPercent: number; diskBytesPerSecond: number }>();
    for (const snapshot of snapshots) {
      const previous = this.samples.get(snapshot.pid);
      let cpuPercent = 0;
      let diskBytesPerSecond = 0;
      if (previous) {
        const wallDelta = Math.max(0.001, (at - previous.at) / 1000);
        cpuPercent = Math.min(100, Math.max(0, snapshot.cpuSeconds - previous.cpuSeconds) / wallDelta / Math.max(1, this.options.processorCount) * 100);
        const diskDelta = Math.max(0, snapshot.readBytes + snapshot.writeBytes - previous.readBytes - previous.writeBytes);
        diskBytesPerSecond = diskDelta / wallDelta;
      }
      this.samples.set(snapshot.pid, { at, cpuSeconds: snapshot.cpuSeconds, readBytes: snapshot.readBytes, writeBytes: snapshot.writeBytes });
      rates.set(snapshot.pid, { cpuPercent, diskBytesPerSecond });
    }

    const apps = this.options.loadApps();
    const appIndex = buildAppIndex(apps);
    const matchesByApp = new Map<string, ProcessSnapshot[]>();
    const managedByPid = new Map<number, AppEntry>();
    for (const process of snapshots) {
      const managed = findManagedApp(process, appIndex);
      if (!managed) continue;
      managedByPid.set(process.pid, managed);
      const matches = matchesByApp.get(managed.id) ?? [];
      matches.push(process);
      matchesByApp.set(managed.id, matches);
    }

    const metrics = apps.map<AppMetrics>((entry) => {
      const matches = matchesByApp.get(entry.id) ?? [];
      return matches.reduce<AppMetrics>((result, process) => {
        const rate = rates.get(process.pid)!;
        result.isRunning = true;
        result.cpuPercent += rate.cpuPercent;
        result.memoryBytes += process.memoryBytes;
        result.diskBytesPerSecond += rate.diskBytesPerSecond;
        result.pids.push(process.pid);
        result.lastSeenPath ||= process.path || undefined;
        return result;
      }, { appId: entry.id, isRunning: false, cpuPercent: 0, memoryBytes: 0, diskBytesPerSecond: 0, pids: [] });
    });

    const grouped = new Map<string, ProcessInfo>();
    await Promise.all(snapshots.map(async (process) => {
      const name = `${process.name}.exe`;
      const key = name.toLowerCase();
      const rate = rates.get(process.pid)!;
      const managed = managedByPid.get(process.pid);
      const iconDataUrl = managed?.iconDataUrl || await this.options.resolveIcon(process.path, process.name);
      const existing = grouped.get(key);
      if (!existing) {
        const blocked = this.options.getTerminationBlockReason(name, [process.pid]);
        grouped.set(key, {
          pid: process.pid, pids: [process.pid], processCount: 1, name,
          exePath: process.path || undefined, exePaths: process.path ? [process.path] : [], iconDataUrl,
          cpuPercent: rate.cpuPercent, memoryBytes: process.memoryBytes, diskBytesPerSecond: rate.diskBytesPerSecond,
          isManagedApp: Boolean(managed), canTerminate: !blocked, terminationBlockedReason: blocked
        });
        return;
      }
      existing.pids.push(process.pid);
      existing.processCount += 1;
      existing.cpuPercent += rate.cpuPercent;
      existing.memoryBytes += process.memoryBytes;
      existing.diskBytesPerSecond += rate.diskBytesPerSecond;
      existing.isManagedApp ||= Boolean(managed);
      existing.exePath ||= process.path || undefined;
      if (process.path && !existing.exePaths.includes(process.path)) existing.exePaths.push(process.path);
      existing.iconDataUrl ||= iconDataUrl;
      existing.terminationBlockedReason = this.options.getTerminationBlockReason(name, existing.pids);
      existing.canTerminate = !existing.terminationBlockedReason;
    }));

    const snapshot = { apps, metrics, processes: [...grouped.values()].sort((a, b) => b.cpuPercent - a.cpuPercent) };
    this.cached = { at, snapshot };
    return snapshot;
  }
}
