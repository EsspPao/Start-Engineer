import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AppEntry, AppFolder, AppGroup, AppMetrics, AppPreferencesState, DiscoveredAppCandidate, EverythingSearchResult, FocusWindowHints, FolderLaunchVisualStatus, GroupGridItemId, GroupGridOrder, GroupInput, InstallableAppCandidate, InternalSearchResult, ProcessInfo, SearchDependencyStatus, SearchProvider, SectionId, StartEngineerApi, UiTheme, UpdatePreferencesInput, WallpaperGlassIntensity } from "../shared/types";
import { defaultUiLayoutPreferences } from "../shared/ui-layout-share";
import { defaultKeyboardShortcuts } from "../main/preferences";
import { GroupPage, ProcessPage, UnifiedGroupPage } from "./pages";
import { resolveAppKeyboardAction } from "./app-card-interaction";
import { sortAppsForDisplay } from "./app-display";
import { completePreviewOrder, hitTestAppOrder, reuseOrderIfEqual, type AppDragRect } from "./app-drag-order";
import { matchesAppSearch, matchesProcessSearch } from "./search";
import { buildLaunchFeedbackMessage } from "./launch-feedback";
import { shouldOfferExecutableReplacement } from "./launch-error";
import { ALL_APPS_SECTION_ID, firstAppGroupId, resolveLoadedSection } from "./navigation";
import { shouldStartProcessPrewarm, STARTUP_DEFERRED_IMPORT_MS, STARTUP_DEFERRED_RUNTIME_MS, STARTUP_PROCESS_PREWARM_MS } from "./startup-schedule";
import { findAppShortcut } from "../shared/app-shortcuts";
import { cleanErrorMessage } from "./error-message";
import { buildThemeAttributes } from "./theme-attributes";
import { collapsedFolderKeyboardSelection, expandedFolderKeyboardSelection, isEscapeKeyboardEvent, keyboardBlockKeyFromEventLike, isTextInputTarget, pickDirectionalApp, pickIndexedGroup, pickRelativeGroup, resolveFolderKeyboardAction, shouldSuppressNavigationAfterGroupMove, type AppCardRect } from "./keyboard-navigation";
import { SearchResultsPanel } from "./search-results-panel";
import { AppEditDialog, type AppEditState } from "./app-edit-dialog";
import { AppContextMenu, GroupContextMenu, ProcessContextMenu, type DisplayProcess, type MenuState } from "./context-menus";
import { ConfirmDialog, FirstRunImportDialog, ToastStack, type ConfirmState } from "./overlay-components";
import { focusHintsForApp, focusResultMessage, type RuntimeApp } from "./window-focus-feedback";
import { BrandLogo, Icon } from "./ui-icons";
import { GroupDeleteDialog, GroupEditDialog, type GroupDeleteState, type GroupEditState } from "./group-management";
import { useExecutableDrop } from "./use-executable-drop";
import { useSearchResults } from "./use-search-results";
import { useUnifiedGridDrag, type DragState, type UnifiedDragCandidate } from "./use-unified-grid-drag";
import { pageFocusSelector, resolveSearchEscapeAction, resolveSectionAppFocusTarget, shouldFocusAddedApp } from "./search-focus";
import { resolveSearchResultAction } from "./search-results-selection";
import { appSectionApps, mergeAllAppsOrder, navigationSectionIds } from "./section-apps";
import { applyKillAppResult, killAppResultHasMetrics, killAppResultHasRunningStatuses } from "./kill-app-result";
import { applyRunningStatusToMetrics } from "./running-status";
import { FAST_RUNNING_STATUS_INTERVAL_MS } from "./fast-running-status";
import { SettingsPage } from "./settings-page";
import "./styles.css";

type SortKey = "name" | "cpuPercent" | "memoryBytes" | "diskBytesPerSecond";
type ProcessFilter = "all" | "managed";
type AppGroupId = AppEntry["groupId"];
type EditState = AppEditState;

const fallbackGroups: AppGroup[] = [
  { id: "processes", name: "进程", icon: "activity", isSystem: true, order: -1 },
  { id: "games", name: "二游", icon: "compass", isSystem: false, order: 0 },
  { id: "office", name: "办公", icon: "briefcase", isSystem: false, order: 1 },
  { id: "tools", name: "工具", icon: "wrench", isSystem: false, order: 2 },
  { id: "settings", name: "设置", icon: "settings", isSystem: true, order: Number.MAX_SAFE_INTEGER }
];
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
  getAppInfo: async () => ({ version: "0.1.0", electronVersion: "browser", chromeVersion: navigator.userAgent, nodeVersion: "unavailable", platform: navigator.platform, arch: "unknown", systemVersion: "browser preview", userDataPath: "Electron 应用中可用", isPackaged: false, repositoryUrl: "https://github.com/EsspPao/Start-Engineer" }),
  openUserDataDirectory: electronOnly,
  openProjectHomepage: async () => { window.open("https://github.com/EsspPao/Start-Engineer", "_blank", "noopener,noreferrer"); },
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
  launchApp: electronOnly,
  focusAppWindow: async () => ({ focused: false }),
  focusAppWindowHandle: async () => ({ focused: false }),
  listAppWindows: async () => [],
  getAppWindowDiagnostics: async () => "",
  killApp: async () => ({ apps: [], metrics: [] }),
  killFolderApps: electronOnly,
  killGroupApps: electronOnly,
  killAllApps: electronOnly,
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
  getPreferences: async () => ({ launchAtStartup: false, closeBehavior: "tray", globalShortcutEnabled: true, globalShortcut: "Ctrl+Shift+Space", uiTheme: "apple", wallpaperGlassIntensity: 55, wallpaperGlassVariant: "dark", runAsAdministrator: false, searchProvider: "everything", sortRunningAppsFirst: true, showAppNames: false, keyboardShortcuts: defaultKeyboardShortcuts, uiLayout: defaultUiLayoutPreferences, allAppsView: { orderedAppIds: [] }, firstRunImportCompleted: false, globalShortcutStatus: "registered", isRunningAsAdministrator: false, administratorStatusLoading: false, administratorRestartRequired: false, elevatedTerminationStatus: "disabled" }),
  updatePreferences: async (input) => ({ launchAtStartup: input.launchAtStartup ?? false, closeBehavior: input.closeBehavior ?? "tray", globalShortcutEnabled: input.globalShortcutEnabled ?? true, globalShortcut: input.globalShortcut ?? "Ctrl+Shift+Space", uiTheme: input.uiTheme ?? "apple", wallpaperGlassIntensity: input.wallpaperGlassIntensity ?? 55, wallpaperGlassVariant: input.wallpaperGlassVariant ?? "dark", runAsAdministrator: input.runAsAdministrator ?? false, searchProvider: input.searchProvider ?? "everything", sortRunningAppsFirst: input.sortRunningAppsFirst ?? true, showAppNames: input.showAppNames ?? false, keyboardShortcuts: input.keyboardShortcuts ?? defaultKeyboardShortcuts, uiLayout: input.uiLayout ?? defaultUiLayoutPreferences, allAppsView: input.allAppsView ?? { orderedAppIds: [] }, firstRunImportCompleted: input.firstRunImportCompleted ?? false, everythingCliPath: input.everythingCliPath, globalShortcutStatus: "registered", isRunningAsAdministrator: false, administratorStatusLoading: false, administratorRestartRequired: Boolean(input.runAsAdministrator), elevatedTerminationStatus: "disabled" }),
  exportUiLayoutShareCode: async () => "",
  importUiLayoutShareCode: electronOnly,
  restartWithConfiguredPrivileges: electronOnly,
  onPreferencesStateChanged: () => () => undefined,
  windowAction: async () => electronOnly()
};

const api = () => window.startEngineer ?? window.commandDeck ?? fallbackApi;

function isAppKeyboardScope(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return true;
  if (target.closest(".app-card")) return true;
  if (target.closest("button, input, textarea, select, [contenteditable='true']")) return false;
  return Boolean(target.closest(".app-grid, .group-content")) || target === document.body || target.classList.contains("window") || target.classList.contains("app-shell");
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
  const [selectedGridItemId, setSelectedGridItemId] = useState<GroupGridItemId | "">("");
  const [preferences, setPreferences] = useState<AppPreferencesState>({ launchAtStartup: false, closeBehavior: "tray", globalShortcutEnabled: true, globalShortcut: "Ctrl+Shift+Space", uiTheme: "apple", wallpaperGlassIntensity: 55, wallpaperGlassVariant: "dark", runAsAdministrator: false, searchProvider: "everything", sortRunningAppsFirst: true, showAppNames: false, keyboardShortcuts: defaultKeyboardShortcuts, uiLayout: defaultUiLayoutPreferences, allAppsView: { orderedAppIds: [] }, firstRunImportCompleted: false, globalShortcutStatus: "registered", isRunningAsAdministrator: false, administratorStatusLoading: false, administratorRestartRequired: false, elevatedTerminationStatus: "disabled" });
  const [searchDependencyStatus, setSearchDependencyStatus] = useState<SearchDependencyStatus>({ state: "missing" });
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
  const unifiedDragCandidate = useRef<UnifiedDragCandidate | null>(null);
  const suppressFolderClick = useRef(false);
  const iconRefreshStarted = useRef(false);
  const runtimePollingStarted = useRef(false);
  const processPrewarmStarted = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const focusRequestSeq = useRef(0);
  const launchingAppIdsRef = useRef(new Set<string>());
  const folderLaunchClearTimers = useRef(new Map<string, number>());
  const groupNavigationBlockKeyRef = useRef<string | null>(null);
  const metricsByApp = useMemo(() => new Map(metrics.map((metric) => [metric.appId, metric])), [metrics]);
  const runtimeApps = useMemo<RuntimeApp[]>(() => apps.map((item) => ({ ...item, metrics: metricsByApp.get(item.id) ?? emptyMetrics(item.id) })), [apps, metricsByApp]);
  const appGroups = useMemo(() => groups.filter((group) => !group.isSystem).sort((a, b) => a.order - b.order), [groups]);
  const { discoveredResults, fileResults, installableResults, managedSearchResults, query, searchError, searchLoading, searchPanelOpen, searchResultCount, searchSelectedIndex, setDiscoveredResults, setFileResults, setInstallableResults, setQuery, setSearchPanelOpen, setSearchSelectedIndex } = useSearchResults({ client: api(), runtimeApps, processes });
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

  useEffect(() => api().onPreferencesStateChanged((next) => {
    setPreferences(next);
    if (next.administratorMessage) setNotice(next.administratorMessage);
  }), []);

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
      launchingAppIdsRef.current.delete(id);
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
    setLaunchingAppIds(new Set(launchingAppIdsRef.current));
  }, [folderLaunchStatuses, metrics]);

  const refreshRuntimeData = useCallback(async (mode: "full" | "managed" = "full", force = false) => {
    if (mode === "full") setProcessesLoading(true);
    try {
      const snapshot = await api().getRuntimeSnapshot(mode, force);
      if (unifiedDragCandidate.current) return;
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
            if (!cancelled && !unifiedDragCandidate.current) setMetrics((current) => applyRunningStatusToMetrics(current, statuses));
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

  const setAppsClosing = useCallback((ids: string[], closing: boolean) => {
    for (const id of ids) {
      if (closing) launchingAppIdsRef.current.add(id);
      else launchingAppIdsRef.current.delete(id);
    }
    setLaunchingAppIds(new Set(launchingAppIdsRef.current));
  }, []);

  const closeApp = useCallback(async (appId: string) => {
    setError("");
    let refreshedByKill = false;
    setAppsClosing([appId], true);
    try {
      const result = await api().killApp(appId);
      const next = applyKillAppResult(result);
      setApps(next.apps);
      if (next.metrics) {
        setMetrics(next.metrics);
        refreshedByKill = killAppResultHasMetrics(result);
      }
      if (next.runningStatuses) {
        setMetrics((current) => applyRunningStatusToMetrics(current, next.runningStatuses!));
        refreshedByKill = killAppResultHasRunningStatuses(result);
      }
    } catch (reason) {
      setError(cleanErrorMessage(reason, "结束应用失败"));
    } finally {
      if (!refreshedByKill) {
        await refreshRuntimeData(activeSection === "processes" ? "full" : "managed", true);
      }
      setAppsClosing([appId], false);
    }
  }, [activeSection, refreshRuntimeData, setAppsClosing]);

  const requestCloseApp = useCallback((app: RuntimeApp) => setConfirm({
    title: "结束应用进程",
    message: `确定结束 ${app.name} 的全部相关进程吗？`,
    confirmLabel: "结束进程",
    onConfirm: async () => { await closeApp(app.id); }
  }), [closeApp]);

  const closeFolderApps = useCallback(async (folderId: string) => {
    const memberIds = folders.find((folder) => folder.id === folderId)?.appIds.filter((id) => runtimeApps.find((app) => app.id === id)?.metrics.isRunning) ?? [];
    setAppsClosing(memberIds, true);
    try {
      setError("");
      const result = await api().killFolderApps(folderId);
      setApps(result.apps);
      if (result.runningStatuses) setMetrics((current) => applyRunningStatusToMetrics(current, result.runningStatuses!));
      else await refreshRuntimeData(activeSection === "processes" ? "full" : "managed", true);
      const stopped = result.results.filter((item) => item.status === "terminated").length;
      const remaining = result.results.filter((item) => item.status !== "terminated");
      setNotice(`已关闭 ${stopped} 个应用`);
      if (remaining.length) setError(remaining.map((item) => `${item.name}：${item.message || "结束失败"}`).join("；"));
    } catch (reason) {
      setError(cleanErrorMessage(reason, "结束卡片内应用失败"));
    } finally {
      setAppsClosing(memberIds, false);
    }
  }, [activeSection, folders, refreshRuntimeData, runtimeApps, setAppsClosing]);

  const requestCloseFolder = useCallback((folderId: string) => {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) return;
    const members = folder.appIds
      .map((id) => runtimeApps.find((app) => app.id === id))
      .filter((app): app is RuntimeApp => Boolean(app))
      .filter((app) => app.metrics.isRunning);
    if (!members.length) return;
    setConfirm({
      title: "结束卡片内全部应用",
      message: `确定结束 ${members.map((app) => app.name).join("、")} 的全部相关进程吗？`,
      confirmLabel: "全部结束",
      onConfirm: async () => { await closeFolderApps(folderId); }
    });
  }, [closeFolderApps, folders, runtimeApps]);

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

  useUnifiedGridDrag({
    client: api(),
    activeSection: String(activeSection),
    apps,
    folders,
    candidateRef: unifiedDragCandidate,
    setDrag,
    applyFolderMutation,
    setFolders,
    setGroupGridOrders,
    setError,
    onGroupTransfer: playGroupTransferFeedback,
  });

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
  const activeGroupApps = useMemo(
    () => appSectionApps(activeSection, runtimeApps, preferences.allAppsView.orderedAppIds),
    [activeSection, preferences.allAppsView.orderedAppIds, runtimeApps]
  );
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
  const expandedFolderMemberItemIds = useMemo<GroupGridItemId[]>(() => {
    const folder = activeFolders.find((item) => item.id === expandedFolderId);
    if (!folder) return [];
    const available = new Set(runtimeApps.map((app) => app.id));
    return folder.appIds.filter((id) => available.has(id)).map((id) => `app:${id}` as const);
  }, [activeFolders, expandedFolderId, runtimeApps]);
  const selectableGridItemOrder = useMemo<GroupGridItemId[]>(
    () => [...activeGridItemOrder, ...expandedFolderMemberItemIds],
    [activeGridItemOrder, expandedFolderMemberItemIds]
  );
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
  useEffect(() => {
    if (!isAppSection || !isAllAppsSection) return;
    if (!visibleApps.some((app) => app.id === selectedAppId)) setSelectedAppId(visibleApps[0]?.id ?? "");
  }, [isAllAppsSection, isAppSection, selectedAppId, visibleApps]);

  useEffect(() => {
    if (!isAppSection || isAllAppsSection) {
      if (selectedGridItemId) setSelectedGridItemId("");
      return;
    }
    const nextItemId = selectedGridItemId && selectableGridItemOrder.includes(selectedGridItemId)
      ? selectedGridItemId
      : selectableGridItemOrder[0] ?? "";
    if (nextItemId !== selectedGridItemId) setSelectedGridItemId(nextItemId);
    if (nextItemId.startsWith("app:")) {
      const appId = nextItemId.slice(4);
      if (selectedAppId !== appId) setSelectedAppId(appId);
    } else if (selectedAppId) {
      setSelectedAppId("");
    }
  }, [isAllAppsSection, isAppSection, selectableGridItemOrder, selectedAppId, selectedGridItemId]);
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
  const closeExpandedFolder = useCallback((folderId: string) => {
    const selection = collapsedFolderKeyboardSelection(folderId);
    setExpandedFolderId(selection.expandedFolderId);
    setSelectedGridItemId(selection.selectedItemId);
    setSelectedAppId(selection.selectedAppId);
  }, []);
  useEffect(() => {
    if (!expandedFolderId) return;
    const onExpandedFolderEscape = (event: KeyboardEvent) => {
      if (!isEscapeKeyboardEvent(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeExpandedFolder(expandedFolderId);
    };
    window.addEventListener("keydown", onExpandedFolderEscape, true);
    return () => window.removeEventListener("keydown", onExpandedFolderEscape, true);
  }, [closeExpandedFolder, expandedFolderId]);
  const focusAppCardById = useCallback((sectionId: string, appId: string) => {
    searchInputRef.current?.blur();
    const selector = pageFocusSelector(sectionId, appId);
    focusSelectorAfterRender(selector);
  }, [focusSelectorAfterRender]);
  const { fileDropActive, handleFileDragEnter, handleFileDragLeave, handleFileDragOver, handleFileDrop } = useExecutableDrop({
    client: api(),
    activeSection,
    appGroupIds: appGroups.map((group) => group.id),
    onAppsChange: setApps,
    onError: setError,
    onNotice: setNotice,
    onSearchDismiss: () => {
      setSearchPanelOpen(false);
      setQuery("");
    },
    onAdded: (groupId, appId) => {
      setActiveSection(groupId);
      setSelectedAppId(appId);
      focusAppCardById(groupId, appId);
    },
    refreshRuntimeData,
  });

  const switchSection = (id: SectionId) => {
    if (drag) return;
    if (id === "processes" && !processes.length) setProcessesLoading(true);
    setActiveSection(id);
    setSelectedGridItemId("");
    setQuery("");
    closeFloatingUi();
    if (id === ALL_APPS_SECTION_ID) {
      const sectionApps = appSectionApps(id, runtimeApps, preferences.allAppsView.orderedAppIds);
      const visibleAppIds = sortAppsForDisplay(sectionApps, preferences.sortRunningAppsFirst).map((app) => app.id);
      const focusTarget = resolveSectionAppFocusTarget(id, visibleAppIds);
      setSelectedAppId(focusTarget.selectedAppId);
      focusSelectorAfterRender(focusTarget.selector);
    } else if (appGroups.some((group) => group.id === id)) {
      setSelectedAppId("");
      focusSelectorAfterRender(".unified-grid");
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
  const launchApp = async (id: string) => {
    if (launchingAppIdsRef.current.has(id)) return;
    const appName = runtimeApps.find((app) => app.id === id)?.name ?? "应用";
    launchingAppIdsRef.current.add(id);
    setLaunchingAppIds(new Set(launchingAppIdsRef.current));
    setFolderLaunchStatuses((current) => ({ ...current, [id]: "launching" }));
    let waitingForRuntime = false;
    try {
      setError("");
      setNotice(buildLaunchFeedbackMessage("starting", appName));
      const result = await api().launchApp(id);
      setApps(result.apps);
      if (result.status === "failed") {
        setNotice("");
        const failedApp = runtimeApps.find((item) => item.id === id);
        if (shouldOfferExecutableReplacement(failedApp, result)) {
          setInvalidAppIds((current) => new Set(current).add(id));
          setError(result.message || "程序路径不存在，请重新选择启动程序。");
          if (failedApp) editApp(failedApp);
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
      if (result.status === "launched") {
        waitingForRuntime = true;
        setFolderLaunchStatuses((current) => ({ ...current, [id]: "waiting" }));
        const previousTimer = folderLaunchClearTimers.current.get(id);
        if (previousTimer) window.clearTimeout(previousTimer);
        folderLaunchClearTimers.current.set(id, window.setTimeout(() => {
          launchingAppIdsRef.current.delete(id);
          setLaunchingAppIds(new Set(launchingAppIdsRef.current));
          setFolderLaunchStatuses((current) => {
            const next = { ...current };
            delete next[id];
            return next;
          });
          folderLaunchClearTimers.current.delete(id);
          setNotice(`${appName} 已收到启动请求，仍在等待运行状态`);
        }, 60000));
        void api().getManagedRunningStatus()
          .then((statuses) => setMetrics((current) => applyRunningStatusToMetrics(current, statuses)))
          .catch(() => undefined);
      } else if (result.status === "alreadyRunning") {
        const statuses = await api().getManagedRunningStatus();
        setMetrics((current) => applyRunningStatusToMetrics(current, statuses));
      }
    } catch (reason) {
      setNotice("");
      setError(cleanErrorMessage(reason, "启动失败，请检查程序路径和启动参数。"));
    } finally {
      if (!waitingForRuntime) {
        launchingAppIdsRef.current.delete(id);
        setLaunchingAppIds(new Set(launchingAppIdsRef.current));
        setFolderLaunchStatuses((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      }
    }
  };
  const launchFolderWithFeedback = async (folderId: string) => {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) return;
    const memberIds = folder.appIds.filter((id) => runtimeApps.some((app) => app.id === id));
    if (!memberIds.length || memberIds.some((id) => folderLaunchStatuses[id] === "queued" || folderLaunchStatuses[id] === "launching")) return;
    closeExpandedFolder(folderId);
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
      void api().getManagedRunningStatus()
        .then((statuses) => setMetrics((current) => applyRunningStatusToMetrics(current, statuses)))
        .catch(() => undefined);
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
    if (!isAllAppsSection) setSelectedGridItemId(`app:${app.id}`);
  };
  const handleLaunchingFeedback = (app: RuntimeApp) => {
    setNotice(buildLaunchFeedbackMessage("starting", app.name));
  };
  const requestCloseGroupApps = () => {
    setError("");
    if (isAllAppsSection) {
      const runningApps = runtimeApps.filter((app) => app.metrics.isRunning);
      if (!runningApps.length) {
        setNotice("没有运行中的已添加应用");
        return;
      }
      setConfirm({
        title: "关闭全部已添加应用",
        message: `将结束 ${runningApps.length} 个应用：${runningApps.map((app) => app.name).join("、")}。是否继续？`,
        confirmLabel: "关闭全部",
        onConfirm: async () => {
          const ids = runningApps.map((app) => app.id);
          setAppsClosing(ids, true);
          try {
            const result = await api().killAllApps();
            setApps(result.apps);
            if (result.runningStatuses) setMetrics((current) => applyRunningStatusToMetrics(current, result.runningStatuses!));
            else await refreshRuntimeData("managed", true);
            const stopped = result.results.filter((item) => item.status === "terminated").length;
            const remaining = result.results.filter((item) => item.status !== "terminated");
            setNotice(`已关闭 ${stopped} 个应用`);
            if (remaining.length) setError(remaining.map((item) => `${item.name}：${item.message || "结束失败"}`).join("；"));
          } finally {
            setAppsClosing(ids, false);
          }
        }
      });
      return;
    }
    if (!activeGroup || activeGroup.isSystem) return;
    const runningApps = runtimeApps.filter((app) => app.groupId === activeGroup.id && app.metrics.isRunning);
    if (!runningApps.length) {
      setNotice("当前分组没有运行中的应用");
      return;
    }
    setConfirm({
      title: "关闭当前分组全部应用",
      message: `将结束 ${runningApps.length} 个应用：${runningApps.map((app) => app.name).join("、")}。是否继续？`,
      confirmLabel: "关闭全部",
      onConfirm: async () => {
        const ids = runningApps.map((app) => app.id);
        setAppsClosing(ids, true);
        try {
          const result = await api().killGroupApps(activeGroup.id);
          setApps(result.apps);
          if (result.runningStatuses) setMetrics((current) => applyRunningStatusToMetrics(current, result.runningStatuses!));
          else await refreshRuntimeData("managed", true);
          const stopped = result.results.filter((item) => item.status === "terminated").length;
          const remaining = result.results.filter((item) => item.status !== "terminated");
          setNotice(`已关闭 ${stopped} 个应用`);
          if (remaining.length) setError(remaining.map((item) => `${item.name}：${item.message || "结束失败"}`).join("；"));
        } finally {
          setAppsClosing(ids, false);
        }
      }
    });
  };
  const editApp = (app: AppEntry) => setEdit({ id: app.id, name: app.name, executablePath: app.executablePath, launchArgs: app.launchArgs ?? "", appUserModelId: app.appUserModelId });
  const runKeyboardAppAction = useCallback((app: RuntimeApp, command: "activate" | "menu" | "edit", menuPosition?: { x: number; y: number }) => {
    const action = command === "activate" ? resolveAppKeyboardAction({
      isRunning: app.metrics.isRunning,
      isLaunching: launchingAppIdsRef.current.has(app.id),
      isInvalid: invalidAppIds.has(app.id)
    }, "Enter") : command === "menu" ? "context-menu" : "edit";
    if (action === "launching-feedback") handleLaunchingFeedback(app);
    else if (action === "focus") void focusAppWindow(app);
    else if (action === "launch") void launchApp(app.id);
    else if (action === "context-menu") openMenu({ kind: "app", x: menuPosition?.x ?? window.innerWidth / 2, y: menuPosition?.y ?? window.innerHeight / 2, appId: app.id });
    else if (action === "edit") editApp(app);
  }, [focusAppWindow, invalidAppIds]);  const saveGroup = async (input: GroupInput & { id?: string }) => {
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
    const usesUnifiedGrid = isAppSection && !isAllAppsSection;
    const activeItemId = usesUnifiedGrid
      ? (selectedGridItemId && selectableGridItemOrder.includes(selectedGridItemId) ? selectedGridItemId : selectableGridItemOrder[0] ?? "")
      : selectedAppId;
    const selectedApp = usesUnifiedGrid
      ? (activeItemId.startsWith("app:") ? runtimeApps.find((app) => app.id === activeItemId.slice(4)) : undefined)
      : displayedApps.find((app) => app.id === selectedAppId) ?? displayedApps[0];
    const selectedFolderId = usesUnifiedGrid && activeItemId.startsWith("folder:") ? activeItemId.slice(7) : "";
    const hasModal = Boolean(confirm || edit || groupEdit || groupDelete || importCandidates.length);
    const selectedCardRect = () => {
      const isExpandedMember = expandedFolderMemberItemIds.includes(activeItemId as GroupGridItemId);
      const selector = usesUnifiedGrid && activeItemId
        ? isExpandedMember
          ? `.folder-zoom-card [data-folder-member-id="${CSS.escape(activeItemId.slice(4))}"]`
          : `.unified-grid > [data-grid-item-id="${CSS.escape(activeItemId)}"]`
        : selectedApp ? `.group-content:not(.unified-content) [data-app-card-id="${CSS.escape(selectedApp.id)}"]` : "";
      const element = selector ? document.querySelector<HTMLElement>(selector) : null;
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
    const navigatingExpandedMembers = usesUnifiedGrid && expandedFolderMemberItemIds.length > 0;
    const appCardRects = () => [...document.querySelectorAll<HTMLElement>(navigatingExpandedMembers ? ".folder-zoom-card [data-folder-member-id]" : usesUnifiedGrid ? ".unified-grid > [data-grid-item-id]" : ".group-content:not(.unified-content) [data-app-card-id]")].map((element): AppCardRect => {
      const bounds = element.getBoundingClientRect();
      return {
        id: navigatingExpandedMembers ? `app:${element.dataset.folderMemberId ?? ""}` : usesUnifiedGrid ? element.dataset.gridItemId ?? "" : element.dataset.appCardId ?? "",
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
        if (expandedFolderId) { event.preventDefault(); closeExpandedFolder(expandedFolderId); return; }
        if (closeTopLayer()) { event.preventDefault(); return; }
        if (query) { event.preventDefault(); setQuery(""); setSearchPanelOpen(false); return; }
        if (isAppSection && (selectedAppId || selectedGridItemId)) { event.preventDefault(); setSelectedAppId(""); setSelectedGridItemId(""); }
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
        const nextId = pickDirectionalApp(cards, activeItemId || (cards[0]?.id ?? ""), direction) || cards[0]?.id || "";
        if (nextId) {
          if (usesUnifiedGrid) {
            const itemId = nextId as GroupGridItemId;
            setSelectedGridItemId(itemId);
            setSelectedAppId(itemId.startsWith("app:") ? itemId.slice(4) : "");
            const selector = expandedFolderMemberItemIds.includes(itemId)
              ? `.folder-zoom-card [data-folder-member-id="${CSS.escape(itemId.slice(4))}"]`
              : `.unified-grid > [data-grid-item-id="${CSS.escape(itemId)}"]`;
            document.querySelector<HTMLElement>(selector)?.scrollIntoView({ block: "nearest", inline: "nearest" });
          } else {
            setSelectedAppId(nextId);
            document.querySelector<HTMLElement>(`.group-content:not(.unified-content) [data-app-card-id="${CSS.escape(nextId)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
          }
        }
        return;
      }
      const folderAction = resolveFolderKeyboardAction(command, Boolean(selectedFolderId), Boolean(expandedFolderId));
      if (folderAction) {
        event.preventDefault();
        if (folderAction === "expand") {
          const folder = activeFolders.find((item) => item.id === selectedFolderId);
          if (folder) {
            const selection = expandedFolderKeyboardSelection(folder.id, folder.appIds, runtimeApps.map((app) => app.id));
            setExpandedFolderId(selection.expandedFolderId);
            setSelectedGridItemId(selection.selectedItemId);
            setSelectedAppId(selection.selectedAppId);
          }
        } else void launchFolderWithFeedback(selectedFolderId || expandedFolderId);
        return;
      }
      if (!selectedApp) return;
      if (command === "activate" || command === "edit") { event.preventDefault(); runKeyboardAppAction(selectedApp, command); }
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
  }, [activeFolders, activeSection, appGroups, closeExpandedFolder, closeMenu, confirm, displayedApps, edit, expandedFolderId, expandedFolderMemberItemIds, groupDelete, groupEdit, importCandidates.length, isAllAppsSection, isAppSection, menu, preferences.keyboardShortcuts, query, runKeyboardAppAction, runtimeApps, searchPanelOpen, selectableGridItemOrder, selectedAppId, selectedGridItemId]);

  return (
    <main className={`app-shell drag-region ${fileDropActive ? "file-drop-active" : ""}`} style={{ ...themeAttributes.wallpaperStyle, "--ui-scale": preferences.uiLayout.uiScale / 100, "--ui-scale-width": `${10000 / preferences.uiLayout.uiScale}vw`, "--ui-scale-height": `${10000 / preferences.uiLayout.uiScale}vh`, "--ui-background-color": preferences.uiLayout.backgroundColor || "transparent" } as unknown as React.CSSProperties} data-theme={themeAttributes.theme} data-wallpaper-intensity={themeAttributes.wallpaperIntensity} data-wallpaper-variant={themeAttributes.wallpaperVariant} data-ui-card-size={preferences.uiLayout.cardSize} data-ui-grid-density={preferences.uiLayout.gridDensity} data-ui-sidebar-width={preferences.uiLayout.sidebarWidth} data-ui-brand-icon-size={preferences.uiLayout.brandIconSize} data-ui-background-tone={preferences.uiLayout.backgroundTone} data-ui-custom-background={preferences.uiLayout.backgroundColor ? "true" : "false"} data-ui-show-running-status={preferences.uiLayout.showRunningStatus ? "true" : "false"} data-ui-show-search-bar={preferences.uiLayout.showSearchBar ? "true" : "false"} data-ui-show-batch-actions={preferences.uiLayout.showBatchActions ? "true" : "false"} onPointerDown={closeFloatingUi} onDragEnter={handleFileDragEnter} onDragOver={handleFileDragOver} onDragLeave={handleFileDragLeave} onDrop={handleFileDrop}>
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
          : activeSection === "settings" ? <SettingsPage client={api()} apps={runtimeApps} groups={appGroups} preferences={preferences} onPreferencesChange={savePreferences} onWallpaperIntensityPreview={previewWallpaperGlassIntensity} onThemeChange={saveTheme} onAdd={addApp} onAddToGroup={(groupId) => void runAppAction(() => api().addAppFromDialog(groupId))} onCreate={() => setGroupEdit({ name: "", icon: "grid" })} onEdit={(group) => setGroupEdit({ id: group.id, name: group.name, icon: group.icon })} onDelete={requestDeleteGroup} onReorder={reorderGroups} onOpenApp={(app) => { setActiveSection(app.groupId); setSelectedAppId(app.id); }} onAppContextMenu={(event, app) => { event.preventDefault(); event.stopPropagation(); openMenu({ kind: "app", x: event.clientX, y: event.clientY, appId: app.id }); }} onMoveApp={moveAppWithinSettings} />
          : <GroupPage apps={displayedApps} folders={folders.filter((folder) => folder.groupId === activeSection)} launchingAppIds={launchingAppIds} selectedAppId={selectedAppId} invalidAppIds={invalidAppIds} draggingAppId={drag?.appId} runningCount={activeGroupApps.filter((app) => app.metrics.isRunning).length} showAppNames={preferences.uiLayout.showAppNames} onSelectApp={handleAppSelection} onFocusApp={(app) => void focusAppWindow(app)} onLaunchApp={(app) => void launchApp(app.id)} onLaunchingFeedback={handleLaunchingFeedback} onCloseAll={() => void requestCloseGroupApps()} onAdd={addApp} onContextMenu={(event, app) => { event.preventDefault(); event.stopPropagation(); if (!drag) openMenu({ kind: "app", x: event.clientX, y: event.clientY, appId: app.id }); }} onPointerDown={(event, app) => { if (event.button !== 0) return; const rect = event.currentTarget.getBoundingClientRect(); dragCandidate.current = { appId: app.id, sourceGroupId: app.groupId, startX: event.clientX, startY: event.clientY, grabOffsetX: event.clientX - rect.left, grabOffsetY: event.clientY - rect.top, width: rect.width, height: rect.height, initialOrder: displayedApps.map((item) => item.id) }; }} onRequestClose={requestCloseApp} onFolderDrop={(folderId) => { const appId = drag?.appId; const folder = folders.find((item) => item.id === folderId); if (!appId || !folder || folder.appIds.includes(appId)) return; void api().updateFolder({ id: folderId, appIds: [...folder.appIds, appId] }).then(setFolders); }} onLaunchFolder={(folderId) => void api().launchFolder(folderId).then((result) => { setApps(result.apps); setNotice(`已处理 ${result.results.length} 个应用`); })} />}
        {isAppSection && !isAllAppsSection ? <UnifiedGroupPage apps={visibleApps} allApps={runtimeApps} folders={activeFolders} itemOrder={activeGridItemOrder} expandedFolderId={expandedFolderId} launchingAppIds={launchingAppIds} folderLaunchStatuses={folderLaunchStatuses} selectedItemId={selectedGridItemId} invalidAppIds={invalidAppIds} draggingItemId={drag?.itemId} runningCount={activeGroupApps.filter((app) => app.metrics.isRunning).length} showAppNames={preferences.uiLayout.showAppNames} onSelectApp={handleAppSelection} onSelectFolder={(folderId) => { setSelectedGridItemId(`folder:${folderId}`); setSelectedAppId(""); }} onFocusApp={(app) => void focusAppWindow(app)} onLaunchApp={(app) => void launchApp(app.id)} onLaunchingFeedback={handleLaunchingFeedback} onCloseAll={() => void requestCloseGroupApps()} onAdd={addApp} onContextMenu={(event, app) => { event.preventDefault(); event.stopPropagation(); if (!drag) openMenu({ kind: "app", x: event.clientX, y: event.clientY, appId: app.id }); }} onAppPointerDown={(event, app, sourceFolderId) => { if (event.button !== 0) return; const rect = event.currentTarget.getBoundingClientRect(); unifiedDragCandidate.current = { kind: "app", appId: app.id, sourceFolderId, itemId: `app:${app.id}`, startX: event.clientX, startY: event.clientY, grabOffsetX: event.clientX - rect.left, grabOffsetY: event.clientY - rect.top, width: rect.width, height: rect.height }; }} onFolderPointerDown={(event, folder) => { if (event.button !== 0) return; const rect = event.currentTarget.getBoundingClientRect(); unifiedDragCandidate.current = { kind: "folder", folderId: folder.id, itemId: `folder:${folder.id}`, startX: event.clientX, startY: event.clientY, grabOffsetX: event.clientX - rect.left, grabOffsetY: event.clientY - rect.top, width: rect.width, height: rect.height }; }} onToggleFolder={(folderId) => { if (document.documentElement.dataset.cardDragging) return; if (expandedFolderId === folderId) closeExpandedFolder(folderId); else { setExpandedFolderId(folderId); setSelectedGridItemId(`folder:${folderId}`); setSelectedAppId(""); } }} onLaunchFolder={(folderId) => { void launchFolderWithFeedback(folderId); }} onRequestCloseFolder={requestCloseFolder} onRequestClose={requestCloseApp} /> : null}
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


if (typeof document !== "undefined") {
  const root = document.getElementById("root");
  if (root) createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
}

