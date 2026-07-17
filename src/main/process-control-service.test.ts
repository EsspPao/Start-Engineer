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

  it("uses the native helper for elevated taskkill", async () => {
    const runNativeHelper = vi.fn().mockResolvedValue(JSON.stringify({ ok: true, exitCode: 0 }));
    const service = new ProcessControlService({ ownProcessIds: () => new Set(), runNativeHelper, systemRoot: () => "C:\\Windows" });
    await service.runElevatedTaskkill(["/PID", "42", "/F"]);
    expect(runNativeHelper).toHaveBeenCalledWith("launch", expect.objectContaining({
      executablePath: "C:\\Windows\\System32\\taskkill.exe",
      arguments: ["/PID", "42", "/F"],
      elevated: true
    }), 120_000);
  });

  it("surfaces cancelled elevation with a stable error code", async () => {
    const service = new ProcessControlService({
      ownProcessIds: () => new Set(),
      runNativeHelper: vi.fn().mockResolvedValue(JSON.stringify({ ok: false, errorCode: 1223 }))
    });
    await expect(service.runElevatedTaskkill(["/PID", "42"])).rejects.toMatchObject({ code: "ELEVATION_CANCELLED" });
  });
});
