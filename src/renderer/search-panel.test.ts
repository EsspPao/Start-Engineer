import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SearchResultsPanel } from "./search-results-panel";

const panelDefaults = {
  installableResults: [],
  onSelectIndex: vi.fn(),
  onOpenManaged: vi.fn(),
  onAddDiscovered: vi.fn(),
  onOpenInstallable: vi.fn(),
  onOpenFile: vi.fn()
};

describe("SearchResultsPanel", () => {
  it("renders managed apps and local addable apps without a file results group", () => {
    const html = renderToStaticMarkup(createElement(SearchResultsPanel, {
      ...panelDefaults,
      query: "demo",
      loading: false,
      error: "",
      selectedIndex: 0,
      managedResults: [{ kind: "app", id: "managed", name: "Demo App", groupId: "office", processName: "Demo", isRunning: true }],
      discoveredResults: [{ id: "candidate", name: "Demo Tool", executablePath: "C:\\Program Files\\Demo\\Demo.exe", processName: "Demo", groupId: "office", category: "办公", source: "start-menu" }],
      installableResults: [],
      fileResults: [{ name: "demo.txt", path: "C:\\Users\\ExampleUser\\Desktop\\demo.txt", kind: "file", sizeBytes: 12, modifiedAt: "2026-06-29" }]
    }));

    expect(html).toContain("已添加应用");
    expect(html).toContain("本机可添加应用");
    expect(html).toContain("Demo App");
    expect(html).toContain("Demo Tool");
    expect(html).toContain("✓");
    expect(html).toContain("+");
    expect(html).not.toContain("文件结果");
  });

  it("shows already-added state for discovered duplicates", () => {
    const html = renderToStaticMarkup(createElement(SearchResultsPanel, {
      ...panelDefaults,
      query: "demo",
      loading: false,
      error: "",
      selectedIndex: 0,
      managedResults: [],
      discoveredResults: [{ id: "candidate", name: "Demo Tool", executablePath: "C:\\Program Files\\Demo\\Demo.exe", processName: "Demo", groupId: "office", category: "办公", source: "desktop", alreadyAdded: true, existingGroupId: "office" }],
      installableResults: [],
      fileResults: []
    }));

    expect(html).toContain("已添加");
    expect(html).toContain("✓");
  });

  it("renders Everything file fallback only when no app results exist", () => {
    const html = renderToStaticMarkup(createElement(SearchResultsPanel, {
      ...panelDefaults,
      query: "report",
      loading: false,
      error: "",
      selectedIndex: 0,
      managedResults: [],
      discoveredResults: [],
      installableResults: [],
      fileResults: [{ name: "report.pdf", path: "C:\\Users\\ExampleUser\\Documents\\report.pdf", kind: "file", sizeBytes: 1024, modifiedAt: "2026-06-29" }]
    }));

    expect(html).toContain("Everything 搜索结果");
    expect(html).toContain("report.pdf");
    expect(html).toContain("C:\\Users\\ExampleUser\\Documents\\report.pdf");
    expect(html).toContain("打开");
  });

  it("renders safe installable app download entries as app results", () => {
    const html = renderToStaticMarkup(createElement(SearchResultsPanel, {
      ...panelDefaults,
      query: "steam",
      loading: false,
      error: "",
      selectedIndex: 0,
      managedResults: [],
      discoveredResults: [],
      installableResults: [{ id: "steam", name: "Steam", publisher: "Valve", description: "Steam 官方下载页", downloadPage: "https://store.steampowered.com/about/", aliases: ["steam"], category: "game", source: "official", action: "open-download-page" }],
      fileResults: [{ name: "steam.log", path: "C:\\Temp\\steam.log", kind: "file" }]
    }));

    expect(html).toContain("可安装应用");
    expect(html).toContain("Steam");
    expect(html).toContain("官方下载页");
    expect(html).not.toContain("Everything 搜索结果");
  });
});
