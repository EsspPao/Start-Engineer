import { describe, expect, it } from "vitest";
import type { AppGroup } from "../shared/types";
import { firstAppGroupId, resolveLoadedSection } from "./navigation";

describe("navigation", () => {
  it("defaults to the first user app group", () => {
    const groups: AppGroup[] = [
      { id: "games", name: "游戏", icon: "gamepad", isSystem: false, order: 0 },
      { id: "office", name: "办公", icon: "briefcase", isSystem: false, order: 1 },
      { id: "settings", name: "设置", icon: "settings", isSystem: true, order: 999 },
    ];

    expect(firstAppGroupId(groups)).toBe("games");
  });

  it("migrates the removed process page to the first application group", () => {
    const groups: AppGroup[] = [
      { id: "games", name: "游戏", icon: "gamepad", isSystem: false, order: 0 },
      { id: "office", name: "办公", icon: "briefcase", isSystem: false, order: 1 },
    ];

    expect(resolveLoadedSection("processes", groups)).toBe("games");
  });

  it("keeps the all apps aggregate page when it is the active section", () => {
    const groups: AppGroup[] = [
      { id: "games", name: "游戏", icon: "gamepad", isSystem: false, order: 0 },
      { id: "settings", name: "设置", icon: "settings", isSystem: true, order: 999 },
    ];

    expect(resolveLoadedSection("all-apps", groups)).toBe("all-apps");
  });

  it("falls back to the first app group when the active section no longer exists", () => {
    const groups: AppGroup[] = [
      { id: "games", name: "游戏", icon: "gamepad", isSystem: false, order: 0 },
    ];

    expect(resolveLoadedSection("removed-group", groups)).toBe("games");
  });
});
