export type ProcessTerminationDependencies = {
  runNormal: (args: string[]) => Promise<void>;
  runElevated: (args: string[]) => Promise<void>;
  getRunningPids: (pids: number[]) => Promise<number[]>;
};

export function normalizePids(pids: number[]) {
  return [...new Set(pids.filter((pid) => Number.isSafeInteger(pid) && pid > 0))].sort((a, b) => a - b);
}

export function buildTaskkillArgs(pids: number[]) {
  return [...normalizePids(pids).flatMap((pid) => ["/PID", String(pid)]), "/T", "/F"];
}

export async function terminatePids(pids: number[], dependencies: ProcessTerminationDependencies) {
  const candidates = normalizePids(pids);
  if (!candidates.length) return { elevated: false };

  const running = await dependencies.getRunningPids(candidates);
  if (!running.length) return { elevated: false };

  const args = buildTaskkillArgs(running);
  try { await dependencies.runNormal(args); } catch { /* Verify the actual process state below. */ }

  const remaining = await dependencies.getRunningPids(running);
  if (!remaining.length) return { elevated: false };

  try {
    await dependencies.runElevated(buildTaskkillArgs(remaining));
  } catch (reason) {
    if (reason instanceof Error && "code" in reason && reason.code === "ELEVATION_CANCELLED") {
      throw new Error("已取消管理员授权，未能结束应用进程");
    }
    throw new Error(`管理员结束进程失败：${reason instanceof Error ? reason.message : String(reason)}`);
  }

  const afterElevation = await dependencies.getRunningPids(remaining);
  if (afterElevation.length) throw new Error("进程仍在运行，可能已被应用服务重新启动");
  return { elevated: true };
}
