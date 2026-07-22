import { describe, expect, it, vi } from "vitest";
import type { AppEntry, AppGroup } from "../shared/types.js";
import { AppAdditionService } from "./app-addition-service.js";

const groups: AppGroup[] = [{ id: "games", name: "游戏", icon: "gamepad", isSystem: false, order: 0 }];

function createService(overrides: Partial<ConstructorParameters<typeof AppAdditionService>[0]> = {}) {
  const saveApps = vi.fn((apps: AppEntry[]) => apps);
  const service = new AppAdditionService({
    getMainWindow: () => null,
    getGroups: () => groups,
    loadApps: () => [],
    saveApps,
    getApp: () => undefined,
    validGroupId: () => "games",
    cacheIcon: async (entry) => entry,
    exists: () => true,
    createId: () => "new-app",
    chooseExecutable: async () => undefined,
    ...overrides
  });
  return { service, saveApps };
}

describe("AppAdditionService", () => {
  it("keeps the current library when executable selection is cancelled", async () => {
    const existing = [{ id: "existing" } as AppEntry];
    const { service, saveApps } = createService({ loadApps: () => existing });
    await expect(service.addFromDialog("games")).resolves.toBe(existing);
    expect(saveApps).not.toHaveBeenCalled();
  });

  it("adds and persists a selected executable once", async () => {
    const { service, saveApps } = createService({ chooseExecutable: async () => "C:\\Games\\Demo.exe" });
    const apps = await service.addFromDialog("games");
    expect(apps[0]).toMatchObject({ id: "new-app", name: "Demo", groupId: "games" });
    expect(saveApps).toHaveBeenCalledOnce();
  });

  it("accepts a dropped application shortcut", async () => {
    const resolveShortcut = vi.fn(async () => ({ executablePath: "C:\\Apps\\Typora\\Typora.exe", name: "Typora" }));
    const { service, saveApps } = createService({ resolveShortcut });

    const result = await service.addDroppedExecutables(["C:\\Desktop\\Typora.lnk"], "games");

    expect(resolveShortcut).toHaveBeenCalledWith("C:\\Desktop\\Typora.lnk");
    expect(result.apps[0]).toMatchObject({ name: "Typora", executablePath: "C:\\Apps\\Typora\\Typora.exe" });
    expect(saveApps).toHaveBeenCalledOnce();
  });

  it("validates the app before replacing its executable", async () => {
    const { service } = createService();
    await expect(service.pickExecutable("missing")).rejects.toThrow("未找到该应用配置");
  });
});
