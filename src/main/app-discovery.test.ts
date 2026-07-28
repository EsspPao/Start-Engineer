import { describe, expect, it } from "vitest";
import { buildDiscoveredApps, buildWindowsStoreAppCandidates, searchDiscoveredAppCandidates } from "./app-discovery.js";

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

  it("searches addable app candidates with app-like ranking and existing-app state", () => {
    const groups = [
      { id: "office", name: "办公", icon: "briefcase", isSystem: false, order: 0 },
      { id: "tools", name: "工具", icon: "wrench", isSystem: false, order: 1 },
    ];
    const candidates = buildDiscoveredApps([
      { name: "Notion Update Helper", targetPath: "C:\\Program Files\\Notion\\Update.exe", source: "start-menu" },
      { name: "Notion", targetPath: "C:\\Program Files\\Notion\\Notion.exe", source: "start-menu", shortcutPath: "C:\\Start\\Notion.lnk", workingDirectory: "C:\\Program Files\\Notion", launchArgs: "--profile default" },
      { name: "Notion", targetPath: "C:\\Program Files\\Notion\\Notion.exe", source: "desktop" },
      { name: "Notion Calendar", targetPath: "C:\\Users\\Xbfe\\AppData\\Local\\Programs\\Notion Calendar\\Notion Calendar.exe", source: "everything" },
      { name: "Notion Uninstall", targetPath: "C:\\Program Files\\Notion\\Uninstall.exe", source: "everything" },
      { name: "Notion Cache Tool", targetPath: "C:\\Users\\Xbfe\\AppData\\Local\\Temp\\NotionCache.exe", source: "everything" },
    ], groups, () => "candidate-id");

    const results = searchDiscoveredAppCandidates(candidates, "notion", [{
      id: "managed",
      name: "Notion",
      category: "办公",
      groupId: "office",
      executablePath: "C:\\Program Files\\Notion\\Notion.exe",
      processName: "Notion",
      accent: "#2f66e8"
    }]);

    expect(results.map((item) => item.name)).toEqual(["Notion", "Notion Calendar"]);
    expect(results[0]).toMatchObject({ source: "start-menu", alreadyAdded: true, existingAppId: "managed", existingGroupId: "office", launchArgs: "--profile default" });
    expect(results[1]).toMatchObject({ source: "everything", alreadyAdded: false });
  });

  it("keeps app-like shortcuts ahead of noisy Everything executables", () => {
    const groups = [{ id: "games", name: "游戏", icon: "gamepad", isSystem: false, order: 0 }];
    const candidates = buildDiscoveredApps([
      { name: "Steam Helper", targetPath: "C:\\Program Files (x86)\\Steam\\steamwebhelper.exe", source: "everything" },
      { name: "Steam", targetPath: "C:\\Program Files (x86)\\Steam\\steam.exe", source: "everything" },
      { name: "Steam", targetPath: "C:\\Program Files (x86)\\Steam\\steam.exe", source: "start-menu", shortcutPath: "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Steam.lnk" },
      { name: "Steam Uninstall", targetPath: "C:\\Program Files (x86)\\Steam\\uninstall.exe", source: "everything" },
      { name: "Steam Crashpad", targetPath: "C:\\Program Files (x86)\\Steam\\crashpad_handler.exe", source: "everything" },
    ], groups, () => `id-${Math.random()}`);

    const results = searchDiscoveredAppCandidates(candidates, "steam", []);

    expect(results[0]).toMatchObject({ name: "Steam", source: "start-menu", executablePath: "C:\\Program Files (x86)\\Steam\\steam.exe" });
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeGreaterThan(0);
    expect(results[0].rank).toBeLessThan(50);
  });

  it("prefers desktop shortcuts over duplicate Everything executables", () => {
    const groups = [{ id: "games", name: "游戏", icon: "gamepad", isSystem: false, order: 0 }];
    const candidates = buildDiscoveredApps([
      { name: "WeGame", targetPath: "D:\\Apps\\WeGame\\wegame.exe", source: "everything" },
      { name: "WeGame", targetPath: "D:\\Apps\\WeGame\\wegame.exe", source: "desktop", shortcutPath: "C:\\Users\\Xbfe\\Desktop\\WeGame.lnk" },
    ], groups, () => `id-${Math.random()}`);

    const results = searchDiscoveredAppCandidates(candidates, "wegame", []);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: "WeGame", source: "desktop" });
  });

  it("matches a Store candidate to the same legacy app after its versioned path changes", () => {
    const groups = [{ id: "tools", name: "工具", icon: "wrench", isSystem: false, order: 0 }];
    const [candidate] = buildWindowsStoreAppCandidates([{
      name: "ChatGPT",
      appUserModelId: "OpenAI.Codex_2p2nqsd0c76g0!App",
      packageFamilyName: "OpenAI.Codex_2p2nqsd0c76g0",
      executablePath: "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.721.4979.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe",
      processName: "ChatGPT",
      workingDirectory: "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.721.4979.0_x64__2p2nqsd0c76g0\\app"
    }], groups, () => "store-candidate");

    const results = searchDiscoveredAppCandidates([candidate], "chat", [{
      id: "existing-chatgpt",
      name: "我的 ChatGPT",
      category: "工具",
      groupId: "tools",
      executablePath: "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.715.7063.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe",
      processName: "ChatGPT",
      accent: "#2f66e8"
    }]);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      source: "windows-store",
      appUserModelId: "OpenAI.Codex_2p2nqsd0c76g0!App",
      alreadyAdded: true,
      existingAppId: "existing-chatgpt"
    });
  });
});
