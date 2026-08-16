import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEntry, AppGroup, AppPreferences } from "../shared/types.js";
import { SearchService } from "./search-service.js";

const groups: AppGroup[] = [
  { id: "games", name: "游戏", icon: "gamepad", isSystem: false, order: 0 }
];

afterEach(() => vi.unstubAllEnvs());

describe("Store application discovery", () => {
  it("keeps a displayed candidate addable when another search replaces the active candidate list", async () => {
    vi.stubEnv("ProgramData", "Z:\\StartEngineer\\DoesNotExist");
    vi.stubEnv("PUBLIC", "Z:\\StartEngineer\\DoesNotExist");
    let apps: AppEntry[] = [];
    let nextId = 0;
    const service = new SearchService({
      getPath: () => "Z:\\StartEngineer\\DoesNotExist",
      runPowerShell: vi.fn().mockResolvedValue(""),
      getPreferences: () => ({ everythingCliPath: "Z:\\missing\\es.exe" }) as AppPreferences,
      savePreferences: (preferences) => preferences,
      getGroups: () => groups,
      validGroupId: () => "games",
      loadApps: () => apps,
      saveApps: (next) => (apps = next),
      cacheIcon: async (entry) => entry,
      randomId: () => `generated-${++nextId}`,
      listWindowsStoreApps: async () => [{
        name: "MuMu模拟器",
        appUserModelId: "Netease.MuMu_123!App",
        packageFamilyName: "Netease.MuMu_123",
        executablePath: "C:\\Program Files\\WindowsApps\\Netease.MuMu_1.0.0.0_x64__123\\MuMu.exe",
        processName: "MuMu",
        workingDirectory: "C:\\Program Files\\WindowsApps\\Netease.MuMu_1.0.0.0_x64__123"
      }, {
        name: "ChatGPT",
        appUserModelId: "OpenAI.ChatGPT_123!App",
        packageFamilyName: "OpenAI.ChatGPT_123",
        executablePath: "C:\\Program Files\\WindowsApps\\OpenAI.ChatGPT_1.0.0.0_x64__123\\ChatGPT.exe",
        processName: "ChatGPT",
        workingDirectory: "C:\\Program Files\\WindowsApps\\OpenAI.ChatGPT_1.0.0.0_x64__123"
      }]
    });

    const [mumuCandidate] = await service.searchCandidates("mumu");
    await service.searchCandidates("chatgpt");

    await expect(service.addCandidate(mumuCandidate.id, "games")).resolves.toMatchObject({
      added: true
    });
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({
      name: "MuMu模拟器",
      appUserModelId: "Netease.MuMu_123!App"
    });
  });

  it("repairs the existing card instead of adding a duplicate after a package update", async () => {
    vi.stubEnv("ProgramData", "Z:\\StartEngineer\\DoesNotExist");
    vi.stubEnv("PUBLIC", "Z:\\StartEngineer\\DoesNotExist");
    let apps: AppEntry[] = [{
      id: "existing-chatgpt",
      name: "我的 ChatGPT",
      category: "游戏",
      groupId: "games",
      executablePath: "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.715.7063.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe",
      workingDirectory: "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.715.7063.0_x64__2p2nqsd0c76g0\\app",
      processName: "ChatGPT",
      accent: "#123456"
    }];
    const saveApps = vi.fn((next: AppEntry[]) => {
      apps = next;
      return next;
    });
    const cacheIcon = vi.fn(async (entry: AppEntry) => entry);
    const service = new SearchService({
      getPath: () => "Z:\\StartEngineer\\DoesNotExist",
      runPowerShell: vi.fn().mockResolvedValue(""),
      getPreferences: () => ({ everythingCliPath: "Z:\\missing\\es.exe" }) as AppPreferences,
      savePreferences: (preferences) => preferences,
      getGroups: () => groups,
      validGroupId: () => "games",
      loadApps: () => apps,
      saveApps,
      cacheIcon,
      randomId: () => "candidate-id",
      listWindowsStoreApps: async () => [{
        name: "ChatGPT",
        appUserModelId: "OpenAI.Codex_2p2nqsd0c76g0!App",
        packageFamilyName: "OpenAI.Codex_2p2nqsd0c76g0",
        executablePath: "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.721.4979.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe",
        processName: "ChatGPT",
        workingDirectory: "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.721.4979.0_x64__2p2nqsd0c76g0\\app"
      }]
    });

    const [candidate] = await service.searchCandidates("c");
    expect(candidate).toMatchObject({
      id: "candidate-id",
      source: "windows-store",
      alreadyAdded: true,
      existingAppId: "existing-chatgpt"
    });

    await expect(service.addCandidate(candidate.id, "games")).resolves.toMatchObject({
      appId: "existing-chatgpt",
      added: false,
      alreadyAdded: true
    });
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({
      id: "existing-chatgpt",
      name: "我的 ChatGPT",
      groupId: "games",
      accent: "#123456",
      appUserModelId: "OpenAI.Codex_2p2nqsd0c76g0!App",
      executablePath: "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.721.4979.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe"
    });
    expect(cacheIcon).toHaveBeenCalledOnce();
    expect(saveApps).toHaveBeenCalledOnce();
  });

  it("reuses a verified template icon during first-run import", async () => {
    vi.stubEnv("ProgramData", "Z:\\StartEngineer\\DoesNotExist");
    vi.stubEnv("PUBLIC", "Z:\\StartEngineer\\DoesNotExist");
    let apps: AppEntry[] = [];
    let preferences = { everythingCliPath: "Z:\\missing\\es.exe", firstRunImportCompleted: false } as AppPreferences;
    const cacheIcon = vi.fn(async (entry: AppEntry) => entry);
    const template = {
      id: "template-steam",
      name: "Steam",
      category: "游戏",
      groupId: "games",
      executablePath: process.execPath,
      processName: "steam",
      accent: "#2f66e8",
      iconCachePath: process.execPath,
      iconDataUrl: "data:image/png;base64,verified",
      iconCacheVersion: 3,
      iconPixelSize: 128
    } satisfies AppEntry;
    const service = new SearchService({
      getPath: () => "Z:\\StartEngineer\\DoesNotExist",
      runPowerShell: vi.fn().mockResolvedValue(""),
      getPreferences: () => preferences,
      savePreferences: (next) => (preferences = next),
      getGroups: () => groups,
      validGroupId: () => "games",
      loadApps: () => apps,
      saveApps: (next) => (apps = next),
      cacheIcon,
      randomId: () => "imported-steam",
      listWindowsStoreApps: async () => [],
      loadFirstRunImportTemplate: () => [template]
    });

    const imported = await service.autoImportFirstRunApps();
    expect(imported[0]).toMatchObject({
      name: "Steam",
      iconCachePath: process.execPath,
      iconDataUrl: "data:image/png;base64,verified",
      iconCacheVersion: 3,
      iconPixelSize: 128
    });
    expect(cacheIcon).not.toHaveBeenCalled();
    expect(preferences.firstRunImportCompleted).toBe(true);
  });

  it("does not import a template app that is unavailable on this computer", async () => {
    vi.stubEnv("ProgramData", "Z:\\StartEngineer\\DoesNotExist");
    vi.stubEnv("PUBLIC", "Z:\\StartEngineer\\DoesNotExist");
    let apps: AppEntry[] = [];
    let preferences = { everythingCliPath: "Z:\\missing\\es.exe", firstRunImportCompleted: false } as AppPreferences;
    const cacheIcon = vi.fn(async (entry: AppEntry) => entry);
    const template = {
      id: "missing-store",
      name: "Missing Store App",
      category: "游戏",
      groupId: "games",
      executablePath: "Z:\\Missing\\StoreApp.exe",
      processName: "MissingStoreApp",
      appUserModelId: "Missing.Store_123!App",
      accent: "#2f66e8"
    } satisfies AppEntry;
    const service = new SearchService({
      getPath: () => "Z:\\StartEngineer\\DoesNotExist",
      runPowerShell: vi.fn().mockResolvedValue(""),
      getPreferences: () => preferences,
      savePreferences: (next) => (preferences = next),
      getGroups: () => groups,
      validGroupId: () => "games",
      loadApps: () => apps,
      saveApps: (next) => (apps = next),
      cacheIcon,
      randomId: () => "missing-candidate",
      listWindowsStoreApps: async () => [],
      loadFirstRunImportTemplate: () => [template]
    });

    await expect(service.autoImportFirstRunApps()).resolves.toEqual([]);
    expect(cacheIcon).not.toHaveBeenCalled();
    expect(preferences.firstRunImportCompleted).toBe(true);
  });

  it("skips first-run discovery when automatic import is already complete", async () => {
    vi.stubEnv("ProgramData", "Z:\\StartEngineer\\DoesNotExist");
    vi.stubEnv("PUBLIC", "Z:\\StartEngineer\\DoesNotExist");
    const apps: AppEntry[] = [];
    const preferences = { everythingCliPath: "Z:\\missing\\es.exe", firstRunImportCompleted: true } as AppPreferences;
    const listWindowsStoreApps = vi.fn(async () => []);
    const loadFirstRunImportTemplate = vi.fn(() => {
      throw new Error("first-run discovery should not start");
    });
    const savePreferences = vi.fn((next: AppPreferences) => next);
    const saveApps = vi.fn((next: AppEntry[]) => next);
    const cacheIcon = vi.fn(async (entry: AppEntry) => entry);
    const service = new SearchService({
      getPath: () => "Z:\\StartEngineer\\DoesNotExist",
      runPowerShell: vi.fn().mockResolvedValue(""),
      getPreferences: () => preferences,
      savePreferences,
      getGroups: () => groups,
      validGroupId: () => "games",
      loadApps: () => apps,
      saveApps,
      cacheIcon,
      randomId: () => "unused",
      listWindowsStoreApps,
      loadFirstRunImportTemplate
    });

    await expect(service.autoImportFirstRunApps()).resolves.toBe(apps);
    expect(listWindowsStoreApps).not.toHaveBeenCalled();
    expect(loadFirstRunImportTemplate).not.toHaveBeenCalled();
    expect(savePreferences).not.toHaveBeenCalled();
    expect(saveApps).not.toHaveBeenCalled();
    expect(cacheIcon).not.toHaveBeenCalled();
  });

  it("marks first-run import complete without scanning when apps already exist", async () => {
    vi.stubEnv("ProgramData", "Z:\\StartEngineer\\DoesNotExist");
    vi.stubEnv("PUBLIC", "Z:\\StartEngineer\\DoesNotExist");
    const apps: AppEntry[] = [{
      id: "existing",
      name: "Existing App",
      category: "游戏",
      groupId: "games",
      executablePath: process.execPath,
      processName: "existing",
      accent: "#2f66e8"
    }];
    let preferences = { everythingCliPath: "Z:\\missing\\es.exe", firstRunImportCompleted: false } as AppPreferences;
    const listWindowsStoreApps = vi.fn(async () => []);
    const loadFirstRunImportTemplate = vi.fn(() => {
      throw new Error("first-run discovery should not start");
    });
    const savePreferences = vi.fn((next: AppPreferences) => (preferences = next));
    const saveApps = vi.fn((next: AppEntry[]) => next);
    const cacheIcon = vi.fn(async (entry: AppEntry) => entry);
    const service = new SearchService({
      getPath: () => "Z:\\StartEngineer\\DoesNotExist",
      runPowerShell: vi.fn().mockResolvedValue(""),
      getPreferences: () => preferences,
      savePreferences,
      getGroups: () => groups,
      validGroupId: () => "games",
      loadApps: () => apps,
      saveApps,
      cacheIcon,
      randomId: () => "unused",
      listWindowsStoreApps,
      loadFirstRunImportTemplate
    });

    await expect(service.autoImportFirstRunApps()).resolves.toBe(apps);
    expect(preferences.firstRunImportCompleted).toBe(true);
    expect(savePreferences).toHaveBeenCalledOnce();
    expect(listWindowsStoreApps).not.toHaveBeenCalled();
    expect(loadFirstRunImportTemplate).not.toHaveBeenCalled();
    expect(saveApps).not.toHaveBeenCalled();
    expect(cacheIcon).not.toHaveBeenCalled();
  });

  it("cancels automatic import when another flow completes first-run setup during discovery", async () => {
    vi.stubEnv("ProgramData", "Z:\\StartEngineer\\DoesNotExist");
    vi.stubEnv("PUBLIC", "Z:\\StartEngineer\\DoesNotExist");
    const apps: AppEntry[] = [];
    let preferences = { everythingCliPath: "Z:\\missing\\es.exe", firstRunImportCompleted: false } as AppPreferences;
    let resolveStoreScan!: (value: []) => void;
    const storeScan = new Promise<[]>((resolve) => { resolveStoreScan = resolve; });
    const savePreferences = vi.fn((next: AppPreferences) => (preferences = next));
    const saveApps = vi.fn((next: AppEntry[]) => next);
    const cacheIcon = vi.fn(async (entry: AppEntry) => entry);
    const service = new SearchService({
      getPath: () => "Z:\\StartEngineer\\DoesNotExist",
      runPowerShell: vi.fn().mockResolvedValue(""),
      getPreferences: () => preferences,
      savePreferences,
      getGroups: () => groups,
      validGroupId: () => "games",
      loadApps: () => apps,
      saveApps,
      cacheIcon,
      randomId: () => "auto-steam",
      listWindowsStoreApps: () => storeScan,
      loadFirstRunImportTemplate: () => [{
        id: "template-steam",
        name: "Steam",
        category: "游戏",
        groupId: "games",
        executablePath: process.execPath,
        processName: "steam",
        accent: "#2f66e8"
      }]
    });

    const automaticImport = service.autoImportFirstRunApps();
    preferences = { ...preferences, firstRunImportCompleted: true };
    resolveStoreScan([]);

    await expect(automaticImport).resolves.toBe(apps);
    expect(preferences.firstRunImportCompleted).toBe(true);
    expect(savePreferences).not.toHaveBeenCalled();
    expect(saveApps).not.toHaveBeenCalled();
    expect(cacheIcon).not.toHaveBeenCalled();
  });

  it("does not bulk import when an app is added while the delayed scan is running", async () => {
    vi.stubEnv("ProgramData", "Z:\\StartEngineer\\DoesNotExist");
    vi.stubEnv("PUBLIC", "Z:\\StartEngineer\\DoesNotExist");
    let apps: AppEntry[] = [];
    let preferences = { everythingCliPath: "Z:\\missing\\es.exe", firstRunImportCompleted: false } as AppPreferences;
    let resolveStoreScan!: (value: []) => void;
    const storeScan = new Promise<[]>((resolve) => { resolveStoreScan = resolve; });
    const cacheIcon = vi.fn(async (entry: AppEntry) => entry);
    const template = {
      id: "template-steam",
      name: "Steam",
      category: "游戏",
      groupId: "games",
      executablePath: process.execPath,
      processName: "steam",
      accent: "#2f66e8"
    } satisfies AppEntry;
    const service = new SearchService({
      getPath: () => "Z:\\StartEngineer\\DoesNotExist",
      runPowerShell: vi.fn().mockResolvedValue(""),
      getPreferences: () => preferences,
      savePreferences: (next) => (preferences = next),
      getGroups: () => groups,
      validGroupId: () => "games",
      loadApps: () => apps,
      saveApps: (next) => (apps = next),
      cacheIcon,
      randomId: () => "auto-steam",
      listWindowsStoreApps: () => storeScan,
      loadFirstRunImportTemplate: () => [template]
    });

    const automaticImport = service.autoImportFirstRunApps();
    apps = [{
      id: "manual",
      name: "Manual App",
      category: "游戏",
      groupId: "games",
      executablePath: process.execPath,
      processName: "manual",
      accent: "#2f66e8"
    }];
    resolveStoreScan([]);

    await expect(automaticImport).resolves.toEqual(apps);
    expect(cacheIcon).not.toHaveBeenCalled();
    expect(preferences.firstRunImportCompleted).toBe(true);
  });

  it("deduplicates concurrent automatic import requests", async () => {
    vi.stubEnv("ProgramData", "Z:\\StartEngineer\\DoesNotExist");
    vi.stubEnv("PUBLIC", "Z:\\StartEngineer\\DoesNotExist");
    let apps: AppEntry[] = [];
    let preferences = { everythingCliPath: "Z:\\missing\\es.exe", firstRunImportCompleted: false } as AppPreferences;
    let resolveStoreScan!: (value: []) => void;
    const storeScan = new Promise<[]>((resolve) => { resolveStoreScan = resolve; });
    const listWindowsStoreApps = vi.fn(() => storeScan);
    const service = new SearchService({
      getPath: () => "Z:\\StartEngineer\\DoesNotExist",
      runPowerShell: vi.fn().mockResolvedValue(""),
      getPreferences: () => preferences,
      savePreferences: (next) => (preferences = next),
      getGroups: () => groups,
      validGroupId: () => "games",
      loadApps: () => apps,
      saveApps: (next) => (apps = next),
      cacheIcon: async (entry) => entry,
      randomId: () => "unused",
      listWindowsStoreApps
    });

    const first = service.autoImportFirstRunApps();
    const second = service.autoImportFirstRunApps();
    expect(second).toBe(first);
    resolveStoreScan([]);

    await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
    expect(listWindowsStoreApps).toHaveBeenCalledOnce();
    expect(preferences.firstRunImportCompleted).toBe(true);
  });

  it("leaves first-run import pending after a scan failure so the next launch can retry", async () => {
    vi.stubEnv("ProgramData", "Z:\\StartEngineer\\DoesNotExist");
    vi.stubEnv("PUBLIC", "Z:\\StartEngineer\\DoesNotExist");
    let apps: AppEntry[] = [];
    let preferences = { everythingCliPath: "Z:\\missing\\es.exe", firstRunImportCompleted: false } as AppPreferences;
    let shouldFail = true;
    const service = new SearchService({
      getPath: () => "Z:\\StartEngineer\\DoesNotExist",
      runPowerShell: vi.fn().mockResolvedValue(""),
      getPreferences: () => preferences,
      savePreferences: (next) => (preferences = next),
      getGroups: () => groups,
      validGroupId: () => "games",
      loadApps: () => apps,
      saveApps: (next) => (apps = next),
      cacheIcon: async (entry) => entry,
      randomId: () => "unused",
      listWindowsStoreApps: async () => [],
      loadFirstRunImportTemplate: () => {
        if (shouldFail) throw new Error("template unavailable");
        return [];
      }
    });

    await expect(service.autoImportFirstRunApps()).rejects.toThrow("template unavailable");
    expect(preferences.firstRunImportCompleted).toBe(false);
    expect(apps).toEqual([]);

    shouldFail = false;
    await expect(service.autoImportFirstRunApps()).resolves.toEqual([]);
    expect(preferences.firstRunImportCompleted).toBe(true);
  });

  it("retries automatic import after Store discovery rejects without saving partial state", async () => {
    vi.stubEnv("ProgramData", "Z:\\StartEngineer\\DoesNotExist");
    vi.stubEnv("PUBLIC", "Z:\\StartEngineer\\DoesNotExist");
    let apps: AppEntry[] = [];
    let preferences = { everythingCliPath: "Z:\\missing\\es.exe", firstRunImportCompleted: false } as AppPreferences;
    const saveApps = vi.fn((next: AppEntry[]) => (apps = next));
    const savePreferences = vi.fn((next: AppPreferences) => (preferences = next));
    const listWindowsStoreApps = vi.fn()
      .mockRejectedValueOnce(new Error("Store discovery unavailable"))
      .mockResolvedValueOnce([{
        name: "Steam",
        appUserModelId: "Valve.Steam_123!App",
        packageFamilyName: "Valve.Steam_123",
        executablePath: "C:\\Program Files\\WindowsApps\\Valve.Steam_1.0.0.0_x64__123\\Steam.exe",
        processName: "steam",
        workingDirectory: "C:\\Program Files\\WindowsApps\\Valve.Steam_1.0.0.0_x64__123"
      }]);
    const service = new SearchService({
      getPath: () => "Z:\\StartEngineer\\DoesNotExist",
      runPowerShell: vi.fn().mockResolvedValue(""),
      getPreferences: () => preferences,
      savePreferences,
      getGroups: () => groups,
      validGroupId: () => "games",
      loadApps: () => apps,
      saveApps,
      cacheIcon: async (entry) => entry,
      randomId: () => "steam-id",
      listWindowsStoreApps
    });

    await expect(service.autoImportFirstRunApps()).rejects.toThrow("Store discovery unavailable");
    expect(apps).toEqual([]);
    expect(preferences.firstRunImportCompleted).toBe(false);
    expect(saveApps).not.toHaveBeenCalled();
    expect(savePreferences).not.toHaveBeenCalled();

    await expect(service.autoImportFirstRunApps()).resolves.toHaveLength(1);
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ name: "Steam", appUserModelId: "Valve.Steam_123!App" });
    expect(preferences.firstRunImportCompleted).toBe(true);
    expect(listWindowsStoreApps).toHaveBeenCalledTimes(2);
    expect(saveApps).toHaveBeenCalledOnce();
    expect(savePreferences).toHaveBeenCalledOnce();
  });

  it("does not duplicate an app manually added while its icon is being cached", async () => {
    vi.stubEnv("ProgramData", "Z:\\StartEngineer\\DoesNotExist");
    vi.stubEnv("PUBLIC", "Z:\\StartEngineer\\DoesNotExist");
    let apps: AppEntry[] = [];
    let preferences = { everythingCliPath: "Z:\\missing\\es.exe", firstRunImportCompleted: false } as AppPreferences;
    let finishIconCache!: () => void;
    const cacheIcon = vi.fn((entry: AppEntry) => new Promise<AppEntry>((resolve) => {
      finishIconCache = () => resolve({ ...entry, iconDataUrl: "data:image/png;base64,cached" });
    }));
    const service = new SearchService({
      getPath: () => "Z:\\StartEngineer\\DoesNotExist",
      runPowerShell: vi.fn().mockResolvedValue(""),
      getPreferences: () => preferences,
      savePreferences: (next) => (preferences = next),
      getGroups: () => groups,
      validGroupId: () => "games",
      loadApps: () => apps,
      saveApps: (next) => (apps = next),
      cacheIcon,
      randomId: () => "auto-steam",
      listWindowsStoreApps: async () => [],
      loadFirstRunImportTemplate: () => [{
        id: "template-steam",
        name: "Steam",
        category: "游戏",
        groupId: "games",
        executablePath: process.execPath,
        processName: "steam",
        accent: "#2f66e8"
      }]
    });

    const automaticImport = service.autoImportFirstRunApps();
    await vi.waitFor(() => expect(cacheIcon).toHaveBeenCalledOnce());
    apps = [{
      id: "manual-steam",
      name: "Steam",
      category: "游戏",
      groupId: "games",
      executablePath: process.execPath,
      processName: "steam",
      accent: "#123456"
    }];
    finishIconCache();

    await expect(automaticImport).resolves.toEqual(apps);
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ id: "manual-steam", accent: "#123456" });
    expect(preferences.firstRunImportCompleted).toBe(true);
  });
});
