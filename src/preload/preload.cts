import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { AppEntry, AppFolderInput, AppFolderUpdateInput, FocusWindowHints, FolderLaunchProgress, GroupGridItemId, GroupInput, GroupUpdateInput, MoveFolderMemberInput, SnapshotMode, StartEngineerApi, UpdateAppInput, UpdatePreferencesInput, WindowAction } from "../shared/types.js";

const api: StartEngineerApi = {
  getAppInfo: () => ipcRenderer.invoke("app:getInfo"),
  getStartupViewCache: () => ipcRenderer.invoke("startup:getViewCache"),
  saveStartupViewCache: (cache) => ipcRenderer.invoke("startup:saveViewCache", cache),
  markStartupPerformance: (name) => ipcRenderer.invoke("startup:markPerformance", name),
  openUserDataDirectory: () => ipcRenderer.invoke("app:openUserDataDirectory"),
  openProjectHomepage: () => ipcRenderer.invoke("app:openProjectHomepage"),
  listGroups: () => ipcRenderer.invoke("groups:list"),
  createGroup: (input: GroupInput) => ipcRenderer.invoke("groups:create", input),
  updateGroup: (input: GroupUpdateInput) => ipcRenderer.invoke("groups:update", input),
  reorderGroups: (groupIds: string[]) => ipcRenderer.invoke("groups:reorder", groupIds),
  removeGroup: (groupId: string, targetGroupId: string) => ipcRenderer.invoke("groups:remove", groupId, targetGroupId),
  listFolders: () => ipcRenderer.invoke("folders:list"),
  createFolder: (input: AppFolderInput) => ipcRenderer.invoke("folders:create", input),
  updateFolder: (input: AppFolderUpdateInput) => ipcRenderer.invoke("folders:update", input),
  removeFolder: (id: string) => ipcRenderer.invoke("folders:remove", id),
  launchFolder: (id: string) => ipcRenderer.invoke("folders:launch", id),
  onFolderLaunchProgress: (listener: (progress: FolderLaunchProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: FolderLaunchProgress) => listener(progress);
    ipcRenderer.on("folders:launch-progress", handler);
    return () => ipcRenderer.removeListener("folders:launch-progress", handler);
  },
  listGroupGridOrders: () => ipcRenderer.invoke("groupGrid:list"),
  reorderGroupItems: (groupId: string, itemIds: GroupGridItemId[]) => ipcRenderer.invoke("groupGrid:reorder", groupId, itemIds),
  moveFolder: (folderId: string, targetGroupId: string) => ipcRenderer.invoke("folders:move", folderId, targetGroupId),
  mergeFolders: (sourceFolderId: string, targetFolderId: string) => ipcRenderer.invoke("folders:merge", sourceFolderId, targetFolderId),
  moveFolderMember: (input: MoveFolderMemberInput) => ipcRenderer.invoke("folders:moveMember", input),
  listApps: () => ipcRenderer.invoke("apps:list"),
  autoImportFirstRunApps: () => ipcRenderer.invoke("apps:autoImportFirstRun"),
  searchAppCandidates: (query: string) => ipcRenderer.invoke("apps:searchCandidates", query),
  searchInstallableApps: (query: string) => ipcRenderer.invoke("apps:searchInstallable", query),
  openInstallableAppDownload: (candidateId: string) => ipcRenderer.invoke("apps:openInstallableDownload", candidateId),
  addDiscoveredCandidate: (candidateId: string, groupId: AppEntry["groupId"]) => ipcRenderer.invoke("apps:addDiscoveredCandidate", candidateId, groupId),
  refreshDiscoveryIndex: () => ipcRenderer.invoke("apps:refreshDiscoveryIndex"),
  refreshAppIcons: () => ipcRenderer.invoke("apps:refreshIcons"),
  addAppFromDialog: (groupId?: AppEntry["groupId"]) => ipcRenderer.invoke("apps:addFromDialog", groupId),
  addDroppedExecutables: (filePaths: string[], groupId?: AppEntry["groupId"]) => ipcRenderer.invoke("apps:addDroppedExecutables", filePaths, groupId),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  pickExecutable: (id: string) => ipcRenderer.invoke("apps:pickExecutable", id),
  updateApp: (input: UpdateAppInput) => ipcRenderer.invoke("apps:update", input),
  setAppGroup: (id: string, groupId: AppEntry["groupId"]) => ipcRenderer.invoke("apps:setGroup", id, groupId),
  reorderAppsInGroup: (groupId: AppEntry["groupId"], appIds: string[]) => ipcRenderer.invoke("apps:reorderInGroup", groupId, appIds),
  launchApp: (id: string) => ipcRenderer.invoke("apps:launch", id),
  focusAppWindow: (id: string, hints?: FocusWindowHints) => ipcRenderer.invoke("apps:focusWindow", id, hints),
  focusAppWindowHandle: (id: string, handle: number, hints?: FocusWindowHints) => ipcRenderer.invoke("apps:focusWindowHandle", id, handle, hints),
  listAppWindows: (id: string, hints?: FocusWindowHints) => ipcRenderer.invoke("apps:listWindows", id, hints),
  getAppWindowDiagnostics: (id: string, hints?: FocusWindowHints) => ipcRenderer.invoke("apps:windowDiagnostics", id, hints),
  killApp: (id: string) => ipcRenderer.invoke("apps:kill", id),
  killFolderApps: (folderId: string) => ipcRenderer.invoke("folders:killApps", folderId),
  killGroupApps: (groupId: string) => ipcRenderer.invoke("groups:killApps", groupId),
  killAllApps: () => ipcRenderer.invoke("apps:killAll"),
  removeApp: (id: string) => ipcRenderer.invoke("apps:remove", id),
  killProcessGroup: (input: { name: string; pids: number[] }) => ipcRenderer.invoke("processes:killGroup", input),
  showItemInFolder: (path: string) => ipcRenderer.invoke("shell:showItemInFolder", path),
  writeClipboardText: (text: string) => ipcRenderer.invoke("clipboard:writeText", text),
  searchEverything: (query: string) => ipcRenderer.invoke("search:everything", query),
  pickEverythingCli: () => ipcRenderer.invoke("search:pickEverythingCli"),
  getSearchDependencyStatus: () => ipcRenderer.invoke("search:dependencyStatus"),
  prepareSearchDependencies: () => ipcRenderer.invoke("search:prepareDependencies"),
  openSearchDependencyFolder: () => ipcRenderer.invoke("search:openDependencyFolder"),
  openSearchResult: (path: string) => ipcRenderer.invoke("search:openResult", path),
  showSearchResultInFolder: (path: string) => ipcRenderer.invoke("search:showInFolder", path),
  getMetricsSnapshot: () => ipcRenderer.invoke("metrics:snapshot"),
  getProcessSnapshot: () => ipcRenderer.invoke("processes:snapshot"),
  getRuntimeSnapshot: (mode?: SnapshotMode, force?: boolean) => ipcRenderer.invoke("runtime:snapshot", mode, force),
  getManagedRunningStatus: () => ipcRenderer.invoke("runtime:managedRunningStatus"),
  getPreferences: () => ipcRenderer.invoke("preferences:get"),
  updatePreferences: (input: UpdatePreferencesInput) => ipcRenderer.invoke("preferences:update", input),
  exportUiLayoutShareCode: () => ipcRenderer.invoke("preferences:exportUiLayoutShareCode"),
  importUiLayoutShareCode: (code: string) => ipcRenderer.invoke("preferences:importUiLayoutShareCode", code),
  restartWithConfiguredPrivileges: () => ipcRenderer.invoke("preferences:restartWithConfiguredPrivileges"),
  onPreferencesStateChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, preferences: Parameters<typeof listener>[0]) => listener(preferences);
    ipcRenderer.on("preferences:stateChanged", handler);
    return () => ipcRenderer.removeListener("preferences:stateChanged", handler);
  },
  windowAction: (action: WindowAction) => ipcRenderer.invoke("window:action", action)
};

contextBridge.exposeInMainWorld("startEngineer", api);
contextBridge.exposeInMainWorld("commandDeck", api);

ipcRenderer.on("keyboard:groupNavigation", (_event, direction: "previous" | "next") => {
  window.dispatchEvent(new CustomEvent("start-engineer:group-navigation", { detail: direction }));
});
