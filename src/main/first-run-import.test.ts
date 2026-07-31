import { describe, expect, it } from "vitest";
import type { AppEntry, AppGroup, DiscoveredAppCandidate } from "../shared/types";
import { curateFirstRunImportCandidates } from "./first-run-import";

const groups: AppGroup[] = [
  { id: "games", name: "游戏", icon: "compass", isSystem: false, order: 0 },
  { id: "office", name: "办公", icon: "briefcase", isSystem: false, order: 1 },
  { id: "tools", name: "工具", icon: "wrench", isSystem: false, order: 2 },
  { id: "ai", name: "AI", icon: "grid", isSystem: false, order: 3 }
];

describe("first-run import curation", () => {
  it("keeps the previous configuration group mapping and removes duplicate executables", () => {
    const templateApps: AppEntry[] = [
      app("steam-template", "Steam", "steam", "D:\\Steam\\steam.exe", "games", "游戏"),
      { ...app("notion-template", "Notion", "Notion", "D:\\Apps\\Notion.exe", "office", "办公"), iconCachePath: "D:\\icons\\notion.png", iconDataUrl: "data:image/png;base64,notion", iconCacheVersion: 3, iconPixelSize: 128 },
      app("notion-copy", "Notion", "Notion", "D:\\Apps\\Notion.exe", "tools", "工具")
    ];
    const result = curateFirstRunImportCandidates({
      candidates: [],
      groups,
      templateApps,
      createId: () => "candidate",
      pathExists: () => true
    });

    expect(result.map((candidate) => [candidate.name, candidate.groupId])).toEqual([
      ["Steam", "games"],
      ["Notion", "office"]
    ]);
    expect(result[1]).toMatchObject({
      iconCachePath: "D:\\icons\\notion.png",
      iconDataUrl: "data:image/png;base64,notion",
      iconCacheVersion: 3,
      iconPixelSize: 128,
      isAvailable: true
    });
  });

  it("marks missing template apps unavailable for automatic import", () => {
    const templateApps: AppEntry[] = [
      app("missing-desktop", "Missing Desktop", "MissingDesktop", "D:\\Missing\\Desktop.exe", "office", "办公"),
      {
        ...app("missing-store", "Missing Store", "MissingStore", "C:\\Program Files\\WindowsApps\\Missing.Store\\App.exe", "ai", "AI"),
        appUserModelId: "Missing.Store_123!App"
      }
    ];
    const result = curateFirstRunImportCandidates({
      candidates: [],
      groups,
      templateApps,
      createId: () => "candidate",
      pathExists: () => false
    });

    expect(result.map((candidate) => [candidate.name, candidate.groupId, candidate.isAvailable])).toEqual([
      ["Missing Desktop", "office", false],
      ["Missing Store", "ai", false]
    ]);
  });

  it("uses the current Store path when the template path is stale but the AUMID still matches", () => {
    const appUserModelId = "OpenAI.Codex_2p2nqsd0c76g0!App";
    const templateApps: AppEntry[] = [{
      ...app(
        "chatgpt-template",
        "ChatGPT",
        "ChatGPT",
        "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.715.7063.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe",
        "ai",
        "AI"
      ),
      appUserModelId
    }];
    const discovered: DiscoveredAppCandidate[] = [{
      id: "chatgpt-current",
      name: "ChatGPT",
      processName: "ChatGPT",
      executablePath: "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.721.4979.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe",
      workingDirectory: "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.721.4979.0_x64__2p2nqsd0c76g0\\app",
      appUserModelId,
      groupId: "ai",
      category: "AI",
      source: "windows-store"
    }];
    const result = curateFirstRunImportCandidates({
      candidates: discovered,
      groups,
      templateApps,
      createId: () => "unused",
      pathExists: () => false
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "chatgpt-current",
      executablePath: discovered[0].executablePath,
      workingDirectory: discovered[0].workingDirectory,
      appUserModelId,
      isAvailable: true
    });
  });

  it("shows only recommended apps and limits every group", () => {
    const discovered: DiscoveredAppCandidate[] = [
      candidate("steam", "Steam", "steam", "games"),
      candidate("wallpaper", "wallpaper64", "wallpaper64", "tools"),
      candidate("chatgpt", "ChatGPT", "ChatGPT", "tools"),
      candidate("random", "Random Utility", "random", "tools")
    ];
    const result = curateFirstRunImportCandidates({
      candidates: discovered,
      groups,
      createId: () => "unused",
      pathExists: () => true
    });

    expect(result.map((item) => [item.id, item.groupId])).toEqual([
      ["steam", "games"],
      ["wallpaper", "tools"],
      ["chatgpt", "ai"]
    ]);
    expect(result.every((item) => item.isAvailable)).toBe(true);
  });
});

function app(id: string, name: string, processName: string, executablePath: string, groupId: string, category: string): AppEntry {
  return { id, name, processName, executablePath, groupId, category, accent: "#2f66e8" };
}

function candidate(id: string, name: string, processName: string, groupId: string): DiscoveredAppCandidate {
  return {
    id,
    name,
    processName,
    executablePath: `D:\\Apps\\${processName}.exe`,
    groupId,
    category: groups.find((group) => group.id === groupId)?.name ?? "工具",
    source: "start-menu"
  };
}
