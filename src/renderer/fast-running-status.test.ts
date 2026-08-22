import { describe, expect, it } from "vitest";
import { FAST_RUNNING_STATUS_INTERVAL_MS } from "./fast-running-status";

describe("fast running status polling", () => {
  it("does not create a sub-second tasklist loop", () => {
    expect(FAST_RUNNING_STATUS_INTERVAL_MS).toBeGreaterThanOrEqual(1000);
  });
});
