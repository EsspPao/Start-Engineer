import { describe, expect, it } from "vitest";
import { buildThemeAttributes } from "./theme-attributes";

describe("buildThemeAttributes", () => {
  it("returns wallpaper root attributes and dark color scheme", () => {
    expect(buildThemeAttributes({ uiTheme: "wallpaper", wallpaperGlassIntensity: "strong", wallpaperGlassVariant: "dark" }, false)).toEqual({
      theme: "wallpaper",
      wallpaperIntensity: "strong",
      wallpaperVariant: "dark",
      colorScheme: "dark"
    });
  });

  it("returns light wallpaper variants with a light color scheme", () => {
    expect(buildThemeAttributes({ uiTheme: "wallpaper", wallpaperGlassIntensity: "medium", wallpaperGlassVariant: "light" }, false)).toEqual({
      theme: "wallpaper",
      wallpaperIntensity: "medium",
      wallpaperVariant: "light",
      colorScheme: "light"
    });
  });

  it("keeps the configured intensity available for non-wallpaper themes", () => {
    expect(buildThemeAttributes({ uiTheme: "utility", wallpaperGlassIntensity: "weak", wallpaperGlassVariant: "light" }, false)).toEqual({
      theme: "utility",
      wallpaperIntensity: "weak",
      wallpaperVariant: "light",
      colorScheme: "light"
    });
  });
});
