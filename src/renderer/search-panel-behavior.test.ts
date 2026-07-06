import { describe, expect, it, vi } from "vitest";
import { buildSearchableAppIdentityKey, getSearchResultOptionSelector, scrollSelectedSearchResultIntoView } from "./search-panel-behavior";

describe("search panel keyboard behavior", () => {
  it("scrolls the selected result into view", () => {
    const scrollIntoView = vi.fn();
    const querySelector = vi.fn(() => ({ scrollIntoView }));
    const root = { querySelector } as unknown as HTMLElement;

    scrollSelectedSearchResultIntoView(root, 12);

    expect(querySelector).toHaveBeenCalledWith(getSearchResultOptionSelector(12));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("keeps the search refresh key stable when only running metrics change", () => {
    const base = buildSearchableAppIdentityKey([{
      id: "codex",
      name: "Codex",
      groupId: "tools",
      processName: "Codex.exe",
      executablePath: "C:\\Program Files\\Codex\\Codex.exe",
      metrics: { isRunning: false, pid: 0, pids: [], processCount: 0, cpuPercent: 0, memoryBytes: 0, diskBytesPerSecond: 0 }
    }]);
    const refreshed = buildSearchableAppIdentityKey([{
      id: "codex",
      name: "Codex",
      groupId: "tools",
      processName: "Codex.exe",
      executablePath: "C:\\Program Files\\Codex\\Codex.exe",
      metrics: { isRunning: true, pid: 1234, pids: [1234], processCount: 1, cpuPercent: 2.4, memoryBytes: 1024, diskBytesPerSecond: 512 }
    }]);

    expect(refreshed).toBe(base);
  });

  it("changes the search refresh key when searchable app identity changes", () => {
    const base = buildSearchableAppIdentityKey([{
      id: "codex",
      name: "Codex",
      groupId: "tools",
      processName: "Codex.exe",
      executablePath: "C:\\Program Files\\Codex\\Codex.exe"
    }]);
    const renamed = buildSearchableAppIdentityKey([{
      id: "codex",
      name: "Codex CLI",
      groupId: "tools",
      processName: "Codex.exe",
      executablePath: "C:\\Program Files\\Codex\\Codex.exe"
    }]);

    expect(renamed).not.toBe(base);
  });
});
