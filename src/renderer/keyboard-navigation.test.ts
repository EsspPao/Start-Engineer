import { describe, expect, it } from "vitest";
import { groupNavigationFromKey, keyboardBlockKeyFromEventLike, isTextInputTarget, navigationDirectionFromKey, pickDirectionalApp, pickRelativeGroup, shouldSuppressNavigationAfterGroupMove } from "./keyboard-navigation";

const rect = (id: string, left: number, top: number, width = 100, height = 80) => ({
  id,
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height
});

describe("keyboard navigation", () => {
  it("maps arrows and WASD to navigation directions", () => {
    expect(navigationDirectionFromKey("ArrowUp")).toBe("up");
    expect(navigationDirectionFromKey("w")).toBe("up");
    expect(navigationDirectionFromKey("A")).toBe("left");
    expect(navigationDirectionFromKey("s")).toBe("down");
    expect(navigationDirectionFromKey("D")).toBe("right");
    expect(navigationDirectionFromKey("x")).toBeNull();
  });

  it("uses grid geometry instead of array order for directional movement", () => {
    const cards = [
      rect("top-left", 0, 0),
      rect("top-right", 140, 0),
      rect("middle", 65, 120),
      rect("bottom-left", 0, 240),
      rect("bottom-right", 140, 240)
    ];

    expect(pickDirectionalApp(cards, "middle", "up")).toBe("top-left");
    expect(pickDirectionalApp(cards, "middle", "down")).toBe("bottom-left");
    expect(pickDirectionalApp(cards, "top-left", "right")).toBe("top-right");
    expect(pickDirectionalApp(cards, "top-left", "left")).toBe("top-left");
  });

  it("does not hijack text entry targets", () => {
    expect(isTextInputTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isTextInputTarget({ tagName: "textarea" } as unknown as EventTarget)).toBe(true);
    expect(isTextInputTarget({ isContentEditable: true, tagName: "div" } as unknown as EventTarget)).toBe(true);
    expect(isTextInputTarget({ tagName: "button" } as unknown as EventTarget)).toBe(false);
  });

  it("maps Ctrl+vertical navigation keys to group movement", () => {
    expect(groupNavigationFromKey("ArrowUp", true)).toBe("previous");
    expect(groupNavigationFromKey("w", true)).toBe("previous");
    expect(groupNavigationFromKey("ArrowDown", true)).toBe("next");
    expect(groupNavigationFromKey("S", true)).toBe("next");
    expect(groupNavigationFromKey("w", false)).toBeNull();
    expect(groupNavigationFromKey("s", false)).toBeNull();
    expect(groupNavigationFromKey("ArrowDown", false)).toBeNull();
    expect(groupNavigationFromKey("a", true)).toBeNull();
  });

  it("does not treat Meta as a group navigation modifier", () => {
    expect(groupNavigationFromKey("ArrowUp", false)).toBeNull();
    expect(groupNavigationFromKey("ArrowDown", false)).toBeNull();
    expect(groupNavigationFromKey("w", false)).toBeNull();
    expect(groupNavigationFromKey("s", false)).toBeNull();
  });

  it("suppresses the same physical key after group navigation until keyup", () => {
    const blockedKey = keyboardBlockKeyFromEventLike({ key: "s", code: "KeyS" });

    expect(shouldSuppressNavigationAfterGroupMove(blockedKey, { key: "s", code: "KeyS" })).toBe(true);
    expect(shouldSuppressNavigationAfterGroupMove(blockedKey, { key: "S", code: "KeyS" })).toBe(true);
    expect(shouldSuppressNavigationAfterGroupMove(blockedKey, { key: "s", code: "KeyS", ctrlKey: true })).toBe(false);
    expect(shouldSuppressNavigationAfterGroupMove(blockedKey, { key: "w", code: "KeyW" })).toBe(false);
    expect(shouldSuppressNavigationAfterGroupMove(null, { key: "s", code: "KeyS" })).toBe(false);
  });

  it("moves between groups while clamping at the ends", () => {
    const groups = ["processes", "office", "games", "settings"];

    expect(pickRelativeGroup(groups, "office", "next")).toBe("games");
    expect(pickRelativeGroup(groups, "office", "previous")).toBe("processes");
    expect(pickRelativeGroup(groups, "settings", "next")).toBe("settings");
    expect(pickRelativeGroup(groups, "missing", "next")).toBe("processes");
  });
});
