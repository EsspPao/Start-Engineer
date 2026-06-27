import { describe, expect, it } from "vitest";
import { shouldStartProcessPrewarm, STARTUP_DEFERRED_IMPORT_MS, STARTUP_DEFERRED_RUNTIME_MS, STARTUP_DEFERRED_SEARCH_DEPENDENCY_MS, STARTUP_PROCESS_PREWARM_MS } from "./startup-schedule";

describe("startup scheduling", () => {
  it("defers non-essential startup work until after first paint", () => {
    expect(STARTUP_DEFERRED_RUNTIME_MS).toBeGreaterThanOrEqual(800);
    expect(STARTUP_DEFERRED_IMPORT_MS).toBeGreaterThan(STARTUP_DEFERRED_RUNTIME_MS);
    expect(STARTUP_DEFERRED_SEARCH_DEPENDENCY_MS).toBeGreaterThan(STARTUP_DEFERRED_RUNTIME_MS);
    expect(STARTUP_PROCESS_PREWARM_MS).toBeGreaterThan(STARTUP_DEFERRED_RUNTIME_MS);
  });

  it("only starts process prewarm while visible and before it has already started", () => {
    expect(shouldStartProcessPrewarm(false, false)).toBe(true);
    expect(shouldStartProcessPrewarm(true, false)).toBe(false);
    expect(shouldStartProcessPrewarm(false, true)).toBe(false);
  });
});
