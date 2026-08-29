import { describe, expect, it } from "vitest";
import { matchesAppSearch, normalizeSearch } from "./search.js";

describe("search", () => {
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
