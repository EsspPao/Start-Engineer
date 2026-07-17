import { describe, expect, it, vi } from "vitest";
import { getManagedEverythingPaths } from "./search-dependencies.js";
import { SearchDependencyService } from "./search-dependency-service.js";
import { defaultPreferences } from "./preferences.js";

function setup(overrides: { failDownload?: boolean } = {}) {
  let preferences = { ...defaultPreferences };
  const existing = new Set<string>();
  const started: string[] = [];
  const clearTemp = vi.fn();
  const service = new SearchDependencyService({
    getUserDataPath: () => "C:\\Data",
    loadPreferences: () => preferences,
    savePreferences: (next) => { preferences = next; return next; },
    exists: (path) => existing.has(path),
    download: async () => { if (overrides.failDownload) throw new Error("网络不可用"); },
    expand: async (_zip, destination) => {
      const paths = getManagedEverythingPaths("C:\\Data");
      if (destination === paths.root) {
        existing.add(paths.everythingPath);
        existing.add(paths.everythingCliPath);
      }
    },
    clearTemp,
    startEverything: (path) => started.push(path)
  });
  return { service, preferences: () => preferences, started, clearTemp };
}

describe("search-dependency-service", () => {
  it("prepares, persists and starts managed Everything dependencies", async () => {
    const { service, preferences, started } = setup();
    const result = await service.prepare();
    expect(result.state).toBe("ready");
    expect(preferences().everythingCliPath).toMatch(/ES\.exe$/);
    expect(started).toHaveLength(1);
  });

  it("deduplicates concurrent preparation", async () => {
    const { service } = setup();
    const first = service.prepare();
    const second = service.prepare();
    expect(second).toBe(first);
    await first;
  });

  it("returns a failed state and clears temporary files", async () => {
    const { service, clearTemp } = setup({ failDownload: true });
    await expect(service.prepare()).resolves.toMatchObject({ state: "failed", message: "网络不可用" });
    expect(clearTemp).toHaveBeenCalledTimes(2);
  });
});
