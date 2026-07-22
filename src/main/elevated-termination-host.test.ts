import { describe, expect, it } from "vitest";
import { isValidElevatedHello, normalizeTerminationPids } from "./elevated-termination-host.js";

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
});
