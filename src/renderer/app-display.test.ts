import { describe, expect, it } from "vitest";
import type { AppEntry, AppMetrics } from "../shared/types";
import { sortAppsForDisplay } from "./app-display";

type RuntimeApp = AppEntry & { metrics: AppMetrics };

const metrics = (appId: string, isRunning: boolean): AppMetrics => ({
  appId,
  isRunning,
  cpuPercent: 0,
  memoryBytes: 0,
  diskBytesPerSecond: 0,
  pids: isRunning ? [42] : [],
  matchedPids: isRunning ? [42] : [],
  associatedPids: [],
  matchedProcessNames: [],
  matchedPaths: []
});

const makeApp = (id: string, isRunning: boolean): RuntimeApp => ({
  id,
  name: id,
  category: "tools",
  groupId: "tools",
  executablePath: `C:\\Apps\\${id}.exe`,
  processName: `${id}.exe`,
  accent: "#2563eb",
  metrics: metrics(id, isRunning),
});

describe("app display ordering", () => {
  it("moves running apps to the front while preserving order within each group", () => {
    const sorted = sortAppsForDisplay([
      makeApp("stopped-a", false),
      makeApp("running-a", true),
      makeApp("stopped-b", false),
      makeApp("running-b", true),
    ], true);

    expect(sorted.map((app) => app.id)).toEqual(["running-a", "running-b", "stopped-a", "stopped-b"]);
  });

  it("keeps the original order when running-first sorting is disabled", () => {
    const sorted = sortAppsForDisplay([
      makeApp("stopped-a", false),
      makeApp("running-a", true),
      makeApp("stopped-b", false),
    ], false);

    expect(sorted.map((app) => app.id)).toEqual(["stopped-a", "running-a", "stopped-b"]);
  });
});
