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

  it("removes only app-card browser focus outlines so the blue selected state is the only card focus ring", () => {
    expect(styles).toMatch(/\.app-card:focus,\s*\.app-card:focus-visible\s*\{[^}]*outline:\s*none;/i);
    expect(styles).toMatch(/\.app-card\s+button:focus,\s*\.app-card\s+button:focus-visible,\s*\.app-card\s+\[tabindex\]:focus,\s*\.app-card\s+\[tabindex\]:focus-visible\s*\{[^}]*outline:\s*none;/i);
    expect(styles).not.toMatch(/\*:focus[^{]*\{[^}]*outline:\s*none/i);
  });

  it("removes the app grid container browser focus outline without disabling focus globally", () => {
    expect(styles).toMatch(/\.app-grid:focus,\s*\.app-grid:focus-visible\s*\{[^}]*outline:\s*none;/i);
    expect(styles).not.toMatch(/\*:focus[^{]*\{[^}]*outline:\s*none/i);
  });

  it("centers the app grid tracks inside the group content area", () => {
    expect(styles).toMatch(/\.app-grid\s*\{[^}]*justify-content:\s*center;/i);
  });

  it("shrinks apps into both ordinary cards and existing multi-app cards without text or progress chrome", () => {
    expect(styles).toMatch(/merge-target-app-in\s+380ms/i);
    expect(styles).toMatch(/merge-target-folder-in\s+380ms/i);
    expect(styles).toMatch(/merge-source-app-in\s+380ms/i);
    expect(styles).toMatch(/merge-source-folder-in/i);
    expect(styles).not.toContain('content: "保持片刻"');
    expect(styles).not.toContain('content: "松开合并"');
    expect(styles).not.toContain("merge-target-arm");
  });

  it("uses one iPhone-style progress ring before showing terminal folder member states", () => {
    for (const status of ["queued", "launching", "waiting", "launched", "alreadyRunning", "failed"]) {
      expect(styles).toContain(`.folder-member-launch.${status}`);
    }
    expect(styles).toMatch(/\.folder-member-launch\.queued > i,\s*\.folder-member-launch\.launching > i,\s*\.folder-member-launch\.waiting > i\s*\{[^}]*border-radius:\s*50%;/i);
    expect(styles).not.toMatch(/\.folder-member-launch\.queued > i\s*\{[^}]*dashed/i);
    expect(styles).toMatch(/folder-member-spin\s+900ms\s+linear\s+infinite/i);
    expect(styles).toContain("folder-batch-active");
  });

  it("distinguishes partially running folders and emphasizes group actions", () => {
    expect(styles).toMatch(/\.folder-running-status\.partial\s+\.running-dot\s*\{[^}]*conic-gradient\(#22c55e var\(--folder-running-progress/i);
    expect(styles).toContain(".folder-member-launch.member-running");
    expect(styles).toMatch(/\.group-actions\s+\.group-add-action[\s\S]*?height:\s*46px/i);
    expect(styles).toMatch(/\.group-actions\s+\.group-close-action[\s\S]*?background:\s*color-mix\(in srgb,#fff1f3/i);
  });

  it("applies a constrained liquid glass material to buttons without changing global focus behavior", () => {
    expect(styles).toContain("--liquid-button-highlight");
    expect(styles).toMatch(/\.search-button::before,\s*[\s\S]*?\.toast button::before\s*\{[\s\S]*?background:\s*linear-gradient\(180deg,var\(--liquid-button-highlight\),transparent\)/i);
    expect(styles).toMatch(/:root\[data-theme\]\s+\.search-button,\s*:root\[data-theme\]\s+\.launch\s*\{[\s\S]*?box-shadow:\s*var\(--liquid-primary-shadow\)/i);
    expect(styles).toMatch(/\.ghost,\s*[\s\S]*?\.group-app-empty button\s*\{[\s\S]*?backdrop-filter:\s*blur\(12px\)\s*saturate\(1\.12\)/i);
    expect(styles).not.toMatch(/\*:focus[^{]*\{[^}]*outline:\s*none/i);
  });
});
