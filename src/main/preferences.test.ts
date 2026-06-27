import { describe, expect, it } from "vitest";
import { defaultPreferences, normalizePreferences, resolveLoginExecutable } from "./preferences.js";

describe("preferences", () => {
  it("uses stable defaults for missing or invalid values", () => {
    expect(normalizePreferences(undefined)).toEqual(defaultPreferences);
    expect(normalizePreferences({ launchAtStartup: false, closeBehavior: "unknown" as "tray" })).toEqual(defaultPreferences);
  });

  it("preserves supported preferences", () => {
    expect(normalizePreferences({ launchAtStartup: true, closeBehavior: "quit", globalShortcutEnabled: false, globalShortcut: "Alt+Shift+S", uiTheme: "system", wallpaperGlassIntensity: "strong", wallpaperGlassVariant: "light", searchProvider: "internal", sortRunningAppsFirst: false, showAppNames: true, everythingCliPath: "C:\\Tools\\ES.exe" })).toEqual({
      launchAtStartup: true,
      closeBehavior: "quit",
      globalShortcutEnabled: false,
      globalShortcut: "Alt+Shift+S",
      uiTheme: "system",
      wallpaperGlassIntensity: "strong",
      wallpaperGlassVariant: "light",
      runAsAdministrator: false,
      searchProvider: "internal",
      sortRunningAppsFirst: false,
      showAppNames: true,
      firstRunImportCompleted: false,
      everythingCliPath: "C:\\Tools\\ES.exe"
    });
  });

  it("sorts running apps first by default", () => {
    expect(normalizePreferences(undefined).sortRunningAppsFirst).toBe(true);
    expect(normalizePreferences({ sortRunningAppsFirst: false }).sortRunningAppsFirst).toBe(false);
  });

  it("hides app names by default and preserves the display toggle", () => {
    expect(normalizePreferences(undefined).showAppNames).toBe(false);
    expect(normalizePreferences({ showAppNames: true }).showAppNames).toBe(true);
  });

  it("preserves the administrator launch preference", () => {
    expect(normalizePreferences({ runAsAdministrator: true }).runAsAdministrator).toBe(true);
  });

  it("preserves the first-run import completion flag", () => {
    expect(normalizePreferences({ firstRunImportCompleted: true }).firstRunImportCompleted).toBe(true);
  });

  it("preserves valid window bounds and drops invalid values", () => {
    expect(normalizePreferences({ windowBounds: { x: 20, y: 30, width: 1280, height: 760 } }).windowBounds).toEqual({ x: 20, y: 30, width: 1280, height: 760 });
    expect(normalizePreferences({ windowBounds: { x: 20, y: 30, width: 300, height: 200 } }).windowBounds).toBeUndefined();
    expect(normalizePreferences({ windowBounds: { x: Number.NaN, y: 30, width: 1280, height: 760 } }).windowBounds).toBeUndefined();
  });

  it("falls back to Modern Utility for unsupported themes", () => {
    expect(normalizePreferences({ uiTheme: "unknown" as "utility" }).uiTheme).toBe("utility");
  });

  it("supports Wallpaper Glass intensity with a stable medium default", () => {
    expect(normalizePreferences(undefined).wallpaperGlassIntensity).toBe("medium");
    expect(normalizePreferences({ wallpaperGlassIntensity: "weak" }).wallpaperGlassIntensity).toBe("weak");
    expect(normalizePreferences({ wallpaperGlassIntensity: "medium" }).wallpaperGlassIntensity).toBe("medium");
    expect(normalizePreferences({ wallpaperGlassIntensity: "strong" }).wallpaperGlassIntensity).toBe("strong");
    expect(normalizePreferences({ wallpaperGlassIntensity: "clear" as "medium" }).wallpaperGlassIntensity).toBe("medium");
  });

  it("supports Wallpaper Glass variants with a stable dark default", () => {
    expect(normalizePreferences(undefined).wallpaperGlassVariant).toBe("dark");
    expect(normalizePreferences({ wallpaperGlassVariant: "dark" }).wallpaperGlassVariant).toBe("dark");
    expect(normalizePreferences({ wallpaperGlassVariant: "light" }).wallpaperGlassVariant).toBe("light");
    expect(normalizePreferences({ wallpaperGlassVariant: "auto" as "dark" }).wallpaperGlassVariant).toBe("dark");
  });

  it("uses the original portable executable for login startup", () => {
    expect(resolveLoginExecutable("C:\\Temp\\Start Engineer.exe", "D:\\Apps\\Start-Engineer-Portable.exe")).toBe("D:\\Apps\\Start-Engineer-Portable.exe");
    expect(resolveLoginExecutable("C:\\Program Files\\Start Engineer.exe", "")).toBe("C:\\Program Files\\Start Engineer.exe");
  });
});
