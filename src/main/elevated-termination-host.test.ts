import { describe, expect, it, vi } from "vitest";
import { buildElevatedTerminationLaunchRequest, ElevatedTerminationHost, isValidElevatedHello, normalizeTerminationPids } from "./elevated-termination-host.js";

describe("elevated termination host protocol", () => {
  it("normalizes and limits privileged PID requests", () => {
    expect(normalizeTerminationPids([20, 10, 20, 0, -1])).toEqual([10, 20]);
    expect(() => normalizeTerminationPids(Array.from({ length: 65 }, (_, index) => index + 1))).toThrow("最多结束 64 个进程");
  });

  it("accepts only the expected elevated helper handshake", () => {
    const nonce = "ab".repeat(32);
    const hello = { type: "hello", protocol: 1, pid: 42, parentPid: 7, nonce, isElevated: true };
    expect(isValidElevatedHello(hello, { pid: 42, parentPid: 7, nonce })).toBe(true);
    expect(isValidElevatedHello({ ...hello, pid: 43 }, { pid: 42, parentPid: 7, nonce })).toBe(false);
    expect(isValidElevatedHello({ ...hello, nonce: "cd".repeat(32) }, { pid: 42, parentPid: 7, nonce })).toBe(false);
    expect(isValidElevatedHello({ ...hello, isElevated: false }, { pid: 42, parentPid: 7, nonce })).toBe(false);
  });

  it("launches the long-lived privileged helper without a console window", () => {
    expect(buildElevatedTerminationLaunchRequest("C:\\Start Engineer\\helper.exe", 7, "pipe-name", "ab".repeat(32))).toEqual({
      executablePath: "C:\\Start Engineer\\helper.exe",
      workingDirectory: "C:\\Start Engineer",
      arguments: ["terminate-server", "--pipe", "pipe-name", "--parent-pid", "7", "--nonce", "ab".repeat(32)],
      elevated: true,
      waitForExit: false,
      hidden: true
    });
  });

  it("does not trigger an unexpected UAC prompt when the session helper is not authorized", async () => {
    const runNativeHelper = vi.fn();
    const host = new ElevatedTerminationHost({
      runNativeHelper,
      resolveNativeHelperPath: () => "C:\\Start Engineer\\helper.exe"
    });

    await expect(host.terminate([42])).rejects.toMatchObject({ code: "ELEVATION_REQUIRED" });
    expect(runNativeHelper).not.toHaveBeenCalled();
  });
});


describe("WeGame authorization reuse", () => {
  it("reuses an authorized session for repeated wake requests", async () => {
    const runNativeHelper = vi.fn();
    const host = new ElevatedTerminationHost({ runNativeHelper, resolveNativeHelperPath: () => "helper.exe" });
    const internal = host as unknown as { state: { status: string }; socket: object; request: (command: string, pids: number[], timeout: number) => Promise<unknown> };
    internal.state = { status: "ready" };
    internal.socket = {};
    const request = vi.spyOn(internal, "request").mockResolvedValue({ ok: true, pid: 42 });
    await expect(host.wakeWeGame([42])).resolves.toMatchObject({ ok: true });
    await expect(host.wakeWeGame([42])).resolves.toMatchObject({ ok: true });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledWith("wake-wegame", [42], 15000);
    expect(runNativeHelper).not.toHaveBeenCalled();
  });

  it("rejects absent or multiple targets before requesting authorization", async () => {
    const runNativeHelper = vi.fn();
    const host = new ElevatedTerminationHost({ runNativeHelper, resolveNativeHelperPath: () => "helper.exe" });
    await expect(host.wakeWeGame([])).rejects.toThrow("single running WeGame");
    await expect(host.wakeWeGame([41, 42])).rejects.toThrow("single running WeGame");
    expect(runNativeHelper).not.toHaveBeenCalled();
  });
});
