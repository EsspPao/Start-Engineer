import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AppEntry, AppGroup, AppMetrics } from "../shared/types";
import { GroupManagerItem } from "./group-management";

type RuntimeApp = AppEntry & { metrics: AppMetrics };

const group: AppGroup = { id: "office", name: "办公", icon: "briefcase", isSystem: false, order: 1 };
const metrics: AppMetrics = {
  appId: "weixin",
  isRunning: true,
  cpuPercent: 0,
  memoryBytes: 0,
  diskBytesPerSecond: 0,
  pids: [42],
  matchedPids: [42],
  associatedPids: [],
  matchedProcessNames: ["Weixin"],
  matchedPaths: ["C:\\Apps\\Weixin.exe"]
};
const app: RuntimeApp = {
  id: "weixin",
  name: "Weixin",
  category: "office",
  groupId: "office",
  executablePath: "C:\\Apps\\Weixin.exe",
  processName: "Weixin.exe",
  accent: "#2563eb",
  metrics,
};

const renderItem = (expanded: boolean) => renderToStaticMarkup(createElement(GroupManagerItem, {
  group,
  apps: [app],
  expanded,
  sorting: false,
  appDrag: null,
  register: vi.fn(),
  onToggle: vi.fn(),
  onSortStart: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  canDelete: true,
  onAdd: vi.fn(),
  onOpenApp: vi.fn(),
  onAppContextMenu: vi.fn(),
  onAppPointerDown: vi.fn(),
}));

describe("GroupManagerItem", () => {
  it("renders the group applications only while expanded", () => {
    expect(renderItem(true)).toContain("Weixin");
    expect(renderItem(true)).toContain('class="group-app-grid"');
    expect(renderItem(false)).not.toContain('class="group-app-grid"');
  });

  it("uses consistent SVG icons for group actions", () => {
    const html = renderItem(false);

    expect(html).toContain('class="action-icon drag-dots"');
    expect(html).toContain('class="action-icon expand-chevron"');
    expect(html).toContain('class="action-icon edit-pencil"');
    expect(html).toContain('class="action-icon delete-trash"');
    expect(html).not.toContain("☰");
    expect(html).not.toContain("⌄");
    expect(html).not.toContain("✎");
  });
});
