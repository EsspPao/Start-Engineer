import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, shell, type OpenDialogOptions } from "electron";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AppEntry,
  AppGroup,
  AppMetrics,
  GroupInput,
  GroupUpdateInput,
  LaunchAppResult,
  ProcessInfo,
  SnapshotMode,
  UpdateAppInput,
  WindowAction
} from "../shared/types.js";
import { RuntimeMonitor, type ProcessSnapshot } from "./runtime-monitor.js";
import { migrateAppEntry, normalizeGroups } from "./config-migration.js";
import { APP_ICON_CACHE_VERSION, APP_ICON_TARGET_SIZE, shouldRefreshAppIcon } from "./icon-cache.js";

const isDev = process.env.VITE_DEV_SERVER_URL !== undefined;
const appRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const rendererUrl = process.env.VITE_DEV_SERVER_URL;
const rendererIndex = join(appRoot, "dist", "index.html");
const preloadPath = join(appRoot, "dist-electron", "preload", "preload.cjs");
app.setPath("userData", join(app.getPath("appData"), "commanddeck-next"));
const configPath = () => join(app.getPath("userData"), "apps.json");
const groupsPath = () => join(app.getPath("userData"), "groups.json");
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
let appsCache: AppEntry[] = [];
let groupsCache: AppGroup[] = [];
let iconRefreshInFlight: Promise<AppEntry[]> | null = null;

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
    return "不能结束 Star Engineer 自身进程";
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
    title: "Star Engineer",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.platform === "win32") {
    try {
      mainWindow.setBackgroundMaterial("mica");
    } catch {
      mainWindow.setBackgroundColor("#edf4ff");
    }
  }

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
  return [
    {
      id: randomUUID(),
      name: "鸣潮",
      category: "游戏",
      groupId: "games",
      executablePath: "",
      processName: "launcher",
      accent: "#2f66e8"
    },
    {
      id: randomUUID(),
      name: "终末地",
      category: "游戏",
      groupId: "games",
      executablePath: "",
      processName: "Endfield",
      accent: "#2f66e8"
    },
    {
      id: randomUUID(),
      name: "Steam",
      category: "工具",
      groupId: "tools",
      executablePath: "C:\\Program Files (x86)\\Steam\\steam.exe",
      processName: "steam",
      accent: "#2f66e8"
    },
    {
      id: randomUUID(),
      name: "微信",
      category: "办公",
      groupId: "office",
      executablePath: "",
      processName: "WeChat",
      accent: "#2f66e8"
    }
  ];
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
    if (Array.isArray(parsed) && parsed.length > 0) {
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

function saveApps(apps: AppEntry[]) {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(apps, null, 2), "utf8");
  appsCache = apps;
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
          reject(new Error(stderr || error.message));
          return;
        }

        resolve(stdout);
      }
    );
  });
}

async function getProcessSnapshots(): Promise<ProcessSnapshot[]> {
  const script = `
$processes = Get-Process | Select-Object Id,ProcessName,CPU,WorkingSet64
$cim = Get-CimInstance Win32_Process | Select-Object ProcessId,ExecutablePath,ReadTransferCount,WriteTransferCount
$infoMap = @{}
foreach ($item in $cim) { $infoMap[[int]$item.ProcessId] = $item }
$rows = foreach ($proc in $processes) {
  $info = $infoMap[[int]$proc.Id]
  [PSCustomObject]@{
    pid = [int]$proc.Id
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
  loadApps,
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
  ipcMain.handle("apps:refreshIcons", () => refreshAppIcons());

  ipcMain.handle("apps:addFromDialog", async (_event, groupId?: AppEntry["groupId"]) => {
    const filePath = await showExeDialog("选择要加入 Star Engineer 的程序");
    return filePath ? addExecutable(filePath, validAppGroup(groupId)) : loadApps();
  });

  ipcMain.handle("apps:pickExecutable", async (_event, id: string) => {
    const filePath = await showExeDialog("选择应用启动程序");
    if (!filePath) {
      return loadApps();
    }

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

    const nextApps = loadApps().map((item) => (item.id === id ? { ...item, launchedPid: launchResult.pid } : item));
    saveApps(nextApps);
    return { ...launchResult, apps: nextApps } satisfies LaunchAppResult;
  });

  ipcMain.handle("apps:kill", async (_event, id: string) => {
    const metrics = (await metricsSnapshot()).find((item) => item.appId === id);
    const pids = metrics?.pids ?? [];
    const entry = getApp(id);
    const blockedReason = getTerminationBlockReason(`${entry?.processName || ""}.exe`, pids);
    if (blockedReason) {
      throw new Error(blockedReason);
    }
    for (const pid of pids) {
      await new Promise<void>((resolve) => {
        execFile("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => resolve());
      });
    }

    const nextApps = loadApps().map((item) => (item.id === id ? { ...item, launchedPid: undefined } : item));
    saveApps(nextApps);
    return nextApps;
  });

  ipcMain.handle("apps:remove", (_event, id: string) => {
    const entry = getApp(id);
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

  ipcMain.handle("metrics:snapshot", () => metricsSnapshot());
  ipcMain.handle("processes:snapshot", () => processSnapshot());
  ipcMain.handle("runtime:snapshot", (_event, mode: SnapshotMode = "full", force = false) => {
    const safeMode: SnapshotMode = mode === "managed" ? "managed" : "full";
    return buildRuntimeSnapshot(safeMode, Boolean(force));
  });

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

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
