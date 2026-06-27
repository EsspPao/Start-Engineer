import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WallpaperGlassIntensityControl, WallpaperGlassVariantControl } from "./theme-settings";

describe("WallpaperGlassIntensityControl", () => {
  it("renders the compact weak medium strong selector", () => {
    const html = renderToStaticMarkup(createElement(WallpaperGlassIntensityControl, {
      value: "medium",
      onChange: vi.fn(),
    }));

    expect(html).toContain("壁纸融合强度");
    expect(html).toContain("融合强度");
    expect(html).toContain("弱");
    expect(html).toContain("中");
    expect(html).toContain("强");
    expect(html).toContain('aria-pressed="true"');
  });
});

describe("WallpaperGlassVariantControl", () => {
  it("renders the compact dark light selector", () => {
    const html = renderToStaticMarkup(createElement(WallpaperGlassVariantControl, {
      value: "light",
      onChange: vi.fn(),
    }));

    expect(html).toContain("壁纸玻璃色调");
    expect(html).toContain("玻璃色调");
    expect(html).toContain("深色");
    expect(html).toContain("浅色");
    expect(html).toContain('aria-pressed="true"');
  });
});
