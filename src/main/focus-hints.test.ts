import { describe, expect, it } from "vitest";
import { metricsFromFocusHints } from "./focus-hints";

describe("metricsFromFocusHints", () => {
  it("normalizes duplicate and invalid focus hints", () => {
    expect(metricsFromFocusHints("app-1", {
      pids: [12, 12, -1, 1.5],
      matchedPids: [18],
      associatedPids: [],
      matchedProcessNames: [" game.exe ", "game.exe", ""],
      matchedPaths: [" C:\\Game\\game.exe "]
    })).toMatchObject({
      appId: "app-1",
      isRunning: true,
      pids: [12],
      matchedPids: [18],
      matchedProcessNames: ["game.exe"],
      matchedPaths: ["C:\\Game\\game.exe"],
      lastSeenPath: "C:\\Game\\game.exe"
    });
  });

  it("ignores empty hints", () => {
    expect(metricsFromFocusHints("app-1", undefined)).toBeUndefined();
    expect(metricsFromFocusHints("app-1", {})).toBeUndefined();
  });
});
