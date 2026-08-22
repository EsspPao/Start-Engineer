import { describe, expect, it } from "vitest";
import { STARTUP_BACKGROUND_COMPLETE_MS, STARTUP_DEFERRED_IMPORT_MS, STARTUP_DEFERRED_RUNTIME_MS, STARTUP_DEFERRED_SEARCH_DEPENDENCY_MS } from "./startup-schedule";

describe("startup scheduling", () => {
  it("defers non-essential startup work until after first paint", () => {
    expect(STARTUP_DEFERRED_RUNTIME_MS).toBeGreaterThanOrEqual(800);
    expect(STARTUP_DEFERRED_IMPORT_MS).toBeGreaterThan(STARTUP_DEFERRED_RUNTIME_MS);
    expect(STARTUP_DEFERRED_SEARCH_DEPENDENCY_MS).toBeGreaterThan(STARTUP_DEFERRED_RUNTIME_MS);
    expect(STARTUP_BACKGROUND_COMPLETE_MS).toBeGreaterThan(STARTUP_DEFERRED_RUNTIME_MS);
  });
});
