import type { AppPreferences, SearchProvider, UiTheme } from "../shared/types.js";

const supportedThemes = new Set<UiTheme>(["fluent", "midnight", "utility", "glass", "system"]);
const supportedSearchProviders = new Set<SearchProvider>(["everything", "internal"]);

export const defaultPreferences: AppPreferences = {
  launchAtStartup: false,
  closeBehavior: "tray",
  globalShortcutEnabled: true,
  globalShortcut: "Ctrl+Shift+Space",
  uiTheme: "utility",
  runAsAdministrator: false,
  searchProvider: "everything",
  sortRunningAppsFirst: true,
  firstRunImportCompleted: false
};

export function normalizePreferences(raw: Partial<AppPreferences> | null | undefined): AppPreferences {
  return {
    launchAtStartup: raw?.launchAtStartup === true,
    closeBehavior: raw?.closeBehavior === "quit" ? "quit" : "tray",
    globalShortcutEnabled: raw?.globalShortcutEnabled !== false,
    globalShortcut: typeof raw?.globalShortcut === "string" && raw.globalShortcut.trim()
      ? raw.globalShortcut.trim()
      : defaultPreferences.globalShortcut,
    uiTheme: supportedThemes.has(raw?.uiTheme as UiTheme) ? raw?.uiTheme as UiTheme : defaultPreferences.uiTheme,
    runAsAdministrator: raw?.runAsAdministrator === true,
    searchProvider: supportedSearchProviders.has(raw?.searchProvider as SearchProvider) ? raw?.searchProvider as SearchProvider : defaultPreferences.searchProvider,
    sortRunningAppsFirst: raw?.sortRunningAppsFirst !== false,
    firstRunImportCompleted: raw?.firstRunImportCompleted === true,
    ...(typeof raw?.everythingCliPath === "string" && raw.everythingCliPath.trim() ? { everythingCliPath: raw.everythingCliPath.trim() } : {}),
    ...(typeof raw?.everythingManagedPath === "string" && raw.everythingManagedPath.trim() ? { everythingManagedPath: raw.everythingManagedPath.trim() } : {})
  };
}

export function resolveLoginExecutable(execPath: string, portableExecutable?: string) {
  return portableExecutable?.trim() || execPath;
}
