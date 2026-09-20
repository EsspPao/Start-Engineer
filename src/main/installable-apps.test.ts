import { describe, expect, it } from "vitest";
import { filterInstalledApps, getInstallableAppById, searchInstallableApps } from "./installable-apps.js";

describe("installable app catalog search", () => {
  it.each(["UU加速器", "网易UU加速器", "ＵＵ", "uu_launcher"])("finds the official UU accelerator for %s", (query) => {
    expect(searchInstallableApps(query)[0]).toMatchObject({ id: "uu-accelerator", downloadPage: "https://uu.163.com/download/" });
  });
  it("keeps UU accelerator and UU remote installed identities separate", () => {
    const results = searchInstallableApps("uu");
    expect(results.map((app) => app.id)).toEqual(["uu-accelerator", "uu-remote"]);
    expect(filterInstalledApps(results, [{ name: "自定义名称", processName: "uu_launcher" }]).map((app) => app.id)).toEqual(["uu-remote"]);
    expect(filterInstalledApps(results, [{ name: "自定义名称", processName: "GameViewer" }]).map((app) => app.id)).toEqual(["uu-accelerator"]);
  });
  it("does not confuse QQ with QQ Music", () => {
    const results = filterInstalledApps(searchInstallableApps("qq"), [{ name: "QQ", processName: "QQ" }]);
    expect(results.map((app) => app.id)).toEqual(["qq-music"]);
  });
  it.each([
    ["截图贴图", "snipaste", "www.snipaste.com"],
    ["７ＺＩＰ", "7zip", "www.7-zip.org"],
    ["火狐", "firefox", "www.mozilla.org"],
    ["钉钉", "dingtalk", "www.dingtalk.com"],
    ["飞书", "feishu", "www.feishu.cn"],
    ["腾讯会议", "tencent-meeting", "meeting.tencent.com"],
    ["idea", "idea", "www.jetbrains.com"],
    ["github desktop", "github-desktop", "desktop.github.com"]
  ])("finds %s through its official entry", (query, id, hostname) => {
    const result = searchInstallableApps(query)[0];
    expect(result.id).toBe(id);
    expect(new URL(result.downloadPage).hostname).toBe(hostname);
    expect(result.action).toBe("open-download-page");
    expect(getInstallableAppById(id)?.downloadPage).toBe(result.downloadPage);
  });
  it("hides new installed products using Windows executable names", () => {
    for (const [query, processName] of [["钉钉", "DingTalkLauncher"], ["7zip", "7zFM"], ["腾讯会议", "wemeetapp"], ["edge", "msedge"]]) {
      expect(filterInstalledApps(searchInstallableApps(query), [{ name: "已重命名", processName }])).toEqual([]);
    }
  });
  it("limits short queries to names and explicit aliases", () => {
    expect(searchInstallableApps("官方")).toEqual([]);
    expect(searchInstallableApps("ＱＱ")[0].id).toBe("qq");
    expect(searchInstallableApps("微信").map((app) => app.id)).toEqual(["wechat"]);
  });
  it("hides installed app aliases but keeps distinct products", () => {
    const apps = [{ name: "自定义微信名称", processName: "WeChat" }, { name: "Notion Calendar", processName: "Notion Calendar" }];
    expect(filterInstalledApps(searchInstallableApps("微信"), apps)).toEqual([]);
    expect(filterInstalledApps(searchInstallableApps("notion"), apps).map((app) => app.id)).toEqual(["notion"]);
    expect(filterInstalledApps(searchInstallableApps("chrome"), [{ name: "Ｇｏｏｇｌｅ Chrome", processName: "browser" }])).toEqual([]);
  });
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
