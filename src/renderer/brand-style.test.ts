import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src", "renderer", "styles.css"), "utf8");
const mainSource = readFileSync(join(process.cwd(), "src", "renderer", "main.tsx"), "utf8");

describe("sidebar brand area", () => {
  it("renders only the Start Engineer icon in the sidebar brand area", () => {
    expect(mainSource).toContain('className="brand-icon"');
    expect(mainSource).toContain("BrandLogo");
    expect(mainSource).not.toContain('className="brand"');
    expect(mainSource).not.toContain("<strong>Start Engineer</strong>");
    expect(mainSource).not.toContain("Command Center");
  });

  it("keeps icon-only styling without restoring the old brand block CSS", () => {
    expect(css).toContain(".brand-icon");
    expect(css).not.toContain(".brand {");
    expect(css).not.toContain(".brand-mark");
  });
});
