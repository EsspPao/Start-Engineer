import { describe, expect, it } from "vitest";
import { searchInstallableApps } from "./installable-apps.js";

describe("installable app catalog search", () => {
  it("finds common apps by English and Chinese aliases", () => {
    const wechat = searchInstallableApps("微信");
    expect(wechat[0]).toMatchObject({
      id: "wechat",
      name: "微信",
      source: "official",
      action: "open-download-page"
    });
    expect(wechat[0].downloadPage).toContain("weixin.qq.com");

    const vscode = searchInstallableApps("vscode");
    expect(vscode[0]).toMatchObject({ id: "vscode", name: "Visual Studio Code" });
  });

  it("prioritizes exact and prefix matches over fuzzy keyword matches", () => {
    const results = searchInstallableApps("steam");
    expect(results.map((item) => item.id).slice(0, 3)).toEqual(["steam"]);
  });

  it("returns only safe download-page entries, not direct silent installers", () => {
    const results = searchInstallableApps("chrome");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((item) => item.action === "open-download-page")).toBe(true);
    expect(results.every((item) => item.downloadPage.startsWith("https://"))).toBe(true);
  });
});
