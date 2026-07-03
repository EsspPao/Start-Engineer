import { describe, expect, it } from "vitest";
import { administratorRestartRequired, buildRestartRequest, shouldContinueAfterAdministratorRelaunchAttempt, shouldDetectAdministratorSynchronously, shouldRequestAdministratorRelaunch } from "./administrator-launch.js";

describe("administrator launch", () => {
  it("requires a restart when configured and current privileges differ", () => {
    expect(administratorRestartRequired(true, false)).toBe(true);
    expect(administratorRestartRequired(false, true)).toBe(true);
    expect(administratorRestartRequired(true, true)).toBe(false);
  });

  it("uses the portable entry point and marks elevated restarts", () => {
    expect(buildRestartRequest("C:\\Temp\\Start Engineer.exe", "D:\\Apps\\Start-Engineer-Portable.exe", true)).toEqual({
      executablePath: "D:\\Apps\\Start-Engineer-Portable.exe",
      args: ["--administrator-relaunch"],
      elevated: true,
    });
  });

  it("uses the installed executable for a normal restart", () => {
    expect(buildRestartRequest("C:\\Program Files\\Start Engineer.exe", "", false)).toEqual({
      executablePath: "C:\\Program Files\\Start Engineer.exe",
      args: ["--standard-relaunch"],
      elevated: false,
    });
  });

  it("requests elevation only for a normal non-administrator launch", () => {
    expect(shouldRequestAdministratorRelaunch(true, false, [])).toBe(true);
    expect(shouldRequestAdministratorRelaunch(false, false, [])).toBe(false);
    expect(shouldRequestAdministratorRelaunch(true, true, [])).toBe(false);
    expect(shouldRequestAdministratorRelaunch(true, false, ["--administrator-relaunch"])).toBe(false);
    expect(shouldRequestAdministratorRelaunch(true, false, ["--standard-relaunch"])).toBe(false);
  });

  it("does not continue the ordinary process after a cold-start administrator relaunch attempt", () => {
    expect(shouldContinueAfterAdministratorRelaunchAttempt("launched")).toBe(false);
    expect(shouldContinueAfterAdministratorRelaunchAttempt("cancelled")).toBe(false);
  });

  it("only needs synchronous administrator detection when administrator mode is configured", () => {
    expect(shouldDetectAdministratorSynchronously(false, [])).toBe(false);
    expect(shouldDetectAdministratorSynchronously(true, [])).toBe(true);
    expect(shouldDetectAdministratorSynchronously(false, ["--administrator-relaunch"])).toBe(true);
    expect(shouldDetectAdministratorSynchronously(false, ["--standard-relaunch"])).toBe(true);
  });
});
