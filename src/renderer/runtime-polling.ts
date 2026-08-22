import type { SectionId, SnapshotMode } from "../shared/types";

export const RUNTIME_IDLE_AFTER_MS = 60_000;
export const PENDING_ACTION_PROBE_MS = 1_000;

export type RuntimePollingPlan = {
  mode: SnapshotMode;
  intervalMs: number;
};

export function runtimePollingPlan(section: SectionId, hidden: boolean, idleMs: number): RuntimePollingPlan {
  if (hidden) return { mode: "managed", intervalMs: 12_000 };
  if (section === "processes") return { mode: "full", intervalMs: idleMs >= RUNTIME_IDLE_AFTER_MS ? 3_000 : 1_500 };
  if (section === "settings") return { mode: "managed", intervalMs: idleMs >= RUNTIME_IDLE_AFTER_MS ? 15_000 : 10_000 };
  return { mode: "managed", intervalMs: idleMs >= RUNTIME_IDLE_AFTER_MS ? 10_000 : 5_000 };
}
