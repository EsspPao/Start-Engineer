import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveContextMenuPosition } from "./context-menus";

const styles = readFileSync(join(process.cwd(), "src/renderer/styles.css"), "utf8");

describe("resolveContextMenuPosition", () => {
  it("keeps a menu inside the lower-right viewport boundary", () => {
    expect(resolveContextMenuPosition({ x: 950, y: 700, menuWidth: 226, menuHeight: 520, viewportWidth: 1024, viewportHeight: 768 })).toEqual({ left: 790, top: 240 });
  });

  it("preserves an anchor that already leaves enough room", () => {
    expect(resolveContextMenuPosition({ x: 120, y: 100, menuWidth: 226, menuHeight: 300, viewportWidth: 1024, viewportHeight: 768 })).toEqual({ left: 120, top: 100 });
  });

  it("pins an oversized menu to the viewport margin so its own overflow can scroll", () => {
    expect(resolveContextMenuPosition({ x: 400, y: 500, menuWidth: 226, menuHeight: 752, viewportWidth: 1024, viewportHeight: 768 })).toEqual({ left: 400, top: 8 });
  });

  it("keeps wheel scrolling inside the height-constrained menu", () => {
    expect(styles).toMatch(/\.context-menu\s*\{[^}]*max-height:\s*calc\(100vh\s*-\s*16px\)/i);
    expect(styles).toMatch(/\.context-menu\s*\{[^}]*overflow-y:\s*auto/i);
    expect(styles).toMatch(/\.context-menu\s*\{[^}]*overscroll-behavior:\s*contain/i);
  });
});
