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
});
