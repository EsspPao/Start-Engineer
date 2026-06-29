import { basename, dirname, extname } from "node:path";
import type { AddDroppedExecutablesResult, AppEntry, AppGroup } from "../shared/types.js";

type AddDroppedExecutablesInput = {
  filePaths: string[];
  groupId?: string;
  groups: AppGroup[];
  apps: AppEntry[];
  exists: (filePath: string) => boolean;
  createId: () => string;
  cacheAppIcon: (entry: AppEntry) => Promise<AppEntry>;
};

export async function addDroppedExecutablesToApps(input: AddDroppedExecutablesInput): Promise<AddDroppedExecutablesResult> {
  const targetGroup = resolveTargetGroup(input.groups, input.groupId);
  const nextApps = [...input.apps];
  const knownPaths = new Set(nextApps.map((entry) => normalizePath(entry.executablePath)).filter(Boolean));
  const addedAppIds: string[] = [];
  const skippedPaths: string[] = [];

  if (!targetGroup) {
    return { apps: nextApps, addedAppIds, skippedPaths: input.filePaths };
  }

  for (const rawPath of input.filePaths) {
    const filePath = String(rawPath ?? "").trim();
    const normalized = normalizePath(filePath);
    if (!filePath || extname(filePath).toLowerCase() !== ".exe" || knownPaths.has(normalized) || !input.exists(filePath)) {
      skippedPaths.push(filePath);
      continue;
    }

    const name = basename(filePath, extname(filePath));
    const appEntry = await input.cacheAppIcon({
      id: input.createId(),
      name,
      category: targetGroup.name,
      groupId: targetGroup.id,
      executablePath: filePath,
      processName: name,
      workingDirectory: dirname(filePath),
      accent: "#2f66e8"
    });
    knownPaths.add(normalized);
    addedAppIds.push(appEntry.id);
    nextApps.push(appEntry);
  }

  return { apps: nextApps, addedAppIds, skippedPaths };
}

function resolveTargetGroup(groups: AppGroup[], groupId?: string) {
  return groups.find((group) => !group.isSystem && group.id === groupId) ?? groups.find((group) => !group.isSystem);
}

function normalizePath(filePath: string) {
  return filePath.trim().toLowerCase();
}
