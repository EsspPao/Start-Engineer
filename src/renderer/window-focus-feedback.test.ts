import { describe, expect, it } from "vitest";
import type { FocusAppWindowResult, WakeFailureReason } from "../shared/types";
import { focusResultMessage } from "./window-focus-feedback";

const result = (reason?: WakeFailureReason, success = false): FocusAppWindowResult => ({
  success,
  focused: false,
  outcome: success ? "activation-requested" : "failed",
  reason,
  strategy: "window-only",
  diagnostics: { profileId: "default", profileSource: "default", externalActionsPerformed: 0 }
});

describe("window focus feedback", () => {
  it("does not report an accepted one-shot activation as a failure", () => {
    expect(focusResultMessage(result(undefined, true))).toBe("");
  });

  it("uses a generic tray limitation message instead of naming a specific app", () => {
    expect(focusResultMessage(result("tray-restore-unsupported"))).toBe("应用已隐藏到系统托盘，请手动从托盘打开");
  });

  it("maps unified Wake Engine reasons to concise user feedback", () => {
    expect(focusResultMessage(result("self-launch-failed"))).toContain("重新运行应用");
    expect(focusResultMessage(result("aumid-activation-failed"))).toContain("Windows 应用身份");
    expect(focusResultMessage(result("focus-blocked-by-windows"))).toContain("Windows 阻止");
    expect(focusResultMessage(result("no-interactive-window"))).toBe("未找到可交互窗口");
  });
});
