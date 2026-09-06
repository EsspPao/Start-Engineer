import { describe, expect, it, vi } from "vitest";
import type { AppEntry } from "../shared/types.js";
import type { NativeRuntimeHost } from "./native-helper.js";
import { RuntimeService } from "./runtime-service.js";

describe("RuntimeService stale association protection", () => {
  it("removes stale associations and never sends an unrelated Steam PID to termination", async () => {
    const app: AppEntry = { id: "akari", name: "Akari", groupId: "games", category: "games", executablePath: "E:\\Game\\Akari\\LeagueAkari.exe", processName: "LeagueAkari", accent: "#fff", launchedPid: 24856 };
    const associations = new Map([[app.id, new Set([24856])]]);
    const runTaskkill = vi.fn();
    const terminateElevatedPids = vi.fn();
    const service = new RuntimeService({
      nativeRuntime: { request: vi.fn(async () => [{ pid: 24856, name: "steamservice", path: "" }]) } as unknown as NativeRuntimeHost,
      runPowerShell: vi.fn(), loadApps: () => [app], saveApps: vi.fn(),
      loadAppsWithRuntimeAssociations: () => [{ ...app, associatedPids: [...(associations.get(app.id) ?? [])] }],
      runtimeAssociatedPids: associations, resolveIcon: async () => "", getTerminationBlockReason: () => undefined,
      runTaskkill, terminateElevatedPids, processorCount: 1
    });
    const snapshot = await service.getSnapshot("managed", true);
    expect(snapshot.metrics[0]).toMatchObject({ isRunning: false, matchedPids: [], associatedPids: [] });
    expect(associations.has(app.id)).toBe(false);
    const result = await service.terminateManagedApps([app]);
    expect(result.results).toEqual([]);
    expect(runTaskkill).not.toHaveBeenCalled();
    expect(terminateElevatedPids).not.toHaveBeenCalled();
  });
});
