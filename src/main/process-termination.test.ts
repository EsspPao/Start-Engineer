import { describe, expect, it, vi } from "vitest";
import { buildTaskkillArgs, terminatePids } from "./process-termination.js";

describe("process termination", () => {
  it("builds one taskkill command for all unique valid PIDs", () => {
    expect(buildTaskkillArgs([20, 10, 20, -1, 0])).toEqual(["/PID", "10", "/PID", "20", "/T", "/F"]);
  });

  it("does not request elevation when normal termination succeeds", async () => {
    const runNormal = vi.fn(async () => undefined);
    const runElevated = vi.fn(async () => undefined);
    const getRunningPids = vi.fn().mockResolvedValueOnce([10, 11]).mockResolvedValueOnce([]);

    await expect(terminatePids([10, 11], { runNormal, runElevated, getRunningPids })).resolves.toEqual({ elevated: false });
    expect(runNormal).toHaveBeenCalledWith(["/PID", "10", "/PID", "11", "/T", "/F"]);
    expect(runElevated).not.toHaveBeenCalled();
  });

  it("can skip the redundant initial probe when PIDs came from a fresh task list", async () => {
    const runNormal = vi.fn(async () => undefined);
    const getRunningPids = vi.fn().mockResolvedValueOnce([]);

    await expect(terminatePids([10], {
      runNormal,
      runElevated: vi.fn(),
      getRunningPids,
      assumeRunning: true
    })).resolves.toEqual({ elevated: false });
    expect(runNormal).toHaveBeenCalledTimes(1);
    expect(getRunningPids).toHaveBeenCalledTimes(1);
  });

  it("requests elevation once when processes remain", async () => {
    const runNormal = vi.fn(async () => { throw new Error("Access is denied"); });
    const runElevated = vi.fn(async () => undefined);
    const getRunningPids = vi.fn().mockResolvedValueOnce([10]).mockResolvedValueOnce([10]).mockResolvedValueOnce([]);

    await expect(terminatePids([10], { runNormal, runElevated, getRunningPids })).resolves.toEqual({ elevated: true });
    expect(runElevated).toHaveBeenCalledTimes(1);
    expect(runElevated).toHaveBeenCalledWith([10]);
  });

  it("treats elevated taskkill failures as success when the follow-up snapshot is clear", async () => {
    const runNormal = vi.fn(async () => { throw new Error("Access is denied"); });
    const runElevated = vi.fn(async () => { throw new Error("taskkill exited with code 128"); });
    const getRunningPids = vi.fn().mockResolvedValueOnce([10]).mockResolvedValueOnce([10]).mockResolvedValueOnce([]);

    await expect(terminatePids([10], { runNormal, runElevated, getRunningPids })).resolves.toEqual({ elevated: true });
    expect(runElevated).toHaveBeenCalledTimes(1);
  });

  it("reports a cancelled UAC prompt", async () => {
    const error = Object.assign(new Error("cancelled"), { code: "ELEVATION_CANCELLED" });
    await expect(terminatePids([10], {
      runNormal: async () => { throw new Error("Access is denied"); },
      runElevated: async () => { throw error; },
      getRunningPids: vi.fn().mockResolvedValueOnce([10]).mockResolvedValueOnce([10])
    })).rejects.toThrow("已取消管理员授权，未能结束应用进程");
  });

  it("fails when a process remains or restarts after elevation", async () => {
    await expect(terminatePids([10], {
      runNormal: async () => undefined,
      runElevated: async () => { throw new Error("taskkill exited with code 128"); },
      getRunningPids: vi.fn().mockResolvedValueOnce([10]).mockResolvedValueOnce([10]).mockResolvedValueOnce([10])
    })).rejects.toThrow("进程仍在运行，可能已被应用服务重新启动");
  });

  it("treats already-exited PIDs as success", async () => {
    const runNormal = vi.fn(async () => undefined);
    await expect(terminatePids([], { runNormal, runElevated: vi.fn(), getRunningPids: vi.fn() })).resolves.toEqual({ elevated: false });
    expect(runNormal).not.toHaveBeenCalled();
  });
});
