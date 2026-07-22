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
