import { describe, expect, it } from "vitest";
import { buildInternalSearchResults } from "./search.js";

describe("internal search results", () => {
  it("returns app and process results without matching executable paths", () => {
    const metrics = (appId: string, isRunning: boolean) => ({
      appId,
      isRunning,
      cpuPercent: 0,
      memoryBytes: 0,
      diskBytesPerSecond: 0,
      pids: isRunning ? [1] : [],
      matchedPids: isRunning ? [1] : [],
      associatedPids: [],
      matchedProcessNames: [],
      matchedPaths: []
    });
    const results = buildInternalSearchResults("wei", [
      { id: "weixin", name: "Weixin", processName: "Weixin.exe", groupId: "office", executablePath: "C:\\Apps\\Weixin.exe", metrics: metrics("weixin", true) },
      { id: "codex", name: "Codex", processName: "Codex.exe", groupId: "office", executablePath: "C:\\WindowsApps\\Codex.exe", metrics: metrics("codex", false) }
    ], [
      { name: "Weixin.exe", pid: 1, pids: [1], processCount: 1, cpuPercent: 0, memoryBytes: 0, diskBytesPerSecond: 0, exePaths: [], isManagedApp: true, canTerminate: true },
      { name: "Codex.exe", pid: 2, pids: [2], processCount: 1, cpuPercent: 0, memoryBytes: 0, diskBytesPerSecond: 0, exePaths: [], isManagedApp: true, canTerminate: true }
    ]);

    expect(results.map((result) => `${result.kind}:${result.name}`)).toEqual(["app:Weixin", "process:Weixin.exe"]);
  });
});
