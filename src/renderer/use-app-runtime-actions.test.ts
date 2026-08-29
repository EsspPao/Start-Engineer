import { describe, expect, it } from "vitest";
import { RuntimeActionRegistry } from "./use-app-runtime-actions";

describe("RuntimeActionRegistry", () => {
  it("coalesces repeated actions for the same application", () => {
    const registry = new RuntimeActionRegistry();
    expect(registry.begin(["app-1"], "launch", 10)).not.toBeNull();
    expect(registry.begin(["app-1"], "launch", 11)).toBeNull();
    expect(registry.size).toBe(1);
  });

  it("does not let a stale ticket clear a newer action", () => {
    const registry = new RuntimeActionRegistry();
    const first = registry.begin(["app-1"], "launch", 10)!;
    registry.finish(first);
    const second = registry.begin(["app-1"], "wake", 20)!;
    expect(registry.finish(first)).toBe(false);
    expect(registry.snapshot()["app-1"]?.action).toBe("wake");
    expect(registry.finish(second)).toBe(true);
  });

  it("starts a batch atomically only when every member is idle", () => {
    const registry = new RuntimeActionRegistry();
    registry.begin(["busy"], "close", 10);
    expect(registry.begin(["free", "busy"], "launch", 20)).toBeNull();
    expect(registry.has("free")).toBe(false);
  });
});
