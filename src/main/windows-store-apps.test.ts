import { describe, expect, it } from "vitest";
import type { AppEntry } from "../shared/types.js";
import {
  findWindowsStoreApp,
  inferPackageFamilyName,
  parseWindowsStoreApps,
  windowsStoreShellTarget
} from "./windows-store-apps.js";

const currentChatGpt = {
  name: "ChatGPT",
  appUserModelId: "OpenAI.Codex_2p2nqsd0c76g0!App",
  packageFamilyName: "OpenAI.Codex_2p2nqsd0c76g0",
  executablePath: "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.721.4979.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe",
  processName: "ChatGPT",
  workingDirectory: "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.721.4979.0_x64__2p2nqsd0c76g0\\app"
};

function entry(overrides: Partial<AppEntry> = {}): AppEntry {
  return {
    id: "chatgpt",
    name: "ChatGPT",
    category: "AI",
    groupId: "ai",
    executablePath: "",
    processName: "ChatGPT",
    accent: "#2f66e8",
    ...overrides
  };
}

describe("Windows Store application identity", () => {
  it("derives the stable package family from versioned WindowsApps paths", () => {
    expect(inferPackageFamilyName(
      "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.715.7063.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe"
    )).toBe("OpenAI.Codex_2p2nqsd0c76g0");
    expect(inferPackageFamilyName(currentChatGpt.executablePath)).toBe("OpenAI.Codex_2p2nqsd0c76g0");
    expect(inferPackageFamilyName("C:\\Apps\\ChatGPT.exe")).toBe("");
  });

  it("parses and deduplicates only valid AUMID rows", () => {
    const parsed = parseWindowsStoreApps(JSON.stringify([
      currentChatGpt,
      { ...currentChatGpt, name: "duplicate" },
      { name: "ordinary shortcut", appUserModelId: "not-packaged", executablePath: "C:/Apps/Test.exe" }
    ]));

    expect(parsed).toEqual([currentChatGpt]);
  });

  it("uses exact AUMID before versioned path migration", () => {
    const other = {
      ...currentChatGpt,
      name: "ChatGPT Helper",
      appUserModelId: "OpenAI.Codex_2p2nqsd0c76g0!Helper",
      processName: "Helper"
    };
    expect(findWindowsStoreApp(entry({ appUserModelId: currentChatGpt.appUserModelId }), [other, currentChatGpt]))
      .toEqual(currentChatGpt);
  });

  it("uses process name to disambiguate multiple apps in one package", () => {
    const helper = {
      ...currentChatGpt,
      name: "Helper",
      appUserModelId: "OpenAI.Codex_2p2nqsd0c76g0!Helper",
      executablePath: currentChatGpt.executablePath.replace("ChatGPT.exe", "Helper.exe"),
      processName: "Helper"
    };
    const stalePath = currentChatGpt.executablePath.replace("26.721.4979.0", "26.715.7063.0");

    expect(findWindowsStoreApp(entry({ executablePath: stalePath }), [helper, currentChatGpt])).toEqual(currentChatGpt);
    expect(findWindowsStoreApp(entry({ executablePath: stalePath, processName: "Unknown", name: "Unknown" }), [helper, currentChatGpt]))
      .toBeUndefined();
  });

  it("builds the Shell target without storing it as an executable path", () => {
    expect(windowsStoreShellTarget(`  ${currentChatGpt.appUserModelId}  `))
      .toBe(`shell:AppsFolder\\${currentChatGpt.appUserModelId}`);
  });
});
