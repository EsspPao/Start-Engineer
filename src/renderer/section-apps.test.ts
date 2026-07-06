import { describe, expect, it } from "vitest";
import type { AppEntry, AppGroup, AppMetrics } from "../shared/types";
import { allAppsSelection, appSectionApps, decorateAllAppsLaunchSelection, mergeAllAppsOrder, navigationSectionIds } from "./section-apps";

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

  it("decorates all apps launch selection without changing the source app selection", () => {
    const source = [app("steam", "games"), { ...app("notion", "office"), launchSelected: true }];
    const decorated = decorateAllAppsLaunchSelection(source, ["steam"]);
    expect(decorated.map((item) => [item.id, item.launchSelected])).toEqual([["steam", true], ["notion", false]]);
    expect(source.map((item) => [item.id, item.launchSelected])).toEqual([["steam", undefined], ["notion", true]]);
  });

  it("merges all apps reorder changes without depending on source groups", () => {
    expect(mergeAllAppsOrder(["steam", "notion"], ["wechat", "steam", "steam", "ghost"], ["steam", "notion", "wechat"])).toEqual(["wechat", "steam", "notion"]);
  });

  it("updates all apps selection independently", () => {
    expect(allAppsSelection(["steam"], "notion", true)).toEqual(["steam", "notion"]);
    expect(allAppsSelection(["steam", "steam", "notion"], "steam", false)).toEqual(["notion"]);
  });

  it("returns only apps from a normal user group", () => {
    expect(appSectionApps("games", [app("steam", "games"), app("notion", "office")]).map((item) => item.id)).toEqual(["steam"]);
  });
});
