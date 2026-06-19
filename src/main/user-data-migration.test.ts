import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrateLegacyUserData } from "./user-data-migration.js";

describe("user data migration", () => {
  it("copies legacy commanddeck data into the new start-engineer directory without deleting the legacy files", () => {
    const root = mkdtempSync(join(tmpdir(), "start-engineer-migration-"));
    const legacy = join(root, "commanddeck-next");
    const current = join(root, "start-engineer");
    mkdirSync(join(legacy, "icons"), { recursive: true });
    writeFileSync(join(legacy, "apps.json"), "[1]", "utf8");
    writeFileSync(join(legacy, "groups.json"), "[2]", "utf8");
    writeFileSync(join(legacy, "preferences.json"), "{\"uiTheme\":\"utility\"}", "utf8");
    writeFileSync(join(legacy, "icons", "demo.png"), "icon", "utf8");

    migrateLegacyUserData(current, legacy);

    expect(readFileSync(join(current, "apps.json"), "utf8")).toBe("[1]");
    expect(readFileSync(join(current, "groups.json"), "utf8")).toBe("[2]");
    expect(readFileSync(join(current, "preferences.json"), "utf8")).toContain("utility");
    expect(readFileSync(join(current, "icons", "demo.png"), "utf8")).toBe("icon");
    expect(existsSync(join(legacy, "apps.json"))).toBe(true);
  });
});
