import type { AppPreferences, SearchProvider, UiTheme, WallpaperGlassIntensity, WallpaperGlassVariant, WindowBounds } from "../shared/types.js";

const supportedThemes = new Set<UiTheme>(["fluent", "midnight", "utility", "glass", "wallpaper", "system"]);
const supportedSearchProviders = new Set<SearchProvider>(["everything", "internal"]);
const supportedWallpaperGlassIntensities = new Set<WallpaperGlassIntensity>(["weak", "medium", "strong"]);
const supportedWallpaperGlassVariants = new Set<WallpaperGlassVariant>(["dark", "light"]);

export const defaultPreferences: AppPreferences = {
  launchAtStartup: false,
  closeBehavior: "tray",
  globalShortcutEnabled: true,
  globalShortcut: "Ctrl+Shift+Space",
  uiTheme: "utility",
  wallpaperGlassIntensity: "medium",
  wallpaperGlassVariant: "dark",
  runAsAdministrator: false,
  searchProvider: "everything",
  sortRunningAppsFirst: true,
  showAppNames: false,
  firstRunImportCompleted: false
};

function normalizeWindowBounds(value: unknown): WindowBounds | undefined {
  if (!value || typeof value !== "object") return undefined;
  const bounds = value as Partial<WindowBounds>;
  const values = [bounds.x, bounds.y, bounds.width, bounds.height];
  if (!values.every((item) => typeof item === "number" && Number.isFinite(item))) return undefined;
  if ((bounds.width ?? 0) < 1060 || (bounds.height ?? 0) < 680) return undefined;
  return { x: Math.round(bounds.x ?? 0), y: Math.round(bounds.y ?? 0), width: Math.round(bounds.width ?? 0), height: Math.round(bounds.height ?? 0) };
}

export function normalizePreferences(raw: Partial<AppPreferences> | null | undefined): AppPreferences {
  return {
    launchAtStartup: raw?.launchAtStartup === true,
    closeBehavior: raw?.closeBehavior === "quit" ? "quit" : "tray",
    globalShortcutEnabled: raw?.globalShortcutEnabled !== false,
    globalShortcut: typeof raw?.globalShortcut === "string" && raw.globalShortcut.trim()
      ? raw.globalShortcut.trim()
      : defaultPreferences.globalShortcut,
    uiTheme: supportedThemes.has(raw?.uiTheme as UiTheme) ? raw?.uiTheme as UiTheme : defaultPreferences.uiTheme,
    wallpaperGlassIntensity: supportedWallpaperGlassIntensities.has(raw?.wallpaperGlassIntensity as WallpaperGlassIntensity)
      ? raw?.wallpaperGlassIntensity as WallpaperGlassIntensity
      : defaultPreferences.wallpaperGlassIntensity,
    wallpaperGlassVariant: supportedWallpaperGlassVariants.has(raw?.wallpaperGlassVariant as WallpaperGlassVariant)
      ? raw?.wallpaperGlassVariant as WallpaperGlassVariant
      : defaultPreferences.wallpaperGlassVariant,
    runAsAdministrator: raw?.runAsAdministrator === true,
    searchProvider: supportedSearchProviders.has(raw?.searchProvider as SearchProvider) ? raw?.searchProvider as SearchProvider : defaultPreferences.searchProvider,
    sortRunningAppsFirst: raw?.sortRunningAppsFirst !== false,
    showAppNames: raw?.showAppNames === true,
    firstRunImportCompleted: raw?.firstRunImportCompleted === true,
    ...(normalizeWindowBounds(raw?.windowBounds) ? { windowBounds: normalizeWindowBounds(raw?.windowBounds) } : {}),
    ...(typeof raw?.everythingCliPath === "string" && raw.everythingCliPath.trim() ? { everythingCliPath: raw.everythingCliPath.trim() } : {}),
    ...(typeof raw?.everythingManagedPath === "string" && raw.everythingManagedPath.trim() ? { everythingManagedPath: raw.everythingManagedPath.trim() } : {})
  };
}

export function resolveLoginExecutable(execPath: string, portableExecutable?: string) {
  return portableExecutable?.trim() || execPath;
}
