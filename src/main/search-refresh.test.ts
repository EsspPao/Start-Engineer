import { afterEach, describe, expect, it, vi } from "vitest";
import { runNativeHelper } from "./native-helper.js";
import { SearchService } from "./search-service.js";
import type { AppEntry, AppPreferences } from "../shared/types.js";

vi.mock("./native-helper.js", () => ({ runNativeHelper: vi.fn() }));
afterEach(() => vi.resetAllMocks());

function setup() {
  let apps: AppEntry[] = [];
  let id = 0;
  return new SearchService({
    getPath: () => process.cwd(),
    runPowerShell: async () => { throw new Error("scan failed"); },
    getPreferences: () => ({ everythingCliPath: "Z:\\missing\\es.exe" }) as AppPreferences,
    savePreferences: (preferences) => preferences,
    getGroups: () => [{ id: "games", name: "游戏", icon: "gamepad", isSystem: false, order: 0 }],
    validGroupId: () => "games",
    loadApps: () => apps,
    saveApps: (next) => { apps = next; },
    cacheIcon: async (entry) => entry,
    randomId: () => String(++id),
    listWindowsStoreApps: async () => []
  });
}

const installed = JSON.stringify([{ name: "UU加速器", targetPath: process.execPath, source: "start-menu" }]);

describe("application search refresh after installation", () => {
  it("finds a newly installed app on the same query, hides its download and allows adding it", async () => {
    const scan = vi.mocked(runNativeHelper).mockResolvedValue("[]");
    const service = setup();
    const [before, downloadsBefore] = await Promise.all([service.searchCandidates("uu"), service.searchInstallable("uu")]);
    expect(before).toEqual([]);
    expect(downloadsBefore.some((app) => app.id === "uu-accelerator")).toBe(true);
    expect(scan).toHaveBeenCalledTimes(1);
    scan.mockResolvedValue(installed);
    const [after, downloadsAfter] = await Promise.all([service.searchCandidates("uu"), service.searchInstallable("uu")]);
    expect(scan).toHaveBeenCalledTimes(2);
    expect(after).toHaveLength(1);
    expect(after[0].name).toBe("UU加速器");
    expect(downloadsAfter.some((app) => app.id === "uu-accelerator")).toBe(false);
    await expect(service.addCandidate(after[0].id, "games")).resolves.toMatchObject({ added: true });
  });

  it("removes uninstalled shortcuts and restores the download entry", async () => {
    const scan = vi.mocked(runNativeHelper).mockResolvedValue(installed);
    const service = setup();
    expect(await service.searchCandidates("uu")).toHaveLength(1);
    scan.mockResolvedValue("[]");
    expect(await service.searchCandidates("uu")).toEqual([]);
    expect((await service.searchInstallable("uu")).some((app) => app.id === "uu-accelerator")).toBe(true);
  });

  it("recovers from a failed scan on a later search", async () => {
    const scan = vi.mocked(runNativeHelper).mockRejectedValue(new Error("unavailable"));
    const service = setup();
    await expect(service.searchCandidates("uu")).rejects.toThrow("scan failed");
    scan.mockResolvedValue(installed);
    expect(await service.searchCandidates("uu")).toHaveLength(1);
  });
});
