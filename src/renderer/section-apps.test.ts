import { describe, expect, it } from "vitest";
import type { AppEntry, AppGroup, AppMetrics } from "../shared/types";
import { appSectionApps, mergeAllAppsOrder, navigationSectionIds } from "./section-apps";

type RuntimeApp = AppEntry & { metrics: AppMetrics };

const metrics = (appId: string, isRunning: boolean): AppMetrics => ({
  appId,
  isRunning,
  cpuPercent: 0,
  memoryBytes: 0,
  diskBytesPerSecond: 0,
  pids: [],
  matchedPids: [],
  associatedPids: [],
  matchedProcessNames: [],
  matchedPaths: []
});

const app = (id: string, groupId: string, isRunning = false): RuntimeApp => ({
  id,
  name: id,
  category: "tools",
  groupId,
  executablePath: `C:\\Apps\\${id}.exe`,
  processName: `${id}.exe`,
  accent: "#2563eb",
  metrics: metrics(id, isRunning)
});

const groups: AppGroup[] = [
  { id: "games", name: "游戏", icon: "gamepad", isSystem: false, order: 0 },
  { id: "office", name: "办公", icon: "briefcase", isSystem: false, order: 1 }
];

describe("section apps", () => {
  it("places the all apps system section below processes and above user groups", () => {
    expect(navigationSectionIds(groups)).toEqual(["processes", "all-apps", "games", "office", "settings"]);
  });

  it("returns every managed app for the all apps aggregate section", () => {
    expect(appSectionApps("all-apps", [app("steam", "games"), app("notion", "office")]).map((item) => item.id)).toEqual(["steam", "notion"]);
  });

  it("applies an independent display order for the all apps section", () => {
    expect(appSectionApps("all-apps", [app("steam", "games"), app("notion", "office"), app("wechat", "office")], ["wechat", "steam"]).map((item) => item.id)).toEqual(["wechat", "steam", "notion"]);
  });

  it("deduplicates apps with the same executable path in the all apps section", () => {
    const gamesSteam = app("steam-games", "games");
    const officeSteam = { ...app("steam-office", "office"), executablePath: gamesSteam.executablePath };
    expect(appSectionApps("all-apps", [gamesSteam, officeSteam, app("notion", "office")], ["steam-office"]).map((item) => item.id)).toEqual(["steam-office", "notion"]);
  });

  it("deduplicates a Windows Store app by stable AUMID after its package path changes", () => {
    const oldChatGpt = { ...app("chatgpt-old", "office"), appUserModelId: "OpenAI.Codex_2p2nqsd0c76g0!App", executablePath: "C:\\Program Files\\WindowsApps\\OpenAI.Codex_1.0.0.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe" };
    const newChatGpt = { ...app("chatgpt-new", "office"), appUserModelId: "openai.codex_2p2nqsd0c76g0!app", executablePath: "C:\\Program Files\\WindowsApps\\OpenAI.Codex_2.0.0.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe" };
    expect(appSectionApps("all-apps", [oldChatGpt, newChatGpt], ["chatgpt-new"]).map((item) => item.id)).toEqual(["chatgpt-new"]);
  });

  it("merges all apps reorder changes without depending on source groups", () => {
    expect(mergeAllAppsOrder(["steam", "notion"], ["wechat", "steam", "steam", "ghost"], ["steam", "notion", "wechat"])).toEqual(["wechat", "steam", "notion"]);
  });

  it("returns only apps from a normal user group", () => {
    expect(appSectionApps("games", [app("steam", "games"), app("notion", "office")]).map((item) => item.id)).toEqual(["steam"]);
  });
});
