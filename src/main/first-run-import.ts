import type { AppEntry, AppGroup, DiscoveredAppCandidate } from "../shared/types.js";

const maxCandidatesPerGroup = 6;
const maxCandidatesTotal = 20;

const recommendedApps: Array<{ group: "游戏" | "办公" | "工具" | "AI"; aliases: string[] }> = [
  { group: "游戏", aliases: ["steam"] },
  { group: "游戏", aliases: ["wegame"] },
  { group: "游戏", aliases: ["wuthering waves", "鸣潮"] },
  { group: "游戏", aliases: ["endfield", "终末地"] },
  { group: "游戏", aliases: ["domekeeper", "dome keeper", "穹顶守护者"] },
  { group: "游戏", aliases: ["ok-ww"] },
  { group: "办公", aliases: ["baidunetdisk", "百度网盘"] },
  { group: "办公", aliases: ["dingtalk", "钉钉"] },
  { group: "办公", aliases: ["chrome", "google chrome"] },
  { group: "办公", aliases: ["notion"] },
  { group: "办公", aliases: ["weixin", "微信"] },
  { group: "工具", aliases: ["notepad++", "notepadplusplus"] },
  { group: "工具", aliases: ["obsidian"] },
  { group: "工具", aliases: ["snipaste"] },
  { group: "工具", aliases: ["wallpaper64", "wallpaper engine"] },
  { group: "AI", aliases: ["chatgpt", "openai.codex"] },
  { group: "AI", aliases: ["clash-verge", "clash verge"] }
];

type CurateFirstRunImportOptions = {
  candidates: DiscoveredAppCandidate[];
  groups: AppGroup[];
  templateApps?: AppEntry[];
  createId: () => string;
  pathExists: (path: string) => boolean;
};

export function curateFirstRunImportCandidates(options: CurateFirstRunImportOptions) {
  const groups = options.groups.filter((group) => !group.isSystem).sort((a, b) => a.order - b.order);
  const templateCandidates = buildTemplateCandidates(options, groups);
  if (templateCandidates.length) return limitByGroup(templateCandidates, groups);

  const recommended = options.candidates.flatMap((candidate) => {
    const recommendation = recommendedApps.find((item) => matchesAliases(candidate, item.aliases));
    if (!recommendation) return [];
    const group = findGroupByTemplateName(groups, recommendation.group) ?? groups.find((item) => item.id === candidate.groupId);
    if (!group) return [];
    return [{ ...candidate, groupId: group.id, category: group.name, isAvailable: true }];
  });
  return limitByGroup(dedupeCandidates(recommended), groups);
}

function buildTemplateCandidates(options: CurateFirstRunImportOptions, groups: AppGroup[]) {
  const templateApps = options.templateApps ?? [];
  if (!templateApps.length) return [];
  const candidates: DiscoveredAppCandidate[] = [];
  for (const template of templateApps) {
    if (!template?.name || !template.processName || !template.executablePath) continue;
    const discovered = options.candidates.find((candidate) => sameApp(candidate, template));
    const isAvailable = Boolean(discovered) || options.pathExists(template.executablePath);
    const group = groups.find((item) => item.id === template.groupId)
      ?? findGroupByTemplateName(groups, template.category)
      ?? groups.find((item) => item.id === discovered?.groupId);
    if (!group) continue;
    candidates.push({
      ...(discovered ?? {
        id: options.createId(),
        source: template.appUserModelId ? "windows-store" as const : "desktop" as const,
        executablePath: template.executablePath,
        processName: template.processName
      }),
      name: template.name,
      groupId: group.id,
      category: group.name,
      appUserModelId: discovered?.appUserModelId ?? template.appUserModelId,
      workingDirectory: discovered?.workingDirectory ?? template.workingDirectory,
      launchArgs: discovered?.launchArgs ?? template.launchArgs,
      iconCachePath: template.iconCachePath,
      iconDataUrl: template.iconDataUrl,
      iconCacheVersion: template.iconCacheVersion,
      iconPixelSize: template.iconPixelSize,
      isAvailable
    });
  }
  return dedupeCandidates(candidates);
}

function limitByGroup(candidates: DiscoveredAppCandidate[], groups: AppGroup[]) {
  const order = new Map(groups.map((group, index) => [group.id, index]));
  const counts = new Map<string, number>();
  return candidates
    .sort((a, b) => (order.get(a.groupId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.groupId) ?? Number.MAX_SAFE_INTEGER)
      || Number(a.isAvailable === false) - Number(b.isAvailable === false)
      || (a.rank ?? 0) - (b.rank ?? 0)
      || a.name.localeCompare(b.name, "zh-CN"))
    .filter((candidate) => {
      const count = counts.get(candidate.groupId) ?? 0;
      if (count >= maxCandidatesPerGroup) return false;
      counts.set(candidate.groupId, count + 1);
      return true;
    })
    .slice(0, maxCandidatesTotal);
}

function findGroupByTemplateName(groups: AppGroup[], name: string) {
  const normalized = normalizeText(name);
  const aliases = normalized === "ai" ? ["ai", "智能"] :
    normalized.includes("游戏") ? ["游戏", "二游", "game"] :
      normalized.includes("办公") ? ["办公", "office"] :
        normalized.includes("工具") ? ["工具", "tool"] : [normalized];
  return groups.find((group) => aliases.some((alias) => normalizeText(group.name).includes(normalizeText(alias))));
}

function sameApp(candidate: DiscoveredAppCandidate, template: AppEntry) {
  const candidateAumid = normalizeText(candidate.appUserModelId ?? "");
  const templateAumid = normalizeText(template.appUserModelId ?? "");
  if (candidateAumid && templateAumid && candidateAumid === templateAumid) return true;
  if (normalizePath(candidate.executablePath) === normalizePath(template.executablePath)) return true;
  const candidateProcess = normalizeText(candidate.processName);
  const templateProcess = normalizeText(template.processName);
  return Boolean(candidateProcess && templateProcess && candidateProcess === templateProcess)
    || normalizeText(candidate.name) === normalizeText(template.name);
}

function matchesAliases(candidate: DiscoveredAppCandidate, aliases: string[]) {
  const haystack = normalizeText(`${candidate.name} ${candidate.processName} ${candidate.appUserModelId ?? ""}`);
  return aliases.some((alias) => haystack.includes(normalizeText(alias)));
}

function dedupeCandidates(candidates: DiscoveredAppCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.appUserModelId
      ? `aumid:${normalizeText(candidate.appUserModelId)}`
      : `path:${normalizePath(candidate.executablePath)}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function normalizePath(value: string) {
  return normalizeText(value).replace(/\//g, "\\").replace(/\\+$/, "");
}
