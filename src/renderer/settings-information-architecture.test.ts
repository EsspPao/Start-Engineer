import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./settings-page.tsx", import.meta.url), "utf8");
const sections = readFileSync(new URL("./settings-sections.tsx", import.meta.url), "utf8");
const preferences = readFileSync(new URL("./use-settings-preferences.ts", import.meta.url), "utf8");

describe("settings information architecture", () => {
  it("defaults to preferences and separates group management behind an accessible tablist", () => {
    expect(preferences).toContain('useState<SettingsView>("preferences")');
    expect(page).toContain('role="tablist"');
    expect(page).toContain('role="tab"');
    expect(page).toContain('role="tabpanel"');
    expect(page).toContain('aria-controls="settings-panel-preferences"');
    expect(page).toContain('aria-controls="settings-panel-groups"');
    expect(page).toContain('event.key !== "ArrowLeft"');
    expect(page).toContain('tabIndex={activeSettingsView === "preferences" ? 0 : -1}');
  });

  it("keeps only daily startup controls and the current appearance visible by default", () => {
    expect(page).toContain("启动与操作");
    expect(page).toContain("theme-summary");
    expect(page).toContain('expandedSettings.has("theme") ? <div id="theme-details"');
    expect(page).toContain('expandedSettings.has("advanced")');
  });

  it("places expert controls in advanced settings without duplicating the app-name option", () => {
    expect(page).toContain("<SearchDependencySettings onPreferencesResolved={setPreferences} />");
    expect(page).toContain("<KeyboardShortcutSettingsSection");
    expect(page.match(/<strong>显示应用名称<\/strong>/g)).toHaveLength(1);
    expect(sections).toContain("仅在搜索失败时需要手动处理");
    expect(sections).toContain("搜索依赖需要修复");
  });

  it("opens diagnostics from a low-emphasis footer instead of a top-level accordion", () => {
    expect(page).toContain('className="settings-about-trigger"');
    expect(page).toContain(">关于 Start Engineer</button>");
    expect(page).toContain("<AboutSettingsDialog");
    expect(page).not.toContain('title="关于与诊断"');
    expect(sections).toContain('role="dialog"');
    expect(sections).toContain("closeButtonRef.current?.focus()");
  });
});
