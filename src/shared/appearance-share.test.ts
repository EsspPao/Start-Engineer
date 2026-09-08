import { describe, expect, it } from "vitest";
import { decodeAppearanceShareCode, encodeAppearanceShareCode, normalizeAppearance } from "./appearance-share.js";
import { encodeUiLayoutShareCode } from "./ui-layout-share.js";

const current = normalizeAppearance({ uiTheme: "wallpaper", wallpaperGlassIntensity: 72, wallpaperGlassVariant: "light" });
const rawCode = (value: unknown, version = "v2") => `seui:${version}:${btoa(encodeURIComponent(JSON.stringify(value)))}`;

describe("complete appearance sharing", () => {
  it("round trips all visual fields and excludes local and privilege settings", () => {
    const input = { ...current, executablePath: "C:\\secret.exe", runAsAdministrator: true, windowBounds: { width: 2000 }, uiLayout: { ...current.uiLayout, showRunningStatus: false, backgroundColor: "#aabbcc", cardSize: "large" as const } };
    const code = encodeAppearanceShareCode(input);
    expect(decodeAppearanceShareCode(code, normalizeAppearance({}))).toEqual({ ok: true, legacy: false, appearance: { ...current, uiLayout: { ...current.uiLayout, showRunningStatus: true, backgroundColor: "#AABBCC", cardSize: "large" } } });
    const decoded = decodeURIComponent(atob(code.slice(8).replace(/-/g, "+").replace(/_/g, "/")));
    expect(decoded).not.toMatch(/secret|runAsAdministrator|windowBounds/);
  });
  it("imports v1 layout while preserving the receiver's theme", () => {
    const result = decodeAppearanceShareCode(encodeUiLayoutShareCode({ cardSize: "small" }), current);
    expect(result).toMatchObject({ ok: true, legacy: true, appearance: { uiTheme: "wallpaper", wallpaperGlassIntensity: 72, uiLayout: { cardSize: "small" } } });
  });
  it("rejects malformed, oversized, future, and non-object payloads", () => {
    for (const code of ["seui:v3:abc", "seui:v2:%%%", "x".repeat(12001), rawCode(null), rawCode([]), rawCode({}), rawCode({ uiTheme: "unknown", uiLayout: {} }), rawCode(null, "v1"), rawCode([], "v1")]) {
      expect(decodeAppearanceShareCode(code, current).ok).toBe(false);
    }
  });
  it("normalizes imported controls without mutating the current design", () => {
    const before = structuredClone(current);
    const result = decodeAppearanceShareCode(rawCode({ ...current, wallpaperGlassIntensity: 500, uiLayout: { uiScale: 0, backgroundColor: "url(file:///secret)", showRunningStatus: false } }), current);
    expect(result).toMatchObject({ ok: true, appearance: { wallpaperGlassIntensity: 100, uiLayout: { uiScale: 80, backgroundColor: "", showRunningStatus: true } } });
    expect(current).toEqual(before);
  });
});
