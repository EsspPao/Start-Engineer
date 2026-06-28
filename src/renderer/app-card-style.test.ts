import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(join(process.cwd(), "src/renderer/styles.css"), "utf8");

describe("app card styles", () => {
  it("enlarges icons and keeps the running status close affordance compact", () => {
    expect(styles).toMatch(/\.card-icon\s*\{[^}]*width:\s*54px;[^}]*height:\s*54px;/i);
    expect(styles).toMatch(/\.app-card\.names-hidden\s+\.card-icon\s*\{[^}]*width:\s*72px;[^}]*height:\s*72px;/i);
    expect(styles).toMatch(/\.running-status-button\s*\{[^}]*width:\s*28px;[^}]*height:\s*28px;/i);
    expect(styles).toMatch(/\.running-status-button:hover[^}]*background:\s*#dc354f;/i);
  });

  it("keeps sidebar group selection to the active blue state without a second focus outline", () => {
    expect(styles).toMatch(/\.nav-button:focus,\s*\.nav-button:focus-visible\s*\{[^}]*outline:\s*none;/i);
    expect(styles).not.toMatch(/\.nav-button:focus-visible\s*\{[^}]*orange/i);
  });
});
