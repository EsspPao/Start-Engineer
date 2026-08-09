import { describe, expect, it, vi } from "vitest";
import type { AppEntry, SnapshotMode } from "../shared/types.js";
import { RuntimeMonitor, type ProcessSnapshot } from "./runtime-monitor.js";

const app: AppEntry = {
  id: "app-1", name: "Demo", category: "工具", groupId: "tools",
  executablePath: "C:\\Apps\\demo.exe", processName: "demo", accent: "#fff"
};

const process = (overrides: Partial<ProcessSnapshot> = {}): ProcessSnapshot => ({
  pid: 10, name: "demo", path: "C:\\Apps\\demo.exe", cpuSeconds: 1,
  memoryBytes: 100, readBytes: 10, writeBytes: 20, ...overrides
});

const createMonitor = (collect: (mode: SnapshotMode) => Promise<ProcessSnapshot[]>, now = () => 1000) => new RuntimeMonitor({
  collect, loadApps: () => [app], resolveIcon: async () => "icon",
  getTerminationBlockReason: () => undefined, processorCount: 2, ttlMs: 800, now
});

describe("RuntimeMonitor", () => {
  it("forwards managed and full modes to the process collector", async () => {
    const collect = vi.fn(async (_mode: SnapshotMode) => [process()]);
    const monitor = createMonitor(collect);
    await monitor.getSnapshot("managed", true);
    await monitor.getSnapshot("full", true);
    expect(collect.mock.calls.map(([mode]) => mode)).toEqual(["managed", "full"]);
  });

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

  it("does not let a concurrent full request reuse a managed-only in-flight snapshot", async () => {
    const resolvers: Array<(value: ProcessSnapshot[]) => void> = [];
    const collect = vi.fn(() => new Promise<ProcessSnapshot[]>((done) => { resolvers.push(done); }));
    const monitor = createMonitor(collect);
    const managed = monitor.getSnapshot("managed", true);
    const full = monitor.getSnapshot("full");

    resolvers[0]([process()]);
    resolvers[1]([process()]);
    const [managedResult, fullResult] = await Promise.all([managed, full]);

    expect(collect).toHaveBeenCalledTimes(2);
    expect(managedResult.processes).toEqual([]);
    expect(fullResult.processes).toHaveLength(1);
  });

  it("lets a concurrent managed request reuse a full in-flight snapshot", async () => {
    let resolve!: (value: ProcessSnapshot[]) => void;
    const collect = vi.fn(() => new Promise<ProcessSnapshot[]>((done) => { resolve = done; }));
    const monitor = createMonitor(collect);
    const full = monitor.getSnapshot("full", true);
    const managed = monitor.getSnapshot("managed");

    resolve([process()]);
    const [fullResult, managedResult] = await Promise.all([full, managed]);

    expect(collect).toHaveBeenCalledTimes(1);
    expect(fullResult.processes).toHaveLength(1);
    expect(managedResult.processes).toEqual([]);
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
    expect(result.metrics[0]).toMatchObject({
      isRunning: true,
      memoryBytes: 300,
      pids: [10, 11],
      matchedPids: [10, 11],
      matchedProcessNames: ["demo"],
      matchedPaths: ["C:\\Apps\\demo.exe"]
    });
    expect(result.metrics[0].cpuPercent).toBe(150);
    expect(result.metrics[0].diskBytesPerSecond).toBe(200);
  });

  it("marks duplicate app entries with the same executable as running together", async () => {
    const officeApp: AppEntry = { ...app, id: "app-office", groupId: "office" };
    const toolsApp: AppEntry = { ...app, id: "app-tools", groupId: "tools" };
    const monitor = new RuntimeMonitor({
      collect: vi.fn(async () => [process({ pid: 30, memoryBytes: 128 })]),
      loadApps: () => [officeApp, toolsApp],
      resolveIcon: async () => "icon",
      getTerminationBlockReason: () => undefined,
      processorCount: 2,
      ttlMs: 800,
      now: () => 1000
    });

    const result = await monitor.getSnapshot("full", true);

    expect(result.metrics).toEqual([
      expect.objectContaining({ appId: "app-office", isRunning: true, pids: [30], matchedPids: [30], matchedPaths: ["C:\\Apps\\demo.exe"], memoryBytes: 128 }),
      expect.objectContaining({ appId: "app-tools", isRunning: true, pids: [30], matchedPids: [30], matchedPaths: ["C:\\Apps\\demo.exe"], memoryBytes: 128 })
    ]);
    expect(result.processes).toHaveLength(1);
    expect(result.processes[0]).toMatchObject({ name: "demo.exe", isManagedApp: true });
  });

  it("marks duplicate app entries with the same process name as running together", async () => {
    const first: AppEntry = { ...app, id: "first", executablePath: "C:\\One\\chrome.exe", processName: "chrome" };
    const second: AppEntry = { ...app, id: "second", executablePath: "C:\\Two\\chrome.exe", processName: "chrome" };
    const monitor = new RuntimeMonitor({
      collect: vi.fn(async () => [process({ pid: 40, name: "chrome", path: "C:\\Users\\ExampleUser\\AppData\\Chrome\\chrome.exe" })]),
      loadApps: () => [first, second],
      resolveIcon: async () => "icon",
      getTerminationBlockReason: () => undefined,
      processorCount: 2,
      ttlMs: 800,
      now: () => 1000
    });

    const result = await monitor.getSnapshot("managed", true);

    expect(result.metrics).toEqual([
      expect.objectContaining({ appId: "first", isRunning: true, pids: [40] }),
      expect.objectContaining({ appId: "second", isRunning: true, pids: [40] })
    ]);
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

    expect(result.metrics[0]).toMatchObject({ isRunning: true, pids: [20], matchedPids: [20], associatedPids: [20], matchedProcessNames: ["real-client"] });
  });

  it("includes descendant process ids as associated pids for faster window focusing", async () => {
    const monitor = new RuntimeMonitor({
      collect: vi.fn(async () => [
        process({ pid: 10, name: "launcher", path: "C:\\Apps\\Demo\\launcher.exe", parentPid: 0 }),
        process({ pid: 11, name: "renderer", path: "C:\\Apps\\Demo\\renderer.exe", parentPid: 10 }),
        process({ pid: 12, name: "gpu", path: "C:\\Apps\\Demo\\gpu.exe", parentPid: 11 })
      ]),
      loadApps: () => [{ ...app, executablePath: "C:\\Apps\\Demo\\launcher.exe", processName: "launcher" }],
      resolveIcon: async () => "icon",
      getTerminationBlockReason: () => undefined,
      processorCount: 2,
      ttlMs: 800,
      now: () => 1000
    });

    const result = await monitor.getSnapshot("managed", true);

    expect(result.metrics[0].matchedPids).toEqual([10]);
    expect(result.metrics[0].associatedPids).toEqual([11, 12]);
  });

  it("does not build full process rows or resolve process icons for managed snapshots", async () => {
    const resolveIcon = vi.fn(async () => "icon");
    const monitor = new RuntimeMonitor({
      collect: vi.fn(async () => [process({ path: "C:\\Other\\helper.exe", name: "helper" })]),
      loadApps: () => [app],
      resolveIcon,
      getTerminationBlockReason: () => undefined,
      processorCount: 2,
      ttlMs: 800,
      now: () => 1000
    });

    const result = await monitor.getSnapshot("managed", true);

    expect(result.processes).toEqual([]);
    expect(resolveIcon).not.toHaveBeenCalled();
  });

  it("does not wait for non-managed process icon resolution before returning full process rows", async () => {
    const resolveIcon = vi.fn(() => new Promise<string>(() => undefined));
    const monitor = new RuntimeMonitor({
      collect: vi.fn(async () => [process({ path: "C:\\Other\\helper.exe", name: "helper" })]),
      loadApps: () => [app],
      resolveIcon,
      getTerminationBlockReason: () => undefined,
      processorCount: 2,
      ttlMs: 800,
      now: () => 1000
    });

    const result = await monitor.getSnapshot("full", true);

    expect(result.processes).toEqual([expect.objectContaining({ name: "helper.exe", iconDataUrl: "" })]);
    expect(resolveIcon).toHaveBeenCalledTimes(1);
  });

  it("does not reuse a managed-only cache for a later full snapshot", async () => {
    let time = 1000;
    const collect = vi.fn(async () => [process()]);
    const monitor = createMonitor(collect, () => time);

    await monitor.getSnapshot("managed", true);
    time = 1100;
    const full = await monitor.getSnapshot("full");

    expect(collect).toHaveBeenCalledTimes(2);
    expect(full.processes).toHaveLength(1);
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
