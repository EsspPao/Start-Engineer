import { describe, expect, it } from "vitest";
import { completePreviewOrder, getReorderedIds, hitTestAppOrder, reuseOrderIfEqual } from "./app-drag-order";

describe("app card drag ordering", () => {
  it("reuses an unchanged preview so pointer movement does not rerender the grid", () => {
    const previous = ["app:a", "app:b", "folder:c"];
    expect(reuseOrderIfEqual(previous, [...previous])).toBe(previous);
    expect(reuseOrderIfEqual(previous, ["app:b", "app:a", "folder:c"])).not.toBe(previous);
  });

  it("never lets an empty or partial preview remove grid items", () => {
    const base = ["app:a", "folder:b", "app:c"];
    expect(completePreviewOrder(base, [])).toEqual(base);
    expect(completePreviewOrder(base, ["app:c"])).toEqual(["app:c", "app:a", "folder:b"]);
    expect(completePreviewOrder(base, ["unknown", "folder:b"])).toEqual(["folder:b", "app:a", "app:c"]);
  });

  it("moves the dragged id to the target index", () => {
    expect(getReorderedIds(["a", "b", "c", "d"], "b", 3)).toEqual(["a", "c", "d", "b"]);
  });

  it("uses the nearest card center as the insertion target", () => {
    const ids = ["a", "b", "c"];
    const rects = [
      { id: "a", left: 0, top: 0, width: 100, height: 100 },
      { id: "b", left: 120, top: 0, width: 100, height: 100 },
      { id: "c", left: 240, top: 0, width: 100, height: 100 },
    ];

    expect(hitTestAppOrder(ids, rects, "a", 340, 50)).toEqual(["b", "c", "a"]);
  });

  it("inserts between cards when the pointer is in the horizontal gap", () => {
    const ids = ["a", "b", "c"];
    const rects = [
      { id: "a", left: 0, top: 0, width: 100, height: 100 },
      { id: "b", left: 140, top: 0, width: 100, height: 100 },
      { id: "c", left: 280, top: 0, width: 100, height: 100 },
    ];

    expect(hitTestAppOrder(ids, rects, "a", 260, 50)).toEqual(["b", "a", "c"]);
  });

  it("chooses the row under the pointer before comparing horizontal halves", () => {
    const ids = ["a", "b", "c", "d"];
    const rects = [
      { id: "a", left: 0, top: 0, width: 100, height: 100 },
      { id: "b", left: 120, top: 0, width: 100, height: 100 },
      { id: "c", left: 0, top: 130, width: 100, height: 100 },
      { id: "d", left: 120, top: 130, width: 100, height: 100 },
    ];

    expect(hitTestAppOrder(ids, rects, "a", 180, 160)).toEqual(["b", "c", "d", "a"]);
  });

  it("uses the nearest row when the pointer is between rows", () => {
    const ids = ["a", "b", "c", "d"];
    const rects = [
      { id: "a", left: 0, top: 0, width: 100, height: 100 },
      { id: "b", left: 120, top: 0, width: 100, height: 100 },
      { id: "c", left: 0, top: 150, width: 100, height: 100 },
      { id: "d", left: 120, top: 150, width: 100, height: 100 },
    ];

    expect(hitTestAppOrder(ids, rects, "d", 40, 126)).toEqual(["a", "b", "d", "c"]);
  });
});
