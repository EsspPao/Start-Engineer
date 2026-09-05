import { useCallback, useEffect, useRef } from "react";
import type { AppRunningStatus, RuntimeSnapshot, SectionId, StartEngineerApi } from "../shared/types";
import { appActionFailureMessage, exceptionActionFailure } from "./app-action-error";
import { PENDING_ACTION_PROBE_MS, runtimePollingPlan } from "./runtime-polling";

export type RuntimeRequestTicket = {
  generation: number;
  sequence: number;
};

export function isCurrentRuntimeRequest(
  ticket: RuntimeRequestTicket,
  generation: number,
  latestSequence: number,
) {
  return ticket.generation === generation && ticket.sequence === latestSequence;
}

type UseRuntimePollingOptions = {
  client: Pick<StartEngineerApi, "getRuntimeSnapshot" | "getManagedRunningStatus" | "markStartupPerformance">;
  activeSection: SectionId;
  pendingActionCount: number;
  hasPendingActions: () => boolean;
  startupDelayMs: number;
  canApplyResult: () => boolean;
  onSnapshot: (snapshot: RuntimeSnapshot) => void;
  onManagedStatuses: (statuses: AppRunningStatus[]) => void;
  onError: (message: string) => void;
};

export function useRuntimePolling({
  client,
  activeSection,
  pendingActionCount,
  hasPendingActions,
  startupDelayMs,
  canApplyResult,
  onSnapshot,
  onManagedStatuses,
  onError,
}: UseRuntimePollingOptions) {
  const generationRef = useRef(0);
  const latestSequenceRef = useRef(0);
  const startedRef = useRef(false);
  const firstManagedSnapshotMarkedRef = useRef(false);
  const lastInteractionAtRef = useRef(Date.now());
  const callbacksRef = useRef({ canApplyResult, hasPendingActions, onError, onManagedStatuses, onSnapshot });
  callbacksRef.current = { canApplyResult, hasPendingActions, onError, onManagedStatuses, onSnapshot };

  const refreshRuntimeData = useCallback(async (force = false) => {
    const ticket: RuntimeRequestTicket = {
      generation: generationRef.current,
      sequence: ++latestSequenceRef.current,
    };
    try {
      const snapshot = await client.getRuntimeSnapshot("managed", force);
      if (!isCurrentRuntimeRequest(ticket, generationRef.current, latestSequenceRef.current)) return false;
      if (!callbacksRef.current.canApplyResult()) return false;
      callbacksRef.current.onSnapshot(snapshot);
      if (!firstManagedSnapshotMarkedRef.current) {
        firstManagedSnapshotMarkedRef.current = true;
        void client.markStartupPerformance("first-managed-snapshot");
      }
      return true;
    } catch (reason) {
      if (isCurrentRuntimeRequest(ticket, generationRef.current, latestSequenceRef.current)) {
        callbacksRef.current.onError(appActionFailureMessage(exceptionActionFailure("runtime", reason)));
      }
      return false;
    }
  }, [client]);

  useEffect(() => {
    const markInteraction = () => { lastInteractionAtRef.current = Date.now(); };
    window.addEventListener("pointerdown", markInteraction, { passive: true });
    window.addEventListener("keydown", markInteraction);
    return () => {
      window.removeEventListener("pointerdown", markInteraction);
      window.removeEventListener("keydown", markInteraction);
    };
  }, []);

  useEffect(() => {
    generationRef.current += 1;
    latestSequenceRef.current = 0;
    let cancelled = false;
    let timer = 0;
    let startupTimer = 0;
    let running = false;
    const schedule = () => {
      const plan = runtimePollingPlan(activeSection, document.hidden, Date.now() - lastInteractionAtRef.current);
      timer = window.setTimeout(async () => {
        if (!cancelled && !running) {
          running = true;
          await refreshRuntimeData();
          running = false;
        }
        if (!cancelled) schedule();
      }, plan.intervalMs);
    };
    const start = () => {
      window.clearTimeout(timer);
      if (!document.hidden && !running) {
        running = true;
        window.requestAnimationFrame(() => void refreshRuntimeData().finally(() => {
          running = false;
          if (!cancelled) schedule();
        }));
      } else schedule();
    };
    document.addEventListener("visibilitychange", start);
    window.addEventListener("focus", start);
    if (startedRef.current) start();
    else startupTimer = window.setTimeout(() => {
      startedRef.current = true;
      start();
    }, startupDelayMs);
    return () => {
      cancelled = true;
      generationRef.current += 1;
      latestSequenceRef.current = 0;
      window.clearTimeout(timer);
      window.clearTimeout(startupTimer);
      document.removeEventListener("visibilitychange", start);
      window.removeEventListener("focus", start);
    };
  }, [activeSection, refreshRuntimeData, startupDelayMs]);

  useEffect(() => {
    if (pendingActionCount === 0) return;
    const effectGeneration = generationRef.current;
    let cancelled = false;
    let timer = 0;
    let running = false;
    const schedule = () => {
      timer = window.setTimeout(async () => {
        if (!cancelled && !document.hidden && !running && callbacksRef.current.hasPendingActions()) {
          running = true;
          try {
            const statuses = await client.getManagedRunningStatus();
            if (!cancelled && effectGeneration === generationRef.current && callbacksRef.current.canApplyResult()) {
              callbacksRef.current.onManagedStatuses(statuses);
            }
          } catch {
            // The normal managed snapshot remains the source of truth if the fast probe is unavailable.
          } finally {
            running = false;
          }
        }
        if (!cancelled) schedule();
      }, PENDING_ACTION_PROBE_MS);
    };
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection, client, pendingActionCount]);

  return { refreshRuntimeData };
}
