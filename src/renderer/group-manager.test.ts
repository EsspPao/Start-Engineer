import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AppEntry, AppGroup, AppMetrics } from "../shared/types";
import { GroupActionsMenu, GroupManagerItem } from "./group-management";

const source = readFileSync(new URL("./group-management.tsx", import.meta.url), "utf8");

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

  it("keeps secondary group actions behind one labelled menu trigger", () => {
    const html = renderItem(false);

    expect(html).toContain('class="action-icon drag-dots"');
    expect(html).toContain('class="action-icon expand-chevron"');
    expect(html).toContain('class="action-icon more-dots"');
    expect(html).toContain('aria-label="办公的更多操作"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('class="action-icon edit-pencil"');
    expect(html).not.toContain('class="action-icon delete-trash"');
    expect(html).not.toContain("☰");
    expect(html).not.toContain("⌄");
    expect(html).not.toContain("✎");
  });

  it("explains why deleting the last group is unavailable", () => {
    const html = renderToStaticMarkup(createElement(GroupActionsMenu, {
      id: "office-actions",
      groupName: group.name,
      canDelete: false,
      onEdit: vi.fn(),
      onDelete: vi.fn(),
    }));

    expect(html).toContain('role="menu"');
    expect(html).toContain('aria-label="办公分组操作"');
    expect(html).toContain('disabled=""');
    expect(html).toContain("至少保留一个分组");
    expect(html).toContain('class="action-icon edit-pencil"');
    expect(html).toContain('class="action-icon delete-trash"');
  });

  it("closes the action menu from outside, Escape, edit, and delete paths", () => {
    expect(source).toContain('document.addEventListener("pointerdown", closeFromOutside, true)');
    expect(source).toContain('document.addEventListener("keydown", closeFromKeyboard)');
    expect(source).toContain('if (event.key !== "Escape") return;');
    expect(source).toContain("triggerRef.current?.focus()");
    expect(source).toMatch(/const runAction[\s\S]*setActionsOpen\(false\);[\s\S]*action\(\);/);
    expect(source).toContain("onEdit={() => runAction(onEdit)}");
    expect(source).toContain("onDelete={() => runAction(onDelete)}");
  });

  it("moves focus into the menu and supports arrow-key navigation", () => {
    expect(source).toContain('button[role="menuitem"]:not(:disabled)');
    expect(source).toContain('event.key !== "ArrowDown"');
    expect(source).toContain('event.key !== "ArrowUp"');
    expect(source).toContain('event.key === "Home"');
    expect(source).toContain('event.key === "End"');
    expect(source).toContain('group-manager-item ${actionsOpen ? "actions-open" : ""}');
  });
});
