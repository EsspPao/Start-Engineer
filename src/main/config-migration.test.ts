import { describe, expect, it } from "vitest";
import { migrateAppEntry, normalizeGroups } from "./config-migration.js";

describe("configuration migration", () => {
  it("removes system groups, repairs icons and preserves order", () => {
    const groups = normalizeGroups([
      { id: "settings", name: "wrong" },
      { id: "tools", name: "工具", icon: "invalid", order: 2 },
      { id: "games", name: "二游", icon: "gamepad", order: 1 }
    ], new Set(["grid", "gamepad"]));
    expect(groups.map((group) => group.id)).toEqual(["games", "tools"]);
    expect(groups[1]).toMatchObject({ icon: "grid", isSystem: false });
  });

  it("migrates legacy apps without changing optional launch data", () => {
    const migrated = migrateAppEntry({
      name: "Demo", executablePath: "C:\\Apps\\demo.exe", launchArgs: "--silent", workingDirectory: "C:\\Apps",
      iconCacheVersion: 2, iconPixelSize: 128
    }, "tools", () => "generated");
    expect(migrated).toMatchObject({ id: "generated", groupId: "tools", processName: "demo", launchArgs: "--silent", workingDirectory: "C:\\Apps", iconCacheVersion: 2, iconPixelSize: 128 });
    expect(migrated.launchSelected).toBe(false);
  });

  it("preserves a saved batch-launch selection", () => {
    expect(migrateAppEntry({ id: "demo", name: "Demo", launchSelected: true }, "tools", () => "generated").launchSelected).toBe(true);
  });
});
