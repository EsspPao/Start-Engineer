import { describe, expect, it } from "vitest";
import type { AppEntry } from "../shared/types";
import { buildManagedRunningStatus, parseTasklistCsv } from "./managed-running-status";

const app = (id: string, processName: string, extra: Partial<AppEntry> = {}): AppEntry => ({
  id,
  name: id,
  category: "Tools",
  groupId: "tools",
  executablePath: `C:\\Apps\\${processName}`,
  processName,
  accent: "#000",
  ...extra
});

describe("managed running status", () => {
  it("parses tasklist CSV rows into process names and PIDs", () => {
    expect(parseTasklistCsv('"Weixin.exe","120","Console","1","100,000 K"\r\n"steam.exe","42","Console","1","50,000 K"')).toEqual([
      { name: "Weixin.exe", pid: 120 },
      { name: "steam.exe", pid: 42 }
    ]);
  });

  it("matches managed apps by process name, aliases, and tracked PIDs", () => {
    const rows = [
      { name: "Weixin.exe", pid: 120 },
      { name: "renderer.exe", pid: 200 },
      { name: "helper.exe", pid: 300 }
    ];

    expect(buildManagedRunningStatus([
      app("wechat", "Weixin.exe"),
      app("codex", "Codex.exe", { processAliases: ["renderer"], associatedPids: [300] }),
      app("steam", "steam.exe")
    ], rows)).toEqual([
      { appId: "wechat", isRunning: true, pids: [120] },
      { appId: "codex", isRunning: true, pids: [200, 300] },
      { appId: "steam", isRunning: false, pids: [] }
    ]);
  });
});
