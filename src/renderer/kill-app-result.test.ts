import { describe, expect, it } from "vitest";
import type { AppEntry, AppMetrics, KillAppResult } from "../shared/types";
import { applyKillAppResult, killAppResultHasMetrics, killAppResultHasRunningStatuses } from "./kill-app-result";

const app = (id: string): AppEntry => ({
  id,
  name: id,
  category: "Tools",
  groupId: "tools",
  executablePath: `C:\\Apps\\${id}.exe`,
  processName: id,
  accent: "#000"
});

const metric = (appId: string, isRunning: boolean): AppMetrics => ({
  appId,
  isRunning,
  cpuPercent: 0,
  memoryBytes: 0,
  diskBytesPerSecond: 0,
  pids: isRunning ? [10] : [],
  matchedPids: [],
  associatedPids: [],
  matchedProcessNames: [],
  matchedPaths: []
});

describe("kill app result", () => {
  it("uses returned metrics so the renderer can skip a second forced refresh", () => {
    const result: KillAppResult = {
      apps: [app("steam")],
      metrics: [metric("steam", false)]
    };

    expect(killAppResultHasMetrics(result)).toBe(true);
    expect(applyKillAppResult(result)).toEqual({
      apps: [app("steam")],
      metrics: [metric("steam", false)]
    });
  });

  it("keeps compatibility with the old array return shape", () => {
    const result = [app("steam")];

    expect(killAppResultHasMetrics(result)).toBe(false);
    expect(applyKillAppResult(result)).toEqual({ apps: result });
  });

  it("uses lightweight running statuses without waiting for a full metrics scan", () => {
    const result: KillAppResult = {
      apps: [app("steam")],
      runningStatuses: [{ appId: "steam", isRunning: false, pids: [] }]
    };

    expect(killAppResultHasMetrics(result)).toBe(false);
    expect(killAppResultHasRunningStatuses(result)).toBe(true);
    expect(applyKillAppResult(result)).toEqual(result);
  });
});
