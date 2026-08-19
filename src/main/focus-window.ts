import { dirname } from "node:path";
import type { AppEntry, AppMetrics } from "../shared/types.js";
import { runNativeHelper } from "./native-helper.js";
import type { ProcessSnapshot } from "./runtime-monitor.js";
import { usesWakeProfile } from "./wake-profiles.js";

export type PowerShellRunner = (script: string) => Promise<string>;
export type WindowFocusHelperCommand = "scan" | "focus";
export type WindowFocusHelperRunner = (command: WindowFocusHelperCommand, payload: unknown) => Promise<string>;

export type FocusProcessSnapshot = Pick<ProcessSnapshot, "pid" | "parentPid" | "name" | "path">;
export type FocusCandidateStages = {
  matchedPids: number[];
  childPids: number[];
  directoryPids: number[];
  namePids: number[];
  titleKeywords: string[];
  classKeywords: string[];
  processNameKeywords: string[];
  pathKeywords: string[];
};
export type FocusWindowStage = {
  label: string;
  pids: number[];
  titleKeywords?: string[];
  classKeywords?: string[];
  processNameKeywords?: string[];
  pathKeywords?: string[];
};
export type FocusWindowCandidate = {
  handle: number;
  pid: number;
  title: string;
  score: number;
  className?: string;
  processName?: string;
  executablePath?: string;
  processError?: number;
  matchReason?: string;
  filterReason?: string;
  exStyle?: number;
  visible?: boolean;
  iconic?: boolean;
  toolWindow?: boolean;
  owner?: number;
  width?: number;
  height?: number;
  foregroundHandle?: number;
  foregroundPid?: number;
  stage?: string;
};
export type FocusWindowScanResult = {
  allWindowsScanned: number;
  relatedWindows: FocusWindowCandidate[];
  filteredWindows: FocusWindowCandidate[];
  finalCandidates: FocusWindowCandidate[];
};
export type TrayRestoreResult = {
  attempted: boolean;
  success: boolean;
  reason?: "trayIconNotFound" | "trayRestoreFailed" | "trayRestoreUnsupported";
  matchedName?: string;
};
export type FocusWindowHandleResult = {
  focused: boolean;
  reason?: "no-window" | "tray-hidden" | "foreground-blocked" | "unknown";
};

function validPids(pids: number[]) {
  return [...new Set(pids.filter((pid) => Number.isSafeInteger(pid) && pid > 0))];
}

const normalizeName = (value: string) => (value.split(/[\\/]/).pop() ?? value).replace(/\.exe$/i, "").trim().toLowerCase();
const normalizePath = (value: string) => value.trim().replace(/\//g, "\\").toLowerCase();
const uniqueStrings = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const weChatProcessNames = ["Weixin", "WeChat", "WeChatAppEx", "WeChatBrowser", "WeChatUtility"];
const weChatTitleKeywords = ["微信", "WeChat", "Weixin"];
const weChatClassKeywords = ["WeChat", "Weixin", "ChatWnd"];
export function runWindowFocusHelper(command: WindowFocusHelperCommand, payload: unknown): Promise<string> {
  return runNativeHelper(command, payload);
}

function descendantPids(processes: FocusProcessSnapshot[], roots: number[]) {
  const candidates = new Set(validPids(roots));
  const descendants = new Set<number>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const process of processes) {
      if (process.parentPid && candidates.has(process.parentPid) && !candidates.has(process.pid)) {
        candidates.add(process.pid);
        descendants.add(process.pid);
        changed = true;
      }
    }
  }
  return [...descendants];
}

function isInsideDirectory(processPath: string, directoryPath: string) {
  if (!processPath || !directoryPath) return false;
  const normalizedProcessPath = normalizePath(processPath);
  const normalizedDirectory = normalizePath(directoryPath).replace(/\\+$/, "");
  return normalizedProcessPath.startsWith(`${normalizedDirectory}\\`);
}

export function collectFocusCandidateStages(app: AppEntry, metrics: AppMetrics | undefined, processes: FocusProcessSnapshot[]): FocusCandidateStages {
  const weChatLike = usesWakeProfile(app, "wechat");
  const matchedPids = validPids([...(metrics?.matchedPids ?? metrics?.pids ?? []), ...(metrics?.associatedPids ?? [])]);
  const childPids = validPids(descendantPids(processes, matchedPids));
  const appPath = normalizePath(app.executablePath);
  const appDirectory = app.executablePath ? dirname(app.executablePath) : "";
  const appNames = new Set([
    normalizeName(app.processName),
    normalizeName(app.executablePath),
    ...(metrics?.matchedProcessNames ?? []).map(normalizeName),
    ...(app.processAliases ?? []).map(normalizeName),
    ...(weChatLike ? weChatProcessNames.map(normalizeName) : [])
  ].filter(Boolean));

  const directoryPids = validPids(processes
    .filter((process) => (appPath && normalizePath(process.path) === appPath) || isInsideDirectory(process.path, appDirectory))
    .map((process) => process.pid));
  const namePids = validPids(processes
    .filter((process) => appNames.has(normalizeName(process.name)))
    .map((process) => process.pid));
  const titleKeywords = uniqueStrings([
    app.name,
    app.processName,
    normalizeName(app.executablePath),
    ...(metrics?.matchedProcessNames ?? []),
    ...(app.processAliases ?? []),
    ...(weChatLike ? weChatTitleKeywords : [])
  ]);
  const classKeywords = uniqueStrings(weChatLike ? weChatClassKeywords : []);
  const processNameKeywords = uniqueStrings([
    app.processName,
    normalizeName(app.executablePath),
    ...(metrics?.matchedProcessNames ?? []),
    ...(app.processAliases ?? []),
    ...(weChatLike ? weChatProcessNames : [])
  ]);
  const pathKeywords = uniqueStrings([
    app.executablePath,
    ...(metrics?.matchedPaths ?? []),
    ...(weChatLike ? ["Tencent\\xwechat", "Weixin", "WeChat"] : [])
  ]);

  return { matchedPids, childPids, directoryPids, namePids, titleKeywords, classKeywords, processNameKeywords, pathKeywords };
}

export function collectFocusCandidatePids(app: AppEntry, metricPids: number[], processes: FocusProcessSnapshot[]) {
  const candidates = new Set(validPids(metricPids));
  const stages = collectFocusCandidateStages(app, undefined, processes);

  for (const pid of app.associatedPids ?? []) {
    if (Number.isSafeInteger(pid) && pid > 0) candidates.add(pid);
  }
  if (Number.isSafeInteger(app.launchedPid) && app.launchedPid && app.launchedPid > 0) {
    candidates.add(app.launchedPid);
  }

  for (const pid of [...stages.directoryPids, ...stages.namePids]) candidates.add(pid);
  for (const pid of descendantPids(processes, [...candidates])) candidates.add(pid);

  return validPids([...candidates]);
}

function psString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function psNumberArray(values: number[]) {
  const safe = validPids(values);
  return safe.length ? safe.join(",") : "";
}

function normalizeFocusStages(stages: FocusWindowStage[]) {
  return stages
    .map((stage) => ({
      label: stage.label.trim() || "candidate",
      pids: validPids(stage.pids),
      titleKeywords: uniqueStrings(stage.titleKeywords ?? []).map((keyword) => keyword.toLowerCase()),
      classKeywords: uniqueStrings(stage.classKeywords ?? []).map((keyword) => keyword.toLowerCase()),
      processNameKeywords: uniqueStrings(stage.processNameKeywords ?? []).map((keyword) => normalizeName(keyword)),
      pathKeywords: uniqueStrings(stage.pathKeywords ?? []).map((keyword) => normalizePath(keyword))
    }))
    .filter((stage) => stage.pids.length || stage.titleKeywords.length || stage.classKeywords.length || stage.processNameKeywords.length || stage.pathKeywords.length);
}

export function buildFindFocusWindowCandidateScript(stages: FocusWindowStage[]) {
  const normalizedStages = normalizeFocusStages(stages);
  const json = JSON.stringify(normalizedStages);
  return `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class WindowFocus {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll", SetLastError=true)] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll", EntryPoint="GetWindowTextLengthW", CharSet=CharSet.Unicode)] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", EntryPoint="GetWindowTextW", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", EntryPoint="GetClassNameW", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("kernel32.dll", EntryPoint="OpenProcess")] public static extern IntPtr OpenProcess(uint access, bool inheritHandle, uint processId);
  [DllImport("kernel32.dll", EntryPoint="CloseHandle")] public static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", EntryPoint="QueryFullProcessImageNameW", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder exeName, ref int size);
  [DllImport("kernel32.dll")] public static extern uint GetLastError();
}
'@
$stages = @(${psString(json)} | ConvertFrom-Json)
$script:processCache = @{}
function Get-ProcessInfoForWindow($pid) {
  if ($script:processCache.ContainsKey([int]$pid)) { return $script:processCache[[int]$pid] }
  $name = ""
  $path = ""
  $processError = 0
  try {
    try {
      $process = Get-Process -Id ([int]$pid) -ErrorAction Stop
      $name = [string]$process.ProcessName
    } catch {
      $process = $null
      $processError = 1
    }
    $handle = [WindowFocus]::OpenProcess(0x1000, $false, [uint32]$pid)
    if ($handle -ne [IntPtr]::Zero) {
      try {
        $builder = New-Object System.Text.StringBuilder 1024
        $size = $builder.Capacity
        if ([WindowFocus]::QueryFullProcessImageName($handle, 0, $builder, [ref]$size)) { $path = $builder.ToString() }
        else { $processError = [Runtime.InteropServices.Marshal]::GetLastWin32Error() }
      } finally {
        [void][WindowFocus]::CloseHandle($handle)
      }
    } else {
      $processError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    }
    if (-not $path -and $process) { try { $path = [string]$process.MainModule.FileName } catch { if (-not $processError) { $processError = 2 }; $path = "" } }
  } catch {}
  if (-not $name -and $path) {
    $leaf = Split-Path $path -Leaf
    $name = [System.IO.Path]::GetFileNameWithoutExtension($leaf)
  }
  $info = [PSCustomObject]@{ name = $name; path = $path; processError = $processError }
  $script:processCache[[int]$pid] = $info
  return $info
}
$script:found = [IntPtr]::Zero
$script:foundPid = 0
$script:foundTitle = ""
$script:bestScore = -1
$script:bestStage = ""
$script:candidates = New-Object System.Collections.Generic.List[string]
[WindowFocus]::EnumWindows({
  param($hWnd, $lParam)
  $pid = 0
  [void][WindowFocus]::GetWindowThreadProcessId($hWnd, [ref]$pid)
  $titleLength = [WindowFocus]::GetWindowTextLength($hWnd)
  $titleBuilder = New-Object System.Text.StringBuilder 512
  [void][WindowFocus]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity)
  $title = $titleBuilder.ToString()
  $lowerTitle = $title.ToLowerInvariant()
  $classBuilder = New-Object System.Text.StringBuilder 256
  [void][WindowFocus]::GetClassName($hWnd, $classBuilder, $classBuilder.Capacity)
  $className = $classBuilder.ToString()
  $lowerClassName = $className.ToLowerInvariant()
  $processInfo = Get-ProcessInfoForWindow $pid
  $processName = [string]$processInfo.name
  $lowerProcessName = $processName.ToLowerInvariant()
  $processPath = [string]$processInfo.path
  $processError = [int]$processInfo.processError
  $lowerProcessPath = $processPath.Replace('/', '\\').ToLowerInvariant()
  $visible = [WindowFocus]::IsWindowVisible($hWnd)
  $iconic = [WindowFocus]::IsIconic($hWnd)
  $exStyle = [WindowFocus]::GetWindowLong($hWnd, -20)
  $toolWindow = (($exStyle -band 0x00000080) -ne 0)
  $owner = [WindowFocus]::GetWindow($hWnd, 4).ToInt64()
  $rect = New-Object WindowFocus+RECT
  [void][WindowFocus]::GetWindowRect($hWnd, [ref]$rect)
  $width = [Math]::Max(0, $rect.Right - $rect.Left)
  $height = [Math]::Max(0, $rect.Bottom - $rect.Top)
  for ($index = 0; $index -lt $stages.Count; $index++) {
    $stage = $stages[$index]
    $stagePids = @($stage.pids)
    $stageKeywords = @($stage.titleKeywords)
    $stageClassKeywords = @($stage.classKeywords)
    $stageProcessKeywords = @($stage.processNameKeywords)
    $stagePathKeywords = @($stage.pathKeywords)
    $matchedByPid = $stagePids -contains [int]$pid
    $matchedByTitle = $false
    $matchedByClass = $false
    $matchedByProcess = $false
    $matchedByPath = $false
    foreach ($keyword in $stageKeywords) {
      if ($keyword -and $lowerTitle.Contains([string]$keyword)) {
        $matchedByTitle = $true
        break
      }
    }
    foreach ($keyword in $stageClassKeywords) {
      if ($keyword -and $lowerClassName.Contains([string]$keyword)) {
        $matchedByClass = $true
        break
      }
    }
    foreach ($keyword in $stageProcessKeywords) {
      if ($keyword -and $lowerProcessName.Contains([string]$keyword)) {
        $matchedByProcess = $true
        break
      }
    }
    foreach ($keyword in $stagePathKeywords) {
      if ($keyword -and $lowerProcessPath.Contains([string]$keyword)) {
        $matchedByPath = $true
        break
      }
    }
    if ($matchedByPid -or $matchedByTitle -or $matchedByClass -or $matchedByProcess -or $matchedByPath) {
      $score = 1000 - ($index * 100)
      if ($matchedByPid) { $score += 40 }
      if ($matchedByTitle) { $score += 14 }
      if ($matchedByClass) { $score += 24 }
      if ($matchedByProcess) { $score += 18 }
      if ($matchedByPath) { $score += 18 }
      if ($visible) { $score += 120 } elseif ($iconic) { $score += 85 } else { $score -= 180 }
      if ($titleLength -gt 0) { $score += 42 } else { $score -= 24 }
      if ($width -ge 240 -and $height -ge 160) { $score += 36 } elseif ($width -ge 120 -and $height -ge 80) { $score += 12 } else { $score -= 55 }
      if ($owner -eq 0) { $score += 18 } else { $score -= 18 }
      if ($toolWindow) { $score -= 45 }
      $matchReason = @()
      if ($matchedByPid) { $matchReason += "pid" }
      if ($matchedByTitle) { $matchReason += "title" }
      if ($matchedByClass) { $matchReason += "class" }
      if ($matchedByProcess) { $matchReason += "process" }
      if ($matchedByPath) { $matchReason += "path" }
      $matchReasonText = $matchReason -join "+"
      $filterReason = ""
      $wechatTrayMessageWindow = 'WxTrayIconMessageWindow'
      $nonInteractiveClasses = @('IME', 'MSCTFIME UI', 'Base_PowerMessageWindow', 'OwlElectron_NotifyIconHostWindow', 'crashpad_SessionEndWatcher', 'Chrome_SystemMessageWindow', 'DisplayICC_SystemMessageWindow', 'libusb-1.0-windows-hotplug')
      if ($lowerTitle.Contains('wxtrayiconmessagewindow') -or $lowerClassName.Contains('wxtrayiconmessagewindow')) {
        $filterReason = "wechat-tray-message-window"
      } elseif ($nonInteractiveClasses -contains $className -or $title -ieq 'Default IME') {
        $filterReason = "non-interactive-window"
      } elseif (-not $visible -and -not $title -and $className -ieq 'Chrome_WidgetWin_0') {
        $filterReason = "non-interactive-window"
      } elseif (-not $visible -and $toolWindow) {
        $filterReason = "non-interactive-window"
      } elseif (-not $visible -and $width -eq 0 -and $height -eq 0) {
        $filterReason = "non-interactive-window"
      } elseif (-not $visible -and $owner -ne 0 -and ($lowerClassName.Contains('ime') -or $lowerTitle.Contains('ime'))) {
        $filterReason = "non-interactive-window"
      }
      $isWeChatShell = ($className -match '^(Qt.*QWindowIcon|AboutWindow|Static)$') -or ($title -match 'WECHAT_AUTH_MESSAGE_WINDOW_RECEIVER')
      $isWeChatTaskbarWindow = $iconic -and $visible -and $className -match '^Qt.*QWindowIcon$'
      $isWeChatRelated = ($matchReasonText -match 'title|class|process|path') -and (($lowerTitle.Contains('微信') -or $lowerTitle.Contains('wechat') -or $lowerTitle.Contains('weixin')) -or ($lowerClassName.Contains('wechat') -or $lowerClassName.Contains('weixin') -or $lowerClassName.Contains('qwindowicon')) -or ($lowerProcessName.Contains('wechat') -or $lowerProcessName.Contains('weixin')) -or ($lowerProcessPath.Contains('wechat') -or $lowerProcessPath.Contains('weixin') -or $lowerProcessPath.Contains('xwechat')))
      if (-not $filterReason -and $isWeChatRelated -and $isWeChatShell -and -not $isWeChatTaskbarWindow) {
        $score -= 420
        $filterReason = "suspected-wechat-shell"
      }
      $script:candidates.Add(("stage={0}; pid={1}; process={2}; class={3}; visible={4}; iconic={5}; tool={6}; owner={7}; rect={8}x{9}; score={10}; match={11}; filter={12}; title={13}" -f [string]$stage.label, [int]$pid, $processName, $className, $visible, $iconic, $toolWindow, $owner, $width, $height, $score, $matchReasonText, $filterReason, $title))
      if (-not $filterReason -and $score -gt $script:bestScore) {
        $script:bestScore = $score
        $script:bestStage = [string]$stage.label
        $script:found = $hWnd
        $script:foundPid = [int]$pid
        $script:foundTitle = $title
        $script:foundVisible = $visible
        $script:foundIconic = $iconic
        $script:foundToolWindow = $toolWindow
        $script:foundOwner = $owner
        $script:foundWidth = $width
        $script:foundHeight = $height
        $script:foundClassName = $className
        $script:foundProcessName = $processName
        $script:foundExecutablePath = $processPath
        $script:foundProcessError = $processError
        $script:foundMatchReason = $matchReasonText
        $script:foundFilterReason = $filterReason
        $script:foundExStyle = $exStyle
      }
      break
    }
  }
  return $true
}, [IntPtr]::Zero) | Out-Null
foreach ($candidate in $script:candidates) { "candidate:$candidate" }
if ($script:found -eq [IntPtr]::Zero) {
  "not-found"
  exit 0
}
if ($script:foundFilterReason) {
  "not-found"
  exit 0
}
[PSCustomObject]@{ handle = $script:found.ToInt64(); pid = $script:foundPid; title = $script:foundTitle; score = $script:bestScore; stage = $script:bestStage; visible = [bool]$script:foundVisible; iconic = [bool]$script:foundIconic; toolWindow = [bool]$script:foundToolWindow; owner = [int64]$script:foundOwner; width = [int]$script:foundWidth; height = [int]$script:foundHeight; className = [string]$script:foundClassName; processName = [string]$script:foundProcessName; executablePath = [string]$script:foundExecutablePath; processError = [int]$script:foundProcessError; matchReason = [string]$script:foundMatchReason; filterReason = [string]$script:foundFilterReason; exStyle = [int]$script:foundExStyle } | ConvertTo-Json -Compress
`;
}

export function buildListFocusWindowsScript(stages: FocusWindowStage[]) {
  const normalizedStages = normalizeFocusStages(stages);
  const json = JSON.stringify(normalizedStages);
  return `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class WindowFocusList {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll", SetLastError=true)] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll", EntryPoint="GetWindowTextLengthW", CharSet=CharSet.Unicode)] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", EntryPoint="GetWindowTextW", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", EntryPoint="GetClassNameW", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("kernel32.dll", EntryPoint="OpenProcess")] public static extern IntPtr OpenProcess(uint access, bool inheritHandle, uint processId);
  [DllImport("kernel32.dll", EntryPoint="CloseHandle")] public static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", EntryPoint="QueryFullProcessImageNameW", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder exeName, ref int size);
}
'@
$stages = @(${psString(json)} | ConvertFrom-Json)
$script:processCache = @{}
function Get-ProcessInfoForWindow($pid) {
  if ($script:processCache.ContainsKey([int]$pid)) { return $script:processCache[[int]$pid] }
  $name = ""
  $path = ""
  $processError = 0
  try {
    try {
      $process = Get-Process -Id ([int]$pid) -ErrorAction Stop
      $name = [string]$process.ProcessName
    } catch {
      $process = $null
      $processError = 1
    }
    $handle = [WindowFocusList]::OpenProcess(0x1000, $false, [uint32]$pid)
    if ($handle -ne [IntPtr]::Zero) {
      try {
        $builder = New-Object System.Text.StringBuilder 1024
        $size = $builder.Capacity
        if ([WindowFocusList]::QueryFullProcessImageName($handle, 0, $builder, [ref]$size)) { $path = $builder.ToString() }
        else { $processError = [Runtime.InteropServices.Marshal]::GetLastWin32Error() }
      } finally {
        [void][WindowFocusList]::CloseHandle($handle)
      }
    } else {
      $processError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    }
    if (-not $path -and $process) { try { $path = [string]$process.MainModule.FileName } catch { if (-not $processError) { $processError = 2 }; $path = "" } }
  } catch {}
  if (-not $name -and $path) {
    $leaf = Split-Path $path -Leaf
    $name = [System.IO.Path]::GetFileNameWithoutExtension($leaf)
  }
  $info = [PSCustomObject]@{ name = $name; path = $path; processError = $processError }
  $script:processCache[[int]$pid] = $info
  return $info
}
$script:allWindowsScanned = 0
$script:windows = New-Object System.Collections.Generic.List[object]
$script:relatedWindows = New-Object System.Collections.Generic.List[object]
$script:filteredWindows = New-Object System.Collections.Generic.List[object]
[WindowFocusList]::EnumWindows({
  param($hWnd, $lParam)
  $script:allWindowsScanned += 1
  $pid = 0
  [void][WindowFocusList]::GetWindowThreadProcessId($hWnd, [ref]$pid)
  $titleLength = [WindowFocusList]::GetWindowTextLength($hWnd)
  $titleBuilder = New-Object System.Text.StringBuilder 512
  [void][WindowFocusList]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity)
  $title = $titleBuilder.ToString()
  $lowerTitle = $title.ToLowerInvariant()
  $classBuilder = New-Object System.Text.StringBuilder 256
  [void][WindowFocusList]::GetClassName($hWnd, $classBuilder, $classBuilder.Capacity)
  $className = $classBuilder.ToString()
  $lowerClassName = $className.ToLowerInvariant()
  $processInfo = Get-ProcessInfoForWindow $pid
  $processName = [string]$processInfo.name
  $lowerProcessName = $processName.ToLowerInvariant()
  $processPath = [string]$processInfo.path
  $processError = [int]$processInfo.processError
  $lowerProcessPath = $processPath.Replace('/', '\\').ToLowerInvariant()
  $visible = [WindowFocusList]::IsWindowVisible($hWnd)
  $iconic = [WindowFocusList]::IsIconic($hWnd)
  $exStyle = [WindowFocusList]::GetWindowLong($hWnd, -20)
  $toolWindow = (($exStyle -band 0x00000080) -ne 0)
  $owner = [WindowFocusList]::GetWindow($hWnd, 4).ToInt64()
  $rect = New-Object WindowFocusList+RECT
  [void][WindowFocusList]::GetWindowRect($hWnd, [ref]$rect)
  $width = [Math]::Max(0, $rect.Right - $rect.Left)
  $height = [Math]::Max(0, $rect.Bottom - $rect.Top)
  for ($index = 0; $index -lt $stages.Count; $index++) {
    $stage = $stages[$index]
    $stagePids = @($stage.pids)
    $stageKeywords = @($stage.titleKeywords)
    $stageClassKeywords = @($stage.classKeywords)
    $stageProcessKeywords = @($stage.processNameKeywords)
    $stagePathKeywords = @($stage.pathKeywords)
    $matchedByPid = $stagePids -contains [int]$pid
    $matchedByTitle = $false
    $matchedByClass = $false
    $matchedByProcess = $false
    $matchedByPath = $false
    foreach ($keyword in $stageKeywords) {
      if ($keyword -and $lowerTitle.Contains([string]$keyword)) {
        $matchedByTitle = $true
        break
      }
    }
    foreach ($keyword in $stageClassKeywords) {
      if ($keyword -and $lowerClassName.Contains([string]$keyword)) {
        $matchedByClass = $true
        break
      }
    }
    foreach ($keyword in $stageProcessKeywords) {
      if ($keyword -and $lowerProcessName.Contains([string]$keyword)) {
        $matchedByProcess = $true
        break
      }
    }
    foreach ($keyword in $stagePathKeywords) {
      if ($keyword -and $lowerProcessPath.Contains([string]$keyword)) {
        $matchedByPath = $true
        break
      }
    }
    if ($matchedByPid -or $matchedByTitle -or $matchedByClass -or $matchedByProcess -or $matchedByPath) {
      $score = 1000 - ($index * 100)
      if ($matchedByPid) { $score += 40 }
      if ($matchedByTitle) { $score += 14 }
      if ($matchedByClass) { $score += 24 }
      if ($matchedByProcess) { $score += 18 }
      if ($matchedByPath) { $score += 18 }
      if ($visible) { $score += 120 } elseif ($iconic) { $score += 85 } else { $score -= 180 }
      if ($titleLength -gt 0) { $score += 42 } else { $score -= 24 }
      if ($width -ge 240 -and $height -ge 160) { $score += 36 } elseif ($width -ge 120 -and $height -ge 80) { $score += 12 } else { $score -= 55 }
      if ($owner -eq 0) { $score += 18 } else { $score -= 18 }
      if ($toolWindow) { $score -= 45 }
      $matchReason = @()
      if ($matchedByPid) { $matchReason += "pid" }
      if ($matchedByTitle) { $matchReason += "title" }
      if ($matchedByClass) { $matchReason += "class" }
      if ($matchedByProcess) { $matchReason += "process" }
      if ($matchedByPath) { $matchReason += "path" }
      $matchReasonText = $matchReason -join "+"
      $filterReason = ""
      $wechatTrayMessageWindow = 'WxTrayIconMessageWindow'
      $nonInteractiveClasses = @('IME', 'MSCTFIME UI', 'Base_PowerMessageWindow', 'OwlElectron_NotifyIconHostWindow', 'crashpad_SessionEndWatcher', 'Chrome_SystemMessageWindow', 'DisplayICC_SystemMessageWindow', 'libusb-1.0-windows-hotplug')
      if ($lowerTitle.Contains('wxtrayiconmessagewindow') -or $lowerClassName.Contains('wxtrayiconmessagewindow')) {
        $filterReason = "wechat-tray-message-window"
      } elseif ($nonInteractiveClasses -contains $className -or $title -ieq 'Default IME') {
        $filterReason = "non-interactive-window"
      } elseif (-not $visible -and -not $title -and $className -ieq 'Chrome_WidgetWin_0') {
        $filterReason = "non-interactive-window"
      } elseif (-not $visible -and $toolWindow) {
        $filterReason = "non-interactive-window"
      } elseif (-not $visible -and $width -eq 0 -and $height -eq 0) {
        $filterReason = "non-interactive-window"
      } elseif (-not $visible -and $owner -ne 0 -and ($lowerClassName.Contains('ime') -or $lowerTitle.Contains('ime'))) {
        $filterReason = "non-interactive-window"
      }
      $isWeChatShell = ($className -match '^(Qt.*QWindowIcon|AboutWindow|Static)$') -or ($title -match 'WECHAT_AUTH_MESSAGE_WINDOW_RECEIVER')
      $isWeChatTaskbarWindow = $iconic -and $visible -and $className -match '^Qt.*QWindowIcon$'
      $isWeChatRelated = ($matchReasonText -match 'title|class|process|path') -and (($lowerTitle.Contains('微信') -or $lowerTitle.Contains('wechat') -or $lowerTitle.Contains('weixin')) -or ($lowerClassName.Contains('wechat') -or $lowerClassName.Contains('weixin') -or $lowerClassName.Contains('qwindowicon')) -or ($lowerProcessName.Contains('wechat') -or $lowerProcessName.Contains('weixin')) -or ($lowerProcessPath.Contains('wechat') -or $lowerProcessPath.Contains('weixin') -or $lowerProcessPath.Contains('xwechat')))
      if (-not $filterReason -and $isWeChatRelated -and $isWeChatShell -and -not $isWeChatTaskbarWindow) {
        $score -= 420
        $filterReason = "suspected-wechat-shell"
      } elseif (-not $filterReason -and $score -lt 920) {
        $filterReason = "low-score"
      }
      $window = [PSCustomObject]@{ handle = $hWnd.ToInt64(); pid = [int]$pid; title = $title; score = $score; stage = [string]$stage.label; visible = [bool]$visible; iconic = [bool]$iconic; toolWindow = [bool]$toolWindow; owner = [int64]$owner; width = [int]$width; height = [int]$height; className = $className; processName = $processName; executablePath = $processPath; processError = [int]$processError; matchReason = $matchReasonText; filterReason = $filterReason; exStyle = [int]$exStyle }
      $script:relatedWindows.Add($window)
      if ($filterReason) { $script:filteredWindows.Add($window) } else { $script:windows.Add($window) }
      break
    }
  }
  return $true
}, [IntPtr]::Zero) | Out-Null
[PSCustomObject]@{ allWindowsScanned = [int]$script:allWindowsScanned; relatedWindows = @($script:relatedWindows | Sort-Object -Property score -Descending); filteredWindows = @($script:filteredWindows | Sort-Object -Property score -Descending); finalCandidates = @($script:windows | Sort-Object -Property score -Descending) } | ConvertTo-Json -Compress -Depth 5
`;
}

export function buildFindFocusWindowScript(pids: number[], titleKeywords: string[] = []) {
  const targets = validPids(pids);
  const pidList = targets.length ? targets.join(",") : "";
  const keywords = uniqueStrings(titleKeywords).map((keyword) => keyword.toLowerCase());
  const keywordList = keywords.length ? keywords.map(psString).join(",") : "";
  return `
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class WindowFocus {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll", SetLastError=true)] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll", EntryPoint="GetWindowTextLengthW", CharSet=CharSet.Unicode)] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", EntryPoint="GetWindowTextW", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@
$targets = @(${pidList})
$keywords = @(${keywordList})
$script:found = [IntPtr]::Zero
$script:foundPid = 0
$script:foundTitle = ""
$script:bestScore = -1
$script:candidates = New-Object System.Collections.Generic.List[string]
[WindowFocus]::EnumWindows({
  param($hWnd, $lParam)
  $pid = 0
  [void][WindowFocus]::GetWindowThreadProcessId($hWnd, [ref]$pid)
  $titleLength = [WindowFocus]::GetWindowTextLength($hWnd)
  $titleBuilder = New-Object System.Text.StringBuilder 512
  [void][WindowFocus]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity)
  $title = $titleBuilder.ToString()
  $lowerTitle = $title.ToLowerInvariant()
  $visible = [WindowFocus]::IsWindowVisible($hWnd)
  $iconic = [WindowFocus]::IsIconic($hWnd)
  $exStyle = [WindowFocus]::GetWindowLong($hWnd, -20)
  $toolWindow = (($exStyle -band 0x00000080) -ne 0)
  $owner = [WindowFocus]::GetWindow($hWnd, 4).ToInt64()
  $rect = New-Object WindowFocus+RECT
  [void][WindowFocus]::GetWindowRect($hWnd, [ref]$rect)
  $width = [Math]::Max(0, $rect.Right - $rect.Left)
  $height = [Math]::Max(0, $rect.Bottom - $rect.Top)
  $matchedByPid = $targets -contains [int]$pid
  $matchedByTitle = $false
  foreach ($keyword in $keywords) {
    if ($keyword -and $lowerTitle.Contains([string]$keyword)) {
      $matchedByTitle = $true
      break
    }
  }
  if ($matchedByPid -or $matchedByTitle) {
    $score = 1
    if ($matchedByPid) { $score += 8 }
    if ($matchedByTitle) { $score += 3 }
    if ($visible) { $score += 12 } elseif ($iconic) { $score += 8 } else { $score -= 18 }
    if ($titleLength -gt 0) { $score += 4 } else { $score -= 3 }
    if ($width -ge 240 -and $height -ge 160) { $score += 4 } elseif ($width -ge 120 -and $height -ge 80) { $score += 2 } else { $score -= 6 }
    if ($owner -eq 0) { $score += 2 } else { $score -= 2 }
    if ($toolWindow) { $score -= 5 }
    $script:candidates.Add(("pid={0}; visible={1}; iconic={2}; tool={3}; owner={4}; rect={5}x{6}; score={7}; title={8}" -f [int]$pid, $visible, $iconic, $toolWindow, $owner, $width, $height, $score, $title))
    if ($score -gt $script:bestScore) {
      $script:bestScore = $score
      $script:found = $hWnd
      $script:foundPid = [int]$pid
      $script:foundTitle = $title
      $script:foundVisible = $visible
      $script:foundIconic = $iconic
      $script:foundToolWindow = $toolWindow
      $script:foundOwner = $owner
      $script:foundWidth = $width
      $script:foundHeight = $height
    }
  }
  return $true
}, [IntPtr]::Zero) | Out-Null
foreach ($candidate in $script:candidates) { "candidate:$candidate" }
if ($script:found -eq [IntPtr]::Zero) {
  "not-found"
  exit 0
}
[PSCustomObject]@{ handle = $script:found.ToInt64(); pid = $script:foundPid; title = $script:foundTitle; score = $script:bestScore; visible = [bool]$script:foundVisible; iconic = [bool]$script:foundIconic; toolWindow = [bool]$script:foundToolWindow; owner = [int64]$script:foundOwner; width = [int]$script:foundWidth; height = [int]$script:foundHeight } | ConvertTo-Json -Compress
`;
}

export function buildFocusWindowHandleScript(handle: number, expectedPids: number[] = []) {
  const safeHandle = Number.isSafeInteger(handle) && handle > 0 ? handle : 0;
  const expectedPidList = psNumberArray(expectedPids);
  return `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WindowFocusHandle {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
}
'@
$handle = [IntPtr]${safeHandle}
$expectedPids = @(${expectedPidList})
if (-not [WindowFocusHandle]::IsWindow($handle)) {
  "not-found"
  exit 0
}
$targetPid = 0
[void][WindowFocusHandle]::GetWindowThreadProcessId($handle, [ref]$targetPid)
if ($expectedPids.Count -gt 0 -and -not ($expectedPids -contains [int]$targetPid)) {
  "not-found"
  exit 0
}
$visibleBefore = [WindowFocusHandle]::IsWindowVisible($handle)
$iconicBefore = [WindowFocusHandle]::IsIconic($handle)
if ($iconicBefore) {
  [void][WindowFocusHandle]::ShowWindowAsync($handle, 9)
  Start-Sleep -Milliseconds 25
} elseif (-not $visibleBefore) {
  [void][WindowFocusHandle]::ShowWindowAsync($handle, 5)
  Start-Sleep -Milliseconds 25
}
[void][WindowFocusHandle]::BringWindowToTop($handle)
$foreground = [WindowFocusHandle]::SetForegroundWindow($handle)
Start-Sleep -Milliseconds 35
$visible = [WindowFocusHandle]::IsWindowVisible($handle)
$iconic = [WindowFocusHandle]::IsIconic($handle)
$foregroundHandle = [WindowFocusHandle]::GetForegroundWindow()
$foregroundPid = 0
if ($foregroundHandle -ne [IntPtr]::Zero) {
  [void][WindowFocusHandle]::GetWindowThreadProcessId($foregroundHandle, [ref]$foregroundPid)
}
if (-not ($foregroundHandle -eq $handle -or ([int]$foregroundPid -eq [int]$targetPid -and $visible))) {
  $targetThread = [WindowFocusHandle]::GetWindowThreadProcessId($handle, [ref]$targetPid)
  $foregroundThread = 0
  if ($foregroundHandle -ne [IntPtr]::Zero) {
    $foregroundThread = [WindowFocusHandle]::GetWindowThreadProcessId($foregroundHandle, [ref]$foregroundPid)
  }
  $currentThread = [WindowFocusHandle]::GetCurrentThreadId()
  try {
    if ($foregroundThread -ne 0) { [void][WindowFocusHandle]::AttachThreadInput($currentThread, $foregroundThread, $true) }
    if ($targetThread -ne 0) { [void][WindowFocusHandle]::AttachThreadInput($currentThread, $targetThread, $true) }
    [void][WindowFocusHandle]::BringWindowToTop($handle)
    [void][WindowFocusHandle]::SetForegroundWindow($handle)
    Start-Sleep -Milliseconds 35
  } finally {
    if ($targetThread -ne 0) { [void][WindowFocusHandle]::AttachThreadInput($currentThread, $targetThread, $false) }
    if ($foregroundThread -ne 0) { [void][WindowFocusHandle]::AttachThreadInput($currentThread, $foregroundThread, $false) }
  }
  $visible = [WindowFocusHandle]::IsWindowVisible($handle)
  $iconic = [WindowFocusHandle]::IsIconic($handle)
  $foregroundHandle = [WindowFocusHandle]::GetForegroundWindow()
  $foregroundPid = 0
  if ($foregroundHandle -ne [IntPtr]::Zero) {
    [void][WindowFocusHandle]::GetWindowThreadProcessId($foregroundHandle, [ref]$foregroundPid)
  }
}
("foreground:handle={0}; pid={1}; targetPid={2}; visible={3}; iconic={4}; setForeground={5}" -f $foregroundHandle.ToInt64(), [int]$foregroundPid, [int]$targetPid, $visible, $iconic, $foreground)
if (-not $iconic -and ($foregroundHandle -eq $handle -or ([int]$foregroundPid -eq [int]$targetPid -and $visible))) { "focused" }
elseif ($visible -and -not $iconic) { "foreground-blocked" }
else { "tray-hidden" }
`;
}

export function buildRestoreWeChatFromTrayScript() {
  return `
Add-Type -AssemblyName UIAutomationClient
$keywords = @('微信', 'WeChat', 'Weixin')
$roots = New-Object System.Collections.Generic.List[System.Windows.Automation.AutomationElement]
$desktop = [System.Windows.Automation.AutomationElement]::RootElement
$roots.Add($desktop)
$taskbars = $desktop.FindAll([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, 'Shell_TrayWnd')))
foreach ($item in $taskbars) { $roots.Add($item) }
$overflow = $desktop.FindAll([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, 'NotifyIconOverflowWindow')))
foreach ($item in $overflow) { $roots.Add($item) }
foreach ($root in $roots) {
  $items = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($item in $items) {
    $name = [string]$item.Current.Name
    $className = [string]$item.Current.ClassName
    $controlType = [string]$item.Current.ControlType.ProgrammaticName
    $haystack = "$name $className $controlType"
    $matched = $false
    foreach ($keyword in $keywords) {
      if ($haystack -like "*$keyword*") { $matched = $true; break }
    }
    if (-not $matched) { continue }
    [PSCustomObject]@{ success = $false; reason = 'trayRestoreUnsupported'; matchedName = $name; className = $className } | ConvertTo-Json -Compress
    exit 0
  }
}
[PSCustomObject]@{ success = $false; reason = 'trayRestoreUnsupported' } | ConvertTo-Json -Compress
`;
}

export function buildFocusWindowScript(pids: number[], titleKeywords: string[] = []) {
  return buildFindFocusWindowScript(pids, titleKeywords) + "\n# focus is performed by buildFocusWindowHandleScript after request freshness is confirmed\n";
}

function parseFocusWindowCandidate(output: string): FocusWindowCandidate | null {
  const jsonLine = output.split(/\r?\n/).reverse().find((line) => line.trim().startsWith("{"));
  if (!jsonLine) return null;
  try {
    const parsed = JSON.parse(jsonLine) as Partial<FocusWindowCandidate>;
    if (!Number.isSafeInteger(parsed.handle) || !parsed.handle || parsed.handle <= 0) return null;
    return {
      handle: parsed.handle,
      pid: typeof parsed.pid === "number" && Number.isSafeInteger(parsed.pid) ? parsed.pid : 0,
      title: typeof parsed.title === "string" ? parsed.title : "",
      score: typeof parsed.score === "number" ? parsed.score : 0,
      visible: typeof parsed.visible === "boolean" ? parsed.visible : undefined,
      iconic: typeof parsed.iconic === "boolean" ? parsed.iconic : undefined,
      toolWindow: typeof parsed.toolWindow === "boolean" ? parsed.toolWindow : undefined,
      owner: typeof parsed.owner === "number" && Number.isSafeInteger(parsed.owner) ? parsed.owner : undefined,
      width: typeof parsed.width === "number" && Number.isSafeInteger(parsed.width) ? parsed.width : undefined,
      height: typeof parsed.height === "number" && Number.isSafeInteger(parsed.height) ? parsed.height : undefined,
      className: typeof parsed.className === "string" ? parsed.className : undefined,
      processName: typeof parsed.processName === "string" ? parsed.processName : undefined,
      executablePath: typeof parsed.executablePath === "string" ? parsed.executablePath : undefined,
      processError: typeof parsed.processError === "number" && Number.isSafeInteger(parsed.processError) ? parsed.processError : undefined,
      matchReason: typeof parsed.matchReason === "string" ? parsed.matchReason : undefined,
      filterReason: typeof parsed.filterReason === "string" ? parsed.filterReason : undefined,
      exStyle: typeof parsed.exStyle === "number" && Number.isSafeInteger(parsed.exStyle) ? parsed.exStyle : undefined,
      stage: typeof parsed.stage === "string" ? parsed.stage : undefined
    };
  } catch {
    return null;
  }
}

function normalizeParsedCandidate(parsed: Partial<FocusWindowCandidate>): FocusWindowCandidate | null {
  if (!Number.isSafeInteger(parsed.handle) || !parsed.handle || parsed.handle <= 0) return null;
  return {
    handle: parsed.handle,
    pid: typeof parsed.pid === "number" && Number.isSafeInteger(parsed.pid) ? parsed.pid : 0,
    title: typeof parsed.title === "string" ? parsed.title : "",
    score: typeof parsed.score === "number" ? parsed.score : 0,
    visible: typeof parsed.visible === "boolean" ? parsed.visible : undefined,
    iconic: typeof parsed.iconic === "boolean" ? parsed.iconic : undefined,
    toolWindow: typeof parsed.toolWindow === "boolean" ? parsed.toolWindow : undefined,
    owner: typeof parsed.owner === "number" && Number.isSafeInteger(parsed.owner) ? parsed.owner : undefined,
    width: typeof parsed.width === "number" && Number.isSafeInteger(parsed.width) ? parsed.width : undefined,
    height: typeof parsed.height === "number" && Number.isSafeInteger(parsed.height) ? parsed.height : undefined,
    className: typeof parsed.className === "string" ? parsed.className : undefined,
    processName: typeof parsed.processName === "string" ? parsed.processName : undefined,
    executablePath: typeof parsed.executablePath === "string" ? parsed.executablePath : undefined,
    processError: typeof parsed.processError === "number" && Number.isSafeInteger(parsed.processError) ? parsed.processError : undefined,
    matchReason: typeof parsed.matchReason === "string" ? parsed.matchReason : undefined,
    filterReason: typeof parsed.filterReason === "string" ? parsed.filterReason : undefined,
    exStyle: typeof parsed.exStyle === "number" && Number.isSafeInteger(parsed.exStyle) ? parsed.exStyle : undefined,
    stage: typeof parsed.stage === "string" ? parsed.stage : undefined
  };
}

function parseFocusWindowCandidates(output: string): FocusWindowCandidate[] {
  return parseFocusWindowScanResult(output).finalCandidates;
}

function parseCandidateList(value: unknown): FocusWindowCandidate[] {
  const items = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  return items.map((item) => normalizeParsedCandidate(item as Partial<FocusWindowCandidate>)).filter((item): item is FocusWindowCandidate => Boolean(item));
}

function parseFocusWindowScanResult(output: string): FocusWindowScanResult {
  const jsonLine = output.split(/\r?\n/).reverse().find((line) => {
    const trimmed = line.trim();
    return trimmed.startsWith("[") || trimmed.startsWith("{");
  });
  if (!jsonLine) return { allWindowsScanned: 0, relatedWindows: [], filteredWindows: [], finalCandidates: [] };
  try {
    const parsed = JSON.parse(jsonLine) as unknown;
    if (Array.isArray(parsed)) {
      const finalCandidates = parseCandidateList(parsed);
      return { allWindowsScanned: 0, relatedWindows: finalCandidates, filteredWindows: [], finalCandidates };
    }
    if (parsed && typeof parsed === "object" && ("finalCandidates" in parsed || "relatedWindows" in parsed)) {
      const report = parsed as { allWindowsScanned?: unknown; relatedWindows?: unknown; filteredWindows?: unknown; finalCandidates?: unknown };
      return {
        allWindowsScanned: typeof report.allWindowsScanned === "number" && Number.isFinite(report.allWindowsScanned) ? report.allWindowsScanned : 0,
        relatedWindows: parseCandidateList(report.relatedWindows),
        filteredWindows: parseCandidateList(report.filteredWindows),
        finalCandidates: parseCandidateList(report.finalCandidates)
      };
    }
    const finalCandidates = parseCandidateList(parsed);
    return { allWindowsScanned: 0, relatedWindows: finalCandidates, filteredWindows: [], finalCandidates };
  } catch {
    return { allWindowsScanned: 0, relatedWindows: [], filteredWindows: [], finalCandidates: [] };
  }
}

function parseFocusWindowHelperFocusResult(output: string): FocusWindowHandleResult | null {
  const jsonLine = output.split(/\r?\n/).reverse().find((line) => line.trim().startsWith("{"));
  if (!jsonLine) return null;
  try {
    const parsed = JSON.parse(jsonLine) as { focused?: unknown; reason?: unknown };
    if (parsed.focused === true) return { focused: true };
    if (parsed.focused === false) {
      if (parsed.reason === "no-window" || parsed.reason === "tray-hidden" || parsed.reason === "foreground-blocked") {
        return { focused: false, reason: parsed.reason };
      }
      return { focused: false, reason: "unknown" };
    }
    return null;
  } catch {
    return null;
  }
}

export async function findFocusWindowCandidate(label: string, pids: number[], runPowerShell: PowerShellRunner, titleKeywords: string[] = []) {
  const uniquePids = validPids(pids);
  if (!uniquePids.length && !uniqueStrings(titleKeywords).length) {
    console.info(`[focus-window] ${label}: skipped empty candidates`);
    return null;
  }
  const output = (await runPowerShell(buildFindFocusWindowScript(uniquePids, titleKeywords))).trim();
  for (const line of output.split(/\r?\n/).filter((item) => item.startsWith("candidate:"))) {
    console.info(`[focus-window] ${label}: ${line.slice("candidate:".length)}`);
  }
  const candidate = parseFocusWindowCandidate(output);
  console.info(`[focus-window] ${label}: ${candidate ? `candidate handle=${candidate.handle}; pid=${candidate.pid}; score=${candidate.score}; title=${candidate.title}` : "not-found"}; pids=${uniquePids.join(",")}; titleKeywords=${uniqueStrings(titleKeywords).join(",")}`);
  return candidate;
}

export async function findFocusWindowCandidateForStages(label: string, stages: FocusWindowStage[], runPowerShell: PowerShellRunner, runHelper: WindowFocusHelperRunner = runWindowFocusHelper) {
  const normalizedStages = normalizeFocusStages(stages);
  if (!normalizedStages.length) {
    console.info(`[focus-window] ${label}: skipped empty stages`);
    return null;
  }
  try {
    const scan = parseFocusWindowScanResult((await runHelper("scan", normalizedStages)).trim());
    for (const candidate of scan.relatedWindows) {
      console.info(`[focus-window] ${label}: helper window handle=${candidate.handle}; pid=${candidate.pid}; process=${candidate.processName ?? ""}; class=${candidate.className ?? ""}; stage=${candidate.stage ?? ""}; score=${candidate.score}; match=${candidate.matchReason ?? ""}; filter=${candidate.filterReason ?? ""}; visible=${candidate.visible}; iconic=${candidate.iconic}; tool=${candidate.toolWindow}; owner=${candidate.owner}; rect=${candidate.width}x${candidate.height}; title=${candidate.title}`);
    }
    const candidate = scan.finalCandidates[0] ?? null;
    console.info(`[focus-window] ${label}: ${candidate ? `helper candidate handle=${candidate.handle}; pid=${candidate.pid}; score=${candidate.score}; title=${candidate.title}` : "helper not-found"}; stages=${normalizedStages.map((stage) => `${stage.label}:${stage.pids.join(",") || stage.titleKeywords.join("|")}`).join(";")}`);
    return candidate;
  } catch (reason) {
    console.info(`[focus-window] ${label}: helper unavailable; falling back to PowerShell; reason=${reason instanceof Error ? reason.message : String(reason)}`);
  }
  const output = (await runPowerShell(buildFindFocusWindowCandidateScript(normalizedStages))).trim();
  for (const line of output.split(/\r?\n/).filter((item) => item.startsWith("candidate:"))) {
    console.info(`[focus-window] ${label}: ${line.slice("candidate:".length)}`);
  }
  const candidate = parseFocusWindowCandidate(output);
  console.info(`[focus-window] ${label}: ${candidate ? `candidate handle=${candidate.handle}; pid=${candidate.pid}; score=${candidate.score}; title=${candidate.title}` : "not-found"}; stages=${normalizedStages.map((stage) => `${stage.label}:${stage.pids.join(",") || stage.titleKeywords.join("|")}`).join(";")}`);
  return candidate;
}

export async function listFocusWindowCandidatesForStages(label: string, stages: FocusWindowStage[], runPowerShell: PowerShellRunner, runHelper?: WindowFocusHelperRunner) {
  return (await scanFocusWindowsForStages(label, stages, runPowerShell, runHelper)).finalCandidates;
}

export async function scanFocusWindowsForStages(label: string, stages: FocusWindowStage[], runPowerShell: PowerShellRunner, runHelper: WindowFocusHelperRunner = runWindowFocusHelper): Promise<FocusWindowScanResult> {
  const normalizedStages = normalizeFocusStages(stages);
  if (!normalizedStages.length) {
    console.info(`[focus-window] ${label}: skipped empty window list stages`);
    return { allWindowsScanned: 0, relatedWindows: [], filteredWindows: [], finalCandidates: [] };
  }
  let scan: FocusWindowScanResult | null = null;
  try {
    scan = parseFocusWindowScanResult((await runHelper("scan", normalizedStages)).trim());
  } catch (reason) {
    console.info(`[focus-window] ${label}: helper unavailable; falling back to PowerShell; reason=${reason instanceof Error ? reason.message : String(reason)}`);
  }
  const output = scan ? "" : (await runPowerShell(buildListFocusWindowsScript(normalizedStages))).trim();
  scan ??= parseFocusWindowScanResult(output);
  for (const candidate of scan.relatedWindows) {
    console.info(`[focus-window] ${label}: window handle=${candidate.handle}; pid=${candidate.pid}; process=${candidate.processName ?? ""}; class=${candidate.className ?? ""}; stage=${candidate.stage ?? ""}; score=${candidate.score}; match=${candidate.matchReason ?? ""}; filter=${candidate.filterReason ?? ""}; visible=${candidate.visible}; iconic=${candidate.iconic}; tool=${candidate.toolWindow}; owner=${candidate.owner}; rect=${candidate.width}x${candidate.height}; title=${candidate.title}`);
  }
  return scan;
}

export async function focusWindowHandle(candidate: FocusWindowCandidate, runPowerShell: PowerShellRunner) {
  const output = (await runPowerShell(buildFocusWindowHandleScript(candidate.handle, candidate.pid ? [candidate.pid] : []))).trim();
  return /^focused$/im.test(output);
}

export async function focusWindowHandleDetailed(candidate: FocusWindowCandidate, runPowerShell: PowerShellRunner, expectedPids: number[] = [], runHelper: WindowFocusHelperRunner = runWindowFocusHelper): Promise<FocusWindowHandleResult> {
  const helperExpectedPids = expectedPids.length ? expectedPids : candidate.pid ? [candidate.pid] : [];
  try {
    const helper = parseFocusWindowHelperFocusResult((await runHelper("focus", { handle: candidate.handle, expectedPids: helperExpectedPids })).trim());
    if (helper) return helper;
  } catch (reason) {
    console.info(`[focus-window] handle=${candidate.handle}: helper focus unavailable; falling back to PowerShell; reason=${reason instanceof Error ? reason.message : String(reason)}`);
  }
  const output = (await runPowerShell(buildFocusWindowHandleScript(candidate.handle, expectedPids.length ? expectedPids : candidate.pid ? [candidate.pid] : []))).trim();
  if (/^focused$/im.test(output)) return { focused: true as const };
  if (/^tray-hidden$/im.test(output)) return { focused: false as const, reason: "tray-hidden" as const };
  if (/^foreground-blocked$/im.test(output)) return { focused: false as const, reason: "foreground-blocked" as const };
  if (/^not-found$/im.test(output)) return { focused: false as const, reason: "no-window" as const };
  return { focused: false as const, reason: "unknown" as const };
}

export async function restoreWeChatFromTray(runPowerShell: PowerShellRunner): Promise<TrayRestoreResult> {
  void runPowerShell;
  return { attempted: false, success: false, reason: "trayRestoreUnsupported" };
}

export async function focusWindowForPids(pids: number[], runPowerShell: PowerShellRunner) {
  if (!validPids(pids).length) return false;
  const candidate = await findFocusWindowCandidate("legacy", pids, runPowerShell);
  return candidate ? focusWindowHandle(candidate, runPowerShell) : false;
}

export async function focusWindowWithDebug(label: string, pids: number[], runPowerShell: PowerShellRunner, titleKeywords: string[] = []) {
  const candidate = await findFocusWindowCandidate(label, pids, runPowerShell, titleKeywords);
  if (!candidate) return false;
  const focused = await focusWindowHandle(candidate, runPowerShell);
  console.info(`[focus-window] ${label}: ${focused ? "focused" : "not-focused"}; handle=${candidate.handle}; pid=${candidate.pid}`);
  return focused;
}
