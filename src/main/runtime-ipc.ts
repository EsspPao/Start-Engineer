import { ipcMain } from "electron";
import type { AppEntry, AppFolder, AppGroup, BatchKillResult, SnapshotMode } from "../shared/types.js";
import type { ProcessSnapshot } from "./runtime-monitor.js";

type RuntimeIpcOptions = {
  loadApps: () => AppEntry[];
  loadFolders: () => AppFolder[];
  loadGroups: () => AppGroup[];
  terminateManagedApps: (apps: AppEntry[]) => Promise<BatchKillResult>;
  getTerminationBlockReason: (name: string, pids: number[]) => string | undefined;
  getProcessSnapshots: (mode?: SnapshotMode) => Promise<ProcessSnapshot[]>;
  terminateProcessPids: (pids: number[]) => Promise<void>;
  metricsSnapshot: () => unknown;
  processSnapshot: () => unknown;
  buildRuntimeSnapshot: (mode: SnapshotMode, force: boolean) => unknown;
  getManagedRunningStatus: () => unknown;
};

export function registerRuntimeIpc(options: RuntimeIpcOptions) {
  ipcMain.handle("apps:kill", async (_event, id: string) => {
    const entry = options.loadApps().find((item) => item.id === id);
    if (!entry) throw new Error("未找到该应用配置");
    const result = await options.terminateManagedApps([entry]);
    const failed = result.results.find((item) => item.status !== "terminated");
    if (failed) throw new Error(failed.message || "应用进程仍在运行，可能已被后台服务重新启动");
    return { apps: result.apps, runningStatuses: result.runningStatuses };
  });
  ipcMain.handle("folders:killApps", async (_event, folderId: string) => {
    const folder = options.loadFolders().find((item) => item.id === folderId);
    if (!folder) throw new Error("合并应用卡片不存在。");
    const memberIds = new Set(folder.appIds);
    return options.terminateManagedApps(options.loadApps().filter((item) => memberIds.has(item.id)));
  });
  ipcMain.handle("groups:killApps", async (_event, groupId: string) => {
    if (!options.loadGroups().some((group) => group.id === groupId)) throw new Error("分组不存在。");
    return options.terminateManagedApps(options.loadApps().filter((item) => item.groupId === groupId));
  });
  ipcMain.handle("apps:killAll", () => options.terminateManagedApps(options.loadApps()));
  ipcMain.handle("processes:killGroup", (_event, input: { name: string; pids: number[] }) => killProcessGroup(input, options));
  ipcMain.handle("metrics:snapshot", () => options.metricsSnapshot());
  ipcMain.handle("processes:snapshot", () => options.processSnapshot());
  ipcMain.handle("runtime:snapshot", (_event, mode: SnapshotMode = "full", force = false) => options.buildRuntimeSnapshot(mode === "managed" ? "managed" : "full", Boolean(force)));
  ipcMain.handle("runtime:managedRunningStatus", () => options.getManagedRunningStatus());
}

async function killProcessGroup(input: { name: string; pids: number[] }, options: RuntimeIpcOptions) {
  const requestedPids = [...new Set(input.pids.filter((pid) => Number.isSafeInteger(pid) && pid > 0))];
  const blockedReason = options.getTerminationBlockReason(input.name, requestedPids);
  if (blockedReason) throw new Error(blockedReason);
  const current = await options.getProcessSnapshots();
  const expectedName = normalizeProcessName(input.name);
  const verifiedPids = requestedPids.filter((pid) => {
    const processInfo = current.find((item) => item.pid === pid);
    return processInfo && normalizeProcessName(processInfo.name) === expectedName;
  });
  if (!verifiedPids.length) throw new Error("进程已经结束或 PID 已发生变化");
  const currentBlockReason = options.getTerminationBlockReason(input.name, verifiedPids);
  if (currentBlockReason) throw new Error(currentBlockReason);
  await options.terminateProcessPids(verifiedPids);
}

function normalizeProcessName(value: string) {
  return value.trim().toLowerCase().replace(/\.exe$/i, "");
}
