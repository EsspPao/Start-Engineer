import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src", "renderer", "styles.css"), "utf8");
const sharedThemeSelector = String.raw`:root\[data-theme\]:not\(\[data-theme="clear"\]\):not\(\[data-theme="wallpaper"\]\)`;

describe("unified Wallpaper Glass theme language", () => {
  it("provides a color-only material palette for presets other than Wallpaper Glass and Clear Desktop", () => {
    for (const theme of ["apple", "fluent", "utility", "glass", "midnight"]) {
      expect(css).toMatch(new RegExp(`:root\\[data-theme="${theme}"\\]\\s*\\{[^}]*--theme-shell:[^}]*--theme-card:`, "i"));
    }
    expect(css).not.toMatch(/:root\[data-theme="wallpaper"\]\s*\{[^}]*--theme-shell:/i);
  });

  it("shares one window, navigation, panel, and card geometry while excluding both independent themes", () => {
    expect(css).toMatch(new RegExp(`${sharedThemeSelector}\\s+\\.app-shell\\s*\\{[^}]*grid-template-columns:\\s*212px[^}]*gap:\\s*10px`, "i"));
    expect(css).toMatch(new RegExp(`${sharedThemeSelector}\\s+\\.window\\s*\\{[^}]*grid-template-rows:\\s*82px`, "i"));
    expect(css).toMatch(new RegExp(`${sharedThemeSelector}\\s+\\.nav-button\\s*\\{[^}]*height:\\s*46px[^}]*border-radius:\\s*var\\(--radius-control\\)`, "i"));
    expect(css).toMatch(new RegExp(`${sharedThemeSelector}\\s+\\.app-card,[\\s\\S]*?background:\\s*var\\(--theme-card\\)[^}]*backdrop-filter:\\s*blur\\(16px\\)`, "i"));
  });

  it("uses the same selected-card treatment for every non-clear palette", () => {
    expect(css).toMatch(new RegExp(`${sharedThemeSelector}\\s+\\.app-card\\.current,[\\s\\S]*?border-color:\\s*var\\(--accent\\)[^}]*background:\\s*color-mix\\(in srgb,var\\(--accent\\) 20%,var\\(--theme-card\\)\\)`, "i"));
  });

  it("preserves user layout controls inside the shared theme geometry", () => {
    expect(css).toMatch(new RegExp(`${sharedThemeSelector}\\s+\\.app-shell\\[data-ui-sidebar-width="narrow"\\]\\s*\\{[^}]*180px`, "i"));
    expect(css).toMatch(new RegExp(`${sharedThemeSelector}\\s+\\.app-shell\\[data-ui-brand-icon-size="standard"\\]\\s+\\.brand-icon\\s*\\{[^}]*58px`, "i"));
    for (const tone of ["aurora", "graphite", "mist"]) {
      expect(css).toContain(`.app-shell[data-ui-background-tone="${tone}"]`);
    }
  });

  it("keeps a no-blur accessibility fallback for the unified surfaces", () => {
    expect(css).toMatch(new RegExp(`@media \\(prefers-reduced-transparency: reduce\\)[\\s\\S]*?${sharedThemeSelector}\\s+\\.sidebar,[\\s\\S]*?\\.search-results-panel\\s*\\{\\s*backdrop-filter:\\s*none`, "i"));
  });
});
