import type { InstallableAppCandidate } from "../shared/types.js";

const catalog: InstallableAppCandidate[] = [
  { id: "uu-accelerator", name: "UU加速器", description: "UU加速器 官方下载页", publisher: "网易", downloadPage: "https://uu.163.com/download/", aliases: ["网易UU加速器", "uu加速器", "uu", "uu_launcher"], category: "game", source: "official", action: "open-download-page" },
  { id: "uu-remote", name: "UU远程", description: "UU远程 官方下载页", publisher: "网易", downloadPage: "https://uuyc.163.com/download/", aliases: ["网易UU远程", "uu远程", "uuyc", "gameviewer"], category: "tool", source: "official", action: "open-download-page" },
  { id: "netease-music", name: "网易云音乐", description: "网易云音乐 官方下载页", publisher: "网易", downloadPage: "https://music.163.com/#/download", aliases: ["网易云音乐", "cloudmusic"], category: "tool", source: "official", action: "open-download-page" },
  { id: "qq-music", name: "QQ音乐", description: "QQ音乐 官方下载页", publisher: "Tencent", downloadPage: "https://y.qq.com/download/download.html", aliases: ["qq音乐", "qqmusic"], category: "tool", source: "official", action: "open-download-page" },
  { id: "wps", name: "WPS Office", description: "WPS Office 官方下载页", publisher: "金山办公", downloadPage: "https://www.wps.cn/", aliases: ["wps", "wps office", "金山办公"], category: "office", source: "official", action: "open-download-page" },
  { id: "baidu-netdisk", name: "百度网盘", description: "百度网盘 官方下载页", publisher: "百度", downloadPage: "https://pan.baidu.com/download", aliases: ["百度网盘", "baidunetdisk"], category: "tool", source: "official", action: "open-download-page" },
  { id: "gog-galaxy", name: "GOG GALAXY", description: "GOG GALAXY 官方下载页", publisher: "GOG", downloadPage: "https://www.gog.com/galaxy", aliases: ["gog", "gog galaxy", "galaxyclient"], category: "game", source: "official", action: "open-download-page" },
  { id: "libreoffice", name: "LibreOffice", description: "LibreOffice 官方下载页", publisher: "The Document Foundation", downloadPage: "https://www.libreoffice.org/download/", aliases: ["libreoffice", "soffice"], category: "office", source: "official", action: "open-download-page" },
  { id: "gimp", name: "GIMP", description: "GIMP 官方下载页", publisher: "GIMP", downloadPage: "https://www.gimp.org/downloads/", aliases: ["gimp", "gimp-3", "gimp-2.10"], category: "tool", source: "official", action: "open-download-page" },
  { id: "krita", name: "Krita", description: "Krita 官方下载页", publisher: "Krita Foundation", downloadPage: "https://krita.org/en/download/", aliases: ["krita"], category: "tool", source: "official", action: "open-download-page" },
  { id: "audacity", name: "Audacity", description: "Audacity 官方下载页", publisher: "Audacity", downloadPage: "https://www.audacityteam.org/download/windows/", aliases: ["audacity"], category: "tool", source: "official", action: "open-download-page" },
  { id: "qbittorrent", name: "qBittorrent", description: "qBittorrent 官方下载页", publisher: "qBittorrent", downloadPage: "https://www.qbittorrent.org/download", aliases: ["qbittorrent", "qb"], category: "tool", source: "official", action: "open-download-page" },
  { id: "docker-desktop", name: "Docker Desktop", description: "Docker Desktop 官方下载页", publisher: "Docker", downloadPage: "https://www.docker.com/products/docker-desktop/", aliases: ["docker desktop", "docker"], category: "developer", source: "official", action: "open-download-page" },
  { id: "pycharm", name: "PyCharm", description: "PyCharm 官方下载页", publisher: "JetBrains", downloadPage: "https://www.jetbrains.com/pycharm/download/", aliases: ["pycharm", "pycharm64"], category: "developer", source: "official", action: "open-download-page" },
  { id: "sublime-text", name: "Sublime Text", description: "Sublime Text 官方下载页", publisher: "Sublime HQ", downloadPage: "https://www.sublimetext.com/download", aliases: ["sublime text", "sublime_text"], category: "developer", source: "official", action: "open-download-page" },
  { id: "winscp", name: "WinSCP", description: "WinSCP 官方下载页", publisher: "WinSCP", downloadPage: "https://winscp.net/eng/download.php", aliases: ["winscp"], category: "developer", source: "official", action: "open-download-page" },
  { id: "zotero", name: "Zotero", description: "Zotero 官方下载页", publisher: "Corporation for Digital Scholarship", downloadPage: "https://www.zotero.org/download/", aliases: ["zotero"], category: "office", source: "official", action: "open-download-page" },
  { id: "sumatra-pdf", name: "SumatraPDF", description: "SumatraPDF 官方下载页", publisher: "SumatraPDF", downloadPage: "https://www.sumatrapdfreader.org/download-free-pdf-viewer", aliases: ["sumatrapdf", "sumatra pdf"], category: "office", source: "official", action: "open-download-page" },
  { id: "handbrake", name: "HandBrake", description: "HandBrake 官方下载页", publisher: "HandBrake", downloadPage: "https://handbrake.fr/downloads.php", aliases: ["handbrake"], category: "tool", source: "official", action: "open-download-page" },
  { id: "snipaste", name: "Snipaste", description: "Snipaste 官方下载页", publisher: "Snipaste", downloadPage: "https://www.snipaste.com/download.html", aliases: ["snipaste", "截图贴图"], category: "tool", source: "official", action: "open-download-page" },
  { id: "7zip", name: "7-Zip", description: "7-Zip 官方下载页", publisher: "Igor Pavlov", downloadPage: "https://www.7-zip.org/download.html", aliases: ["7zip", "7-zip", "7z", "7zFM"], category: "tool", source: "official", action: "open-download-page" },
  { id: "everything", name: "Everything", description: "Everything 官方下载页", publisher: "voidtools", downloadPage: "https://www.voidtools.com/downloads/", aliases: ["everything"], category: "tool", source: "official", action: "open-download-page" },
  { id: "obs", name: "OBS Studio", description: "OBS Studio 官方下载页", publisher: "OBS Project", downloadPage: "https://obsproject.com/download", aliases: ["obs", "obs64", "obs studio"], category: "tool", source: "official", action: "open-download-page" },
  { id: "vlc", name: "VLC media player", description: "VLC media player 官方下载页", publisher: "VideoLAN", downloadPage: "https://images.videolan.org/vlc/download-windows.html", aliases: ["vlc", "vlc播放器"], category: "tool", source: "official", action: "open-download-page" },
  { id: "firefox", name: "Mozilla Firefox", description: "Mozilla Firefox 官方下载页", publisher: "Mozilla", downloadPage: "https://www.mozilla.org/firefox/new/", aliases: ["firefox", "火狐", "火狐浏览器"], category: "browser", source: "official", action: "open-download-page" },
  { id: "edge", name: "Microsoft Edge", description: "Microsoft Edge 官方下载页", publisher: "Microsoft", downloadPage: "https://www.microsoft.com/en-us/edge/download", aliases: ["edge", "msedge", "微软浏览器"], category: "browser", source: "official", action: "open-download-page" },
  { id: "brave", name: "Brave", description: "Brave 官方下载页", publisher: "Brave Software", downloadPage: "https://brave.com/download/", aliases: ["brave", "brave浏览器"], category: "browser", source: "official", action: "open-download-page" },
  { id: "figma", name: "Figma", description: "Figma 官方下载页", publisher: "Figma", downloadPage: "https://www.figma.com/downloads/", aliases: ["figma"], category: "office", source: "official", action: "open-download-page" },
  { id: "discord", name: "Discord", description: "Discord 官方下载页", publisher: "Discord", downloadPage: "https://discord.com/download", aliases: ["discord"], category: "chat", source: "official", action: "open-download-page" },
  { id: "telegram", name: "Telegram", description: "Telegram 官方下载页", publisher: "Telegram", downloadPage: "https://desktop.telegram.org/", aliases: ["telegram", "电报"], category: "chat", source: "official", action: "open-download-page" },
  { id: "blender", name: "Blender", description: "Blender 官方下载页", publisher: "Blender Foundation", downloadPage: "https://www.blender.org/download/", aliases: ["blender"], category: "tool", source: "official", action: "open-download-page" },
  { id: "feishu", name: "飞书", description: "飞书 官方下载页", publisher: "飞书", downloadPage: "https://www.feishu.cn/download", aliases: ["feishu", "飞书"], category: "office", source: "official", action: "open-download-page" },
  { id: "dingtalk", name: "钉钉", description: "钉钉 官方下载页", publisher: "钉钉", downloadPage: "https://www.dingtalk.com/download", aliases: ["dingtalk", "dingtalklauncher", "钉钉"], category: "office", source: "official", action: "open-download-page" },
  { id: "tencent-meeting", name: "腾讯会议", description: "腾讯会议 官方下载页", publisher: "Tencent", downloadPage: "https://meeting.tencent.com/download/", aliases: ["腾讯会议", "tencent meeting", "wemeet", "wemeetapp"], category: "office", source: "official", action: "open-download-page" },
  { id: "idea", name: "IntelliJ IDEA", description: "IntelliJ IDEA 官方下载页", publisher: "JetBrains", downloadPage: "https://www.jetbrains.com/idea/download/", aliases: ["intellij", "idea", "idea64", "intellij idea"], category: "developer", source: "official", action: "open-download-page" },
  { id: "python", name: "Python", description: "Python 官方下载页", publisher: "Python Software Foundation", downloadPage: "https://www.python.org/downloads/windows/", aliases: ["python"], category: "developer", source: "official", action: "open-download-page" },
  { id: "nodejs", name: "Node.js", description: "Node.js 官方下载页", publisher: "OpenJS Foundation", downloadPage: "https://nodejs.org/en/download", aliases: ["nodejs", "node.js", "node"], category: "developer", source: "official", action: "open-download-page" },
  { id: "github-desktop", name: "GitHub Desktop", description: "GitHub Desktop 官方下载页", publisher: "GitHub", downloadPage: "https://desktop.github.com/download/", aliases: ["github desktop", "githubdesktop"], category: "developer", source: "official", action: "open-download-page" },
  { id: "postman", name: "Postman", description: "Postman 官方下载页", publisher: "Postman", downloadPage: "https://www.postman.com/downloads/", aliases: ["postman"], category: "developer", source: "official", action: "open-download-page" },
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
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function scoreCandidate(candidate: InstallableAppCandidate, query: string) {
  const normalizedQuery = normalize(query);
  const haystack = [candidate.name, ...candidate.aliases,
    ...(Array.from(normalizedQuery).length >= 3 ? [candidate.publisher, candidate.description] : [])].map(normalize);
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

export function filterInstalledApps(candidates: InstallableAppCandidate[], installed: { name: string; processName: string }[]) {
  const identity = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[\s._-]+/g, "");
  const names = new Set(installed.flatMap((app) => [identity(app.name), identity(app.processName)]).filter(Boolean));
  return candidates.filter((candidate) => ![candidate.id, candidate.name, ...candidate.aliases].some((name) => names.has(identity(name))));
}
