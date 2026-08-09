import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const firstRunImportTestMarkerName = ".first-run-import-test.enabled";

export function prepareFirstRunImportTestUserData(normalUserData: string, allowTestMode = true) {
  if (!allowTestMode || !existsSync(join(normalUserData, firstRunImportTestMarkerName))) return normalUserData;

  const testUserData = `${normalUserData}-first-run-import-test`;
  mkdirSync(testUserData, { recursive: true });
  copyOrRemove(join(normalUserData, "groups.json"), join(testUserData, "groups.json"));
  copyOrRemove(join(normalUserData, "apps.json"), join(testUserData, "first-run-import-template.json"));
  syncDirectory(join(normalUserData, "wallpaper"), join(testUserData, "wallpaper"));

  const preferences = readJsonObject(join(normalUserData, "preferences.json"));
  writeJson(join(testUserData, "preferences.json"), {
    ...preferences,
    closeBehavior: "quit",
    firstRunImportCompleted: false
  });
  writeJson(join(testUserData, "apps.json"), []);
  writeJson(join(testUserData, "folders.json"), []);
  writeJson(join(testUserData, "group-grid-order.json"), []);
  return testUserData;
}

function readJsonObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function copyOrRemove(source: string, target: string) {
  if (existsSync(source)) {
    copyFileSync(source, target);
  } else {
    rmSync(target, { force: true });
  }
}

function syncDirectory(source: string, target: string) {
  rmSync(target, { recursive: true, force: true });
  if (existsSync(source)) cpSync(source, target, { recursive: true, force: true });
}
