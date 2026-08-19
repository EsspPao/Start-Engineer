import { describe, expect, it, vi } from "vitest";
import type { AppEntry, AppMetrics } from "../shared/types.js";
import type { FocusWindowCandidate } from "./focus-window.js";
import { resolveWakePolicy } from "./wake-profiles.js";
import { AppWindowManager, buildWindowDiagnostics, focusStagePids, focusStagesFromCandidates, toAppWindowInfo } from "./window-manager.js";

const app = (overrides: Partial<AppEntry> = {}): AppEntry => ({
  id: "app-1",
  name: "Demo",
  category: "工具",
  groupId: "tools",
  executablePath: "C:\\Apps\\Demo\\Demo.exe",
  processName: "Demo",
  accent: "#2f66e8",
  wakeStrategy: "auto",
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
  matchedProcessNames: ["Demo.exe"],
  matchedPaths: ["C:\\Apps\\Demo\\Demo.exe"],
  ...overrides
});

const candidate = (overrides: Partial<FocusWindowCandidate> = {}): FocusWindowCandidate => ({
  handle: 9001,
  pid: 100,
  title: "Demo",
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

const emptyScan = () => JSON.stringify({ allWindowsScanned: 24, relatedWindows: [], filteredWindows: [], finalCandidates: [] });
const scanWith = (item: FocusWindowCandidate) => JSON.stringify({ allWindowsScanned: 24, relatedWindows: [item], filteredWindows: [], finalCandidates: [item] });

describe("window manager wake engine", () => {
  it("builds staged window candidates from runtime process data", () => {
    const stages = focusStagesFromCandidates(app(), metrics(), [{ pid: 102, name: "DemoChild.exe", path: "C:\\Apps\\Demo\\DemoChild.exe", parentPid: 100 }], true);
    expect(stages.map((stage) => stage.label)).toEqual(["matched", "children", "directory", "name", "title"]);
    expect(focusStagePids(stages)).toEqual([100, 101, 102]);
  });

  it("converts candidates into compact app window entries", () => {
    expect(toAppWindowInfo(candidate())).toEqual({ handle: 9001, pid: 100, title: "Demo", stage: "matched", visible: true, minimized: false });
  });

  it("formats copyable JSON diagnostics with the selected profile and strategy", () => {
    const entry = app({ name: "微信", processName: "Weixin", executablePath: "E:\\Tencent\\xwechat\\Weixin.exe" });
    const stages = focusStagesFromCandidates(entry, metrics({ matchedProcessNames: ["Weixin"] }), [], false);
    const report = JSON.parse(buildWindowDiagnostics(entry, metrics(), stages, {
      allWindowsScanned: 24,
      relatedWindows: [candidate({ className: "WeChatMainWnd", processName: "Weixin" })],
      filteredWindows: [candidate({ handle: 9002, className: "Qt51514WxTrayIconMessageWindowClass", filterReason: "wechat-tray-message-window" })],
      finalCandidates: []
    }, resolveWakePolicy(entry)));

    expect(report).toMatchObject({
      appId: "app-1",
      selectedWakeProfile: "wechat",
      selectedWakeStrategy: "window-only",
      allWindowsScanned: 24,
      externalActionsPerformed: 0,
      failureReason: null
    });
    expect(report.filteredWindows[0].filterReason).toBe("wechat-tray-message-window");
    expect(report.wakePolicy.forbiddenWindowClasses).toContain("WxTrayIconMessageWindow");
  });

  it("restores a normal minimized window with exactly one external action", async () => {
    const minimized = candidate({ iconic: true });
    const runHelper = vi.fn(async (command: string) => command === "scan" ? scanWith(minimized) : JSON.stringify({ focused: true }));
    const activateRunningApp = vi.fn(async () => ({ launched: true }));
    const manager = new AppWindowManager({ runPowerShell: vi.fn(), runWindowFocusHelper: runHelper, getProcesses: vi.fn(async () => []), activateRunningApp });

    await expect(manager.focusAppWindow(app(), metrics())).resolves.toMatchObject({
      success: true,
      focused: true,
      outcome: "focused",
      strategy: "window-only",
      diagnostics: { profileId: "default", externalActionsPerformed: 1 }
    });
    expect(runHelper.mock.calls.map((call) => call[0])).toEqual(["scan", "focus"]);
    expect(activateRunningApp).not.toHaveBeenCalled();
  });

  it("never self-launches when an interactive Codex window already exists", async () => {
    const codexWindow = candidate({ title: "Codex", processName: "Codex", className: "Chrome_WidgetWin_1" });
    const runHelper = vi.fn(async (command: string) => command === "scan" ? scanWith(codexWindow) : JSON.stringify({ focused: true }));
    const activateRunningApp = vi.fn(async () => ({ launched: true }));
    const manager = new AppWindowManager({ runPowerShell: vi.fn(), runWindowFocusHelper: runHelper, getProcesses: vi.fn(async () => []), activateRunningApp });

    await expect(manager.focusAppWindow(app({ name: "Codex", processName: "Codex" }), metrics())).resolves.toMatchObject({ success: true, focused: true, strategy: "self-launch" });
    expect(activateRunningApp).not.toHaveBeenCalled();
    expect(runHelper.mock.calls.map((call) => call[0])).toEqual(["scan", "focus"]);
  });

  it("uses window-only for unknown applications and returns a unified failure reason", async () => {
    const activateRunningApp = vi.fn(async () => ({ launched: true }));
    const manager = new AppWindowManager({ runPowerShell: vi.fn(), runWindowFocusHelper: vi.fn(async () => emptyScan()), getProcesses: vi.fn(async () => []), activateRunningApp });

    await expect(manager.focusAppWindow(app(), metrics())).resolves.toMatchObject({
      success: false,
      focused: false,
      outcome: "failed",
      reason: "no-interactive-window",
      strategy: "window-only",
      diagnostics: { externalActionsPerformed: 0 }
    });
    expect(activateRunningApp).not.toHaveBeenCalled();
  });

  it("safely fails for WeChat tray state without relaunching or simulating tray input", async () => {
    const runPowerShell = vi.fn();
    const activateRunningApp = vi.fn(async () => ({ launched: true }));
    const runHelper = vi.fn(async () => JSON.stringify({
      allWindowsScanned: 24,
      relatedWindows: [
        candidate({ title: "微信", className: "WeChatMainWnd", visible: false, iconic: false }),
        candidate({ title: "WxTrayIconMessageWindow", className: "Qt51514WxTrayIconMessageWindowClass", visible: false, filterReason: "wechat-tray-message-window" })
      ],
      filteredWindows: [candidate({ title: "WxTrayIconMessageWindow", className: "Qt51514WxTrayIconMessageWindowClass", visible: false, filterReason: "wechat-tray-message-window" })],
      finalCandidates: [candidate({ title: "微信", className: "WeChatMainWnd", visible: false, iconic: false })]
    }));
    const manager = new AppWindowManager({ runPowerShell, runWindowFocusHelper: runHelper, getProcesses: vi.fn(async () => []), activateRunningApp });
    const wechat = app({ name: "微信", processName: "Weixin", executablePath: "E:\\Tencent\\xwechat\\Weixin.exe" });

    await expect(manager.focusAppWindow(wechat, metrics())).resolves.toMatchObject({ reason: "tray-restore-unsupported", strategy: "window-only" });
    expect(activateRunningApp).not.toHaveBeenCalled();
    expect(runPowerShell).not.toHaveBeenCalled();
    expect(runHelper.mock.calls.map((call) => call[0])).toEqual(["scan"]);
  });

  it("safely fails for Notion tray state without relaunching", async () => {
    const activateRunningApp = vi.fn(async () => ({ launched: true }));
    const hiddenWindow = candidate({ title: "Notion", className: "Chrome_WidgetWin_1", processName: "Notion", visible: false, iconic: false });
    const runHelper = vi.fn(async () => scanWith(hiddenWindow));
    const manager = new AppWindowManager({ runPowerShell: vi.fn(), runWindowFocusHelper: runHelper, getProcesses: vi.fn(async () => []), activateRunningApp });
    const notion = app({ name: "Notion", processName: "Notion", executablePath: "C:\\Program Files\\Notion\\Notion.exe" });
    manager.rememberWindow(notion.id, candidate({ title: "Notion", processName: "Notion" }));

    await expect(manager.focusAppWindow(notion, metrics())).resolves.toMatchObject({
      success: false,
      reason: "tray-restore-unsupported",
      strategy: "window-only",
      diagnostics: { profileId: "notion", externalActionsPerformed: 0 }
    });
    expect(activateRunningApp).not.toHaveBeenCalled();
    expect(runHelper.mock.calls.map((call) => call[0])).toEqual(["scan"]);
  });

  it("does not restore a hidden Notion window selected from the window list", async () => {
    const hiddenWindow = candidate({ handle: 8123, title: "Notion", className: "Chrome_WidgetWin_1", processName: "Notion", visible: false, iconic: false });
    const runHelper = vi.fn(async () => scanWith(hiddenWindow));
    const manager = new AppWindowManager({ runPowerShell: vi.fn(), runWindowFocusHelper: runHelper, getProcesses: vi.fn(async () => []) });
    const notion = app({ name: "Notion", processName: "Notion", executablePath: "C:\\Program Files\\Notion\\Notion.exe" });

    await expect(manager.focusHandle(notion, hiddenWindow.handle, metrics())).resolves.toMatchObject({
      success: false,
      reason: "tray-restore-unsupported",
      diagnostics: { externalActionsPerformed: 0 }
    });
    expect(runHelper.mock.calls.map((call) => call[0])).toEqual(["scan"]);
  });

  it("restores a real minimized WeChat taskbar window instead of treating it as tray-only", async () => {
    const window = candidate({ title: "微信", className: "WeChatMainWnd", processName: "Weixin", iconic: true });
    const runHelper = vi.fn(async (command: string) => command === "scan" ? scanWith(window) : JSON.stringify({ focused: true }));
    const manager = new AppWindowManager({ runPowerShell: vi.fn(), runWindowFocusHelper: runHelper, getProcesses: vi.fn(async () => []) });
    const wechat = app({ name: "微信", processName: "Weixin", executablePath: "E:\\Tencent\\xwechat\\Weixin.exe" });

    await expect(manager.focusAppWindow(wechat, metrics())).resolves.toMatchObject({ success: true, focused: true, strategy: "window-only" });
    expect(runHelper.mock.calls.map((call) => call[0])).toEqual(["scan", "focus"]);
  });

  it("still restores a minimized Notion taskbar window", async () => {
    const window = candidate({ title: "Notion", className: "Chrome_WidgetWin_1", processName: "Notion", iconic: true });
    const runHelper = vi.fn(async (command: string) => command === "scan" ? scanWith(window) : JSON.stringify({ focused: true }));
    const manager = new AppWindowManager({ runPowerShell: vi.fn(), runWindowFocusHelper: runHelper, getProcesses: vi.fn(async () => []) });
    const notion = app({ name: "Notion", processName: "Notion", executablePath: "C:\\Program Files\\Notion\\Notion.exe" });

    await expect(manager.focusAppWindow(notion, metrics())).resolves.toMatchObject({ success: true, focused: true, strategy: "window-only" });
    expect(runHelper.mock.calls.map((call) => call[0])).toEqual(["scan", "focus"]);
  });

  it("self-launches Codex once, observes once, and never performs a second focus", async () => {
    const callOrder: string[] = [];
    const runHelper = vi.fn(async (command: string) => {
      callOrder.push(command);
      const scanCount = runHelper.mock.calls.filter((call) => call[0] === "scan").length;
      return scanCount === 1 ? emptyScan() : scanWith(candidate({ title: "Codex", processName: "Codex", className: "Chrome_WidgetWin_1" }));
    });
    const activateRunningApp = vi.fn(async (_entry: AppEntry, strategy: string) => { callOrder.push(`activate:${strategy}`); return { launched: true }; });
    const waitAfterSafeActivation = vi.fn(async () => undefined);
    const manager = new AppWindowManager({ runPowerShell: vi.fn(), runWindowFocusHelper: runHelper, getProcesses: vi.fn(async () => []), activateRunningApp, waitAfterSafeActivation });

    await expect(manager.focusAppWindow(app({ name: "Codex", processName: "Codex" }), metrics())).resolves.toMatchObject({
      success: true,
      focused: true,
      strategy: "self-launch",
      diagnostics: { profileId: "codex", externalActionsPerformed: 1 }
    });
    expect(activateRunningApp).toHaveBeenCalledOnce();
    expect(waitAfterSafeActivation).toHaveBeenCalledOnce();
    expect(callOrder).toEqual(["scan", "activate:self-launch", "scan"]);
  });

  it("sends MuMu one self-launch request without any delayed scan or refocus", async () => {
    const runHelper = vi.fn(async () => { throw new Error("MuMu must not scan or focus"); });
    const activateRunningApp = vi.fn(async () => ({ launched: true }));
    const waitAfterSafeActivation = vi.fn(async () => undefined);
    const getProcesses = vi.fn(async () => []);
    const manager = new AppWindowManager({ runPowerShell: vi.fn(), runWindowFocusHelper: runHelper, getProcesses, activateRunningApp, waitAfterSafeActivation });
    const mumu = app({ name: "MuMu模拟器", processName: "MuMuNxMain", executablePath: "E:\\Game\\MuMuPlayer\\MuMuNxMain.exe" });

    await expect(manager.focusAppWindow(mumu, metrics())).resolves.toMatchObject({
      success: true,
      focused: false,
      outcome: "activation-requested",
      strategy: "self-launch",
      diagnostics: { profileId: "mumu", externalActionsPerformed: 1 }
    });
    expect(activateRunningApp).toHaveBeenCalledOnce();
    expect(activateRunningApp).toHaveBeenCalledWith(mumu, "self-launch");
    expect(waitAfterSafeActivation).not.toHaveBeenCalled();
    expect(getProcesses).not.toHaveBeenCalled();
    expect(runHelper).not.toHaveBeenCalled();
  });

  it("activates Store applications by AUMID once and only observes the result", async () => {
    const callOrder: string[] = [];
    const runHelper = vi.fn(async (command: string) => {
      callOrder.push(command);
      const scanCount = runHelper.mock.calls.filter((call) => call[0] === "scan").length;
      return scanCount === 1 ? emptyScan() : scanWith(candidate({ title: "Store Demo", processName: "StoreDemo" }));
    });
    const activateRunningApp = vi.fn(async (_entry: AppEntry, strategy: string) => { callOrder.push(`activate:${strategy}`); return { launched: true }; });
    const manager = new AppWindowManager({ runPowerShell: vi.fn(), runWindowFocusHelper: runHelper, getProcesses: vi.fn(async () => []), activateRunningApp, waitAfterSafeActivation: vi.fn(async () => undefined) });
    const store = app({ name: "Store Demo", processName: "StoreDemo", appUserModelId: "Example.Store_123!App" });

    await expect(manager.focusAppWindow(store, metrics())).resolves.toMatchObject({ success: true, strategy: "aumid", diagnostics: { profileId: "windows-store", externalActionsPerformed: 1 } });
    expect(activateRunningApp).toHaveBeenCalledWith(store, "aumid");
    expect(callOrder).toEqual(["scan", "activate:aumid", "scan"]);
  });

  it("returns strategy-specific failure reasons when activation fails", async () => {
    const activateRunningApp = vi.fn(async () => ({ launched: false }));
    const manager = new AppWindowManager({ runPowerShell: vi.fn(), runWindowFocusHelper: vi.fn(async () => emptyScan()), getProcesses: vi.fn(async () => []), activateRunningApp });

    await expect(manager.focusAppWindow(app({ name: "Codex", processName: "Codex" }), metrics())).resolves.toMatchObject({ reason: "self-launch-failed", diagnostics: { externalActionsPerformed: 1 } });
    expect(activateRunningApp).toHaveBeenCalledOnce();
  });

  it("does not spend a second external action after Windows blocks a focus attempt", async () => {
    const window = candidate();
    const runHelper = vi.fn(async (command: string) => command === "scan" ? scanWith(window) : JSON.stringify({ focused: false, reason: "foreground-blocked" }));
    const activateRunningApp = vi.fn(async () => ({ launched: true }));
    const manager = new AppWindowManager({ runPowerShell: vi.fn(), runWindowFocusHelper: runHelper, getProcesses: vi.fn(async () => []), activateRunningApp });

    await expect(manager.focusAppWindow(app({ wakeStrategy: "self-launch" }), metrics())).resolves.toMatchObject({
      reason: "focus-blocked-by-windows",
      diagnostics: { externalActionsPerformed: 1 }
    });
    expect(activateRunningApp).not.toHaveBeenCalled();
  });

  it("uses the slow process fallback only when runtime metrics provide no candidate pid", async () => {
    const getProcesses = vi.fn(async () => [{ pid: 102, name: "DemoChild.exe", path: "C:\\Apps\\Demo\\DemoChild.exe", parentPid: 100 }]);
    const manager = new AppWindowManager({ runPowerShell: vi.fn(), runWindowFocusHelper: vi.fn(async () => emptyScan()), getProcesses });

    await manager.focusAppWindow(app(), metrics({ pids: [], matchedPids: [], associatedPids: [] }));
    expect(getProcesses).toHaveBeenCalledOnce();
  });
});
