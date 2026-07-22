import { describe, expect, it, vi } from "vitest";
import type { AppEntry, AppGroup } from "../shared/types.js";
import { addDroppedExecutablesToApps } from "./dropped-apps.js";

const groups: AppGroup[] = [
  { id: "games", name: "游戏", icon: "gamepad", isSystem: false, order: 1 },
  { id: "office", name: "办公", icon: "briefcase", isSystem: false, order: 2 }
];

const existingApp: AppEntry = {
  id: "existing",
  name: "Steam",
  category: "游戏",
  groupId: "games",
  executablePath: "C:\\Apps\\Steam\\steam.exe",
  processName: "steam",
  workingDirectory: "C:\\Apps\\Steam",
  accent: "#2f66e8"
};

describe("dropped app importing", () => {
  it("adds valid exe files to the target group", async () => {
    const cacheAppIcon = vi.fn(async (entry: AppEntry) => ({ ...entry, iconDataUrl: "data:image/png;base64,icon" }));

    const result = await addDroppedExecutablesToApps({
      filePaths: ["C:\\Tools\\Codex.exe"],
      groupId: "office",
      groups,
      apps: [],
      exists: () => true,
      createId: () => "new-app",
      cacheAppIcon
    });

    expect(result.addedAppIds).toEqual(["new-app"]);
    expect(result.skippedPaths).toEqual([]);
    expect(result.apps[0]).toMatchObject({
      id: "new-app",
      name: "Codex",
      category: "办公",
      groupId: "office",
      executablePath: "C:\\Tools\\Codex.exe",
      processName: "Codex",
      workingDirectory: "C:\\Tools"
    });
    expect(cacheAppIcon).toHaveBeenCalledOnce();
  });

  it("resolves a dropped Windows shortcut and preserves its launch metadata", async () => {
    const result = await addDroppedExecutablesToApps({
      filePaths: ["C:\\Users\\Xbfe\\Desktop\\Typora.lnk"],
      groupId: "office",
      groups,
      apps: [],
      exists: (filePath) => filePath === "D:\\Apps\\Typora\\Typora.exe",
      createId: () => "typora",
      cacheAppIcon: async (entry) => entry,
      resolveDroppedPath: async () => ({
        executablePath: "D:\\Apps\\Typora\\Typora.exe",
        name: "Typora Markdown",
        workingDirectory: "D:\\Apps\\Typora",
        launchArgs: "--safe-mode"
      })
    });

    expect(result.addedAppIds).toEqual(["typora"]);
    expect(result.skippedPaths).toEqual([]);
    expect(result.apps[0]).toMatchObject({
      name: "Typora Markdown",
      executablePath: "D:\\Apps\\Typora\\Typora.exe",
      processName: "Typora",
      workingDirectory: "D:\\Apps\\Typora",
      launchArgs: "--safe-mode"
    });
  });

  it("skips duplicate, non-exe, empty, and missing files", async () => {
    const result = await addDroppedExecutablesToApps({
      filePaths: [
        "C:\\Apps\\Steam\\steam.exe",
        "C:\\Docs\\readme.txt",
        "",
        "C:\\Missing\\Ghost.exe",
        "C:\\Games\\Game.exe"
      ],
      groupId: "games",
      groups,
      apps: [existingApp],
      exists: (filePath) => !filePath.includes("Missing"),
      createId: () => "game",
      cacheAppIcon: async (entry) => entry
    });

    expect(result.addedAppIds).toEqual(["game"]);
    expect(result.skippedPaths).toEqual([
      "C:\\Apps\\Steam\\steam.exe",
      "C:\\Docs\\readme.txt",
      "",
      "C:\\Missing\\Ghost.exe"
    ]);
    expect(result.apps).toHaveLength(2);
  });

  it("falls back to the first app group when the target group is not an app group", async () => {
    const result = await addDroppedExecutablesToApps({
      filePaths: ["C:\\Tools\\Demo.exe"],
      groupId: "processes",
      groups,
      apps: [],
      exists: () => true,
      createId: () => "demo",
      cacheAppIcon: async (entry) => entry
    });

    expect(result.apps[0]).toMatchObject({ groupId: "games", category: "游戏" });
  });
});
