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

  it("keeps the sidebar compact while preventing nav buttons from causing horizontal scroll", () => {
    expect(css).toMatch(/\.app-shell\s*\{[\s\S]*?grid-template-columns:\s*212px minmax\(0,\s*1fr\)/i);
    expect(css).toMatch(/\.app-shell\[data-ui-sidebar-width="wide"\]\s*\{[^}]*grid-template-columns:\s*252px minmax\(0,\s*1fr\)/i);
    expect(css).toMatch(/\.nav\s*\{[^}]*overflow-x:\s*hidden;/i);
    expect(css).toMatch(/\.nav-button\s+span\s*\{[^}]*text-overflow:\s*ellipsis;/i);
  });

  it("keeps the sidebar hover motion while leaving enough room for nav buttons", () => {
    expect(css).toMatch(/\.app-shell\[data-ui-sidebar-width="narrow"\]\s*\{[^}]*grid-template-columns:\s*180px minmax\(0,\s*1fr\)/i);
    expect(css).toMatch(/\.nav\s*\{[^}]*padding:\s*9px 4px 9px 0;/i);
    expect(css).toMatch(/\.nav-button:hover\s*\{[^}]*transform:\s*translateX\(2px\)/i);
    expect(css).toMatch(/\.nav-button\s*\{[^}]*transition:[^}]*transform 160ms var\(--ease\)/i);
  });
});
