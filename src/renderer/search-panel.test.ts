import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SearchResultsPanel } from "./main";

describe("SearchResultsPanel", () => {
  it("renders Everything results and setup actions", () => {
    const html = renderToStaticMarkup(createElement(SearchResultsPanel, {
      provider: "everything",
      query: "demo",
      loading: false,
      error: "",
      selectedIndex: 0,
      everythingResults: [{ name: "demo.txt", path: "C:\\Users\\Xbfe\\Desktop\\demo.txt", kind: "file", sizeBytes: 12, modifiedAt: "2026-06-16" }],
      internalResults: [],
      onSelectIndex: vi.fn(),
      onOpenEverything: vi.fn(),
      onOpenInternal: vi.fn(),
      onPickEverythingCli: vi.fn(),
      onPrepareDependencies: vi.fn(),
      onShowEverythingInFolder: vi.fn(),
      onCopyPath: vi.fn()
    }));

    expect(html).toContain("demo.txt");
    expect(html).toContain("C:\\Users\\Xbfe\\Desktop\\demo.txt");
    expect(html).toContain("Everything");
  });

  it("offers one-click dependency preparation when Everything is missing", () => {
    const html = renderToStaticMarkup(createElement(SearchResultsPanel, {
      provider: "everything",
      query: "demo",
      loading: false,
      error: "未找到 Everything 命令行工具 ES.exe",
      selectedIndex: 0,
      dependencyState: "missing",
      everythingResults: [],
      internalResults: [],
      onSelectIndex: vi.fn(),
      onOpenEverything: vi.fn(),
      onOpenInternal: vi.fn(),
      onPickEverythingCli: vi.fn(),
      onPrepareDependencies: vi.fn(),
      onShowEverythingInFolder: vi.fn(),
      onCopyPath: vi.fn()
    }));

    expect(html).toContain("一键准备");
    expect(html).toContain("选择 ES.exe");
  });
});
