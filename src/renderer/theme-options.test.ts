import { describe, expect, it } from "vitest";
import { themeOptions } from "./theme-options";

describe("themeOptions", () => {
  it("includes Wallpaper Glass with compact tooltip copy", () => {
    const wallpaper = themeOptions.find((theme) => theme.id === "wallpaper");

    expect(wallpaper?.name).toBe("Wallpaper Glass");
    expect(wallpaper?.description).toContain("壁纸融合");
    expect(wallpaper?.title).toContain("窗口背景透出壁纸");
  });
});
