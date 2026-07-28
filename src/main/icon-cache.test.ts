import { describe, expect, it } from "vitest";
import type { AppEntry } from "../shared/types.js";
import { APP_ICON_CACHE_VERSION, shouldRefreshAppIcon } from "./icon-cache.js";

const entry = (overrides: Partial<AppEntry> = {}): AppEntry => ({
  id: "app-1",
  name: "Demo",
  category: "Tools",
  groupId: "tools",
  executablePath: "C:\\Demo\\demo.exe",
  processName: "demo",
  accent: "#2f66e8",
  iconCachePath: "C:\\cache\\demo.png",
  iconDataUrl: "data:image/png;base64,AA==",
  iconCacheVersion: APP_ICON_CACHE_VERSION,
  iconPixelSize: 128,
  ...overrides
});

describe("shouldRefreshAppIcon", () => {
  it("keeps a current high-resolution cache", () => {
    expect(shouldRefreshAppIcon(entry(), true)).toBe(false);
  });

  it.each([
    ["missing image", { iconDataUrl: undefined }],
    ["old cache version", { iconCacheVersion: 1 }],
    ["low resolution", { iconPixelSize: 48 }]
  ])("refreshes %s", (_label, overrides) => {
    expect(shouldRefreshAppIcon(entry(overrides), true)).toBe(true);
  });

  it.each(["missing", "damaged"])("refreshes a %s cache file", () => {
    expect(shouldRefreshAppIcon(entry(), false)).toBe(true);
  });

  it("does not retry entries without an executable", () => {
    expect(shouldRefreshAppIcon(entry({ executablePath: "" }), false)).toBe(false);
  });

  it("refreshes a Windows Store entry from its stable application identity", () => {
    expect(shouldRefreshAppIcon(entry({
      executablePath: "",
      appUserModelId: "OpenAI.Codex_2p2nqsd0c76g0!App",
      iconDataUrl: undefined
    }), false)).toBe(true);
  });
});
