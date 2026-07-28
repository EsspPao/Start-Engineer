import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEntry, AppGroup, AppPreferences } from "../shared/types.js";
import { SearchService } from "./search-service.js";

const groups: AppGroup[] = [
  { id: "games", name: "游戏", icon: "gamepad", isSystem: false, order: 0 }
];

afterEach(() => vi.unstubAllEnvs());

describe("Store application discovery", () => {
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
});
