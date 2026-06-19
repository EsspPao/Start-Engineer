import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SettingsCollapsibleSection } from "./main";

describe("SettingsCollapsibleSection", () => {
  it("is compact and does not render its contents while collapsed", () => {
    const html = renderToStaticMarkup(createElement(SettingsCollapsibleSection, {
      title: "常规设置",
      description: "控制启动行为",
      expanded: false,
      onToggle: vi.fn(),
      children: createElement("div", null, "管理员设置"),
    }));

    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("管理员设置");
  });

  it("renders its contents when expanded", () => {
    const html = renderToStaticMarkup(createElement(SettingsCollapsibleSection, {
      title: "界面主题",
      description: "选择主题",
      expanded: true,
      onToggle: vi.fn(),
      children: createElement("div", null, "主题卡片"),
    }));

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("主题卡片");
  });
});
