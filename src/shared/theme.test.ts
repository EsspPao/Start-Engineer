import { describe, expect, it } from "vitest";
import { resolveUiTheme, themeUsesMica } from "./theme.js";

describe("theme resolution", () => {
  it("maps the system theme to Utility in light mode and Midnight in dark mode", () => {
    expect(resolveUiTheme("system", false)).toBe("fluent");
    expect(resolveUiTheme("system", true)).toBe("midnight");
  });

  it("keeps fixed themes unchanged", () => {
    expect(resolveUiTheme("fluent", true)).toBe("fluent");
    expect(resolveUiTheme("glass", false)).toBe("glass");
    expect(resolveUiTheme("wallpaper", true)).toBe("wallpaper");
  });

  it("only enables Mica for Fluent and Refined Glass", () => {
    expect(themeUsesMica("fluent")).toBe(true);
    expect(themeUsesMica("glass")).toBe(true);
    expect(themeUsesMica("utility")).toBe(false);
    expect(themeUsesMica("midnight")).toBe(false);
    expect(themeUsesMica("wallpaper")).toBe(false);
  });
});
