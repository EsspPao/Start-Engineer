import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AboutSettingsDialog, SettingsCollapsibleSection } from "./settings-sections";

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

  it("does not append unrelated sections based on the title", () => {
    const html = renderToStaticMarkup(createElement(SettingsCollapsibleSection, {
      title: "界面主题",
      description: "选择主题",
      expanded: false,
      onToggle: vi.fn(),
      children: null,
    }));

    expect(html).not.toContain("搜索依赖");
    expect(html).not.toContain("关于与诊断");
  });
});

describe("AboutSettingsDialog", () => {
  it("stays hidden until explicitly opened", () => {
    expect(renderToStaticMarkup(createElement(AboutSettingsDialog, { open: false, onClose: vi.fn() }))).toBe("");
  });

  it("exposes an accessible modal dialog", () => {
    const html = renderToStaticMarkup(createElement(AboutSettingsDialog, { open: true, onClose: vi.fn() }));

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("关于 Start Engineer");
    expect(html).toContain('aria-label="关闭关于与诊断"');
  });
});
