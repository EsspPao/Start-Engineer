import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AppEntry, AppGroup, AppMetrics, AppPreferencesState, EverythingSearchResult, GroupInput, InternalSearchResult, ProcessInfo, SearchDependencyStatus, SearchProvider, SectionId, StartEngineerApi, UiTheme, UpdateAppInput, UpdatePreferencesInput } from "../shared/types";
import { GroupPage, ProcessPage } from "./pages";
import { sortAppsForDisplay } from "./app-display";
import { buildInternalSearchResults, matchesAppSearch, matchesProcessSearch } from "./search";
import { SEARCH_RESULT_OPTION_ATTRIBUTE, scrollSelectedSearchResultIntoView } from "./search-panel-behavior";
import { buildLaunchFeedbackMessage } from "./launch-feedback";
import { shortcutFromKeyboardEvent, validateShortcut } from "../shared/global-shortcut";
import { resolveUiTheme } from "../shared/theme";
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
type EditState = { id: string; name: string; launchArgs: string; workingDirectory: string } | null;
type DragState = { appId: string; x: number; y: number; grabOffsetX: number; grabOffsetY: number; targetGroup?: AppGroupId } | null;
type GroupEditState = { id?: string; name: string; icon: string } | null;
type GroupDeleteState = { groupId: string; targetGroupId: string } | null;

const fallbackGroups: AppGroup[] = [
  { id: "processes", name: "进程", icon: "activity", isSystem: true, order: -1 },
  { id: "games", name: "二游", icon: "compass", isSystem: false, order: 0 },
  { id: "office", name: "办公", icon: "briefcase", isSystem: false, order: 1 },
  { id: "tools", name: "工具", icon: "wrench", isSystem: false, order: 2 },
  { id: "settings", name: "设置", icon: "settings", isSystem: true, order: Number.MAX_SAFE_INTEGER }
];
const groupIcons = ["compass", "briefcase", "wrench", "grid", "star", "gamepad", "folder", "music", "code"];
export const SEARCH_INPUT_PLACEHOLDER = "搜索";
const themeOptions: Array<{ id: UiTheme; name: string; description: string }> = [
  { id: "fluent", name: "Fluent 任务中心", description: "清爽原生的 Windows 11 风格" },
  { id: "midnight", name: "Midnight Control", description: "高对比深色控制中心" },
  { id: "utility", name: "Modern Utility", description: "暖白、深色侧栏与亮绿强调" },
  { id: "glass", name: "Refined Glass", description: "克制的蓝紫玻璃质感" },
  { id: "system", name: "跟随 Windows", description: "浅色 Utility，深色 Midnight" }
];

const electronOnly = () => Promise.reject(new Error("此操作需要在 Electron 应用窗口中运行"));
const fallbackApi: StartEngineerApi = {
  listGroups: async () => fallbackGroups,
  createGroup: electronOnly,
  updateGroup: electronOnly,
  reorderGroups: electronOnly,
  removeGroup: electronOnly,
  listApps: async () => [],
  refreshAppIcons: async () => [],
  addAppFromDialog: electronOnly,
  pickExecutable: electronOnly,
  updateApp: async () => [],
  setAppGroup: async () => [],
  setAppLaunchSelected: async () => [],
  setGroupLaunchSelected: async () => [],
  launchApp: electronOnly,
  launchSelectedApps: electronOnly,
  killApp: async () => [],
  killGroupApps: electronOnly,
  removeApp: async () => [],
  killProcessGroup: async () => electronOnly(),
  showItemInFolder: async () => electronOnly(),
  writeClipboardText: async () => electronOnly(),
  getMetricsSnapshot: async () => [],
  getProcessSnapshot: async () => [],
  getRuntimeSnapshot: async () => ({ apps: [], metrics: [], processes: [] }),
  searchEverything: electronOnly,
  pickEverythingCli: electronOnly,
  getSearchDependencyStatus: async () => ({ state: "missing", message: "Electron 环境中才可准备搜索依赖" }),
  prepareSearchDependencies: electronOnly,
  openSearchDependencyFolder: electronOnly,
  openSearchResult: async () => electronOnly(),
  showSearchResultInFolder: async () => electronOnly(),
  getPreferences: async () => ({ launchAtStartup: false, closeBehavior: "tray", globalShortcutEnabled: true, globalShortcut: "Ctrl+Shift+Space", uiTheme: "utility", runAsAdministrator: false, searchProvider: "everything", sortRunningAppsFirst: true, globalShortcutStatus: "registered", isRunningAsAdministrator: false, administratorRestartRequired: false }),
  updatePreferences: async (input) => ({ launchAtStartup: input.launchAtStartup ?? false, closeBehavior: input.closeBehavior ?? "tray", globalShortcutEnabled: input.globalShortcutEnabled ?? true, globalShortcut: input.globalShortcut ?? "Ctrl+Shift+Space", uiTheme: input.uiTheme ?? "utility", runAsAdministrator: input.runAsAdministrator ?? false, searchProvider: input.searchProvider ?? "everything", sortRunningAppsFirst: input.sortRunningAppsFirst ?? true, everythingCliPath: input.everythingCliPath, globalShortcutStatus: "registered", isRunningAsAdministrator: false, administratorRestartRequired: Boolean(input.runAsAdministrator) }),
  restartWithConfiguredPrivileges: electronOnly,
  windowAction: async () => electronOnly()
};

const api = () => window.startEngineer ?? window.commandDeck ?? fallbackApi;
const emptyMetrics = (appId: string): AppMetrics => ({ appId, isRunning: false, cpuPercent: 0, memoryBytes: 0, diskBytesPerSecond: 0, pids: [] });
const cleanErrorMessage = (reason: unknown, fallback = "操作失败") => {
  const message = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : fallback;
  return message
    .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, "")
    .replace(/^Error:\s*/i, "")
    .trim() || fallback;
};

function App() {
  const [groups, setGroups] = useState(fallbackGroups);
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [metrics, setMetrics] = useState<AppMetrics[]>([]);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [activeSection, setActiveSection] = useState<SectionId>("processes");
  const [selectedAppId, setSelectedAppId] = useState("");
  const [query, setQuery] = useState("");
  const [preferences, setPreferences] = useState<AppPreferencesState>({ launchAtStartup: false, closeBehavior: "tray", globalShortcutEnabled: true, globalShortcut: "Ctrl+Shift+Space", uiTheme: "utility", runAsAdministrator: false, searchProvider: "everything", sortRunningAppsFirst: true, globalShortcutStatus: "registered", isRunningAsAdministrator: false, administratorRestartRequired: false });
  const [everythingResults, setEverythingResults] = useState<EverythingSearchResult[]>([]);
  const [searchDependencyStatus, setSearchDependencyStatus] = useState<SearchDependencyStatus>({ state: "missing" });
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [searchSelectedIndex, setSearchSelectedIndex] = useState(0);
  const [systemIsDark, setSystemIsDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [sortKey, setSortKey] = useState<SortKey>("cpuPercent");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [processFilter, setProcessFilter] = useState<ProcessFilter>("all");
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
  const [launchingAppIds, setLaunchingAppIds] = useState<Set<string>>(new Set());
  const dragCandidate = useRef<{ appId: string; startX: number; startY: number; grabOffsetX: number; grabOffsetY: number } | null>(null);
  const iconRefreshStarted = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchRequest = useRef(0);
  const launchingAppIdsRef = useRef(new Set<string>());
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

  useEffect(() => {
    const resolvedTheme = resolveUiTheme(preferences.uiTheme, systemIsDark);
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme === "midnight" ? "dark" : "light";
    window.localStorage.setItem("start-engineer-ui-theme", preferences.uiTheme);
  }, [preferences.uiTheme, systemIsDark]);

  const refreshRuntimeData = useCallback(async (mode: "full" | "managed" = "full", force = false) => {
    try {
      const snapshot = await api().getRuntimeSnapshot(mode, force);
      setApps(snapshot.apps);
      setMetrics(snapshot.metrics);
      if (mode === "full") setProcesses(snapshot.processes);
    } catch (reason) {
      setError(cleanErrorMessage(reason, "资源监控刷新失败"));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let running = false;
    void Promise.all([api().listGroups(), api().listApps(), api().getPreferences()]).then(([nextGroups, nextApps, nextPreferences]) => {
      if (cancelled) return;
      setGroups(nextGroups.length ? nextGroups : fallbackGroups);
      setApps(nextApps);
      setPreferences(nextPreferences);
      if (!iconRefreshStarted.current) {
        iconRefreshStarted.current = true;
        window.requestAnimationFrame(() => void api().refreshAppIcons().then(setApps).catch((reason) => setError(cleanErrorMessage(reason, "应用图标刷新失败"))));
      }
    }).catch((reason) => setError(cleanErrorMessage(reason, "基础数据加载失败")));
    void api().getSearchDependencyStatus().then(setSearchDependencyStatus).catch(() => setSearchDependencyStatus({ state: "missing" }));
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
    start();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", start);
    };
  }, [activeSection, refreshRuntimeData]);

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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f" && activeSection !== "settings") {
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
      await refreshRuntimeData(activeSection === "processes" ? "full" : "managed", true);
    } catch (reason) {
      setError(cleanErrorMessage(reason));
    }
  }, [activeSection, refreshRuntimeData]);

  const closeApp = useCallback(async (appId: string) => {
    setError("");
    try {
      const nextApps = await api().killApp(appId);
      setApps(nextApps);
    } finally {
      await refreshRuntimeData(activeSection === "processes" ? "full" : "managed", true);
    }
  }, [activeSection, refreshRuntimeData]);

  const requestCloseApp = useCallback((app: RuntimeApp) => setConfirm({
    title: "结束应用进程",
    message: `确定结束 ${app.name} 的全部相关进程吗？`,
    confirmLabel: "结束进程",
    onConfirm: async () => { await closeApp(app.id); }
  }), [closeApp]);

  const savePreferences = useCallback(async (input: UpdatePreferencesInput) => {
    try {
      setError("");
      const next = await api().updatePreferences(input);
      setPreferences(next);
      return next;
    } catch (reason) {
      setError(cleanErrorMessage(reason, "偏好设置保存失败"));
      throw reason;
    }
  }, []);

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
      setApps(await api().setAppGroup(appId, targetGroup));
      setActiveSection(targetGroup);
      setSelectedAppId(appId);
      setQuery("");
      closeMenu();
    } catch (reason) {
      setError(cleanErrorMessage(reason, "移动应用失败"));
    }
  }, [apps, closeMenu]);
  const moveAppWithinSettings = useCallback(async (appId: string, targetGroup: AppGroupId) => {
    const current = apps.find((item) => item.id === appId);
    if (!current || current.groupId === targetGroup) return;
    try {
      setApps(await api().setAppGroup(appId, targetGroup));
      closeMenu();
    } catch (reason) {
      setError(cleanErrorMessage(reason, "移动应用失败"));
    }
  }, [apps, closeMenu]);

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
      setDrag({ appId: candidate.appId, x: event.clientX, y: event.clientY, grabOffsetX: candidate.grabOffsetX, grabOffsetY: candidate.grabOffsetY, targetGroup: targetGroup && app?.groupId !== targetGroup ? targetGroup : undefined });
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
      dragCandidate.current = null;
      setDrag(null);
      if (current?.targetGroup) void moveAppToGroup(current.appId, current.targetGroup);
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
  }, [apps, closeMenu, drag, moveAppToGroup]);

  const pageQuery = preferences.searchProvider === "internal" ? query : "";
  const activeGroupApps = useMemo(() => runtimeApps.filter((item) => item.groupId === activeSection), [activeSection, runtimeApps]);
  const visibleApps = useMemo(() => sortAppsForDisplay(
    activeGroupApps.filter((item) => matchesAppSearch(item, pageQuery)),
    preferences.sortRunningAppsFirst
  ), [activeGroupApps, pageQuery, preferences.sortRunningAppsFirst]);
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
  const internalSearchResults = useMemo(() => {
    if (preferences.searchProvider !== "internal" || activeSection === "settings") return [];
    return buildInternalSearchResults(query, runtimeApps, processes);
  }, [activeSection, preferences.searchProvider, processes, query, runtimeApps]);
  const searchResultCount = preferences.searchProvider === "everything" ? everythingResults.length : internalSearchResults.length;

  useEffect(() => {
    const trimmed = query.trim();
    setSearchSelectedIndex(0);
    if (!trimmed || preferences.searchProvider !== "everything") {
      setEverythingResults([]);
      setSearchLoading(false);
      setSearchError("");
      return;
    }
    setSearchPanelOpen(true);
    setSearchLoading(true);
    setSearchError("");
    const requestId = ++searchRequest.current;
    const timer = window.setTimeout(() => {
      void api().searchEverything(trimmed).then((results) => {
        if (searchRequest.current !== requestId) return;
        setEverythingResults(results);
        setSearchLoading(false);
      }).catch((reason) => {
        if (searchRequest.current !== requestId) return;
        setEverythingResults([]);
        setSearchLoading(false);
        setSearchError(cleanErrorMessage(reason, "Everything 搜索失败"));
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [preferences.searchProvider, query]);

  useEffect(() => {
    if (query.trim()) setSearchPanelOpen(true);
  }, [query]);

  useEffect(() => {
    if (!appGroups.some((group) => group.id === activeSection)) return;
    if (!visibleApps.some((app) => app.id === selectedAppId)) setSelectedAppId(visibleApps[0]?.id ?? "");
  }, [activeSection, appGroups, selectedAppId, visibleApps]);
  const draggedApp = runtimeApps.find((item) => item.id === drag?.appId);
  const activeGroup = groups.find((group) => group.id === activeSection);
  const pageTitle = activeSection === "processes" ? "进程监控" : activeSection === "settings" ? "偏好设置" : activeGroup?.name ?? "应用";
  const pageSubtitle = activeSection === "processes" ? `${visibleProcesses.length} 个进程正在显示` : activeSection === "settings" ? "管理应用分组与启动配置" : `${visibleApps.length} 个应用`;
  const openEverythingResult = useCallback((result: EverythingSearchResult) => {
    setSearchPanelOpen(false);
    void api().openSearchResult(result.path).catch((reason) => setError(cleanErrorMessage(reason, "打开搜索结果失败")));
  }, []);
  const openInternalResult = useCallback((result: InternalSearchResult) => {
    setSearchPanelOpen(false);
    if (result.kind === "app") {
      setActiveSection(result.groupId);
      setSelectedAppId(result.id);
      setQuery("");
      return;
    }
    setActiveSection("processes");
    setProcessFilter("all");
    setLockedProcessName(result.name.toLowerCase());
    setLockedProcessOrder([result.name.toLowerCase()]);
    setQuery(result.name);
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
  const openSelectedSearchResult = useCallback(() => {
    if (!query.trim()) return;
    if (preferences.searchProvider === "everything") {
      const result = everythingResults[searchSelectedIndex] ?? everythingResults[0];
      if (result) openEverythingResult(result);
      return;
    }
    const result = internalSearchResults[searchSelectedIndex] ?? internalSearchResults[0];
    if (result) openInternalResult(result);
  }, [everythingResults, internalSearchResults, openEverythingResult, openInternalResult, preferences.searchProvider, query, searchSelectedIndex]);
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

  const switchSection = (id: SectionId) => {
    if (drag) return;
    setActiveSection(id);
    setQuery("");
    closeFloatingUi();
    if (appGroups.some((group) => group.id === id)) setSelectedAppId(runtimeApps.find((item) => item.groupId === id)?.id ?? "");
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
    try {
      setError("");
      setNotice(buildLaunchFeedbackMessage("starting", appName));
      const result = await api().launchApp(id);
      setApps(result.apps);
      if (result.status === "failed") {
        setNotice("");
        setError(result.message || "启动失败，请检查程序路径和启动参数。");
        return;
      }
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
  const toggleAppLaunchSelected = async (app: RuntimeApp) => {
    try {
      setError("");
      setApps(await api().setAppLaunchSelected(app.id, !app.launchSelected));
    } catch (reason) {
      setError(cleanErrorMessage(reason, "勾选状态保存失败"));
    }
  };
  const launchSelectedApps = async () => {
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
  const editApp = (app: AppEntry) => setEdit({ id: app.id, name: app.name, launchArgs: app.launchArgs ?? "", workingDirectory: app.workingDirectory ?? "" });
  const saveGroup = async (input: GroupInput & { id?: string }) => {
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

  return (
    <main className="app-shell drag-region" data-theme={resolveUiTheme(preferences.uiTheme, systemIsDark)} onPointerDown={closeFloatingUi}>
      <aside className="sidebar no-drag">
        <div className="brand"><div className="brand-mark"><BrandLogo /></div><span><strong>Start Engineer</strong><small>Command Center</small></span></div>
        <nav className="nav">
          {groups.filter((group) => group.id === "processes").map((group) => <button key={group.id} className={`nav-button ${activeSection === group.id ? "active" : ""}`} onClick={() => switchSection(group.id)}>
            <Icon name={group.icon} /><span>{group.name}</span>
          </button>)}
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
          <section className="searchbar no-drag" onPointerDown={(event) => event.stopPropagation()}><label><Icon name="search" /><input ref={searchInputRef} value={query} onFocus={() => { closeMenu(); if (query.trim()) setSearchPanelOpen(true); }} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setSearchPanelOpen(Boolean(query.trim())); setSearchSelectedIndex((index) => Math.min(index + 1, Math.max(0, searchResultCount - 1))); } else if (event.key === "ArrowUp") { event.preventDefault(); setSearchPanelOpen(Boolean(query.trim())); setSearchSelectedIndex((index) => Math.max(0, index - 1)); } else if (event.key === "Enter") { event.preventDefault(); openSelectedSearchResult(); } else if (event.key === "Escape") { setSearchPanelOpen(false); } }} onChange={(event) => setQuery(event.target.value)} placeholder={SEARCH_INPUT_PLACEHOLDER} /></label><button className={`search-button ${query ? "clear" : ""}`} onClick={() => { closeMenu(); if (query) { setQuery(""); setSearchPanelOpen(false); } else searchInputRef.current?.focus(); }} aria-label={query ? "清除搜索" : "聚焦搜索框"}>{query ? "×" : <Icon name="search" />}</button>{searchPanelOpen && query.trim() ? <SearchResultsPanel provider={preferences.searchProvider} query={query} loading={searchLoading} error={searchError} selectedIndex={searchSelectedIndex} everythingResults={everythingResults} internalResults={internalSearchResults} onSelectIndex={setSearchSelectedIndex} onOpenEverything={openEverythingResult} onOpenInternal={openInternalResult} onPickEverythingCli={pickEverythingCli} onShowEverythingInFolder={(result) => void api().showSearchResultInFolder(result.path).catch((reason) => setError(cleanErrorMessage(reason, "打开所在位置失败")))} onCopyPath={(path) => void api().writeClipboardText(path).catch((reason) => setError(cleanErrorMessage(reason, "复制路径失败")))} /> : null}</section>
          <div className="window-controls no-drag">
            <button title="最小化" aria-label="最小化" onClick={() => void api().windowAction("minimize")}>−</button>
            <button title="最大化或还原" aria-label="最大化或还原" onClick={() => void api().windowAction("maximize")}>□</button>
            <button title="关闭" aria-label="关闭" className="close" onClick={() => void api().windowAction("close")}>×</button>
          </div>
        </header>

        {activeSection === "processes" ? <ProcessPage processes={visibleProcesses} lockedProcessName={lockedProcessName} sortKey={sortKey} sortDirection={sortDirection} changeSort={changeSort} filter={processFilter} setFilter={changeProcessFilter} onContextMenu={openProcessMenu} />
          : activeSection === "settings" ? <SettingsPage apps={runtimeApps} groups={appGroups} preferences={preferences} onPreferencesChange={savePreferences} onThemeChange={saveTheme} onPickEverythingCli={pickEverythingCli} onAdd={addApp} onAddToGroup={(groupId) => void runAppAction(() => api().addAppFromDialog(groupId))} onCreate={() => setGroupEdit({ name: "", icon: "grid" })} onEdit={(group) => setGroupEdit({ id: group.id, name: group.name, icon: group.icon })} onDelete={requestDeleteGroup} onReorder={reorderGroups} onOpenApp={(app) => { setActiveSection(app.groupId); setSelectedAppId(app.id); }} onAppContextMenu={(event, app) => { event.preventDefault(); event.stopPropagation(); openMenu({ kind: "app", x: event.clientX, y: event.clientY, appId: app.id }); }} onMoveApp={moveAppWithinSettings} />
          : <GroupPage apps={visibleApps} launchingAppIds={launchingAppIds} draggingAppId={drag?.appId} selectedCount={activeGroupApps.filter((app) => app.launchSelected).length} runningCount={activeGroupApps.filter((app) => app.metrics.isRunning).length} onToggleSelected={toggleAppLaunchSelected} onDoubleLaunch={(app) => void launchApp(app.id)} onLaunchSelected={() => void launchSelectedApps()} onCloseAll={() => void requestCloseGroupApps()} onAdd={addApp} onContextMenu={(event, app) => { event.preventDefault(); event.stopPropagation(); if (!drag) openMenu({ kind: "app", x: event.clientX, y: event.clientY, appId: app.id }); }} onPointerDown={(event, app) => { if (event.button !== 0) return; const rect = event.currentTarget.getBoundingClientRect(); dragCandidate.current = { appId: app.id, startX: event.clientX, startY: event.clientY, grabOffsetX: event.clientX - rect.left, grabOffsetY: event.clientY - rect.top }; }} onRequestClose={requestCloseApp} />}
        {notice || error ? <ToastStack notice={notice} error={error} onDismissNotice={() => setNotice("")} onDismissError={() => setError("")} /> : null}
      </section>

      {menu?.kind === "process" && processMenuItem ? <ProcessContextMenu state={menu} process={processMenuItem} onClose={closeMenu} onConfirm={setConfirm} onError={setError} /> : null}
      {menu?.kind === "app" ? <AppContextMenu state={menu} app={runtimeApps.find((item) => item.id === menu.appId)} groups={appGroups} onClose={closeMenu} onLaunch={launchApp} onKill={requestCloseApp} onPick={(app) => void runAppAction(() => api().pickExecutable(app.id))} onEdit={editApp} onMove={activeSection === "settings" ? moveAppWithinSettings : moveAppToGroup} onRemove={(app) => setConfirm({ title: "移除应用", message: `确定从 Start Engineer 中移除 ${app.name} 吗？本地程序文件不会被删除。`, confirmLabel: "移除应用", onConfirm: async () => { await runAppAction(() => api().removeApp(app.id)); setSelectedAppId(""); } })} onError={setError} /> : null}
      {menu?.kind === "group" ? <GroupContextMenu state={menu} groups={appGroups} onClose={closeMenu} onCreate={() => setGroupEdit({ name: "", icon: "grid" })} onEdit={(group) => setGroupEdit({ id: group.id, name: group.name, icon: group.icon })} onDelete={requestDeleteGroup} onReorder={reorderGroups} /> : null}
      {confirm ? <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} onError={(message) => { setConfirm(null); setError(cleanErrorMessage(message)); }} /> : null}
      {edit ? <AppEditDialog state={edit} onClose={() => setEdit(null)} onSave={(input) => runAppAction(() => api().updateApp(input))} /> : null}
      {groupEdit ? <GroupEditDialog state={groupEdit} onClose={() => setGroupEdit(null)} onSave={saveGroup} /> : null}
      {groupDelete ? <GroupDeleteDialog state={groupDelete} groups={appGroups} appCount={apps.filter((item) => item.groupId === groupDelete.groupId).length} onChangeTarget={(targetGroupId) => setGroupDelete({ ...groupDelete, targetGroupId })} onClose={() => setGroupDelete(null)} onConfirm={removeGroup} /> : null}
      {drag && draggedApp ? <div className="drag-preview no-drag" style={{ left: drag.x - drag.grabOffsetX, top: drag.y - drag.grabOffsetY }}>{draggedApp.iconDataUrl ? <img src={draggedApp.iconDataUrl} alt="" /> : <Icon name="grid" />}<span>{draggedApp.name}</span></div> : null}
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

function ProcessContextMenu({ state, process, onClose, onConfirm, onError }: { state: Extract<MenuState, { kind: "process" }>; process: DisplayProcess; onClose: () => void; onConfirm: (value: ConfirmState) => void; onError: (message: string) => void }) {
  const item = process;
  const copy = async (value: string) => { try { await api().writeClipboardText(value); onClose(); } catch (reason) { onError(reason instanceof Error ? reason.message : "复制失败"); } };
  return <ContextMenu x={state.x} y={state.y} onClose={onClose}><div className="process-menu-header"><strong>{item.name}</strong><span>{item.isEnded ? "进程已结束" : `${item.processCount} 个进程`}</span></div><MenuDivider /><MenuButton disabled={!item.canTerminate || item.isEnded} title={item.terminationBlockedReason} danger onClick={() => { onClose(); onConfirm({ title: "结束进程组", message: `确定结束 ${item.name} 的 ${item.pids.length} 个进程吗？`, confirmLabel: "结束进程组", onConfirm: () => api().killProcessGroup({ name: item.name, pids: item.pids }) }); }}>结束进程组</MenuButton><MenuButton disabled={!item.exePath} onClick={() => { onClose(); if (item.exePath) void api().showItemInFolder(item.exePath).catch((reason) => onError(reason.message)); }}>打开文件所在位置</MenuButton><MenuDivider /><MenuButton onClick={() => void copy(item.name)}>复制进程名称</MenuButton><MenuButton disabled={!item.exePath} onClick={() => item.exePath && void copy(item.exePath)}>复制文件路径</MenuButton><MenuButton disabled={item.isEnded} onClick={() => void copy(item.pids.join(", "))}>复制 PID</MenuButton></ContextMenu>;
}

function AppContextMenu({ state, app, groups, onClose, onLaunch, onKill, onPick, onEdit, onMove, onRemove, onError }: { state: Extract<MenuState, { kind: "app" }>; app?: RuntimeApp; groups: AppGroup[]; onClose: () => void; onLaunch: (id: string) => void; onKill: (app: RuntimeApp) => void; onPick: (app: RuntimeApp) => void; onEdit: (app: RuntimeApp) => void; onMove: (id: string, group: AppGroupId) => Promise<void>; onRemove: (app: RuntimeApp) => void; onError: (message: string) => void }) {
  if (!app) return null;
  const invoke = (action: () => void) => { onClose(); action(); };
  return <ContextMenu x={state.x} y={state.y} onClose={onClose}><MenuButton onClick={() => invoke(() => onLaunch(app.id))}>启动</MenuButton><MenuButton disabled={!app.metrics.isRunning} danger onClick={() => invoke(() => onKill(app))}>结束进程</MenuButton><MenuButton disabled={!app.executablePath} onClick={() => { onClose(); void api().showItemInFolder(app.executablePath).catch((reason) => onError(reason.message)); }}>打开文件所在位置</MenuButton><MenuDivider /><MenuButton onClick={() => invoke(() => onPick(app))}>修改启动程序</MenuButton><MenuButton onClick={() => invoke(() => onEdit(app))}>编辑应用信息</MenuButton><div className="menu-label">移动到分组</div>{groups.map((group) => <MenuButton key={group.id} disabled={app.groupId === group.id} onClick={() => { onClose(); void onMove(app.id, group.id); }}>{group.name}{app.groupId === group.id ? "（当前）" : ""}</MenuButton>)}<MenuDivider /><MenuButton disabled={!app.executablePath} onClick={() => { onClose(); void api().writeClipboardText(app.executablePath).catch((reason) => onError(reason.message)); }}>复制程序路径</MenuButton><MenuButton danger onClick={() => invoke(() => onRemove(app))}>移除应用</MenuButton></ContextMenu>;
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
const formatSearchSize = (bytes?: number) => bytes === undefined ? "文件夹" : bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function SearchResultsPanel({ provider, query, loading, error, selectedIndex, everythingResults, internalResults, onSelectIndex, onOpenEverything, onOpenInternal, onPickEverythingCli, onPrepareDependencies, onShowEverythingInFolder, onCopyPath }: { provider: SearchProvider; query: string; loading: boolean; error: string; selectedIndex: number; dependencyState?: SearchDependencyStatus["state"]; everythingResults: EverythingSearchResult[]; internalResults: InternalSearchResult[]; onSelectIndex: (index: number) => void; onOpenEverything: (result: EverythingSearchResult) => void; onOpenInternal: (result: InternalSearchResult) => void; onPickEverythingCli: () => void; onPrepareDependencies?: () => void; onShowEverythingInFolder: (result: EverythingSearchResult) => void; onCopyPath: (path: string) => void }) {
  const resultCount = provider === "everything" ? everythingResults.length : internalResults.length;
  const prepareDependencies = onPrepareDependencies ?? (() => { void api().prepareSearchDependencies(); });
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollSelectedSearchResultIntoView(panelRef.current, selectedIndex);
  }, [selectedIndex, resultCount]);
  return <div ref={panelRef} className="search-results-panel" role="listbox" aria-label="搜索结果" onPointerDown={(event) => event.stopPropagation()}>
    <div className="search-results-title"><span>{provider === "everything" ? "Everything 文件搜索" : "Start Engineer 内部搜索"}</span><small>{loading ? "搜索中…" : `${resultCount} 个结果`}</small></div>
    {provider === "everything" && error ? <div className="search-results-error"><strong>{error}</strong><span>请确认 Everything 已安装并正在运行，或点击一键准备自动下载便携依赖。</span><button onClick={prepareDependencies}>一键准备</button><button onClick={onPickEverythingCli}>选择 ES.exe</button><a href="https://www.voidtools.com/zh-cn/" target="_blank" rel="noreferrer">打开 Everything 官网</a></div> : null}
    {!error && !loading && !resultCount ? <div className="search-results-empty">没有找到“{query}”的匹配结果。</div> : null}
    {!error && provider === "everything" ? everythingResults.map((result, index) => <div key={result.path} className={`search-result-row ${index === selectedIndex ? "selected" : ""}`} role="option" aria-selected={index === selectedIndex} {...{ [SEARCH_RESULT_OPTION_ATTRIBUTE]: index }} onMouseEnter={() => onSelectIndex(index)} onClick={() => onOpenEverything(result)} onContextMenu={(event) => { event.preventDefault(); onShowEverythingInFolder(result); }}><Icon name={result.kind === "folder" ? "folder" : "grid"} /><span><strong>{result.name}</strong><small>{result.path}</small></span><em>{formatSearchSize(result.sizeBytes)}</em><button onClick={(event) => { event.stopPropagation(); onCopyPath(result.path); }}>复制路径</button></div>) : null}
    {!error && provider === "internal" ? internalResults.map((result, index) => <button key={`${result.kind}-${result.kind === "app" ? result.id : result.name}`} className={`search-result-row internal ${index === selectedIndex ? "selected" : ""}`} role="option" aria-selected={index === selectedIndex} {...{ [SEARCH_RESULT_OPTION_ATTRIBUTE]: index }} onMouseEnter={() => onSelectIndex(index)} onClick={() => onOpenInternal(result)}><Icon name={result.kind === "app" ? "grid" : "activity"} /><span><strong>{result.name}</strong><small>{result.kind === "app" ? `${result.processName}${result.isRunning ? " · 运行中" : ""}` : `${result.processCount} 个进程${result.isManagedApp ? " · 已管理" : ""}`}</small></span><em>{result.kind === "app" ? "应用" : "进程"}</em></button>) : null}
  </div>;
}

function AppEditDialog({ state, onClose, onSave }: { state: EditState; onClose: () => void; onSave: (input: UpdateAppInput) => Promise<void> }) {
  const [form, setForm] = useState(state!);
  const [busy, setBusy] = useState(false);
  if (!form) return null;
  const save = async () => { if (!form.name.trim()) return; setBusy(true); await onSave({ id: form.id, name: form.name.trim(), launchArgs: form.launchArgs.trim() || undefined, workingDirectory: form.workingDirectory.trim() || undefined }); onClose(); };
  return <div className="modal-backdrop no-drag" onPointerDown={onClose}><form className="dialog edit-dialog" onSubmit={(event) => { event.preventDefault(); void save(); }} onPointerDown={(event) => event.stopPropagation()}><h2>编辑应用信息</h2><label>名称<input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>启动参数<input value={form.launchArgs} onChange={(event) => setForm({ ...form, launchArgs: event.target.value })} placeholder="例如：--silent" /></label><label>工作目录<input value={form.workingDirectory} onChange={(event) => setForm({ ...form, workingDirectory: event.target.value })} placeholder="留空则使用程序所在目录" /></label><div className="dialog-actions"><button type="button" className="ghost" onClick={onClose}>取消</button><button type="submit" className="launch" disabled={busy || !form.name.trim()}>保存</button></div></form></div>;
}
function SettingsPage({ apps, groups, preferences, onPreferencesChange, onThemeChange, onPickEverythingCli, onAdd, onAddToGroup, onCreate, onEdit, onDelete, onReorder, onOpenApp, onAppContextMenu, onMoveApp }: { apps: RuntimeApp[]; groups: AppGroup[]; preferences: AppPreferencesState; onPreferencesChange: (input: UpdatePreferencesInput) => Promise<AppPreferencesState>; onThemeChange: (theme: UiTheme) => Promise<AppPreferencesState>; onPickEverythingCli: () => void; onAdd: () => void; onAddToGroup: (id: string) => void; onCreate: () => void; onEdit: (group: AppGroup) => void; onDelete: (id: string) => void; onReorder: (ids: string[]) => Promise<boolean>; onOpenApp: (app: RuntimeApp) => void; onAppContextMenu: (event: React.MouseEvent, app: RuntimeApp) => void; onMoveApp: (appId: string, groupId: string) => Promise<void> }) {
  const [ordered, setOrdered] = useState(groups);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedSettings, setExpandedSettings] = useState<Set<"general" | "theme" | "dependency">>(new Set());
  const [sortPreview, setSortPreview] = useState<{ id: string; left: number; top: number; width: number } | null>(null);
  const [appDrag, setAppDrag] = useState<{ appId: string; x: number; y: number; grabOffsetX: number; grabOffsetY: number; targetGroup?: string } | null>(null);
  const [savingPreference, setSavingPreference] = useState<"startup" | "close" | "shortcut" | "theme" | "administrator" | "search" | "runningSort" | null>(null);
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
        const left = Math.min(Math.max(8, event.clientX - sort.grabOffsetX), Math.max(8, window.innerWidth - previewWidth - 8));
        const top = Math.min(Math.max(8, event.clientY - sort.grabOffsetY), Math.max(8, window.innerHeight - previewHeight - 8));
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
  const savePreference = async (kind: "startup" | "close" | "shortcut" | "administrator" | "search" | "runningSort", input: UpdatePreferencesInput) => {
    setSavingPreference(kind);
    if (kind === "administrator") setAdministratorActionMessage("");
    try {
      const result = await onPreferencesChange(input);
      setShortcutMessage(result.globalShortcutMessage ?? "");
    } catch { /* The app-level toast reports the failure. */ } finally { setSavingPreference(null); }
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
            onClick={() => void selectTheme(theme.id)}
          >
            <span className="theme-preview" aria-hidden="true"><i /><b /><em /></span>
            <span className="theme-card-copy"><strong>{theme.name}</strong><small>{theme.description}</small></span>
            <span className="theme-check" aria-hidden="true">✓</span>
          </button>
        ))}
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

  const administratorStatus = administratorActionMessage || (preferences.administratorRestartRequired ? shortcutMessage : "") || preferences.administratorMessage || (preferences.administratorRestartRequired ? "下次启动生效" : preferences.isRunningAsAdministrator ? "当前以管理员权限运行" : "当前以普通权限运行");

  return <section className="content settings-page no-drag"><SettingsCollapsibleSection title="常规设置" description="控制 Windows 启动、窗口关闭和快速唤出行为。" expanded={expandedSettings.has("general")} onToggle={() => toggleSettingsSection("general")}><div className="preference-grid"><div className="preference-row"><span><strong>开机启动</strong><small>登录 Windows 后自动打开 Start Engineer 主窗口。</small></span><button className={`setting-switch ${preferences.launchAtStartup ? "enabled" : ""}`} role="switch" aria-checked={preferences.launchAtStartup} disabled={savingPreference !== null} onClick={() => void savePreference("startup", { launchAtStartup: !preferences.launchAtStartup })}><i /></button></div><div className="preference-row close-preference"><span><strong>关闭主窗口时</strong><small>选择继续在托盘运行，或直接退出启动器。</small></span><div className="preference-options"><button className={preferences.closeBehavior === "tray" ? "selected" : ""} disabled={savingPreference !== null} onClick={() => void savePreference("close", { closeBehavior: "tray" })}>最小化到托盘</button><button className={preferences.closeBehavior === "quit" ? "selected" : ""} disabled={savingPreference !== null} onClick={() => void savePreference("close", { closeBehavior: "quit" })}>直接退出</button></div></div><div className="preference-row shortcut-preference"><span><strong>快速唤出</strong><small>在任意界面按快捷键显示或隐藏 Start Engineer。</small>{shortcutMessage || preferences.globalShortcutMessage ? <em>{shortcutMessage || preferences.globalShortcutMessage}</em> : null}</span><div className="shortcut-controls"><button className={`shortcut-recorder ${recordingShortcut ? "recording" : ""}`} disabled={savingPreference !== null} onClick={() => { setRecordingShortcut(true); setShortcutMessage("请按下新的快捷键，Esc 取消"); }} onKeyDown={recordShortcut}>{recordingShortcut ? "等待按键…" : preferences.globalShortcut}</button><button className={`setting-switch ${preferences.globalShortcutEnabled ? "enabled" : ""}`} role="switch" aria-checked={preferences.globalShortcutEnabled} disabled={savingPreference !== null} onClick={() => void savePreference("shortcut", { globalShortcutEnabled: !preferences.globalShortcutEnabled })}><i /></button><button className="shortcut-reset" disabled={savingPreference !== null || preferences.globalShortcut === "Ctrl+Shift+Space"} onClick={() => void savePreference("shortcut", { globalShortcut: "Ctrl+Shift+Space", globalShortcutEnabled: true })}>恢复默认</button></div></div><div className="preference-row search-preference"><span><strong>搜索范围</strong><small>默认调用 Everything 搜索文件；开启后只筛选 Start Engineer 内的应用和进程。</small><em>{preferences.searchProvider === "everything" ? "当前使用 Everything" : "当前仅搜索内部应用"}</em></span><div className="administrator-controls"><button className="shortcut-reset" disabled={savingPreference !== null || preferences.searchProvider !== "everything"} onClick={() => void api().pickEverythingCli().then(setPreferences).catch((reason) => setShortcutMessage(cleanErrorMessage(reason, "选择 ES.exe 失败")))}>选择 ES.exe</button><button className={`setting-switch ${preferences.searchProvider === "internal" ? "enabled" : ""}`} role="switch" aria-checked={preferences.searchProvider === "internal"} disabled={savingPreference !== null} onClick={() => void savePreference("search", { searchProvider: preferences.searchProvider === "internal" ? "everything" : "internal" })}><i /></button></div></div><div className="preference-row running-sort-preference"><span><strong>运行应用置顶</strong><small>分组内已启动应用自动显示在前面，关闭后恢复原有顺序。</small></span><button className={`setting-switch ${preferences.sortRunningAppsFirst ? "enabled" : ""}`} role="switch" aria-checked={preferences.sortRunningAppsFirst} disabled={savingPreference !== null} onClick={() => void savePreference("runningSort", { sortRunningAppsFirst: !preferences.sortRunningAppsFirst })}><i /></button></div><div className="preference-row administrator-preference"><span><strong>以管理员方式启动</strong><small>启动时请求 Windows 管理员权限，结束高权限应用时通常无需再次授权。</small><em className={preferences.administratorRestartRequired ? "pending" : "active"}>{administratorStatus}</em></span><div className="administrator-controls">{preferences.administratorRestartRequired ? <button className="shortcut-reset administrator-restart" onClick={() => void api().restartWithConfiguredPrivileges().catch((reason) => setShortcutMessage(cleanErrorMessage(reason, "重启失败")))}>{preferences.runAsAdministrator ? "立即以管理员身份重启" : "立即以普通权限重启"}</button> : null}<button className={`setting-switch ${preferences.runAsAdministrator ? "enabled" : ""}`} role="switch" aria-checked={preferences.runAsAdministrator} disabled={savingPreference !== null} onClick={() => void savePreference("administrator", { runAsAdministrator: !preferences.runAsAdministrator })}><i /></button></div></div></div></SettingsCollapsibleSection><SettingsCollapsibleSection title="界面主题" description="选择一套固定外观，或让界面跟随 Windows 明暗模式。" expanded={expandedSettings.has("theme")} onToggle={() => toggleSettingsSection("theme")}>{themePicker}</SettingsCollapsibleSection><div className="settings-heading group-settings-heading"><div><h2>分组管理</h2><p>点击分组查看应用，拖动手柄调整左侧导航顺序。</p></div><div className="settings-actions"><button className="ghost" onClick={onAdd}>添加应用</button><button className="launch" onClick={onCreate}>新建分组</button></div></div><div className="group-manager">{ordered.map((group) => <GroupManagerItem key={group.id} group={group} apps={apps.filter((app) => app.groupId === group.id)} expanded={expanded.has(group.id)} sorting={sortPreview?.id === group.id} appDrag={appDrag} register={(element) => { if (element) rows.current.set(group.id, element); else rows.current.delete(group.id); }} onToggle={() => toggle(group.id)} onSortStart={(event) => { if (appCandidate.current) return; event.preventDefault(); const rect = rows.current.get(group.id)?.getBoundingClientRect(); sortCandidate.current = { id: group.id, startX: event.clientX, startY: event.clientY, grabOffsetX: rect ? event.clientX - rect.left : 40, grabOffsetY: rect ? event.clientY - rect.top : 32, original: [...ordered], active: false, valid: true }; }} onEdit={() => onEdit(group)} onDelete={() => onDelete(group.id)} canDelete={groups.length > 1} onAdd={() => onAddToGroup(group.id)} onOpenApp={(app) => { if (!suppressAppClick.current) onOpenApp(app); }} onAppContextMenu={onAppContextMenu} onAppPointerDown={(event, app) => { if (event.button !== 0 || sortCandidate.current) return; const rect = event.currentTarget.getBoundingClientRect(); appCandidate.current = { appId: app.id, startX: event.clientX, startY: event.clientY, grabOffsetX: event.clientX - rect.left, grabOffsetY: event.clientY - rect.top }; }} />)}</div>{sortPreview && previewGroup ? <GroupSortPreview group={previewGroup} count={apps.filter((app) => app.groupId === previewGroup.id).length} left={sortPreview.left} top={sortPreview.top} width={sortPreview.width} /> : null}{appDrag && draggedApp ? <div className="drag-preview no-drag" style={{ left: appDrag.x - app.grabOffsetX, top: appDrag.y - app.grabOffsetY }}>{draggedApp.iconDataUrl ? <img src={draggedApp.iconDataUrl} alt="" /> : <Icon name="grid" />}<span>{draggedApp.name}</span></div> : null}</section>;
}

export function SettingsCollapsibleSection({ title, description, expanded, onToggle, children }: { title: string; description: string; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  return <><section className={`settings-collapsible ${expanded ? "expanded" : ""}`}><button className="settings-collapse-toggle" aria-expanded={expanded} onClick={onToggle}><span><strong>{title}</strong><small>{description}</small></span><GroupActionIcon kind="expand" /></button>{expanded ? <div className="settings-collapse-content">{children}</div> : null}</section>{title === "界面主题" ? <SearchDependencySettingsSection /> : null}</>;
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
  return <svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="brand-gradient" x1="7" y1="4" x2="56" y2="61" gradientUnits="userSpaceOnUse"><stop stopColor="#50d5ef" /><stop offset=".52" stopColor="#5c6df4" /><stop offset="1" stopColor="#a258eb" /></linearGradient></defs><rect x="3" y="3" width="58" height="58" rx="17" fill="url(#brand-gradient)" /><rect x="5" y="5" width="54" height="27" rx="14" fill="white" opacity=".18" /><path d="M32 13.5 36.3 27.7 50.5 32l-14.2 4.3L32 50.5l-4.3-14.2L13.5 32l14.2-4.3L32 13.5Z" fill="white" /></svg>;
}

if (typeof document !== "undefined") {
  const root = document.getElementById("root");
  if (root) createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
}
