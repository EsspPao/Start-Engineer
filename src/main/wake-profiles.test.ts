import { describe, expect, it } from "vitest";
import type { AppEntry } from "../shared/types.js";
import { matchWakeProfile, resolveWakePolicy } from "./wake-profiles.js";

const app = (overrides: Partial<AppEntry> = {}): AppEntry => ({
  id: "app-1",
  name: "Demo",
  category: "工具",
  groupId: "tools",
  executablePath: "C:\\Apps\\Demo\\Demo.exe",
  processName: "Demo",
  accent: "#2563eb",
  ...overrides
});

describe("wake profiles", () => {
  it("uses window-only for unknown applications", () => {
    expect(resolveWakePolicy(app())).toMatchObject({
      profileId: "default",
      profileSource: "default",
      strategy: "window-only",
      allowWindowFocus: true,
      allowSelfLaunchWake: false,
      allowAumidActivation: false,
      maxExternalStateChangingActions: 1
    });
  });

  it("matches specific application profiles before the generic Store profile", () => {
    const codex = app({ name: "Codex", processName: "Codex", appUserModelId: "OpenAI.Codex_123!App" });
    expect(matchWakeProfile(codex)?.id).toBe("codex");
    expect(resolveWakePolicy(codex).strategy).toBe("self-launch");
  });

  it("uses stable AUMID activation for otherwise unknown Store applications", () => {
    expect(resolveWakePolicy(app({ appUserModelId: "Example.Package_123!App" }))).toMatchObject({
      profileId: "windows-store",
      strategy: "aumid",
      allowAumidActivation: true,
      allowSecondScan: true
    });
  });

  it("keeps WeChat window-only with explicit tray window filters", () => {
    expect(resolveWakePolicy(app({ name: "微信", processName: "Weixin", executablePath: "E:\\Tencent\\xwechat\\Weixin.exe" }))).toMatchObject({
      profileId: "wechat",
      strategy: "window-only",
      allowHiddenWindowRestore: false,
      trayRestoreUnsupported: true,
      forbiddenWindowClasses: ["WxTrayIconMessageWindow", "Qt*WxTrayIconMessageWindowClass"]
    });
  });

  it("keeps Notion window-only and asks for manual tray restore", () => {
    expect(resolveWakePolicy(app({ name: "Notion", processName: "Notion", executablePath: "C:\\Program Files\\Notion\\Notion.exe" }))).toMatchObject({
      profileId: "notion",
      strategy: "window-only",
      allowSelfLaunchWake: false,
      allowAumidActivation: false,
      allowHiddenWindowRestore: false,
      trayRestoreUnsupported: true
    });
  });

  it("lets an explicit user choice override behavior without losing the matched profile", () => {
    expect(resolveWakePolicy(app({ name: "微信", processName: "Weixin", wakeStrategy: "self-launch" }))).toMatchObject({
      profileId: "wechat",
      profileSource: "user",
      strategy: "self-launch",
      allowSelfLaunchWake: true,
      allowSecondScan: true
    });
  });
});
