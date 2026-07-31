import { clipboard, dialog, ipcMain, shell, type BrowserWindow, type OpenDialogOptions } from "electron";
import { existsSync, mkdirSync } from "node:fs";
import { basename } from "node:path";
import type { AppEntry, AppPreferencesState, SearchDependencyStatus } from "../shared/types.js";
import { searchEverything } from "./everything-search.js";
import { getInstallableAppById, searchInstallableApps } from "./installable-apps.js";
import { getManagedEverythingPaths } from "./search-dependencies.js";

type SearchIpcOptions = {
  getMainWindow: () => BrowserWindow | null;
  getUserDataPath: () => string;
  autoImportFirstRunApps: () => unknown;
  searchAppCandidates: (query: string) => unknown;
  addDiscoveredCandidate: (id: string, groupId: AppEntry["groupId"]) => unknown;
  refreshDiscoveryIndex: () => unknown;
  refreshIcons: () => unknown;
  addFromDialog: (groupId?: AppEntry["groupId"]) => Promise<unknown>;
  addDroppedExecutables: (paths: string[], groupId?: AppEntry["groupId"]) => unknown;
  pickExecutable: (id: string) => Promise<string | undefined>;
  getSearchDependencyStatus: () => SearchDependencyStatus;
  prepareSearchDependencies: () => Promise<SearchDependencyStatus>;
  preferencesSnapshot: () => AppPreferencesState;
  saveEverythingCliPath: (path: string) => AppPreferencesState;
};

export function registerSearchIpc(options: SearchIpcOptions) {
  ipcMain.handle("apps:autoImportFirstRun", () => options.autoImportFirstRunApps());
  ipcMain.handle("apps:searchCandidates", (_event, query: string) => options.searchAppCandidates(String(query ?? "")));
  ipcMain.handle("apps:searchInstallable", (_event, query: string) => searchInstallableApps(String(query ?? "")));
  ipcMain.handle("apps:openInstallableDownload", async (_event, candidateId: string) => {
    const candidate = getInstallableAppById(String(candidateId ?? ""));
    if (!candidate) throw new Error("未找到可安装应用");
    await shell.openExternal(candidate.downloadPage);
  });
  ipcMain.handle("apps:addDiscoveredCandidate", (_event, id: string, groupId: AppEntry["groupId"]) => options.addDiscoveredCandidate(String(id ?? ""), groupId));
  ipcMain.handle("apps:refreshDiscoveryIndex", () => options.refreshDiscoveryIndex());
  ipcMain.handle("apps:refreshIcons", () => options.refreshIcons());
  ipcMain.handle("apps:addFromDialog", (_event, groupId?: AppEntry["groupId"]) => options.addFromDialog(groupId));
  ipcMain.handle("apps:addDroppedExecutables", (_event, paths: string[], groupId?: AppEntry["groupId"]) => options.addDroppedExecutables(Array.isArray(paths) ? paths.map((item) => String(item ?? "")) : [], groupId));
  ipcMain.handle("apps:pickExecutable", (_event, id: string) => options.pickExecutable(id));

  ipcMain.handle("shell:showItemInFolder", (_event, filePath: string) => {
    requireExistingPath(filePath, "文件路径不存在或当前无权访问");
    shell.showItemInFolder(filePath);
  });
  ipcMain.handle("clipboard:writeText", (_event, text: string) => clipboard.writeText(String(text ?? "")));
  ipcMain.handle("search:everything", (_event, query: string) => {
    const dependency = options.getSearchDependencyStatus();
    if (dependency.state !== "ready" || !dependency.everythingCliPath) throw new Error(dependency.message || "请先一键准备 Everything 搜索依赖");
    return searchEverything(String(query ?? ""), { cliPath: dependency.everythingCliPath });
  });
  ipcMain.handle("search:pickEverythingCli", async () => {
    const result = await showOpenDialog(options.getMainWindow(), {
      title: "选择 Everything 的 ES.exe",
      filters: [{ name: "Everything 命令行工具", extensions: ["exe"] }],
      properties: ["openFile"]
    });
    if (result.canceled || !result.filePaths[0]) return options.preferencesSnapshot();
    if (basename(result.filePaths[0]).toLowerCase() !== "es.exe") throw new Error("请选择 Everything 的 ES.exe 命令行工具。");
    return options.saveEverythingCliPath(result.filePaths[0]);
  });
  ipcMain.handle("search:dependencyStatus", () => options.getSearchDependencyStatus());
  ipcMain.handle("search:prepareDependencies", () => options.prepareSearchDependencies());
  ipcMain.handle("search:openDependencyFolder", () => {
    const paths = getManagedEverythingPaths(options.getUserDataPath());
    mkdirSync(paths.root, { recursive: true });
    return shell.openPath(paths.root);
  });
  ipcMain.handle("search:openResult", async (_event, filePath: string) => {
    requireExistingPath(filePath, "搜索结果不存在或当前无权访问");
    const error = await shell.openPath(filePath);
    if (error) throw new Error(error);
  });
  ipcMain.handle("search:showInFolder", (_event, filePath: string) => {
    requireExistingPath(filePath, "搜索结果不存在或当前无权访问");
    shell.showItemInFolder(filePath);
  });
}

function requireExistingPath(path: string, message: string) {
  if (!path || !existsSync(path)) throw new Error(message);
}

function showOpenDialog(window: BrowserWindow | null, options: OpenDialogOptions) {
  return window && !window.isDestroyed() ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options);
}
