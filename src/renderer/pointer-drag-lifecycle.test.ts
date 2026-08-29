import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { primaryPointerButtonReleased } from "./pointer-drag-lifecycle.js";

const main = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
const unifiedDrag = readFileSync(new URL("./use-unified-grid-drag.ts", import.meta.url), "utf8");
const settingsDrag = readFileSync(new URL("./use-settings-group-drag.ts", import.meta.url), "utf8");

describe("pointer drag cancellation", () => {
  it("recognizes a lost primary-button release", () => {
    expect(primaryPointerButtonReleased({ buttons: 0 })).toBe(true);
    expect(primaryPointerButtonReleased({ buttons: 2 })).toBe(true);
    expect(primaryPointerButtonReleased({ buttons: 1 })).toBe(false);
    expect(primaryPointerButtonReleased({ buttons: 3 })).toBe(false);
  });

  it.each([
    ["all-apps", main],
    ["unified-grid", unifiedDrag],
    ["settings", settingsDrag],
  ])("cleans %s dragging on pointer cancellation and lost focus", (_name, source) => {
    expect(source).toContain('window.addEventListener("pointercancel"');
    expect(source).toContain('window.addEventListener("blur"');
    expect(source).toContain('document.addEventListener("visibilitychange"');
    expect(source).toContain("primaryPointerButtonReleased(event)");
  });

  it("captures the initiating pointer for application cards", () => {
    expect(main).toContain("capturePointerForDrag(event.currentTarget, event.pointerId)");
  });
});
