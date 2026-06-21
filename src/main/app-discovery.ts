import { existsSync } from "node:fs";
import { basename, extname } from "node:path";
import type { AppGroup, DiscoveredAppCandidate } from "../shared/types.js";

export type ShortcutSource = "start-menu" | "desktop";

export type ShortcutInfo = {
  name: string;
  targetPath: string;
  source: ShortcutSource;
};

const normalizePath = (value: string) => value.trim().replace(/\//g, "\\").toLowerCase();

function chooseGroup(name: string, targetPath: string, groups: AppGroup[]) {
  const text = `${name} ${targetPath}`.toLowerCase();
  const userGroups = groups.filter((group) => !group.isSystem);
  const findByName = (patterns: string[]) => userGroups.find((group) => patterns.some((pattern) => group.name.toLowerCase().includes(pattern)));
  if (/(steam|epic|wegame|game|游戏|launcher)/i.test(text)) return findByName(["游戏", "二游", "game"]) ?? userGroups[0];
  if (/(wechat|weixin|微信|office|word|excel|powerpoint|notion|钉钉|企业微信)/i.test(text)) return findByName(["办公", "office"]) ?? userGroups[0];
  return findByName(["工具", "tool"]) ?? userGroups[0];
}

export function buildDiscoveredApps(shortcuts: ShortcutInfo[], groups: AppGroup[], createId: () => string): DiscoveredAppCandidate[] {
  const seen = new Set<string>();
  const candidates: DiscoveredAppCandidate[] = [];
  for (const shortcut of shortcuts) {
    if (!shortcut.targetPath.toLowerCase().endsWith(".exe")) continue;
    const key = normalizePath(shortcut.targetPath);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const processName = basename(shortcut.targetPath, extname(shortcut.targetPath));
    const group = chooseGroup(shortcut.name || processName, shortcut.targetPath, groups);
    if (!group) continue;
    candidates.push({
      id: createId(),
      name: shortcut.name || processName,
      executablePath: shortcut.targetPath,
      processName,
      groupId: group.id,
      category: group.name,
      source: shortcut.source
    });
  }
  return candidates;
}

export function filterNewShortcuts(shortcuts: ShortcutInfo[], existingPaths: string[]) {
  const existing = new Set(existingPaths.map(normalizePath));
  return shortcuts.filter((shortcut) => shortcut.targetPath && !existing.has(normalizePath(shortcut.targetPath)) && existsSync(shortcut.targetPath));
}
