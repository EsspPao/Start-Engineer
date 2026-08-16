import { describe, expect, it, vi } from "vitest";
import type { AppEntry } from "../shared/types.js";
import { buildFindFocusWindowCandidateScript, buildFindFocusWindowScript, buildFocusWindowHandleScript, buildFocusWindowScript, buildListFocusWindowsScript, buildRestoreWeChatFromTrayScript, collectFocusCandidatePids, collectFocusCandidateStages, findFocusWindowCandidate, findFocusWindowCandidateForStages, focusWindowForPids, focusWindowHandle, focusWindowHandleDetailed, listFocusWindowCandidatesForStages, scanFocusWindowsForStages } from "./focus-window.js";

const app = (overrides: Partial<AppEntry> = {}): AppEntry => ({
  id: "app-1",
  name: "WeGame",
  category: "游戏",
  groupId: "games",
  executablePath: "E:\\WeGame\\wegame.exe",
  processName: "wegame",
  accent: "#2f66e8",
  ...overrides
});

describe("focus-window", () => {
  const unavailableHelper = () => vi.fn(async () => { throw new Error("helper unavailable"); });

  it("builds a User32 script that targets only valid pids", () => {
    const script = buildFindFocusWindowScript([0, 42, Number.NaN, 42, 84]);

    expect(script).toContain("@(42,84)");
    expect(script).toContain("EnumWindows");
    expect(script).toContain("GetWindowThreadProcessId");
    expect(script).toContain("GetWindowTextLength");
    expect(script).toContain("GetWindowText");
    expect(script).not.toContain("SetForegroundWindow");
  });

  it("can include title keywords for the last fuzzy fallback", () => {
    const script = buildFindFocusWindowScript([], ["WeGame"]);

    expect(script).toContain("$keywords = @('wegame')");
    expect(script).toContain("$matchedByTitle");
    expect(script).toContain("$lowerTitle.Contains");
  });

  it("does not report a still-minimized target as focused", () => {
    const script = buildFocusWindowHandleScript(42, [84]);

    expect(script).toContain("$iconic = [WindowFocusHandle]::IsIconic($handle)");
    expect(script).toContain("if (-not $iconic -and ($foregroundHandle -eq $handle");
    expect(script).toContain("elseif ($visible -and -not $iconic) { \"foreground-blocked\" }");
  });

  it("builds a single staged candidate script ordered by match priority", () => {
    const script = buildFindFocusWindowCandidateScript([
      { label: "matched", pids: [42], classKeywords: ["WeChat"], processNameKeywords: ["WeChatAppEx"] },
      { label: "children", pids: [43] },
      { label: "title", pids: [], titleKeywords: ["WeGame"] }
    ]);

    expect(script).toContain('"label":"matched"');
    expect(script).toContain('"label":"children"');
    expect(script).toContain('"label":"title"');
    expect(script).toContain('"classKeywords":["wechat"]');
    expect(script).toContain('"processNameKeywords":["wechatappex"]');
    expect(script).toContain("1000 - ($index * 100)");
    expect(script).toContain("stage={0}; pid={1}");
    expect(script).toContain("GetClassName");
    expect(script).toContain("GetWindowTextW");
    expect(script).toContain("GetClassNameW");
    expect(script).toContain("QueryFullProcessImageNameW");
    expect(script).toContain("$matchedByClass");
    expect(script).toContain("$matchedByProcess");
    expect(script).toContain("GetWindowLong");
    expect(script).toContain("GetWindowRect");
    expect(script).toContain("GetWindow($hWnd, 4)");
    expect(script).toContain("tool={6}");
    expect(script).toContain("owner={7}; rect={8}x{9}");
    expect(script).not.toContain("SetForegroundWindow");
  });

  it("builds a staged window listing script for context menus and diagnostics", () => {
    const script = buildListFocusWindowsScript([
      { label: "matched", pids: [42], pathKeywords: ["Tencent\\xwechat"] },
      { label: "children", pids: [43] },
      { label: "title", pids: [], titleKeywords: ["WeGame"] }
    ]);

    expect(script).toContain('"label":"matched"');
    expect(script).toContain('"label":"children"');
    expect(script).toContain("EnumWindows");
    expect(script).toContain("GetWindowTextW");
    expect(script).toContain("GetClassNameW");
    expect(script).toContain("QueryFullProcessImageNameW");
    expect(script).toContain("$script:windows.Add");
    expect(script).toContain("allWindowsScanned");
    expect(script).toContain("relatedWindows");
    expect(script).toContain("filteredWindows");
    expect(script).toContain("finalCandidates");
    expect(script).toContain("ConvertTo-Json -Compress");
    expect(script).not.toContain("SetForegroundWindow");
  });

  it("filters known tray, message, IME, and hidden Chromium background windows in PowerShell fallback", () => {
    const script = buildListFocusWindowsScript([{ label: "matched", pids: [42] }]);

    expect(script).toContain("WxTrayIconMessageWindow");
    expect(script).toContain("OwlElectron_NotifyIconHostWindow");
    expect(script).toContain("Base_PowerMessageWindow");
    expect(script).toContain("crashpad_SessionEndWatcher");
    expect(script).toContain("Chrome_SystemMessageWindow");
    expect(script).toContain("DisplayICC_SystemMessageWindow");
    expect(script).toContain("libusb-1.0-windows-hotplug");
    expect(script).toContain("Chrome_WidgetWin_0");
    expect(script).toContain("non-interactive-window");
    expect(script).toContain("wechat-tray-message-window");
  });

  it("builds a WeChat tray restore script without moving the real mouse", () => {
    const script = buildRestoreWeChatFromTrayScript();

    expect(script).toContain("UIAutomationClient");
    expect(script).toContain("Shell_TrayWnd");
    expect(script).toContain("NotifyIconOverflowWindow");
    expect(script).toContain("微信");
    expect(script).toContain("WeChat");
    expect(script).toContain("Weixin");
    expect(script).not.toContain("SetCursorPos");
    expect(script).not.toContain("mouse_event");
    expect(script).not.toContain("SendInput");
    expect(script).toContain("trayRestoreUnsupported");
  });

  it("derives process names from Unicode process paths and records lookup errors", () => {
    const script = buildListFocusWindowsScript([{ label: "matched", pids: [42] }]);

    expect(script).toContain("QueryFullProcessImageNameW");
    expect(script).toContain("Split-Path $path -Leaf");
    expect(script).toContain("processError");
    expect(script).toContain("GetLastWin32Error");
  });

  it("uses the same script-scoped window handle when enum callback finds a match", () => {
    const script = buildFindFocusWindowScript([42]);

    expect(script).toContain("$script:found = [IntPtr]::Zero");
    expect(script).toContain("$script:found = $hWnd");
    expect(script).toContain("if ($script:found -eq [IntPtr]::Zero)");
    expect(script).not.toContain("$found = [IntPtr]::Zero");
  });

  it("scores matching windows instead of rejecting non-visible handles outright", () => {
    const script = buildFindFocusWindowScript([42]);

    expect(script).toContain("$script:bestScore = -1");
    expect(script).toContain("$visible = [WindowFocus]::IsWindowVisible($hWnd)");
    expect(script).toContain("if ($visible) { $score += 12 }");
    expect(script).toContain("elseif ($iconic) { $score += 8 }");
    expect(script).toContain("else { $score -= 18 }");
    expect(script).not.toContain("if (-not [WindowFocus]::IsWindowVisible($hWnd))");
  });

  it("focuses a selected window handle in a separate script", () => {
    const findScript = buildFocusWindowScript([42]);
    const focusScript = buildFocusWindowHandleScript(1234);

    expect(findScript).not.toContain("SetForegroundWindow($script:found)");
    expect(focusScript).toContain("IsWindow");
    expect(focusScript).toContain("ShowWindowAsync($handle, 9)");
    expect(focusScript).toContain("BringWindowToTop($handle)");
    expect(focusScript).toContain("GetForegroundWindow");
    expect(focusScript).toContain("SetForegroundWindow($handle)");
    expect(focusScript).toContain("AttachThreadInput");
  });

  it("validates a cached handle against expected candidate pids before focusing", () => {
    const focusScript = buildFocusWindowHandleScript(1234, [42, 84]);

    expect(focusScript).toContain("$expectedPids = @(42,84)");
    expect(focusScript).toContain("GetWindowThreadProcessId($handle");
    expect(focusScript).toContain("-not ($expectedPids -contains [int]$targetPid)");
  });

  it("collects focus candidates from metrics, matching process names, paths, aliases, and descendants", () => {
    const pids = collectFocusCandidatePids(app({ processAliases: ["wegame_client"], launchedPid: 10, associatedPids: [11] }), [12, 12], [
      { pid: 10, name: "launcher", path: "E:\\WeGame\\launcher.exe", parentPid: 0 },
      { pid: 11, name: "helper", path: "", parentPid: 0 },
      { pid: 12, name: "wegame", path: "", parentPid: 0 },
      { pid: 13, name: "wegame_client", path: "", parentPid: 12 },
      { pid: 14, name: "other", path: "E:/WeGame/wegame.exe", parentPid: 0 },
      { pid: 15, name: "child", path: "", parentPid: 14 }
    ]);

    expect(pids).toHaveLength(6);
    expect(new Set(pids)).toEqual(new Set([12, 10, 11, 13, 14, 15]));
  });

  it("separates runtime matched pids from child, directory, and name fallback candidates", () => {
    const stages = collectFocusCandidateStages(app(), {
      appId: "app-1",
      isRunning: true,
      cpuPercent: 0,
      memoryBytes: 0,
      diskBytesPerSecond: 0,
      pids: [20],
      matchedPids: [20],
      associatedPids: [21],
      matchedProcessNames: ["wegame_env"],
      matchedPaths: ["E:\\WeGame\\wegame_env.exe"]
    }, [
      { pid: 20, name: "wegame_env", path: "E:\\WeGame\\wegame_env.exe", parentPid: 0 },
      { pid: 22, name: "real-window", path: "E:\\WeGame\\client\\real-window.exe", parentPid: 20 },
      { pid: 23, name: "same-dir", path: "E:\\WeGame\\same-dir.exe", parentPid: 0 },
      { pid: 24, name: "wegame", path: "C:\\Other\\wegame.exe", parentPid: 0 }
    ]);

    expect(stages.matchedPids).toEqual([20, 21]);
    expect(stages.childPids).toEqual([22]);
    expect(stages.directoryPids).toEqual([20, 22, 23]);
    expect(stages.namePids).toEqual([20, 24]);
    expect(stages.titleKeywords).toEqual(expect.arrayContaining(["WeGame", "wegame", "wegame_env"]));
  });

  it("adds WeChat-specific process, title, and class matching rules", () => {
    const stages = collectFocusCandidateStages(app({
      name: "微信",
      executablePath: "E:\\Weixin\\Weixin.exe",
      processName: "Weixin"
    }), undefined, [
      { pid: 30, name: "WeChatAppEx", path: "C:\\Users\\ExampleUser\\AppData\\Roaming\\Tencent\\xwechat\\WeChatAppEx.exe", parentPid: 0 }
    ]);

    expect(stages.namePids).toEqual(expect.arrayContaining([30]));
    expect(stages.titleKeywords).toEqual(expect.arrayContaining(["微信", "WeChat", "Weixin"]));
    expect(stages.classKeywords).toEqual(expect.arrayContaining(["WeChat", "Weixin", "ChatWnd"]));
    expect(stages.processNameKeywords).toEqual(expect.arrayContaining(["Weixin", "WeChatAppEx", "WeChatBrowser", "WeChatUtility"]));
  });

  it("returns true only when a matching window was focused", async () => {
    await expect(focusWindowForPids([42], vi.fn()
      .mockResolvedValueOnce('candidate:pid=42; visible=True; iconic=False; score=15; title=Demo\n{"handle":1234,"pid":42,"title":"Demo","score":15}')
      .mockResolvedValueOnce("focused"))).resolves.toBe(true);
    await expect(focusWindowForPids([42], vi.fn(async () => "not-found"))).resolves.toBe(false);
    await expect(focusWindowForPids([], vi.fn(async () => "focused"))).resolves.toBe(false);
  });

  it("finds a candidate without focusing it, then focuses the handle separately", async () => {
    const runner = vi.fn(async () => 'candidate:pid=42; visible=True; iconic=False; score=15; title=Demo\n{"handle":1234,"pid":42,"title":"Demo","score":15,"visible":true,"iconic":false,"toolWindow":false,"owner":0,"width":800,"height":600}');

    await expect(findFocusWindowCandidate("test", [42], runner)).resolves.toEqual({ handle: 1234, pid: 42, title: "Demo", score: 15, visible: true, iconic: false, toolWindow: false, owner: 0, width: 800, height: 600 });
    expect(runner.mock.calls[0][0]).not.toContain("SetForegroundWindow");
    await expect(focusWindowHandle({ handle: 1234, pid: 42, title: "Demo", score: 15 }, vi.fn(async () => "focused"))).resolves.toBe(true);
  });

  it("finds a candidate across staged inputs with one PowerShell call", async () => {
    const runner = vi.fn(async () => 'candidate:stage=matched; pid=42; visible=True; iconic=False; score=1074; title=Demo\n{"handle":1234,"pid":42,"title":"Demo","score":1074,"stage":"matched","visible":true,"iconic":false,"toolWindow":false,"owner":0,"width":800,"height":600}');

    await expect(findFocusWindowCandidateForStages("test", [
      { label: "matched", pids: [42] },
      { label: "title", pids: [], titleKeywords: ["Demo"] }
    ], runner, unavailableHelper())).resolves.toEqual({ handle: 1234, pid: 42, title: "Demo", score: 1074, stage: "matched", visible: true, iconic: false, toolWindow: false, owner: 0, width: 800, height: 600 });
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0][0]).not.toContain("SetForegroundWindow");
  });

  it("prefers the native helper for staged candidate scanning", async () => {
    const runPowerShell = vi.fn(async () => "not-found");
    const runHelper = vi.fn(async () => JSON.stringify({
      allWindowsScanned: 12,
      relatedWindows: [
        { handle: 1234, pid: 42, title: "Main", score: 1074, stage: "matched", visible: true, iconic: false, toolWindow: false, owner: 0, width: 800, height: 600 }
      ],
      filteredWindows: [],
      finalCandidates: [
        { handle: 1234, pid: 42, title: "Main", score: 1074, stage: "matched", visible: true, iconic: false, toolWindow: false, owner: 0, width: 800, height: 600 }
      ]
    }));

    await expect(findFocusWindowCandidateForStages("test", [
      { label: "matched", pids: [42] }
    ], runPowerShell, runHelper)).resolves.toEqual({
      handle: 1234,
      pid: 42,
      title: "Main",
      score: 1074,
      stage: "matched",
      visible: true,
      iconic: false,
      toolWindow: false,
      owner: 0,
      width: 800,
      height: 600
    });
    expect(runHelper).toHaveBeenCalledWith("scan", [{ label: "matched", pids: [42], titleKeywords: [], classKeywords: [], processNameKeywords: [], pathKeywords: [] }]);
    expect(runPowerShell).not.toHaveBeenCalled();
  });

  it("falls back to PowerShell when native helper scanning fails", async () => {
    const runPowerShell = vi.fn(async () => JSON.stringify({
      allWindowsScanned: 2,
      relatedWindows: [{ handle: 4567, pid: 84, title: "Fallback", score: 900 }],
      filteredWindows: [],
      finalCandidates: [{ handle: 4567, pid: 84, title: "Fallback", score: 900 }]
    }));
    const runHelper = vi.fn(async () => { throw new Error("helper missing"); });

    await expect(scanFocusWindowsForStages("test", [
      { label: "matched", pids: [84] }
    ], runPowerShell, runHelper)).resolves.toEqual({
      allWindowsScanned: 2,
      relatedWindows: [{ handle: 4567, pid: 84, title: "Fallback", score: 900 }],
      filteredWindows: [],
      finalCandidates: [{ handle: 4567, pid: 84, title: "Fallback", score: 900 }]
    });
    expect(runHelper).toHaveBeenCalledTimes(1);
    expect(runPowerShell).toHaveBeenCalledTimes(1);
  });

  it("does not select native helper filtered windows as focus candidates", async () => {
    const runPowerShell = vi.fn(async () => "not-found");
    const runHelper = vi.fn(async () => JSON.stringify({
      allWindowsScanned: 3,
      relatedWindows: [
        { handle: 460552, pid: 63608, title: "WxTrayIconMessageWindow", className: "Qt51514WxTrayIconMessageWindowClass", score: 990, filterReason: "wechat-tray-message-window" }
      ],
      filteredWindows: [
        { handle: 460552, pid: 63608, title: "WxTrayIconMessageWindow", className: "Qt51514WxTrayIconMessageWindowClass", score: 990, filterReason: "wechat-tray-message-window" }
      ],
      finalCandidates: []
    }));

    await expect(findFocusWindowCandidateForStages("wechat", [
      { label: "matched", pids: [63608], titleKeywords: ["微信"], classKeywords: ["WeChat", "Weixin", "WxTrayIconMessageWindow"] }
    ], runPowerShell, runHelper)).resolves.toBeNull();
    const scan = await scanFocusWindowsForStages("wechat", [
      { label: "matched", pids: [63608], titleKeywords: ["微信"], classKeywords: ["WeChat", "Weixin", "WxTrayIconMessageWindow"] }
    ], runPowerShell, runHelper);
    expect(scan.filteredWindows).toEqual([
      expect.objectContaining({ handle: 460552, filterReason: "wechat-tray-message-window" })
    ]);
    expect(scan.finalCandidates).toEqual([]);
    expect(runPowerShell).not.toHaveBeenCalled();
  });

  it("lists all matching windows with stage diagnostics", async () => {
    const runner = vi.fn(async () => '[{"handle":1234,"pid":42,"title":"Main","score":1074,"stage":"matched","visible":true,"iconic":false,"toolWindow":false,"owner":0,"width":800,"height":600},{"handle":4567,"pid":43,"title":"Child","score":974,"stage":"children","visible":true,"iconic":false,"toolWindow":false,"owner":0,"width":600,"height":400}]');

    await expect(listFocusWindowCandidatesForStages("test", [
      { label: "matched", pids: [42] },
      { label: "children", pids: [43] }
    ], runner, unavailableHelper())).resolves.toEqual([
      { handle: 1234, pid: 42, title: "Main", score: 1074, stage: "matched", visible: true, iconic: false, toolWindow: false, owner: 0, width: 800, height: 600 },
      { handle: 4567, pid: 43, title: "Child", score: 974, stage: "children", visible: true, iconic: false, toolWindow: false, owner: 0, width: 600, height: 400 }
    ]);
  });

  it("keeps suspected WeChat shell windows out of final candidates while preserving diagnostics", async () => {
    const runner = vi.fn(async () => JSON.stringify({
      allWindowsScanned: 559,
      relatedWindows: [
        { handle: 132826, pid: 51960, title: "微信", className: "Qt51514QWindowIcon", visible: true, iconic: false, score: 890, matchReason: "title", filterReason: "suspected-wechat-shell" },
        { handle: 197780, pid: 51960, title: "微信输入法-设置", className: "AboutWindow", visible: false, iconic: false, score: 780, matchReason: "title", filterReason: "suspected-wechat-shell" }
      ],
      filteredWindows: [
        { handle: 132826, pid: 51960, title: "微信", className: "Qt51514QWindowIcon", visible: true, iconic: false, score: 890, matchReason: "title", filterReason: "suspected-wechat-shell" },
        { handle: 197780, pid: 51960, title: "微信输入法-设置", className: "AboutWindow", visible: false, iconic: false, score: 780, matchReason: "title", filterReason: "suspected-wechat-shell" }
      ],
      finalCandidates: []
    }));

    const scan = await scanFocusWindowsForStages("wechat", [
      { label: "matched", pids: [51960], titleKeywords: ["微信"], classKeywords: ["WeChat", "Weixin", "ChatWnd"] }
    ], runner, unavailableHelper());

    expect(scan.allWindowsScanned).toBe(559);
    expect(scan.relatedWindows).toEqual(expect.arrayContaining([
      expect.objectContaining({ handle: 132826, className: "Qt51514QWindowIcon", filterReason: "suspected-wechat-shell" })
    ]));
    expect(scan.filteredWindows).toEqual(expect.arrayContaining([
      expect.objectContaining({ handle: 132826 })
    ]));
    expect(scan.finalCandidates).toEqual([]);
  });

  it("allows minimized WeChat taskbar QWindowIcon windows in fallback scoring", () => {
    const script = buildListFocusWindowsScript([
      { label: "matched", pids: [51960], titleKeywords: ["微信"], classKeywords: ["WeChat", "Weixin", "ChatWnd"] }
    ]);

    expect(script).toContain("$isWeChatTaskbarWindow = $iconic -and $visible -and $className -match '^Qt.*QWindowIcon$'");
    expect(script).toContain("if (-not $filterReason -and $isWeChatRelated -and $isWeChatShell -and -not $isWeChatTaskbarWindow)");
  });

  it("returns tray-hidden when a handle exists but remains hidden after restore attempts", async () => {
    await expect(focusWindowHandleDetailed({ handle: 1234, pid: 42, title: "", score: 10, visible: false }, vi.fn(async () => "tray-hidden"), [], unavailableHelper())).resolves.toEqual({ focused: false, reason: "tray-hidden" });
  });

  it("returns foreground-blocked when Windows refuses foreground activation", async () => {
    await expect(focusWindowHandleDetailed({ handle: 1234, pid: 42, title: "Demo", score: 10, visible: true }, vi.fn(async () => "foreground-blocked"), [], unavailableHelper())).resolves.toEqual({ focused: false, reason: "foreground-blocked" });
  });

  it("maps native helper focus responses before falling back to PowerShell", async () => {
    const runPowerShell = vi.fn(async () => "focused");
    const runHelper = vi.fn(async () => JSON.stringify({
      focused: false,
      reason: "foreground-blocked",
      foregroundHandle: 4321,
      foregroundPid: 99,
      targetPid: 42,
      visible: true
    }));

    await expect(focusWindowHandleDetailed({ handle: 1234, pid: 42, title: "Demo", score: 10, visible: true }, runPowerShell, [42], runHelper)).resolves.toEqual({ focused: false, reason: "foreground-blocked" });
    expect(runHelper).toHaveBeenCalledWith("focus", { handle: 1234, expectedPids: [42] });
    expect(runPowerShell).not.toHaveBeenCalled();
  });
});
