import { describe, expect, it } from "vitest";
import type { AppGroup } from "../shared/types";
import { retainExpandedSettingsGroup, toggleExpandedSettingsGroup } from "./use-settings-group-drag";

const groups: AppGroup[] = [
  { id: "games", name: "游戏", icon: "gamepad", isSystem: false, order: 0 },
  { id: "office", name: "办公", icon: "briefcase", isSystem: false, order: 1 },
];

describe("settings group expansion", () => {
  it("starts empty and opens only the requested group", () => {
    const expanded = toggleExpandedSettingsGroup(new Set(), "games");

    expect([...expanded]).toEqual(["games"]);
  });

  it("replaces the previously expanded group and collapses the active group", () => {
    const switched = toggleExpandedSettingsGroup(new Set(["games"]), "office");
    const collapsed = toggleExpandedSettingsGroup(switched, "office");

    expect([...switched]).toEqual(["office"]);
    expect([...collapsed]).toEqual([]);
  });

  it("retains at most one existing group when the group list changes", () => {
    expect([...retainExpandedSettingsGroup(new Set(["missing", "office", "games"]), groups)]).toEqual(["office"]);
    expect([...retainExpandedSettingsGroup(new Set(["missing"]), groups)]).toEqual([]);
  });
});
