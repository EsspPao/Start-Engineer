import { describe, expect, it } from "vitest";
import { resolveAppCardActivation, resolveAppKeyboardAction } from "./app-card-interaction";

describe("app card interaction rules", () => {
  it("selects stopped apps on single click and launches them on double click", () => {
    expect(resolveAppCardActivation({ isRunning: false, isLaunching: false }, "single")).toEqual(["select"]);
    expect(resolveAppCardActivation({ isRunning: false, isLaunching: false }, "double")).toEqual(["launch"]);
  });

  it("selects and focuses running apps without launching them", () => {
    expect(resolveAppCardActivation({ isRunning: true, isLaunching: false }, "single")).toEqual(["select", "focus"]);
    expect(resolveAppCardActivation({ isRunning: true, isLaunching: false }, "double")).toEqual(["focus"]);
  });

  it("does not launch apps that are already launching", () => {
    expect(resolveAppCardActivation({ isRunning: false, isLaunching: true }, "single")).toEqual(["select"]);
    expect(resolveAppCardActivation({ isRunning: false, isLaunching: true }, "double")).toEqual(["launching-feedback"]);
  });

  it("resolves keyboard primary actions without closing apps", () => {
    expect(resolveAppKeyboardAction({ isRunning: false, isLaunching: false, isInvalid: false }, "Enter")).toBe("launch");
    expect(resolveAppKeyboardAction({ isRunning: true, isLaunching: false, isInvalid: false }, "Enter")).toBe("focus");
    expect(resolveAppKeyboardAction({ isRunning: false, isLaunching: true, isInvalid: false }, "Enter")).toBe("launching-feedback");
    expect(resolveAppKeyboardAction({ isRunning: false, isLaunching: false, isInvalid: true }, "Enter")).toBe("pick-executable");
  });

  it("resolves keyboard secondary app actions", () => {
    expect(resolveAppKeyboardAction({ isRunning: false, isLaunching: false, isInvalid: false }, " ")).toBe("toggle-launch-selected");
    expect(resolveAppKeyboardAction({ isRunning: false, isLaunching: false, isInvalid: false }, "ContextMenu")).toBe("context-menu");
    expect(resolveAppKeyboardAction({ isRunning: false, isLaunching: false, isInvalid: false }, "F10", true)).toBe("context-menu");
    expect(resolveAppKeyboardAction({ isRunning: false, isLaunching: false, isInvalid: false }, "F2")).toBe("edit");
    expect(resolveAppKeyboardAction({ isRunning: false, isLaunching: false, isInvalid: false }, "F10")).toBeNull();
  });
});
