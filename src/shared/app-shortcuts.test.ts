import { describe, expect, it } from "vitest";
import { defaultKeyboardShortcuts } from "../main/preferences";
import { appShortcutFromEvent, findAppShortcut, findShortcutConflict } from "./app-shortcuts";

const event = (key: string, code = key, ctrlKey = false, shiftKey = false) => ({ key, code, ctrlKey, shiftKey, altKey: false, metaKey: false });

describe("app shortcuts", () => {
  it("matches every default navigation alias", () => {
    expect(findAppShortcut(defaultKeyboardShortcuts, event("ArrowUp"))).toBe("up");
    expect(findAppShortcut(defaultKeyboardShortcuts, event("w", "KeyW"))).toBe("up");
    expect(findAppShortcut(defaultKeyboardShortcuts, event("4", "Digit4", true))).toBe("group4");
  });

  it("uses a replacement binding without retaining defaults", () => {
    const shortcuts = { ...defaultKeyboardShortcuts, activate: ["Ctrl+L"] };
    expect(findAppShortcut(shortcuts, event("Enter"))).toBeNull();
    expect(findAppShortcut(shortcuts, event("l", "KeyL", true))).toBe("activate");
  });

  it("normalizes events and detects conflicts", () => {
    expect(appShortcutFromEvent(event("f", "KeyF", true))).toBe("Ctrl+F");
    expect(findShortcutConflict(defaultKeyboardShortcuts, "ctrl+f", "activate")).toBe("search");
  });
});
