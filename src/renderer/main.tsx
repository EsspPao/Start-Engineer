import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import type { AppEntry, AppFolder, AppGroup, AppKeyboardShortcutId, AppMetrics, AppPreferencesState, AppWindowInfo, DiscoveredAppCandidate, EverythingSearchResult, FocusAppWindowResult, FocusWindowHints, FolderLaunchVisualStatus, GroupGridItemId, GroupGridOrder, GroupInput, InstallableAppCandidate, InternalSearchResult, ProcessInfo, SearchDependencyStatus, SearchProvider, SectionId, StartEngineerApi, UiLayoutPreferences, UiTheme, UpdateAppInput, UpdatePreferencesInput, WallpaperGlassIntensity } from "../shared/types";
import { defaultUiLayoutPreferences } from "../shared/ui-layout-share";
import { defaultKeyboardShortcuts } from "../main/preferences";
import { GroupPage, ProcessPage, UnifiedGroupPage } from "./pages";
import { resolveAppKeyboardAction } from "./app-card-interaction";
import { sortAppsForDisplay } from "./app-display";
import { completePreviewOrder, hitTestAppOrder, reuseOrderIfEqual, type AppDragRect } from "./app-drag-order";
import { buildInternalSearchResults, matchesAppSearch, matchesProcessSearch } from "./search";
import { SEARCH_RESULT_OPTION_ATTRIBUTE, buildSearchableAppIdentityKey, scrollSelectedSearchResultIntoView } from "./search-panel-behavior";
import { buildLaunchFeedbackMessage } from "./launch-feedback";
import { ALL_APPS_SECTION_ID, firstAppGroupId, resolveLoadedSection } from "./navigation";
import { shouldStartProcessPrewarm, STARTUP_DEFERRED_IMPORT_MS, STARTUP_DEFERRED_RUNTIME_MS, STARTUP_PROCESS_PREWARM_MS } from "./startup-schedule";
import { shortcutFromKeyboardEvent, validateShortcut } from "../shared/global-shortcut";
import { appShortcutFromEvent, findAppShortcut, findShortcutConflict, isRecordableAppShortcut } from "../shared/app-shortcuts";
import { cleanErrorMessage } from "./error-message";
import { buildThemeAttributes } from "./theme-attributes";
import { themeOptions } from "./theme-options";
import { keyboardBlockKeyFromEventLike, isTextInputTarget, pickDirectionalApp, pickIndexedGroup, pickRelativeGroup, shouldSuppressNavigationAfterGroupMove, type AppCardRect } from "./keyboard-navigation";
import { KeyboardShortcutPanel } from "./keyboard-shortcuts";
import { pageFocusSelector, resolveSearchEscapeAction, resolveSectionAppFocusTarget, shouldFocusAddedApp } from "./search-focus";
import { resolveSearchResultAction } from "./search-results-selection";
import { droppedExePaths, dropNoticeForResult, targetDropGroupId } from "./dropped-files";
import { allAppsSelection, appSectionApps, decorateAllAppsLaunchSelection, mergeAllAppsOrder, navigationSectionIds } from "./section-apps";
import { groupSortPreviewPosition } from "./drag-preview-position";
import { applyKillAppResult, killAppResultHasMetrics } from "./kill-app-result";
import { applyRunningStatusToMetrics } from "./running-status";
import { FAST_RUNNING_STATUS_INTERVAL_MS } from "./fast-running-status";
import { WallpaperGlassIntensityControl, WallpaperGlassVariantControl } from "./theme-settings";
import "./styles.css";

type SortKey = "name" | "cpuPercent" | "memoryBytes" | "diskBytesPerSecond";
type ProcessFilter = "all" | "managed";
type AppGroupId = AppEntry["groupId"];
type RuntimeApp = AppEntry & { metrics: AppMetrics };
type DisplayProcess = ProcessInfo & { isEnded?: boolean };
type MenuState =
  | { kind: "process"; x: number; y: number; process: ProcessInfo }
  | { kind: "app"; x: number; y: number; appId: string }
  | { kind: "group"; x: number; y: number; groupId: string }
  | null;
type ConfirmState = { title: string; message: string; confirmLabel: string; onConfirm: () => Promise<void> } | null;
type EditState = { id: string; name: string; executablePath: string; launchArgs: string } | null;
type MergeTarget = { kind: "app" | "folder"; id: string };
type DragState = { appId: string; itemId?: GroupGridItemId; folderId?: string; sourceFolderId?: string; x: number; y: number; grabOffsetX: number; grabOffsetY: number; width: number; height: number; targetGroup?: AppGroupId; targetFolderId?: string; mergeCandidateTarget?: MergeTarget; targetAppId?: string; reorderGroupId?: AppGroupId; previewOrder?: string[] } | null;
type GroupEditState = { id?: string; name: string; icon: string } | null;
type GroupDeleteState = { groupId: string; targetGroupId: string } | null;

const fallbackGroups: AppGroup[] = [
  { id: "processes", name: "进程", icon: "activity", isSystem: true, order: -1 },
  { id: "games", name: "二游", icon: "compass", isSystem: false, order: 0 },
  { id: "office", name: "办公", icon: "briefcase", isSystem: false, order: 1 },
  { id: "tools", name: "工具", icon: "wrench", isSystem: false, order: 2 },
  { id: "settings", name: "设置", icon: "settings", isSystem: true, order: Number.MAX_SAFE_INTEGER }
];
const APP_MERGE_HOVER_MS = 380;
const groupIcons = ["compass", "briefcase", "wrench", "grid", "star", "gamepad", "folder", "music", "code"];
export const SEARCH_INPUT_PLACEHOLDER = "搜索";

function playGroupTransferFeedback(targetGroupId: string, operation: Promise<unknown>) {
  if (typeof document === "undefined") return;
  const escapedId = CSS.escape(targetGroupId);
  const target = document.querySelector<HTMLElement>(`[data-drop-group="${escapedId}"], [data-settings-drop-group="${escapedId}"]`);
  if (!target) return;
  const source = document.querySelector<HTMLElement>(".app-card-drag-preview, .drag-preview");
  target.classList.remove("group-transfer-complete", "group-transfer-failed");
  target.classList.add("group-transfer-receiving");
  let flightFinished: Promise<unknown> = Promise.resolve();
  let flight: HTMLElement | null = null;
  if (source && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    flight = source.cloneNode(true) as HTMLElement;
    flight.classList.add("group-transfer-flight");
    Object.assign(flight.style, { left: `${sourceRect.left}px`, top: `${sourceRect.top}px`, width: `${sourceRect.width}px`, height: `${sourceRect.height}px` });
    document.body.appendChild(flight);
    const x = targetRect.left + targetRect.width / 2 - sourceRect.left - sourceRect.width / 2;
    const y = targetRect.top + targetRect.height / 2 - sourceRect.top - sourceRect.height / 2;
    const animation = flight.animate([
      { opacity: .96, transform: "translate3d(0,0,0) scale(1)" },
      { offset: .72, opacity: .86, transform: `translate3d(${x * .76}px,${y * .76}px,0) scale(.54)` },
      { opacity: .16, transform: `translate3d(${x}px,${y}px,0) scale(.16)` }
    ], { duration: 480, easing: "cubic-bezier(.2,.78,.18,1)", fill: "forwards" });
    flightFinished = animation.finished.catch(() => undefined);
  }
  void Promise.allSettled([flightFinished, operation]).then((results) => {
    flight?.remove();
    target.classList.remove("group-transfer-receiving");
    const succeeded = results[1]?.status === "fulfilled";
    const stateClass = succeeded ? "group-transfer-complete" : "group-transfer-failed";
    target.classList.add(stateClass);
    window.setTimeout(() => target.classList.remove(stateClass), 620);
  });
}

const electronOnly = () => Promise.reject(new Error("此操作需要在 Electron 应用窗口中运行"));
const fallbackApi: StartEngineerApi = {
  listGroups: async () => fallbackGroups,
  createGroup: electronOnly,
  updateGroup: electronOnly,
  reorderGroups: electronOnly,
  removeGroup: electronOnly,
  listFolders: async () => [],
  createFolder: async () => [],
  updateFolder: async () => [],
  removeFolder: async () => [],
  launchFolder: electronOnly,
  onFolderLaunchProgress: () => () => {},
  listGroupGridOrders: async () => [],
  reorderGroupItems: async () => [],
  moveFolder: async () => ({ apps: [], folders: [], gridOrders: [] }),
  moveFolderMember: async () => ({ apps: [], folders: [], gridOrders: [] }),
  listApps: async () => [],
  discoverImportCandidates: async () => [],
  importDiscoveredApps: async () => [],
  searchAppCandidates: async () => [],
  searchInstallableApps: async () => [],
  openInstallableAppDownload: electronOnly,
  addDiscoveredCandidate: async () => ({ apps: [], added: false }),
  refreshDiscoveryIndex: async () => [],
  refreshAppIcons: async () => [],
  addAppFromDialog: electronOnly,
  addDroppedExecutables: async () => ({ apps: [], addedAppIds: [], skippedPaths: [] }),
  getPathForFile: (file) => (file as File & { path?: string }).path ?? "",
  pickExecutable: async () => null,
  updateApp: async () => [],
  setAppGroup: async () => [],
  reorderAppsInGroup: async () => [],
  setAppLaunchSelected: async () => [],
  setGroupLaunchSelected: async () => [],
  launchApp: electronOnly,
  focusAppWindow: async () => ({ focused: false }),
  focusAppWindowHandle: async () => ({ focused: false }),
  listAppWindows: async () => [],
  getAppWindowDiagnostics: async () => "",
  launchSelectedApps: electronOnly,
  killApp: async () => ({ apps: [], metrics: [] }),
  killGroupApps: electronOnly,
  removeApp: async () => [],
  killProcessGroup: async () => electronOnly(),
  showItemInFolder: async () => electronOnly(),
  writeClipboardText: async () => electronOnly(),
  getMetricsSnapshot: async () => [],
  getProcessSnapshot: async () => [],
  getRuntimeSnapshot: async () => ({ apps: [], metrics: [], processes: [] }),
  getManagedRunningStatus: async () => [],
  searchEverything: electronOnly,
  pickEverythingCli: electronOnly,
  getSearchDependencyStatus: async () => ({ state: "missing", message: "Electron 环境中才可准备搜索依赖" }),
  prepareSearchDependencies: electronOnly,
  openSearchDependencyFolder: electronOnly,
  openSearchResult: async () => electronOnly(),
  showSearchResultInFolder: async () => electronOnly(),
  getPreferences: async () => ({ launchAtStartup: false, closeBehavior: "tray", globalShortcutEnabled: true, globalShortcut: "Ctrl+Shift+Space", uiTheme: "apple", wallpaperGlassIntensity: 55, wallpaperGlassVariant: "dark", runAsAdministrator: false, searchProvider: "everything", sortRunningAppsFirst: true, showAppNames: false, keyboardShortcuts: defaultKeyboardShortcuts, uiLayout: defaultUiLayoutPreferences, allAppsView: { orderedAppIds: [], launchSelectedAppIds: [] }, firstRunImportCompleted: false, globalShortcutStatus: "registered", isRunningAsAdministrator: false, administratorStatusLoading: false, administratorRestartRequired: false }),
  updatePreferences: async (input) => ({ launchAtStartup: input.launchAtStartup ?? false, closeBehavior: input.closeBehavior ?? "tray", globalShortcutEnabled: input.globalShortcutEnabled ?? true, globalShortcut: input.globalShortcut ?? "Ctrl+Shift+Space", uiTheme: input.uiTheme ?? "apple", wallpaperGlassIntensity: input.wallpaperGlassIntensity ?? 55, wallpaperGlassVariant: input.wallpaperGlassVariant ?? "dark", runAsAdministrator: input.runAsAdministrator ?? false, searchProvider: input.searchProvider ?? "everything", sortRunningAppsFirst: input.sortRunningAppsFirst ?? true, showAppNames: input.showAppNames ?? false, keyboardShortcuts: input.keyboardShortcuts ?? defaultKeyboardShortcuts, uiLayout: input.uiLayout ?? defaultUiLayoutPreferences, allAppsView: input.allAppsView ?? { orderedAppIds: [], launchSelectedAppIds: [] }, firstRunImportCompleted: input.firstRunImportCompleted ?? false, everythingCliPath: input.everythingCliPath, globalShortcutStatus: "registered", isRunningAsAdministrator: false, administratorStatusLoading: false, administratorRestartRequired: Boolean(input.runAsAdministrator) }),
  exportUiLayoutShareCode: async () => "",
  importUiLayoutShareCode: electronOnly,
  restartWithConfiguredPrivileges: electronOnly,
  windowAction: async () => electronOnly()
};

const api = () => window.startEngineer ?? window.commandDeck ?? fallbackApi;

function isAppKeyboardScope(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return true;
  if (target.closest(".app-card")) return true;
  if (target.closest("button, input, textarea, select, [contenteditable='true']")) return false;
  return Boolean(target.closest(".app-grid, .group-content")) || target === document.body || target.classList.contains("window") || target.classList.contains("app-shell");
}

function focusHintsForApp(app: RuntimeApp): FocusWindowHints {
  return {
    pids: app.metrics.pids,
    matchedPids: app.metrics.matchedPids,
    associatedPids: app.metrics.associatedPids,
    matchedProcessNames: app.metrics.matchedProcessNames,
    matchedPaths: app.metrics.matchedPaths
  };
}

function focusResultMessage(result: FocusAppWindowResult) {
  if (result.focused) return "";
  if (result.reason === "tray-hidden") return "应用仍在托盘运行，请从托盘图标打开";
  if (result.reason === "trayIconNotFound") return "应用可能在托盘中";
  if (result.reason === "trayRestoreUnsupported") return "微信可能在托盘中，暂不支持直接恢复";
  if (result.reason === "trayRestoreFailed" || result.reason === "suspectedWrongWindow" || result.reason === "restoredButNotInteractive" || result.reason === "fallbackRelaunchDisabled") return "未能正常恢复应用窗口";
  if (result.reason === "foreground-blocked") return "窗口已找到，但 Windows 阻止了前台切换，可从任务栏点开";
  return "未找到可唤起窗口";
}
const emptyMetrics = (appId: string): AppMetrics => ({
  appId,
  isRunning: false,
  cpuPercent: 0,
  memoryBytes: 0,
  diskBytesPerSecond: 0,
  pids: [],
  matchedPids: [],
  associatedPids: [],
  matchedProcessNames: [],
  matchedPaths: []
});

function App() {
  const [groups, setGroups] = useState(fallbackGroups);
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [folders, setFolders] = useState<AppFolder[]>([]);
  const [groupGridOrders, setGroupGridOrders] = useState<GroupGridOrder[]>([]);
  const [expandedFolderId, setExpandedFolderId] = useState("");
  const [metrics, setMetrics] = useState<AppMetrics[]>([]);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [processesLoading, setProcessesLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>(() => firstAppGroupId(fallbackGroups));
  const [selectedAppId, setSelectedAppId] = useState("");
  const [query, setQuery] = useState("");
  const [preferences, setPreferences] = useState<AppPreferencesState>({ launchAtStartup: false, closeBehavior: "tray", globalShortcutEnabled: true, globalShortcut: "Ctrl+Shift+Space", uiTheme: "apple", wallpaperGlassIntensity: 55, wallpaperGlassVariant: "dark", runAsAdministrator: false, searchProvider: "everything", sortRunningAppsFirst: true, showAppNames: false, keyboardShortcuts: defaultKeyboardShortcuts, uiLayout: defaultUiLayoutPreferences, allAppsView: { orderedAppIds: [], launchSelectedAppIds: [] }, firstRunImportCompleted: false, globalShortcutStatus: "registered", isRunningAsAdministrator: false, administratorStatusLoading: false, administratorRestartRequired: false });
  const [discoveredResults, setDiscoveredResults] = useState<DiscoveredAppCandidate[]>([]);
  const [installableResults, setInstallableResults] = useState<InstallableAppCandidate[]>([]);
  const [fileResults, setFileResults] = useState<EverythingSearchResult[]>([]);
  const [searchDependencyStatus, setSearchDependencyStatus] = useState<SearchDependencyStatus>({ state: "missing" });
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [searchSelectedIndex, setSearchSelectedIndex] = useState(0);
  const [fileDropActive, setFileDropActive] = useState(false);
  const [systemIsDark, setSystemIsDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [sortKey, setSortKey] = useState<SortKey>("cpuPercent");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [processFilter, setProcessFilter] = useState<ProcessFilter>("managed");
  const [menu, setMenu] = useState<MenuState>(null);
  const [lockedProcessName, setLockedProcessName] = useState("");
  const [lockedProcessOrder, setLockedProcessOrder] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [edit, setEdit] = useState<EditState>(null);
  const [groupEdit, setGroupEdit] = useState<GroupEditState>(null);
  const [groupDelete, setGroupDelete] = useState<GroupDeleteState>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importCandidates, setImportCandidates] = useState<DiscoveredAppCandidate[]>([]);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());
  const [importingApps, setImportingApps] = useState(false);
  const [launchingAppIds, setLaunchingAppIds] = useState<Set<string>>(new Set());
  const [folderLaunchStatuses, setFolderLaunchStatuses] = useState<Record<string, FolderLaunchVisualStatus>>({});
  const [invalidAppIds, setInvalidAppIds] = useState<Set<string>>(new Set());
  const dragCandidate = useRef<{ appId: string; sourceGroupId: AppGroupId; startX: number; startY: number; grabOffsetX: number; grabOffsetY: number; width: number; height: number; initialOrder: string[] } | null>(null);
  const unifiedDragCandidate = useRef<{ kind: "app" | "folder"; appId?: string; folderId?: string; sourceFolderId?: string; itemId: GroupGridItemId; startX: number; startY: number; grabOffsetX: number; grabOffsetY: number; width: number; height: number; initialOrder?: GroupGridItemId[]; initialRects?: AppDragRect[] } | null>(null);
  const unifiedDragState = useRef<DragState>(null);
  const mergeHover = useRef<{ target: MergeTarget; since: number; readyTimer: number } | null>(null);
  const suppressFolderClick = useRef(false);
  const iconRefreshStarted = useRef(false);
  const runtimePollingStarted = useRef(false);
  const processPrewarmStarted = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchRequest = useRef(0);
  const focusRequestSeq = useRef(0);
  const fileDropDepth = useRef(0);
  const launchingAppIdsRef = useRef(new Set<string>());
  const folderLaunchClearTimers = useRef(new Map<string, number>());
  const groupNavigationBlockKeyRef = useRef<string | null>(null);
  const metricsByApp = useMemo(() => new Map(metrics.map((metric) => [metric.appId, metric])), [metrics]);
  const runtimeApps = useMemo<RuntimeApp[]>(() => apps.map((item) => ({ ...item, metrics: metricsByApp.get(item.id) ?? emptyMetrics(item.id) })), [apps, metricsByApp]);
  const appGroups = useMemo(() => groups.filter((group) => !group.isSystem).sort((a, b) => a.order - b.order), [groups]);
  const closeMenu = useCallback(() => {
    setMenu(null);
    setLockedProcessName("");
    setLockedProcessOrder([]);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = (event: MediaQueryListEvent) => setSystemIsDark(event.matches);
    setSystemIsDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const themeAttributes = useMemo(() => buildThemeAttributes(preferences, systemIsDark), [preferences.uiTheme, preferences.wallpaperGlassIntensity, preferences.wallpaperGlassVariant, systemIsDark]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeAttributes.theme;
    document.documentElement.dataset.wallpaperIntensity = String(themeAttributes.wallpaperIntensity);
    document.documentElement.dataset.wallpaperVariant = themeAttributes.wallpaperVariant;
    document.documentElement.style.colorScheme = themeAttributes.colorScheme;
    window.localStorage.setItem("start-engineer-ui-theme", preferences.uiTheme);
  }, [preferences.uiTheme, themeAttributes]);

  useEffect(() => {
    const unsubscribe = api().onFolderLaunchProgress((progress) => {
      const visualStatus = progress.status === "launched" ? "waiting" : progress.status;
      setFolderLaunchStatuses((current) => ({ ...current, [progress.appId]: visualStatus }));
      if (progress.status === "launching") launchingAppIdsRef.current.add(progress.appId);
      else launchingAppIdsRef.current.delete(progress.appId);
      setLaunchingAppIds(new Set(launchingAppIdsRef.current));
    });
    return () => {
      unsubscribe();
      for (const timer of folderLaunchClearTimers.current.values()) window.clearTimeout(timer);
      folderLaunchClearTimers.current.clear();
    };
  }, []);

  useEffect(() => {
    const confirmed = metrics.filter((metric) => metric.isRunning && folderLaunchStatuses[metric.appId] === "waiting").map((metric) => metric.appId);
    if (!confirmed.length) return;
    setFolderLaunchStatuses((current) => ({ ...current, ...Object.fromEntries(confirmed.map((id) => [id, "launched" as const])) }));
    for (const id of confirmed) {
      const timer = folderLaunchClearTimers.current.get(id);
      if (timer) window.clearTimeout(timer);
      folderLaunchClearTimers.current.set(id, window.setTimeout(() => {
        setFolderLaunchStatuses((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        folderLaunchClearTimers.current.delete(id);
      }, 4200));
    }
  }, [folderLaunchStatuses, metrics]);

  const refreshRuntimeData = useCallback(async (mode: "full" | "managed" = "full", force = false) => {
    if (mode === "full") setProcessesLoading(true);
    try {
      const snapshot = await api().getRuntimeSnapshot(mode, force);
      if (unifiedDragCandidate.current || unifiedDragState.current) return;
      setApps(snapshot.apps);
      setMetrics(snapshot.metrics);
      if (mode === "full") setProcesses(snapshot.processes);
    } catch (reason) {
      setError(cleanErrorMessage(reason, "资源监控刷新失败"));
    } finally {
      if (mode === "full") setProcessesLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let startupRuntimeTimer = 0;
    let startupIconTimer = 0;
    let startupPreferencesTimer = 0;
    let startupImportTimer = 0;
    let startupProcessPrewarmTimer = 0;
    let running = false;
    void Promise.all([api().listGroups(), api().listApps(), api().listFolders(), api().listGroupGridOrders(), api().getPreferences()]).then(([nextGroups, nextApps, nextFolders, nextGridOrders, nextPreferences]) => {
      if (cancelled) return;
      const loadedGroups = nextGroups.length ? nextGroups : fallbackGroups;
      setGroups(loadedGroups);
      setApps(nextApps);
      setFolders(nextFolders);
      setGroupGridOrders(nextGridOrders);
      setPreferences(nextPreferences);
      setActiveSection((current) => resolveLoadedSection(current, loadedGroups));
      startupImportTimer = window.setTimeout(() => {
        if (cancelled || nextPreferences.firstRunImportCompleted || nextApps.length !== 0) return;
        void api().discoverImportCandidates().then(async (candidates) => {
          if (cancelled) return;
          if (!candidates.length) {
            const updated = await api().updatePreferences({ firstRunImportCompleted: true });
            if (!cancelled) setPreferences(updated);
            return;
          }
          setImportCandidates(candidates);
          setSelectedImportIds(new Set(candidates.map((candidate) => candidate.id)));
        }).catch((reason) => setError(cleanErrorMessage(reason, "扫描可导入应用失败")));
      }, STARTUP_DEFERRED_IMPORT_MS);
      if (!iconRefreshStarted.current) {
        iconRefreshStarted.current = true;
        startupIconTimer = window.setTimeout(() => {
          window.requestAnimationFrame(() => void api().refreshAppIcons().then(setApps).catch((reason) => setError(cleanErrorMessage(reason, "应用图标刷新失败"))));
        }, STARTUP_DEFERRED_RUNTIME_MS);
      }
      startupPreferencesTimer = window.setTimeout(() => {
        if (!cancelled) void api().getPreferences().then(setPreferences).catch(() => undefined);
      }, STARTUP_DEFERRED_RUNTIME_MS);
      startupProcessPrewarmTimer = window.setTimeout(() => {
        if (cancelled || !shouldStartProcessPrewarm(document.hidden, processPrewarmStarted.current)) return;
        processPrewarmStarted.current = true;
        void api().getRuntimeSnapshot("full").then((snapshot) => {
          if (cancelled) return;
          setApps(snapshot.apps);
          setMetrics(snapshot.metrics);
          setProcesses(snapshot.processes);
        }).catch(() => undefined);
      }, STARTUP_PROCESS_PREWARM_MS);
    }).catch((reason) => setError(cleanErrorMessage(reason, "基础数据加载失败")));
    const schedule = () => {
      const mode = activeSection === "processes" ? "full" : "managed";
      const delay = mode === "full" ? 1000 : 5000;
      timer = window.setTimeout(async () => {
        if (!cancelled && !document.hidden && !running) {
          running = true;
          await refreshRuntimeData(mode);
          running = false;
        }
        if (!cancelled) schedule();
      }, delay);
    };
    const start = () => {
      window.clearTimeout(timer);
      if (!document.hidden && !running) {
        running = true;
        window.requestAnimationFrame(() => void refreshRuntimeData(activeSection === "processes" ? "full" : "managed").finally(() => {
          running = false;
          if (!cancelled) schedule();
        }));
      } else {
        schedule();
      }
    };
    document.addEventListener("visibilitychange", start);
    if (runtimePollingStarted.current) {
      start();
    } else {
      startupRuntimeTimer = window.setTimeout(() => {
        runtimePollingStarted.current = true;
        start();
      }, STARTUP_DEFERRED_RUNTIME_MS);
    }
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearTimeout(startupRuntimeTimer);
      window.clearTimeout(startupIconTimer);
      window.clearTimeout(startupPreferencesTimer);
      window.clearTimeout(startupImportTimer);
      window.clearTimeout(startupProcessPrewarmTimer);
      document.removeEventListener("visibilitychange", start);
    };
  }, [activeSection, refreshRuntimeData]);

  useEffect(() => {
    if (activeSection === "processes") return;
    let cancelled = false;
    let timer = 0;
    let running = false;
    const schedule = () => {
      timer = window.setTimeout(async () => {
        if (!cancelled && !document.hidden && !running) {
          running = true;
          try {
            const statuses = await api().getManagedRunningStatus();
            if (!cancelled && !unifiedDragCandidate.current && !unifiedDragState.current) setMetrics((current) => applyRunningStatusToMetrics(current, statuses));
          } catch {
            // Full runtime snapshots continue to refresh detailed state if the fast probe is unavailable.
          } finally {
            running = false;
          }
        }
        if (!cancelled) schedule();
      }, FAST_RUNNING_STATUS_INTERVAL_MS);
    };
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection]);

  useEffect(() => {
    window.addEventListener("blur", closeMenu);
    return () => window.removeEventListener("blur", closeMenu);
  }, [closeMenu]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), 7000);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "f" || event.key.toLowerCase() === "k")) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (event.key === "Escape" && query) {
        setQuery("");
        setSearchPanelOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeSection, query]);

  const runAppAction = useCallback(async (action: () => Promise<AppEntry[]>) => {
    try {
      setError("");
      setApps(await action());
      const [nextFolders, nextOrders] = await Promise.all([api().listFolders(), api().listGroupGridOrders()]);
      setFolders(nextFolders);
      setGroupGridOrders(nextOrders);
      await refreshRuntimeData(activeSection === "processes" ? "full" : "managed", true);
    } catch (reason) {
      setError(cleanErrorMessage(reason));
    }
  }, [activeSection, refreshRuntimeData]);

  const closeApp = useCallback(async (appId: string) => {
    setError("");
    let refreshedByKill = false;
    try {
      const result = await api().killApp(appId);
      const next = applyKillAppResult(result);
      setApps(next.apps);
      if (next.metrics) {
        setMetrics(next.metrics);
        refreshedByKill = killAppResultHasMetrics(result);
      }
    } catch (reason) {
      setError(cleanErrorMessage(reason, "结束应用失败"));
    } finally {
      if (!refreshedByKill) {
        await refreshRuntimeData(activeSection === "processes" ? "full" : "managed", true);
      }
    }
  }, [activeSection, refreshRuntimeData]);

  const requestCloseApp = useCallback((app: RuntimeApp) => setConfirm({
    title: "结束应用进程",
    message: `确定结束 ${app.name} 的全部相关进程吗？`,
    confirmLabel: "结束进程",
    onConfirm: async () => { await closeApp(app.id); }
  }), [closeApp]);

  const savePreferences = useCallback(async (input: UpdatePreferencesInput) => {
    const previous = preferences;
    setPreferences((current) => ({
      ...current,
      ...input,
      uiLayout: input.uiLayout ? { ...current.uiLayout, ...input.uiLayout } : current.uiLayout
    }));
    try {
      setError("");
      const next = await api().updatePreferences(input);
      if (input.wallpaperGlassIntensity === undefined) {
        setPreferences(next);
        return next;
      }
      setPreferences((current) => ({ ...next, wallpaperGlassIntensity: current.wallpaperGlassIntensity }));
      return { ...next, wallpaperGlassIntensity: input.wallpaperGlassIntensity };
    } catch (reason) {
      setPreferences(previous);
      setError(cleanErrorMessage(reason, "偏好设置保存失败"));
      throw reason;
    }
  }, [preferences]);

  const dismissFirstRunImport = useCallback(async () => {
    setImportCandidates([]);
    setSelectedImportIds(new Set());
    try {
      setPreferences(await api().updatePreferences({ firstRunImportCompleted: true }));
    } catch (reason) {
      setError(cleanErrorMessage(reason, "保存首次导入状态失败"));
    }
  }, []);

  const importSelectedApps = useCallback(async () => {
    if (importingApps) return;
    setImportingApps(true);
    try {
      const imported = await api().importDiscoveredApps([...selectedImportIds]);
      setApps(imported);
      setPreferences((current) => ({ ...current, firstRunImportCompleted: true }));
      setImportCandidates([]);
      setSelectedImportIds(new Set());
      setNotice(selectedImportIds.size ? `已导入 ${selectedImportIds.size} 个应用` : "已跳过应用导入");
      await refreshRuntimeData("managed", true);
    } catch (reason) {
      setError(cleanErrorMessage(reason, "导入应用失败"));
    } finally {
      setImportingApps(false);
    }
  }, [importingApps, refreshRuntimeData, selectedImportIds]);

  const saveTheme = useCallback(async (uiTheme: UiTheme) => {
    const previous = preferences;
    setPreferences({ ...preferences, uiTheme });
    try {
      setError("");
      const next = await api().updatePreferences({ uiTheme });
      setPreferences(next);
      return next;
    } catch (reason) {
      setPreferences(previous);
      setError(cleanErrorMessage(reason, "主题设置保存失败"));
      throw reason;
    }
  }, [preferences]);

  const moveAppToGroup = useCallback(async (appId: string, targetGroup: AppGroupId) => {
    const current = apps.find((item) => item.id === appId);
    if (!current || current.groupId === targetGroup) return;
    try {
      const operation = api().setAppGroup(appId, targetGroup);
      playGroupTransferFeedback(targetGroup, operation);
      setApps(await operation);
      const [nextFolders, nextOrders] = await Promise.all([api().listFolders(), api().listGroupGridOrders()]);
      setFolders(nextFolders);
      setGroupGridOrders(nextOrders);
      setActiveSection(targetGroup);
      setSelectedAppId(appId);
      setQuery("");
      closeMenu();
    } catch (reason) {
      setError(cleanErrorMessage(reason, "移动应用失败"));
    }
  }, [apps, closeMenu]);
  const reorderAppsInGroup = useCallback(async (groupId: AppGroupId, orderedVisibleIds: string[]) => {
    if (orderedVisibleIds.length < 2) return;
    try {
      if (groupId === ALL_APPS_SECTION_ID) {
        const allAppsView = {
          ...preferences.allAppsView,
          orderedAppIds: mergeAllAppsOrder(preferences.allAppsView.orderedAppIds, orderedVisibleIds, apps.map((app) => app.id))
        };
        const next = await api().updatePreferences({ allAppsView });
        setPreferences(next);
        closeMenu();
        return;
      }
      setApps(await api().reorderAppsInGroup(groupId, orderedVisibleIds));
      closeMenu();
    } catch (reason) {
      setError(cleanErrorMessage(reason, "应用排序失败"));
    }
  }, [apps, closeMenu, preferences.allAppsView]);
  const moveAppWithinSettings = useCallback(async (appId: string, targetGroup: AppGroupId) => {
    const current = apps.find((item) => item.id === appId);
    if (!current || current.groupId === targetGroup) return;
    try {
      const operation = api().setAppGroup(appId, targetGroup);
      playGroupTransferFeedback(targetGroup, operation);
      setApps(await operation);
      const [nextFolders, nextOrders] = await Promise.all([api().listFolders(), api().listGroupGridOrders()]);
      setFolders(nextFolders);
      setGroupGridOrders(nextOrders);
      closeMenu();
    } catch (reason) {
      setError(cleanErrorMessage(reason, "移动应用失败"));
    }
  }, [apps, closeMenu]);

  const applyFolderMutation = useCallback((result: Awaited<ReturnType<StartEngineerApi["moveFolderMember"]>>) => {
    setApps(result.apps);
    setFolders(result.folders);
    setGroupGridOrders(result.gridOrders);
  }, []);
  useEffect(() => { setExpandedFolderId(""); }, [activeSection]);

  useEffect(() => {
    const updateMergeFeedback = (mergeTarget?: MergeTarget, ready = false) => {
      const active = document.querySelector<HTMLElement>(".unified-grid .app-card-wrap.merge-pending, .unified-grid .app-card-wrap.merge-ready");
      const target = mergeTarget ? document.querySelector<HTMLElement>(`.unified-grid > [data-grid-item-id="${mergeTarget.kind}:${CSS.escape(mergeTarget.id)}"]`) : null;
      if (active && active !== target) active.classList.remove("merge-pending", "merge-ready", "merge-folder-target");
      const preview = document.querySelector<HTMLElement>(".app-card-drag-preview:not(.folder-drag-preview)");
      if (!target || !mergeTarget) {
        preview?.classList.remove("merge-preview-pending", "merge-preview-ready", "merge-preview-folder");
        preview?.style.removeProperty("--merge-shift-x");
        preview?.style.removeProperty("--merge-shift-y");
        return;
      }
      target.classList.toggle("merge-folder-target", mergeTarget.kind === "folder");
      if (ready) {
        target.classList.remove("merge-pending");
        target.classList.add("merge-ready");
      } else if (!target.classList.contains("merge-pending") && !target.classList.contains("merge-ready")) {
        target.classList.add("merge-pending");
      }
      if (preview) {
        if (ready) {
          preview.classList.remove("merge-preview-pending");
          preview.classList.add("merge-preview-ready");
        } else if (!preview.classList.contains("merge-preview-pending") && !preview.classList.contains("merge-preview-ready")) {
          preview.classList.add("merge-preview-pending");
        }
        preview.classList.toggle("merge-preview-folder", mergeTarget.kind === "folder");
        const targetRect = target.getBoundingClientRect();
        const previewLeft = Number.parseFloat(preview.style.left);
        const previewTop = Number.parseFloat(preview.style.top);
        const previewWidth = Number.parseFloat(preview.style.width);
        const previewHeight = Number.parseFloat(preview.style.height);
        preview.style.setProperty("--merge-shift-x", `${targetRect.left + targetRect.width / 2 - previewLeft - previewWidth / 2}px`);
        preview.style.setProperty("--merge-shift-y", `${targetRect.top + targetRect.height / 2 - previewTop - previewHeight / 2}px`);
      }
    };
    const resetMergeHover = () => {
      if (mergeHover.current) window.clearTimeout(mergeHover.current.readyTimer);
      mergeHover.current = null;
    };
    const move = (event: PointerEvent) => {
      const candidate = unifiedDragCandidate.current;
      if (!candidate || Math.hypot(event.clientX - candidate.startX, event.clientY - candidate.startY) <= 6) return;
      document.documentElement.dataset.cardDragging = "true";
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      const targetGroup = hit?.closest<HTMLElement>("[data-drop-group]")?.dataset.dropGroup;
      const targetFolderNode = hit?.closest<HTMLElement>("[data-folder-id]");
      const targetFolderId = targetFolderNode?.dataset.folderId;
      const targetAppNode = hit?.closest<HTMLElement>("[data-app-card-id]");
      const targetAppId = targetAppNode?.dataset.appCardId;
      if (!candidate.initialOrder || !candidate.initialRects) {
        const nodes = [...document.querySelectorAll<HTMLElement>(".unified-grid > [data-grid-item-id]")];
        candidate.initialOrder = nodes.map((node) => node.dataset.gridItemId).filter((id): id is GroupGridItemId => Boolean(id));
        candidate.initialRects = nodes.map((node) => { const rect = node.getBoundingClientRect(); return { id: node.dataset.gridItemId ?? "", left: rect.left, top: rect.top, width: rect.width, height: rect.height }; }).filter((rect) => rect.id);
        if (candidate.sourceFolderId && !candidate.initialOrder.includes(candidate.itemId)) candidate.initialOrder.push(candidate.itemId);
      }
      const ids = candidate.initialOrder;
      const rects = candidate.initialRects;
      let mergeCandidateTarget: MergeTarget | undefined;
      if (candidate.kind === "app" && targetFolderId && targetFolderId !== candidate.sourceFolderId && targetFolderNode) {
        const rect = targetFolderNode.getBoundingClientRect();
        const insideFolderZone = event.clientX >= rect.left + rect.width * .12 && event.clientX <= rect.right - rect.width * .12 && event.clientY >= rect.top + rect.height * .12 && event.clientY <= rect.bottom - rect.height * .12;
        if (insideFolderZone) mergeCandidateTarget = { kind: "folder", id: targetFolderId };
      } else if (candidate.kind === "app" && !candidate.sourceFolderId && targetAppId && targetAppId !== candidate.appId && targetAppNode) {
        const rect = targetAppNode.getBoundingClientRect();
        const insideAppZone = event.clientX >= rect.left + rect.width * .2 && event.clientX <= rect.right - rect.width * .2 && event.clientY >= rect.top + rect.height * .18 && event.clientY <= rect.bottom - rect.height * .18;
        if (insideAppZone) mergeCandidateTarget = { kind: "app", id: targetAppId };
      }
      if (mergeCandidateTarget) {
        const isSameTarget = mergeHover.current?.target.kind === mergeCandidateTarget.kind && mergeHover.current.target.id === mergeCandidateTarget.id;
        if (!isSameTarget) {
          resetMergeHover();
          const target = mergeCandidateTarget;
          mergeHover.current = {
            target,
            since: performance.now(),
            readyTimer: window.setTimeout(() => updateMergeFeedback(target, true), APP_MERGE_HOVER_MS)
          };
        }
      } else resetMergeHover();
      const mergeIsReady = Boolean(mergeCandidateTarget && mergeHover.current && performance.now() - mergeHover.current.since >= APP_MERGE_HOVER_MS);
      updateMergeFeedback(mergeCandidateTarget, mergeIsReady);
      const mergeTargetAppId = mergeIsReady && mergeCandidateTarget?.kind === "app" ? mergeCandidateTarget.id : undefined;
      const memberTargetFolderId = mergeIsReady && mergeCandidateTarget?.kind === "folder" ? mergeCandidateTarget.id : undefined;
      const nextPreviewOrder = !targetGroup
        ? mergeCandidateTarget
          ? unifiedDragState.current?.previewOrder ?? ids
          : hitTestAppOrder(ids, rects, candidate.itemId, event.clientX, event.clientY)
        : undefined;
      const previewOrder = nextPreviewOrder?.length === ids.length && ids.length
        ? reuseOrderIfEqual(unifiedDragState.current?.previewOrder, nextPreviewOrder)
        : undefined;
      const nextDrag: DragState = { appId: candidate.appId ?? "", itemId: candidate.itemId, folderId: candidate.folderId, sourceFolderId: candidate.sourceFolderId, x: event.clientX, y: event.clientY, grabOffsetX: candidate.grabOffsetX, grabOffsetY: candidate.grabOffsetY, width: candidate.width, height: candidate.height, targetGroup: targetGroup as AppGroupId | undefined, targetFolderId: memberTargetFolderId, mergeCandidateTarget, targetAppId: mergeTargetAppId, reorderGroupId: previewOrder?.length === ids.length && ids.length ? activeSection : undefined, previewOrder: previewOrder?.length === ids.length && ids.length ? previewOrder : undefined };
      unifiedDragState.current = nextDrag;
      setDrag(nextDrag);
      if (mergeCandidateTarget) window.requestAnimationFrame(() => {
        const currentTarget = unifiedDragState.current?.mergeCandidateTarget;
        if (currentTarget?.kind === mergeCandidateTarget.kind && currentTarget.id === mergeCandidateTarget.id) updateMergeFeedback(mergeCandidateTarget, mergeIsReady);
      });
    };
    const up = () => {
      const candidate = unifiedDragCandidate.current;
      let current = unifiedDragState.current;
      if (current && candidate?.kind === "app" && mergeHover.current && performance.now() - mergeHover.current.since >= APP_MERGE_HOVER_MS) {
        current = mergeHover.current.target.kind === "app"
          ? { ...current, targetAppId: mergeHover.current.target.id, targetFolderId: undefined }
          : { ...current, targetFolderId: mergeHover.current.target.id, targetAppId: undefined };
      }
      unifiedDragCandidate.current = null;
      unifiedDragState.current = null;
      resetMergeHover();
      updateMergeFeedback();
      setDrag(null);
      if (!candidate || !document.documentElement.dataset.cardDragging) return;
      window.setTimeout(() => { delete document.documentElement.dataset.cardDragging; }, 0);
      if (candidate.kind === "folder" && candidate.folderId) {
        if (current?.targetGroup) {
          const operation = api().moveFolder(candidate.folderId, current.targetGroup);
          playGroupTransferFeedback(current.targetGroup, operation);
          void operation.then(applyFolderMutation).catch((reason) => setError(cleanErrorMessage(reason, "移动多应用卡片失败")));
        }
        else if (current?.previewOrder) void api().reorderGroupItems(String(activeSection), current.previewOrder as GroupGridItemId[]).then(setGroupGridOrders).catch((reason) => setError(cleanErrorMessage(reason, "卡片排序失败")));
        return;
      }
      if (!candidate.appId) return;
      if (candidate.sourceFolderId) {
        if (current?.targetFolderId === candidate.sourceFolderId) return;
        const target = current?.targetFolderId && current.targetFolderId !== candidate.sourceFolderId
          ? { kind: "folder" as const, folderId: current.targetFolderId }
          : current?.targetGroup
            ? { kind: "group" as const, groupId: current.targetGroup }
            : { kind: "outer" as const, groupId: String(activeSection), index: current?.previewOrder?.indexOf(candidate.itemId) };
        const operation = api().moveFolderMember({ appId: candidate.appId, sourceFolderId: candidate.sourceFolderId, target });
        if (target.kind === "group") playGroupTransferFeedback(target.groupId, operation);
        void operation.then(applyFolderMutation).catch((reason) => setError(cleanErrorMessage(reason, "移出应用失败")));
      } else if (current?.targetAppId) {
        const source = apps.find((app) => app.id === candidate.appId);
        if (source) void api().createFolder({ groupId: source.groupId, appIds: [candidate.appId, current.targetAppId] }).then(async (nextFolders) => { const nextOrders = await api().listGroupGridOrders(); setFolders(nextFolders); setGroupGridOrders(nextOrders); }).catch((reason) => setError(cleanErrorMessage(reason, "创建多应用卡片失败")));
      } else if (current?.targetFolderId) {
        const folder = folders.find((item) => item.id === current.targetFolderId);
        if (folder && !folder.appIds.includes(candidate.appId)) void api().updateFolder({ id: folder.id, appIds: [...folder.appIds, candidate.appId] }).then(async (nextFolders) => { const nextOrders = await api().listGroupGridOrders(); setFolders(nextFolders); setGroupGridOrders(nextOrders); }).catch((reason) => setError(cleanErrorMessage(reason, "加入多应用卡片失败")));
      } else if (current?.targetGroup) {
        const operation = api().setAppGroup(candidate.appId, current.targetGroup);
        playGroupTransferFeedback(current.targetGroup, operation);
        void operation.then(async (nextApps) => { const [nextFolders, nextOrders] = await Promise.all([api().listFolders(), api().listGroupGridOrders()]); setApps(nextApps); setFolders(nextFolders); setGroupGridOrders(nextOrders); }).catch((reason) => setError(cleanErrorMessage(reason, "移动应用失败")));
      } else if (current?.previewOrder) {
        void api().reorderGroupItems(String(activeSection), current.previewOrder as GroupGridItemId[]).then(setGroupGridOrders);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { resetMergeHover(); updateMergeFeedback(); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [activeSection, applyFolderMutation, apps, folders]);

  useEffect(() => {
    const cancelDrag = () => { dragCandidate.current = null; setDrag(null); };
    let frame = 0;
    let latestEvent: PointerEvent | null = null;
    const updateDrag = () => {
      frame = 0;
      const event = latestEvent;
      const candidate = dragCandidate.current;
      if (!event || !candidate) return;
      const node = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-drop-group]");
      const targetGroup = node?.dataset.dropGroup as AppGroupId | undefined;
      const app = apps.find((item) => item.id === candidate.appId);
      const cardNodes = [...document.querySelectorAll<HTMLElement>("[data-app-card-id]")];
      const cardIds = cardNodes.map((card) => card.dataset.appCardId).filter((id): id is string => Boolean(id));
      const cardRects: AppDragRect[] = cardNodes.map((card) => {
        const rect = card.getBoundingClientRect();
        return { id: card.dataset.appCardId ?? "", left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      }).filter((rect) => Boolean(rect.id));
      const canSortInCurrentGroup = !targetGroup && (activeSection === ALL_APPS_SECTION_ID || app?.groupId === activeSection) && cardIds.includes(candidate.appId);
      const previewOrder = canSortInCurrentGroup ? hitTestAppOrder(cardIds, cardRects, candidate.appId, event.clientX, event.clientY) : undefined;
      setDrag({
        appId: candidate.appId,
        x: event.clientX,
        y: event.clientY,
        grabOffsetX: candidate.grabOffsetX,
        grabOffsetY: candidate.grabOffsetY,
        width: candidate.width,
        height: candidate.height,
        targetGroup: targetGroup && app?.groupId !== targetGroup ? targetGroup : undefined,
        reorderGroupId: previewOrder ? activeSection : undefined,
        previewOrder
      });
    };
    const onMove = (event: PointerEvent) => {
      const candidate = dragCandidate.current;
      if (!candidate) return;
      if (!drag && Math.hypot(event.clientX - candidate.startX, event.clientY - candidate.startY) <= 6) return;
      latestEvent = event;
      if (!frame) frame = window.requestAnimationFrame(updateDrag);
    };
    const onUp = () => {
      const current = drag;
      const candidate = dragCandidate.current;
      dragCandidate.current = null;
      setDrag(null);
      if (current?.targetGroup) void moveAppToGroup(current.appId, current.targetGroup);
      else if (candidate && current) {
        const targetId = document.elementFromPoint(current.x, current.y)?.closest<HTMLElement>("[data-app-card-id]")?.dataset.appCardId;
        const target = targetId ? apps.find((app) => app.id === targetId) : undefined;
        const source = apps.find((app) => app.id === current.appId);
        if (target && source && target.id !== source.id && target.groupId === source.groupId) {
          void api().createFolder({ groupId: source.groupId, appIds: [source.id, target.id] }).then(setFolders).catch((reason) => setError(cleanErrorMessage(reason, "创建应用文件夹失败")));
          return;
        }
        if (current.reorderGroupId && current.previewOrder && current.previewOrder.join("\u0000") !== candidate.initialOrder.join("\u0000")) {
          void reorderAppsInGroup(current.reorderGroupId, current.previewOrder);
        }
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
        setConfirm(null);
        setEdit(null);
        setGroupEdit(null);
        setGroupDelete(null);
        cancelDrag();
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [activeSection, apps, closeMenu, drag, moveAppToGroup, reorderAppsInGroup]);

  const pageQuery = "";
  const isAllAppsSection = activeSection === ALL_APPS_SECTION_ID;
  const isAppSection = isAllAppsSection || appGroups.some((group) => group.id === activeSection);
  const activeGroupApps = useMemo(() => {
    const sectionApps = appSectionApps(activeSection, runtimeApps, preferences.allAppsView.orderedAppIds);
    return isAllAppsSection ? decorateAllAppsLaunchSelection(sectionApps, preferences.allAppsView.launchSelectedAppIds) : sectionApps;
  }, [activeSection, isAllAppsSection, preferences.allAppsView.launchSelectedAppIds, preferences.allAppsView.orderedAppIds, runtimeApps]);
  const visibleApps = useMemo(() => sortAppsForDisplay(
    activeGroupApps.filter((item) => matchesAppSearch(item, pageQuery) && (isAllAppsSection || !folders.some((folder) => folder.groupId === activeSection && folder.appIds.includes(item.id)))),
    preferences.sortRunningAppsFirst
  ), [activeGroupApps, activeSection, folders, isAllAppsSection, pageQuery, preferences.sortRunningAppsFirst]);
  const displayedApps = useMemo(() => {
    if (!drag?.previewOrder || drag.reorderGroupId !== activeSection) return visibleApps;
    const byId = new Map(visibleApps.map((app) => [app.id, app]));
    const ordered = drag.previewOrder.map((id) => byId.get(id)).filter((app): app is RuntimeApp => Boolean(app));
    const included = new Set(ordered.map((app) => app.id));
    return ordered.length ? [...ordered, ...visibleApps.filter((app) => !included.has(app.id))] : visibleApps;
  }, [activeSection, drag?.previewOrder, drag?.reorderGroupId, visibleApps]);
  const activeFolders = useMemo(() => isAllAppsSection ? [] : folders.filter((folder) => folder.groupId === activeSection), [activeSection, folders, isAllAppsSection]);
  const baseGridItemOrder = useMemo<GroupGridItemId[]>(() => {
    const valid: GroupGridItemId[] = [...visibleApps.map((app) => `app:${app.id}` as const), ...activeFolders.map((folder) => `folder:${folder.id}` as const)];
    const validSet = new Set(valid);
    const configured = groupGridOrders.find((order) => order.groupId === activeSection)?.itemIds ?? [];
    return [...configured.filter((id) => validSet.has(id)), ...valid.filter((id) => !configured.includes(id))];
  }, [activeFolders, activeSection, groupGridOrders, visibleApps]);
  const activeGridItemOrder = useMemo<GroupGridItemId[]>(() => {
    if (drag?.reorderGroupId === activeSection && drag.previewOrder) {
      return completePreviewOrder(baseGridItemOrder, drag.previewOrder);
    }
    return baseGridItemOrder;
  }, [activeSection, baseGridItemOrder, drag?.previewOrder, drag?.reorderGroupId]);
  const visibleProcesses = useMemo<DisplayProcess[]>(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    const sorted = processes
      .filter((item) => processFilter === "all" || item.isManagedApp)
      .filter((item) => matchesProcessSearch(item, pageQuery))
      .sort((a, b) => sortKey === "name" ? a.name.localeCompare(b.name) * direction : (a[sortKey] - b[sortKey]) * direction);

    if (!lockedProcessName || lockedProcessOrder.length === 0) return sorted;

    const byName = new Map(sorted.map((item) => [item.name.toLowerCase(), item as DisplayProcess]));
    if (!byName.has(lockedProcessName) && menu?.kind === "process") {
      byName.set(lockedProcessName, {
        ...menu.process,
        cpuPercent: 0,
        memoryBytes: 0,
        diskBytesPerSecond: 0,
        canTerminate: false,
        terminationBlockedReason: "进程已结束",
        isEnded: true
      });
    }

    const ordered = lockedProcessOrder.flatMap((name) => {
      const item = byName.get(name);
      if (!item) return [];
      byName.delete(name);
      return [item];
    });
    return [...ordered, ...byName.values()];
  }, [lockedProcessName, lockedProcessOrder, menu, processFilter, processes, pageQuery, sortDirection, sortKey]);
  const managedSearchResults = useMemo(() => buildInternalSearchResults(query, runtimeApps, processes).filter((result): result is Extract<InternalSearchResult, { kind: "app" }> => result.kind === "app"), [processes, query, runtimeApps]);
  const searchableAppIdentityKey = useMemo(() => buildSearchableAppIdentityKey(runtimeApps), [runtimeApps]);
  const appSearchResultCount = managedSearchResults.length + discoveredResults.length + installableResults.length;
  const searchResultCount = appSearchResultCount || searchLoading ? appSearchResultCount : fileResults.length;

  useEffect(() => {
    const trimmed = query.trim();
    setSearchSelectedIndex(0);
    if (!trimmed) {
      setDiscoveredResults([]);
      setInstallableResults([]);
      setFileResults([]);
      setSearchLoading(false);
      setSearchError("");
      return;
    }
    setSearchPanelOpen(true);
    setSearchLoading(true);
    setSearchError("");
    const requestId = ++searchRequest.current;
    const timer = window.setTimeout(() => {
      void Promise.all([api().searchAppCandidates(trimmed), api().searchInstallableApps(trimmed)]).then(([results, installable]) => {
        if (searchRequest.current !== requestId) return;
        setDiscoveredResults(results);
        setInstallableResults(installable);
        const hasManagedResults = buildInternalSearchResults(trimmed, runtimeApps, []).some((result) => result.kind === "app");
        if (results.length || installable.length || hasManagedResults) {
          setFileResults([]);
          setSearchLoading(false);
          return;
        }
        void api().searchEverything(trimmed).then((files) => {
          if (searchRequest.current !== requestId) return;
          setFileResults(files.slice(0, 20));
          setSearchLoading(false);
        }).catch((reason) => {
          if (searchRequest.current !== requestId) return;
          setFileResults([]);
          setSearchLoading(false);
          setSearchError(cleanErrorMessage(reason, "Everything 搜索失败"));
        });
      }).catch((reason) => {
        if (searchRequest.current !== requestId) return;
        setDiscoveredResults([]);
        setInstallableResults([]);
        setFileResults([]);
        setSearchLoading(false);
        setSearchError(cleanErrorMessage(reason, "搜索本机应用失败"));
      });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [query, searchableAppIdentityKey]);

  useEffect(() => {
    if (query.trim()) setSearchPanelOpen(true);
  }, [query]);

  useEffect(() => {
    if (!isAppSection) return;
    if (!visibleApps.some((app) => app.id === selectedAppId)) setSelectedAppId(visibleApps[0]?.id ?? "");
  }, [isAppSection, selectedAppId, visibleApps]);
  const draggedApp = runtimeApps.find((item) => item.id === drag?.appId);
  const draggedFolder = folders.find((item) => item.id === drag?.folderId);
  const activeGroup = groups.find((group) => group.id === activeSection);
  const pageTitle = activeSection === "processes" ? "进程监控" : isAllAppsSection ? "已添加应用" : activeSection === "settings" ? "偏好设置" : activeGroup?.name ?? "应用";
  const pageSubtitle = activeSection === "processes"
    ? `${visibleProcesses.length} 个进程正在显示`
    : isAllAppsSection
      ? `${visibleApps.length} 个应用 / ${activeGroupApps.filter((app) => app.metrics.isRunning).length} 个运行中`
      : activeSection === "settings"
        ? "管理应用分组与启动配置"
        : `${visibleApps.length} 个应用`;
  const openInternalResult = useCallback((result: Extract<InternalSearchResult, { kind: "app" }>) => {
    setSearchPanelOpen(false);
    setActiveSection(result.groupId);
    setSelectedAppId(result.id);
    setQuery("");
  }, []);

  const previewWallpaperGlassIntensity = useCallback((wallpaperGlassIntensity: WallpaperGlassIntensity) => {
    setPreferences((current) => ({ ...current, wallpaperGlassIntensity }));
  }, []);
  const pickEverythingCli = useCallback(() => {
    void api().pickEverythingCli().then(setPreferences).catch((reason) => setError(cleanErrorMessage(reason, "选择 ES.exe 失败")));
  }, []);
  const prepareSearchDependencies = useCallback(() => {
    setSearchDependencyStatus({ state: "downloading", message: "正在准备 Everything 搜索依赖" });
    void api().prepareSearchDependencies().then((status) => {
      setSearchDependencyStatus(status);
      return api().getPreferences();
    }).then(setPreferences).catch((reason) => setSearchDependencyStatus({ state: "failed", message: cleanErrorMessage(reason, "准备 Everything 搜索依赖失败") }));
  }, []);
  const processMenuItem: DisplayProcess | undefined = menu?.kind === "process"
    ? processes.find((item) => item.name.toLowerCase() === menu.process.name.toLowerCase()) ?? {
      ...menu.process,
      cpuPercent: 0,
      memoryBytes: 0,
      diskBytesPerSecond: 0,
      canTerminate: false,
      terminationBlockedReason: "进程已结束",
      isEnded: true
    }
    : undefined;

  const closeFloatingUi = useCallback(() => {
    closeMenu();
    setSearchPanelOpen(false);
  }, [closeMenu]);
  const restoreFocusAfterSearch = useCallback(() => {
    let focusAppId = selectedAppId;
    if (isAppSection && !focusAppId) {
      focusAppId = displayedApps[0]?.id ?? "";
      if (focusAppId) setSelectedAppId(focusAppId);
    }
    const selector = pageFocusSelector(activeSection, focusAppId);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    });
  }, [activeSection, displayedApps, isAppSection, selectedAppId]);
  const focusSelectorAfterRender = useCallback((selector: string) => {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    });
  }, []);
  const focusAppCardById = useCallback((sectionId: string, appId: string) => {
    searchInputRef.current?.blur();
    const selector = pageFocusSelector(sectionId, appId);
    focusSelectorAfterRender(selector);
  }, [focusSelectorAfterRender]);

  const switchSection = (id: SectionId) => {
    if (drag) return;
    if (id === "processes" && !processes.length) setProcessesLoading(true);
    setActiveSection(id);
    setQuery("");
    closeFloatingUi();
    if (id === ALL_APPS_SECTION_ID || appGroups.some((group) => group.id === id)) {
      const sectionApps = appSectionApps(id, runtimeApps, preferences.allAppsView.orderedAppIds);
      const visibleAppIds = sortAppsForDisplay(sectionApps, preferences.sortRunningAppsFirst).map((app) => app.id);
      const focusTarget = resolveSectionAppFocusTarget(id, visibleAppIds);
      setSelectedAppId(focusTarget.selectedAppId);
      focusSelectorAfterRender(focusTarget.selector);
    } else {
      setSelectedAppId("");
    }
  };
  const changeSort = (key: SortKey) => {
    closeMenu();
    if (key === sortKey) setSortDirection((value) => value === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDirection(key === "name" ? "asc" : "desc"); }
  };
  const openMenu = (next: Exclude<MenuState, null>) => {
    setMenu({ ...next, x: Math.min(next.x, window.innerWidth - 250), y: Math.min(next.y, window.innerHeight - 430) });
  };
  const openProcessMenu = (event: React.MouseEvent, process: ProcessInfo) => {
    event.preventDefault();
    event.stopPropagation();
    setLockedProcessName(process.name.toLowerCase());
    setLockedProcessOrder(visibleProcesses.map((item) => item.name.toLowerCase()));
    openMenu({ kind: "process", x: event.clientX, y: event.clientY, process });
  };
  const changeProcessFilter = (value: ProcessFilter) => {
    closeMenu();
    setProcessFilter(value);
  };
  const addApp = () => {
    const groupId = appGroups.some((group) => group.id === activeSection) ? activeSection : appGroups[0]?.id;
    if (!groupId) return;
    void runAppAction(() => api().addAppFromDialog(groupId));
  };
  const addDroppedApps = useCallback(async (filePaths: string[]) => {
    const groupId = targetDropGroupId(activeSection, appGroups.map((group) => group.id));
    if (!groupId) return;
    try {
      setError("");
      const result = await api().addDroppedExecutables(filePaths, groupId);
      setApps(result.apps);
      setNotice(dropNoticeForResult(result));
      setSearchPanelOpen(false);
      setQuery("");
      if (result.addedAppIds.length) {
        setActiveSection(groupId);
        setSelectedAppId(result.addedAppIds[0]);
        focusAppCardById(groupId, result.addedAppIds[0]);
      }
      await refreshRuntimeData(activeSection === "processes" ? "full" : "managed", true);
    } catch (reason) {
      setError(cleanErrorMessage(reason, "添加应用失败"));
    }
  }, [activeSection, appGroups, focusAppCardById, refreshRuntimeData]);
  const hasDraggedFiles = (event: React.DragEvent<HTMLElement>) => Array.from(event.dataTransfer.types).includes("Files");
  const handleFileDragEnter = (event: React.DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    fileDropDepth.current += 1;
    setFileDropActive(true);
  };
  const handleFileDragOver = (event: React.DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const handleFileDragLeave = (event: React.DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return;
    fileDropDepth.current = Math.max(0, fileDropDepth.current - 1);
    if (!fileDropDepth.current) setFileDropActive(false);
  };
  const handleFileDrop = (event: React.DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    fileDropDepth.current = 0;
    setFileDropActive(false);
    const exePaths = droppedExePaths(Array.from(event.dataTransfer.files), (file) => api().getPathForFile(file));
    if (!exePaths.length) {
      setError("请拖入 exe 程序文件");
      return;
    }
    void addDroppedApps(exePaths);
  };
  const launchApp = async (id: string) => {
    if (launchingAppIdsRef.current.has(id)) return;
    const appName = runtimeApps.find((app) => app.id === id)?.name ?? "应用";
    launchingAppIdsRef.current.add(id);
    setLaunchingAppIds(new Set(launchingAppIdsRef.current));
    try {
      setError("");
      setNotice(buildLaunchFeedbackMessage("starting", appName));
      const result = await api().launchApp(id);
      setApps(result.apps);
      if (result.status === "failed") {
        setNotice("");
        if (result.errorCode === 2 || /路径|不存在/.test(result.message ?? "")) {
          setInvalidAppIds((current) => new Set(current).add(id));
          setError(result.message || "程序路径不存在，请重新选择启动程序。");
          const app = runtimeApps.find((item) => item.id === id);
          if (app) editApp(app);
          return;
        }
        setError(result.message || "启动失败，请检查程序路径和启动参数。");
        return;
      }
      setInvalidAppIds((current) => {
        if (!current.has(id)) return current;
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      setNotice(buildLaunchFeedbackMessage(result.status, appName));
      if (result.status === "launched" || result.status === "alreadyRunning") {
        await refreshRuntimeData(activeSection === "processes" ? "full" : "managed", true);
      }
    } catch (reason) {
      setNotice("");
      setError(cleanErrorMessage(reason, "启动失败，请检查程序路径和启动参数。"));
    } finally {
      launchingAppIdsRef.current.delete(id);
      setLaunchingAppIds(new Set(launchingAppIdsRef.current));
    }
  };
  const launchFolderWithFeedback = async (folderId: string) => {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) return;
    const memberIds = folder.appIds.filter((id) => runtimeApps.some((app) => app.id === id));
    if (!memberIds.length || memberIds.some((id) => folderLaunchStatuses[id] === "queued" || folderLaunchStatuses[id] === "launching")) return;
    setExpandedFolderId("");
    for (const id of memberIds) {
      const timer = folderLaunchClearTimers.current.get(id);
      if (timer) window.clearTimeout(timer);
      folderLaunchClearTimers.current.delete(id);
      launchingAppIdsRef.current.add(id);
    }
    setLaunchingAppIds(new Set(launchingAppIdsRef.current));
    setFolderLaunchStatuses((current) => ({ ...current, ...Object.fromEntries(memberIds.map((id) => [id, "queued" as const])) }));
    try {
      setError("");
      const result = await api().launchFolder(folderId);
      setApps(result.apps);
      setFolderLaunchStatuses((current) => ({ ...current, ...Object.fromEntries(result.results.map((item) => [item.appId, item.status === "launched" ? "waiting" : item.status])) }));
      const failed = result.results.filter((item) => item.status === "failed");
      if (failed.length) setError(`${failed.length} 个应用启动失败`);
      await refreshRuntimeData(activeSection === "processes" ? "full" : "managed", true);
      for (const item of result.results) {
        const delay = item.status === "launched" ? 60000 : item.status === "failed" ? 8000 : 4200;
        folderLaunchClearTimers.current.set(item.appId, window.setTimeout(() => {
          if (item.status === "launched") {
            setFolderLaunchStatuses((current) => ({ ...current, [item.appId]: "launched" }));
            folderLaunchClearTimers.current.set(item.appId, window.setTimeout(() => {
              setFolderLaunchStatuses((current) => {
                const next = { ...current };
                delete next[item.appId];
                return next;
              });
              folderLaunchClearTimers.current.delete(item.appId);
            }, 4200));
            return;
          }
          setFolderLaunchStatuses((current) => {
            const next = { ...current };
            delete next[item.appId];
            return next;
          });
          folderLaunchClearTimers.current.delete(item.appId);
        }, delay));
      }
    } catch (reason) {
      setFolderLaunchStatuses((current) => ({ ...current, ...Object.fromEntries(memberIds.map((id) => [id, "failed" as const])) }));
      setError(cleanErrorMessage(reason, "批量启动失败"));
      for (const id of memberIds) {
        folderLaunchClearTimers.current.set(id, window.setTimeout(() => {
          setFolderLaunchStatuses((current) => {
            const next = { ...current };
            delete next[id];
            return next;
          });
          folderLaunchClearTimers.current.delete(id);
        }, 8000));
      }
    } finally {
      for (const id of memberIds) launchingAppIdsRef.current.delete(id);
      setLaunchingAppIds(new Set(launchingAppIdsRef.current));
    }
  };
  const targetSearchGroupId = () => appGroups.some((group) => group.id === activeSection)
    ? activeSection
    : activeSection === ALL_APPS_SECTION_ID
      ? appGroups[0]?.id ?? ""
      : runtimeApps.find((app) => app.id === selectedAppId)?.groupId ?? appGroups[0]?.id ?? "";
  const addDiscoveredApp = useCallback(async (candidate: DiscoveredAppCandidate, launchAfterAdd = false) => {
    if (candidate.alreadyAdded && candidate.existingAppId) {
      const existing = runtimeApps.find((app) => app.id === candidate.existingAppId);
      if (existing) openInternalResult({ kind: "app", id: existing.id, name: existing.name, groupId: existing.groupId, processName: existing.processName, isRunning: existing.metrics.isRunning });
      return;
    }
    const groupId = targetSearchGroupId();
    if (!groupId) return;
    try {
      setError("");
      const result = await api().addDiscoveredCandidate(candidate.id, groupId);
      setApps(result.apps);
      if (result.appId) {
        setActiveSection(groupId);
        setSelectedAppId(result.appId);
      }
      setDiscoveredResults((current) => current.map((item) => item.id === candidate.id ? { ...item, alreadyAdded: true, existingAppId: result.appId, existingGroupId: groupId } : item));
      setNotice(result.alreadyAdded ? "已添加" : `已添加 ${candidate.name}`);
      setSearchPanelOpen(false);
      setQuery("");
      if (shouldFocusAddedApp(result) && result.appId) focusAppCardById(groupId, result.appId);
      if (launchAfterAdd && result.appId) await launchApp(result.appId);
    } catch (reason) {
      setError(cleanErrorMessage(reason, "添加失败"));
    }
  }, [activeSection, appGroups, focusAppCardById, openInternalResult, runtimeApps, selectedAppId]);
  const focusAppWindow = async (app: RuntimeApp) => {
    const requestId = ++focusRequestSeq.current;
    try {
      setError("");
      const result = await api().focusAppWindow(app.id, focusHintsForApp(app));
      if (requestId !== focusRequestSeq.current) return;
      const message = focusResultMessage(result);
      if (message) setNotice(message);
    } catch (reason) {
      if (requestId === focusRequestSeq.current) setError(cleanErrorMessage(reason, "唤起应用窗口失败"));
    }
  };
  const runManagedSearchResult = useCallback((result: Extract<InternalSearchResult, { kind: "app" }>) => {
    const app = runtimeApps.find((item) => item.id === result.id);
    setSearchPanelOpen(false);
    setQuery("");
    setActiveSection(result.groupId);
    setSelectedAppId(result.id);
    if (!app) return;
    if (app.metrics.isRunning) void focusAppWindow(app);
    else void launchApp(app.id);
  }, [runtimeApps]);
  const openFileSearchResult = useCallback((result: EverythingSearchResult) => {
    setSearchPanelOpen(false);
    void api().openSearchResult(result.path).catch((reason) => setError(cleanErrorMessage(reason, "打开搜索结果失败")));
  }, []);
  const openInstallableSearchResult = useCallback((result: InstallableAppCandidate) => {
    setSearchPanelOpen(false);
    setQuery("");
    setNotice(`已打开 ${result.name} 下载页`);
    void api().openInstallableAppDownload(result.id).catch((reason) => setError(cleanErrorMessage(reason, "打开下载页失败")));
  }, []);
  const openSelectedSearchResult = useCallback((launchAfterAdd = false) => {
    if (!query.trim()) return;
    if (searchSelectedIndex < managedSearchResults.length) {
      runManagedSearchResult(managedSearchResults[searchSelectedIndex]);
      return;
    }
    const discoveredIndex = searchSelectedIndex - managedSearchResults.length;
    if (discoveredIndex >= 0 && discoveredIndex < discoveredResults.length) {
      const discovered = discoveredResults[discoveredIndex];
      if (discovered) void addDiscoveredApp(discovered, launchAfterAdd);
      return;
    }
    const installableIndex = discoveredIndex - discoveredResults.length;
    if (installableIndex >= 0 && installableIndex < installableResults.length) {
      const installable = installableResults[installableIndex];
      if (installable) openInstallableSearchResult(installable);
      return;
    }
    const action = resolveSearchResultAction({ managedCount: 0, discoveredCount: 0, fileCount: fileResults.length, selectedIndex: searchSelectedIndex });
    if (action.kind === "open-file") {
      const file = fileResults[action.index];
      if (file) openFileSearchResult(file);
    }
  }, [addDiscoveredApp, discoveredResults, fileResults, installableResults, managedSearchResults, openFileSearchResult, openInstallableSearchResult, query, runManagedSearchResult, searchSelectedIndex]);
  const handleAppSelection = (app: RuntimeApp) => {
    setSelectedAppId(app.id);
  };
  const handleLaunchingFeedback = (app: RuntimeApp) => {
    setNotice(buildLaunchFeedbackMessage("starting", app.name));
  };
  const toggleAppLaunchSelected = async (app: RuntimeApp) => {
    try {
      setError("");
      if (isAllAppsSection) {
        const allAppsView = {
          ...preferences.allAppsView,
          launchSelectedAppIds: allAppsSelection(preferences.allAppsView.launchSelectedAppIds, app.id, !app.launchSelected)
        };
        setPreferences(await api().updatePreferences({ allAppsView }));
        return;
      }
      setApps(await api().setAppLaunchSelected(app.id, !app.launchSelected));
    } catch (reason) {
      setError(cleanErrorMessage(reason, "勾选状态保存失败"));
    }
  };
  const launchSelectedApps = async () => {
    if (isAllAppsSection) {
      const selectedIds = new Set(preferences.allAppsView.launchSelectedAppIds);
      const selected = activeGroupApps.filter((app) => selectedIds.has(app.id));
      if (!selected.length) return;
      for (const app of selected) await launchApp(app.id);
      return;
    }
    if (!activeGroup || activeGroup.isSystem) return;
    try {
      setError("");
      setNotice("");
      const result = await api().launchSelectedApps(activeGroup.id);
      setApps(result.apps);
      await refreshRuntimeData("managed", true);
      const counts = result.results.reduce((summary, item) => {
        summary[item.status] = (summary[item.status] ?? 0) + 1;
        return summary;
      }, {} as Record<string, number>);
      const parts = [
        counts.launched ? `已启动 ${counts.launched} 个` : "",
        counts.alreadyRunning ? `已在运行 ${counts.alreadyRunning} 个` : "",
        counts.cancelled ? `已取消 ${counts.cancelled} 个` : "",
        counts.failed ? `失败 ${counts.failed} 个` : ""
      ].filter(Boolean);
      setNotice(parts.join("，") || "没有需要启动的应用");
      const failures = result.results.filter((item) => item.status === "failed");
      if (failures.length) setError(failures.map((item) => `${item.name}：${item.message || "启动失败"}`).join("；"));
    } catch (reason) {
      setError(cleanErrorMessage(reason, "一键启动失败"));
    }
  };
  const requestCloseGroupApps = async () => {
    if (isAllAppsSection) {
      try {
        setError("");
        const snapshot = await api().getRuntimeSnapshot("managed", true);
        setApps(snapshot.apps);
        setMetrics(snapshot.metrics);
        const runningIds = new Set(snapshot.metrics.filter((metric) => metric.isRunning).map((metric) => metric.appId));
        const runningApps = snapshot.apps.filter((app) => runningIds.has(app.id));
        if (!runningApps.length) {
          setNotice("没有运行中的已添加应用");
          return;
        }
        setConfirm({
          title: "关闭全部已添加应用",
          message: `将结束 ${runningApps.length} 个应用：${runningApps.map((app) => app.name).join("、")}。是否继续？`,
          confirmLabel: "关闭全部",
          onConfirm: async () => {
            for (const app of runningApps) await api().killApp(app.id);
            await refreshRuntimeData("managed", true);
            setNotice(`已关闭 ${runningApps.length} 个应用`);
          }
        });
      } catch (reason) {
        setError(cleanErrorMessage(reason, "读取运行状态失败"));
      }
      return;
    }
    if (!activeGroup || activeGroup.isSystem) return;
    try {
      setError("");
      const snapshot = await api().getRuntimeSnapshot("managed", true);
      setApps(snapshot.apps);
      setMetrics(snapshot.metrics);
      const runningIds = new Set(snapshot.metrics.filter((metric) => metric.isRunning).map((metric) => metric.appId));
      const runningApps = snapshot.apps.filter((app) => app.groupId === activeGroup.id && runningIds.has(app.id));
      if (!runningApps.length) {
        setNotice("当前分组没有运行中的应用");
        return;
      }
      setConfirm({
        title: "关闭当前分组全部应用",
        message: `将结束 ${runningApps.length} 个应用：${runningApps.map((app) => app.name).join("、")}。是否继续？`,
        confirmLabel: "关闭全部",
        onConfirm: async () => {
          const result = await api().killGroupApps(activeGroup.id);
          setApps(result.apps);
          await refreshRuntimeData("managed", true);
          const stopped = result.results.filter((item) => item.status === "terminated").length;
          const remaining = result.results.filter((item) => item.status !== "terminated");
          setNotice(`已关闭 ${stopped} 个应用`);
          if (remaining.length) setError(remaining.map((item) => `${item.name}：${item.message || "结束失败"}`).join("；"));
        }
      });
    } catch (reason) {
      setError(cleanErrorMessage(reason, "读取分组运行状态失败"));
    }
  };
  const editApp = (app: AppEntry) => setEdit({ id: app.id, name: app.name, executablePath: app.executablePath, launchArgs: app.launchArgs ?? "" });
  const runKeyboardAppAction = useCallback((app: RuntimeApp, command: "activate" | "toggleLaunch" | "menu" | "edit", menuPosition?: { x: number; y: number }) => {
    const action = command === "activate" ? resolveAppKeyboardAction({
      isRunning: app.metrics.isRunning,
      isLaunching: launchingAppIdsRef.current.has(app.id),
      isInvalid: invalidAppIds.has(app.id)
    }, "Enter") : command === "toggleLaunch" ? "toggle-launch-selected" : command === "menu" ? "context-menu" : "edit";
    if (action === "launching-feedback") handleLaunchingFeedback(app);
    else if (action === "focus") void focusAppWindow(app);
    else if (action === "launch") void launchApp(app.id);
    else if (action === "toggle-launch-selected") void toggleAppLaunchSelected(app);
    else if (action === "context-menu") openMenu({ kind: "app", x: menuPosition?.x ?? window.innerWidth / 2, y: menuPosition?.y ?? window.innerHeight / 2, appId: app.id });
    else if (action === "edit") editApp(app);
  }, [focusAppWindow, invalidAppIds, toggleAppLaunchSelected]);  const saveGroup = async (input: GroupInput & { id?: string }) => {
    try {
      setError("");
      const next = input.id
        ? await api().updateGroup({ id: input.id, name: input.name, icon: input.icon })
        : await api().createGroup({ name: input.name, icon: input.icon });
      setGroups(next);
      setGroupEdit(null);
    } catch (reason) {
      throw new Error(cleanErrorMessage(reason, "保存分组失败"));
    }
  };
  const reorderGroups = async (ids: string[]) => {
    try { setGroups(await api().reorderGroups(ids)); return true; }
    catch (reason) { setError(cleanErrorMessage(reason, "分组排序失败")); return false; }
  };
  const removeGroup = async () => {
    if (!groupDelete) return;
    try {
      const result = await api().removeGroup(groupDelete.groupId, groupDelete.targetGroupId);
      setGroups(result.groups);
      setApps(result.apps);
      setGroupDelete(null);
      if (activeSection === groupDelete.groupId) {
        setActiveSection(result.targetGroupId);
        setSelectedAppId(result.apps.find((item) => item.groupId === result.targetGroupId)?.id ?? "");
      }
    } catch (reason) {
      setError(cleanErrorMessage(reason, "删除分组失败"));
    }
  };
  const requestDeleteGroup = (groupId: string) => {
    const target = appGroups.find((group) => group.id !== groupId);
    if (!target) { setError("至少需要保留一个应用分组"); return; }
    closeMenu();
    setGroupDelete({ groupId, targetGroupId: target.id });
  };

  useEffect(() => {
    const selectedApp = displayedApps.find((app) => app.id === selectedAppId) ?? displayedApps[0];
    const hasModal = Boolean(confirm || edit || groupEdit || groupDelete || importCandidates.length);
    const selectedCardRect = () => {
      const element = selectedApp ? document.querySelector<HTMLElement>(`[data-app-card-id="${CSS.escape(selectedApp.id)}"]`) : null;
      return element?.getBoundingClientRect();
    };
    const closeTopLayer = () => {
      if (searchPanelOpen) { setSearchPanelOpen(false); return true; }
      if (menu) { closeMenu(); return true; }
      if (confirm) { setConfirm(null); return true; }
      if (edit) { setEdit(null); return true; }
      if (groupEdit) { setGroupEdit(null); return true; }
      if (groupDelete) { setGroupDelete(null); return true; }
      return false;
    };
    const appCardRects = () => [...document.querySelectorAll<HTMLElement>("[data-app-card-id]")].map((element): AppCardRect => {
      const bounds = element.getBoundingClientRect();
      return {
        id: element.dataset.appCardId ?? "",
        left: bounds.left,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height
      };
    }).filter((item) => item.id);
    const switchRelativeGroup = (direction: "previous" | "next") => {
      const groupIds = navigationSectionIds(appGroups);
      const nextGroup = pickRelativeGroup(groupIds, activeSection, direction);
      if (nextGroup && nextGroup !== activeSection) switchSection(nextGroup);
    };
    const switchIndexedAppGroup = (index: number) => {
      const nextGroup = pickIndexedGroup(appGroups.map((group) => group.id), index);
      if (nextGroup && nextGroup !== activeSection) switchSection(nextGroup);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const command = findAppShortcut(preferences.keyboardShortcuts, event);
      if (command === "cancel") {
        if (closeTopLayer()) { event.preventDefault(); return; }
        if (query) { event.preventDefault(); setQuery(""); setSearchPanelOpen(false); return; }
        if (expandedFolderId) { event.preventDefault(); setExpandedFolderId(""); return; }
        if (isAppSection && selectedAppId) { event.preventDefault(); setSelectedAppId(""); }
        return;
      }
      if (command === "search" && !hasModal && !isTextInputTarget(event.target)) { event.preventDefault(); searchInputRef.current?.focus(); return; }
      const groupIndex = command?.startsWith("group") ? Number(command.slice(5)) - 1 : null;
      if (groupIndex !== null && !hasModal && !menu && !isTextInputTarget(event.target)) { event.preventDefault(); switchIndexedAppGroup(groupIndex); return; }
      const groupDirection = command === "previousGroup" ? "previous" : command === "nextGroup" ? "next" : null;
      if (groupDirection && !hasModal && !menu && !isTextInputTarget(event.target)) { event.preventDefault(); groupNavigationBlockKeyRef.current = keyboardBlockKeyFromEventLike(event); switchRelativeGroup(groupDirection); return; }
      if (shouldSuppressNavigationAfterGroupMove(groupNavigationBlockKeyRef.current, event)) { event.preventDefault(); return; }
      if (!isAppSection || hasModal || menu || isTextInputTarget(event.target) || !isAppKeyboardScope(event.target)) return;
      const direction = command === "up" || command === "down" || command === "left" || command === "right" ? command : null;
      if (direction) {
        event.preventDefault();
        const cards = appCardRects();
        const nextId = selectedApp ? pickDirectionalApp(cards, selectedApp.id, direction) : cards[0]?.id ?? "";
        if (nextId) { setSelectedAppId(nextId); document.querySelector<HTMLElement>(`[data-app-card-id="${CSS.escape(nextId)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" }); }
        return;
      }
      if (!selectedApp) return;
      if (command === "activate" || command === "toggleLaunch" || command === "edit") { event.preventDefault(); runKeyboardAppAction(selectedApp, command); }
      else if (command === "menu") { event.preventDefault(); const rect = selectedCardRect(); runKeyboardAppAction(selectedApp, "menu", { x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2, y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2 }); }
    };    const onKeyUp = (event: KeyboardEvent) => {
      if (groupNavigationBlockKeyRef.current === keyboardBlockKeyFromEventLike(event)) groupNavigationBlockKeyRef.current = null;
    };
    const onNativeGroupNavigation = (event: Event) => {
      if (hasModal || menu) return;
      const direction = (event as CustomEvent<"previous" | "next">).detail;
      if (direction === "previous" || direction === "next") switchRelativeGroup(direction);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("start-engineer:group-navigation", onNativeGroupNavigation);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("start-engineer:group-navigation", onNativeGroupNavigation);
    };
  }, [activeSection, appGroups, closeMenu, confirm, displayedApps, edit, expandedFolderId, groupDelete, groupEdit, importCandidates.length, isAppSection, menu, preferences.keyboardShortcuts, query, runKeyboardAppAction, searchPanelOpen, selectedAppId]);

  return (
    <main className={`app-shell drag-region ${fileDropActive ? "file-drop-active" : ""}`} style={themeAttributes.wallpaperStyle as React.CSSProperties} data-theme={themeAttributes.theme} data-wallpaper-intensity={themeAttributes.wallpaperIntensity} data-wallpaper-variant={themeAttributes.wallpaperVariant} data-ui-card-size={preferences.uiLayout.cardSize} data-ui-grid-density={preferences.uiLayout.gridDensity} data-ui-sidebar-width={preferences.uiLayout.sidebarWidth} data-ui-brand-icon-size={preferences.uiLayout.brandIconSize} data-ui-background-tone={preferences.uiLayout.backgroundTone} data-ui-show-running-status={preferences.uiLayout.showRunningStatus ? "true" : "false"} data-ui-show-search-bar={preferences.uiLayout.showSearchBar ? "true" : "false"} data-ui-show-batch-actions={preferences.uiLayout.showBatchActions ? "true" : "false"} onPointerDown={closeFloatingUi} onDragEnter={handleFileDragEnter} onDragOver={handleFileDragOver} onDragLeave={handleFileDragLeave} onDrop={handleFileDrop}>
      <aside className="sidebar no-drag">
        <div className="brand-icon" aria-hidden="true"><BrandLogo /></div>
        <nav className="nav">
          {groups.filter((group) => group.id === "processes").map((group) => <button key={group.id} className={`nav-button ${activeSection === group.id ? "active" : ""}`} onClick={() => switchSection(group.id)}>
            <Icon name={group.icon} /><span>{group.name}</span>
          </button>)}
          <button className={`nav-button ${activeSection === ALL_APPS_SECTION_ID ? "active" : ""}`} onClick={() => switchSection(ALL_APPS_SECTION_ID)}>
            <Icon name="grid" /><span>已添加应用</span>
          </button>
          <div className="nav-divider" aria-hidden="true" />
          {groups.filter((group) => !group.isSystem).map((group) => {
            const acceptsDrop = !group.isSystem;
            const sourceGroup = draggedApp?.groupId;
            return <button key={group.id} data-drop-group={acceptsDrop ? group.id : undefined} className={`nav-button ${activeSection === group.id ? "active" : ""} ${drag && acceptsDrop ? "drop-ready" : ""} ${drag?.targetGroup === group.id ? "drop-active" : ""} ${drag && sourceGroup === group.id ? "drop-disabled" : ""}`} onClick={() => switchSection(group.id)} onContextMenu={(event) => { if (group.isSystem) return; event.preventDefault(); event.stopPropagation(); openMenu({ kind: "group", x: event.clientX, y: event.clientY, groupId: group.id }); }}>
              <Icon name={group.icon} /><span>{drag?.targetGroup === group.id ? `移动到${group.name}` : group.name}</span>
            </button>;
          })}
        </nav>
        <button className={`nav-button settings ${activeSection === "settings" ? "active" : ""}`} onClick={() => switchSection("settings")}><Icon name="settings" /><span>设置</span></button>
      </aside>

      <section className="window">
        <header className="topbar">
          <div className="page-heading"><span>{pageSubtitle}</span><h1>{pageTitle}</h1></div>
          <section className="searchbar no-drag" onPointerDown={(event) => event.stopPropagation()}><label><Icon name="search" /><input ref={searchInputRef} value={query} onFocus={() => { closeMenu(); if (query.trim()) setSearchPanelOpen(true); }} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setSearchPanelOpen(Boolean(query.trim())); setSearchSelectedIndex((index) => Math.min(index + 1, Math.max(0, searchResultCount - 1))); } else if (event.key === "ArrowUp") { event.preventDefault(); setSearchPanelOpen(Boolean(query.trim())); setSearchSelectedIndex((index) => Math.max(0, index - 1)); } else if (event.key === "Enter") { event.preventDefault(); openSelectedSearchResult(event.ctrlKey || event.metaKey); } else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); const action = resolveSearchEscapeAction(true, query); if (action === "clear-query") { setQuery(""); setDiscoveredResults([]); setInstallableResults([]); setFileResults([]); setSearchSelectedIndex(0); setSearchPanelOpen(false); } else { event.currentTarget.blur(); setSearchPanelOpen(false); restoreFocusAfterSearch(); } } }} onChange={(event) => setQuery(event.target.value)} placeholder={SEARCH_INPUT_PLACEHOLDER} /></label><button className={`search-button ${query ? "clear" : ""}`} onClick={() => { closeMenu(); if (query) { setQuery(""); setInstallableResults([]); setFileResults([]); setSearchPanelOpen(false); } else searchInputRef.current?.focus(); }} aria-label={query ? "清除搜索" : "聚焦搜索框"}>{query ? "×" : <Icon name="search" />}</button>{searchPanelOpen && query.trim() ? <SearchResultsPanel query={query} loading={searchLoading} error={searchError} selectedIndex={searchSelectedIndex} managedResults={managedSearchResults} discoveredResults={discoveredResults} installableResults={installableResults} fileResults={fileResults} onSelectIndex={setSearchSelectedIndex} onOpenManaged={runManagedSearchResult} onAddDiscovered={(candidate) => void addDiscoveredApp(candidate)} onOpenInstallable={openInstallableSearchResult} onOpenFile={openFileSearchResult} /> : null}</section>
          <div className="window-controls no-drag">
            <button title="最小化" aria-label="最小化" onClick={() => void api().windowAction("minimize")}>−</button>
            <button title="最大化或还原" aria-label="最大化或还原" onClick={() => void api().windowAction("maximize")}>□</button>
            <button title="关闭" aria-label="关闭" className="close" onClick={() => void api().windowAction("close")}>×</button>
          </div>
        </header>

        {activeSection === "processes" ? <ProcessPage processes={visibleProcesses} loading={processesLoading} lockedProcessName={lockedProcessName} sortKey={sortKey} sortDirection={sortDirection} changeSort={changeSort} filter={processFilter} setFilter={changeProcessFilter} onContextMenu={openProcessMenu} />
          : activeSection === "settings" ? <SettingsPage apps={runtimeApps} groups={appGroups} preferences={preferences} onPreferencesChange={savePreferences} onWallpaperIntensityPreview={previewWallpaperGlassIntensity} onThemeChange={saveTheme} onPickEverythingCli={pickEverythingCli} onAdd={addApp} onAddToGroup={(groupId) => void runAppAction(() => api().addAppFromDialog(groupId))} onCreate={() => setGroupEdit({ name: "", icon: "grid" })} onEdit={(group) => setGroupEdit({ id: group.id, name: group.name, icon: group.icon })} onDelete={requestDeleteGroup} onReorder={reorderGroups} onOpenApp={(app) => { setActiveSection(app.groupId); setSelectedAppId(app.id); }} onAppContextMenu={(event, app) => { event.preventDefault(); event.stopPropagation(); openMenu({ kind: "app", x: event.clientX, y: event.clientY, appId: app.id }); }} onMoveApp={moveAppWithinSettings} />
          : <GroupPage apps={displayedApps} folders={folders.filter((folder) => folder.groupId === activeSection)} launchingAppIds={launchingAppIds} selectedAppId={selectedAppId} invalidAppIds={invalidAppIds} draggingAppId={drag?.appId} selectedCount={activeGroupApps.filter((app) => app.launchSelected).length} runningCount={activeGroupApps.filter((app) => app.metrics.isRunning).length} showAppNames={preferences.uiLayout.showAppNames} onSelectApp={handleAppSelection} onFocusApp={(app) => void focusAppWindow(app)} onLaunchApp={(app) => void launchApp(app.id)} onLaunchingFeedback={handleLaunchingFeedback} onToggleLaunchSelected={toggleAppLaunchSelected} onLaunchSelected={() => void launchSelectedApps()} onCloseAll={() => void requestCloseGroupApps()} onAdd={addApp} onContextMenu={(event, app) => { event.preventDefault(); event.stopPropagation(); if (!drag) openMenu({ kind: "app", x: event.clientX, y: event.clientY, appId: app.id }); }} onPointerDown={(event, app) => { if (event.button !== 0) return; const rect = event.currentTarget.getBoundingClientRect(); dragCandidate.current = { appId: app.id, sourceGroupId: app.groupId, startX: event.clientX, startY: event.clientY, grabOffsetX: event.clientX - rect.left, grabOffsetY: event.clientY - rect.top, width: rect.width, height: rect.height, initialOrder: displayedApps.map((item) => item.id) }; }} onRequestClose={requestCloseApp} onFolderDrop={(folderId) => { const appId = drag?.appId; const folder = folders.find((item) => item.id === folderId); if (!appId || !folder || folder.appIds.includes(appId)) return; void api().updateFolder({ id: folderId, appIds: [...folder.appIds, appId] }).then(setFolders); }} onLaunchFolder={(folderId) => void api().launchFolder(folderId).then((result) => { setApps(result.apps); setNotice(`已处理 ${result.results.length} 个应用`); })} />}
        {isAppSection && !isAllAppsSection ? <UnifiedGroupPage apps={visibleApps} allApps={runtimeApps} folders={activeFolders} itemOrder={activeGridItemOrder} expandedFolderId={expandedFolderId} launchingAppIds={launchingAppIds} folderLaunchStatuses={folderLaunchStatuses} selectedAppId={selectedAppId} invalidAppIds={invalidAppIds} draggingItemId={drag?.itemId} selectedCount={activeGroupApps.filter((app) => app.launchSelected).length} runningCount={activeGroupApps.filter((app) => app.metrics.isRunning).length} showAppNames={preferences.uiLayout.showAppNames} onSelectApp={handleAppSelection} onFocusApp={(app) => void focusAppWindow(app)} onLaunchApp={(app) => void launchApp(app.id)} onLaunchingFeedback={handleLaunchingFeedback} onToggleLaunchSelected={toggleAppLaunchSelected} onLaunchSelected={() => void launchSelectedApps()} onCloseAll={() => void requestCloseGroupApps()} onAdd={addApp} onContextMenu={(event, app) => { event.preventDefault(); event.stopPropagation(); if (!drag) openMenu({ kind: "app", x: event.clientX, y: event.clientY, appId: app.id }); }} onAppPointerDown={(event, app, sourceFolderId) => { if (event.button !== 0) return; const rect = event.currentTarget.getBoundingClientRect(); unifiedDragCandidate.current = { kind: "app", appId: app.id, sourceFolderId, itemId: `app:${app.id}`, startX: event.clientX, startY: event.clientY, grabOffsetX: event.clientX - rect.left, grabOffsetY: event.clientY - rect.top, width: rect.width, height: rect.height }; }} onFolderPointerDown={(event, folder) => { if (event.button !== 0) return; const rect = event.currentTarget.getBoundingClientRect(); unifiedDragCandidate.current = { kind: "folder", folderId: folder.id, itemId: `folder:${folder.id}`, startX: event.clientX, startY: event.clientY, grabOffsetX: event.clientX - rect.left, grabOffsetY: event.clientY - rect.top, width: rect.width, height: rect.height }; }} onToggleFolder={(folderId) => { if (document.documentElement.dataset.cardDragging) return; setExpandedFolderId((current) => current === folderId ? "" : folderId); }} onLaunchFolder={(folderId) => { void launchFolderWithFeedback(folderId); }} onRequestClose={requestCloseApp} /> : null}
        {notice || error ? <ToastStack notice={notice} error={error} onDismissNotice={() => setNotice("")} onDismissError={() => setError("")} /> : null}
      </section>

      {menu?.kind === "process" && processMenuItem ? <ProcessContextMenu state={menu} process={processMenuItem} onClose={closeMenu} onConfirm={setConfirm} onError={setError} /> : null}
      {menu?.kind === "app" ? <AppContextMenu state={menu} app={runtimeApps.find((item) => item.id === menu.appId)} groups={appGroups} onClose={closeMenu} onLaunch={launchApp} onKill={requestCloseApp} onEdit={editApp} onMove={activeSection === "settings" ? moveAppWithinSettings : moveAppToGroup} onRemove={(app) => setConfirm({ title: "移除应用", message: `确定从 Start Engineer 中移除 ${app.name} 吗？本地程序文件不会被删除。`, confirmLabel: "移除应用", onConfirm: async () => { await runAppAction(() => api().removeApp(app.id)); setSelectedAppId(""); } })} onNotice={setNotice} onError={setError} /> : null}
      {menu?.kind === "group" ? <GroupContextMenu state={menu} groups={appGroups} onClose={closeMenu} onCreate={() => setGroupEdit({ name: "", icon: "grid" })} onEdit={(group) => setGroupEdit({ id: group.id, name: group.name, icon: group.icon })} onDelete={requestDeleteGroup} onReorder={reorderGroups} /> : null}
      {confirm ? <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} onError={(message) => { setConfirm(null); setError(cleanErrorMessage(message)); }} /> : null}
      {importCandidates.length ? <FirstRunImportDialog candidates={importCandidates} selectedIds={selectedImportIds} busy={importingApps} onToggle={(id) => setSelectedImportIds((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; })} onSkip={dismissFirstRunImport} onImport={importSelectedApps} /> : null}
      {edit ? <AppEditDialog state={edit} onClose={() => setEdit(null)} onPickExecutable={(id) => api().pickExecutable(id)} onSave={(input) => runAppAction(() => api().updateApp(input))} /> : null}
      {groupEdit ? <GroupEditDialog state={groupEdit} onClose={() => setGroupEdit(null)} onSave={saveGroup} /> : null}
      {groupDelete ? <GroupDeleteDialog state={groupDelete} groups={appGroups} appCount={apps.filter((item) => item.groupId === groupDelete.groupId).length} onChangeTarget={(targetGroupId) => setGroupDelete({ ...groupDelete, targetGroupId })} onClose={() => setGroupDelete(null)} onConfirm={removeGroup} /> : null}
      {drag && draggedApp ? <div className={`drag-preview app-card-drag-preview no-drag ${drag.mergeCandidateTarget ? `${drag.targetAppId || drag.targetFolderId ? "merge-preview-ready" : "merge-preview-pending"} ${drag.mergeCandidateTarget.kind === "folder" ? "merge-preview-folder" : ""}` : ""}`} style={{ left: drag.x - drag.grabOffsetX, top: drag.y - drag.grabOffsetY, width: drag.width, height: drag.height }}>{draggedApp.iconDataUrl ? <img src={draggedApp.iconDataUrl} alt="" /> : <Icon name="grid" />}<span>{draggedApp.name}</span></div> : null}
      {drag && draggedFolder ? <div className="drag-preview app-card-drag-preview folder-drag-preview no-drag" style={{ left: drag.x - drag.grabOffsetX, top: drag.y - drag.grabOffsetY, width: drag.width, height: drag.height }}><div>{draggedFolder.appIds.map((id) => runtimeApps.find((app) => app.id === id)).filter((app): app is RuntimeApp => Boolean(app)).map((app) => app.iconDataUrl ? <img key={app.id} src={app.iconDataUrl} alt="" /> : <Icon key={app.id} name="grid" />)}</div><span>{draggedFolder.name}</span></div> : null}
      {fileDropActive ? <div className="file-drop-overlay no-drag"><span>松开添加到当前分组</span></div> : null}
    </main>
  );
}

function ToastStack({ notice, error, onDismissNotice, onDismissError }: { notice: string; error: string; onDismissNotice: () => void; onDismissError: () => void }) {
  const stop = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  return <div className="toast-stack no-drag" onPointerDown={stop} onClick={stop}>
    {notice ? <div className="toast info" role="status"><span>{notice}</span><button type="button" aria-label="关闭提示" onClick={onDismissNotice}>×</button></div> : null}
    {error ? <div className="toast" role="alert"><span>{error}</span><button type="button" aria-label="关闭错误" onClick={onDismissError}>×</button></div> : null}
  </div>;
}

function FirstRunImportDialog({ candidates, selectedIds, busy, onToggle, onSkip, onImport }: { candidates: DiscoveredAppCandidate[]; selectedIds: Set<string>; busy: boolean; onToggle: (id: string) => void; onSkip: () => void; onImport: () => void }) {
  const sourceLabel = (source: DiscoveredAppCandidate["source"]) => source === "desktop" ? "桌面" : "开始菜单";
  return <div className="modal-backdrop no-drag"><section className="dialog import-dialog" onPointerDown={(event) => event.stopPropagation()}><div className="import-heading"><span className="import-spark">✦</span><div><h2>发现可导入应用</h2><p>选择要加入 Start Engineer 的应用。</p></div></div><div className="import-list">{candidates.map((candidate) => <button key={candidate.id} className={`import-row ${selectedIds.has(candidate.id) ? "selected" : ""}`} onClick={() => onToggle(candidate.id)}><span className="import-check">{selectedIds.has(candidate.id) ? "✓" : ""}</span><span><strong>{candidate.name}</strong><small>{candidate.category} · {sourceLabel(candidate.source)}</small></span></button>)}</div><div className="dialog-actions"><button className="ghost" disabled={busy} onClick={onSkip}>跳过</button><button className="launch" disabled={busy || selectedIds.size === 0} onClick={onImport}>{busy ? "导入中..." : `导入 ${selectedIds.size} 个`}</button></div></section></div>;
}

function ProcessContextMenu({ state, process, onClose, onConfirm, onError }: { state: Extract<MenuState, { kind: "process" }>; process: DisplayProcess; onClose: () => void; onConfirm: (value: ConfirmState) => void; onError: (message: string) => void }) {
  const item = process;
  const copy = async (value: string) => { try { await api().writeClipboardText(value); onClose(); } catch (reason) { onError(reason instanceof Error ? reason.message : "复制失败"); } };
  return <ContextMenu x={state.x} y={state.y} onClose={onClose}><div className="process-menu-header"><strong>{item.name}</strong><span>{item.isEnded ? "进程已结束" : `${item.processCount} 个进程`}</span></div><MenuDivider /><MenuButton disabled={!item.canTerminate || item.isEnded} title={item.terminationBlockedReason} danger onClick={() => { onClose(); onConfirm({ title: "结束进程组", message: `确定结束 ${item.name} 的 ${item.pids.length} 个进程吗？`, confirmLabel: "结束进程组", onConfirm: () => api().killProcessGroup({ name: item.name, pids: item.pids }) }); }}>结束进程组</MenuButton><MenuButton disabled={!item.exePath} onClick={() => { onClose(); if (item.exePath) void api().showItemInFolder(item.exePath).catch((reason) => onError(reason.message)); }}>打开文件所在位置</MenuButton><MenuDivider /><MenuButton onClick={() => void copy(item.name)}>复制进程名称</MenuButton><MenuButton disabled={!item.exePath} onClick={() => item.exePath && void copy(item.exePath)}>复制文件路径</MenuButton><MenuButton disabled={item.isEnded} onClick={() => void copy(item.pids.join(", "))}>复制 PID</MenuButton></ContextMenu>;
}

export function AppContextMenu({ state, app, groups, onClose, onLaunch, onKill, onEdit, onMove, onRemove, onNotice, onError }: { state: Extract<MenuState, { kind: "app" }>; app?: RuntimeApp; groups: AppGroup[]; onClose: () => void; onLaunch: (id: string) => void; onKill: (app: RuntimeApp) => void; onEdit: (app: RuntimeApp) => void; onMove: (id: string, group: AppGroupId) => Promise<void>; onRemove: (app: RuntimeApp) => void; onNotice: (message: string) => void; onError: (message: string) => void }) {
  const [windows, setWindows] = useState<AppWindowInfo[] | null>(null);
  const windowDependencyKey = app ? [
    app.id,
    app.metrics.isRunning,
    app.metrics.pids.join(","),
    app.metrics.matchedPids.join(","),
    app.metrics.associatedPids.join(","),
    app.metrics.matchedProcessNames.join(","),
    app.metrics.matchedPaths.join(",")
  ].join("|") : "";

  useEffect(() => {
    let cancelled = false;
    setWindows(null);
    if (!app?.metrics.isRunning) return;
    void api().listAppWindows(app.id, focusHintsForApp(app))
      .then((items) => { if (!cancelled) setWindows(items); })
      .catch(() => { if (!cancelled) setWindows([]); });
    return () => { cancelled = true; };
  }, [windowDependencyKey]);

  if (!app) return null;
  const invoke = (action: () => void) => { onClose(); action(); };
  const focusWindow = async (handle: number) => {
    try {
      const result = await api().focusAppWindowHandle(app.id, handle, focusHintsForApp(app));
      const message = focusResultMessage(result);
      if (message) onNotice(message);
    } catch (reason) {
      onError(cleanErrorMessage(reason, "唤起应用窗口失败"));
    }
  };
  const copyDiagnostics = async () => {
    try {
      const diagnostics = await api().getAppWindowDiagnostics(app.id, focusHintsForApp(app));
      await api().writeClipboardText(diagnostics);
      onNotice("已复制窗口诊断信息");
    } catch (reason) {
      onError(cleanErrorMessage(reason, "复制窗口诊断信息失败"));
    }
  };

  return <ContextMenu x={state.x} y={state.y} onClose={onClose}>
    <MenuButton onClick={() => invoke(() => onLaunch(app.id))}>启动</MenuButton>
    {app.metrics.isRunning ? <>
      <MenuDivider />
      <div className="menu-label">窗口列表</div>
      {windows === null ? <div className="menu-label muted">正在读取窗口…</div> : windows.length ? windows.slice(0, 8).map((window) => (
        <MenuButton key={`${window.handle}-${window.pid}`} onClick={() => { onClose(); void focusWindow(window.handle); }}>
          {window.title || `窗口 ${window.pid}`}{window.minimized ? "（最小化）" : ""}
        </MenuButton>
      )) : <div className="menu-label muted">未找到窗口</div>}
      <MenuButton onClick={() => { onClose(); void copyDiagnostics(); }}>复制窗口诊断信息</MenuButton>
    </> : null}
    <MenuButton disabled={!app.metrics.isRunning} danger onClick={() => invoke(() => onKill(app))}>结束进程</MenuButton>
    <MenuButton disabled={!app.executablePath} onClick={() => { onClose(); void api().showItemInFolder(app.executablePath).catch((reason) => onError(reason.message)); }}>打开文件所在位置</MenuButton>
    <MenuDivider />
    <MenuButton onClick={() => invoke(() => onEdit(app))}>编辑应用信息</MenuButton>
    <div className="menu-label">移动到分组</div>
    {groups.map((group) => <MenuButton key={group.id} disabled={app.groupId === group.id} onClick={() => { onClose(); void onMove(app.id, group.id); }}>{group.name}{app.groupId === group.id ? "（当前）" : ""}</MenuButton>)}
    <MenuDivider />
    <MenuButton disabled={!app.executablePath} onClick={() => { onClose(); void api().writeClipboardText(app.executablePath).catch((reason) => onError(reason.message)); }}>复制程序路径</MenuButton>
    <MenuButton danger onClick={() => invoke(() => onRemove(app))}>移除应用</MenuButton>
  </ContextMenu>;
}

function GroupContextMenu({ state, groups, onClose, onCreate, onEdit, onDelete, onReorder }: { state: Extract<MenuState, { kind: "group" }>; groups: AppGroup[]; onClose: () => void; onCreate: () => void; onEdit: (group: AppGroup) => void; onDelete: (id: string) => void; onReorder: (ids: string[]) => Promise<unknown> }) {
  const index = groups.findIndex((group) => group.id === state.groupId);
  const group = groups[index];
  if (!group) return null;
  const move = (offset: number) => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= groups.length) return;
    const next = [...groups];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onClose();
    void onReorder(next.map((item) => item.id));
  };
  return <ContextMenu x={state.x} y={state.y} onClose={onClose}><div className="process-menu-header"><strong>{group.name}</strong><span>应用分组</span></div><MenuDivider /><MenuButton onClick={() => { onClose(); onEdit(group); }}>重命名 / 更换图标</MenuButton><MenuButton onClick={() => { onClose(); onCreate(); }}>新建分组</MenuButton><MenuButton disabled={index === 0} onClick={() => move(-1)}>上移</MenuButton><MenuButton disabled={index === groups.length - 1} onClick={() => move(1)}>下移</MenuButton><MenuDivider /><MenuButton danger disabled={groups.length <= 1} onClick={() => onDelete(group.id)}>删除分组</MenuButton></ContextMenu>;
}

function ContextMenu({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: React.ReactNode }) { return <div className="context-menu no-drag" style={{ left: x, top: Math.max(8, y) }} onPointerDown={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>{children}<button className="menu-dismiss" aria-label="关闭菜单" onClick={onClose} /></div>; }
function MenuButton({ disabled, danger, title, onClick, children }: { disabled?: boolean; danger?: boolean; title?: string; onClick: () => void; children: React.ReactNode }) { return <button className={`menu-item ${danger ? "danger" : ""}`} disabled={disabled} title={title} onClick={onClick}>{children}</button>; }
function MenuDivider() { return <div className="menu-divider" />; }

function ConfirmDialog({ state, onClose, onError }: { state: NonNullable<ConfirmState>; onClose: () => void; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => { setBusy(true); try { await state.onConfirm(); onClose(); } catch (reason) { onError(reason instanceof Error ? reason.message : "操作失败"); setBusy(false); } };
  return <div className="modal-backdrop no-drag" onPointerDown={onClose}><div className="dialog" onPointerDown={(event) => event.stopPropagation()}><h2>{state.title}</h2><p>{state.message}</p><div className="dialog-actions"><button className="ghost" onClick={onClose} disabled={busy}>取消</button><button className="danger-button" onClick={() => void confirm()} disabled={busy}>{busy ? "处理中..." : state.confirmLabel}</button></div></div></div>;
}
export function SearchResultsPanel({ query, loading, error, selectedIndex, managedResults, discoveredResults, installableResults, fileResults, onSelectIndex, onOpenManaged, onAddDiscovered, onOpenInstallable, onOpenFile }: { query: string; loading: boolean; error: string; selectedIndex: number; managedResults: Array<Extract<InternalSearchResult, { kind: "app" }>>; discoveredResults: DiscoveredAppCandidate[]; installableResults: InstallableAppCandidate[]; fileResults: EverythingSearchResult[]; onSelectIndex: (index: number) => void; onOpenManaged: (result: Extract<InternalSearchResult, { kind: "app" }>) => void; onAddDiscovered: (candidate: DiscoveredAppCandidate) => void; onOpenInstallable: (candidate: InstallableAppCandidate) => void; onOpenFile: (result: EverythingSearchResult) => void }) {
  const appResultCount = managedResults.length + discoveredResults.length + installableResults.length;
  const showFileFallback = !appResultCount && Boolean(fileResults.length);
  const resultCount = appResultCount || fileResults.length;
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollSelectedSearchResultIntoView(panelRef.current, selectedIndex);
  }, [selectedIndex, resultCount]);
  return <div ref={panelRef} className="search-results-panel" role="listbox" aria-label="搜索结果" onPointerDown={(event) => event.stopPropagation()}>
    <div className="search-results-title"><span>搜索应用</span><small>{loading ? "搜索中…" : `${resultCount} 个结果`}</small></div>
    {error ? <div className="search-results-error"><strong>{error}</strong></div> : null}
    {!error && !loading && !resultCount ? <div className="search-results-empty">没有找到“{query}”的匹配结果。</div> : null}
    {!error && managedResults.length ? <div className="search-results-section"><div className="search-results-title compact"><span>已添加应用</span><small>Enter 启动 / 唤起</small></div>{managedResults.map((result, index) => <button key={`managed-${result.id}`} className={`search-result-row internal ${index === selectedIndex ? "selected" : ""}`} role="option" aria-selected={index === selectedIndex} {...{ [SEARCH_RESULT_OPTION_ATTRIBUTE]: index }} onMouseEnter={() => onSelectIndex(index)} onClick={() => onOpenManaged(result)}><Icon name="grid" /><span><strong>{result.name}</strong><small>{result.processName}{result.isRunning ? " · 运行中" : ""}</small></span><em className="search-result-status added" title="已添加">✓</em></button>)}</div> : null}
    {!error && discoveredResults.length ? <div className="search-results-section"><div className="search-results-title compact"><span>本机可添加应用</span><small>Enter 添加</small></div>{discoveredResults.map((result, offset) => {
      const index = managedResults.length + offset;
      return <button key={`discovered-${result.id}`} className={`search-result-row internal ${index === selectedIndex ? "selected" : ""}`} role="option" aria-selected={index === selectedIndex} {...{ [SEARCH_RESULT_OPTION_ATTRIBUTE]: index }} onMouseEnter={() => onSelectIndex(index)} onClick={() => onAddDiscovered(result)}><Icon name="grid" /><span><strong>{result.name}</strong><small>{result.source === "start-menu" ? "开始菜单" : result.source === "desktop" ? "桌面快捷方式" : "本机结果"}</small></span><em className={`search-result-status ${result.alreadyAdded ? "added" : "add"}`} title={result.alreadyAdded ? "已添加" : "添加到当前分组"}>{result.alreadyAdded ? "✓" : "+"}</em></button>;
    })}</div> : null}
    {!error && installableResults.length ? <div className="search-results-section"><div className="search-results-title compact"><span>可安装应用</span><small>Enter 打开下载页</small></div>{installableResults.map((result, offset) => {
      const index = managedResults.length + discoveredResults.length + offset;
      return <button key={`installable-${result.id}`} className={`search-result-row internal ${index === selectedIndex ? "selected" : ""}`} role="option" aria-selected={index === selectedIndex} {...{ [SEARCH_RESULT_OPTION_ATTRIBUTE]: index }} onMouseEnter={() => onSelectIndex(index)} onClick={() => onOpenInstallable(result)}><Icon name="search" /><span><strong>{result.name}</strong><small>{result.publisher} · 官方下载页</small></span><em className="search-result-status open" title="打开官方下载页">打开</em></button>;
    })}</div> : null}
    {!error && showFileFallback ? <div className="search-results-section"><div className="search-results-title compact"><span>Everything 搜索结果</span><small>Enter 打开</small></div>{fileResults.map((result, index) => <button key={`file-${result.path}`} className={`search-result-row file ${index === selectedIndex ? "selected" : ""}`} role="option" aria-selected={index === selectedIndex} {...{ [SEARCH_RESULT_OPTION_ATTRIBUTE]: index }} onMouseEnter={() => onSelectIndex(index)} onClick={() => onOpenFile(result)}><Icon name="search" /><span><strong>{result.name}</strong><small>{result.path}</small></span><em className="search-result-status open" title="打开">打开</em></button>)}</div> : null}
  </div>;
}

export function AppEditDialog({ state, onClose, onPickExecutable, onSave }: { state: EditState; onClose: () => void; onPickExecutable: (id: string) => Promise<string | null>; onSave: (input: UpdateAppInput) => Promise<void> }) {
  const [form, setForm] = useState(state!);
  const [busy, setBusy] = useState(false);
  const [selectingProgram, setSelectingProgram] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  if (!form) return null;
  const chooseExecutable = async () => {
    setSelectionError("");
    setSelectingProgram(true);
    try {
      const executablePath = await onPickExecutable(form.id);
      if (executablePath) setForm((current) => current ? { ...current, executablePath } : current);
    } catch (reason) {
      setSelectionError(cleanErrorMessage(reason, "选择启动程序失败"));
    } finally {
      setSelectingProgram(false);
    }
  };
  const save = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    const input: UpdateAppInput = { id: form.id, name: form.name.trim(), executablePath: form.executablePath, launchArgs: form.launchArgs.trim() || undefined };
    await onSave(input);
    onClose();
  };
  return <div className="modal-backdrop no-drag" onPointerDown={onClose}><form className="dialog edit-dialog" onSubmit={(event) => { event.preventDefault(); void save(); }} onPointerDown={(event) => event.stopPropagation()}><h2>编辑应用信息</h2><label>名称<input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>启动程序<span className="executable-picker"><input value={form.executablePath} readOnly title={form.executablePath} /><button type="button" className="ghost" onClick={() => void chooseExecutable()} disabled={busy || selectingProgram}>{selectingProgram ? "选择中..." : "选择程序"}</button></span></label><label>启动参数<input value={form.launchArgs} onChange={(event) => setForm({ ...form, launchArgs: event.target.value })} placeholder="例如：--silent" /></label>{selectionError ? <p className="dialog-error">{selectionError}</p> : null}<div className="dialog-actions"><button type="button" className="ghost" onClick={onClose} disabled={busy || selectingProgram}>取消</button><button type="submit" className="launch" disabled={busy || selectingProgram || !form.name.trim() || !form.executablePath}>保存</button></div></form></div>;
}
function SettingsPage({ apps, groups, preferences, onPreferencesChange, onWallpaperIntensityPreview, onThemeChange, onPickEverythingCli, onAdd, onAddToGroup, onCreate, onEdit, onDelete, onReorder, onOpenApp, onAppContextMenu, onMoveApp }: { apps: RuntimeApp[]; groups: AppGroup[]; preferences: AppPreferencesState; onPreferencesChange: (input: UpdatePreferencesInput) => Promise<AppPreferencesState>; onWallpaperIntensityPreview: (value: WallpaperGlassIntensity) => void; onThemeChange: (theme: UiTheme) => Promise<AppPreferencesState>; onPickEverythingCli: () => void; onAdd: () => void; onAddToGroup: (id: string) => void; onCreate: () => void; onEdit: (group: AppGroup) => void; onDelete: (id: string) => void; onReorder: (ids: string[]) => Promise<boolean>; onOpenApp: (app: RuntimeApp) => void; onAppContextMenu: (event: React.MouseEvent, app: RuntimeApp) => void; onMoveApp: (appId: string, groupId: string) => Promise<void> }) {
  const [ordered, setOrdered] = useState(groups);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedSettings, setExpandedSettings] = useState<Set<"general" | "layout" | "theme" | "dependency">>(new Set());
  const [sortPreview, setSortPreview] = useState<{ id: string; left: number; top: number; width: number } | null>(null);
  const [appDrag, setAppDrag] = useState<{ appId: string; x: number; y: number; grabOffsetX: number; grabOffsetY: number; targetGroup?: string } | null>(null);
  const [savingPreference, setSavingPreference] = useState<"startup" | "close" | "shortcut" | "theme" | "layout" | "wallpaperIntensity" | "wallpaperVariant" | "administrator" | "search" | "runningSort" | "appNames" | null>(null);
  const [recordingShortcut, setRecordingShortcut] = useState(false);
  const [shortcutMessage, setShortcutMessage] = useState("");
  const [administratorActionMessage, setAdministratorActionMessage] = useState("");
  const [dependencyStatus, setDependencyStatus] = useState<SearchDependencyStatus>({ state: "missing" });
  const setPreferences = (next: AppPreferencesState) => { void onPreferencesChange({ everythingCliPath: next.everythingCliPath }); };
  const rows = useRef(new Map<string, HTMLDivElement>());
  const flipRects = useRef(new Map<string, DOMRect>());
  const latestOrdered = useRef(ordered);
  const sortCandidate = useRef<{ id: string; startX: number; startY: number; grabOffsetX: number; grabOffsetY: number; original: AppGroup[]; active: boolean; valid: boolean } | null>(null);
  const appCandidate = useRef<{ appId: string; startX: number; startY: number; grabOffsetX: number; grabOffsetY: number } | null>(null);
  const suppressAppClick = useRef(false);
  const wallpaperIntensitySaveTimer = useRef<number | null>(null);
  const latestWallpaperIntensity = useRef(preferences.wallpaperGlassIntensity);

  useEffect(() => {
    setOrdered(groups);
    setExpanded((current) => new Set([...current].filter((id) => groups.some((group) => group.id === id))));
  }, [groups]);
  useEffect(() => {
    let cancelled = false;
    void api().getSearchDependencyStatus().then((status) => {
      if (!cancelled) setDependencyStatus(status);
    }).catch((reason) => {
      if (!cancelled) setDependencyStatus({ state: "failed", message: cleanErrorMessage(reason, "刷新搜索依赖状态失败") });
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { latestOrdered.current = ordered; }, [ordered]);
  useEffect(() => { latestWallpaperIntensity.current = preferences.wallpaperGlassIntensity; }, [preferences.wallpaperGlassIntensity]);
  useEffect(() => () => {
    if (wallpaperIntensitySaveTimer.current) window.clearTimeout(wallpaperIntensitySaveTimer.current);
  }, []);

  const captureRects = () => {
    flipRects.current = new Map([...rows.current].map(([id, element]) => [id, element.getBoundingClientRect()]));
  };
  useLayoutEffect(() => {
    if (!flipRects.current.size || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const [id, element] of rows.current) {
      const before = flipRects.current.get(id);
      if (!before) continue;
      const after = element.getBoundingClientRect();
      const delta = before.top - after.top;
      if (!delta) continue;
      element.animate([{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }], { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
    flipRects.current.clear();
  }, [ordered]);

  useEffect(() => {
    let frame = 0;
    let latestEvent: PointerEvent | null = null;
    const cancelSort = () => {
      const candidate = sortCandidate.current;
      sortCandidate.current = null;
      setSortPreview(null);
      if (candidate?.active) setOrdered(candidate.original);
    };
    const cancelApp = () => { appCandidate.current = null; setAppDrag(null); };
    const processMove = (event: PointerEvent) => {
      const sort = sortCandidate.current;
      if (sort) {
        if (!sort.active && Math.hypot(event.clientX - sort.startX, event.clientY - sort.startY) <= 6) return;
        sort.active = true;
        const source = rows.current.get(sort.id);
        if (!source) return;
        const sourceRect = source.getBoundingClientRect();
        const previewWidth = Math.min(sourceRect.width, 520);
        const previewHeight = 64;
        const { left, top } = groupSortPreviewPosition({
          pointerX: event.clientX,
          pointerY: event.clientY,
          previewWidth,
          previewHeight,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight
        });
        setSortPreview({ id: sort.id, left, top, width: previewWidth });
        const targetElement = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-sort-group]");
        const targetId = targetElement?.dataset.sortGroup;
        sort.valid = Boolean(targetId);
        if (!targetId || targetId === sort.id) return;
        const targetRect = targetElement.getBoundingClientRect();
        setOrdered((current) => {
          const from = current.findIndex((group) => group.id === sort.id);
          const target = current.findIndex((group) => group.id === targetId);
          if (from < 0 || target < 0) return current;
          let insertion = target + (event.clientY > targetRect.top + targetRect.height / 2 ? 1 : 0);
          if (from < insertion) insertion -= 1;
          if (insertion === from) return current;
          captureRects();
          const next = [...current];
          const [item] = next.splice(from, 1);
          next.splice(Math.max(0, Math.min(insertion, next.length)), 0, item);
          return next;
        });
        return;
      }

      const app = appCandidate.current;
      if (!app) return;
      if (!appDrag && Math.hypot(event.clientX - app.startX, event.clientY - app.startY) <= 6) return;
      suppressAppClick.current = true;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-settings-drop-group]")?.dataset.settingsDropGroup;
      const source = apps.find((item) => item.id === app.appId)?.groupId;
      setAppDrag({ appId: app.appId, x: event.clientX, y: event.clientY, grabOffsetX: app.grabOffsetX, grabOffsetY: app.grabOffsetY, targetGroup: target && target !== source ? target : undefined });
    };
    const move = (event: PointerEvent) => {
      latestEvent = event;
      if (!frame) frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (latestEvent) processMove(latestEvent);
      });
    };
    const up = () => {
      const sort = sortCandidate.current;
      if (sort) {
        sortCandidate.current = null;
        setSortPreview(null);
        if (sort.active) {
          if (!sort.valid) { setOrdered(sort.original); return; }
          const finalOrder = latestOrdered.current;
          void onReorder(finalOrder.map((group) => group.id)).then((saved) => { if (!saved) setOrdered(sort.original); });
        }
      }
      const app = appDrag;
      appCandidate.current = null;
      setAppDrag(null);
      if (app?.targetGroup) void onMoveApp(app.appId, app.targetGroup);
      window.setTimeout(() => { suppressAppClick.current = false; }, 0);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      cancelSort();
      cancelApp();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("keydown", key); if (frame) window.cancelAnimationFrame(frame); };
  }, [appDrag, apps, onMoveApp, onReorder]);

  const draggedApp = apps.find((app) => app.id === appDrag?.appId);
  const previewGroup = ordered.find((group) => group.id === sortPreview?.id);
  const toggle = (id: string) => setExpanded((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const savePreference = async (kind: "startup" | "close" | "shortcut" | "layout" | "wallpaperIntensity" | "wallpaperVariant" | "administrator" | "search" | "runningSort" | "appNames", input: UpdatePreferencesInput) => {
    setSavingPreference(kind);
    if (kind === "administrator") setAdministratorActionMessage("");
    try {
      const result = await onPreferencesChange(input);
      setShortcutMessage(result.globalShortcutMessage ?? "");
    } catch { /* The app-level toast reports the failure. */ } finally { setSavingPreference(null); }
  };
  const saveWallpaperIntensity = (value: WallpaperGlassIntensity, immediate = false) => {
    latestWallpaperIntensity.current = value;
    onWallpaperIntensityPreview(value);
    if (wallpaperIntensitySaveTimer.current) {
      window.clearTimeout(wallpaperIntensitySaveTimer.current);
      wallpaperIntensitySaveTimer.current = null;
    }
    const commit = () => {
      void savePreference("wallpaperIntensity", { wallpaperGlassIntensity: latestWallpaperIntensity.current });
    };
    if (immediate) commit();
    else wallpaperIntensitySaveTimer.current = window.setTimeout(commit, 160);
  };
  const flushWallpaperIntensity = () => saveWallpaperIntensity(latestWallpaperIntensity.current, true);
  const saveLayoutPreference = (input: Partial<UiLayoutPreferences>) => {
    const uiLayout = { ...preferences.uiLayout, ...input };
    void savePreference("layout", { uiLayout, showAppNames: uiLayout.showAppNames });
  };
  const copyLayoutShareCode = () => {
    void api().exportUiLayoutShareCode().then((code) => api().writeClipboardText(code)).then(() => setShortcutMessage("界面分享码已复制")).catch((reason) => setShortcutMessage(cleanErrorMessage(reason, "复制分享码失败")));
  };
  const importLayoutShareCode = () => {
    const code = window.prompt("粘贴界面分享码");
    if (!code) return;
    void api().importUiLayoutShareCode(code).then((next) => { setShortcutMessage("界面已导入"); return onPreferencesChange({ uiLayout: next.uiLayout, showAppNames: next.uiLayout.showAppNames }); }).catch((reason) => setShortcutMessage(cleanErrorMessage(reason, "导入分享码失败")));
  };
  const selectTheme = async (theme: UiTheme) => {
    if (theme === preferences.uiTheme || savingPreference !== null) return;
    setSavingPreference("theme");
    try { await onThemeChange(theme); }
    catch { /* The app-level toast reports the failure and restores the previous theme. */ }
    finally { setSavingPreference(null); }
  };
  const recordShortcut = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!recordingShortcut) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") { setRecordingShortcut(false); setShortcutMessage(""); return; }
    const shortcut = shortcutFromKeyboardEvent(event.nativeEvent);
    if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return;
    const validation = validateShortcut(shortcut);
    if (!validation.valid) { setShortcutMessage(validation.message); return; }
    setRecordingShortcut(false);
    setShortcutMessage("");
    void savePreference("shortcut", { globalShortcut: validation.accelerator, globalShortcutEnabled: true });
  };
  const themePicker = (
    <section className="theme-panel">
      <div className="theme-grid" role="radiogroup" aria-label="界面主题">
        {themeOptions.map((theme) => (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={preferences.uiTheme === theme.id}
            className={`theme-card theme-${theme.id} ${preferences.uiTheme === theme.id ? "selected" : ""}`}
            disabled={savingPreference !== null}
            title={theme.title ?? theme.description}
            onClick={() => void selectTheme(theme.id)}
          >
            <span className="theme-preview" aria-hidden="true"><i /><b /><em /></span>
            <span className="theme-card-copy"><strong>{theme.name}</strong><small>{theme.description}</small></span>
            <span className="theme-check" aria-hidden="true">✓</span>
          </button>
        ))}
      </div>
      {preferences.uiTheme === "wallpaper" ? <div className="wallpaper-controls"><WallpaperGlassVariantControl value={preferences.wallpaperGlassVariant} disabled={savingPreference !== null} onChange={(value) => void savePreference("wallpaperVariant", { wallpaperGlassVariant: value })} /><WallpaperGlassIntensityControl value={preferences.wallpaperGlassIntensity} disabled={savingPreference !== null && savingPreference !== "wallpaperIntensity"} onChange={(value) => saveWallpaperIntensity(value)} onCommit={flushWallpaperIntensity} /></div> : null}
    </section>
  );
  const layoutOption = <T extends string,>(label: string, value: T, current: T, onClick: (value: T) => void) => <button className={current === value ? "selected" : ""} disabled={savingPreference !== null} onClick={() => onClick(value)}>{label}</button>;
  const layoutEditor = (
    <section className="theme-panel layout-editor">
      <div className="preference-grid">
        <div className="preference-row"><span><strong>卡片大小</strong><small>调整应用卡片的整体尺寸。</small></span><div className="preference-options">{layoutOption("小", "small", preferences.uiLayout.cardSize, (value) => saveLayoutPreference({ cardSize: value }))}{layoutOption("中", "medium", preferences.uiLayout.cardSize, (value) => saveLayoutPreference({ cardSize: value }))}{layoutOption("大", "large", preferences.uiLayout.cardSize, (value) => saveLayoutPreference({ cardSize: value }))}</div></div>
        <div className="preference-row"><span><strong>网格密度</strong><small>控制应用之间的留白。</small></span><div className="preference-options">{layoutOption("紧凑", "compact", preferences.uiLayout.gridDensity, (value) => saveLayoutPreference({ gridDensity: value }))}{layoutOption("标准", "standard", preferences.uiLayout.gridDensity, (value) => saveLayoutPreference({ gridDensity: value }))}{layoutOption("宽松", "relaxed", preferences.uiLayout.gridDensity, (value) => saveLayoutPreference({ gridDensity: value }))}</div></div>
        <div className="preference-row"><span><strong>侧栏宽度</strong><small>调整左侧导航区域宽度。</small></span><div className="preference-options">{layoutOption("窄", "narrow", preferences.uiLayout.sidebarWidth, (value) => saveLayoutPreference({ sidebarWidth: value }))}{layoutOption("标准", "standard", preferences.uiLayout.sidebarWidth, (value) => saveLayoutPreference({ sidebarWidth: value }))}{layoutOption("宽", "wide", preferences.uiLayout.sidebarWidth, (value) => saveLayoutPreference({ sidebarWidth: value }))}</div></div>
        <div className="preference-row"><span><strong>顶部图标</strong><small>控制左上角标识大小。</small></span><div className="preference-options">{layoutOption("标准", "standard", preferences.uiLayout.brandIconSize, (value) => saveLayoutPreference({ brandIconSize: value }))}{layoutOption("大", "large", preferences.uiLayout.brandIconSize, (value) => saveLayoutPreference({ brandIconSize: value }))}</div></div>
        <div className="preference-row"><span><strong>背景色调</strong><small>选择受约束的背景色。</small></span><div className="preference-options">{layoutOption("默认", "default", preferences.uiLayout.backgroundTone, (value) => saveLayoutPreference({ backgroundTone: value }))}{layoutOption("极光", "aurora", preferences.uiLayout.backgroundTone, (value) => saveLayoutPreference({ backgroundTone: value }))}{layoutOption("石墨", "graphite", preferences.uiLayout.backgroundTone, (value) => saveLayoutPreference({ backgroundTone: value }))}{layoutOption("雾蓝", "mist", preferences.uiLayout.backgroundTone, (value) => saveLayoutPreference({ backgroundTone: value }))}</div></div>
        <div className="preference-row"><span><strong>显示应用名称</strong><small>主界面卡片显示名称。</small></span><button className={`setting-switch ${preferences.uiLayout.showAppNames ? "enabled" : ""}`} role="switch" aria-checked={preferences.uiLayout.showAppNames} disabled={savingPreference !== null} onClick={() => saveLayoutPreference({ showAppNames: !preferences.uiLayout.showAppNames })}><i /></button></div>
        <div className="preference-row"><span><strong>显示搜索栏</strong><small>隐藏后仍可用设置重新打开。</small></span><button className={`setting-switch ${preferences.uiLayout.showSearchBar ? "enabled" : ""}`} role="switch" aria-checked={preferences.uiLayout.showSearchBar} disabled={savingPreference !== null} onClick={() => saveLayoutPreference({ showSearchBar: !preferences.uiLayout.showSearchBar })}><i /></button></div>
        <div className="preference-row"><span><strong>显示运行状态</strong><small>控制卡片右上角运行绿点。</small></span><button className={`setting-switch ${preferences.uiLayout.showRunningStatus ? "enabled" : ""}`} role="switch" aria-checked={preferences.uiLayout.showRunningStatus} disabled={savingPreference !== null} onClick={() => saveLayoutPreference({ showRunningStatus: !preferences.uiLayout.showRunningStatus })}><i /></button></div>
        <div className="preference-row"><span><strong>显示批量按钮</strong><small>控制底部一键启动等操作。</small></span><button className={`setting-switch ${preferences.uiLayout.showBatchActions ? "enabled" : ""}`} role="switch" aria-checked={preferences.uiLayout.showBatchActions} disabled={savingPreference !== null} onClick={() => saveLayoutPreference({ showBatchActions: !preferences.uiLayout.showBatchActions })}><i /></button></div>
        <div className="preference-row"><span><strong>界面分享码</strong><small>只分享布局偏好，不包含应用路径。</small>{shortcutMessage ? <em>{shortcutMessage}</em> : null}</span><div className="administrator-controls"><button className="shortcut-reset" onClick={copyLayoutShareCode}>复制分享码</button><button className="shortcut-reset" onClick={importLayoutShareCode}>导入</button></div></div>
      </div>
    </section>
  );
  const app = appDrag ?? { grabOffsetX: 0, grabOffsetY: 0 };

  const prepareDependencies = () => {
    setDependencyStatus({ state: "downloading", message: "正在准备 Everything 搜索依赖" });
    void api().prepareSearchDependencies().then((status) => {
      setDependencyStatus(status);
      if (status.everythingCliPath) void onPreferencesChange({ everythingCliPath: status.everythingCliPath, everythingManagedPath: status.everythingPath });
    }).catch((reason) => setDependencyStatus({ state: "failed", message: cleanErrorMessage(reason, "准备 Everything 搜索依赖失败") }));
  };
  const refreshDependencyStatus = () => void api().getSearchDependencyStatus().then(setDependencyStatus).catch((reason) => setDependencyStatus({ state: "failed", message: cleanErrorMessage(reason, "刷新搜索依赖状态失败") }));
  const openDependencyFolder = () => void api().openSearchDependencyFolder().catch((reason) => setShortcutMessage(cleanErrorMessage(reason, "打开依赖目录失败")));
  const toggleSettingsSection = (section: "general" | "theme" | "dependency") => setExpandedSettings((current) => {
    const next = new Set(current);
    next.has(section) ? next.delete(section) : next.add(section);
    return next;
  });

  const administratorStatus = administratorActionMessage || (preferences.administratorRestartRequired ? shortcutMessage : "") || preferences.administratorMessage || (preferences.administratorStatusLoading ? "权限状态检测中" : preferences.administratorRestartRequired ? "下次启动生效" : preferences.isRunningAsAdministrator ? "当前以管理员权限运行" : "当前以普通权限运行");

  return <section className="content settings-page no-drag" tabIndex={-1}><SettingsCollapsibleSection title="常规设置" description="控制 Windows 启动、窗口关闭和快速唤出行为。" expanded={expandedSettings.has("general")} onToggle={() => toggleSettingsSection("general")}><div className="preference-grid"><div className="preference-row"><span><strong>开机启动</strong><small>登录 Windows 后自动打开 Start Engineer 主窗口。</small></span><button className={`setting-switch ${preferences.launchAtStartup ? "enabled" : ""}`} role="switch" aria-checked={preferences.launchAtStartup} disabled={savingPreference !== null} onClick={() => void savePreference("startup", { launchAtStartup: !preferences.launchAtStartup })}><i /></button></div><div className="preference-row close-preference"><span><strong>关闭主窗口时</strong><small>选择继续在托盘运行，或直接退出启动器。</small></span><div className="preference-options"><button className={preferences.closeBehavior === "tray" ? "selected" : ""} disabled={savingPreference !== null} onClick={() => void savePreference("close", { closeBehavior: "tray" })}>最小化到托盘</button><button className={preferences.closeBehavior === "quit" ? "selected" : ""} disabled={savingPreference !== null} onClick={() => void savePreference("close", { closeBehavior: "quit" })}>直接退出</button></div></div><div className="preference-row shortcut-preference"><span><strong>快速唤出</strong><small>在任意界面按快捷键显示或隐藏 Start Engineer。</small>{shortcutMessage || preferences.globalShortcutMessage ? <em>{shortcutMessage || preferences.globalShortcutMessage}</em> : null}</span><div className="shortcut-controls"><button className={`shortcut-recorder ${recordingShortcut ? "recording" : ""}`} disabled={savingPreference !== null} onDoubleClick={() => { setRecordingShortcut(true); setShortcutMessage("请按下新的快捷键，Esc 取消"); }} onKeyDown={recordShortcut}>{recordingShortcut ? "等待按键…" : preferences.globalShortcut}</button><button className={`setting-switch ${preferences.globalShortcutEnabled ? "enabled" : ""}`} role="switch" aria-checked={preferences.globalShortcutEnabled} disabled={savingPreference !== null} onClick={() => void savePreference("shortcut", { globalShortcutEnabled: !preferences.globalShortcutEnabled })}><i /></button><button className="shortcut-reset" disabled={savingPreference !== null || preferences.globalShortcut === "Ctrl+Shift+Space"} onClick={() => void savePreference("shortcut", { globalShortcut: "Ctrl+Shift+Space", globalShortcutEnabled: true })}>恢复默认</button></div></div><div className="preference-row search-preference"><span><strong>搜索范围</strong><small>默认调用 Everything 搜索文件；开启后只筛选 Start Engineer 内的应用和进程。</small><em>{preferences.searchProvider === "everything" ? "当前使用 Everything" : "当前仅搜索内部应用"}</em></span><div className="administrator-controls"><button className="shortcut-reset" disabled={savingPreference !== null || preferences.searchProvider !== "everything"} onClick={() => void api().pickEverythingCli().then(setPreferences).catch((reason) => setShortcutMessage(cleanErrorMessage(reason, "选择 ES.exe 失败")))}>选择 ES.exe</button><button className={`setting-switch ${preferences.searchProvider === "internal" ? "enabled" : ""}`} role="switch" aria-checked={preferences.searchProvider === "internal"} disabled={savingPreference !== null} onClick={() => void savePreference("search", { searchProvider: preferences.searchProvider === "internal" ? "everything" : "internal" })}><i /></button></div></div><div className="preference-row running-sort-preference"><span><strong>运行应用置顶</strong><small>分组内已启动应用自动显示在前面，关闭后恢复原有顺序。</small></span><button className={`setting-switch ${preferences.sortRunningAppsFirst ? "enabled" : ""}`} role="switch" aria-checked={preferences.sortRunningAppsFirst} disabled={savingPreference !== null} onClick={() => void savePreference("runningSort", { sortRunningAppsFirst: !preferences.sortRunningAppsFirst })}><i /></button></div><div className="preference-row app-name-preference"><span><strong>显示应用名称</strong><small>在主界面卡片下方显示应用名称，关闭后只保留图标和状态。</small></span><button className={`setting-switch ${preferences.uiLayout.showAppNames ? "enabled" : ""}`} role="switch" aria-checked={preferences.uiLayout.showAppNames} disabled={savingPreference !== null} onClick={() => saveLayoutPreference({ showAppNames: !preferences.uiLayout.showAppNames })}><i /></button></div><div className="preference-row administrator-preference"><span><strong>以管理员方式启动</strong><small>启动时请求 Windows 管理员权限，结束高权限应用时通常无需再次授权。</small><em className={preferences.administratorRestartRequired ? "pending" : "active"}>{administratorStatus}</em></span><div className="administrator-controls">{preferences.administratorRestartRequired ? <button className="shortcut-reset administrator-restart" onClick={() => void api().restartWithConfiguredPrivileges().catch((reason) => setShortcutMessage(cleanErrorMessage(reason, "重启失败")))}>{preferences.runAsAdministrator ? "立即以管理员身份重启" : "立即以普通权限重启"}</button> : null}<button className={`setting-switch ${preferences.runAsAdministrator ? "enabled" : ""}`} role="switch" aria-checked={preferences.runAsAdministrator} disabled={savingPreference !== null} onClick={() => void savePreference("administrator", { runAsAdministrator: !preferences.runAsAdministrator })}><i /></button></div></div></div></SettingsCollapsibleSection><KeyboardShortcutSettingsSection shortcuts={preferences.keyboardShortcuts} onChange={onPreferencesChange} /><SettingsCollapsibleSection title="界面主题" description="选择一套固定外观，或让界面跟随 Windows 明暗模式。" expanded={expandedSettings.has("theme")} onToggle={() => toggleSettingsSection("theme")}>{layoutEditor}{themePicker}</SettingsCollapsibleSection><div className="settings-heading group-settings-heading"><div><h2>分组管理</h2><p>点击分组查看应用，拖动手柄调整左侧导航顺序。</p></div><div className="settings-actions"><button className="ghost" onClick={onAdd}>添加应用</button><button className="launch" onClick={onCreate}>新建分组</button></div></div><div className="group-manager">{ordered.map((group) => <GroupManagerItem key={group.id} group={group} apps={apps.filter((app) => app.groupId === group.id)} expanded={expanded.has(group.id)} sorting={sortPreview?.id === group.id} appDrag={appDrag} register={(element) => { if (element) rows.current.set(group.id, element); else rows.current.delete(group.id); }} onToggle={() => toggle(group.id)} onSortStart={(event) => { if (appCandidate.current) return; event.preventDefault(); const rect = rows.current.get(group.id)?.getBoundingClientRect(); sortCandidate.current = { id: group.id, startX: event.clientX, startY: event.clientY, grabOffsetX: rect ? event.clientX - rect.left : 40, grabOffsetY: rect ? event.clientY - rect.top : 32, original: [...ordered], active: false, valid: true }; }} onEdit={() => onEdit(group)} onDelete={() => onDelete(group.id)} canDelete={groups.length > 1} onAdd={() => onAddToGroup(group.id)} onOpenApp={(app) => { if (!suppressAppClick.current) onOpenApp(app); }} onAppContextMenu={onAppContextMenu} onAppPointerDown={(event, app) => { if (event.button !== 0 || sortCandidate.current) return; const rect = event.currentTarget.getBoundingClientRect(); appCandidate.current = { appId: app.id, startX: event.clientX, startY: event.clientY, grabOffsetX: event.clientX - rect.left, grabOffsetY: event.clientY - rect.top }; }} />)}</div>{sortPreview && previewGroup && typeof document !== "undefined" ? createPortal(<GroupSortPreview group={previewGroup} count={apps.filter((app) => app.groupId === previewGroup.id).length} left={sortPreview.left} top={sortPreview.top} width={sortPreview.width} />, document.body) : null}{appDrag && draggedApp ? <div className="drag-preview no-drag" style={{ left: appDrag.x - app.grabOffsetX, top: appDrag.y - app.grabOffsetY }}>{draggedApp.iconDataUrl ? <img src={draggedApp.iconDataUrl} alt="" /> : <Icon name="grid" />}<span>{draggedApp.name}</span></div> : null}</section>;
}

export function SettingsCollapsibleSection({ title, description, expanded, onToggle, children }: { title: string; description: string; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  return <><section className={`settings-collapsible ${expanded ? "expanded" : ""}`}><button className="settings-collapse-toggle" aria-expanded={expanded} onClick={onToggle}><span><strong>{title}</strong><small>{description}</small></span><GroupActionIcon kind="expand" /></button>{expanded ? <div className="settings-collapse-content">{children}</div> : null}</section>{title === "界面主题" ? <SearchDependencySettingsSection /> : null}</>;
}

function KeyboardShortcutSettingsSection({ shortcuts, onChange }: { shortcuts: AppPreferencesState["keyboardShortcuts"]; onChange: (input: UpdatePreferencesInput) => Promise<AppPreferencesState> }) {
  const [expanded, setExpanded] = useState(false);
  const [recording, setRecording] = useState<AppKeyboardShortcutId | null>(null);
  const [message, setMessage] = useState("");
  const labels: Record<AppKeyboardShortcutId, [string, string]> = { up: ["向上移动", "选择上方应用卡片"], down: ["向下移动", "选择下方应用卡片"], left: ["向左移动", "选择左侧应用卡片"], right: ["向右移动", "选择右侧应用卡片"], activate: ["启动 / 唤起", "启动应用或唤起运行窗口"], toggleLaunch: ["一键启动勾选", "切换当前应用的批量启动状态"], cancel: ["取消 / 收起", "关闭搜索、菜单或放大的卡片"], edit: ["编辑应用", "编辑当前选择的应用"], menu: ["更多菜单", "打开当前应用的右键菜单"], search: ["聚焦搜索", "将焦点移到搜索框"], previousGroup: ["上一个分组", "切换到前一个应用分组"], nextGroup: ["下一个分组", "切换到后一个应用分组"], group1: ["第 1 分组", "直接切换到第 1 个分组"], group2: ["第 2 分组", "直接切换到第 2 个分组"], group3: ["第 3 分组", "直接切换到第 3 个分组"], group4: ["第 4 分组", "直接切换到第 4 个分组"], group5: ["第 5 分组", "直接切换到第 5 个分组"], group6: ["第 6 分组", "直接切换到第 6 个分组"], group7: ["第 7 分组", "直接切换到第 7 个分组"], group8: ["第 8 分组", "直接切换到第 8 个分组"], group9: ["第 9 分组", "直接切换到第 9 个分组"] };
  const sections: Array<{ id: string; title: string; shortcuts: AppKeyboardShortcutId[] }> = [
    { id: "actions", title: "常用操作", shortcuts: ["activate", "toggleLaunch", "edit", "menu", "search", "cancel"] },
    { id: "navigation", title: "导航", shortcuts: ["up", "down", "left", "right", "previousGroup", "nextGroup"] },
    { id: "groups", title: "分组直达", shortcuts: ["group1", "group2", "group3", "group4", "group5", "group6", "group7", "group8", "group9"] }
  ];
  const record = (id: AppKeyboardShortcutId, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (recording !== id) return;
    event.preventDefault(); event.stopPropagation();
    const value = appShortcutFromEvent(event.nativeEvent);
    if (!isRecordableAppShortcut(value)) { setMessage("请选择非修饰键，且不要使用 Windows 键"); return; }
    const conflict = findShortcutConflict(shortcuts, value, id);
    if (conflict) { setMessage(`该按键已用于“${labels[conflict][0]}”`); return; }
    setRecording(null); setMessage(""); void onChange({ keyboardShortcuts: { ...shortcuts, [id]: [value] } });
  };
  return <section className={`settings-collapsible ${expanded ? "expanded" : ""}`}><button className="settings-collapse-toggle" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><span><strong>快捷键</strong><small>双击按键即可修改。</small></span><GroupActionIcon kind="expand" /></button>{expanded ? <div className="settings-collapse-content shortcut-settings-content"><div className="shortcut-settings-toolbar"><button className="shortcut-reset" onClick={() => { if (window.confirm("恢复全部应用内快捷键为默认设置？")) void onChange({ keyboardShortcuts: defaultKeyboardShortcuts }); }}>恢复全部默认</button></div><div className="shortcut-sections">{sections.map((section) => <section className={`shortcut-section shortcut-section-${section.id}`} key={section.id}><h3>{section.title}</h3><div className="shortcut-help-grid">{section.shortcuts.map((id) => <div className="shortcut-help-row" key={id} title={labels[id][1]}><span><strong>{labels[id][0]}</strong></span><button aria-label={`${labels[id][0]}，双击修改快捷键`} className={`shortcut-recorder ${recording === id ? "recording" : ""}`} onDoubleClick={() => { setRecording(id); setMessage("请按下新的快捷键"); }} onKeyDown={(event) => record(id, event)}>{recording === id ? "等待按键..." : shortcuts[id].join(" / ")}</button></div>)}</div></section>)}</div>{message ? <p className="shortcut-message">{message}</p> : null}</div> : null}</section>;
}
function SearchDependencySettingsSection() {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<SearchDependencyStatus>({ state: "missing" });
  useEffect(() => {
    let cancelled = false;
    void api().getSearchDependencyStatus().then((next) => {
      if (!cancelled) setStatus(next);
    }).catch((reason) => {
      if (!cancelled) setStatus({ state: "failed", message: cleanErrorMessage(reason, "刷新搜索依赖状态失败") });
    });
    return () => { cancelled = true; };
  }, []);
  const prepare = () => {
    setStatus({ state: "downloading", message: "正在准备 Everything 搜索依赖" });
    void api().prepareSearchDependencies().then(setStatus).catch((reason) => setStatus({ state: "failed", message: cleanErrorMessage(reason, "准备 Everything 搜索依赖失败") }));
  };
  const refresh = () => void api().getSearchDependencyStatus().then(setStatus).catch((reason) => setStatus({ state: "failed", message: cleanErrorMessage(reason, "刷新搜索依赖状态失败") }));
  const pickCli = () => void api().pickEverythingCli().then(() => refresh()).catch((reason) => setStatus({ state: "failed", message: cleanErrorMessage(reason, "选择 ES.exe 失败") }));
  const openFolder = () => void api().openSearchDependencyFolder().catch((reason) => setStatus({ state: "failed", message: cleanErrorMessage(reason, "打开依赖目录失败") }));
  return <section className={`settings-collapsible ${expanded ? "expanded" : ""}`}><button className="settings-collapse-toggle" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><span><strong>搜索依赖</strong><small>一键准备 Everything 便携版与 ES 命令行工具。</small></span><GroupActionIcon kind="expand" /></button>{expanded ? <div className="settings-collapse-content"><SearchDependencyPanel status={status} onPrepare={prepare} onRefresh={refresh} onOpenFolder={openFolder} onPickCli={pickCli} /></div> : null}</section>;
}

export function SearchDependencyPanel({ status, onPrepare, onRefresh, onOpenFolder, onPickCli }: { status: SearchDependencyStatus; onPrepare: () => void; onRefresh: () => void; onOpenFolder: () => void; onPickCli: () => void }) {
  const busy = status.state === "downloading" || status.state === "extracting" || status.state === "starting";
  const statusLabel: Record<SearchDependencyStatus["state"], string> = {
    ready: "已就绪",
    missing: "未下载",
    downloading: "下载中",
    extracting: "解压中",
    starting: "启动 Everything 中",
    failed: "失败"
  };
  const progress = status.totalBytes && status.downloadedBytes ? ` ${Math.round(status.downloadedBytes / status.totalBytes * 100)}%` : "";
  return <div className="search-dependency-panel"><div className={`dependency-status ${status.state}`}><strong>{statusLabel[status.state]}{progress}</strong><small>{status.message ?? (status.state === "ready" ? "Everything 搜索依赖已经可以使用。" : "点击一键准备后会下载官方便携版到 Start Engineer 数据目录。")}</small>{status.everythingCliPath ? <code>{status.everythingCliPath}</code> : null}</div><div className="dependency-actions"><button className="launch" disabled={busy || status.state === "ready"} onClick={onPrepare}>{status.state === "failed" ? "重试准备" : "一键准备"}</button><button className="ghost" disabled={busy} onClick={onRefresh}>刷新状态</button><button className="ghost" onClick={onOpenFolder}>打开依赖目录</button><button className="shortcut-reset" disabled={busy} onClick={onPickCli}>选择 ES.exe</button></div></div>;
}

function GroupActionIcon({ kind }: { kind: "drag" | "expand" | "edit" | "delete" }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "drag") return <svg {...common} className="action-icon drag-dots"><circle cx="8" cy="7" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="7" r="1" fill="currentColor" stroke="none" /><circle cx="8" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="8" cy="17" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="17" r="1" fill="currentColor" stroke="none" /></svg>;
  if (kind === "expand") return <svg {...common} className="action-icon expand-chevron"><path d="m8 10 4 4 4-4" /></svg>;
  if (kind === "edit") return <svg {...common} className="action-icon edit-pencil"><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>;
  return <svg {...common} className="action-icon delete-trash"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg>;
}

export function GroupManagerItem({ group, apps, expanded, sorting, appDrag, register, onToggle, onSortStart, onEdit, onDelete, canDelete, onAdd, onOpenApp, onAppContextMenu, onAppPointerDown }: { group: AppGroup; apps: RuntimeApp[]; expanded: boolean; sorting: boolean; appDrag: { appId: string; targetGroup?: string } | null; register: (element: HTMLDivElement | null) => void; onToggle: () => void; onSortStart: (event: React.PointerEvent) => void; onEdit: () => void; onDelete: () => void; canDelete: boolean; onAdd: () => void; onOpenApp: (app: RuntimeApp) => void; onAppContextMenu: (event: React.MouseEvent, app: RuntimeApp) => void; onAppPointerDown: (event: React.PointerEvent, app: RuntimeApp) => void }) {
  const sourceGroup = apps.some((app) => app.id === appDrag?.appId);
  return <div ref={register} data-sort-group={group.id} data-settings-drop-group={group.id} className={`group-manager-item ${expanded ? "expanded" : ""} ${sorting ? "sorting-placeholder" : ""} ${appDrag ? sourceGroup ? "app-drop-disabled" : appDrag.targetGroup === group.id ? "app-drop-active" : "app-drop-ready" : ""}`}><div className="group-manager-row"><button className="drag-handle" title="拖动排序" aria-label={`拖动 ${group.name} 排序`} onPointerDown={onSortStart}><GroupActionIcon kind="drag" /></button><button className="group-manager-main" onClick={onToggle} aria-expanded={expanded}><span className="group-manager-icon"><Icon name={group.icon} /></span><span className="group-manager-name"><strong>{group.name}</strong><span>{apps.length} 个应用</span></span><span className="expand-arrow"><GroupActionIcon kind="expand" /></span></button><button className="icon-action" title="编辑分组" aria-label={`编辑 ${group.name}`} onClick={onEdit}><GroupActionIcon kind="edit" /></button><button className="icon-action danger" title="删除分组" aria-label={`删除 ${group.name}`} disabled={!canDelete} onClick={onDelete}><GroupActionIcon kind="delete" /></button></div>{expanded ? <div className="group-expand"><GroupAppGrid apps={apps} onAdd={onAdd} onOpenApp={onOpenApp} onContextMenu={onAppContextMenu} onPointerDown={onAppPointerDown} /></div> : null}</div>;
}

function GroupAppGrid({ apps, onAdd, onOpenApp, onContextMenu, onPointerDown }: { apps: RuntimeApp[]; onAdd: () => void; onOpenApp: (app: RuntimeApp) => void; onContextMenu: (event: React.MouseEvent, app: RuntimeApp) => void; onPointerDown: (event: React.PointerEvent, app: RuntimeApp) => void }) {
  if (!apps.length) return <div className="group-app-empty"><span>暂无应用</span><button onClick={onAdd}>添加应用</button></div>;
  return <div className="group-app-grid">{apps.map((app) => <button key={app.id} className="group-app-item" onClick={() => onOpenApp(app)} onContextMenu={(event) => onContextMenu(event, app)} onPointerDown={(event) => onPointerDown(event, app)}><span className="group-app-icon">{app.iconDataUrl ? <img src={app.iconDataUrl} draggable={false} alt="" /> : <Icon name="grid" />}{app.metrics.isRunning ? <i /> : null}</span><span title={app.name}>{app.name}</span></button>)}</div>;
}

function GroupSortPreview({ group, count, left, top, width }: { group: AppGroup; count: number; left: number; top: number; width: number }) {
  return <div className="group-sort-preview no-drag" style={{ left, top, width }}><span className="group-manager-icon"><Icon name={group.icon} /></span><span><strong>{group.name}</strong><small>{count} 个应用</small></span></div>;
}

function GroupEditDialog({ state, onClose, onSave }: { state: NonNullable<GroupEditState>; onClose: () => void; onSave: (input: GroupInput & { id?: string }) => Promise<void> }) {
  const [form, setForm] = useState(state);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const save = async () => {
    setBusy(true); setMessage("");
    try { await onSave({ id: form.id, name: form.name, icon: form.icon }); }
    catch (reason) { setMessage(cleanErrorMessage(reason, "保存分组失败")); setBusy(false); }
  };
  return <div className="modal-backdrop no-drag" onPointerDown={onClose}><form className="dialog edit-dialog" onSubmit={(event) => { event.preventDefault(); void save(); }} onPointerDown={(event) => event.stopPropagation()}><h2>{form.id ? "编辑分组" : "新建分组"}</h2><label>分组名称<input autoFocus maxLength={20} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="最多 20 个字符" /></label><fieldset className="icon-picker"><legend>分组图标</legend><div>{groupIcons.map((icon) => <button type="button" key={icon} className={form.icon === icon ? "selected" : ""} title={icon} onClick={() => setForm({ ...form, icon })}><Icon name={icon} /></button>)}</div></fieldset>{message ? <p className="dialog-error">{message}</p> : null}<div className="dialog-actions"><button type="button" className="ghost" onClick={onClose}>取消</button><button type="submit" className="launch" disabled={busy || !form.name.trim()}>{busy ? "保存中..." : "保存"}</button></div></form></div>;
}

function GroupDeleteDialog({ state, groups, appCount, onChangeTarget, onClose, onConfirm }: { state: NonNullable<GroupDeleteState>; groups: AppGroup[]; appCount: number; onChangeTarget: (id: string) => void; onClose: () => void; onConfirm: () => Promise<void> }) {
  const source = groups.find((group) => group.id === state.groupId);
  const [busy, setBusy] = useState(false);
  return <div className="modal-backdrop no-drag" onPointerDown={onClose}><div className="dialog edit-dialog" onPointerDown={(event) => event.stopPropagation()}><h2>删除分组</h2><p>删除“{source?.name}”前，需要将其中 {appCount} 个应用迁移到其他分组。</p><label>迁移到<select value={state.targetGroupId} onChange={(event) => onChangeTarget(event.target.value)}>{groups.filter((group) => group.id !== state.groupId).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><div className="dialog-actions"><button className="ghost" onClick={onClose} disabled={busy}>取消</button><button className="danger-button" disabled={busy || !state.targetGroupId} onClick={() => { setBusy(true); void onConfirm().finally(() => setBusy(false)); }}>{busy ? "处理中..." : "迁移并删除"}</button></div></div></div>;
}
function Icon({ name }: { name: string }) {
  const common = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 };
  if (name === "activity") return <svg {...common}><path d="M4 13h3l2-6 4 10 2-6h5" /><rect x="3" y="3" width="18" height="18" rx="5" /></svg>;
  if (name === "compass") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m15 9-2 5-5 2 2-5 5-2Z" /></svg>;
  if (name === "briefcase") return <svg {...common}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5h8v2M3 12h18" /></svg>;
  if (name === "wrench") return <svg {...common}><path d="M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5L15 12l-3-3 2.7-2.7Z" /></svg>;
  if (name === "settings") return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a8 8 0 0 0 0-6M4.6 9a8 8 0 0 0 0 6M8 4.8a8 8 0 0 1 8 0M16 19.2a8 8 0 0 1-8 0" /></svg>;
  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
  if (name === "play") return <svg {...common}><path d="m8 5 11 7-11 7V5Z" /></svg>;
  if (name === "star") return <svg {...common}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" /></svg>;
  if (name === "gamepad") return <svg {...common}><path d="M7 8h10a4 4 0 0 1 3.8 5.2l-1.1 3.4a2 2 0 0 1-3.3.8L14 15h-4l-2.4 2.4a2 2 0 0 1-3.3-.8l-1.1-3.4A4 4 0 0 1 7 8Z" /><path d="M7 11v4M5 13h4M16 12h.01M18 14h.01" /></svg>;
  if (name === "folder") return <svg {...common}><path d="M3 6h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" /></svg>;
  if (name === "music") return <svg {...common}><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></svg>;
  if (name === "code") return <svg {...common}><path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" /></svg>;
  return <svg {...common}><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></svg>;
}

function BrandLogo() {
  return <svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="brand-gradient" x1="4" y1="0" x2="60" y2="64" gradientUnits="userSpaceOnUse"><stop stopColor="#50d5ef" /><stop offset=".52" stopColor="#5c6df4" /><stop offset="1" stopColor="#a258eb" /></linearGradient></defs><rect width="64" height="64" rx="18" fill="url(#brand-gradient)" /><rect x="3" y="3" width="58" height="30" rx="15" fill="white" opacity=".16" /><path d="M32 13.5 36.3 27.7 50.5 32l-14.2 4.3L32 50.5l-4.3-14.2L13.5 32l14.2-4.3L32 13.5Z" fill="white" /></svg>;
}

if (typeof document !== "undefined") {
  const root = document.getElementById("root");
  if (root) createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
}

