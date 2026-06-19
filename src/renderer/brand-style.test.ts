import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src", "renderer", "styles.css"), "utf8");

describe("brand mark styling", () => {
  it("does not draw a visible border around the Start Engineer icon", () => {
    expect(css).toContain("border: 0;");
    expect(css).not.toContain(":root[data-theme=\"utility\"] .brand-mark { border-color:");
  });
});
