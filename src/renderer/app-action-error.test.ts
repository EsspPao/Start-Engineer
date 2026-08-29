import { describe, expect, it } from "vitest";
import type { FocusAppWindowResult } from "../shared/types";
import { appActionFailureMessage, exceptionActionFailure, launchActionFailure, wakeActionFailure } from "./app-action-error";

describe("application action errors", () => {
  it("maps a missing executable to a stable code and short user message", () => {
    const failure = launchActionFailure({ status: "failed", errorCode: 2, message: "C:\\Users\\ExampleUser\\missing.exe was not found" })!;
    expect(failure.code).toBe("executable-missing");
    expect(appActionFailureMessage(failure)).toBe("程序路径不存在，请重新选择启动程序");
    expect(appActionFailureMessage(failure)).not.toContain("ExampleUser");
  });

  it("keeps technical exception details out of the user message", () => {
    const failure = exceptionActionFailure("close", new Error("taskkill exited with code 128: private detail"));
    expect(failure.diagnostics?.technicalMessage).toContain("private detail");
    expect(appActionFailureMessage(failure)).toBe("结束应用失败，请刷新状态后重试");
  });

  it("normalizes Wake Engine failure reasons", () => {
    const result: FocusAppWindowResult = {
      success: false,
      focused: false,
      outcome: "failed",
      reason: "tray-restore-unsupported",
      strategy: "window-only",
      diagnostics: { profileId: "wechat", profileSource: "built-in", externalActionsPerformed: 0 },
    };
    const failure = wakeActionFailure(result)!;
    expect(failure.code).toBe("tray-restore-unsupported");
    expect(failure.retryable).toBe(false);
  });
});
