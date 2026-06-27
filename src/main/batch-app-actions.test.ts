import { describe, expect, it, vi } from "vitest";
import type { AppEntry, AppMetrics, LaunchAppResult } from "../shared/types.js";
import { collectGroupTermination, launchAppsSequentially } from "./batch-app-actions.js";

const app = (id: string, selected = true): AppEntry => ({
  id, name: id.toUpperCase(), category: "Tools", groupId: "tools", executablePath: `C:\\${id}.exe`,
  processName: id, accent: "#000", launchSelected: selected
});

const makeMetrics = (appId: string, pids: number[]): AppMetrics => ({
  appId,
  isRunning: pids.length > 0,
  cpuPercent: 0,
  memoryBytes: 0,
  diskBytesPerSecond: 0,
  pids,
  matchedPids: pids,
  associatedPids: [],
  matchedProcessNames: [],
  matchedPaths: []
});

describe("batch app actions", () => {
  it("launches selected apps sequentially and continues after failures", async () => {
    const calls: string[] = [];
    const launch = vi.fn(async (entry: AppEntry): Promise<LaunchAppResult> => {
      calls.push(entry.id);
      if (entry.id === "b") return { status: "failed", apps: [], message: "broken" };
      return { status: entry.id === "c" ? "alreadyRunning" : "launched", apps: [] };
    });

    const results = await launchAppsSequentially([app("a"), app("skip", false), app("b"), app("c")], launch);

    expect(calls).toEqual(["a", "b", "c"]);
    expect(results.map((item) => item.status)).toEqual(["launched", "failed", "alreadyRunning"]);
    expect(results[1]).toMatchObject({ appId: "b", message: "broken" });
  });

  it("merges unique running PIDs for every app in the group", () => {
    const metrics: AppMetrics[] = [
      makeMetrics("a", [12, 10]),
      makeMetrics("b", [12, 14]),
      makeMetrics("c", [])
    ];

    expect(collectGroupTermination([app("a"), app("b"), app("c")], metrics)).toEqual({
      apps: [app("a"), app("b")],
      pids: [10, 12, 14]
    });
  });
});
