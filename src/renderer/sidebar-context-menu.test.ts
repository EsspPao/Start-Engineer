import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AppGroup } from "../shared/types";
import { GroupContextMenu, SidebarContextMenu } from "./context-menus";

const groups: AppGroup[] = [
  { id: "games", name: "游戏", icon: "gamepad", isSystem: false, order: 0 },
  { id: "office", name: "办公", icon: "briefcase", isSystem: false, order: 1 }
];
const mainSource = readFileSync(join(process.cwd(), "src", "renderer", "main.tsx"), "utf8");

describe("sidebar context menus", () => {
  it("offers group creation from the empty sidebar menu", () => {
    const html = renderToStaticMarkup(createElement(SidebarContextMenu, {
      state: { kind: "sidebar", x: 24, y: 24 },
      onClose: vi.fn(),
      onCreate: vi.fn()
    }));

    expect(html).toContain("新建分组");
    expect(html).toContain('role="menu"');
    expect(html).toContain('role="menuitem"');
  });

  it("keeps an existing group's menu scoped to that group", () => {
    const html = renderToStaticMarkup(createElement(GroupContextMenu, {
      state: { kind: "group", x: 24, y: 24, groupId: "games" },
      groups,
      onClose: vi.fn(),
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onReorder: vi.fn(async () => undefined)
    }));

    expect(html).toContain("重命名 / 更换图标");
    expect(html).toContain("删除分组");
    expect(html).not.toContain("新建分组");
  });

  it("opens only from sidebar whitespace and excludes existing controls", () => {
    expect(mainSource).toContain('className="sidebar no-drag" onContextMenu=');
    expect(mainSource).toContain('closest("[data-sidebar-context-exclude]")');
    expect(mainSource).toContain("data-sidebar-context-exclude className={`nav-button");
    expect(mainSource).toContain('data-sidebar-context-exclude data-drop-group=');
    expect(mainSource).toContain('className="brand-icon" aria-hidden="true" data-sidebar-context-exclude');
  });
});
import { readFileSync } from "node:fs";
import { join } from "node:path";
