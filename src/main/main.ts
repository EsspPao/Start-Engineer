import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, nativeImage, nativeTheme, shell, Tray, type OpenDialogOptions } from "electron";
import { execFile, execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AppEntry,
  AppGroup,
  AppMetrics,
  AppPreferences,
  AppPreferencesState,
  BatchKillResult,
  BatchLaunchResult,
  DiscoveredAppCandidate,
  SearchDependencyStatus,
  GroupInput,
  GroupUpdateInput,
  LaunchAppResult,
  ProcessInfo,
  SnapshotMode,
  UpdateAppInput,
  UpdatePreferencesInput,
  WindowAction
} from "../shared/types.js";
import { RuntimeMonitor, type ProcessSnapshot } from "./runtime-monitor.js";
import { migrateAppEntry, normalizeGroups } from "./config-migration.js";
import { APP_ICON_CACHE_VERSION, APP_ICON_TARGET_SIZE, shouldRefreshAppIcon } from "./icon-cache.js";
import { defaultPreferences, normalizePreferences, resolveLoginExecutable } from "./preferences.js";
import { validateShortcut } from "../shared/global-shortcut.js";
import { terminatePids } from "./process-termination.js";
import { resolveUiTheme, themeUsesMica } from "../shared/theme.js";
import { collectGroupTermination, launchAppsSequentially } from "./batch-app-actions.js";
import { administratorRestartRequired, buildRestartRequest, shouldRequestAdministratorRelaunch } from "./administrator-launch.js";
import { migrateLegacyUserData } from "./user-data-migration.js";
import { searchEverything as runEverythingSearch } from "./everything-search.js";
import { buildEverythingDownloadPlan, clearTempDependencyDir, downloadFile, expandZip, getManagedEverythingPaths, getSearchDependencyStatus as resolveSearchDependencyStatus } from "./search-dependencies.js";
import { buildDiscoveredApps, filterNewShortcuts, type ShortcutInfo, type ShortcutSource } from "./app-discovery.js";
import { mergeVisibleAppOrder } from "./app-order.js";

const isDev = process.env.VITE_DEV_SERVER_URL !== undefined;
const appRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const rendererUrl = process.env.VITE_DEV_SERVER_URL;
const rendererIndex = join(appRoot, "dist", "index.html");
const preloadPath = join(appRoot, "dist-electron", "preload", "preload.cjs");
const appIconPath = () => app.isPackaged ? join(process.resourcesPath, "icon.ico") : join(appRoot, "build", "icon.ico");
const trayIconPath = () => app.isPackaged ? join(process.resourcesPath, "tray-icon.png") : join(appRoot, "build", "tray-icon.png");
const smokeMode = process.env.START_ENGINEER_SMOKE === "1" || process.env.STAR_ENGINEER_SMOKE === "1";
const startEngineerUserData = smokeMode ? join(app.getPath("temp"), `start-engineer-smoke-${process.pid}`) : join(app.getPath("appData"), "start-engineer");
if (!smokeMode) migrateLegacyUserData(startEngineerUserData, join(app.getPath("appData"), "commanddeck-next"));
app.setPath("userData", startEngineerUserData);
const configPath = () => join(app.getPath("userData"), "apps.json");
const groupsPath = () => join(app.getPath("userData"), "groups.json");
const preferencesPath = () => join(app.getPath("userData"), "preferences.json");
const iconCacheDir = () => join(app.getPath("userData"), "icons");
const processIconCache = new Map<string, string>();
const protectedProcessNames = new Set([
  "system",
  "system idle process",
  "registry",
  "smss.exe",
  "csrss.exe",
  "wininit.exe",
  "services.exe",
  "lsass.exe",
  "winlogon.exe",
  "dwm.exe"
]);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let appsCache: AppEntry[] = [];
let groupsCache: AppGroup[] = [];
let preferencesCache: AppPreferences | null = null;
let registeredShortcut = "";
let shortcutState: Pick<AppPreferencesState, "globalShortcutStatus" | "globalShortcutMessage"> = { globalShortcutStatus: "disabled" };
let iconRefreshInFlight: Promise<AppEntry[]> | null = null;
let administratorMessage = "";
let searchDependencyStatus: SearchDependencyStatus | null = null;
let prepareDependenciesInFlight: Promise<SearchDependencyStatus> | null = null;
const runtimeAssociatedPids = new Map<string, Set<number>>();
let importCandidatesCache: DiscoveredAppCandidate[] = [];

function detectAdministratorPrivileges() {
  if (process.platform !== "win32") return false;
  try {
    const result = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"], { encoding: "utf8", windowsHide: true, timeout: 5000 });
    return result.trim().toLowerCase() === "true";
  } catch {
    return false;
  }
}

const isRunningAsAdministrator = detectAdministratorPrivileges();

function ownProcessIds() {
  const ids = new Set([process.pid]);
  if (mainWindow && !mainWindow.isDestroyed()) {
    ids.add(mainWindow.webContents.getOSProcessId());
  }
  return ids;
}

function getTerminationBlockReason(name: string, pids: number[]) {
  if (protectedProcessNames.has(name.toLowerCase())) {
    return "Windows 关键进程受保护";
  }
  const ownIds = ownProcessIds();
  if (pids.some((pid) => ownIds.has(pid))) {
    return "不能结束 Start Engineer 自身进程";
  }
  return undefined;
}

const systemGroups: AppGroup[] = [
  { id: "processes", name: "进程", icon: "activity", isSystem: true, order: -1 },
  { id: "settings", name: "设置", icon: "settings", isSystem: true, order: Number.MAX_SAFE_INTEGER }
];
const allowedGroupIcons = new Set(["compass", "briefcase", "wrench", "grid", "star", "gamepad", "folder", "music", "code"]);

function defaultGroups(): AppGroup[] {
  return [
    { id: "games", name: "二游", icon: "compass", isSystem: false, order: 0 },
    { id: "office", name: "办公", icon: "briefcase", isSystem: false, order: 1 },
    { id: "tools", name: "工具", icon: "wrench", isSystem: false, order: 2 }
  ];
}

function saveGroups(groups: AppGroup[]) {
  const normalized = groups.map((group, order) => ({ ...group, isSystem: false, order }));
  mkdirSync(dirname(groupsPath()), { recursive: true });
  writeFileSync(groupsPath(), JSON.stringify(normalized, null, 2), "utf8");
  groupsCache = normalized;
}

function savePreferences(preferences: AppPreferences) {
  const normalized = normalizePreferences(preferences);
  mkdirSync(dirname(preferencesPath()), { recursive: true });
  writeFileSync(preferencesPath(), JSON.stringify(normalized, null, 2), "utf8");
  preferencesCache = normalized;
  return normalized;
}

function loadPreferences() {
  if (preferencesCache) return preferencesCache;
  try {
    preferencesCache = normalizePreferences(JSON.parse(readFileSync(preferencesPath(), "utf8")) as Partial<AppPreferences>);
  } catch {
    if (existsSync(preferencesPath())) {
      try { renameSync(preferencesPath(), `${preferencesPath()}.corrupt-${Date.now()}.bak`); } catch { /* Keep running with defaults. */ }
    }
    preferencesCache = { ...defaultPreferences };
    savePreferences(preferencesCache);
  }
  return preferencesCache;
}

function loginExecutable() {
  return resolveLoginExecutable(process.execPath, process.env.PORTABLE_EXECUTABLE_FILE);
}

const loginArgs = ["--autostart"];

function loginItemEnabled() {
  const path = loginExecutable();
  return app.getLoginItemSettings({ path, args: loginArgs }).openAtLogin;
}

function preferencesSnapshot(): AppPreferencesState {
  const preferences = loadPreferences();
  return {
    ...preferences,
    launchAtStartup: loginItemEnabled(),
    ...shortcutState,
    isRunningAsAdministrator,
    administratorRestartRequired: administratorRestartRequired(preferences.runAsAdministrator, isRunningAsAdministrator),
    ...(administratorMessage ? { administratorMessage } : {})
  };
}

function getSearchDependencyStatus(): SearchDependencyStatus {
  if (searchDependencyStatus && searchDependencyStatus.state !== "ready" && searchDependencyStatus.state !== "missing") return searchDependencyStatus;
  const status = resolveSearchDependencyStatus(loadPreferences(), app.getPath("userData"));
  searchDependencyStatus = status;
  return status;
}

async function prepareSearchDependencies(): Promise<SearchDependencyStatus> {
  if (prepareDependenciesInFlight) return prepareDependenciesInFlight;
  prepareDependenciesInFlight = (async () => {
    const existing = resolveSearchDependencyStatus(loadPreferences(), app.getPath("userData"));
    if (existing.state === "ready") return existing;
    const userDataPath = app.getPath("userData");
    const plan = buildEverythingDownloadPlan(userDataPath);
    const paths = getManagedEverythingPaths(userDataPath);
    try {
      clearTempDependencyDir(userDataPath);
      searchDependencyStatus = { state: "downloading", message: "正在下载 Everything 便携版" };
      await downloadFile(plan.everything.url, plan.everything.tempZip, (downloadedBytes, totalBytes) => { searchDependencyStatus = { state: "downloading", message: "正在下载 Everything 便携版", downloadedBytes, totalBytes }; });
      searchDependencyStatus = { state: "downloading", message: "正在下载 Everything 命令行工具" };
      await downloadFile(plan.es.url, plan.es.tempZip, (downloadedBytes, totalBytes) => { searchDependencyStatus = { state: "downloading", message: "正在下载 Everything 命令行工具", downloadedBytes, totalBytes }; });
      searchDependencyStatus = { state: "extracting", message: "正在解压 Everything 搜索依赖" };
      await expandZip(plan.everything.tempZip, plan.everything.finalDir);
      await expandZip(plan.es.tempZip, plan.es.finalDir);
      clearTempDependencyDir(userDataPath);
      if (!existsSync(paths.everythingCliPath) || !existsSync(paths.everythingPath)) throw new Error("Everything 依赖解压后不完整");
      savePreferences({ ...loadPreferences(), everythingCliPath: paths.everythingCliPath, everythingManagedPath: paths.everythingPath });
      searchDependencyStatus = { state: "starting", message: "正在启动 Everything 便携版", everythingPath: paths.everythingPath, everythingCliPath: paths.everythingCliPath };
      spawn(paths.everythingPath, ["-startup"], { detached: true, stdio: "ignore", windowsHide: true }).unref();
      searchDependencyStatus = { state: "ready", message: "Everything 搜索依赖已就绪", everythingPath: paths.everythingPath, everythingCliPath: paths.everythingCliPath };
      return searchDependencyStatus;
    } catch (reason) {
      clearTempDependencyDir(userDataPath);
      searchDependencyStatus = { state: "failed", message: cleanDependencyError(reason) };
      return searchDependencyStatus;
    } finally {
      prepareDependenciesInFlight = null;
    }
  })();
  return prepareDependenciesInFlight;
}

function cleanDependencyError(reason: unknown) {
  return reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "准备 Everything 搜索依赖失败";
}

function powershellEncoded(script: string) {
  return Buffer.from(script, "utf16le").toString("base64");
}

function launchRestartRequest(request: ReturnType<typeof buildRestartRequest>) {
  if (request.elevated) {
    const payload = Buffer.from(JSON.stringify(request), "utf8").toString("base64");
    const script = `$request = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')) | ConvertFrom-Json\nStart-Process -FilePath ([string]$request.executablePath) -ArgumentList ([string[]]$request.args) -Verb RunAs -ErrorAction Stop`;
    return new Promise<void>((resolve, reject) => {
      execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", powershellEncoded(script)], { windowsHide: true }, (error) => error ? reject(new Error("管理员授权已取消或启动失败")) : resolve());
    });
  }

  const child = spawn("explorer.exe", [request.executablePath, ...request.args], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  return Promise.resolve();
}

function launchElevatedSynchronously(request: ReturnType<typeof buildRestartRequest>) {
  const payload = Buffer.from(JSON.stringify(request), "utf8").toString("base64");
  const script = `$request = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')) | ConvertFrom-Json\nStart-Process -FilePath ([string]$request.executablePath) -ArgumentList ([string[]]$request.args) -Verb RunAs -ErrorAction Stop`;
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", powershellEncoded(script)], { windowsHide: true, timeout: 120000 });
}

async function restartWithConfiguredPrivileges() {
  const request = buildRestartRequest(process.execPath, process.env.PORTABLE_EXECUTABLE_FILE, loadPreferences().runAsAdministrator);
  app.releaseSingleInstanceLock();
  try {
    await launchRestartRequest(request);
  } catch (reason) {
    app.requestSingleInstanceLock();
    throw reason;
  }
  isQuitting = true;
  globalShortcut.unregisterAll();
  registeredShortcut = "";
  tray?.destroy();
  tray = null;
  setTimeout(() => app.quit(), 150);
}

function toggleMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized() && mainWindow.isFocused()) {
    mainWindow.hide();
    return;
  }
  showMainWindow();
}

function applyGlobalShortcut(preferences: AppPreferences, persist: boolean): AppPreferencesState {
  if (!preferences.globalShortcutEnabled) {
    if (registeredShortcut) globalShortcut.unregister(registeredShortcut);
    registeredShortcut = "";
    shortcutState = { globalShortcutStatus: "disabled" };
    if (persist) savePreferences(preferences);
    return preferencesSnapshot();
  }

  const validation = validateShortcut(preferences.globalShortcut);
  if (!validation.valid) {
    shortcutState = { globalShortcutStatus: "invalid", globalShortcutMessage: validation.message };
    return { ...preferencesSnapshot(), globalShortcutStatus: "invalid", globalShortcutMessage: validation.message };
  }

  const accelerator = validation.accelerator;
  if (registeredShortcut === accelerator && globalShortcut.isRegistered(accelerator)) {
    shortcutState = { globalShortcutStatus: "registered" };
    if (persist) savePreferences({ ...preferences, globalShortcut: accelerator });
    return preferencesSnapshot();
  }

  if (!globalShortcut.register(accelerator, toggleMainWindow)) {
    const message = "快捷键已被其他应用占用";
    shortcutState = { globalShortcutStatus: "unavailable", globalShortcutMessage: message };
    return { ...preferencesSnapshot(), globalShortcutStatus: "unavailable", globalShortcutMessage: message };
  }

  if (registeredShortcut) globalShortcut.unregister(registeredShortcut);
  registeredShortcut = accelerator;
  shortcutState = { globalShortcutStatus: "registered" };
  const normalized = { ...preferences, globalShortcut: accelerator };
  if (persist) savePreferences(normalized);
  return preferencesSnapshot();
}

function updatePreferences(input: UpdatePreferencesInput): AppPreferencesState {
  const current = preferencesSnapshot();
  const next = normalizePreferences({ ...current, ...input });
  if (input.runAsAdministrator !== undefined) administratorMessage = "";
  if (input.launchAtStartup !== undefined) {
    const path = loginExecutable();
    app.setLoginItemSettings({ openAtLogin: next.launchAtStartup, path, args: loginArgs });
    if (loginItemEnabled() !== next.launchAtStartup) throw new Error("Windows 开机启动设置未能生效");
  }
  if (input.globalShortcut !== undefined || input.globalShortcutEnabled !== undefined) {
    return applyGlobalShortcut(next, true);
  }
  savePreferences(next);
  if (input.uiTheme !== undefined) applyWindowTheme(next);
  return preferencesSnapshot();
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function applyWindowTheme(preferences = loadPreferences()) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const theme = resolveUiTheme(preferences.uiTheme, nativeTheme.shouldUseDarkColors);
  const backgroundColor = theme === "midnight" ? "#07111f" : theme === "utility" ? "#f3efe6" : "#00000000";

  if (process.platform === "win32") {
    try {
      mainWindow.setBackgroundMaterial(themeUsesMica(theme) ? "mica" : "none");
    } catch {
      // CSS backgrounds remain the visual fallback on unsupported Windows versions.
    }
  }
  mainWindow.setBackgroundColor(backgroundColor);
}

async function createTray() {
  if (tray) return;
  let icon = nativeImage.createFromPath(trayIconPath());
  if (icon.isEmpty()) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#52c8ed"/><stop offset=".55" stop-color="#6370f3"/><stop offset="1" stop-color="#9361eb"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#g)"/><path d="m16 7 2.1 5.2L23 14l-4.9 1.8L16 21l-2.1-5.2L9 14l4.9-1.8L16 7Z" fill="white"/></svg>`;
    icon = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  }
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip("Start Engineer");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开 Start Engineer", click: showMainWindow },
    { type: "separator" },
    { label: "退出", click: () => { isQuitting = true; app.quit(); } }
  ]));
  tray.on("click", showMainWindow);
}

function loadAppGroups(): AppGroup[] {
  if (groupsCache.length) return groupsCache;
  try {
    const parsed = JSON.parse(readFileSync(groupsPath(), "utf8")) as Partial<AppGroup>[];
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("分组配置为空");
    const migrated = normalizeGroups(parsed, allowedGroupIcons);
    if (!migrated.length) throw new Error("没有有效分组");
    saveGroups(migrated);
    return groupsCache;
  } catch {
    if (existsSync(groupsPath())) {
      try { renameSync(groupsPath(), `${groupsPath()}.corrupt-${Date.now()}.bak`); } catch { /* Keep running with defaults. */ }
    }
    saveGroups(defaultGroups());
    return groupsCache;
  }
}

function listGroups() {
  return [systemGroups[0], ...loadAppGroups(), systemGroups[1]];
}

function validateGroupName(name: string, excludeId?: string) {
  const normalized = name.trim();
  if (!normalized) throw new Error("分组名称不能为空");
  if (normalized.length > 20) throw new Error("分组名称不能超过 20 个字符");
  if (loadAppGroups().some((group) => group.id !== excludeId && group.name.toLocaleLowerCase() === normalized.toLocaleLowerCase())) {
    throw new Error("分组名称不能重复");
  }
  return normalized;
}

function validateGroupIcon(icon: string) {
  if (!allowedGroupIcons.has(icon)) throw new Error("请选择有效的分组图标");
  return icon;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 1060,
    minHeight: 680,
    frame: false,
    thickFrame: false,
    hasShadow: true,
    transparent: true,
    backgroundColor: "#00000000",
    title: "Start Engineer",
    icon: appIconPath(),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting && loadPreferences().closeBehavior === "tray") {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.on("closed", () => { mainWindow = null; });

  applyWindowTheme();

  if (isDev && rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(rendererIndex);
  }

  if (process.env.STAR_ENGINEER_SMOKE === "1") {
    mainWindow.webContents.once("did-finish-load", () => {
      console.log("STAR_ENGINEER_SMOKE_READY");
      setTimeout(() => app.quit(), 100);
    });
  }
}

function defaultApps(): AppEntry[] {
  return [];
}

function migrateApp(raw: Partial<AppEntry>): AppEntry {
  const groupId = validAppGroup(raw.groupId);
  return migrateAppEntry(raw, groupId, randomUUID);
}

function loadApps(): AppEntry[] {
  if (appsCache.length > 0) {
    return appsCache;
  }

  try {
    const raw = readFileSync(configPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<AppEntry>[];
    if (Array.isArray(parsed)) {
      appsCache = parsed.map(migrateApp);
      saveApps(appsCache);
      return appsCache;
    }
  } catch {
    if (existsSync(configPath())) {
      try { renameSync(configPath(), `${configPath()}.corrupt-${Date.now()}.bak`); } catch { /* Keep running with defaults. */ }
    }
  }

  appsCache = defaultApps();
  saveApps(appsCache);
  return appsCache;
}

function shortcutSearchRoots() {
  const roots: Array<{ path: string; source: ShortcutSource }> = [
    { path: join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs"), source: "start-menu" },
    { path: app.getPath("desktop"), source: "desktop" }
  ];
  if (process.env.ProgramData) roots.push({ path: join(process.env.ProgramData, "Microsoft", "Windows", "Start Menu", "Programs"), source: "start-menu" });
  if (process.env.PUBLIC) roots.push({ path: join(process.env.PUBLIC, "Desktop"), source: "desktop" });
  return roots.filter((root) => existsSync(root.path));
}

async function discoverShortcuts(): Promise<ShortcutInfo[]> {
  const roots = shortcutSearchRoots();
  if (!roots.length) return [];
  const payload = Buffer.from(JSON.stringify(roots), "utf16le").toString("base64");
  const script = `
$roots = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${payload}')) | ConvertFrom-Json
$shell = New-Object -ComObject WScript.Shell
$rows = foreach ($root in $roots) {
  if (-not (Test-Path -LiteralPath ([string]$root.path))) { continue }
  Get-ChildItem -LiteralPath ([string]$root.path) -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $shortcut = $shell.CreateShortcut($_.FullName)
      if ([string]::IsNullOrWhiteSpace($shortcut.TargetPath)) { return }
      [PSCustomObject]@{
        name = [IO.Path]::GetFileNameWithoutExtension($_.Name)
        targetPath = [string]$shortcut.TargetPath
        source = [string]$root.source
      }
    } catch {}
  }
}
$rows | ConvertTo-Json -Compress
`;
  const output = (await runPowerShell(script)).trim();
  if (!output) return [];
  const parsed = JSON.parse(output) as ShortcutInfo[] | ShortcutInfo;
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function discoverImportCandidates() {
  const shortcuts = filterNewShortcuts(await discoverShortcuts(), loadApps().map((entry) => entry.executablePath));
  importCandidatesCache = buildDiscoveredApps(shortcuts, loadAppGroups(), randomUUID).slice(0, 80);
  return importCandidatesCache;
}

async function importDiscoveredApps(candidateIds: string[]) {
  const selected = new Set(candidateIds);
  const candidates = importCandidatesCache.filter((candidate) => selected.has(candidate.id));
  const existing = new Set(loadApps().map((entry) => entry.executablePath.trim().toLowerCase()));
  const imported: AppEntry[] = [];
  for (const candidate of candidates) {
    const key = candidate.executablePath.trim().toLowerCase();
    if (!key || existing.has(key) || !existsSync(candidate.executablePath)) continue;
    existing.add(key);
    imported.push(await cacheAppIcon({
      id: randomUUID(),
      name: candidate.name,
      category: candidate.category,
      groupId: validAppGroup(candidate.groupId),
      executablePath: candidate.executablePath,
      processName: candidate.processName,
      workingDirectory: dirname(candidate.executablePath),
      accent: "#2f66e8"
    }));
  }
  const nextApps = [...loadApps(), ...imported];
  saveApps(nextApps);
  savePreferences({ ...loadPreferences(), firstRunImportCompleted: true });
  importCandidatesCache = [];
  return nextApps;
}

function loadAppsWithRuntimeAssociations(): AppEntry[] {
  return loadApps().map((entry) => {
    const associatedPids = [...(runtimeAssociatedPids.get(entry.id) ?? [])];
    return associatedPids.length ? { ...entry, associatedPids } : entry;
  });
}

function saveApps(apps: AppEntry[]) {
  const path = configPath();
  const cached = apps.map(({ associatedPids: _associatedPids, processAliases: _processAliases, ...entry }) => entry);
  const persisted = cached.map(({ launchedPid: _launchedPid, ...entry }) => entry);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(persisted, null, 2), "utf8");
  appsCache = cached;
}

function getApp(id: string) {
  return loadApps().find((item) => item.id === id);
}

function validAppGroup(groupId?: string): AppEntry["groupId"] {
  const groups = loadAppGroups();
  return groups.some((group) => group.id === groupId) ? String(groupId) : groups[0].id;
}

function normalizeProcessName(value: string) {
  return basename(value, extname(value)).trim().toLowerCase();
}

function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, maxBuffer: 1024 * 1024 * 20 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${String(stderr || error.message).trim()}${error.code !== undefined ? ` (exit ${error.code})` : ""}`));
          return;
        }

        resolve(stdout);
      }
    );
  });
}

function runTaskkill(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("taskkill.exe", args, { windowsHide: true }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(String(stderr || error.message).trim()));
        return;
      }
      resolve();
    });
  });
}

async function runElevatedTaskkill(args: string[]) {
  const encodedArgs = Buffer.from(JSON.stringify(args), "utf8").toString("base64");
  const script = `
$arguments = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedArgs}')) | ConvertFrom-Json
try {
  $process = Start-Process -FilePath 'taskkill.exe' -ArgumentList ([string[]]$arguments) -Verb RunAs -Wait -PassThru -ErrorAction Stop
  if ($process.ExitCode -ne 0) { throw "taskkill exited with code $($process.ExitCode)" }
} catch {
  if ($_.Exception.NativeErrorCode -eq 1223 -or $_.Exception.Message -match 'cancel|取消') { exit 1223 }
  throw
}
`;
  try {
    await runPowerShell(script);
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason);
    if (/1223|cancel|取消/i.test(message)) {
      throw Object.assign(new Error(message), { code: "ELEVATION_CANCELLED" });
    }
    throw reason;
  }
}

async function getRunningPids(pids: number[]) {
  const candidates = new Set(pids);
  return (await getProcessSnapshots()).filter((process) => candidates.has(process.pid)).map((process) => process.pid);
}

async function getProcessSnapshots(): Promise<ProcessSnapshot[]> {
  const script = `
$processes = Get-Process | Select-Object Id,ProcessName,CPU,WorkingSet64
$cim = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,ExecutablePath,ReadTransferCount,WriteTransferCount
$infoMap = @{}
foreach ($item in $cim) { $infoMap[[int]$item.ProcessId] = $item }
$rows = foreach ($proc in $processes) {
  $info = $infoMap[[int]$proc.Id]
  [PSCustomObject]@{
    pid = [int]$proc.Id
    parentPid = if ($null -eq $info -or $null -eq $info.ParentProcessId) { 0 } else { [int]$info.ParentProcessId }
    name = [string]$proc.ProcessName
    path = if ($null -eq $info) { "" } else { [string]$info.ExecutablePath }
    cpuSeconds = if ($null -eq $proc.CPU) { 0 } else { [double]$proc.CPU }
    memoryBytes = if ($null -eq $proc.WorkingSet64) { 0 } else { [int64]$proc.WorkingSet64 }
    readBytes = if ($null -eq $info -or $null -eq $info.ReadTransferCount) { 0 } else { [int64]$info.ReadTransferCount }
    writeBytes = if ($null -eq $info -or $null -eq $info.WriteTransferCount) { 0 } else { [int64]$info.WriteTransferCount }
  }
}
$rows | ConvertTo-Json -Compress
`;

  const output = (await runPowerShell(script)).trim();
  if (!output) {
    return [];
  }

  const parsed = JSON.parse(output) as ProcessSnapshot[] | ProcessSnapshot;
  return Array.isArray(parsed) ? parsed : [parsed];
}

function fallbackIconDataUrl(seed: string) {
  const label = [...seed].slice(0, 2).join("").toUpperCase() || "APP";
  const safeLabel = label.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[character] ?? character);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#51b8f2"/><stop offset=".55" stop-color="#6268ee"/><stop offset="1" stop-color="#9765ec"/></linearGradient></defs><rect width="128" height="128" rx="30" fill="url(#g)"/><path d="M18 1h92a17 17 0 0 1 17 17v25C96 23 53 22 18 42Z" fill="white" opacity=".2"/><text x="64" y="77" text-anchor="middle" font-family="Segoe UI, Arial" font-size="34" font-weight="700" fill="white">${safeLabel}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function getShellIcon(executablePath: string) {
  const encodedPath = Buffer.from(executablePath, "utf16le").toString("base64");
  const script = `
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential)]
public struct NativeSize { public int cx; public int cy; }

[Flags]
public enum ShellImageFlags : uint { IconOnly = 0x00000004 }

[ComImport]
[Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IShellItemImageFactory {
  [PreserveSig]
  int GetImage(NativeSize size, ShellImageFlags flags, out IntPtr phbm);
}

public static class ShellImage {
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  private static extern void SHCreateItemFromParsingName(string path, IntPtr bindContext, ref Guid riid, out IShellItemImageFactory factory);

  [DllImport("gdi32.dll")]
  public static extern bool DeleteObject(IntPtr handle);

  public static IntPtr GetBitmap(string path, int pixelSize) {
    Guid iid = new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b");
    IShellItemImageFactory factory;
    SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out factory);
    try {
      NativeSize size = new NativeSize { cx = pixelSize, cy = pixelSize };
      IntPtr bitmap;
      int result = factory.GetImage(size, ShellImageFlags.IconOnly, out bitmap);
      if (result != 0) Marshal.ThrowExceptionForHR(result);
      return bitmap;
    } finally {
      Marshal.ReleaseComObject(factory);
    }
  }
}
'@
$path = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodedPath}'))
$bitmapHandle = [ShellImage]::GetBitmap($path, ${APP_ICON_TARGET_SIZE})
if ($bitmapHandle -eq [IntPtr]::Zero) { throw "Shell icon extraction returned an empty bitmap" }
try {
  $source = [System.Windows.Interop.Imaging]::CreateBitmapSourceFromHBitmap($bitmapHandle, [IntPtr]::Zero, [System.Windows.Int32Rect]::Empty, [System.Windows.Media.Imaging.BitmapSizeOptions]::FromEmptyOptions())
  $encoder = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
  $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($source))
  $stream = New-Object IO.MemoryStream
  $encoder.Save($stream)
  [Convert]::ToBase64String($stream.ToArray())
} finally {
  [ShellImage]::DeleteObject($bitmapHandle) | Out-Null
}
`;
  const output = (await runPowerShell(script)).trim();
  const image = nativeImage.createFromBuffer(Buffer.from(output, "base64"));
  return image.isEmpty() ? null : image;
}

async function getIconDataUrl(executablePath: string, seed: string) {
  if (!executablePath || !existsSync(executablePath)) {
    return fallbackIconDataUrl(seed);
  }

  const cacheKey = executablePath.toLowerCase();
  const cached = processIconCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const image = await app.getFileIcon(executablePath, { size: "normal" });
    const dataUrl = image.isEmpty() ? fallbackIconDataUrl(seed) : image.toDataURL();
    if (processIconCache.size >= 512) {
      const oldest = processIconCache.keys().next().value;
      if (oldest) processIconCache.delete(oldest);
    }
    processIconCache.set(cacheKey, dataUrl);
    return dataUrl;
  } catch {
    return fallbackIconDataUrl(seed);
  }
}

async function cacheAppIcon(appEntry: AppEntry) {
  if (!appEntry.executablePath || !existsSync(appEntry.executablePath)) {
    return { ...appEntry, iconCachePath: undefined, iconDataUrl: fallbackIconDataUrl(appEntry.name), iconCacheVersion: APP_ICON_CACHE_VERSION, iconPixelSize: 0 };
  }

  try {
    mkdirSync(iconCacheDir(), { recursive: true });
    let image = await getShellIcon(appEntry.executablePath).catch((reason) => {
      console.warn(`[icons] Shell extraction failed for ${appEntry.name}:`, reason);
      return null;
    });
    if (!image) image = await app.getFileIcon(appEntry.executablePath, { size: "large" });
    if (image.isEmpty()) {
      return { ...appEntry, iconCachePath: undefined, iconDataUrl: fallbackIconDataUrl(appEntry.name), iconCacheVersion: APP_ICON_CACHE_VERSION, iconPixelSize: 0 };
    }

    const iconPath = join(iconCacheDir(), `${appEntry.id}.png`);
    const iconDataUrl = image.toDataURL();
    const size = image.getSize();
    writeFileSync(iconPath, image.toPNG());
    processIconCache.set(appEntry.executablePath.toLowerCase(), iconDataUrl);
    return { ...appEntry, iconCachePath: iconPath, iconDataUrl, iconCacheVersion: APP_ICON_CACHE_VERSION, iconPixelSize: Math.min(size.width, size.height) };
  } catch (reason) {
    console.warn(`[icons] Icon cache failed for ${appEntry.name}:`, reason);
    return { ...appEntry, iconCachePath: undefined, iconDataUrl: fallbackIconDataUrl(appEntry.name), iconCacheVersion: APP_ICON_CACHE_VERSION, iconPixelSize: 0 };
  }
}

function refreshAppIcons() {
  if (iconRefreshInFlight) return iconRefreshInFlight;
  iconRefreshInFlight = (async () => {
    const current = loadApps();
    const next = [...current];
    for (let index = 0; index < current.length; index += 1) {
      const entry = current[index];
      let cacheUsable = false;
      if (entry.iconCachePath && existsSync(entry.iconCachePath)) {
        const cachedImage = nativeImage.createFromPath(entry.iconCachePath);
        const size = cachedImage.getSize();
        cacheUsable = !cachedImage.isEmpty() && size.width > 0 && size.height > 0;
      }
      if (shouldRefreshAppIcon(entry, cacheUsable)) next[index] = await cacheAppIcon(entry);
    }
    saveApps(next);
    return next;
  })().finally(() => { iconRefreshInFlight = null; });
  return iconRefreshInFlight;
}

const runtimeMonitor = new RuntimeMonitor({
  collect: getProcessSnapshots,
  loadApps: loadAppsWithRuntimeAssociations,
  resolveIcon: getIconDataUrl,
  getTerminationBlockReason,
  processorCount: cpus().length,
  ttlMs: 800
});

async function buildRuntimeSnapshot(mode: SnapshotMode = "full", force = false) {
  return runtimeMonitor.getSnapshot(mode, force);
}

async function metricsSnapshot(): Promise<AppMetrics[]> {
  return (await buildRuntimeSnapshot("managed")).metrics;
}

async function processSnapshot(): Promise<ProcessInfo[]> {
  return (await buildRuntimeSnapshot("full")).processes;
}

async function addExecutable(filePath: string, groupId: AppEntry["groupId"]) {
  const name = basename(filePath, extname(filePath));
  const group = loadAppGroups().find((item) => item.id === groupId) ?? loadAppGroups()[0];
  const appEntry = await cacheAppIcon({
    id: randomUUID(),
    name,
    category: group.name,
    groupId: group.id,
    executablePath: filePath,
    processName: name,
    workingDirectory: dirname(filePath),
    accent: "#2f66e8"
  });
  const nextApps = [...loadApps(), appEntry];
  saveApps(nextApps);
  return nextApps;
}

async function showExeDialog(title: string) {
  const dialogOptions: OpenDialogOptions = {
    title,
    filters: [{ name: "Windows 程序", extensions: ["exe"] }],
    properties: ["openFile"]
  };
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, dialogOptions) : await dialog.showOpenDialog(dialogOptions);
  return result.canceled || result.filePaths.length === 0 ? undefined : result.filePaths[0];
}

type NativeLaunchResult = { ok: boolean; pid?: number; errorCode?: number; detail?: string };

function launchErrorMessage(errorCode?: number) {
  if (errorCode === 2 || errorCode === 3) return "程序或工作目录不存在。";
  if (errorCode === 5) return "没有权限启动该程序。";
  if (errorCode === 267) return "应用配置的工作目录无效。";
  return "启动失败，请检查程序路径和启动参数。";
}

async function launchExecutable(entry: AppEntry): Promise<Omit<LaunchAppResult, "apps">> {
  const payload = Buffer.from(JSON.stringify({
    executablePath: entry.executablePath,
    workingDirectory: entry.workingDirectory || dirname(entry.executablePath),
    argumentLine: entry.launchArgs?.trim() || ""
  }), "utf16le").toString("base64");
  const script = `
$payloadJson = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${payload}'))
$payload = $payloadJson | ConvertFrom-Json
try {
  $options = @{
    FilePath = [string]$payload.executablePath
    WorkingDirectory = [string]$payload.workingDirectory
    PassThru = $true
    ErrorAction = 'Stop'
  }
  if (-not [string]::IsNullOrWhiteSpace([string]$payload.argumentLine)) {
    $options.ArgumentList = [string]$payload.argumentLine
  }
  $process = Start-Process @options
  [PSCustomObject]@{ ok = $true; pid = [int]$process.Id; errorCode = 0; detail = '' } | ConvertTo-Json -Compress
} catch {
  $code = 0
  $cursor = $_.Exception
  while ($null -ne $cursor) {
    if ($cursor.PSObject.Properties.Name -contains 'NativeErrorCode' -and $cursor.NativeErrorCode) {
      $code = [int]$cursor.NativeErrorCode
      break
    }
    $cursor = $cursor.InnerException
  }
  if ($code -eq 0 -and $_.Exception.HResult) {
    $code = [int]($_.Exception.HResult -band 0xFFFF)
  }
  [PSCustomObject]@{ ok = $false; pid = 0; errorCode = $code; detail = [string]$_.Exception.Message } | ConvertTo-Json -Compress
}`;

  const output = (await runPowerShell(script)).trim();
  const result = JSON.parse(output) as NativeLaunchResult;
  if (result.ok) return { status: "launched", pid: result.pid };
  if (result.errorCode === 1223) return { status: "cancelled", errorCode: result.errorCode };
  return {
    status: "failed",
    errorCode: result.errorCode,
    message: launchErrorMessage(result.errorCode)
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeFilesystemPath = (value: string) => value.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();

function isProcessInsideAppDirectory(processPath: string, appEntry: AppEntry) {
  if (!processPath || !appEntry.executablePath) return false;
  const appDirectory = normalizeFilesystemPath(dirname(appEntry.executablePath));
  const childPath = normalizeFilesystemPath(processPath);
  return childPath === normalizeFilesystemPath(appEntry.executablePath) || childPath.startsWith(`${appDirectory}\\`);
}

function collectDescendantProcesses(processes: ProcessSnapshot[], rootPid: number) {
  const byParent = new Map<number, ProcessSnapshot[]>();
  for (const process of processes) {
    if (!process.parentPid) continue;
    const children = byParent.get(process.parentPid) ?? [];
    children.push(process);
    byParent.set(process.parentPid, children);
  }

  const descendants: ProcessSnapshot[] = [];
  const seen = new Set<number>();
  const queue = [...(byParent.get(rootPid) ?? [])];
  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current.pid)) continue;
    seen.add(current.pid);
    descendants.push(current);
    queue.push(...(byParent.get(current.pid) ?? []));
  }
  return descendants;
}

async function learnProcessAliasesFromLaunch(appId: string, launchedPid: number) {
  const descendants = collectDescendantProcesses(await getProcessSnapshots(), launchedPid);
  const current = getApp(appId);
  if (!current || !descendants.length) return { apps: loadApps(), learned: false, linked: descendants };

  const associated = runtimeAssociatedPids.get(appId) ?? new Set<number>();
  const before = associated.size;

  for (const process of descendants) {
    if (!isProcessInsideAppDirectory(process.path, current)) continue;
    associated.add(process.pid);
  }

  if (associated.size) runtimeAssociatedPids.set(appId, associated);
  return { apps: loadApps(), learned: associated.size > before, linked: descendants };
}

async function settleLaunchedAppAssociation(appId: string, launchedPid: number) {
  await sleep(800);
  let learned = await learnProcessAliasesFromLaunch(appId, launchedPid);
  let snapshot = await buildRuntimeSnapshot("managed", true);
  if (snapshot.metrics.find((metric) => metric.appId === appId)?.isRunning) {
    void (async () => {
      await sleep(1200);
      await learnProcessAliasesFromLaunch(appId, launchedPid);
      await buildRuntimeSnapshot("managed", true);
    })().catch((reason) => console.warn(`[launch] Deferred child process learning failed for ${appId}:`, reason));
    return loadApps();
  }

  await sleep(1200);
  learned = await learnProcessAliasesFromLaunch(appId, launchedPid);
  snapshot = await buildRuntimeSnapshot("managed", true);
  return learned.learned ? learned.apps : snapshot.apps;
}

function saveLaunchedPidAndTrack(appId: string, launchedPid: number | undefined, waitForAssociation: boolean) {
  const nextApps = loadApps().map((item) => item.id === appId ? { ...item, launchedPid } : item);
  saveApps(nextApps);
  if (!launchedPid) return Promise.resolve(nextApps);
  const tracking = settleLaunchedAppAssociation(appId, launchedPid);
  if (waitForAssociation) return tracking;
  void tracking.catch((reason) => console.warn(`[launch] Failed to learn child process aliases for ${appId}:`, reason));
  return Promise.resolve(nextApps);
}

async function launchConfiguredApp(id: string, options: { waitForAssociation?: boolean } = {}): Promise<LaunchAppResult> {
  const entry = getApp(id);
  if (!entry) return { status: "failed", apps: loadApps(), errorCode: 2, message: "未找到该应用配置。" };

  const currentMetrics = (await metricsSnapshot()).find((item) => item.appId === id);
  if (currentMetrics?.isRunning) return { status: "alreadyRunning", apps: loadApps() };
  if (!entry.executablePath || !existsSync(entry.executablePath)) {
    return { status: "failed", apps: loadApps(), errorCode: 2, message: "程序路径不存在，请重新选择启动程序。" };
  }

  const workingDirectory = entry.workingDirectory || dirname(entry.executablePath);
  if (!existsSync(workingDirectory)) {
    return { status: "failed", apps: loadApps(), errorCode: 267, message: "应用配置的工作目录无效。" };
  }

  const launchResult = await launchExecutable(entry);
  if (launchResult.status !== "launched") return { ...launchResult, apps: loadApps() };

  const nextApps = await saveLaunchedPidAndTrack(id, launchResult.pid, options.waitForAssociation === true);
  return { ...launchResult, apps: nextApps };
}

function registerIpc() {
  ipcMain.handle("groups:list", () => listGroups());
  ipcMain.handle("groups:create", (_event, input: GroupInput) => {
    const groups = loadAppGroups();
    const next = [...groups, {
      id: randomUUID(),
      name: validateGroupName(input.name),
      icon: validateGroupIcon(input.icon),
      isSystem: false,
      order: groups.length
    }];
    saveGroups(next);
    return listGroups();
  });
  ipcMain.handle("groups:update", (_event, input: GroupUpdateInput) => {
    if (!loadAppGroups().some((group) => group.id === input.id)) throw new Error("分组不存在");
    const name = validateGroupName(input.name, input.id);
    const icon = validateGroupIcon(input.icon);
    saveGroups(loadAppGroups().map((group) => group.id === input.id ? { ...group, name, icon } : group));
    saveApps(loadApps().map((entry) => entry.groupId === input.id ? { ...entry, category: name } : entry));
    return listGroups();
  });
  ipcMain.handle("groups:reorder", (_event, groupIds: string[]) => {
    const groups = loadAppGroups();
    const uniqueIds = [...new Set(groupIds)];
    if (uniqueIds.length !== groups.length || groups.some((group) => !uniqueIds.includes(group.id))) {
      throw new Error("分组排序数据无效");
    }
    const byId = new Map(groups.map((group) => [group.id, group]));
    saveGroups(uniqueIds.map((id) => byId.get(id)!));
    return listGroups();
  });
  ipcMain.handle("groups:remove", (_event, groupId: string, targetGroupId: string) => {
    const groups = loadAppGroups();
    if (groups.length <= 1) throw new Error("至少需要保留一个应用分组");
    if (!groups.some((group) => group.id === groupId)) throw new Error("要删除的分组不存在");
    if (groupId === targetGroupId || !groups.some((group) => group.id === targetGroupId)) throw new Error("请选择有效的迁移目标分组");

    const targetGroup = groups.find((group) => group.id === targetGroupId)!;
    const nextApps = loadApps().map((entry) => entry.groupId === groupId ? { ...entry, groupId: targetGroupId, category: targetGroup.name } : entry);
    saveApps(nextApps);
    saveGroups(groups.filter((group) => group.id !== groupId));
    return { groups: listGroups(), apps: nextApps, targetGroupId };
  });
  ipcMain.handle("apps:list", () => loadApps());
  ipcMain.handle("apps:discoverImportCandidates", () => discoverImportCandidates());
  ipcMain.handle("apps:importDiscovered", (_event, candidateIds: string[]) => importDiscoveredApps(Array.isArray(candidateIds) ? candidateIds : []));
  ipcMain.handle("apps:refreshIcons", () => refreshAppIcons());

  ipcMain.handle("apps:addFromDialog", async (_event, groupId?: AppEntry["groupId"]) => {
    const filePath = await showExeDialog("选择要加入 Start Engineer 的程序");
    return filePath ? addExecutable(filePath, validAppGroup(groupId)) : loadApps();
  });

  ipcMain.handle("apps:pickExecutable", async (_event, id: string) => {
    const filePath = await showExeDialog("选择应用启动程序");
    if (!filePath) {
      return loadApps();
    }
    runtimeAssociatedPids.delete(id);

    const nextApps = await Promise.all(
      loadApps().map(async (item) => {
        if (item.id !== id) {
          return item;
        }

        return cacheAppIcon({
          ...item,
          executablePath: filePath,
          processName: basename(filePath, extname(filePath)),
          workingDirectory: dirname(filePath)
        });
      })
    );
    saveApps(nextApps);
    return nextApps;
  });

  ipcMain.handle("apps:update", async (_event, input: UpdateAppInput) => {
    runtimeAssociatedPids.delete(input.id);
    const nextApps = await Promise.all(
      loadApps().map(async (item) => {
        if (item.id !== input.id) {
          return item;
        }
        const next = { ...item, ...input };
        return input.executablePath ? cacheAppIcon(next) : next;
      })
    );
    saveApps(nextApps);
    return nextApps;
  });

  ipcMain.handle("apps:setGroup", (_event, id: string, groupId: AppEntry["groupId"]) => {
    const validGroupId = validAppGroup(groupId);
    const group = loadAppGroups().find((item) => item.id === validGroupId)!;
    const nextApps = loadApps().map((item) => (item.id === id ? { ...item, groupId: validGroupId, category: group.name } : item));
    saveApps(nextApps);
    return nextApps;
  });

  ipcMain.handle("apps:reorderInGroup", (_event, groupId: AppEntry["groupId"], appIds: string[]) => {
    if (!loadAppGroups().some((group) => group.id === groupId)) throw new Error("分组不存在。");
    if (!Array.isArray(appIds) || appIds.length === 0) throw new Error("排序数据无效。");
    const nextApps = mergeVisibleAppOrder(loadApps(), groupId, appIds);
    saveApps(nextApps);
    return nextApps;
  });

  ipcMain.handle("apps:setLaunchSelected", (_event, id: string, selected: boolean) => {
    if (!getApp(id)) throw new Error("未找到该应用配置。");
    const nextApps = loadApps().map((item) => item.id === id ? { ...item, launchSelected: Boolean(selected) } : item);
    saveApps(nextApps);
    return nextApps;
  });

  ipcMain.handle("groups:setLaunchSelected", (_event, groupId: string, selected: boolean) => {
    if (!loadAppGroups().some((group) => group.id === groupId)) throw new Error("分组不存在。");
    const nextApps = loadApps().map((item) => item.groupId === groupId ? { ...item, launchSelected: Boolean(selected) } : item);
    saveApps(nextApps);
    return nextApps;
  });

  ipcMain.handle("apps:launch", async (_event, id: string) => {
    const entry = getApp(id);
    if (!entry) {
      return { status: "failed", apps: loadApps(), errorCode: 2, message: "未找到该应用配置。" } satisfies LaunchAppResult;
    }

    const currentMetrics = (await metricsSnapshot()).find((item) => item.appId === id);
    if (currentMetrics?.isRunning) {
      return { status: "alreadyRunning", apps: loadApps() } satisfies LaunchAppResult;
    }

    if (!entry.executablePath || !existsSync(entry.executablePath)) {
      return { status: "failed", apps: loadApps(), errorCode: 2, message: "程序路径不存在，请重新选择启动程序。" } satisfies LaunchAppResult;
    }

    const workingDirectory = entry.workingDirectory || dirname(entry.executablePath);
    if (!existsSync(workingDirectory)) {
      return { status: "failed", apps: loadApps(), errorCode: 267, message: "应用配置的工作目录无效。" } satisfies LaunchAppResult;
    }

    const launchResult = await launchExecutable(entry);
    if (launchResult.status !== "launched") {
      return { ...launchResult, apps: loadApps() } satisfies LaunchAppResult;
    }

    const nextApps = await saveLaunchedPidAndTrack(id, launchResult.pid, true);
    return { ...launchResult, apps: nextApps } satisfies LaunchAppResult;
  });

  ipcMain.handle("groups:launchSelected", async (_event, groupId: string) => {
    if (!loadAppGroups().some((group) => group.id === groupId)) throw new Error("分组不存在。");
    const groupApps = loadApps().filter((item) => item.groupId === groupId);
    const results = await launchAppsSequentially(groupApps, (entry) => launchConfiguredApp(entry.id));
    return { apps: loadApps(), results } satisfies BatchLaunchResult;
  });

  ipcMain.handle("apps:kill", async (_event, id: string) => {
    const metrics = (await buildRuntimeSnapshot("managed", true)).metrics.find((item) => item.appId === id);
    const pids = metrics?.pids ?? [];
    const entry = getApp(id);
    if (!entry) throw new Error("未找到该应用配置");
    const blockedReason = getTerminationBlockReason(`${entry?.processName || ""}.exe`, pids);
    if (blockedReason) {
      throw new Error(blockedReason);
    }
    await terminatePids(pids, { runNormal: runTaskkill, runElevated: runElevatedTaskkill, getRunningPids });

    const refreshedMetrics = (await buildRuntimeSnapshot("managed", true)).metrics.find((item) => item.appId === id);
    if (refreshedMetrics?.isRunning) throw new Error("应用进程仍在运行，可能已被后台服务重新启动");

    runtimeAssociatedPids.delete(id);
    const nextApps = loadApps().map((item) => (item.id === id ? { ...item, launchedPid: undefined } : item));
    saveApps(nextApps);
    return nextApps;
  });

  ipcMain.handle("groups:killApps", async (_event, groupId: string) => {
    if (!loadAppGroups().some((group) => group.id === groupId)) throw new Error("分组不存在。");
    const groupApps = loadApps().filter((item) => item.groupId === groupId);
    const snapshot = await buildRuntimeSnapshot("managed", true);
    const targets = collectGroupTermination(groupApps, snapshot.metrics);

    for (const entry of targets.apps) {
      const metric = snapshot.metrics.find((item) => item.appId === entry.id);
      const blockedReason = getTerminationBlockReason(`${entry.processName || ""}.exe`, metric?.pids ?? []);
      if (blockedReason) throw new Error(`${entry.name}：${blockedReason}`);
    }

    if (targets.pids.length) {
      await terminatePids(targets.pids, { runNormal: runTaskkill, runElevated: runElevatedTaskkill, getRunningPids });
    }

    const refreshed = await buildRuntimeSnapshot("managed", true);
    const refreshedByApp = new Map(refreshed.metrics.map((metric) => [metric.appId, metric]));
    const results = targets.apps.map((entry) => refreshedByApp.get(entry.id)?.isRunning
      ? { appId: entry.id, name: entry.name, status: "restarted" as const, message: "应用进程仍在运行，可能已被后台服务重新启动。" }
      : { appId: entry.id, name: entry.name, status: "terminated" as const });
    const stoppedIds = new Set(results.filter((item) => item.status === "terminated").map((item) => item.appId));
    for (const id of stoppedIds) runtimeAssociatedPids.delete(id);
    const nextApps = loadApps().map((item) => stoppedIds.has(item.id) ? { ...item, launchedPid: undefined } : item);
    saveApps(nextApps);
    return { apps: nextApps, results } satisfies BatchKillResult;
  });

  ipcMain.handle("apps:remove", (_event, id: string) => {
    const entry = getApp(id);
    runtimeAssociatedPids.delete(id);
    const nextApps = loadApps().filter((item) => item.id !== id);
    saveApps(nextApps);

    if (entry?.iconCachePath && entry.iconCachePath.startsWith(iconCacheDir()) && existsSync(entry.iconCachePath)) {
      rmSync(entry.iconCachePath, { force: true });
    }
    return nextApps;
  });

  ipcMain.handle("processes:killGroup", async (_event, input: { name: string; pids: number[] }) => {
    const requestedPids = [...new Set(input.pids.filter((pid) => Number.isSafeInteger(pid) && pid > 0))];
    const blockedReason = getTerminationBlockReason(input.name, requestedPids);
    if (blockedReason) {
      throw new Error(blockedReason);
    }

    const current = await getProcessSnapshots();
    const expectedName = normalizeProcessName(input.name);
    const verifiedPids = requestedPids.filter((pid) => {
      const processInfo = current.find((item) => item.pid === pid);
      return processInfo && normalizeProcessName(processInfo.name) === expectedName;
    });

    if (verifiedPids.length === 0) {
      throw new Error("进程已经结束或 PID 已发生变化");
    }

    const currentBlockReason = getTerminationBlockReason(input.name, verifiedPids);
    if (currentBlockReason) {
      throw new Error(currentBlockReason);
    }

    for (const pid of verifiedPids) {
      await new Promise<void>((resolve, reject) => {
        execFile("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, (error) => {
          if (error && !String(error.message).includes("not found")) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  ipcMain.handle("shell:showItemInFolder", (_event, filePath: string) => {
    if (!filePath || !existsSync(filePath)) {
      throw new Error("文件路径不存在或当前无权访问");
    }
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle("clipboard:writeText", (_event, text: string) => {
    clipboard.writeText(String(text ?? ""));
  });

  ipcMain.handle("search:everything", (_event, query: string) => {
    const dependency = getSearchDependencyStatus();
    if (dependency.state !== "ready" || !dependency.everythingCliPath) {
      throw new Error(dependency.message || "请先一键准备 Everything 搜索依赖");
    }
    return runEverythingSearch(String(query ?? ""), { cliPath: dependency.everythingCliPath });
  });
  ipcMain.handle("search:pickEverythingCli", async () => {
    const options: OpenDialogOptions = {
      title: "选择 Everything 的 ES.exe",
      filters: [{ name: "Everything 命令行工具", extensions: ["exe"] }],
      properties: ["openFile"]
    };
    const result = mainWindow && !mainWindow.isDestroyed()
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return preferencesSnapshot();
    if (basename(result.filePaths[0]).toLowerCase() !== "es.exe") {
      throw new Error("请选择 Everything 的 ES.exe 命令行工具。");
    }
    savePreferences({ ...loadPreferences(), everythingCliPath: result.filePaths[0] });
    searchDependencyStatus = null;
    return preferencesSnapshot();
  });
  ipcMain.handle("search:dependencyStatus", () => getSearchDependencyStatus());
  ipcMain.handle("search:prepareDependencies", () => prepareSearchDependencies());
  ipcMain.handle("search:openDependencyFolder", () => {
    const paths = getManagedEverythingPaths(app.getPath("userData"));
    mkdirSync(paths.root, { recursive: true });
    shell.openPath(paths.root);
  });
  ipcMain.handle("search:openResult", async (_event, filePath: string) => {
    if (!filePath || !existsSync(filePath)) throw new Error("搜索结果不存在或当前无权访问");
    const error = await shell.openPath(filePath);
    if (error) throw new Error(error);
  });
  ipcMain.handle("search:showInFolder", (_event, filePath: string) => {
    if (!filePath || !existsSync(filePath)) throw new Error("搜索结果不存在或当前无权访问");
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle("metrics:snapshot", () => metricsSnapshot());
  ipcMain.handle("processes:snapshot", () => processSnapshot());
  ipcMain.handle("runtime:snapshot", (_event, mode: SnapshotMode = "full", force = false) => {
    const safeMode: SnapshotMode = mode === "managed" ? "managed" : "full";
    return buildRuntimeSnapshot(safeMode, Boolean(force));
  });
  ipcMain.handle("preferences:get", () => preferencesSnapshot());
  ipcMain.handle("preferences:update", (_event, input: UpdatePreferencesInput) => updatePreferences(input));
  ipcMain.handle("preferences:restartWithConfiguredPrivileges", () => restartWithConfiguredPrivileges());

  ipcMain.handle("window:action", (_event, action: WindowAction) => {
    if (!mainWindow) {
      return;
    }

    if (action === "minimize") {
      mainWindow.minimize();
    } else if (action === "maximize") {
      mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    } else {
      mainWindow.close();
    }
  });
}

let handedOffToAdministrator = false;
if (process.platform === "win32" && shouldRequestAdministratorRelaunch(loadPreferences().runAsAdministrator, isRunningAsAdministrator, process.argv)) {
  try {
    launchElevatedSynchronously(buildRestartRequest(process.execPath, process.env.PORTABLE_EXECUTABLE_FILE, true));
    handedOffToAdministrator = true;
  } catch {
    administratorMessage = "管理员授权已取消，当前仍以普通权限运行";
  }
}

const hasSingleInstanceLock = !handedOffToAdministrator && app.requestSingleInstanceLock();
if (handedOffToAdministrator || !hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", showMainWindow);
  app.on("before-quit", () => { isQuitting = true; globalShortcut.unregisterAll(); registeredShortcut = ""; });
  app.whenReady().then(async () => {
    registerIpc();
    const preferences = loadPreferences();
    createWindow();
    await createTray();
    applyGlobalShortcut(preferences, false);
    nativeTheme.on("updated", () => {
      if (loadPreferences().uiTheme === "system") applyWindowTheme();
    });

    app.on("activate", showMainWindow);
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" && (isQuitting || loadPreferences().closeBehavior === "quit")) app.quit();
  });
}
