import { describe, expect, it } from "vitest";
import { normalizeShortcut, shortcutFromKeyboardEvent, validateShortcut } from "../shared/global-shortcut.js";

describe("global shortcut", () => {
  it("normalizes modifier order and key names", () => {
    expect(normalizeShortcut("shift+ctrl+space")).toBe("Ctrl+Shift+Space");
    expect(normalizeShortcut("alt+control+k")).toBe("Ctrl+Alt+K");
  });

  it("rejects shortcuts without a supported modifier", () => {
    expect(validateShortcut("F8")).toEqual({ valid: false, message: "快捷键必须包含 Ctrl、Alt 或 Shift" });
    expect(validateShortcut("Ctrl")).toEqual({ valid: false, message: "请选择一个非修饰键" });
    expect(validateShortcut("Meta+K")).toEqual({ valid: false, message: "暂不支持 Windows 键" });
  });

  it("creates an accelerator from a keyboard event", () => {
    expect(shortcutFromKeyboardEvent({ key: " ", code: "Space", ctrlKey: true, altKey: false, shiftKey: true, metaKey: false })).toBe("Ctrl+Shift+Space");
    expect(shortcutFromKeyboardEvent({ key: "s", code: "KeyS", ctrlKey: false, altKey: true, shiftKey: true, metaKey: false })).toBe("Alt+Shift+S");
  });
});
