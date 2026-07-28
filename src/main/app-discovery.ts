import { existsSync } from "node:fs";
import { basename, extname } from "node:path";
import type { AppEntry, AppGroup, DiscoveredAppCandidate } from "../shared/types.js";
import { inferPackageFamilyName, type WindowsStoreAppIdentity } from "./windows-store-apps.js";

export type ShortcutSource = DiscoveredAppCandidate["source"];

export type ShortcutInfo = {
  name: string;
  targetPath: string;
  source: ShortcutSource;
  shortcutPath?: string;
  workingDirectory?: string;
  launchArgs?: string;
  iconPath?: string;
};

const normalizePath = (value: string) => value.trim().replace(/\//g, "\\").toLowerCase();
const noisyNamePattern = /(uninstall|unins|update|updater|helper|service|crash|crashpad|setup|installer|runtime|redist|repair|maintenance|daemon|bootstrapper|renderer|utility)/i;
const noisyPathPattern = /(\\node_modules\\|\\windows\\system32\\|\\windows\\syswow64\\|\\appdata\\local\\temp\\|\\temp\\|\\logs?\\|\\cache\\|\\installer\\|\\update\\)/i;

function chooseGroup(name: string, targetPath: string, groups: AppGroup[]) {
  const text = `${name} ${targetPath}`.toLowerCase();
  const userGroups = groups.filter((group) => !group.isSystem);
  const findByName = (patterns: string[]) => userGroups.find((group) => patterns.some((pattern) => group.name.toLowerCase().includes(pattern)));
  if (/(steam|epic|wegame|game|游戏|launcher)/i.test(text)) return findByName(["游戏", "二游", "game"]) ?? userGroups[0];
  if (/(wechat|weixin|微信|office|word|excel|powerpoint|notion|钉钉|企业微信)/i.test(text)) return findByName(["办公", "office"]) ?? userGroups[0];
  return findByName(["工具", "tool"]) ?? userGroups[0];
}

function sourceRank(source: ShortcutSource) {
  if (source === "windows-store") return 0;
  if (source === "start-menu") return 1;
  if (source === "desktop") return 2;
  return 4;
}

function executableStem(value: string) {
  return basename(value, extname(value)).trim().toLocaleLowerCase();
}

function qualityPenalty(candidate: Pick<DiscoveredAppCandidate, "name" | "executablePath">) {
  const text = `${candidate.name} ${candidate.executablePath}`;
  let penalty = 0;
  if (noisyNamePattern.test(text)) penalty += 100;
  if (noisyPathPattern.test(candidate.executablePath)) penalty += 80;
  if (!/\\program files( \(x86\))?\\/i.test(candidate.executablePath) && /\\appdata\\/i.test(candidate.executablePath)) penalty += 12;
  return penalty;
}

function candidateRank(candidate: Pick<DiscoveredAppCandidate, "name" | "executablePath" | "source" | "shortcutPath">, query = "") {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const normalizedName = candidate.name.trim().toLocaleLowerCase();
  const stem = executableStem(candidate.executablePath);
  let rank = sourceRank(candidate.source) * 100 + qualityPenalty(candidate);
  if (candidate.shortcutPath) rank -= 10;
  if (candidate.executablePath.toLowerCase().endsWith(".exe")) rank -= 8;
  if (/\\program files( \(x86\))?\\/i.test(candidate.executablePath)) rank -= 8;
  if (normalizedName && stem && (normalizedName === stem || normalizedName.replace(/\s+/g, "") === stem.replace(/\s+/g, ""))) rank -= 18;
  if (normalizedQuery) {
    if (normalizedName === normalizedQuery) rank -= 30;
    else if (normalizedName.startsWith(normalizedQuery)) rank -= 18;
    else if (stem.startsWith(normalizedQuery)) rank -= 12;
  }
  return Math.max(0, rank);
}

function withScore(candidate: DiscoveredAppCandidate, query = ""): DiscoveredAppCandidate {
  const rank = candidateRank(candidate, query);
  return { ...candidate, rank, score: Math.max(0, 1000 - rank) };
}

function isLowQualityCandidate(candidate: Pick<DiscoveredAppCandidate, "name" | "executablePath">) {
  const text = `${candidate.name} ${candidate.executablePath}`;
  return noisyNamePattern.test(text) || noisyPathPattern.test(candidate.executablePath);
}

export function buildDiscoveredApps(shortcuts: ShortcutInfo[], groups: AppGroup[], createId: () => string): DiscoveredAppCandidate[] {
  const candidates = new Map<string, DiscoveredAppCandidate>();
  for (const shortcut of shortcuts) {
    if (!shortcut.targetPath.toLowerCase().endsWith(".exe")) continue;
    const key = normalizePath(shortcut.targetPath);
    if (!key) continue;
    const processName = basename(shortcut.targetPath, extname(shortcut.targetPath));
    const group = chooseGroup(shortcut.name || processName, shortcut.targetPath, groups);
    if (!group) continue;
    const candidate = withScore({
      id: createId(),
      name: shortcut.name || processName,
      executablePath: shortcut.targetPath,
      processName,
      groupId: group.id,
      category: group.name,
      source: shortcut.source,
      shortcutPath: shortcut.shortcutPath,
      workingDirectory: shortcut.workingDirectory,
      launchArgs: shortcut.launchArgs,
      iconPath: shortcut.iconPath
    });
    const existing = candidates.get(key);
    if (!existing || candidateRank(candidate) < candidateRank(existing)) candidates.set(key, candidate);
  }
  return [...candidates.values()].sort((a, b) => (a.rank ?? candidateRank(a)) - (b.rank ?? candidateRank(b)) || a.name.localeCompare(b.name, "zh-CN"));
}

export function buildWindowsStoreAppCandidates(apps: WindowsStoreAppIdentity[], groups: AppGroup[], createId: () => string): DiscoveredAppCandidate[] {
  return apps.flatMap((app) => {
    const group = chooseGroup(app.name || app.processName, `${app.appUserModelId} ${app.executablePath}`, groups);
    if (!group) return [];
    return [withScore({
      id: createId(),
      name: app.name || app.processName,
      executablePath: app.executablePath,
      processName: app.processName || app.name,
      groupId: group.id,
      category: group.name,
      source: "windows-store",
      appUserModelId: app.appUserModelId,
      workingDirectory: app.workingDirectory
    })];
  }).sort((a, b) => (a.rank ?? candidateRank(a)) - (b.rank ?? candidateRank(b)) || a.name.localeCompare(b.name, "zh-CN"));
}

export function filterNewShortcuts(shortcuts: ShortcutInfo[], existingPaths: string[]) {
  const existing = new Set(existingPaths.map(normalizePath));
  return shortcuts.filter((shortcut) => shortcut.targetPath && !existing.has(normalizePath(shortcut.targetPath)) && existsSync(shortcut.targetPath));
}

export function searchDiscoveredAppCandidates(candidates: DiscoveredAppCandidate[], query: string, existingApps: Pick<AppEntry, "id" | "name" | "processName" | "executablePath" | "groupId" | "appUserModelId">[]) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];
  const existingByPath = new Map(existingApps.flatMap((app) => {
    const path = normalizePath(app.executablePath);
    return path ? [[path, app] as const] : [];
  }));
  const existingByAppUserModelId = new Map(existingApps.flatMap((app) => app.appUserModelId ? [[app.appUserModelId.toLocaleLowerCase(), app] as const] : []));

  return candidates
    .filter((candidate) => {
      if (isLowQualityCandidate(candidate)) return false;
      const searchable = `${candidate.name} ${candidate.processName} ${candidate.executablePath} ${candidate.appUserModelId ?? ""}`.toLocaleLowerCase();
      return searchable.includes(normalized);
    })
    .map((candidate) => {
      const appUserModelId = candidate.appUserModelId?.toLocaleLowerCase();
      const packageFamilyName = appUserModelId?.split("!")[0];
      const existing = (appUserModelId ? existingByAppUserModelId.get(appUserModelId) : undefined)
        ?? (candidate.executablePath ? existingByPath.get(normalizePath(candidate.executablePath)) : undefined)
        ?? (packageFamilyName ? existingApps.find((app) => {
          if (app.appUserModelId || inferPackageFamilyName(app.executablePath).toLocaleLowerCase() !== packageFamilyName) return false;
          const candidateProcess = candidate.processName.trim().toLocaleLowerCase();
          const existingProcess = app.processName.trim().toLocaleLowerCase();
          return Boolean(candidateProcess && existingProcess && candidateProcess === existingProcess)
            || candidate.name.trim().toLocaleLowerCase() === app.name.trim().toLocaleLowerCase();
        }) : undefined);
      return withScore({
        ...candidate,
        alreadyAdded: Boolean(existing),
        existingAppId: existing?.id,
        existingGroupId: existing?.groupId
      }, query);
    })
    .sort((a, b) => (a.rank ?? candidateRank(a, query)) - (b.rank ?? candidateRank(b, query))
      || Number(a.alreadyAdded) - Number(b.alreadyAdded)
      || a.name.localeCompare(b.name, "zh-CN"))
    .slice(0, 40);
}
