import type { AppEntry, AppGroup, AppWakeStrategy } from "../shared/types.js";

const appWakeStrategies = new Set<AppWakeStrategy>(["auto", "window-only", "self-launch", "aumid"]);

export function normalizeGroups(raw: Partial<AppGroup>[], allowedIcons: Set<string>): AppGroup[] {
  return raw
    .filter((group) => group.id && group.id !== "processes" && group.id !== "settings")
    .map((group, order) => ({
      id: String(group.id),
      name: String(group.name || "未命名分组").trim().slice(0, 20),
      icon: allowedIcons.has(String(group.icon)) ? String(group.icon) : "grid",
      isSystem: false,
      order: Number.isFinite(group.order) ? Number(group.order) : order
    }))
    .sort((a, b) => a.order - b.order);
}

export function migrateAppEntry(raw: Partial<AppEntry>, groupId: string, createId: () => string): AppEntry {
  const executablePath = raw.executablePath ?? "";
  const fileName = executablePath.split(/[\\/]/).pop() ?? "";
  const processName = raw.processName || fileName.replace(/\.[^.]+$/, "") || raw.name || "app";
  return {
    id: raw.id || createId(), name: raw.name || processName, category: raw.category || "应用", groupId,
    executablePath, processName, accent: raw.accent || "#2f66e8", iconCachePath: raw.iconCachePath,
    iconDataUrl: raw.iconDataUrl, iconCacheVersion: raw.iconCacheVersion, iconPixelSize: raw.iconPixelSize,
    launchArgs: raw.launchArgs, workingDirectory: raw.workingDirectory, appUserModelId: raw.appUserModelId,
    wakeStrategy: appWakeStrategies.has(raw.wakeStrategy as AppWakeStrategy) ? raw.wakeStrategy as AppWakeStrategy : "auto",
    launchedPid: raw.launchedPid
  };
}
