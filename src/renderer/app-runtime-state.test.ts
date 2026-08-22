import { describe, expect, it } from "vitest";
import type { AppEntry, AppMetrics, AppRuntimeStateMap } from "../shared/types";
import { folderRuntimeState, reconcileAppRuntimeStates, resolveLifecycleState } from "./app-runtime-state";

const app = (id: string): AppEntry => ({ id, name: id, category: "tool", groupId: "tools", executablePath: `${id}.exe`, processName: id, accent: "#fff" });
const metric = (id: string, running: boolean): AppMetrics => ({ appId: id, isRunning: running, cpuPercent: 0, memoryBytes: 0, diskBytesPerSecond: 0, pids: running ? [9] : [], matchedPids: running ? [9] : [], associatedPids: running ? [10] : [], matchedProcessNames: [], matchedPaths: [] });

describe("unified app runtime state", () => {
  it("keeps runtime detection as the source of truth around actions", () => {
    expect(resolveLifecycleState(false, "launch")).toBe("launching");
    expect(resolveLifecycleState(true, "launch")).toBe("running");
    expect(resolveLifecycleState(true, "close")).toBe("closing");
    expect(resolveLifecycleState(false, "close")).toBe("stopped");
    expect(resolveLifecycleState(false, "wake")).toBe("unknown");
  });

  it("preserves stateSince while the effective state does not change", () => {
    const first = reconcileAppRuntimeStates([app("chat")], [metric("chat", true)], {}, {}, 100);
    const second = reconcileAppRuntimeStates([app("chat")], [metric("chat", true)], {}, first, 200);
    expect(second.chat).toMatchObject({ state: "running", stateSince: 100, matchedPids: [9], associatedPids: [10] });
  });

  it("derives folder progress from member states", () => {
    const states = {
      a: { appId: "a", state: "running", stateSince: 1, matchedPids: [], associatedPids: [] },
      b: { appId: "b", state: "closing", stateSince: 1, matchedPids: [], associatedPids: [] }
    } satisfies AppRuntimeStateMap;
    expect(folderRuntimeState(["a", "b"], states)).toEqual({ isLaunching: false, isClosing: true, runningCount: 2 });
  });
});
