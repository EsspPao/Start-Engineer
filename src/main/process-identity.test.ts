import { describe, expect, it } from "vitest";
import type { AppEntry } from "../shared/types.js";
import { buildAppIndex, findManagedAppMatches } from "./runtime-monitor.js";
import { buildManagedRunningStatus } from "./managed-running-status.js";
import { isAssociatedProcess } from "./process-identity.js";

const app: AppEntry = { id: "akari", name: "LeagueAkari", groupId: "games", category: "games", executablePath: "E:\\Game\\Akari\\LeagueAkari.exe", processName: "LeagueAkari", accent: "#fff", associatedPids: [24856], launchedPid: 24856 };
const snapshot = { pid: 24856, name: "steamservice", path: "", cpuSeconds: 0, memoryBytes: 0, readBytes: 0, writeBytes: 0 };

describe("associated process identity", () => {
  it("rejects Akari's stale PID when it belongs to Steam, for monitoring and termination", () => {
    expect(findManagedAppMatches(snapshot, buildAppIndex([app]))).toEqual([]);
    expect(buildManagedRunningStatus([app], [snapshot])).toEqual([{ appId: "akari", isRunning: false, pids: [] }]);
  });

  it("keeps verified child processes eligible for monitoring and closing", () => {
    const child = { ...snapshot, name: "child", path: "E:\\Game\\Akari\\bin\\child.exe" };
    expect(findManagedAppMatches(child, buildAppIndex([app]))[0].reasons.has("associatedPid")).toBe(true);
    expect(buildManagedRunningStatus([app], [child])[0].pids).toEqual([24856]);
  });

  it("does not trust a pathless child, sibling directory, or drive-wide directory", () => {
    expect(isAssociatedProcess(app, { name: "child" })).toBe(false);
    expect(isAssociatedProcess(app, { name: "child", path: "E:\\Game\\Akari-other\\child.exe" })).toBe(false);
    expect(isAssociatedProcess({ ...app, executablePath: "E:\\LeagueAkari.exe" }, { name: "child", path: "E:\\Other\\child.exe" })).toBe(false);
  });

  it("retains name matching when protected-process paths are unavailable", () => {
    expect(isAssociatedProcess(app, { name: "LEAGUEAKARI.EXE", path: "" })).toBe(true);
  });
});
