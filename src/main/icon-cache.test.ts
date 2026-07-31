import { describe, expect, it } from "vitest";
import type { AppEntry } from "../shared/types.js";
import { APP_ICON_CACHE_VERSION, isNearlySolidDarkIconBitmap, shouldRefreshAppIcon } from "./icon-cache.js";

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

describe("icon quality", () => {
  it("rejects an opaque nearly black square", () => {
    const bitmap = new Uint8Array(16 * 16 * 4);
    for (let index = 0; index < bitmap.length; index += 4) bitmap[index + 3] = 255;
    expect(isNearlySolidDarkIconBitmap(bitmap)).toBe(true);
  });

  it("keeps transparent and visibly colored icons", () => {
    const transparent = new Uint8Array(16 * 16 * 4);
    const colored = new Uint8Array(16 * 16 * 4);
    for (let index = 0; index < colored.length; index += 4) {
      colored[index] = index % 3 === 0 ? 250 : 10;
      colored[index + 1] = 120;
      colored[index + 2] = 40;
      colored[index + 3] = 255;
    }
    expect(isNearlySolidDarkIconBitmap(transparent)).toBe(false);
    expect(isNearlySolidDarkIconBitmap(colored)).toBe(false);
  });
});
