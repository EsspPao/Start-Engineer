import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AppEntry, AppMetrics } from "../shared/types";
import { GroupPage } from "./pages";

type RuntimeApp = AppEntry & { metrics: AppMetrics };

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
  metrics: {
    appId: id,
    isRunning,
    cpuPercent: 0,
    memoryBytes: 0,
    diskBytesPerSecond: 0,
    pids: isRunning ? [42] : [],
  },
});

const renderGroup = () => renderToStaticMarkup(createElement(GroupPage, {
  apps: [makeApp("running", true), makeApp("stopped", false)],
  launchingAppIds: new Set<string>(),
  selectedCount: 1,
  runningCount: 1,
  onToggleSelected: vi.fn(),
  onDoubleLaunch: vi.fn(),
  onLaunchSelected: vi.fn(),
  onCloseAll: vi.fn(),
  onAdd: vi.fn(),
  onContextMenu: vi.fn(),
  onPointerDown: vi.fn(),
  onRequestClose: vi.fn(),
}));

describe("GroupPage", () => {
  it("renders an icon replacement close control only for running apps", () => {
    const html = renderGroup();

    expect(html.match(/class="app-icon-close"/g)).toHaveLength(1);
    expect(html.match(/class="running-dot"/g)).toHaveLength(1);
    expect(html).not.toContain('class="running-badge"');
    expect(html).not.toContain('class="card-icon running"');
    expect(html).not.toContain(">运行中<");
    expect(html).toContain('aria-label="结束 WeGame"');
    expect(html).not.toContain('aria-label="结束 Codex"');
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
      selectedCount: 0,
      runningCount: 0,
      onToggleSelected: vi.fn(),
      onDoubleLaunch: vi.fn(),
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
});
