import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src", "renderer", "styles.css"), "utf8");

describe("Wallpaper Glass styles", () => {
  it("defines the wallpaper theme, adjustable intensity control, and a reduced transparency fallback", () => {
    expect(css).toContain(':root[data-theme="wallpaper"]');
    expect(css).toContain("--wallpaper-shell");
    expect(css).toContain(".wallpaper-intensity-slider");
    expect(css).toContain('input[type="range"]');
    expect(css).toContain('input[type="number"]');
    expect(css).toContain('data-wallpaper-variant="light"');
    expect(css).toContain(".wallpaper-variant-control");
    expect(css).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(css).toContain(':root[data-theme="wallpaper"] .app-shell');
  });

  it("keeps the light wallpaper variant using wallpaper intensity variables", () => {
    expect(css).toContain('--wallpaper-shell: rgba(245,248,255,.58)');
    expect(css).toContain('--wallpaper-card: rgba(255,255,255,.26)');
    expect(css).toContain('linear-gradient(135deg,var(--wallpaper-shell),rgba(236,244,255,.24))');
  });

  it("does not keep the old weak medium strong intensity selectors", () => {
    expect(css).not.toContain('data-wallpaper-intensity="weak"');
    expect(css).not.toContain('data-wallpaper-intensity="medium"');
    expect(css).not.toContain('data-wallpaper-intensity="strong"');
  });

  it("keeps wallpaper process table headers readable", () => {
    expect(css).toMatch(/:root\[data-theme="wallpaper"\]\s+\.process-row\.header\s*\{[^}]*background:\s*rgba\(255,255,255,\.22\)/i);
    expect(css).toMatch(/:root\[data-theme="wallpaper"\]\s+\.process-row\.header button\s*\{[^}]*color:\s*#eef6ff;/i);
    expect(css).toMatch(/:root\[data-theme="wallpaper"\]\[data-wallpaper-variant="light"\]\s+\.process-row\.header button\s*\{[^}]*color:\s*#1c2b42;/i);
  });

  it("keeps custom wallpaper images clear behind the main content", () => {
    expect(css).toMatch(/data-wallpaper-image="true"\]\s+\.content\s*\{[^}]*backdrop-filter:\s*none;/i);
    expect(css).toMatch(/data-wallpaper-image="true"\]\s+\.sidebar,[\s\S]*?backdrop-filter:\s*blur\(8px\)/i);
    expect(css).toMatch(/data-wallpaper-image="true"\]\s+\.app-card\s*\{[^}]*backdrop-filter:\s*blur\(5px\)/i);
  });
});
