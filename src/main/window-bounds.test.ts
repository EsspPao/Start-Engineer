import { describe, expect, it } from "vitest";
import { fitWindowBounds } from "./window-bounds.js";

describe("window bounds", () => {
  it("recenters old default and screen-filling windows at the compact default", () => {
    const area = { x: 0, y: 0, width: 2048, height: 1100 };
    for (const saved of [{ x: 0, y: 80, width: 2048, height: 970 }, { x: 0, y: 0, width: 1461, height: 810 }, { x: 0, y: 0, width: 1200, height: 720 }]) {
      expect(fitWindowBounds(saved, area)).toEqual({ x: 304, y: 150, width: 1440, height: 800 });
    }
  });
  it("centers the reference window size on first launch", () => {
    expect(fitWindowBounds(undefined, { x: 0, y: 0, width: 1920, height: 1080 })).toEqual({ x: 240, y: 140, width: 1440, height: 800 });
  });
  it("fits oversized and offscreen saved windows on small displays", () => {
    expect(fitWindowBounds({ x: 3000, y: -500, width: 1800, height: 1200 }, { x: 0, y: 0, width: 1024, height: 600 })).toEqual({ x: 52, y: 30, width: 921, height: 540 });
  });
  it("preserves valid placement on monitors with negative coordinates", () => {
    const saved = { x: -1500, y: 20, width: 1200, height: 700 };
    expect(fitWindowBounds(saved, { x: -1920, y: 0, width: 1920, height: 1080 })).toEqual(saved);
  });
});
