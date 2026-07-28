import { describe, expect, it, vi } from "vitest";
import { ProcessControlService } from "./process-control-service";

function createService(ownIds: number[] = [10]) {
  return new ProcessControlService({
    ownProcessIds: () => new Set(ownIds),
    runNativeHelper: vi.fn()
  });
}

describe("ProcessControlService", () => {
  it("protects Windows and Start Engineer processes", () => {
    const service = createService([10, 20]);
    expect(service.getTerminationBlockReason("dwm.exe", [30])).toBe("Windows 关键进程受保护");
    expect(service.getTerminationBlockReason("APP.EXE", [20])).toBe("不能结束 Start Engineer 自身进程");
    expect(service.getTerminationBlockReason("app.exe", [30])).toBeUndefined();
  });

  it("uses the native helper fallback for elevated taskkill", async () => {
    const runNativeHelper = vi.fn().mockResolvedValue(JSON.stringify({ ok: true, exitCode: 0 }));
    const service = new ProcessControlService({ ownProcessIds: () => new Set(), runNativeHelper, systemRoot: () => "C:\\Windows" });
    await service.terminateElevatedPids([42]);
    expect(runNativeHelper).toHaveBeenCalledWith("launch", expect.objectContaining({
      executablePath: "C:\\Windows\\System32\\taskkill.exe",
      arguments: ["/PID", "42", "/T", "/F"],
      elevated: true,
      hidden: true
    }), 120_000);
  });

  it("surfaces cancelled elevation with a stable error code", async () => {
    const service = new ProcessControlService({
      ownProcessIds: () => new Set(),
      runNativeHelper: vi.fn().mockResolvedValue(JSON.stringify({ ok: false, errorCode: 1223 }))
    });
    await expect(service.terminateElevatedPids([42])).rejects.toMatchObject({ code: "ELEVATION_CANCELLED" });
  });

  it("uses the constrained session host when available", async () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const terminate = vi.fn().mockResolvedValue(undefined);
    const runNativeHelper = vi.fn();
    const service = new ProcessControlService({
      ownProcessIds: () => new Set(),
      runNativeHelper,
      elevatedTerminationHost: { start, terminate }
    });
    await service.terminateElevatedPids([42, 42, -1]);
    expect(terminate).toHaveBeenCalledWith([42]);
    expect(start).not.toHaveBeenCalled();
    expect(runNativeHelper).not.toHaveBeenCalled();
  });

  it("requests UAC on demand when the session helper is not authorized", async () => {
    const elevationRequired = Object.assign(new Error("authorization required"), { code: "ELEVATION_REQUIRED" });
    const start = vi.fn().mockResolvedValue(undefined);
    const terminate = vi.fn().mockRejectedValueOnce(elevationRequired).mockResolvedValueOnce(undefined);
    const runNativeHelper = vi.fn();
    const service = new ProcessControlService({
      ownProcessIds: () => new Set(),
      runNativeHelper,
      elevatedTerminationHost: { start, terminate }
    });

    await service.terminateElevatedPids([42]);

    expect(start).toHaveBeenCalledTimes(1);
    expect(terminate).toHaveBeenNthCalledWith(1, [42]);
    expect(terminate).toHaveBeenNthCalledWith(2, [42]);
    expect(runNativeHelper).not.toHaveBeenCalled();
  });

  it("surfaces a cancelled on-demand UAC prompt", async () => {
    const elevationRequired = Object.assign(new Error("authorization required"), { code: "ELEVATION_REQUIRED" });
    const cancelled = Object.assign(new Error("cancelled"), { code: "ELEVATION_CANCELLED" });
    const service = new ProcessControlService({
      ownProcessIds: () => new Set(),
      runNativeHelper: vi.fn(),
      elevatedTerminationHost: {
        start: vi.fn().mockRejectedValue(cancelled),
        terminate: vi.fn().mockRejectedValue(elevationRequired)
      }
    });

    await expect(service.terminateElevatedPids([42])).rejects.toMatchObject({ code: "ELEVATION_CANCELLED" });
  });
});
