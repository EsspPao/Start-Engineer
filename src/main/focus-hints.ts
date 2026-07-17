import type { AppMetrics, FocusWindowHints } from "../shared/types.js";

function validNumbers(values: unknown) {
  return Array.isArray(values) ? [...new Set(values.filter((value): value is number => Number.isSafeInteger(value) && value > 0))] : [];
}

function validStrings(values: unknown) {
  return Array.isArray(values) ? [...new Set(values.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))] : [];
}

export function metricsFromFocusHints(appId: string, hints: FocusWindowHints | undefined): AppMetrics | undefined {
  if (!hints || typeof hints !== "object") return undefined;
  const pids = validNumbers(hints.pids);
  const matchedPids = validNumbers(hints.matchedPids);
  const associatedPids = validNumbers(hints.associatedPids);
  const matchedProcessNames = validStrings(hints.matchedProcessNames);
  const matchedPaths = validStrings(hints.matchedPaths);
  if (!pids.length && !matchedPids.length && !associatedPids.length && !matchedProcessNames.length && !matchedPaths.length) return undefined;
  return {
    appId,
    isRunning: Boolean(pids.length || matchedPids.length || associatedPids.length),
    cpuPercent: 0,
    memoryBytes: 0,
    diskBytesPerSecond: 0,
    pids,
    matchedPids,
    associatedPids,
    matchedProcessNames,
    matchedPaths,
    lastSeenPath: matchedPaths[0]
  };
}
