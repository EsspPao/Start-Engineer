import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(join(process.cwd(), "src/renderer/styles.css"), "utf8");

describe("settings page layout styles", () => {
  it("uses the settings page as the main scroll container", () => {
    expect(styles).toMatch(/\.settings-page\s*\{[^}]*overflow-y:\s*auto/i);
    expect(styles).toMatch(/\.settings-page\s*\{[^}]*align-content:\s*start/i);
    expect(styles).not.toMatch(/\.settings-page\s*\{[^}]*grid-template-rows:\s*auto auto auto minmax\(0,1fr\)/i);
  });

  it("lets group management flow with the settings page instead of clipping its own content", () => {
    expect(styles).toMatch(/\.group-manager\s*\{[^}]*overflow:\s*visible/i);
    expect(styles).not.toMatch(/\.group-manager\s*\{[^}]*overflow:\s*auto/i);
  });

  it("groups application shortcuts into compact scan-friendly sections", () => {
    expect(styles).toMatch(/\.shortcut-sections\s*\{[^}]*gap:\s*12px/i);
    expect(styles).toMatch(/\.shortcut-help-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/i);
    expect(styles).toMatch(/\.shortcut-section-groups\s+\.shortcut-help-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,minmax\(0,1fr\)\)/i);
    expect(styles).toMatch(/\.shortcut-help-row\s*\{[^}]*min-height:\s*42px/i);
  });

  it("uses an accessible two-view settings hierarchy", () => {
    expect(styles).toMatch(/\.settings-view-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(2,minmax\(112px,1fr\)\)/i);
    expect(styles).toMatch(/\.settings-view-tab\.selected\s*\{[^}]*background:\s*color-mix\(in srgb,var\(--accent\)/i);
    expect(styles).toMatch(/\.settings-view-tab:focus-visible[\s\S]*?box-shadow:\s*0 0 0 3px color-mix\(in srgb,var\(--accent\)/i);
    expect(styles).toMatch(/\.settings-preferences-view,\s*\.settings-groups-view\s*\{[^}]*align-content:\s*start/i);
  });

  it("collapses the settings top bar to heading and window controls", () => {
    expect(styles).toMatch(/\.topbar\.settings-mode[\s\S]*?grid-template-columns:\s*minmax\(0,1fr\) auto/i);
    expect(styles).toMatch(/\.topbar\.settings-mode\s+\.searchbar\s*\{[^}]*display:\s*none/i);
  });

  it("builds primary settings and theme summary from shared theme materials", () => {
    expect(styles).toMatch(/\.settings-primary-section\s*\{[^}]*border:\s*1px solid var\(--line\)/i);
    expect(styles).toMatch(/\.settings-primary-section\s*\{[^}]*background:\s*color-mix\(in srgb,var\(--glass-soft\)/i);
    expect(styles).toMatch(/\.theme-summary\s*\{[^}]*grid-template-columns:\s*108px minmax\(0,1fr\) auto/i);
    expect(styles).toMatch(/:root\[data-theme="clear"\][\s\S]*?\.settings-primary-section[\s\S]*?backdrop-filter:\s*none/i);
  });

  it("keeps the settings dialog bounded and independently scrollable", () => {
    expect(styles).toMatch(/\.settings-dialog\s*\{[^}]*max-height:\s*min\(560px,calc\(100vh - 48px\)\)/i);
    expect(styles).toMatch(/\.settings-dialog-content\s*\{[^}]*overflow-y:\s*auto/i);
    expect(styles).toMatch(/\.settings-dialog-backdrop\s*\{[^}]*position:\s*fixed/i);
    expect(styles).toMatch(/\.settings-dialog-close:hover\s*\{[^}]*background:\s*var\(--danger\)/i);
    expect(styles).toMatch(/\.settings-dialog:focus\s*\{[^}]*outline:\s*none/i);
  });

  it("anchors compact group actions without changing the main group footer", () => {
    expect(styles).toMatch(/\.group-manager-item\.actions-open\s*\{[^}]*z-index:\s*30/i);
    expect(styles).toMatch(/\.group-manager-actions\s*\{[^}]*position:\s*relative/i);
    expect(styles).toMatch(/\.group-manager-actions\.open\s*\{[^}]*z-index:\s*24/i);
    expect(styles).toMatch(/\.group-actions-menu\s*\{[^}]*position:\s*absolute/i);
    expect(styles).toMatch(/\.group-actions-menu\s*\{[^}]*background:\s*color-mix\(in srgb,var\(--glass-strong\)/i);
  });

  it("stacks dense preference rows at narrow desktop widths", () => {
    expect(styles).toMatch(/@media\s*\(max-width:\s*1160px\)[\s\S]*?\.startup-operation-settings\s*>\s*\.preference-grid,[\s\S]*?\.advanced-preference-grid\s*\{[^}]*grid-template-columns:\s*1fr/i);
  });

  it("honors reduced transparency for newly introduced settings surfaces", () => {
    expect(styles).toMatch(/@media\s*\(prefers-reduced-transparency:\s*reduce\)[\s\S]*?\.settings-view-tabs,[\s\S]*?\.settings-primary-section,[\s\S]*?\.settings-dialog[\s\S]*?backdrop-filter:\s*none/i);
  });
});
