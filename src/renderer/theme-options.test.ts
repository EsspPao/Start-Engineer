import { describe, expect, it } from "vitest";
import { themeOptions } from "./theme-options";

describe("themeOptions", () => {
  it("includes Wallpaper Glass with compact tooltip copy", () => {
    const wallpaper = themeOptions.find((theme) => theme.id === "wallpaper");

    expect(wallpaper?.name).toBe("Wallpaper Glass");
    expect(wallpaper?.description).toContain("壁纸");
    expect(wallpaper?.title).toContain("窗口背景透出壁纸");
    expect(themeOptions.find((theme) => theme.id === "system")?.description).toContain("深色墨青");
  });

  it("describes the non-clear presets as color palettes rather than different layouts", () => {
    for (const id of ["apple", "fluent", "midnight", "utility", "glass"] as const) {
      expect(themeOptions.find((theme) => theme.id === id)?.description).toContain("玻璃");
    }
  });

  it("includes the Clear Desktop transparent preset", () => {
    const clear = themeOptions.find((theme) => theme.id === "clear");

    expect(clear?.name).toBe("Clear Desktop");
    expect(clear?.description).toContain("无模糊透明");
    expect(clear?.title).toContain("TranslucentTB");
  });
});
