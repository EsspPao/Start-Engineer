import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src", "renderer", "styles.css"), "utf8");

describe("Clear Desktop styles", () => {
  it("keeps the desktop visible without tint or blur on the main shell", () => {
    expect(css).toContain(':root[data-theme="clear"]');
    expect(css).toMatch(/:root\[data-theme="clear"\]\s+\.app-shell\[data-ui-background-tone\]\s*\{[^}]*background:\s*transparent/i);
    expect(css).toMatch(/:root\[data-theme="clear"\]\s+\.sidebar,[\s\S]*?\.content\s*\{[^}]*background:\s*rgba\(7,12,20,\.08\)[^}]*backdrop-filter:\s*none/i);
  });

  it("keeps cards transparent at rest and uses a light material on hover", () => {
    expect(css).toMatch(/:root\[data-theme="clear"\]\s+\.app-card\s*\{[^}]*background:\s*transparent/i);
    expect(css).toMatch(/:root\[data-theme="clear"\]\s+\.app-card:hover\s*\{[^}]*border-color:\s*rgba\(255,255,255,\.28\)[^}]*background:\s*rgba\(255,255,255,\.12\)[^}]*backdrop-filter:\s*blur\(10px\)/i);
    expect(css).not.toMatch(/:root\[data-theme="clear"\]\s+\.app-card:hover\s*\{[^}]*background:\s*rgba\(7,12,20/i);
  });

  it("matches the selected sidebar group to the selected app-card material", () => {
    expect(css).toMatch(/:root\[data-theme="clear"\]\s+\.nav-button\.active\s*\{[^}]*border-color:\s*rgba\(255,255,255,\.28\)[^}]*background:\s*rgba\(255,255,255,\.12\)[^}]*box-shadow:\s*0 8px 22px rgba\(0,0,0,\.12\)[^}]*backdrop-filter:\s*blur\(10px\)/i);
    expect(css).not.toMatch(/:root\[data-theme="clear"\]\s+\.nav-button\.active\s*\{[^}]*background:\s*rgba\(7,12,20/i);
    expect(css).not.toMatch(/:root\[data-theme="clear"\]\s+\.nav-button\.active\s*\{[^}]*box-shadow:[^}]*inset 3px 0/i);
  });

  it("uses a subtle whole-card selection without icon-only decoration", () => {
    expect(css).toMatch(/:root\[data-theme="clear"\]\s+\.app-card\.current\s*\{[^}]*border-color:\s*rgba\(255,255,255,\.28\)[^}]*background:\s*rgba\(255,255,255,\.12\)[^}]*backdrop-filter:\s*blur\(10px\)/i);
    expect(css).toMatch(/:root\[data-theme="clear"\]\s+\.app-card\.current:hover\s*\{[^}]*background:\s*rgba\(255,255,255,\.17\)/i);
    expect(css).not.toMatch(/:root\[data-theme="clear"\]\s+\.app-card\.current::after/i);
    expect(css).not.toMatch(/:root\[data-theme="clear"\]\s+\.app-card\.current\s+\.(?:card-icon|folder-icon)::before/i);
  });

  it("uses a light clear material for expanded folders and their selected member", () => {
    expect(css).toMatch(/:root\[data-theme="clear"\]\s+\.folder-zoom-card\s*\{[^}]*background:\s*rgba\(232,242,250,\.24\)/i);
    expect(css).not.toMatch(/:root\[data-theme="clear"\]\s+\.folder-zoom-card\s+\.app-card\.current\s*\{[^}]*background:\s*rgba\(240,248,255,\.16\)/i);
  });

  it("provides an opaque accessibility fallback when transparency is reduced", () => {
    expect(css).toMatch(/@media \(prefers-reduced-transparency: reduce\)[\s\S]*?:root\[data-theme="clear"\]\s+\.app-shell\s*\{[^}]*background:\s*#101722/i);
  });
});
