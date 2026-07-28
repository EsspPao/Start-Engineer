import { describe, expect, it, vi } from "vitest";
import type { AppEntry, LaunchAppResult } from "../shared/types";
import { LaunchService } from "./launch-service";

const app: AppEntry = {
  id: "game",
  name: "Game",
  category: "游戏",
  groupId: "games",
  executablePath: "C:\\Games\\Game.exe",
  workingDirectory: "C:\\Games",
  processName: "Game",
  accent: "#000000"
};

function createService(request: ReturnType<typeof vi.fn>, runPowerShell = vi.fn()) {
  return new LaunchService({
    nativeRuntime: { request } as never,
    runPowerShell,
    loadApps: () => [app],
    saveApps: (apps) => apps,
    getApp: () => app,
    getManagedRunningStatus: async () => [],
    getProcessSnapshots: async () => [],
    buildRuntimeSnapshot: async () => ({ apps: [app], metrics: [], processes: [] }),
    runtimeAssociatedPids: new Map()
  });
}

function launchExecutable(service: LaunchService) {
  return (service as unknown as {
    launchExecutable: (entry: AppEntry) => Promise<Omit<LaunchAppResult, "apps">>;
  }).launchExecutable(app);
}

function launchWithPowerShell(service: LaunchService) {
  return (service as unknown as {
    launchWithPowerShell: (entry: AppEntry) => Promise<Omit<LaunchAppResult, "apps">>;
  }).launchWithPowerShell(app);
}

describe("administrator-required application launch", () => {
  it("retries error 740 through the native elevated launch path", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ ok: false, errorCode: 740 })
      .mockResolvedValueOnce({ ok: true, pid: 42 });

    await expect(launchExecutable(createService(request))).resolves.toEqual({ status: "launched", pid: 42 });
    expect(request).toHaveBeenNthCalledWith(1, "launch", expect.not.objectContaining({ elevated: true }));
    expect(request).toHaveBeenNthCalledWith(
      2,
      "launch",
      expect.objectContaining({ executablePath: app.executablePath, elevated: true }),
      120_000
    );
  });

  it("treats a cancelled UAC prompt as cancellation instead of an invalid path", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ ok: false, errorCode: 740 })
      .mockResolvedValueOnce({ ok: false, errorCode: 1223 });

    await expect(launchExecutable(createService(request))).resolves.toEqual({ status: "cancelled", errorCode: 1223 });
  });

  it("does not elevate unrelated launch failures", async () => {
    const request = vi.fn().mockResolvedValue({ ok: false, errorCode: 2 });

    await expect(launchExecutable(createService(request))).resolves.toEqual({
      status: "failed",
      errorCode: 2,
      message: "程序或工作目录不存在。"
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it("also retries error 740 with RunAs in the PowerShell fallback", async () => {
    const runPowerShell = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({ ok: false, errorCode: 740 }))
      .mockResolvedValueOnce(JSON.stringify({ ok: true, pid: 84 }));

    await expect(launchWithPowerShell(createService(vi.fn(), runPowerShell))).resolves.toEqual({ status: "launched", pid: 84 });
    expect(runPowerShell).toHaveBeenCalledTimes(2);
    expect(runPowerShell.mock.calls[0][0]).toContain("if ($false) { $options.Verb = 'RunAs' }");
    expect(runPowerShell.mock.calls[1][0]).toContain("if ($true) { $options.Verb = 'RunAs' }");
  });
});

describe("Windows Store application launch", () => {
  it("repairs a stale versioned path in place and launches by stable AUMID", async () => {
    let storedApps: AppEntry[] = [{
      ...app,
      id: "chatgpt",
      name: "我的 ChatGPT",
      executablePath: "Z:\\WindowsApps\\OpenAI.Codex_26.715.7063.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe",
      workingDirectory: "Z:\\WindowsApps\\OpenAI.Codex_26.715.7063.0_x64__2p2nqsd0c76g0\\app",
      processName: "ChatGPT"
    }];
    const request = vi.fn().mockResolvedValue({ ok: true, pid: 0 });
    const saveApps = vi.fn((apps: AppEntry[]) => {
      storedApps = apps;
      return apps;
    });
    const resolveWindowsStoreApp = vi.fn().mockResolvedValue({
      name: "ChatGPT",
      appUserModelId: "OpenAI.Codex_2p2nqsd0c76g0!App",
      packageFamilyName: "OpenAI.Codex_2p2nqsd0c76g0",
      executablePath: "Z:\\WindowsApps\\OpenAI.Codex_26.721.4979.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe",
      processName: "ChatGPT",
      workingDirectory: "Z:\\WindowsApps\\OpenAI.Codex_26.721.4979.0_x64__2p2nqsd0c76g0\\app"
    });
    const service = new LaunchService({
      nativeRuntime: { request } as never,
      runPowerShell: vi.fn(),
      loadApps: () => storedApps,
      saveApps,
      getApp: (id) => storedApps.find((entry) => entry.id === id),
      getManagedRunningStatus: async () => [],
      getProcessSnapshots: async () => [],
      buildRuntimeSnapshot: async () => ({ apps: storedApps, metrics: [], processes: [] }),
      runtimeAssociatedPids: new Map(),
      resolveWindowsStoreApp
    });

    await expect(service.launch("chatgpt")).resolves.toMatchObject({ status: "launched" });
    expect(resolveWindowsStoreApp).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith("launch", {
      executablePath: "",
      appUserModelId: "OpenAI.Codex_2p2nqsd0c76g0!App",
      argumentLine: ""
    });
    expect(storedApps).toHaveLength(1);
    expect(storedApps[0]).toMatchObject({
      id: "chatgpt",
      name: "我的 ChatGPT",
      groupId: "games",
      appUserModelId: "OpenAI.Codex_2p2nqsd0c76g0!App",
      executablePath: "Z:\\WindowsApps\\OpenAI.Codex_26.721.4979.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe"
    });
  });

  it("does not ask for a replacement EXE when the Store registration is gone", async () => {
    const stale = {
      ...app,
      executablePath: "Z:\\WindowsApps\\Missing.App_1.0.0.0_x64__publisher\\Missing.exe",
      processName: "Missing"
    };
    const service = new LaunchService({
      nativeRuntime: { request: vi.fn() } as never,
      runPowerShell: vi.fn(),
      loadApps: () => [stale],
      saveApps: (apps) => apps,
      getApp: () => stale,
      getManagedRunningStatus: async () => [],
      getProcessSnapshots: async () => [],
      buildRuntimeSnapshot: async () => ({ apps: [stale], metrics: [], processes: [] }),
      runtimeAssociatedPids: new Map(),
      resolveWindowsStoreApp: vi.fn().mockResolvedValue(undefined)
    });

    await expect(service.launch(stale.id)).resolves.toMatchObject({
      status: "failed",
      errorCode: 1168,
      message: "未找到对应的 Windows 商店应用注册，请确认应用仍已安装。"
    });
  });

  it("keeps native Store activation failures out of the ordinary missing-path flow", async () => {
    const storeApp = {
      ...app,
      appUserModelId: "OpenAI.Codex_2p2nqsd0c76g0!App",
      executablePath: ""
    };
    const service = new LaunchService({
      nativeRuntime: { request: vi.fn().mockResolvedValue({ ok: false, errorCode: 2 }) } as never,
      runPowerShell: vi.fn(),
      loadApps: () => [storeApp],
      saveApps: (apps) => apps,
      getApp: () => storeApp,
      getManagedRunningStatus: async () => [],
      getProcessSnapshots: async () => [],
      buildRuntimeSnapshot: async () => ({ apps: [storeApp], metrics: [], processes: [] }),
      runtimeAssociatedPids: new Map()
    });

    await expect(service.launch(storeApp.id)).resolves.toMatchObject({
      status: "failed",
      errorCode: 1168,
      message: "Windows 商店应用启动失败，请确认该应用已正确安装。"
    });
  });
});
