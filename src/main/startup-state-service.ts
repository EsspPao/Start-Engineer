import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { StartupPerformanceDiagnostics, StartupPerformanceMarker, StartupViewCache } from "../shared/types.js";

const allowedMarkers = new Set([
  "process-start",
  "electron-ready",
  "main-window-created",
  "renderer-mounted",
  "first-ui-visible",
  "config-hydrated",
  "first-managed-snapshot",
  "background-init-completed"
]);

export class StartupPerformanceTracker {
  private readonly startedAt = Date.now();
  private readonly current = new Map<string, number>([["process-start", 0]]);
  private readonly previous: StartupPerformanceMarker[];

  constructor(private readonly path: string) {
    this.previous = readMarkers(path);
  }

  mark(name: string) {
    if (!allowedMarkers.has(name) || this.current.has(name)) return;
    this.current.set(name, Date.now() - this.startedAt);
    this.persist();
  }

  diagnostics(): StartupPerformanceDiagnostics {
    return {
      current: [...this.current].map(([name, elapsedMs]) => ({ name, elapsedMs })),
      previous: this.previous
    };
  }

  private persist() {
    writeJsonAtomic(this.path, this.diagnostics().current);
  }
}

export class StartupViewCacheStore {
  constructor(private readonly path: string) {}

  load(): StartupViewCache | null {
    if (!existsSync(this.path)) return null;
    try {
      return normalizeStartupViewCache(JSON.parse(readFileSync(this.path, "utf8")));
    } catch {
      try { renameSync(this.path, `${this.path}.corrupt-${Date.now()}.bak`); } catch { /* Ignore backup failures. */ }
      return null;
    }
  }

  save(raw: StartupViewCache) {
    writeJsonAtomic(this.path, normalizeStartupViewCache(raw));
  }
}

export function normalizeStartupViewCache(raw: unknown): StartupViewCache {
  if (!raw || typeof raw !== "object") throw new Error("Invalid startup view cache");
  const value = raw as Partial<StartupViewCache>;
  if (value.version !== 1 || !Array.isArray(value.groups) || !Array.isArray(value.apps) || !Array.isArray(value.folders) || !Array.isArray(value.groupGridOrders) || !value.appearance) {
    throw new Error("Unsupported startup view cache");
  }
  const apps = value.apps.filter((app) => app && typeof app.id === "string" && typeof app.name === "string" && typeof app.groupId === "string").map((app) => ({
    id: app.id,
    name: app.name,
    category: typeof app.category === "string" ? app.category : "app",
    groupId: app.groupId,
    accent: typeof app.accent === "string" ? app.accent : "#7c6df2",
    iconCachePath: typeof app.iconCachePath === "string" ? app.iconCachePath : undefined,
    iconDataUrl: typeof app.iconDataUrl === "string" && app.iconDataUrl.startsWith("data:image/") ? app.iconDataUrl : undefined
  }));
  return {
    version: 1,
    savedAt: Number.isFinite(value.savedAt) ? Number(value.savedAt) : Date.now(),
    activeSection: typeof value.activeSection === "string" ? value.activeSection : value.groups.find((group) => !group.isSystem)?.id ?? "settings",
    groups: value.groups,
    apps,
    folders: value.folders,
    groupGridOrders: value.groupGridOrders,
    appearance: value.appearance,
    windowBounds: value.windowBounds
  };
}

function readMarkers(path: string): StartupPerformanceMarker[] {
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(value) ? value.filter((item) => item && typeof item.name === "string" && Number.isFinite(item.elapsedMs)) : [];
  } catch {
    return [];
  }
}

function writeJsonAtomic(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(value, null, 2), "utf8");
  rmSync(path, { force: true });
  renameSync(temporaryPath, path);
}
