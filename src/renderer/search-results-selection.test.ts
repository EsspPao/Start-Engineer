import { describe, expect, it } from "vitest";
import { resolveSearchResultAction } from "./search-results-selection";

describe("search result selection", () => {
  it("opens Everything file fallback results only after app results are exhausted", () => {
    expect(resolveSearchResultAction({ managedCount: 0, discoveredCount: 0, fileCount: 2, selectedIndex: 1 })).toEqual({ kind: "open-file", index: 1 });
    expect(resolveSearchResultAction({ managedCount: 1, discoveredCount: 0, fileCount: 2, selectedIndex: 1 })).toEqual({ kind: "none" });
  });

  it("keeps managed and discovered app actions first", () => {
    expect(resolveSearchResultAction({ managedCount: 1, discoveredCount: 1, fileCount: 0, selectedIndex: 0 })).toEqual({ kind: "managed", index: 0 });
    expect(resolveSearchResultAction({ managedCount: 1, discoveredCount: 1, fileCount: 0, selectedIndex: 1 })).toEqual({ kind: "discovered", index: 0 });
  });
});
