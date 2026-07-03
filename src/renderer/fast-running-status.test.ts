import { describe, expect, it } from "vitest";
import { FAST_RUNNING_STATUS_INTERVAL_MS } from "./fast-running-status";

describe("fast running status polling", () => {
  it("refreshes the lightweight running probe every 0.5 seconds", () => {
    expect(FAST_RUNNING_STATUS_INTERVAL_MS).toBe(500);
  });
});
