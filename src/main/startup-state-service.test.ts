import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { StartupPerformanceTracker, StartupViewCacheStore } from "./startup-state-service";

const cache = {
  version: 1 as const,
  savedAt: 1,
  activeSection: "games",
  groups: [{ id: "games", name: "游戏", icon: "compass", isSystem: false, order: 0 }],
  apps: [{ id: "a", name: "App", category: "game", groupId: "games", accent: "#fff", iconDataUrl: "data:image/png;base64,AA==" }],
  folders: [],
  groupGridOrders: [],
  appearance: { uiTheme: "wallpaper" as const, wallpaperGlassIntensity: 55, wallpaperGlassVariant: "dark" as const, uiLayout: { uiScale: 1, backgroundColor: "#fff", cardSize: "medium" as const, gridDensity: "standard" as const, sidebarWidth: "standard" as const, brandIconSize: "standard" as const, backgroundTone: "default" as const, showRunningStatus: true, showAppNames: false, showBatchActions: true, showSearchBar: true } }
};

describe("startup state persistence", () => {
  it("keeps only safe rendering fields and ignores executable metadata", () => {
    const directory = mkdtempSync(join(tmpdir(), "start-engineer-startup-"));
    const path = join(directory, "startup-view-cache.json");
    const store = new StartupViewCacheStore(path);
    store.save({ ...cache, apps: [{ ...cache.apps[0], executablePath: "secret.exe", launchedPid: 99 } as never] });
    const serialized = readFileSync(path, "utf8");
    expect(serialized).not.toContain("secret.exe");
    expect(serialized).not.toContain("launchedPid");
    expect(store.load()?.apps[0].name).toBe("App");
  });

  it("records each startup marker once", () => {
    const directory = mkdtempSync(join(tmpdir(), "start-engineer-startup-"));
    vi.spyOn(Date, "now").mockReturnValueOnce(100).mockReturnValue(140);
    const tracker = new StartupPerformanceTracker(join(directory, "startup-performance.json"));
    tracker.mark("electron-ready");
    tracker.mark("electron-ready");
    expect(tracker.diagnostics().current.filter((item) => item.name === "electron-ready")).toEqual([{ name: "electron-ready", elapsedMs: 40 }]);
    vi.restoreAllMocks();
  });
});
