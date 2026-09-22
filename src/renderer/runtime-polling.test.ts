import { describe, expect, it } from "vitest";
import { PENDING_ACTION_PROBE_MS, RUNTIME_IDLE_AFTER_MS, runtimePollingPlan } from "./runtime-polling";

describe("runtime polling plan", () => {
  it("uses the normal managed monitoring interval on application pages", () => {
    expect(runtimePollingPlan("games", false, 0)).toEqual({ intervalMs: 1_000 });
  });

  it("keeps visible apps responsive after idle while backing off in settings and the tray", () => {
    expect(runtimePollingPlan("settings", false, 0).intervalMs).toBe(10_000);
    expect(runtimePollingPlan("games", false, RUNTIME_IDLE_AFTER_MS).intervalMs).toBe(1_000);
    expect(runtimePollingPlan("games", true, 0)).toEqual({ intervalMs: 12_000 });
  });

  it("uses the fast probe only while an action is awaiting confirmation", () => {
    expect(PENDING_ACTION_PROBE_MS).toBeGreaterThanOrEqual(1000);
  });
});
