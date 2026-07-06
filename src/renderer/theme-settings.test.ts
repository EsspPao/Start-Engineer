import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WallpaperGlassIntensityControl, WallpaperGlassVariantControl } from "./theme-settings";

describe("WallpaperGlassIntensityControl", () => {
  it("renders the compact slider and direct value input", () => {
    const html = renderToStaticMarkup(createElement(WallpaperGlassIntensityControl, {
      value: 55,
      onChange: vi.fn(),
    }));

    expect(html).toContain("壁纸融合强度");
    expect(html).toContain("融合强度");
    expect(html).toContain('type="range"');
    expect(html).toContain('type="number"');
    expect(html).toContain('min="0"');
    expect(html).toContain('max="100"');
    expect(html).toContain('value="55"');
    expect(html).toContain("输入融合强度");
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
