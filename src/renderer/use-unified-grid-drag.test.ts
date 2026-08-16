import { describe, expect, it } from "vitest";
import { resolveMergeCandidateTarget, type UnifiedDragCandidate } from "./use-unified-grid-drag.js";

const rect = { left: 100, right: 300, top: 100, bottom: 260, width: 200, height: 160 };
const folderCandidate = (folderId: string): UnifiedDragCandidate => ({
  kind: "folder",
  folderId,
  itemId: `folder:${folderId}`,
  startX: 0,
  startY: 0,
  grabOffsetX: 0,
  grabOffsetY: 0,
  width: 200,
  height: 160
});

describe("unified grid merge targeting", () => {
  it("accepts the center of another multi-app card as a whole-card merge target", () => {
    expect(resolveMergeCandidateTarget(folderCandidate("source"), 200, 180, { folderId: "target", folderRect: rect }))
      .toEqual({ kind: "folder", id: "target" });
  });

  it("never allows a multi-app card to merge into itself", () => {
    expect(resolveMergeCandidateTarget(folderCandidate("source"), 200, 180, { folderId: "source", folderRect: rect }))
      .toBeUndefined();
  });

  it("requires the pointer to remain inside the target card merge zone", () => {
    expect(resolveMergeCandidateTarget(folderCandidate("source"), 105, 105, { folderId: "target", folderRect: rect }))
      .toBeUndefined();
  });
});
