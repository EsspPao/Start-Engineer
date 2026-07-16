import { describe, expect, it } from "vitest";
import { normalizeNativeLaunchResult, normalizeNativeSnapshots } from "./native-helper";

describe("native helper result normalization", () => {
  it("normalizes native launch results without inventing optional values", () => {
    expect(normalizeNativeLaunchResult({ ok: true, pid: 42, errorCode: 0 })).toEqual({ ok: true, pid: 42, errorCode: 0 });
    expect(normalizeNativeLaunchResult({ ok: false, errorCode: 5, detail: "denied" })).toEqual({ ok: false, errorCode: 5, detail: "denied" });
    expect(() => normalizeNativeLaunchResult(null)).toThrow("invalid launch result");
  });

  it("drops invalid process rows and supplies safe counter defaults", () => {
    expect(normalizeNativeSnapshots([
      { pid: 10, parentPid: 2, name: "demo", path: "C:\\Demo\\demo.exe", cpuSeconds: 1.5, memoryBytes: 20, readBytes: 30, writeBytes: 40 },
      { pid: 11, name: "partial" },
      { pid: 0, name: "invalid" },
      null
    ])).toEqual([
      { pid: 10, parentPid: 2, name: "demo", path: "C:\\Demo\\demo.exe", cpuSeconds: 1.5, memoryBytes: 20, readBytes: 30, writeBytes: 40 },
      { pid: 11, parentPid: 0, name: "partial", path: "", cpuSeconds: 0, memoryBytes: 0, readBytes: 0, writeBytes: 0 }
    ]);
  });

  it("rejects non-array process snapshot payloads", () => {
    expect(() => normalizeNativeSnapshots({ pid: 10 })).toThrow("invalid process snapshot");
  });
});
