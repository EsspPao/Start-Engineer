export type SystemSectionId = "processes" | "settings";
export type SectionId = SystemSectionId | string;

export type AppEntry = {
  id: string;
  name: string;
  category: string;
  groupId: string;
  executablePath: string;
  processName: string;
  accent: string;
  iconCachePath?: string;
  iconDataUrl?: string;
  iconCacheVersion?: number;
  iconPixelSize?: number;
  launchArgs?: string;
  workingDirectory?: string;
  launchedPid?: number;
  processAliases?: string[];
  associatedPids?: number[];
  launchSelected?: boolean;
};

export type AppGroup = {
  id: string;
  name: string;
  icon: string;
  isSystem: boolean;
  order: number;
};

export type GroupInput = { name: string; icon: string };
export type GroupUpdateInput = GroupInput & { id: string };
export type RemoveGroupResult = { groups: AppGroup[]; apps: AppEntry[]; targetGroupId: string };

export type AppMetrics = {
  appId: string;
  isRunning: boolean;
  cpuPercent: number;
  memoryBytes: number;
  diskBytesPerSecond: number;
  pids: number[];
  matchedPids: number[];
  associatedPids: number[];
  matchedProcessNames: string[];
  matchedPaths: string[];
  lastSeenPath?: string;
};

export type ProcessInfo = {
  pid: number;
  pids: number[];
  processCount: number;
  name: string;
  exePath?: string;
  exePaths: string[];
  iconDataUrl?: string;
  cpuPercent: number;
  memoryBytes: number;
  diskBytesPerSecond: number;
  isManagedApp: boolean;
  canTerminate: boolean;
  terminationBlockedReason?: string;
};

export type AppWithMetrics = AppEntry & {
  metrics: AppMetrics;
};

export type UpdateAppInput = Partial<Omit<AppEntry, "id">> & {
  id: string;
};

export type WindowAction = "minimize" | "maximize" | "close";
export type WindowBounds = { x: number; y: number; width: number; height: number };
export type CloseBehavior = "tray" | "quit";
export type FixedUiTheme = "fluent" | "midnight" | "utility" | "glass" | "wallpaper";
export type UiTheme = FixedUiTheme | "system";
export type SearchProvider = "everything" | "internal";
export type WallpaperGlassIntensity = "weak" | "medium" | "strong";
export type WallpaperGlassVariant = "dark" | "light";
export type AppPreferences = {
  launchAtStartup: boolean;
  closeBehavior: CloseBehavior;
  globalShortcutEnabled: boolean;
  globalShortcut: string;
  uiTheme: UiTheme;
  wallpaperGlassIntensity: WallpaperGlassIntensity;
  wallpaperGlassVariant: WallpaperGlassVariant;
  runAsAdministrator: boolean;
  searchProvider: SearchProvider;
  sortRunningAppsFirst: boolean;
  showAppNames: boolean;
  firstRunImportCompleted: boolean;
  windowBounds?: WindowBounds;
  everythingCliPath?: string;
  everythingManagedPath?: string;
};
export type UpdatePreferencesInput = Partial<AppPreferences>;
export type GlobalShortcutStatus = "registered" | "disabled" | "invalid" | "unavailable";
export type AppPreferencesState = AppPreferences & {
  globalShortcutStatus: GlobalShortcutStatus;
  globalShortcutMessage?: string;
  isRunningAsAdministrator: boolean;
  administratorStatusLoading?: boolean;
  administratorRestartRequired: boolean;
  administratorMessage?: string;
};
export type SnapshotMode = "full" | "managed";
export type RuntimeSnapshot = { apps: AppEntry[]; metrics: AppMetrics[]; processes: ProcessInfo[] };

export type EverythingSearchResult = {
  name: string;
  path: string;
  kind: "file" | "folder";
  sizeBytes?: number;
  modifiedAt?: string;
};

export type InternalSearchResult =
  | { kind: "app"; id: string; name: string; groupId: string; processName: string; isRunning: boolean }
  | { kind: "process"; name: string; pid: number; pids: number[]; processCount: number; isManagedApp: boolean };

export type SearchDependencyStatus = {
  state: "ready" | "missing" | "downloading" | "extracting" | "starting" | "failed";
  message?: string;
  everythingPath?: string;
  everythingCliPath?: string;
  downloadedBytes?: number;
  totalBytes?: number;
};

export type LaunchAppResult = {
  status: "launched" | "alreadyRunning" | "cancelled" | "failed";
  apps: AppEntry[];
  pid?: number;
  errorCode?: number;
  message?: string;
};

export type BatchLaunchItemStatus = LaunchAppResult["status"];
export type BatchLaunchItemResult = {
  appId: string;
  name: string;
  status: BatchLaunchItemStatus;
  message?: string;
};

export type BatchLaunchResult = {
  apps: AppEntry[];
  results: BatchLaunchItemResult[];
};

export type BatchKillItemResult = {
  appId: string;
  name: string;
  status: "terminated" | "restarted" | "failed";
  message?: string;
};

export type BatchKillResult = {
  apps: AppEntry[];
  results: BatchKillItemResult[];
};

export type FocusAppWindowResult = {
  focused: boolean;
  reason?:
    | "no-window"
    | "tray-hidden"
    | "foreground-blocked"
    | "stale"
    | "unknown"
    | "trayRestoreFailed"
    | "trayRestoreUnsupported"
    | "trayIconNotFound"
    | "suspectedWrongWindow"
    | "restoredButNotInteractive"
    | "fallbackRelaunchDisabled";
};

export type AppWindowInfo = {
  handle: number;
  pid: number;
  title: string;
  stage?: string;
  visible?: boolean;
  minimized?: boolean;
};

export type FocusWindowHints = {
  pids?: number[];
  matchedPids?: number[];
  associatedPids?: number[];
  matchedProcessNames?: string[];
  matchedPaths?: string[];
};

export type DiscoveredAppCandidate = {
  id: string;
  name: string;
  executablePath: string;
  processName: string;
  groupId: string;
  category: string;
  source: "start-menu" | "desktop" | "everything";
  shortcutPath?: string;
  workingDirectory?: string;
  launchArgs?: string;
  iconPath?: string;
  alreadyAdded?: boolean;
  existingAppId?: string;
  existingGroupId?: string;
  score?: number;
  rank?: number;
};

export type AddDiscoveredAppResult = {
  apps: AppEntry[];
  appId?: string;
  added: boolean;
  alreadyAdded?: boolean;
};

export type AddDroppedExecutablesResult = {
  apps: AppEntry[];
  addedAppIds: string[];
  skippedPaths: string[];
};

export type StartEngineerApi = {
  listGroups: () => Promise<AppGroup[]>;
  createGroup: (input: GroupInput) => Promise<AppGroup[]>;
  updateGroup: (input: GroupUpdateInput) => Promise<AppGroup[]>;
  reorderGroups: (groupIds: string[]) => Promise<AppGroup[]>;
  removeGroup: (groupId: string, targetGroupId: string) => Promise<RemoveGroupResult>;
  listApps: () => Promise<AppEntry[]>;
  discoverImportCandidates: () => Promise<DiscoveredAppCandidate[]>;
  importDiscoveredApps: (candidateIds: string[]) => Promise<AppEntry[]>;
  searchAppCandidates: (query: string) => Promise<DiscoveredAppCandidate[]>;
  addDiscoveredCandidate: (candidateId: string, groupId: AppEntry["groupId"]) => Promise<AddDiscoveredAppResult>;
  refreshDiscoveryIndex: () => Promise<DiscoveredAppCandidate[]>;
  refreshAppIcons: () => Promise<AppEntry[]>;
  addAppFromDialog: (groupId?: AppEntry["groupId"]) => Promise<AppEntry[]>;
  addDroppedExecutables: (filePaths: string[], groupId?: AppEntry["groupId"]) => Promise<AddDroppedExecutablesResult>;
  getPathForFile: (file: File) => string;
  pickExecutable: (id: string) => Promise<AppEntry[]>;
  updateApp: (input: UpdateAppInput) => Promise<AppEntry[]>;
  setAppGroup: (id: string, groupId: AppEntry["groupId"]) => Promise<AppEntry[]>;
  reorderAppsInGroup: (groupId: AppEntry["groupId"], appIds: string[]) => Promise<AppEntry[]>;
  setAppLaunchSelected: (id: string, selected: boolean) => Promise<AppEntry[]>;
  setGroupLaunchSelected: (groupId: string, selected: boolean) => Promise<AppEntry[]>;
  launchApp: (id: string) => Promise<LaunchAppResult>;
  focusAppWindow: (id: string, hints?: FocusWindowHints) => Promise<FocusAppWindowResult>;
  focusAppWindowHandle: (id: string, handle: number, hints?: FocusWindowHints) => Promise<FocusAppWindowResult>;
  listAppWindows: (id: string, hints?: FocusWindowHints) => Promise<AppWindowInfo[]>;
  getAppWindowDiagnostics: (id: string, hints?: FocusWindowHints) => Promise<string>;
  launchSelectedApps: (groupId: string) => Promise<BatchLaunchResult>;
  killApp: (id: string) => Promise<AppEntry[]>;
  killGroupApps: (groupId: string) => Promise<BatchKillResult>;
  removeApp: (id: string) => Promise<AppEntry[]>;
  killProcessGroup: (input: { name: string; pids: number[] }) => Promise<void>;
  showItemInFolder: (path: string) => Promise<void>;
  writeClipboardText: (text: string) => Promise<void>;
  searchEverything: (query: string) => Promise<EverythingSearchResult[]>;
  pickEverythingCli: () => Promise<AppPreferencesState>;
  getSearchDependencyStatus: () => Promise<SearchDependencyStatus>;
  prepareSearchDependencies: () => Promise<SearchDependencyStatus>;
  openSearchDependencyFolder: () => Promise<void>;
  openSearchResult: (path: string) => Promise<void>;
  showSearchResultInFolder: (path: string) => Promise<void>;
  getMetricsSnapshot: () => Promise<AppMetrics[]>;
  getProcessSnapshot: () => Promise<ProcessInfo[]>;
  getRuntimeSnapshot: (mode?: SnapshotMode, force?: boolean) => Promise<RuntimeSnapshot>;
  getPreferences: () => Promise<AppPreferencesState>;
  updatePreferences: (input: UpdatePreferencesInput) => Promise<AppPreferencesState>;
  restartWithConfiguredPrivileges: () => Promise<void>;
  windowAction: (action: WindowAction) => Promise<void>;
};

export type CommandDeckApi = StartEngineerApi;
