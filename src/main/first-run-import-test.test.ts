import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { firstRunImportTestMarkerName, prepareFirstRunImportTestUserData } from "./first-run-import-test.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("first-run import test mode", () => {
  it("leaves normal user data untouched when the marker is absent", () => {
    const normalUserData = createFixture();

    expect(prepareFirstRunImportTestUserData(normalUserData)).toBe(normalUserData);
    expect(existsSync(`${normalUserData}-first-run-import-test`)).toBe(false);
  });

  it("ignores the QA marker in packaged builds", () => {
    const normalUserData = createFixture();
    writeFileSync(join(normalUserData, firstRunImportTestMarkerName), "enabled\n", "utf8");

    expect(prepareFirstRunImportTestUserData(normalUserData, false)).toBe(normalUserData);
    expect(existsSync(`${normalUserData}-first-run-import-test`)).toBe(false);
  });

  it("creates a fresh isolated first-run profile on every launch", () => {
    const normalUserData = createFixture();
    writeFileSync(join(normalUserData, firstRunImportTestMarkerName), "enabled\n", "utf8");

    const testUserData = prepareFirstRunImportTestUserData(normalUserData);
    expect(testUserData).toBe(`${normalUserData}-first-run-import-test`);
    expect(readJson(join(testUserData, "apps.json"))).toEqual([]);
    expect(readJson(join(testUserData, "first-run-import-template.json"))).toEqual([{ id: "existing" }]);
    expect(readJson(join(testUserData, "folders.json"))).toEqual([]);
    expect(readJson(join(testUserData, "group-grid-order.json"))).toEqual([]);
    expect(readJson(join(testUserData, "groups.json"))).toEqual([{ id: "games", name: "游戏" }]);
    expect(readJson(join(testUserData, "preferences.json"))).toMatchObject({
      uiTheme: "wallpaper",
      closeBehavior: "quit",
      firstRunImportCompleted: false
    });
    expect(readFileSync(join(testUserData, "wallpaper", "background.png"), "utf8")).toBe("wallpaper");

    writeFileSync(join(testUserData, "apps.json"), "[{\"id\":\"imported\"}]", "utf8");
    prepareFirstRunImportTestUserData(normalUserData);
    expect(readJson(join(testUserData, "apps.json"))).toEqual([]);
    expect(readJson(join(testUserData, "first-run-import-template.json"))).toEqual([{ id: "existing" }]);
    expect(readJson(join(normalUserData, "apps.json"))).toEqual([{ id: "existing" }]);
  });
});

function createFixture() {
  const root = join(tmpdir(), `start-engineer-import-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  roots.push(root);
  const normalUserData = join(root, "start-engineer");
  mkdirSync(join(normalUserData, "wallpaper"), { recursive: true });
  writeFileSync(join(normalUserData, "apps.json"), "[{\"id\":\"existing\"}]", "utf8");
  writeFileSync(join(normalUserData, "groups.json"), "[{\"id\":\"games\",\"name\":\"游戏\"}]", "utf8");
  writeFileSync(join(normalUserData, "preferences.json"), "{\"uiTheme\":\"wallpaper\",\"closeBehavior\":\"tray\",\"firstRunImportCompleted\":true}", "utf8");
  writeFileSync(join(normalUserData, "wallpaper", "background.png"), "wallpaper", "utf8");
  return normalUserData;
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}
