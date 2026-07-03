import { describe, expect, it } from "vitest";
import type { AppMetrics, AppRunningStatus } from "../shared/types";
import { applyRunningStatusToMetrics } from "./running-status";

const metric = (appId: string, isRunning: boolean): AppMetrics => ({
  appId,
  isRunning,
  cpuPercent: isRunning ? 10 : 0,
  memoryBytes: isRunning ? 100 : 0,
  diskBytesPerSecond: isRunning ? 5 : 0,
  pids: isRunning ? [10] : [],
  matchedPids: isRunning ? [10] : [],
  associatedPids: [],
  matchedProcessNames: [],
  matchedPaths: []
});

describe("running status merge", () => {
  it("turns off stale running metrics when the fast probe no longer sees the app", () => {
    const statuses: AppRunningStatus[] = [{ appId: "steam", isRunning: false, pids: [] }];

    expect(applyRunningStatusToMetrics([metric("steam", true)], statuses)).toEqual([
      { ...metric("steam", false), cpuPercent: 0, memoryBytes: 0, diskBytesPerSecond: 0 }
    ]);
  });

  it("turns on a previously stopped app when the fast probe sees it", () => {
    const statuses: AppRunningStatus[] = [{ appId: "steam", isRunning: true, pids: [88] }];

    expect(applyRunningStatusToMetrics([metric("steam", false)], statuses)).toEqual([
      { ...metric("steam", false), isRunning: true, pids: [88], matchedPids: [88] }
    ]);
  });
});
