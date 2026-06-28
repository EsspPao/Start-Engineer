import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SearchResultsPanel } from "./main";

describe("SearchResultsPanel", () => {
  it("renders managed apps and local addable apps without a file results group", () => {
    const html = renderToStaticMarkup(createElement(SearchResultsPanel, {
      query: "demo",
      loading: false,
      error: "",
      selectedIndex: 0,
      managedResults: [{ kind: "app", id: "managed", name: "Demo App", groupId: "office", processName: "Demo", isRunning: true }],
      discoveredResults: [{ id: "candidate", name: "Demo Tool", executablePath: "C:\\Program Files\\Demo\\Demo.exe", processName: "Demo", groupId: "office", category: "办公", source: "start-menu" }],
      fileResults: [{ name: "demo.txt", path: "C:\\Users\\Xbfe\\Desktop\\demo.txt", kind: "file", sizeBytes: 12, modifiedAt: "2026-06-29" }],
      onSelectIndex: vi.fn(),
      onOpenManaged: vi.fn(),
      onAddDiscovered: vi.fn(),
      onOpenFile: vi.fn()
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
      query: "demo",
      loading: false,
      error: "",
      selectedIndex: 0,
      managedResults: [],
      discoveredResults: [{ id: "candidate", name: "Demo Tool", executablePath: "C:\\Program Files\\Demo\\Demo.exe", processName: "Demo", groupId: "office", category: "办公", source: "desktop", alreadyAdded: true, existingGroupId: "office" }],
      fileResults: [],
      onSelectIndex: vi.fn(),
      onOpenManaged: vi.fn(),
      onAddDiscovered: vi.fn(),
      onOpenFile: vi.fn()
    }));

    expect(html).toContain("已添加");
    expect(html).toContain("✓");
  });

  it("renders Everything file fallback only when no app results exist", () => {
    const html = renderToStaticMarkup(createElement(SearchResultsPanel, {
      query: "report",
      loading: false,
      error: "",
      selectedIndex: 0,
      managedResults: [],
      discoveredResults: [],
      fileResults: [{ name: "report.pdf", path: "C:\\Users\\Xbfe\\Documents\\report.pdf", kind: "file", sizeBytes: 1024, modifiedAt: "2026-06-29" }],
      onSelectIndex: vi.fn(),
      onOpenManaged: vi.fn(),
      onAddDiscovered: vi.fn(),
      onOpenFile: vi.fn()
    }));

    expect(html).toContain("Everything 搜索结果");
    expect(html).toContain("report.pdf");
    expect(html).toContain("C:\\Users\\Xbfe\\Documents\\report.pdf");
    expect(html).toContain("打开");
  });
});
