import type { InstallableAppCandidate } from "../shared/types.js";

const catalog: InstallableAppCandidate[] = [
  { id: "wechat", name: "微信", description: "微信 Windows 官方下载页", publisher: "Tencent", downloadPage: "https://weixin.qq.com/", aliases: ["wechat", "weixin", "微信"], category: "chat", source: "official", action: "open-download-page" },
  { id: "chrome", name: "Google Chrome", description: "Chrome 官方下载页", publisher: "Google", downloadPage: "https://www.google.com/chrome/", aliases: ["chrome", "google chrome", "谷歌浏览器"], category: "browser", source: "official", action: "open-download-page" },
  { id: "vscode", name: "Visual Studio Code", description: "VS Code 官方下载页", publisher: "Microsoft", downloadPage: "https://code.visualstudio.com/", aliases: ["vscode", "vs code", "visual studio code", "代码编辑器"], category: "developer", source: "official", action: "open-download-page" },
  { id: "steam", name: "Steam", description: "Steam 官方下载页", publisher: "Valve", downloadPage: "https://store.steampowered.com/about/", aliases: ["steam", "蒸汽平台"], category: "game", source: "official", action: "open-download-page" },
  { id: "qq", name: "QQ", description: "QQ Windows 官方下载页", publisher: "Tencent", downloadPage: "https://im.qq.com/pcqq/index.shtml", aliases: ["qq", "腾讯qq"], category: "chat", source: "official", action: "open-download-page" },
  { id: "notion", name: "Notion", description: "Notion 官方下载页", publisher: "Notion Labs", downloadPage: "https://www.notion.com/desktop", aliases: ["notion", "笔记"], category: "office", source: "official", action: "open-download-page" },
  { id: "wegame", name: "WeGame", description: "WeGame 官方下载页", publisher: "Tencent", downloadPage: "https://www.wegame.com.cn/", aliases: ["wegame", "腾讯游戏平台"], category: "game", source: "official", action: "open-download-page" },
  { id: "git", name: "Git for Windows", description: "Git 官方下载页", publisher: "Git", downloadPage: "https://git-scm.com/download/win", aliases: ["git", "git bash"], category: "developer", source: "official", action: "open-download-page" },
  { id: "powertoys", name: "Microsoft PowerToys", description: "PowerToys 官方下载页", publisher: "Microsoft", downloadPage: "https://learn.microsoft.com/windows/powertoys/install", aliases: ["powertoys", "power toys", "微软工具"], category: "tool", source: "official", action: "open-download-page" },
  { id: "obsidian", name: "Obsidian", description: "Obsidian 官方下载页", publisher: "Obsidian", downloadPage: "https://obsidian.md/download", aliases: ["obsidian", "黑曜石"], category: "office", source: "official", action: "open-download-page" }
];

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

function scoreCandidate(candidate: InstallableAppCandidate, query: string) {
  const normalizedQuery = normalize(query);
  const haystack = [candidate.name, candidate.publisher, candidate.description, ...candidate.aliases].map(normalize);
  let score = 0;
  if (haystack.some((item) => item === normalizedQuery)) score += 100;
  if (haystack.some((item) => item.startsWith(normalizedQuery))) score += 60;
  if (haystack.some((item) => item.includes(normalizedQuery))) score += 30;
  return score;
}

export function searchInstallableApps(query: string, limit = 12): InstallableAppCandidate[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];
  return catalog
    .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate, normalizedQuery) }))
    .filter((candidate) => (candidate.score ?? 0) > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.name.localeCompare(b.name, "zh-CN"))
    .slice(0, limit);
}

export function getInstallableAppById(id: string) {
  return catalog.find((candidate) => candidate.id === id);
}
