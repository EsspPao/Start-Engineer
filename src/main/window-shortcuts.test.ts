import { describe, expect, it } from "vitest";
import { startEngineerGroupShortcutDirection } from "./window-shortcuts.js";

describe("window shortcuts", () => {
  it("captures Start Engineer group shortcuts before Chromium handles them as window commands", () => {
    expect(startEngineerGroupShortcutDirection({ key: "w", control: true })).toBe("previous");
    expect(startEngineerGroupShortcutDirection({ key: "ArrowUp", control: true })).toBe("previous");
    expect(startEngineerGroupShortcutDirection({ key: "s", control: true })).toBe("next");
    expect(startEngineerGroupShortcutDirection({ key: "ArrowDown", control: true })).toBe("next");
  });

  it("does not capture ordinary text input keys", () => {
    expect(startEngineerGroupShortcutDirection({ key: "w", control: false })).toBeNull();
    expect(startEngineerGroupShortcutDirection({ key: "a", control: true })).toBeNull();
    expect(startEngineerGroupShortcutDirection({ key: "Enter", control: true })).toBeNull();
  });
});
