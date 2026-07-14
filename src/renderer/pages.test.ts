import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AppEntry, AppFolder, AppMetrics, FolderLaunchVisualStatus } from "../shared/types";
import { GroupPage, ProcessPage, UnifiedGroupPage } from "./pages";

type RuntimeApp = AppEntry & { metrics: AppMetrics };

const metrics = (appId: string, isRunning: boolean): AppMetrics => ({
  appId,
  isRunning,
  cpuPercent: 0,
  memoryBytes: 0,
  diskBytesPerSecond: 0,
  pids: isRunning ? [42] : [],
  matchedPids: isRunning ? [42] : [],
  associatedPids: [],
  matchedProcessNames: [],
  matchedPaths: []
});

const makeApp = (id: string, isRunning: boolean): RuntimeApp => ({
  id,
  name: id === "running" ? "WeGame" : "Codex",
  category: "tools",
  groupId: "tools",
  executablePath: `C:\\Apps\\${id}.exe`,
  processName: `${id}.exe`,
  accent: "#2563eb",
  iconDataUrl: "data:image/png;base64,icon",
  launchSelected: id === "running",
  metrics: metrics(id, isRunning),
});

const renderGroup = () => renderToStaticMarkup(createElement(GroupPage, {
  apps: [makeApp("running", true), makeApp("stopped", false)],
  launchingAppIds: new Set<string>(),
  selectedAppId: "running",
  invalidAppIds: new Set<string>(),
  selectedCount: 1,
  runningCount: 1,
  showAppNames: true,
  onSelectApp: vi.fn(),
  onFocusApp: vi.fn(),
  onLaunchApp: vi.fn(),
  onLaunchingFeedback: vi.fn(),
  onToggleLaunchSelected: vi.fn(),
  onLaunchSelected: vi.fn(),
  onCloseAll: vi.fn(),
  onAdd: vi.fn(),
  onContextMenu: vi.fn(),
  onPointerDown: vi.fn(),
  onRequestClose: vi.fn(),
}));

describe("GroupPage", () => {
  it("renders a hover close control on the running status light only for running apps", () => {
    const html = renderGroup();

    expect(html.match(/class="running-status-button"/g)).toHaveLength(1);
    expect(html.match(/class="running-dot"/g)).toHaveLength(1);
    expect(html).toContain('title="关闭应用"');
    expect(html).toContain('aria-label="关闭应用"');
    expect(html).not.toContain('class="running-badge"');
    expect(html).not.toContain('class="card-icon running"');
    expect(html).not.toContain(">运行中<");
    expect(html).not.toContain('class="app-icon-close"');
    expect(html).not.toContain('class="app-close"');
  });

  it("does not render the select-all action", () => {
    const html = renderGroup();

    expect(html).not.toContain("全选");
    expect(html).not.toContain("取消全选");
    expect(html).toContain("添加应用");
    expect(html).toContain("关闭全部");
    expect(html).toContain("一键启动");
  });

  it("renders an immediate launching state for apps being started", () => {
    const html = renderToStaticMarkup(createElement(GroupPage, {
      apps: [makeApp("stopped", false)],
      launchingAppIds: new Set(["stopped"]),
      selectedAppId: "",
      invalidAppIds: new Set<string>(),
      selectedCount: 0,
      runningCount: 0,
      showAppNames: true,
      onSelectApp: vi.fn(),
      onFocusApp: vi.fn(),
      onLaunchApp: vi.fn(),
      onLaunchingFeedback: vi.fn(),
      onToggleLaunchSelected: vi.fn(),
      onLaunchSelected: vi.fn(),
      onCloseAll: vi.fn(),
      onAdd: vi.fn(),
      onContextMenu: vi.fn(),
      onPointerDown: vi.fn(),
      onRequestClose: vi.fn(),
    }));

    expect(html).toContain('class="launching-overlay"');
    expect(html).toContain("启动中");
  });

  it("can hide app names while keeping accessible labels", () => {
    const html = renderToStaticMarkup(createElement(GroupPage, {
      apps: [makeApp("stopped", false)],
      launchingAppIds: new Set<string>(),
      selectedAppId: "",
      invalidAppIds: new Set<string>(),
      selectedCount: 0,
      runningCount: 0,
      showAppNames: false,
      onSelectApp: vi.fn(),
      onFocusApp: vi.fn(),
      onLaunchApp: vi.fn(),
      onLaunchingFeedback: vi.fn(),
      onToggleLaunchSelected: vi.fn(),
      onLaunchSelected: vi.fn(),
      onCloseAll: vi.fn(),
      onAdd: vi.fn(),
      onContextMenu: vi.fn(),
      onPointerDown: vi.fn(),
      onRequestClose: vi.fn(),
    }));

    expect(html).not.toContain('class="app-name"');
    expect(html).toContain('class="app-card-wrap names-hidden');
    expect(html).toContain('class="app-card names-hidden');
    expect(html).toContain('title="Codex"');
    expect(html).toContain('aria-label="Codex"');
  });

  it("renders a compact invalid-path warning badge without long card text", () => {
    const html = renderToStaticMarkup(createElement(GroupPage, {
      apps: [makeApp("stopped", false)],
      launchingAppIds: new Set<string>(),
      selectedAppId: "",
      invalidAppIds: new Set(["stopped"]),
      selectedCount: 0,
      runningCount: 0,
      showAppNames: false,
      onSelectApp: vi.fn(),
      onFocusApp: vi.fn(),
      onLaunchApp: vi.fn(),
      onLaunchingFeedback: vi.fn(),
      onToggleLaunchSelected: vi.fn(),
      onLaunchSelected: vi.fn(),
      onCloseAll: vi.fn(),
      onAdd: vi.fn(),
      onContextMenu: vi.fn(),
      onPointerDown: vi.fn(),
      onRequestClose: vi.fn(),
    }));

    expect(html).toContain('class="invalid-path-badge"');
    expect(html).toContain('title="程序路径可能失效"');
    expect(html).not.toContain("路径失效");
  });
});

describe("UnifiedGroupPage", () => {
  const folder: AppFolder = { id: "bundle", groupId: "tools", name: "多应用卡片", appIds: ["one", "two", "three"], order: 0 };
  const allApps = [makeApp("one", false), makeApp("two", false), makeApp("three", false), makeApp("outer", false)];
  const renderUnified = (expandedFolderId = "", folderLaunchStatuses: Record<string, FolderLaunchVisualStatus> = {}) => renderToStaticMarkup(createElement(UnifiedGroupPage, {
    apps: [allApps[3]], allApps, folders: [folder], itemOrder: ["folder:bundle", "app:outer"], expandedFolderId,
    launchingAppIds: new Set<string>(), folderLaunchStatuses, selectedAppId: "", invalidAppIds: new Set<string>(), selectedCount: 0, runningCount: 0, showAppNames: true,
    onSelectApp: vi.fn(), onFocusApp: vi.fn(), onLaunchApp: vi.fn(), onLaunchingFeedback: vi.fn(), onToggleLaunchSelected: vi.fn(), onLaunchSelected: vi.fn(), onCloseAll: vi.fn(), onAdd: vi.fn(), onContextMenu: vi.fn(), onAppPointerDown: vi.fn(), onFolderPointerDown: vi.fn(), onToggleFolder: vi.fn(), onLaunchFolder: vi.fn(), onRequestClose: vi.fn()
  }));

  it("renders every real member icon inside the collapsed card and keeps mixed item order", () => {
    const html = renderUnified();
    expect(html).toContain('data-grid-item-id="folder:bundle"');
    expect(html.indexOf('folder:bundle')).toBeLessThan(html.indexOf('app:outer'));
    expect(html.match(/class="folder-icon"/g)).toHaveLength(1);
    expect(html.match(/data:image\/png;base64,icon/g)).toHaveLength(4);
    expect(html).toContain("--folder-columns:2");
  });

  it("renders member-level batch launch states on the collapsed folder card", () => {
    const html = renderUnified("", { one: "launching", two: "waiting", three: "failed" });
    expect(html).toContain("folder-batch-active");
    expect(html).toContain("folder-member-launch launching");
    expect(html).toContain("folder-member-launch waiting");
    expect(html).toContain("folder-member-launch failed");
  });

  it("enlarges the folder card without rendering a modal", () => {
    const html = renderUnified("bundle");
    expect(html).toContain('class="folder-zoom-backdrop open"');
    expect(html).toContain('class="folder-zoom-card open"');
    expect(html).not.toContain("modal-backdrop");
    expect(html).not.toContain("2 个应用");
    expect(html.match(/data-folder-member-id=/g)).toHaveLength(3);
  });
});

describe("ProcessPage", () => {
  it("can render managed apps as the selected process filter", () => {
    const html = renderToStaticMarkup(createElement(ProcessPage, {
      processes: [],
      loading: false,
      lockedProcessName: "",
      sortKey: "cpuPercent",
      sortDirection: "desc",
      changeSort: vi.fn(),
      filter: "managed",
      setFilter: vi.fn(),
      onContextMenu: vi.fn(),
    }));

    expect(html).toContain('<button class="selected">已管理应用</button>');
    expect(html).not.toContain('<button class="selected">全部进程</button>');
  });

  it("shows a lightweight loading state before the first full process snapshot arrives", () => {
    const html = renderToStaticMarkup(createElement(ProcessPage, {
      processes: [],
      loading: true,
      lockedProcessName: "",
      sortKey: "cpuPercent",
      sortDirection: "desc",
      changeSort: vi.fn(),
      filter: "all",
      setFilter: vi.fn(),
      onContextMenu: vi.fn(),
    }));

    expect(html).toContain("正在加载进程");
    expect(html).not.toContain("没有匹配的进程");
  });
});
