import { describe, expect, it } from "vitest";
import { createCardClickGuard, shouldToggleAppSelectionFromClick } from "./card-click";

describe("app card click handling", () => {
  it("allows a single click to toggle launch selection", () => {
    expect(shouldToggleAppSelectionFromClick(1)).toBe(true);
  });

  it("does not toggle launch selection for the second click of a double click", () => {
    expect(shouldToggleAppSelectionFromClick(2)).toBe(false);
  });

  it("does not commit a slow double click as a single selection toggle", () => {
    const guard = createCardClickGuard({ doubleClickMs: 420 });

    guard.markClick("weixin", 1000);
    expect(guard.shouldCommitSingleClick("weixin", 1000)).toBe(true);
    guard.markDoubleClick("weixin", 1280);
    expect(guard.shouldCommitSingleClick("weixin", 1281)).toBe(false);
    guard.markClick("weixin", 1705);
    expect(guard.shouldCommitSingleClick("weixin", 1705)).toBe(true);
  });
});
