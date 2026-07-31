export type SystemSectionId = "processes" | "all-apps" | "settings";
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
  appUserModelId?: string;
  launchedPid?: number;
  processAliases?: string[];
  associatedPids?: number[];
};

export type AppGroup = {
  id: string;
  name: string;
  icon: string;
  isSystem: boolean;
  order: number;
};
export type AppFolder = { id: string; groupId: string; name: string; appIds: string[]; order: number };
export type AppFolderInput = { groupId: string; name?: string; appIds: string[] };
export type AppFolderUpdateInput = Partial<Pick<AppFolder, "name" | "appIds" | "order" | "groupId">> & { id: string };
export type GroupGridItemId = `app:${string}` | `folder:${string}`;
export type GroupGridOrder = { groupId: string; itemIds: GroupGridItemId[] };
export type MoveFolderMemberInput = {
  appId: string;
  sourceFolderId: string;
  target: { kind: "outer"; groupId: string; index?: number } | { kind: "folder"; folderId: string } | { kind: "group"; groupId: string };
};
export type FolderMutationResult = { apps: AppEntry[]; folders: AppFolder[]; gridOrders: GroupGridOrder[] };

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
export type FixedUiTheme = "apple" | "fluent" | "midnight" | "utility" | "glass" | "wallpaper" | "clear";
export type UiTheme = FixedUiTheme | "system";
export type SearchProvider = "everything" | "internal";
export type WallpaperGlassIntensity = number;
export type WallpaperGlassVariant = "dark" | "light";
export type UiCardSize = "small" | "medium" | "large";
export type UiGridDensity = "compact" | "standard" | "relaxed";
export type UiSidebarWidth = "narrow" | "standard" | "wide";
export type UiBrandIconSize = "standard" | "large";
export type UiBackgroundTone = "default" | "aurora" | "graphite" | "mist";
export type UiLayoutPreferences = {
  uiScale: number;
  backgroundColor: string;
  cardSize: UiCardSize;
  gridDensity: UiGridDensity;
  sidebarWidth: UiSidebarWidth;
  brandIconSize: UiBrandIconSize;
  backgroundTone: UiBackgroundTone;
  showRunningStatus: boolean;
  showAppNames: boolean;
  showBatchActions: boolean;
  showSearchBar: boolean;
};
export type AppKeyboardShortcutId = "up" | "down" | "left" | "right" | "activate" | "launchFolder" | "cancel" | "edit" | "menu" | "search" | "previousGroup" | "nextGroup" | `group${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;
export type KeyboardShortcutPreferences = Record<AppKeyboardShortcutId, string[]>;
export type AllAppsViewPreferences = {
  orderedAppIds: string[];
};
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
  keyboardShortcuts: KeyboardShortcutPreferences;
  uiLayout: UiLayoutPreferences;
  allAppsView: AllAppsViewPreferences;
  firstRunImportCompleted: boolean;
  windowBounds?: WindowBounds;
  everythingCliPath?: string;
  everythingManagedPath?: string;
};
export type UpdatePreferencesInput = Partial<AppPreferences>;
export type GlobalShortcutStatus = "registered" | "disabled" | "invalid" | "unavailable";
export type ElevatedTerminationStatus = "disabled" | "starting" | "ready" | "cancelled" | "failed";
export type AppPreferencesState = AppPreferences & {
  globalShortcutStatus: GlobalShortcutStatus;
  globalShortcutMessage?: string;
  isRunningAsAdministrator: boolean;
  administratorStatusLoading?: boolean;
  administratorRestartRequired: boolean;
  elevatedTerminationStatus: ElevatedTerminationStatus;
  administratorMessage?: string;
};
export type SnapshotMode = "full" | "managed";
export type RuntimeSnapshot = { apps: AppEntry[]; metrics: AppMetrics[]; processes: ProcessInfo[] };

export type AppRunningStatus = {
  appId: string;
  isRunning: boolean;
  pids: number[];
};

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

export type FolderLaunchProgress = {
  folderId: string;
  appId: string;
  name: string;
  status: "launching" | BatchLaunchItemStatus;
  message?: string;
};

export type FolderLaunchVisualStatus = "queued" | "waiting" | FolderLaunchProgress["status"];

export type BatchKillItemResult = {
  appId: string;
  name: string;
  status: "terminated" | "restarted" | "failed";
  message?: string;
};

export type BatchKillResult = {
  apps: AppEntry[];
  results: BatchKillItemResult[];
  runningStatuses?: AppRunningStatus[];
};

export type KillAppResult = {
  apps: AppEntry[];
  metrics?: AppMetrics[];
  runningStatuses?: AppRunningStatus[];
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
  source: "windows-store" | "start-menu" | "desktop" | "everything";
  appUserModelId?: string;
  shortcutPath?: string;
  workingDirectory?: string;
  launchArgs?: string;
  iconPath?: string;
  iconCachePath?: string;
  iconDataUrl?: string;
  iconCacheVersion?: number;
  iconPixelSize?: number;
  isAvailable?: boolean;
  alreadyAdded?: boolean;
  existingAppId?: string;
  existingGroupId?: string;
  score?: number;
  rank?: number;
};

export type InstallableAppCandidate = {
  id: string;
  name: string;
  description: string;
  publisher: string;
  downloadPage: string;
  aliases: string[];
  category: "browser" | "chat" | "developer" | "game" | "office" | "tool";
  source: "official";
  action: "open-download-page";
  score?: number;
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

export type AppInfo = {
  version: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  systemVersion: string;
  userDataPath: string;
  isPackaged: boolean;
  repositoryUrl: string;
};

export type StartEngineerApi = {
  getAppInfo: () => Promise<AppInfo>;
  openUserDataDirectory: () => Promise<void>;
  openProjectHomepage: () => Promise<void>;
  listGroups: () => Promise<AppGroup[]>;
  createGroup: (input: GroupInput) => Promise<AppGroup[]>;
  updateGroup: (input: GroupUpdateInput) => Promise<AppGroup[]>;
  reorderGroups: (groupIds: string[]) => Promise<AppGroup[]>;
  removeGroup: (groupId: string, targetGroupId: string) => Promise<RemoveGroupResult>;
  listFolders: () => Promise<AppFolder[]>;
  createFolder: (input: AppFolderInput) => Promise<AppFolder[]>;
  updateFolder: (input: AppFolderUpdateInput) => Promise<AppFolder[]>;
  removeFolder: (id: string) => Promise<AppFolder[]>;
  launchFolder: (id: string) => Promise<BatchLaunchResult>;
  onFolderLaunchProgress: (listener: (progress: FolderLaunchProgress) => void) => () => void;
  listGroupGridOrders: () => Promise<GroupGridOrder[]>;
  reorderGroupItems: (groupId: string, itemIds: GroupGridItemId[]) => Promise<GroupGridOrder[]>;
  moveFolder: (folderId: string, targetGroupId: string) => Promise<FolderMutationResult>;
  moveFolderMember: (input: MoveFolderMemberInput) => Promise<FolderMutationResult>;
  listApps: () => Promise<AppEntry[]>;
  autoImportFirstRunApps: () => Promise<AppEntry[]>;
  searchAppCandidates: (query: string) => Promise<DiscoveredAppCandidate[]>;
  searchInstallableApps: (query: string) => Promise<InstallableAppCandidate[]>;
  openInstallableAppDownload: (candidateId: string) => Promise<void>;
  addDiscoveredCandidate: (candidateId: string, groupId: AppEntry["groupId"]) => Promise<AddDiscoveredAppResult>;
  refreshDiscoveryIndex: () => Promise<DiscoveredAppCandidate[]>;
  refreshAppIcons: () => Promise<AppEntry[]>;
  addAppFromDialog: (groupId?: AppEntry["groupId"]) => Promise<AppEntry[]>;
  addDroppedExecutables: (filePaths: string[], groupId?: AppEntry["groupId"]) => Promise<AddDroppedExecutablesResult>;
  getPathForFile: (file: File) => string;
  pickExecutable: (id: string) => Promise<string | null>;
  updateApp: (input: UpdateAppInput) => Promise<AppEntry[]>;
  setAppGroup: (id: string, groupId: AppEntry["groupId"]) => Promise<AppEntry[]>;
  reorderAppsInGroup: (groupId: AppEntry["groupId"], appIds: string[]) => Promise<AppEntry[]>;
  launchApp: (id: string) => Promise<LaunchAppResult>;
  focusAppWindow: (id: string, hints?: FocusWindowHints) => Promise<FocusAppWindowResult>;
  focusAppWindowHandle: (id: string, handle: number, hints?: FocusWindowHints) => Promise<FocusAppWindowResult>;
  listAppWindows: (id: string, hints?: FocusWindowHints) => Promise<AppWindowInfo[]>;
  getAppWindowDiagnostics: (id: string, hints?: FocusWindowHints) => Promise<string>;
  killApp: (id: string) => Promise<KillAppResult | AppEntry[]>;
  killFolderApps: (folderId: string) => Promise<BatchKillResult>;
  killGroupApps: (groupId: string) => Promise<BatchKillResult>;
  killAllApps: () => Promise<BatchKillResult>;
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
  getManagedRunningStatus: () => Promise<AppRunningStatus[]>;
  getPreferences: () => Promise<AppPreferencesState>;
  updatePreferences: (input: UpdatePreferencesInput) => Promise<AppPreferencesState>;
  exportUiLayoutShareCode: () => Promise<string>;
  importUiLayoutShareCode: (code: string) => Promise<AppPreferencesState>;
  restartWithConfiguredPrivileges: () => Promise<void>;
  onPreferencesStateChanged: (listener: (preferences: AppPreferencesState) => void) => () => void;
  windowAction: (action: WindowAction) => Promise<void>;
};

export type CommandDeckApi = StartEngineerApi;
