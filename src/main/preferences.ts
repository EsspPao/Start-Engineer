import type { AllAppsViewPreferences, AppPreferences, SearchProvider, UiTheme, WallpaperGlassIntensity, WallpaperGlassVariant, WindowBounds } from "../shared/types.js";
import { defaultUiLayoutPreferences, normalizeUiLayoutPreferences } from "../shared/ui-layout-share.js";

const supportedThemes = new Set<UiTheme>(["apple", "fluent", "midnight", "utility", "glass", "wallpaper", "system"]);
const supportedSearchProviders = new Set<SearchProvider>(["everything", "internal"]);
const supportedWallpaperGlassVariants = new Set<WallpaperGlassVariant>(["dark", "light"]);

export const defaultPreferences: AppPreferences = {
  launchAtStartup: false,
  closeBehavior: "tray",
  globalShortcutEnabled: true,
  globalShortcut: "Ctrl+Shift+Space",
  uiTheme: "apple",
  wallpaperGlassIntensity: 55,
  wallpaperGlassVariant: "dark",
  runAsAdministrator: false,
  searchProvider: "everything",
  sortRunningAppsFirst: true,
  showAppNames: false,
  uiLayout: defaultUiLayoutPreferences,
  allAppsView: { orderedAppIds: [], launchSelectedAppIds: [] },
  firstRunImportCompleted: false
};

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function normalizeAllAppsView(value: unknown): AllAppsViewPreferences {
  if (!value || typeof value !== "object") return defaultPreferences.allAppsView;
  const raw = value as Partial<AllAppsViewPreferences>;
  return {
    orderedAppIds: normalizeStringList(raw.orderedAppIds),
    launchSelectedAppIds: normalizeStringList(raw.launchSelectedAppIds)
  };
}

function normalizeWindowBounds(value: unknown): WindowBounds | undefined {
  if (!value || typeof value !== "object") return undefined;
  const bounds = value as Partial<WindowBounds>;
  const values = [bounds.x, bounds.y, bounds.width, bounds.height];
  if (!values.every((item) => typeof item === "number" && Number.isFinite(item))) return undefined;
  if ((bounds.width ?? 0) < 1060 || (bounds.height ?? 0) < 680) return undefined;
  return { x: Math.round(bounds.x ?? 0), y: Math.round(bounds.y ?? 0), width: Math.round(bounds.width ?? 0), height: Math.round(bounds.height ?? 0) };
}

function normalizeWallpaperGlassIntensity(value: unknown): WallpaperGlassIntensity {
  if (value === "weak") return 25;
  if (value === "medium") return defaultPreferences.wallpaperGlassIntensity;
  if (value === "strong") return 85;
  if (typeof value !== "number" || !Number.isFinite(value)) return defaultPreferences.wallpaperGlassIntensity;
  return Math.min(100, Math.max(0, Math.round(value)));
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
    wallpaperGlassIntensity: normalizeWallpaperGlassIntensity(raw?.wallpaperGlassIntensity),
    wallpaperGlassVariant: supportedWallpaperGlassVariants.has(raw?.wallpaperGlassVariant as WallpaperGlassVariant)
      ? raw?.wallpaperGlassVariant as WallpaperGlassVariant
      : defaultPreferences.wallpaperGlassVariant,
    runAsAdministrator: raw?.runAsAdministrator === true,
    searchProvider: supportedSearchProviders.has(raw?.searchProvider as SearchProvider) ? raw?.searchProvider as SearchProvider : defaultPreferences.searchProvider,
    sortRunningAppsFirst: raw?.sortRunningAppsFirst !== false,
    showAppNames: raw?.showAppNames === true,
    uiLayout: normalizeUiLayoutPreferences(raw?.uiLayout),
    allAppsView: normalizeAllAppsView(raw?.allAppsView),
    firstRunImportCompleted: raw?.firstRunImportCompleted === true,
    ...(normalizeWindowBounds(raw?.windowBounds) ? { windowBounds: normalizeWindowBounds(raw?.windowBounds) } : {}),
    ...(typeof raw?.everythingCliPath === "string" && raw.everythingCliPath.trim() ? { everythingCliPath: raw.everythingCliPath.trim() } : {}),
    ...(typeof raw?.everythingManagedPath === "string" && raw.everythingManagedPath.trim() ? { everythingManagedPath: raw.everythingManagedPath.trim() } : {})
  };
}

export function resolveLoginExecutable(execPath: string, portableExecutable?: string) {
  return portableExecutable?.trim() || execPath;
}
