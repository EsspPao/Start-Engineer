import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src", "renderer", "styles.css"), "utf8");

describe("Wallpaper Glass styles", () => {
  it("defines the wallpaper theme, all intensity levels, and a reduced transparency fallback", () => {
    expect(css).toContain(':root[data-theme="wallpaper"]');
    expect(css).toContain('data-wallpaper-intensity="weak"');
    expect(css).toContain('data-wallpaper-intensity="medium"');
    expect(css).toContain('data-wallpaper-intensity="strong"');
    expect(css).toContain('data-wallpaper-variant="light"');
    expect(css).toContain(".wallpaper-variant-control");
    expect(css).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(css).toContain(':root[data-theme="wallpaper"] .app-shell');
  });

  it("keeps the light wallpaper variant visibly more transparent", () => {
    expect(css).toContain('--wallpaper-shell: rgba(245,248,255,.58)');
    expect(css).toContain('--wallpaper-card: rgba(255,255,255,.26)');
    expect(css).toContain('--wallpaper-shell: rgba(245,248,255,.42)');
    expect(css).toContain('--wallpaper-card: rgba(255,255,255,.18)');
    expect(css).toContain('linear-gradient(135deg,var(--wallpaper-shell),rgba(236,244,255,.24))');
  });
});
