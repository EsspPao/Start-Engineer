import type { SectionId } from "../shared/types";

export const RUNTIME_IDLE_AFTER_MS = 60_000;
export const PENDING_ACTION_PROBE_MS = 1_000;

export type RuntimePollingPlan = {
  intervalMs: number;
};

export function runtimePollingPlan(section: SectionId, hidden: boolean, idleMs: number): RuntimePollingPlan {
  if (hidden) return { intervalMs: 12_000 };
  if (section === "settings") return { intervalMs: idleMs >= RUNTIME_IDLE_AFTER_MS ? 15_000 : 10_000 };
  return { intervalMs: idleMs >= RUNTIME_IDLE_AFTER_MS ? 6_000 : 3_000 };
}
