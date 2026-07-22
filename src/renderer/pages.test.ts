import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AppEntry, AppFolder, AppMetrics, FolderLaunchVisualStatus, GroupGridItemId } from "../shared/types";
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
  metrics: metrics(id, isRunning),
});

const renderGroup = () => renderToStaticMarkup(createElement(GroupPage, {
  apps: [makeApp("running", true), makeApp("stopped", false)],
  launchingAppIds: new Set<string>(),
  selectedAppId: "running",
  invalidAppIds: new Set<string>(),
  runningCount: 1,
  showAppNames: true,
  onSelectApp: vi.fn(),
  onFocusApp: vi.fn(),
  onLaunchApp: vi.fn(),
  onLaunchingFeedback: vi.fn(),
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
    expect(html).not.toContain("一键启动");
    expect(html).not.toContain('class="app-check"');
    expect(html).toContain('class="launch group-add-action"');
    expect(html).toContain('class="ghost group-close group-close-action"');
    expect(html.indexOf("关闭全部")).toBeLessThan(html.indexOf("添加应用"));
  });

  it("renders an immediate launching state for apps being started", () => {
    const html = renderToStaticMarkup(createElement(GroupPage, {
      apps: [makeApp("stopped", false)],
      launchingAppIds: new Set(["stopped"]),
      selectedAppId: "",
      invalidAppIds: new Set<string>(),
      runningCount: 0,
      showAppNames: true,
      onSelectApp: vi.fn(),
      onFocusApp: vi.fn(),
      onLaunchApp: vi.fn(),
      onLaunchingFeedback: vi.fn(),
      onCloseAll: vi.fn(),
      onAdd: vi.fn(),
      onContextMenu: vi.fn(),
      onPointerDown: vi.fn(),
      onRequestClose: vi.fn(),
    }));

    expect(html).toContain('class="launching-overlay"');
    expect(html).toContain("启动中");
  });

  it("renders an immediate closing state while a running app is being stopped", () => {
    const html = renderToStaticMarkup(createElement(GroupPage, {
      apps: [makeApp("running", true)],
      launchingAppIds: new Set(["running"]),
      selectedAppId: "",
      invalidAppIds: new Set<string>(),
      runningCount: 1,
      showAppNames: true,
      onSelectApp: vi.fn(),
      onFocusApp: vi.fn(),
      onLaunchApp: vi.fn(),
      onLaunchingFeedback: vi.fn(),
      onCloseAll: vi.fn(),
      onAdd: vi.fn(),
      onContextMenu: vi.fn(),
      onPointerDown: vi.fn(),
      onRequestClose: vi.fn(),
    }));

    expect(html).toContain("closing-overlay");
    expect(html).toContain("关闭中");
    expect(html).toContain('aria-busy="true"');
  });

  it("can hide app names while keeping accessible labels", () => {
    const html = renderToStaticMarkup(createElement(GroupPage, {
      apps: [makeApp("stopped", false)],
      launchingAppIds: new Set<string>(),
      selectedAppId: "",
      invalidAppIds: new Set<string>(),
      runningCount: 0,
      showAppNames: false,
      onSelectApp: vi.fn(),
      onFocusApp: vi.fn(),
      onLaunchApp: vi.fn(),
      onLaunchingFeedback: vi.fn(),
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
      runningCount: 0,
      showAppNames: false,
      onSelectApp: vi.fn(),
      onFocusApp: vi.fn(),
      onLaunchApp: vi.fn(),
      onLaunchingFeedback: vi.fn(),
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
  const renderUnified = (expandedFolderId = "", folderLaunchStatuses: Record<string, FolderLaunchVisualStatus> = {}, selectedItemId: GroupGridItemId | "" = "", runningMemberCount = 0) => {
    const runningIds = new Set(folder.appIds.slice(0, runningMemberCount));
    const renderedApps = allApps.map((app) => runningIds.has(app.id) ? { ...app, metrics: metrics(app.id, true) } : app);
    return renderToStaticMarkup(createElement(UnifiedGroupPage, {
    apps: [renderedApps[3]], allApps: renderedApps, folders: [folder], itemOrder: ["folder:bundle", "app:outer"], expandedFolderId,
    launchingAppIds: new Set<string>(), folderLaunchStatuses, selectedItemId, invalidAppIds: new Set<string>(), runningCount: 0, showAppNames: true,
    onSelectApp: vi.fn(), onSelectFolder: vi.fn(), onFocusApp: vi.fn(), onLaunchApp: vi.fn(), onLaunchingFeedback: vi.fn(), onCloseAll: vi.fn(), onAdd: vi.fn(), onContextMenu: vi.fn(), onAppPointerDown: vi.fn(), onFolderPointerDown: vi.fn(), onToggleFolder: vi.fn(), onLaunchFolder: vi.fn(), onRequestCloseFolder: vi.fn(), onRequestClose: vi.fn()
  }));
  };

  it("renders every real member icon inside the collapsed card and keeps mixed item order", () => {
    const html = renderUnified();
    expect(html).toContain('data-grid-item-id="folder:bundle"');
    expect(html.indexOf('folder:bundle')).toBeLessThan(html.indexOf('app:outer'));
    expect(html.match(/class="folder-icon"/g)).toHaveLength(1);
    expect(html.match(/data:image\/png;base64,icon/g)).toHaveLength(4);
    expect(html).toContain("--folder-columns:2");
    expect(html).toContain('title="多应用卡片：单击展开，双击启动全部"');
    expect(html).toContain('aria-label="多应用卡片，合并卡片"');
  });

  it("renders member-level batch launch states on the collapsed folder card", () => {
    const html = renderUnified("", { one: "launching", two: "waiting", three: "failed" });
    expect(html).toContain("folder-batch-active");
    expect(html).toContain("folder-member-launch launching");
    expect(html).toContain("folder-member-launch waiting");
    expect(html).toContain("folder-member-launch failed");
  });

  it("shows a merged app card as the current keyboard selection", () => {
    const html = renderUnified("", {}, "folder:bundle");
    expect(html).toContain('class="app-card-wrap folder-card-wrap current');
    expect(html).toContain('aria-pressed="true"');
  });

  it("shows one close control only when every folder member is running", () => {
    expect(renderUnified()).not.toContain('aria-label="关闭卡片内全部应用"');
    const html = renderUnified("", {}, "", 3);
    expect(html).toContain('class="app-card-wrap folder-card-wrap running');
    expect(html).toContain('aria-label="关闭卡片内全部应用"');
    expect(html).toContain('class="running-dot"');
    expect(html).toContain('class="running-close-x"');
  });

  it("shows member dots and a proportional status ring when only part of a folder is running", () => {
    const html = renderUnified("", {}, "", 2);
    expect(html).toContain("folder-card-wrap partial-running");
    expect(html.match(/member-running/g)).toHaveLength(2);
    expect(html).toContain("folder-running-status partial");
    expect(html).toContain("--folder-running-progress:67%");
    expect(html).toContain("2/3 个应用运行中");
  });

  it("enlarges the folder card without rendering a modal", () => {
    const html = renderUnified("bundle");
    expect(html).toContain('class="folder-zoom-backdrop open"');
    expect(html).toContain('class="folder-zoom-card open"');
    expect(html).not.toContain("modal-backdrop");
    expect(html).not.toContain("2 个应用");
    expect(html.match(/data-folder-member-id=/g)).toHaveLength(3);
  });

  it("shows the first expanded member as the current keyboard selection", () => {
    const html = renderUnified("bundle", {}, "app:one");
    expect(html).toMatch(/data-folder-member-id="one" class="app-card-wrap[^\"]*current/);
    expect(html).not.toContain('data-grid-item-id="folder:bundle" class="app-card-wrap folder-card-wrap current');
  });
});

describe("ProcessPage", () => {
  it("uses a neutral icon holder for real icons and a compact fallback tile", () => {
    const baseProcess = {
      pid: 42, pids: [42], processCount: 1, name: "Demo.exe", exePaths: [], cpuPercent: 0,
      memoryBytes: 0, diskBytesPerSecond: 0, isManagedApp: false, canTerminate: true
    };
    const html = renderToStaticMarkup(createElement(ProcessPage, {
      processes: [
        { ...baseProcess, name: "Real.exe", iconDataUrl: "data:image/png;base64,icon" },
        { ...baseProcess, pid: 43, pids: [43], name: "Fallback.exe" }
      ],
      loading: false,
      lockedProcessName: "",
      sortKey: "cpuPercent",
      sortDirection: "desc",
      changeSort: vi.fn(),
      filter: "all",
      setFilter: vi.fn(),
      onContextMenu: vi.fn(),
    }));

    expect(html).toContain('class="process-icon has-image ');
    expect(html).toContain('class="process-icon fallback ');
    expect(html).toContain('class="process-icon-fallback"');
    expect(html).toContain(">FA<");
  });

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
