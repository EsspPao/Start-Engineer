import type { AppPreferences, WallpaperBackgroundPreferences, WallpaperBackgroundState, WallpaperGlassIntensity, WallpaperGlassVariant } from "../shared/types";
import { resolveUiTheme } from "../shared/theme";

function clampIntensity(value: unknown): WallpaperGlassIntensity {
  if (typeof value !== "number" || !Number.isFinite(value)) return 55;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function alpha(from: number, to: number, value: number) {
  return Number((from + (to - from) * (value / 100)).toFixed(3));
}

function rgba(r: number, g: number, b: number, a: number) {
  return `rgba(${r},${g},${b},${a})`;
}

export function buildWallpaperIntensityStyle(intensity: WallpaperGlassIntensity, variant: WallpaperGlassVariant) {
  const value = clampIntensity(intensity);
  const light = variant === "light";
  return {
    "--wallpaper-shell": light ? rgba(245, 248, 255, alpha(0.92, 0.18, value)) : rgba(18, 20, 26, alpha(0.94, 0.28, value)),
    "--wallpaper-sidebar": light ? rgba(255, 255, 255, alpha(0.78, 0.08, value)) : rgba(10, 12, 18, alpha(0.78, 0.1, value)),
    "--wallpaper-panel": light ? rgba(250, 252, 255, alpha(0.86, 0.1, value)) : rgba(18, 22, 30, alpha(0.82, 0.14, value)),
    "--wallpaper-panel-strong": light ? rgba(255, 255, 255, alpha(0.94, 0.2, value)) : rgba(20, 24, 32, alpha(0.9, 0.22, value)),
    "--wallpaper-card": light ? rgba(255, 255, 255, alpha(0.72, 0.04, value)) : rgba(255, 255, 255, alpha(0.28, 0.025, value)),
    "--wallpaper-card-hover": light ? rgba(255, 255, 255, alpha(0.84, 0.16, value)) : rgba(255, 255, 255, alpha(0.34, 0.07, value)),
    "--wallpaper-control": light ? rgba(255, 255, 255, alpha(0.76, 0.07, value)) : rgba(255, 255, 255, alpha(0.3, 0.04, value)),
    "--wallpaper-control-strong": light ? rgba(255, 255, 255, alpha(0.88, 0.18, value)) : rgba(255, 255, 255, alpha(0.42, 0.08, value))
  };
}

export function buildWallpaperBackgroundStyle(preferences: WallpaperBackgroundPreferences, background: WallpaperBackgroundState) {
  if (!background.dataUrl) return {};
  return {
    "--wallpaper-background-image": `url("${background.dataUrl}")`,
    "--wallpaper-background-size": preferences.fit,
    "--wallpaper-background-position": `${preferences.focusX}% ${preferences.focusY}%`,
    "--wallpaper-background-dim": preferences.dim / 100
  };
}

export function buildThemeAttributes(preferences: Pick<AppPreferences, "uiTheme" | "wallpaperGlassIntensity" | "wallpaperGlassVariant">, systemIsDark: boolean) {
  const theme = resolveUiTheme(preferences.uiTheme, systemIsDark);
  const wallpaperIntensity: WallpaperGlassIntensity = clampIntensity(preferences.wallpaperGlassIntensity);
  const wallpaperVariant: WallpaperGlassVariant = preferences.wallpaperGlassVariant ?? "dark";
  return {
    theme,
    wallpaperIntensity,
    wallpaperVariant,
    wallpaperStyle: buildWallpaperIntensityStyle(wallpaperIntensity, wallpaperVariant),
    colorScheme: theme === "wallpaper" ? wallpaperVariant : theme === "midnight" ? "dark" : "light"
  };
}
