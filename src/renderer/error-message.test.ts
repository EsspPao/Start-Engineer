import { describe, expect, it } from "vitest";
import { cleanErrorMessage } from "./error-message";

describe("renderer error messages", () => {
  it("removes PowerShell internals from taskkill errors", () => {
    const message = cleanErrorMessage(`Error invoking remote method 'groups:killApps': Error: 管理员结束进程失败：taskkill exited with code 128 ������� �?:5 �?: 34
+ ... ode -ne 0) { throw "taskkill exited with code $($process.ExitCode)" } ...
CategoryInfo          : OperationStopped: (taskkill exited with code 128:String) [], RuntimeException
FullyQualifiedErrorId : taskkill exited with code 128 (exit 1)`);

    expect(message).toBe("管理员结束进程失败：部分进程未能结束，请稍后刷新状态后重试。");
  });
});
