import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KeyboardShortcutPanel, keyboardShortcutHelpItems } from "./keyboard-shortcuts";

describe("keyboard shortcut help", () => {
  it("lists app, group, search, and escape shortcuts for settings", () => {
    const labels = keyboardShortcutHelpItems.map((item) => `${item.keys} ${item.label}`).join("\n");

    expect(labels).toContain("方向键 / WASD");
    expect(labels).toContain("Enter");
    expect(labels).not.toContain("Space");
    expect(labels).toContain("Esc");
    expect(labels).toContain("Ctrl+↑/↓ / Ctrl+W/S");
    expect(labels).toContain("Ctrl+1/2/3");
    expect(labels).toContain("Ctrl+F");
  });

  it("renders shortcuts as compact key rows", () => {
    const html = renderToStaticMarkup(createElement(KeyboardShortcutPanel));

    expect(html).toContain('class="shortcut-help-grid"');
    expect(html).toContain("<kbd>");
    expect(html).toContain("切换上一个或下一个分组");
  });
});
