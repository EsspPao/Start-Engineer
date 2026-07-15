import type { FixedUiTheme, UiTheme } from "./types.js";

export function resolveUiTheme(theme: UiTheme, systemIsDark: boolean): FixedUiTheme {
  if (theme === "system") return systemIsDark ? "midnight" : "fluent";
  return theme;
}

export function themeUsesMica(theme: FixedUiTheme): boolean {
  return theme === "fluent" || theme === "glass";
}
