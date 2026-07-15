import { describe, expect, it } from "vitest";
import { decodeUiLayoutShareCode, encodeUiLayoutShareCode, normalizeUiLayoutPreferences } from "./ui-layout-share.js";

describe("UI layout share codes", () => {
  it("encodes only constrained UI preferences and decodes them back", () => {
    const code = encodeUiLayoutShareCode({
      uiScale: 112,
      backgroundColor: "#DDEEFF",
      cardSize: "large",
      gridDensity: "compact",
      sidebarWidth: "wide",
      brandIconSize: "large",
      backgroundTone: "aurora",
      showRunningStatus: false,
      showAppNames: true,
      showBatchActions: false,
      showSearchBar: true
    });

    expect(code.startsWith("seui:v1:")).toBe(true);
    expect(code).not.toContain("C:");
    expect(decodeUiLayoutShareCode(code)).toEqual({
      ok: true,
      preferences: {
        uiScale: 112,
        backgroundColor: "#DDEEFF",
        cardSize: "large",
        gridDensity: "compact",
        sidebarWidth: "wide",
        brandIconSize: "large",
        backgroundTone: "aurora",
        showRunningStatus: false,
        showAppNames: true,
        showBatchActions: false,
        showSearchBar: true
      }
    });
  });

  it("normalizes invalid or missing layout values to safe defaults", () => {
    expect(normalizeUiLayoutPreferences({
      uiScale: 500,
      backgroundColor: "javascript:alert(1)",
      cardSize: "giant",
      gridDensity: "dense",
      sidebarWidth: "wide",
      brandIconSize: "huge",
      backgroundTone: "script",
      showRunningStatus: false
    } as never)).toEqual({
      uiScale: 125,
      backgroundColor: "",
      cardSize: "medium",
      gridDensity: "standard",
      sidebarWidth: "wide",
      brandIconSize: "standard",
      backgroundTone: "default",
      showRunningStatus: false,
      showAppNames: false,
      showBatchActions: true,
      showSearchBar: true
    });
  });

  it("rejects malformed or unsupported share codes", () => {
    expect(decodeUiLayoutShareCode("not-a-share-code")).toEqual({ ok: false, reason: "invalid-prefix" });
    expect(decodeUiLayoutShareCode("seui:v9:abc")).toEqual({ ok: false, reason: "unsupported-version" });
    expect(decodeUiLayoutShareCode("seui:v1:%%%")).toEqual({ ok: false, reason: "invalid-payload" });
  });
});
