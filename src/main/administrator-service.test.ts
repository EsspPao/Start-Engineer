import { describe, expect, it } from "vitest";
import { launchErrorMessage, toNativeLaunchRequest } from "./administrator-service.js";

describe("administrator-service", () => {
  it("builds a native launch request with the executable directory", () => {
    expect(toNativeLaunchRequest({ executablePath: "C:\\Tools\\Start Engineer.exe", args: ["--administrator-relaunch"], elevated: true })).toEqual({
      executablePath: "C:\\Tools\\Start Engineer.exe",
      workingDirectory: "C:\\Tools",
      arguments: ["--administrator-relaunch"],
      elevated: true
    });
  });

  it("maps common Windows launch errors to actionable messages", () => {
    expect(launchErrorMessage(5)).toContain("权限");
    expect(launchErrorMessage(267)).toContain("工作目录");
    expect(launchErrorMessage()).toContain("启动失败");
  });
});
