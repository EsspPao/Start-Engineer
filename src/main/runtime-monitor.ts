import type { AppEntry, AppMetrics, ProcessInfo, RuntimeSnapshot, SnapshotMode } from "../shared/types.js";

export type ProcessSnapshot = {
  pid: number;
  parentPid?: number;
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
  collect: (mode: SnapshotMode) => Promise<ProcessSnapshot[]>;
  loadApps: () => AppEntry[];
  resolveIcon: (path: string, name: string) => Promise<string>;
  getTerminationBlockReason: (name: string, pids: number[]) => string | undefined;
  processorCount: number;
  ttlMs?: number;
  now?: () => number;
};

type AppIndex = {
  byPid: Map<number, AppEntry[]>;
  byName: Map<string, AppEntry[]>;
  byPath: Map<string, AppEntry[]>;
};

type ProcessMatch = {
  app: AppEntry;
  reasons: Set<"associatedPid" | "path" | "name">;
};

const normalizeName = (value: string) => (value.split(/[\\/]/).pop() ?? value).replace(/\.exe$/i, "").trim().toLowerCase();
const normalizePath = (value: string) => value.trim().toLowerCase();
const addIndexedApp = <K>(map: Map<K, AppEntry[]>, key: K, app: AppEntry) => {
  const existing = map.get(key) ?? [];
  existing.push(app);
  map.set(key, existing);
};

export function buildAppIndex(apps: AppEntry[]): AppIndex {
  const index: AppIndex = { byPid: new Map(), byName: new Map(), byPath: new Map() };
  for (const app of apps) {
    if (app.launchedPid) addIndexedApp(index.byPid, app.launchedPid, app);
    for (const pid of app.associatedPids ?? []) {
      if (Number.isSafeInteger(pid) && pid > 0) addIndexedApp(index.byPid, pid, app);
    }
    const name = normalizeName(app.processName || app.executablePath);
    if (name) addIndexedApp(index.byName, name, app);
    const path = normalizePath(app.executablePath);
    if (path) addIndexedApp(index.byPath, path, app);
  }
  return index;
}

export function findManagedAppMatches(snapshot: ProcessSnapshot, index: AppIndex) {
  const matches = new Map<string, ProcessMatch>();
  const add = (apps: AppEntry[] | undefined, reason: ProcessMatch["reasons"] extends Set<infer T> ? T : never) => {
    for (const app of apps ?? []) {
      const existing = matches.get(app.id);
      if (existing) {
        existing.reasons.add(reason);
      } else {
        matches.set(app.id, { app, reasons: new Set([reason]) });
      }
    }
  };

  add(index.byPid.get(snapshot.pid), "associatedPid");
  add(index.byPath.get(normalizePath(snapshot.path)), "path");
  add(index.byName.get(normalizeName(snapshot.name)), "name");
  return [...matches.values()];
}

function collectDescendantPids(snapshots: ProcessSnapshot[], roots: number[]) {
  const validRoots = new Set(roots.filter((pid) => Number.isSafeInteger(pid) && pid > 0));
  const descendants = new Set<number>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const snapshot of snapshots) {
      if (!snapshot.parentPid) continue;
      if ((validRoots.has(snapshot.parentPid) || descendants.has(snapshot.parentPid)) && !validRoots.has(snapshot.pid) && !descendants.has(snapshot.pid)) {
        descendants.add(snapshot.pid);
        changed = true;
      }
    }
  }
  return [...descendants];
}

export function findManagedApps(snapshot: ProcessSnapshot, index: AppIndex) {
  return findManagedAppMatches(snapshot, index).map((match) => match.app);
}

export class RuntimeMonitor {
  private readonly samples = new Map<number, CounterSample>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private inFlight: { mode: SnapshotMode; promise: Promise<RuntimeSnapshot> } | null = null;
  private cached: { at: number; mode: SnapshotMode; snapshot: RuntimeSnapshot } | null = null;
  private readonly processIconCache = new Map<string, string>();
  private readonly processIconInFlight = new Set<string>();

  constructor(private readonly options: RuntimeMonitorOptions) {
    this.ttlMs = options.ttlMs ?? 800;
    this.now = options.now ?? Date.now;
  }

  async getSnapshot(mode: SnapshotMode = "full", force = false): Promise<RuntimeSnapshot> {
    const now = this.now();
    if (!force && this.cached && now - this.cached.at < this.ttlMs && (mode === "managed" || this.cached.mode === "full")) {
      return this.selectMode(this.cached.snapshot, mode);
    }
    if (!this.inFlight || (mode === "full" && this.inFlight.mode === "managed")) {
      const inFlight = { mode, promise: this.collectSnapshot(mode) };
      inFlight.promise = inFlight.promise.finally(() => {
        if (this.inFlight === inFlight) this.inFlight = null;
      });
      this.inFlight = inFlight;
    }
    const snapshot = await this.inFlight.promise;
    return this.selectMode(snapshot, mode);
  }

  get sampleCount() {
    return this.samples.size;
  }

  private selectMode(snapshot: RuntimeSnapshot, mode: SnapshotMode): RuntimeSnapshot {
    return mode === "managed" ? { ...snapshot, processes: [] } : snapshot;
  }

  private async collectSnapshot(mode: SnapshotMode): Promise<RuntimeSnapshot> {
    const at = this.now();
    const snapshots = await this.options.collect(mode);
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
    const matchesByApp = new Map<string, Array<{ process: ProcessSnapshot; reasons: Set<"associatedPid" | "path" | "name"> }>>();
    const managedByPid = new Map<number, AppEntry>();
    for (const process of snapshots) {
      const managedMatches = findManagedAppMatches(process, appIndex);
      if (!managedMatches.length) continue;
      managedByPid.set(process.pid, managedMatches[0].app);
      for (const managed of managedMatches) {
        const matches = matchesByApp.get(managed.app.id) ?? [];
        matches.push({ process, reasons: managed.reasons });
        matchesByApp.set(managed.app.id, matches);
      }
    }

    const metrics = apps.map<AppMetrics>((entry) => {
      const matches = matchesByApp.get(entry.id) ?? [];
      const metric = matches.reduce<AppMetrics>((result, match) => {
        const process = match.process;
        const rate = rates.get(process.pid)!;
        result.isRunning = true;
        result.cpuPercent += rate.cpuPercent;
        result.memoryBytes += process.memoryBytes;
        result.diskBytesPerSecond += rate.diskBytesPerSecond;
        result.pids.push(process.pid);
        result.matchedPids.push(process.pid);
        if (match.reasons.has("associatedPid")) result.associatedPids.push(process.pid);
        if (process.name && !result.matchedProcessNames.includes(process.name)) result.matchedProcessNames.push(process.name);
        if (process.path && !result.matchedPaths.includes(process.path)) result.matchedPaths.push(process.path);
        result.lastSeenPath ||= process.path || undefined;
        return result;
      }, { appId: entry.id, isRunning: false, cpuPercent: 0, memoryBytes: 0, diskBytesPerSecond: 0, pids: [], matchedPids: [], associatedPids: [], matchedProcessNames: [], matchedPaths: [] });
      const matchedPidSet = new Set(metric.matchedPids);
      const descendantPids = collectDescendantPids(snapshots, metric.matchedPids).filter((pid) => !matchedPidSet.has(pid));
      metric.associatedPids = [...new Set([...metric.associatedPids, ...descendantPids])];
      return metric;
    });

    if (mode === "managed") {
      const snapshot = { apps, metrics, processes: [] };
      this.cached = { at, mode, snapshot };
      return snapshot;
    }

    const grouped = new Map<string, ProcessInfo>();
    await Promise.all(snapshots.map(async (process) => {
      const name = `${process.name}.exe`;
      const key = name.toLowerCase();
      const rate = rates.get(process.pid)!;
      const managed = managedByPid.get(process.pid);
      const iconDataUrl = managed?.iconDataUrl || this.resolveProcessIconLater(process);
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
    this.cached = { at, mode, snapshot };
    return snapshot;
  }

  private processIconKey(process: ProcessSnapshot) {
    return normalizePath(process.path) || normalizeName(process.name);
  }

  private resolveProcessIconLater(process: ProcessSnapshot) {
    const key = this.processIconKey(process);
    if (!key) return "";
    const cached = this.processIconCache.get(key);
    if (cached) return cached;
    if (!this.processIconInFlight.has(key)) {
      this.processIconInFlight.add(key);
      void this.options.resolveIcon(process.path, process.name)
        .then((iconDataUrl) => {
          if (!iconDataUrl) return;
          if (this.processIconCache.size >= 512) {
            const oldest = this.processIconCache.keys().next().value;
            if (oldest) this.processIconCache.delete(oldest);
          }
          this.processIconCache.set(key, iconDataUrl);
        })
        .catch(() => undefined)
        .finally(() => this.processIconInFlight.delete(key));
    }
    return "";
  }
}
