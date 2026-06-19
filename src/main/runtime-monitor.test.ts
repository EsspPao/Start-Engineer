import { describe, expect, it, vi } from "vitest";
import type { AppEntry } from "../shared/types.js";
import { RuntimeMonitor, type ProcessSnapshot } from "./runtime-monitor.js";

const app: AppEntry = {
  id: "app-1", name: "Demo", category: "工具", groupId: "tools",
  executablePath: "C:\\Apps\\demo.exe", processName: "demo", accent: "#fff"
};

const process = (overrides: Partial<ProcessSnapshot> = {}): ProcessSnapshot => ({
  pid: 10, name: "demo", path: "C:\\Apps\\demo.exe", cpuSeconds: 1,
  memoryBytes: 100, readBytes: 10, writeBytes: 20, ...overrides
});

const createMonitor = (collect: () => Promise<ProcessSnapshot[]>, now = () => 1000) => new RuntimeMonitor({
  collect, loadApps: () => [app], resolveIcon: async () => "icon",
  getTerminationBlockReason: () => undefined, processorCount: 2, ttlMs: 800, now
});

describe("RuntimeMonitor", () => {
  it("shares one collection across concurrent requests", async () => {
    let resolve!: (value: ProcessSnapshot[]) => void;
    const collect = vi.fn(() => new Promise<ProcessSnapshot[]>((done) => { resolve = done; }));
    const monitor = createMonitor(collect);
    const first = monitor.getSnapshot("full");
    const second = monitor.getSnapshot("managed");
    resolve([process()]);
    const [full, managed] = await Promise.all([first, second]);
    expect(collect).toHaveBeenCalledTimes(1);
    expect(full.processes).toHaveLength(1);
    expect(managed.processes).toEqual([]);
  });

  it("uses TTL cache unless a refresh is forced", async () => {
    let time = 1000;
    const collect = vi.fn(async () => [process()]);
    const monitor = createMonitor(collect, () => time);
    await monitor.getSnapshot();
    time = 1500;
    await monitor.getSnapshot();
    await monitor.getSnapshot("full", true);
    expect(collect).toHaveBeenCalledTimes(2);
  });

  it("recovers after a failed collection", async () => {
    const collect = vi.fn()
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValueOnce([process()]);
    const monitor = createMonitor(collect);
    await expect(monitor.getSnapshot()).rejects.toThrow("failed");
    await expect(monitor.getSnapshot()).resolves.toMatchObject({ processes: [{ name: "demo.exe" }] });
  });

  it("aggregates process resources and matches managed apps", async () => {
    let time = 1000;
    const collect = vi.fn()
      .mockResolvedValueOnce([process(), process({ pid: 11, memoryBytes: 200 })])
      .mockResolvedValueOnce([
        process({ cpuSeconds: 3, readBytes: 110, writeBytes: 20 }),
        process({ pid: 11, cpuSeconds: 2, memoryBytes: 200, readBytes: 10, writeBytes: 120 })
      ]);
    const monitor = createMonitor(collect, () => time);
    await monitor.getSnapshot("full", true);
    time = 2000;
    const result = await monitor.getSnapshot("full", true);
    expect(result.processes[0]).toMatchObject({ processCount: 2, memoryBytes: 300, isManagedApp: true });
    expect(result.metrics[0]).toMatchObject({ isRunning: true, memoryBytes: 300, pids: [10, 11] });
    expect(result.metrics[0].cpuPercent).toBe(150);
    expect(result.metrics[0].diskBytesPerSecond).toBe(200);
  });

  it("does not match managed apps by persisted process aliases", async () => {
    const collect = vi.fn(async () => [process({ pid: 20, name: "real-client", path: "C:\\Apps\\Client\\real-client.exe" })]);
    const monitor = new RuntimeMonitor({
      collect,
      loadApps: () => [{ ...app, processAliases: ["real-client"] }],
      resolveIcon: async () => "icon",
      getTerminationBlockReason: () => undefined,
      processorCount: 2,
      ttlMs: 800,
      now: () => 1000
    });

    const result = await monitor.getSnapshot("managed", true);

    expect(result.metrics[0]).toMatchObject({ isRunning: false, pids: [] });
  });

  it("matches managed apps by runtime associated PIDs", async () => {
    const collect = vi.fn(async () => [process({ pid: 20, name: "real-client", path: "C:\\Apps\\Client\\real-client.exe" })]);
    const monitor = new RuntimeMonitor({
      collect,
      loadApps: () => [{ ...app, associatedPids: [20] }],
      resolveIcon: async () => "icon",
      getTerminationBlockReason: () => undefined,
      processorCount: 2,
      ttlMs: 800,
      now: () => 1000
    });

    const result = await monitor.getSnapshot("managed", true);

    expect(result.metrics[0]).toMatchObject({ isRunning: true, pids: [20] });
  });

  it("clears samples for PIDs that disappear", async () => {
    const collect = vi.fn().mockResolvedValueOnce([process()]).mockResolvedValueOnce([]);
    const monitor = createMonitor(collect);
    await monitor.getSnapshot("full", true);
    expect(monitor.sampleCount).toBe(1);
    await monitor.getSnapshot("full", true);
    expect(monitor.sampleCount).toBe(0);
  });
});
