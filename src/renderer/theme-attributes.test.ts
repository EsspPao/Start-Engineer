import { describe, expect, it } from "vitest";
import { buildThemeAttributes, buildWallpaperIntensityStyle } from "./theme-attributes";

describe("buildThemeAttributes", () => {
  it("returns wallpaper root attributes and dark color scheme", () => {
    expect(buildThemeAttributes({ uiTheme: "wallpaper", wallpaperGlassIntensity: 85, wallpaperGlassVariant: "dark" }, false)).toEqual({
      theme: "wallpaper",
      wallpaperIntensity: 85,
      wallpaperVariant: "dark",
      wallpaperStyle: buildWallpaperIntensityStyle(85, "dark"),
      colorScheme: "dark"
    });
  });

  it("returns light wallpaper variants with a light color scheme", () => {
    expect(buildThemeAttributes({ uiTheme: "wallpaper", wallpaperGlassIntensity: 55, wallpaperGlassVariant: "light" }, false)).toEqual({
      theme: "wallpaper",
      wallpaperIntensity: 55,
      wallpaperVariant: "light",
      wallpaperStyle: buildWallpaperIntensityStyle(55, "light"),
      colorScheme: "light"
    });
  });

  it("keeps the configured intensity available for non-wallpaper themes", () => {
    expect(buildThemeAttributes({ uiTheme: "utility", wallpaperGlassIntensity: 25, wallpaperGlassVariant: "light" }, false)).toEqual({
      theme: "utility",
      wallpaperIntensity: 25,
      wallpaperVariant: "light",
      wallpaperStyle: buildWallpaperIntensityStyle(25, "light"),
      colorScheme: "light"
    });
  });

  it("uses dark native controls for Clear Desktop contrast", () => {
    expect(buildThemeAttributes({ uiTheme: "clear", wallpaperGlassIntensity: 55, wallpaperGlassVariant: "light" }, false)).toMatchObject({
      theme: "clear",
      colorScheme: "dark"
    });
  });

  it("clamps out-of-range wallpaper intensity values", () => {
    expect(buildThemeAttributes({ uiTheme: "wallpaper", wallpaperGlassIntensity: 140, wallpaperGlassVariant: "dark" }, false).wallpaperIntensity).toBe(100);
    expect(buildThemeAttributes({ uiTheme: "wallpaper", wallpaperGlassIntensity: -12, wallpaperGlassVariant: "dark" }, false).wallpaperIntensity).toBe(0);
  });

  it("uses a wider opacity range for dark wallpaper intensity endpoints", () => {
    expect(buildWallpaperIntensityStyle(0, "dark")).toMatchObject({
      "--wallpaper-shell": "rgba(18,20,26,0.94)",
      "--wallpaper-panel": "rgba(18,22,30,0.82)",
      "--wallpaper-card": "rgba(255,255,255,0.28)"
    });
    expect(buildWallpaperIntensityStyle(100, "dark")).toMatchObject({
      "--wallpaper-shell": "rgba(18,20,26,0.28)",
      "--wallpaper-panel": "rgba(18,22,30,0.14)",
      "--wallpaper-card": "rgba(255,255,255,0.025)"
    });
  });

  it("uses a wider opacity range for light wallpaper intensity endpoints", () => {
    expect(buildWallpaperIntensityStyle(0, "light")).toMatchObject({
      "--wallpaper-shell": "rgba(245,248,255,0.92)",
      "--wallpaper-panel": "rgba(250,252,255,0.86)",
      "--wallpaper-card": "rgba(255,255,255,0.72)"
    });
    expect(buildWallpaperIntensityStyle(100, "light")).toMatchObject({
      "--wallpaper-shell": "rgba(245,248,255,0.18)",
      "--wallpaper-panel": "rgba(250,252,255,0.1)",
      "--wallpaper-card": "rgba(255,255,255,0.04)"
    });
  });
});
