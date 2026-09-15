import { describe, expect, it } from "vitest";
import { appDragPreviewStyle, groupSortPreviewPosition } from "./drag-preview-position";

describe("drag preview positioning", () => {
  it("keeps the group sort preview near the pointer", () => {
    expect(groupSortPreviewPosition({
      pointerX: 900,
      pointerY: 520,
      previewWidth: 520,
      previewHeight: 64,
      viewportWidth: 1920,
      viewportHeight: 1080
    })).toEqual({ left: 876, top: 492 });
  });

  it("clamps the group sort preview inside the viewport", () => {
    expect(groupSortPreviewPosition({
      pointerX: 1910,
      pointerY: 1070,
      previewWidth: 520,
      previewHeight: 64,
      viewportWidth: 1920,
      viewportHeight: 1080
    })).toEqual({ left: 1392, top: 1008 });
  });
});

describe("app drag preview avoids sidebar labels", () => {
  const drag = { x: 100, y: 240, grabOffsetX: 100, grabOffsetY: 50, width: 220, height: 148 };
  it("keeps the full preview to the right even between group buttons", () => {
    expect(appDragPreviewStyle(drag, 212, 100)).toEqual({ left: 224, top: 190, width: 220, height: 148 });
  });
  it("preserves the grab point away from the sidebar", () => {
    expect(appDragPreviewStyle({ ...drag, x: 600 }, 212, 100).left).toBe(500);
  });
  it.each([80, 100, 125])("keeps a visible gap and correct card size at %s percent", (uiScale) => {
    const scale = uiScale / 100;
    const style = appDragPreviewStyle(drag, 250 * scale, uiScale);
    expect(style.left * scale).toBeCloseTo(262 * scale);
    expect(style.width * scale).toBeCloseTo(drag.width);
    expect(style.top * scale).toBeCloseTo(190);
  });
});
