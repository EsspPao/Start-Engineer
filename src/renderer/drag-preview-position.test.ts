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

describe("app drag preview shrinks into groups", () => {
  const drag = { x: 100, y: 240, grabOffsetX: 100, grabOffsetY: 50, width: 220, height: 148 };
  it("allows entering the sidebar", () => {
    expect(appDragPreviewStyle(drag, undefined, 100)).toMatchObject({ left: 0, top: 190, "--group-preview-scale": 1 });
  });
  it.each([80, 100, 125])("fits inside the target at %s percent", (uiScale) => {
    const scale = uiScale / 100;
    const style = appDragPreviewStyle(drag, { right: 200 * scale, top: 240 * scale, height: 48 * scale }, uiScale);
    const size = style["--group-preview-scale"];
    expect(Math.max(style.width, style.height) * size).toBeCloseTo(36);
    expect(style.left + parseFloat(style["--group-preview-x"]) + style.width * size).toBeCloseTo(190);
    expect(style.top + parseFloat(style["--group-preview-y"]) + style.height * size / 2).toBeCloseTo(264);
  });
});
