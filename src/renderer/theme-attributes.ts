import type { AppPreferences, WallpaperGlassIntensity, WallpaperGlassVariant } from "../shared/types";
import { resolveUiTheme } from "../shared/theme";

export function buildThemeAttributes(preferences: Pick<AppPreferences, "uiTheme" | "wallpaperGlassIntensity" | "wallpaperGlassVariant">, systemIsDark: boolean) {
  const theme = resolveUiTheme(preferences.uiTheme, systemIsDark);
  const wallpaperIntensity: WallpaperGlassIntensity = preferences.wallpaperGlassIntensity ?? "medium";
  const wallpaperVariant: WallpaperGlassVariant = preferences.wallpaperGlassVariant ?? "dark";
  return {
    theme,
    wallpaperIntensity,
    wallpaperVariant,
    colorScheme: theme === "wallpaper" ? wallpaperVariant : theme === "midnight" ? "dark" : "light"
  };
}
