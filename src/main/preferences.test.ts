import { describe, expect, it } from "vitest";
import { defaultPreferences, normalizePreferences, resolveLoginExecutable } from "./preferences.js";

describe("preferences", () => {
  it("normalizes constrained UI layout preferences", () => {
    expect(normalizePreferences({
      uiLayout: {
        cardSize: "large",
        gridDensity: "relaxed",
        sidebarWidth: "narrow",
        brandIconSize: "large",
        backgroundTone: "graphite",
        showRunningStatus: false,
        showAppNames: true,
        showBatchActions: false,
        showSearchBar: true
      }
    }).uiLayout).toEqual({
      cardSize: "large",
      gridDensity: "relaxed",
      sidebarWidth: "narrow",
      brandIconSize: "large",
      backgroundTone: "graphite",
      showRunningStatus: false,
      showAppNames: true,
      showBatchActions: false,
      showSearchBar: true
    });
  });

  it("normalizes independent all apps view preferences", () => {
    expect(normalizePreferences({
      allAppsView: {
        orderedAppIds: ["wechat", "steam", "wechat", ""],
        launchSelectedAppIds: ["steam", "notion", "steam", 42 as unknown as string]
      }
    }).allAppsView).toEqual({
      orderedAppIds: ["wechat", "steam"],
      launchSelectedAppIds: ["steam", "notion"]
    });
  });

  it("uses stable defaults for missing or invalid values", () => {
    expect(normalizePreferences(undefined)).toEqual(defaultPreferences);
    expect(normalizePreferences({ launchAtStartup: false, closeBehavior: "unknown" as "tray" })).toEqual(defaultPreferences);
  });

  it("preserves supported preferences", () => {
    expect(normalizePreferences({ launchAtStartup: true, closeBehavior: "quit", globalShortcutEnabled: false, globalShortcut: "Alt+Shift+S", uiTheme: "system", wallpaperGlassIntensity: 82, wallpaperGlassVariant: "light", searchProvider: "internal", sortRunningAppsFirst: false, showAppNames: true, everythingCliPath: "C:\\Tools\\ES.exe" })).toEqual({
      launchAtStartup: true,
      closeBehavior: "quit",
      globalShortcutEnabled: false,
      globalShortcut: "Alt+Shift+S",
      uiTheme: "system",
      wallpaperGlassIntensity: 82,
      wallpaperGlassVariant: "light",
      runAsAdministrator: false,
      searchProvider: "internal",
      sortRunningAppsFirst: false,
      showAppNames: true,
      keyboardShortcuts: defaultPreferences.keyboardShortcuts,
      uiLayout: defaultPreferences.uiLayout,
      allAppsView: defaultPreferences.allAppsView,
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

  it("falls back to Apple Gallery for unsupported themes", () => {
    expect(normalizePreferences({ uiTheme: "unknown" as "utility" }).uiTheme).toBe("apple");
  });

  it("supports Wallpaper Glass intensity as a 0-100 value with legacy migration", () => {
    expect(normalizePreferences(undefined).wallpaperGlassIntensity).toBe(55);
    expect(normalizePreferences({ wallpaperGlassIntensity: 0 }).wallpaperGlassIntensity).toBe(0);
    expect(normalizePreferences({ wallpaperGlassIntensity: 100 }).wallpaperGlassIntensity).toBe(100);
    expect(normalizePreferences({ wallpaperGlassIntensity: 72.6 }).wallpaperGlassIntensity).toBe(73);
    expect(normalizePreferences({ wallpaperGlassIntensity: -10 }).wallpaperGlassIntensity).toBe(0);
    expect(normalizePreferences({ wallpaperGlassIntensity: 130 }).wallpaperGlassIntensity).toBe(100);
    expect(normalizePreferences({ wallpaperGlassIntensity: "weak" as unknown as number }).wallpaperGlassIntensity).toBe(25);
    expect(normalizePreferences({ wallpaperGlassIntensity: "medium" as unknown as number }).wallpaperGlassIntensity).toBe(55);
    expect(normalizePreferences({ wallpaperGlassIntensity: "strong" as unknown as number }).wallpaperGlassIntensity).toBe(85);
    expect(normalizePreferences({ wallpaperGlassIntensity: Number.NaN }).wallpaperGlassIntensity).toBe(55);
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
