import { describe, expect, it } from "vitest";
import { groupSortPreviewPosition } from "./drag-preview-position";

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
