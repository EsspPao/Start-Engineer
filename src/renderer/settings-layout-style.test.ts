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
});
