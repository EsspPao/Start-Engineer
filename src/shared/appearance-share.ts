import type { AppPreferences, UiTheme } from "./types.js";
import { decodeUiLayoutShareCode, normalizeUiLayoutPreferences } from "./ui-layout-share.js";

export type AppearancePreferences = Pick<AppPreferences, "uiTheme" | "wallpaperGlassIntensity" | "wallpaperGlassVariant" | "uiLayout">;
const themes = new Set<UiTheme>(["apple", "fluent", "midnight", "utility", "glass", "wallpaper", "clear", "system"]);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// Explicitly select visual fields: no application paths, permissions, or window geometry.
export function normalizeAppearance(input: Partial<AppearancePreferences>): AppearancePreferences {
  return {
    uiTheme: themes.has(input.uiTheme as UiTheme) ? input.uiTheme! : "apple",
    wallpaperGlassIntensity: typeof input.wallpaperGlassIntensity === "number" && Number.isFinite(input.wallpaperGlassIntensity) ? Math.round(Math.min(100, Math.max(0, input.wallpaperGlassIntensity))) : 55,
    wallpaperGlassVariant: input.wallpaperGlassVariant === "light" ? "light" : "dark",
    uiLayout: normalizeUiLayoutPreferences(input.uiLayout)
  };
}

export function encodeAppearanceShareCode(input: AppearancePreferences): string {
  return "seui:v2:" + btoa(encodeURIComponent(JSON.stringify(normalizeAppearance(input))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeAppearanceShareCode(code: string, current: AppearancePreferences):
  { ok: true; appearance: AppearancePreferences; legacy: boolean } | { ok: false; message: string } {
  const value = code.trim();
  if (value.length > 12000) return { ok: false, message: "分享码过长，请检查复制的内容。" };
  if (value.startsWith("seui:v1:")) {
    const decoded = decodeUiLayoutShareCode(value);
    return decoded.ok ? { ok: true, appearance: normalizeAppearance({ ...current, uiLayout: decoded.preferences }), legacy: true }
      : { ok: false, message: "分享码不完整或已损坏。" };
  }
  if (!value.startsWith("seui:v2:")) return { ok: false, message: "不支持此分享码，请使用 Start Engineer 的界面分享码。" };
  try {
    const payload = value.slice(8).replace(/-/g, "+").replace(/_/g, "/");
    const parsed: unknown = JSON.parse(decodeURIComponent(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="))));
    if (!isRecord(parsed) || !isRecord(parsed.uiLayout) || !themes.has(parsed.uiTheme as UiTheme)) throw new Error("Invalid appearance");
    return { ok: true, appearance: normalizeAppearance(parsed as Partial<AppearancePreferences>), legacy: false };
  } catch {
    return { ok: false, message: "分享码不完整或已损坏，请重新复制。" };
  }
}
