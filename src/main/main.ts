import { app, globalShortcut, shell } from "electron";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { cpus, release as osRelease } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AppEntry,
  AppFolder,
  GroupGridOrder,
  AppPreferences,
  BatchLaunchResult,
  FolderLaunchProgress,
  SearchDependencyStatus,
  SnapshotMode
} from "../shared/types.js";
import { resolveLoginExecutable } from "./preferences.js";
import { launchAppsSequentially } from "./batch-app-actions.js";
import { migrateLegacyUserData } from "./user-data-migration.js";
import { AppWindowManager } from "./window-manager.js";
import { NativeRuntimeHost, resolveNativeHelperPath, runNativeHelper } from "./native-helper.js";
import { AppService } from "./app-service.js";
import { GroupService } from "./group-service.js";
import { LaunchService } from "./launch-service.js";
import { RuntimeService } from "./runtime-service.js";
import { registerLibraryIpc } from "./ipc.js";
import { SearchService } from "./search-service.js";
import { IconService } from "./icon-service.js";
import { PreferencesService } from "./preferences-service.js";
import { registerRuntimeIpc } from "./runtime-ipc.js";
import { registerPreferencesIpc } from "./preferences-ipc.js";
import { registerWindowIpc } from "./window-ipc.js";
import { registerSearchIpc } from "./search-ipc.js";
import { SearchDependencyService } from "./search-dependency-service.js";
import { AdministratorService } from "./administrator-service.js";
import { ProcessControlService } from "./process-control-service.js";
import { metricsFromFocusHints } from "./focus-hints.js";
import { AppWindowService } from "./app-window-service.js";
import { AppAdditionService } from "./app-addition-service.js";
import { ElevatedTerminationHost, type ElevatedTerminationStatus } from "./elevated-termination-host.js";
import { registerAppInfoIpc } from "./app-info-ipc.js";
import { WindowsStoreAppService } from "./windows-store-apps.js";
import { prepareFirstRunImportTestUserData } from "./first-run-import-test.js";
import { StartupPerformanceTracker, StartupViewCacheStore } from "./startup-state-service.js";

const isDev = process.env.VITE_DEV_SERVER_URL !== undefined;
const appRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const rendererUrl = process.env.VITE_DEV_SERVER_URL;
const rendererIndex = join(appRoot, "dist", "index.html");
const preloadPath = join(appRoot, "dist-electron", "preload", "preload.cjs");
const appIconPath = () => app.isPackaged ? join(process.resourcesPath, "icon.ico") : join(appRoot, "build", "icon.ico");
const trayIconPath = () => app.isPackaged ? join(process.resourcesPath, "tray-icon.png") : join(appRoot, "build", "tray-icon.png");
const smokeMode = process.env.START_ENGINEER_SMOKE === "1" || process.env.STAR_ENGINEER_SMOKE === "1";
const repositoryUrl = "https://github.com/EsspPao/Start-Engineer";
const normalStartEngineerUserData = join(app.getPath("appData"), "start-engineer");
if (!smokeMode) migrateLegacyUserData(normalStartEngineerUserData, join(app.getPath("appData"), "commanddeck-next"));
const startEngineerUserData = smokeMode
  ? join(app.getPath("temp"), `start-engineer-smoke-${process.pid}`)
  : prepareFirstRunImportTestUserData(normalStartEngineerUserData, !app.isPackaged);
app.setPath("userData", startEngineerUserData);
const configPath = () => join(app.getPath("userData"), "apps.json");
const groupsPath = () => join(app.getPath("userData"), "groups.json");
const foldersPath = () => join(app.getPath("userData"), "folders.json");
const groupGridPath = () => join(app.getPath("userData"), "group-grid-order.json");
const preferencesPath = () => join(app.getPath("userData"), "preferences.json");
const startupViewCachePath = () => join(app.getPath("userData"), "startup-view-cache.json");
const startupPerformancePath = () => join(app.getPath("userData"), "startup-performance.json");
const iconCacheDir = () => join(app.getPath("userData"), "icons");
const firstRunImportTemplatePath = () => join(app.getPath("userData"), "first-run-import-template.json");
const nativeRuntime = new NativeRuntimeHost();
const startupViewCache = new StartupViewCacheStore(startupViewCachePath());
const startupPerformance = new StartupPerformanceTracker(startupPerformancePath());
const elevatedTerminationHost = new ElevatedTerminationHost({ runNativeHelper, resolveNativeHelperPath });
let administratorMessage = "";
let elevatedTerminationStatus: ElevatedTerminationStatus = elevatedTerminationHost.snapshot().status;
const runtimeAssociatedPids = new Map<string, Set<number>>();

let appService!: AppService;
let iconService!: IconService;
let preferencesService!: PreferencesService;
let searchDependencyService!: SearchDependencyService;
let administratorService!: AdministratorService;
let launchService!: LaunchService;
let runtimeService!: RuntimeService;
let searchService!: SearchService;
let appWindowService!: AppWindowService;
let appAdditionService!: AppAdditionService;
const processControlService = new ProcessControlService({
  ownProcessIds: () => new Set([process.pid, ...(appWindowService?.ownProcessIds() ?? []), ...elevatedTerminationHost.ownProcessIds()]),
  runNativeHelper,
  elevatedTerminationHost
});
const runPowerShell = (script: string) => processControlService.runPowerShell(script);
const windowsStoreAppService = new WindowsStoreAppService({ runPowerShell });
const groupService = new GroupService({
  groupsPath,
  foldersPath,
  gridPath: groupGridPath,
  getApps: () => appService.loadApps(),
  saveApps: (apps) => appService.saveApps(apps),
  randomId: randomUUID
});
iconService = new IconService({
  iconCacheDir,
  loadApps: () => appService.loadApps(),
  saveApps: (apps) => appService.saveApps(apps),
  runNativeHelper,
  runPowerShell
});
appService = new AppService({
  appsPath: configPath,
  iconCacheDir,
  getGroups: () => groupService.loadGroups(),
  validGroupId: (groupId) => groupService.validGroupId(groupId),
  randomId: randomUUID,
  cacheIcon: (entry) => iconService.cache(entry),
  runtimeAssociatedPids
});

const loadApps = () => appService.loadApps();
const saveApps = (apps: AppEntry[]) => appService.saveApps(apps);
const getApp = (id: string) => appService.getApp(id);
const loadAppsWithRuntimeAssociations = () => appService.loadWithRuntimeAssociations();
const loadAppGroups = () => groupService.loadGroups();
const listGroups = () => groupService.listGroups();
const loadFolders = () => groupService.loadFolders();
const saveFolders = (folders: AppFolder[]) => groupService.saveFolders(folders);
const loadGroupGridOrders = () => groupService.loadGridOrders();
const saveGroupGridOrders = (orders: GroupGridOrder[], apps?: AppEntry[], folders?: AppFolder[]) => groupService.saveGridOrders(orders, apps, folders);
const normalizeGridOrder = (groupId: string, itemIds: readonly string[], apps?: AppEntry[], folders?: AppFolder[]) => groupService.normalizeGridOrder(groupId, itemIds, apps, folders);
const validGridItems = (groupId: string, apps?: AppEntry[], folders?: AppFolder[]) => groupService.validGridItems(groupId, apps, folders);
const folderMutationResult = (apps: AppEntry[], folders: AppFolder[]) => groupService.mutateFolders(apps, folders);
const validAppGroup = (groupId?: string) => groupService.validGroupId(groupId);
const loadFirstRunImportTemplate = () => {
  try {
    const value = JSON.parse(readFileSync(firstRunImportTemplatePath(), "utf8")) as unknown;
    return Array.isArray(value) ? value as AppEntry[] : [];
  } catch {
    return [];
  }
};

const loginArgs = ["--autostart"];
preferencesService = new PreferencesService({
  path: preferencesPath,
  loginExecutable: () => resolveLoginExecutable(process.execPath, process.env.PORTABLE_EXECUTABLE_FILE),
  loginArgs,
  getLoginItemEnabled: (path, args) => app.getLoginItemSettings({ path, args }).openAtLogin,
  setLoginItemEnabled: (enabled, path, args) => app.setLoginItemSettings({ openAtLogin: enabled, path, args }),
  registerShortcut: (accelerator, callback) => globalShortcut.register(accelerator, callback),
  unregisterShortcut: (accelerator) => globalShortcut.unregister(accelerator),
  isShortcutRegistered: (accelerator) => globalShortcut.isRegistered(accelerator),
  toggleMainWindow: () => appWindowService.toggleMainWindow(),
  getAdministratorState: () => ({ isRunningAsAdministrator, administratorStatusLoading, elevatedTerminationStatus, ...(administratorMessage ? { administratorMessage } : {}) }),
  clearAdministratorMessage: () => { administratorMessage = ""; },
  applyTheme: (preferences) => appWindowService.applyTheme(preferences)
});
const loadPreferences = () => preferencesService.load();
const savePreferences = (preferences: AppPreferences) => preferencesService.save(preferences);
const preferencesSnapshot = () => preferencesService.snapshot();
searchDependencyService = new SearchDependencyService({
  getUserDataPath: () => app.getPath("userData"),
  loadPreferences,
  savePreferences
});
administratorService = new AdministratorService({
  execPath: process.execPath,
  portableExecutable: process.env.PORTABLE_EXECUTABLE_FILE,
  loadPreferences,
  releaseSingleInstanceLock: () => app.releaseSingleInstanceLock(),
  requestSingleInstanceLock: () => app.requestSingleInstanceLock(),
  beforeQuit: () => {
    appWindowService.prepareToQuit();
    globalShortcut.unregisterAll();
    preferencesService.clearRegisteredShortcut();
  },
  quit: () => app.quit()
});

const startupPreferences = loadPreferences();
let administratorStatusLoading = false;
let isRunningAsAdministrator = administratorService.detectPrivileges();

function notifyPreferencesState() {
  const window = appWindowService?.getMainWindow();
  if (window && !window.isDestroyed()) window.webContents.send("preferences:stateChanged", preferencesService.snapshot());
}

elevatedTerminationHost.subscribe((state) => {
  elevatedTerminationStatus = state.status;
  administratorMessage = state.message ?? "";
  notifyPreferencesState();
});

appWindowService = new AppWindowService({
  isDev,
  rendererUrl,
  rendererIndex,
  preloadPath,
  appIconPath,
  trayIconPath,
  smokeMode,
  loadPreferences,
  savePreferences,
  quit: () => app.quit()
});

appAdditionService = new AppAdditionService({
  getMainWindow: () => appWindowService.getMainWindow(),
  getGroups: loadAppGroups,
  loadApps,
  saveApps,
  getApp,
  validGroupId: validAppGroup,
  cacheIcon: (entry) => iconService.cache(entry),
  resolveShortcut: (filePath) => searchService.resolveShortcut(filePath)
});

const searchAppCandidates = (query: string) => searchService.searchCandidates(query);
const refreshDiscoveryIndex = () => searchService.refreshIndex();
const autoImportFirstRunApps = () => searchService.autoImportFirstRunApps();
const addDiscoveredCandidate = (candidateId: string, groupId: AppEntry["groupId"]) => searchService.addCandidate(candidateId, groupId);

const windowManager = new AppWindowManager({
  runPowerShell,
  getProcesses: () => runtimeService.getProcessSnapshots("full"),
  activateRunningApp: (entry, strategy) => launchService.activateRunningApp(getApp(entry.id) ?? entry, strategy)
});

searchService = new SearchService({
  getPath: (name) => app.getPath(name),
  runPowerShell,
  getPreferences: loadPreferences,
  savePreferences,
  getGroups: loadAppGroups,
  validGroupId: validAppGroup,
  loadApps,
  saveApps,
  cacheIcon: (entry) => iconService.cache(entry),
  randomId: randomUUID,
  listWindowsStoreApps: () => windowsStoreAppService.list(),
  loadFirstRunImportTemplate
});

runtimeService = new RuntimeService({
  nativeRuntime,
  runPowerShell,
  loadApps,
  saveApps,
  loadAppsWithRuntimeAssociations,
  runtimeAssociatedPids,
  resolveIcon: (executablePath, seed) => iconService.resolve(executablePath, seed),
  getTerminationBlockReason: (name, pids) => processControlService.getTerminationBlockReason(name, pids),
  runTaskkill: (args) => processControlService.runTaskkill(args),
  terminateElevatedPids: (pids) => processControlService.terminateElevatedPids(pids),
  processorCount: cpus().length
});

const buildRuntimeSnapshot = (mode: SnapshotMode = "full", force = false) => runtimeService.getSnapshot(mode, force);
const metricsSnapshot = () => runtimeService.metrics();
const getManagedRunningStatus = () => runtimeService.getManagedRunningStatus();
const getProcessSnapshots = (mode: SnapshotMode = "full") => runtimeService.getProcessSnapshots(mode);
const terminateManagedApps = (entries: AppEntry[]) => runtimeService.terminateManagedApps(entries);

launchService = new LaunchService({
  nativeRuntime,
  runPowerShell,
  loadApps,
  saveApps,
  getApp,
  getManagedRunningStatus,
  getProcessSnapshots: () => getProcessSnapshots("full"),
  buildRuntimeSnapshot: (force) => buildRuntimeSnapshot("managed", force),
  runtimeAssociatedPids,
  resolveWindowsStoreApp: (entry) => windowsStoreAppService.resolve(entry)
});

const launchConfiguredApp = (id: string, options?: { waitForAssociation?: boolean }) => launchService.launch(id, options);

function registerIpc() {
  registerAppInfoIpc({
    getAppInfo: () => ({
      version: app.getVersion(),
      electronVersion: process.versions.electron ?? "unknown",
      chromeVersion: process.versions.chrome ?? "unknown",
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      systemVersion: osRelease(),
      userDataPath: app.getPath("userData"),
      isPackaged: app.isPackaged,
      repositoryUrl,
      runtimeDiagnostics: runtimeService.diagnostics(),
      startupDiagnostics: startupPerformance.diagnostics()
    }),
    openUserDataDirectory: async () => {
      const error = await shell.openPath(app.getPath("userData"));
      if (error) throw new Error(error);
    },
    openProjectHomepage: async () => { await shell.openExternal(repositoryUrl); },
    getStartupViewCache: () => startupViewCache.load(),
    saveStartupViewCache: (cache) => startupViewCache.save(cache),
    markStartupPerformance: (name) => startupPerformance.mark(name)
  });
  registerLibraryIpc({
    apps: appService,
    groups: groupService,
    launchApp: (id) => launchConfiguredApp(id),
    launchFolder: async (event, id) => {
      const folder = loadFolders().find((item) => item.id === id);
      if (!folder) throw new Error("文件夹不存在");
      const results = await launchAppsSequentially(folder.appIds.map(getApp).filter((item): item is AppEntry => Boolean(item)), (entry) => launchConfiguredApp(entry.id), {
        onProgress: (progress) => event.sender.send("folders:launch-progress", { folderId: id, ...progress } satisfies FolderLaunchProgress)
      });
      return { apps: loadApps(), results } satisfies BatchLaunchResult;
    }
  });
  registerWindowIpc({
    getApp,
    manager: windowManager,
    metricsFromHints: metricsFromFocusHints,
    getMainWindow: () => appWindowService.getMainWindow()
  });
  registerRuntimeIpc({
    loadApps,
    loadFolders,
    loadGroups: loadAppGroups,
    terminateManagedApps,
    metricsSnapshot,
    buildRuntimeSnapshot,
    getManagedRunningStatus
  });
  registerPreferencesIpc(preferencesService, async () => {
    await elevatedTerminationHost.start();
  });
  registerSearchIpc({
    getMainWindow: () => appWindowService.getMainWindow(),
    getUserDataPath: () => app.getPath("userData"),
    autoImportFirstRunApps,
    searchAppCandidates,
    addDiscoveredCandidate,
    refreshDiscoveryIndex,
    refreshIcons: () => iconService.refresh(),
    addFromDialog: (groupId) => appAdditionService.addFromDialog(groupId),
    addDroppedExecutables: (paths, groupId) => appAdditionService.addDroppedExecutables(paths, groupId),
    pickExecutable: (id) => appAdditionService.pickExecutable(id),
    getSearchDependencyStatus: () => searchDependencyService.getStatus(),
    prepareSearchDependencies: () => searchDependencyService.prepare(),
    preferencesSnapshot,
    saveEverythingCliPath: (path) => {
      savePreferences({ ...loadPreferences(), everythingCliPath: path });
      searchDependencyService.invalidate();
      return preferencesSnapshot();
    }
  });

}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => appWindowService.showMainWindow());
  app.on("before-quit", () => { appWindowService.prepareToQuit(); elevatedTerminationHost.stop(); nativeRuntime.stop(); globalShortcut.unregisterAll(); preferencesService.clearRegisteredShortcut(); });
  app.whenReady().then(async () => {
    startupPerformance.mark("electron-ready");
    registerIpc();
    const preferences = loadPreferences();
    appWindowService.createSplashWindow();
    appWindowService.createWindow();
    startupPerformance.mark("main-window-created");
    await appWindowService.createTray();
    preferencesService.applyGlobalShortcut(preferences, false);
    appWindowService.watchSystemTheme();
    if (preferences.runAsAdministrator && !isRunningAsAdministrator && !smokeMode) void elevatedTerminationHost.start().catch(() => undefined);

    app.on("activate", () => appWindowService.showMainWindow());
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" && (appWindowService.isQuitting() || loadPreferences().closeBehavior === "quit")) app.quit();
  });
}
