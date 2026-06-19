import { describe, expect, it } from "vitest";
import { buildInternalSearchResults } from "./search.js";

describe("internal search results", () => {
  it("returns app and process results without matching executable paths", () => {
    const results = buildInternalSearchResults("wei", [
      { id: "weixin", name: "Weixin", processName: "Weixin.exe", groupId: "office", executablePath: "C:\\Apps\\Weixin.exe", metrics: { appId: "weixin", isRunning: true, cpuPercent: 0, memoryBytes: 0, diskBytesPerSecond: 0, pids: [1] } },
      { id: "codex", name: "Codex", processName: "Codex.exe", groupId: "office", executablePath: "C:\\WindowsApps\\Codex.exe", metrics: { appId: "codex", isRunning: false, cpuPercent: 0, memoryBytes: 0, diskBytesPerSecond: 0, pids: [] } }
    ], [
      { name: "Weixin.exe", pid: 1, pids: [1], processCount: 1, cpuPercent: 0, memoryBytes: 0, diskBytesPerSecond: 0, exePaths: [], isManagedApp: true, canTerminate: true },
      { name: "Codex.exe", pid: 2, pids: [2], processCount: 1, cpuPercent: 0, memoryBytes: 0, diskBytesPerSecond: 0, exePaths: [], isManagedApp: true, canTerminate: true }
    ]);

    expect(results.map((result) => `${result.kind}:${result.name}`)).toEqual(["app:Weixin", "process:Weixin.exe"]);
  });
});
