import { describe, expect, it, vi } from "vitest";
import type { AppEntry, AppMetrics } from "../shared/types.js";
import { AppWindowManager, buildWindowDiagnostics, focusStagePids, focusStagesFromCandidates, toAppWindowInfo } from "./window-manager.js";
import type { FocusWindowCandidate, FocusWindowStage } from "./focus-window.js";

const app = (overrides: Partial<AppEntry> = {}): AppEntry => ({
  id: "app-1",
  name: "WeChat",
  category: "办公",
  groupId: "office",
  executablePath: "C:\\Program Files\\Tencent\\WeChat\\WeChat.exe",
  processName: "WeChat.exe",
  accent: "#2f66e8",
  ...overrides
});

const metrics = (overrides: Partial<AppMetrics> = {}): AppMetrics => ({
  appId: "app-1",
  isRunning: true,
  cpuPercent: 0,
  memoryBytes: 0,
  diskBytesPerSecond: 0,
  pids: [100],
  matchedPids: [100],
  associatedPids: [101],
  matchedProcessNames: ["WeChat.exe"],
  matchedPaths: ["C:\\Program Files\\Tencent\\WeChat\\WeChat.exe"],
  ...overrides
});

const candidate = (overrides: Partial<FocusWindowCandidate> = {}): FocusWindowCandidate => ({
  handle: 9001,
  pid: 100,
  title: "微信",
  score: 1074,
  stage: "matched",
  visible: true,
  iconic: false,
  toolWindow: false,
  owner: 0,
  width: 900,
  height: 700,
  ...overrides
});

describe("window-manager", () => {
  const unavailableHelper = () => vi.fn(async () => { throw new Error("helper unavailable"); });

  it("builds fast and fallback stages from runtime matched process data", () => {
    const stages = focusStagesFromCandidates(
      app(),
      metrics(),
      [{ pid: 102, name: "WeChatApp.exe", path: "C:\\Program Files\\Tencent\\WeChat\\WeChatApp.exe", parentPid: 100 }],
      true
    );

    expect(stages.map((stage) => stage.label)).toEqual(["matched", "children", "directory", "name", "title"]);
    expect(focusStagePids(stages)).toEqual([100, 101, 102]);
  });

  it("converts candidates into compact app window entries", () => {
    expect(toAppWindowInfo(candidate())).toEqual({
      handle: 9001,
      pid: 100,
      title: "微信",
      stage: "matched",
      visible: true,
      minimized: false
    });
  });

  it("formats copyable window diagnostics for failed focus cases", () => {
    const stages: FocusWindowStage[] = [
      { label: "matched", pids: [100, 101] },
      { label: "title", pids: [], titleKeywords: ["WeChat"] }
    ];
    const text = buildWindowDiagnostics(app(), stages, {
      allWindowsScanned: 24,
      relatedWindows: [candidate({ className: "WeChatMainWnd", processName: "WeChatAppEx", executablePath: "C:\\Tencent\\WeChatAppEx.exe", matchReason: "class" })],
      filteredWindows: [candidate({ handle: 9002, pid: 102, title: "", stage: "children", visible: false, score: 970, filterReason: "low-score" })],
      finalCandidates: [candidate()]
    });

    expect(text).toContain("App: WeChat (app-1)");
    expect(text).toContain("Stage matched: pids=100,101");
    expect(text).toContain("allWindowsScanned: 24");
    expect(text).toContain("selectedCandidate: (none)");
    expect(text).toContain("restoreMethod: none");
    expect(text).toContain("relatedWindows:");
    expect(text).toContain("hwnd=9001 pid=100 processName=WeChatAppEx");
    expect(text).toContain("className=WeChatMainWnd");
    expect(text).toContain("filteredWindows:");
    expect(text).toContain("filterReason=low-score");
    expect(text).toContain("finalCandidates:");
    expect(text).toContain("matchReason=class");
    expect(text).toContain("postRestoreWindows:");
  });

  it("uses cached handles before re-enumerating windows", async () => {
    const manager = new AppWindowManager({
      runPowerShell: vi.fn(async () => "focused"),
      runWindowFocusHelper: unavailableHelper(),
      getProcesses: vi.fn(async () => [])
    });
    manager.rememberWindow(app().id, candidate());

    await expect(manager.focusAppWindow(app(), metrics())).resolves.toEqual({ focused: true });
    expect(manager.dependencies.getProcesses).not.toHaveBeenCalled();
  });

  it("does not execute the app again when a running tray app has no top-level windows", async () => {
    const manager = new AppWindowManager({
      runPowerShell: vi.fn(async () => "not-found"),
      runWindowFocusHelper: unavailableHelper(),
      getProcesses: vi.fn(async () => [])
    });

    await expect(manager.focusAppWindow(app({ name: "Notion", executablePath: "C:\\Notion\\Notion.exe", processName: "Notion" }), metrics())).resolves.toEqual({ focused: false, reason: "no-window" });
  });

  it("lets WeGame restore its own tray window instead of focusing a renderer host", async () => {
    const runHelper = vi.fn(async () => {
      throw new Error("window scanning must not run for WeGame tray restoration");
    });
    const activateRunningApp = vi.fn(async () => ({ launched: true }));
    const waitAfterSafeActivation = vi.fn(async () => undefined);
    const manager = new AppWindowManager({
      runPowerShell: vi.fn(async () => "not-found"),
      runWindowFocusHelper: runHelper,
      getProcesses: vi.fn(async () => []),
      activateRunningApp,
      waitAfterSafeActivation
    });

    await expect(manager.focusAppWindow(app({
      name: "WeGame",
      executablePath: "E:\\WeGame\\wegame.exe",
      processName: "wegame"
    }), metrics())).resolves.toEqual({ focused: true });
    expect(activateRunningApp).toHaveBeenCalledTimes(1);
    expect(waitAfterSafeActivation).toHaveBeenCalledTimes(1);
    expect(runHelper).not.toHaveBeenCalled();
  });

  it("does not run the slow process fallback when runtime metrics already provide candidate pids", async () => {
    const getProcesses = vi.fn(async () => [{ pid: 102, name: "WeChatApp.exe", path: "C:\\Program Files\\Tencent\\WeChat\\WeChatApp.exe", parentPid: 100 }]);
    const manager = new AppWindowManager({
      runPowerShell: vi.fn(async () => "not-found"),
      runWindowFocusHelper: unavailableHelper(),
      getProcesses
    });

    await expect(manager.focusAppWindow(app({ name: "Notion", executablePath: "C:\\Notion\\Notion.exe", processName: "Notion" }), metrics())).resolves.toEqual({ focused: false, reason: "no-window" });
    expect(getProcesses).not.toHaveBeenCalled();
  });

  it("returns unsupported for WeChat tray restore without moving the mouse or relaunching", async () => {
    const runPowerShell = vi.fn()
      .mockResolvedValueOnce("not-found");
    const manager = new AppWindowManager({
      runPowerShell,
      runWindowFocusHelper: unavailableHelper(),
      getProcesses: vi.fn(async () => [])
    });

    await expect(manager.focusAppWindow(app(), metrics())).resolves.toEqual({ focused: false, reason: "trayRestoreUnsupported" });
    expect(manager.dependencies.getProcesses).not.toHaveBeenCalled();
    expect(runPowerShell).toHaveBeenCalledTimes(1);
    expect(runPowerShell.mock.calls.map((call) => call[0]).join("\n")).not.toContain("SetCursorPos");
    expect(runPowerShell.mock.calls.map((call) => call[0]).join("\n")).not.toContain("mouse_event");
  });

  it("does not focus the WeChat tray message window when helper filters it out", async () => {
    const runHelper = vi.fn(async (command: string) => {
      if (command === "focus") return JSON.stringify({ focused: true });
      return JSON.stringify({
        allWindowsScanned: 24,
        relatedWindows: [
          candidate({
            handle: 460552,
            title: "WxTrayIconMessageWindow",
            className: "Qt51514WxTrayIconMessageWindowClass",
            visible: false,
            filterReason: "wechat-tray-message-window"
          })
        ],
        filteredWindows: [
          candidate({
            handle: 460552,
            title: "WxTrayIconMessageWindow",
            className: "Qt51514WxTrayIconMessageWindowClass",
            visible: false,
            filterReason: "wechat-tray-message-window"
          })
        ],
        finalCandidates: []
      });
    });
    const manager = new AppWindowManager({
      runPowerShell: vi.fn(async () => "not-found"),
      runWindowFocusHelper: runHelper,
      getProcesses: vi.fn(async () => [])
    });

    await expect(manager.focusAppWindow(app(), metrics())).resolves.toEqual({ focused: false, reason: "trayRestoreUnsupported" });
    expect(runHelper.mock.calls.map((call) => call[0])).toEqual(["scan"]);
  });

  it("safely fails for Codex tray-only helper windows without focusing background handles", async () => {
    const runHelper = vi.fn(async (command: string) => {
      if (command === "focus") return JSON.stringify({ focused: true });
      return JSON.stringify({
        allWindowsScanned: 32,
        relatedWindows: [
          candidate({
            handle: 40503834,
            pid: 10824,
            title: "",
            className: "OwlElectron_NotifyIconHostWindow",
            processName: "Codex",
            visible: false,
            width: 0,
            height: 0,
            filterReason: "non-interactive-window"
          }),
          candidate({
            handle: 4920934,
            pid: 10824,
            title: "",
            className: "Chrome_WidgetWin_0",
            processName: "Codex",
            visible: false,
            width: 1920,
            height: 1020,
            filterReason: "non-interactive-window"
          })
        ],
        filteredWindows: [
          { handle: 40503834, pid: 10824, title: "", className: "OwlElectron_NotifyIconHostWindow", score: 795, filterReason: "non-interactive-window" },
          { handle: 4920934, pid: 10824, title: "", className: "Chrome_WidgetWin_0", score: 910, filterReason: "non-interactive-window" }
        ],
        finalCandidates: []
      });
    });
    const manager = new AppWindowManager({
      runPowerShell: vi.fn(async () => "not-found"),
      runWindowFocusHelper: runHelper,
      getProcesses: vi.fn(async () => [])
    });

    await expect(manager.focusAppWindow(app({
      name: "Codex",
      executablePath: "C:\\Program Files\\WindowsApps\\OpenAI.Codex\\app\\Codex.exe",
      processName: "Codex"
    }), metrics({
      pids: [10824],
      matchedPids: [10824],
      associatedPids: [],
      matchedProcessNames: ["Codex"],
      matchedPaths: ["C:\\Program Files\\WindowsApps\\OpenAI.Codex\\app\\Codex.exe"]
    }))).resolves.toEqual({ focused: false, reason: "no-window" });
    expect(runHelper.mock.calls.map((call) => call[0])).toEqual(["scan"]);
  });

  it("relaunches Codex once to safely activate it when only tray helper windows exist", async () => {
    const runHelper = vi.fn(async (command: string) => {
      if (command === "focus") return JSON.stringify({ focused: true });
      const firstScan = runHelper.mock.calls.filter((call) => call[0] === "scan").length === 1;
      return JSON.stringify(firstScan ? {
        allWindowsScanned: 32,
        relatedWindows: [
          candidate({
            handle: 40503834,
            pid: 10824,
            title: "",
            className: "OwlElectron_NotifyIconHostWindow",
            processName: "Codex",
            visible: false,
            width: 0,
            height: 0,
            filterReason: "non-interactive-window"
          })
        ],
        filteredWindows: [
          { handle: 40503834, pid: 10824, title: "", className: "OwlElectron_NotifyIconHostWindow", score: 795, filterReason: "non-interactive-window" }
        ],
        finalCandidates: []
      } : {
        allWindowsScanned: 33,
        relatedWindows: [
          candidate({ handle: 9009, pid: 10824, title: "Codex", className: "Chrome_WidgetWin_1", processName: "Codex" })
        ],
        filteredWindows: [],
        finalCandidates: [
          candidate({ handle: 9009, pid: 10824, title: "Codex", className: "Chrome_WidgetWin_1", processName: "Codex" })
        ]
      });
    });
    const activateRunningApp = vi.fn(async () => ({ launched: true }));
    const waitAfterSafeActivation = vi.fn(async () => undefined);
    const manager = new AppWindowManager({
      runPowerShell: vi.fn(async () => "not-found"),
      runWindowFocusHelper: runHelper,
      getProcesses: vi.fn(async () => [{ pid: 10824, name: "Codex.exe", path: "C:\\Program Files\\WindowsApps\\OpenAI.Codex\\app\\Codex.exe", parentPid: 0 }]),
      activateRunningApp,
      waitAfterSafeActivation
    });

    await expect(manager.focusAppWindow(app({
      name: "Codex",
      executablePath: "C:\\Program Files\\WindowsApps\\OpenAI.Codex\\app\\Codex.exe",
      processName: "Codex"
    }), metrics({
      pids: [10824],
      matchedPids: [10824],
      associatedPids: [],
      matchedProcessNames: ["Codex"],
      matchedPaths: ["C:\\Program Files\\WindowsApps\\OpenAI.Codex\\app\\Codex.exe"]
    }))).resolves.toEqual({ focused: true });
    expect(activateRunningApp).toHaveBeenCalledTimes(1);
    expect(waitAfterSafeActivation).toHaveBeenCalledTimes(1);
    expect(runHelper.mock.calls.map((call) => call[0])).toEqual(["scan", "scan", "focus"]);
  });

  it("restores a minimized WeChat taskbar window through the selected hwnd without tray restore", async () => {
    const runPowerShell = vi.fn()
      .mockResolvedValueOnce(`${JSON.stringify(candidate({ iconic: true, visible: true, className: "WeChatMainWnd", processName: "Weixin", executablePath: "E:\\Weixin\\Weixin.exe" }))}`)
      .mockResolvedValueOnce("focused");
    const manager = new AppWindowManager({
      runPowerShell,
      runWindowFocusHelper: unavailableHelper(),
      getProcesses: vi.fn(async () => [])
    });

    await expect(manager.focusAppWindow(app(), metrics())).resolves.toEqual({ focused: true });
    expect(runPowerShell).toHaveBeenCalledTimes(2);
    expect(runPowerShell.mock.calls[1][0]).toContain("ShowWindowAsync($handle, 9)");
    expect(runPowerShell.mock.calls.map((call) => call[0]).join("\n")).not.toContain("NotifyIconOverflowWindow");
  });

  it("falls back to process scanning when runtime metrics do not provide candidate pids", async () => {
    const getProcesses = vi.fn(async () => [{ pid: 102, name: "WeChatApp.exe", path: "C:\\Program Files\\Tencent\\WeChat\\WeChatApp.exe", parentPid: 100 }]);
    const manager = new AppWindowManager({
      runPowerShell: vi.fn(async () => "not-found"),
      runWindowFocusHelper: unavailableHelper(),
      getProcesses
    });

    await expect(manager.focusAppWindow(app({ name: "Notion", executablePath: "C:\\Notion\\Notion.exe", processName: "Notion" }), metrics({ pids: [], matchedPids: [], associatedPids: [] }))).resolves.toEqual({ focused: false, reason: "no-window" });
    expect(getProcesses).toHaveBeenCalledTimes(1);
  });
});
