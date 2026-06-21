import { describe, expect, it } from "vitest";
import { buildDiscoveredApps } from "./app-discovery.js";

describe("app discovery", () => {
  it("deduplicates shortcuts by executable path and assigns a sensible group", () => {
    const apps = buildDiscoveredApps([
      { name: "Steam", targetPath: "C:\\Program Files (x86)\\Steam\\steam.exe", source: "start-menu" },
      { name: "Steam", targetPath: "C:\\Program Files (x86)\\Steam\\steam.exe", source: "desktop" },
      { name: "微信", targetPath: "D:\\Apps\\WeChat\\WeChat.exe", source: "desktop" },
      { name: "Readme", targetPath: "D:\\Docs\\readme.txt", source: "desktop" },
    ], [
      { id: "games", name: "游戏", icon: "gamepad", isSystem: false, order: 0 },
      { id: "office", name: "办公", icon: "briefcase", isSystem: false, order: 1 },
      { id: "tools", name: "工具", icon: "wrench", isSystem: false, order: 2 },
    ], () => "fixed-id");

    expect(apps).toHaveLength(2);
    expect(apps.map((app) => app.name)).toEqual(["Steam", "微信"]);
    expect(apps[0]).toMatchObject({ groupId: "games", category: "游戏", processName: "steam" });
    expect(apps[1]).toMatchObject({ groupId: "office", category: "办公", processName: "WeChat" });
  });
});
