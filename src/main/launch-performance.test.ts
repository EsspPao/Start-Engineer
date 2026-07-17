import { describe, expect, it, vi } from "vitest";
import type { AppEntry } from "../shared/types";
import { LaunchService } from "./launch-service";

const app: AppEntry = {
  id: "demo", name: "Demo", category: "工具", groupId: "tools",
  executablePath: process.execPath, processName: "node", accent: "#fff"
};

describe("fast application launch", () => {
  it("checks the lightweight running status before invoking the native launcher", async () => {
    const request = vi.fn(async () => ({ ok: true }));
    const service = new LaunchService({
      nativeRuntime: { request } as never,
      runPowerShell: vi.fn(),
      loadApps: () => [app],
      saveApps: (apps) => apps,
      getApp: () => app,
      getManagedRunningStatus: async () => [{ appId: app.id, isRunning: true, pids: [42] }],
      getProcessSnapshots: async () => [],
      buildRuntimeSnapshot: async () => ({ apps: [app], metrics: [], processes: [] }),
      runtimeAssociatedPids: new Map()
    });

    await expect(service.launch(app.id)).resolves.toMatchObject({ status: "alreadyRunning" });
    expect(request).not.toHaveBeenCalled();
  });

  it("returns after native launch without waiting for child association when no pid is reported", async () => {
    const request = vi.fn(async () => ({ ok: true }));
    const saveApps = vi.fn((apps: AppEntry[]) => apps);
    const service = new LaunchService({
      nativeRuntime: { request } as never,
      runPowerShell: vi.fn(),
      loadApps: () => [app],
      saveApps,
      getApp: () => app,
      getManagedRunningStatus: async () => [{ appId: app.id, isRunning: false, pids: [] }],
      getProcessSnapshots: async () => [],
      buildRuntimeSnapshot: async () => ({ apps: [app], metrics: [], processes: [] }),
      runtimeAssociatedPids: new Map()
    });

    await expect(service.launch(app.id)).resolves.toMatchObject({ status: "launched" });
    expect(request).toHaveBeenCalledWith("launch", expect.objectContaining({ executablePath: process.execPath }));
    expect(saveApps).toHaveBeenCalledOnce();
  });
});
