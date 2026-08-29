import { describe, expect, it } from "vitest";
import { buildInternalSearchResults } from "./search.js";

describe("internal search results", () => {
  it("returns only managed app results without matching executable paths", () => {
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
    ]);

    expect(results.map((result) => `${result.kind}:${result.name}`)).toEqual(["app:Weixin"]);
  });
});
