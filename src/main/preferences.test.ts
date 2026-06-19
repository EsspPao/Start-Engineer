import { describe, expect, it } from "vitest";
import { defaultPreferences, normalizePreferences, resolveLoginExecutable } from "./preferences.js";

describe("preferences", () => {
  it("uses stable defaults for missing or invalid values", () => {
    expect(normalizePreferences(undefined)).toEqual(defaultPreferences);
    expect(normalizePreferences({ launchAtStartup: false, closeBehavior: "unknown" as "tray" })).toEqual(defaultPreferences);
  });

  it("preserves supported preferences", () => {
    expect(normalizePreferences({ launchAtStartup: true, closeBehavior: "quit", globalShortcutEnabled: false, globalShortcut: "Alt+Shift+S", uiTheme: "system", searchProvider: "internal", sortRunningAppsFirst: false, everythingCliPath: "C:\\Tools\\ES.exe" })).toEqual({
      launchAtStartup: true,
      closeBehavior: "quit",
      globalShortcutEnabled: false,
      globalShortcut: "Alt+Shift+S",
      uiTheme: "system",
      runAsAdministrator: false,
      searchProvider: "internal",
      sortRunningAppsFirst: false,
      everythingCliPath: "C:\\Tools\\ES.exe"
    });
  });

  it("sorts running apps first by default", () => {
    expect(normalizePreferences(undefined).sortRunningAppsFirst).toBe(true);
    expect(normalizePreferences({ sortRunningAppsFirst: false }).sortRunningAppsFirst).toBe(false);
  });

  it("preserves the administrator launch preference", () => {
    expect(normalizePreferences({ runAsAdministrator: true }).runAsAdministrator).toBe(true);
  });

  it("falls back to Modern Utility for unsupported themes", () => {
    expect(normalizePreferences({ uiTheme: "unknown" as "utility" }).uiTheme).toBe("utility");
  });

  it("uses the original portable executable for login startup", () => {
    expect(resolveLoginExecutable("C:\\Temp\\Start Engineer.exe", "D:\\Apps\\Start-Engineer-Portable.exe")).toBe("D:\\Apps\\Start-Engineer-Portable.exe");
    expect(resolveLoginExecutable("C:\\Program Files\\Start Engineer.exe", "")).toBe("C:\\Program Files\\Start Engineer.exe");
  });
});
