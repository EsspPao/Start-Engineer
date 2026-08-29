import { describe, expect, it } from "vitest";
import { collapsedFolderKeyboardSelection, expandedFolderKeyboardSelection, groupIndexNavigationFromKey, groupNavigationFromKey, isEscapeKeyboardEvent, keyboardBlockKeyFromEventLike, isTextInputTarget, navigationDirectionFromKey, pickDirectionalApp, pickIndexedGroup, pickRelativeGroup, resolveFolderKeyboardAction, shouldSuppressNavigationAfterGroupMove } from "./keyboard-navigation";

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

  it("moves between normal apps and merged app cards in one visible grid", () => {
    const cards = [
      rect("app:steam", 0, 0),
      rect("folder:games", 140, 0),
      rect("app:codex", 280, 0),
      rect("app:notion", 0, 120)
    ];

    expect(pickDirectionalApp(cards, "app:steam", "right")).toBe("folder:games");
    expect(pickDirectionalApp(cards, "folder:games", "right")).toBe("app:codex");
    expect(pickDirectionalApp(cards, "folder:games", "left")).toBe("app:steam");
  });

  it("expands a merged card on activation and reserves a separate command for launching all", () => {
    expect(resolveFolderKeyboardAction("activate", true)).toBe("expand");
    expect(resolveFolderKeyboardAction("launchFolder", true)).toBe("launch");
    expect(resolveFolderKeyboardAction("launchFolder", false, true)).toBe("launch");
    expect(resolveFolderKeyboardAction("activate", false, true)).toBeNull();
    expect(resolveFolderKeyboardAction("activate", false)).toBeNull();
    expect(resolveFolderKeyboardAction("edit", true)).toBeNull();
  });

  it("selects the first valid folder member on expand and restores the folder on collapse", () => {
    expect(expandedFolderKeyboardSelection("games", ["missing", "steam", "codex"], ["steam", "codex"])).toEqual({
      expandedFolderId: "games",
      selectedItemId: "app:steam",
      selectedAppId: "steam"
    });
    expect(expandedFolderKeyboardSelection("empty", ["missing"], [])).toEqual({
      expandedFolderId: "empty",
      selectedItemId: "folder:empty",
      selectedAppId: ""
    });
    expect(collapsedFolderKeyboardSelection("games")).toEqual({
      expandedFolderId: "",
      selectedItemId: "folder:games",
      selectedAppId: ""
    });
  });

  it("recognizes the physical Escape key independently from configurable shortcuts", () => {
    expect(isEscapeKeyboardEvent({ key: "Escape", code: "Escape" })).toBe(true);
    expect(isEscapeKeyboardEvent({ key: "Esc", code: "Escape" })).toBe(true);
    expect(isEscapeKeyboardEvent({ key: "Unidentified", code: "Escape" })).toBe(true);
    expect(isEscapeKeyboardEvent({ key: "Enter", code: "Enter" })).toBe(false);
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

  it("maps Ctrl+number keys to direct app group indexes", () => {
    expect(groupIndexNavigationFromKey({ key: "1", code: "Digit1", ctrlKey: true })).toBe(0);
    expect(groupIndexNavigationFromKey({ key: "2", code: "Digit2", ctrlKey: true })).toBe(1);
    expect(groupIndexNavigationFromKey({ key: "3", code: "Digit3", ctrlKey: true })).toBe(2);
    expect(groupIndexNavigationFromKey({ key: "1", code: "Digit1" })).toBeNull();
    expect(groupIndexNavigationFromKey({ key: "1", code: "Digit1", ctrlKey: true, altKey: true })).toBeNull();
    expect(groupIndexNavigationFromKey({ key: "1", code: "Digit1", ctrlKey: true, metaKey: true })).toBeNull();
    expect(groupIndexNavigationFromKey({ key: "4", code: "Digit4", ctrlKey: true })).toBe(3);
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
    const groups = ["all-apps", "office", "games", "settings"];

    expect(pickRelativeGroup(groups, "office", "next")).toBe("games");
    expect(pickRelativeGroup(groups, "office", "previous")).toBe("all-apps");
    expect(pickRelativeGroup(groups, "all-apps", "next")).toBe("office");
    expect(pickRelativeGroup(groups, "settings", "next")).toBe("settings");
    expect(pickRelativeGroup(groups, "missing", "next")).toBe("all-apps");
  });

  it("picks app groups by zero-based shortcut index", () => {
    const groups = ["games", "office", "tools"];

    expect(pickIndexedGroup(groups, 0)).toBe("games");
    expect(pickIndexedGroup(groups, 1)).toBe("office");
    expect(pickIndexedGroup(groups, 2)).toBe("tools");
    expect(pickIndexedGroup(groups, 3)).toBe("");
  });
});
