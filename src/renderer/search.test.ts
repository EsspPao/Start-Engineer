import { describe, expect, it } from "vitest";
import { buildInternalSearchResults, matchesAppSearch, normalizeSearch } from "./search.js";
import type { AppMetrics } from "../shared/types.js";

describe("search", () => {
  it("does not retain process-only short matches", () => {
    expect(matchesAppSearch({ name: "反馈中心", processName: "FeedbackHub" }, "hu")).toBe(false);
  });
  it("puts UU names before middle-of-name and process-only matches without changing the input order", () => {
    const apps = [
      { name: "Wuthering Waves", processName: "Wuthering Waves" },
      { name: "百度网盘", processName: "BaiduNetdisk" },
      { name: "UU远程", processName: "GameViewer" },
      { name: "UU加速器", processName: "uu_launcher" }
    ].map((app, index) => ({ ...app, id: String(index), groupId: "tools", metrics: { isRunning: false } as AppMetrics }));
    const results = buildInternalSearchResults("Ｕ", apps);
    expect(new Set(results.slice(0, 2).map((item) => item.name))).toEqual(new Set(["UU远程", "UU加速器"]));
    expect(results.slice(2).map((item) => item.name)).toEqual(["Wuthering Waves"]);
    expect(apps[0].name).toBe("Wuthering Waves");
  });
  it("normalizes casing, whitespace and full-width text", () => {
    expect(normalizeSearch("  ＷEIXIN ")).toBe("weixin");
  });

  it("matches application name and process name", () => {
    expect(matchesAppSearch({ name: "Weixin", processName: "Weixin" }, "w")).toBe(true);
    expect(matchesAppSearch({ name: "Editor", processName: "CodeHelper" }, "helper")).toBe(true);
  });

  it("does not match an application by its executable path", () => {
    const codex = { name: "Codex", processName: "Codex", executablePath: "C:\\Program Files\\WindowsApps\\Codex.exe" };
    expect(matchesAppSearch(codex, "w")).toBe(false);
  });
});
