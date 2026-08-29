import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppEntry, AppMetrics, AppRuntimeAction, AppRuntimeStateMap } from "../shared/types";
import { reconcileAppRuntimeStates, type PendingRuntimeAction, type PendingRuntimeActionMap } from "./app-runtime-state";

export type RuntimeActionTicket = {
  token: number;
  appIds: string[];
};

type RegisteredRuntimeAction = PendingRuntimeAction & { token: number };

export class RuntimeActionRegistry {
  private sequence = 0;
  private readonly actions = new Map<string, RegisteredRuntimeAction>();

  begin(appIds: string[], action: AppRuntimeAction, startedAt = Date.now()): RuntimeActionTicket | null {
    const uniqueIds = [...new Set(appIds)];
    if (!uniqueIds.length || uniqueIds.some((id) => this.actions.has(id))) return null;
    const token = ++this.sequence;
    for (const id of uniqueIds) this.actions.set(id, { action, startedAt, token });
    return { token, appIds: uniqueIds };
  }

  finish(ticket: RuntimeActionTicket) {
    let changed = false;
    for (const id of ticket.appIds) {
      if (this.actions.get(id)?.token !== ticket.token) continue;
      this.actions.delete(id);
      changed = true;
    }
    return changed;
  }

  isCurrent(ticket: RuntimeActionTicket) {
    return ticket.appIds.every((id) => this.actions.get(id)?.token === ticket.token);
  }

  finishIds(appIds: string[]) {
    let changed = false;
    for (const id of appIds) changed = this.actions.delete(id) || changed;
    return changed;
  }

  has(appId: string) {
    return this.actions.has(appId);
  }

  get size() {
    return this.actions.size;
  }

  snapshot(): PendingRuntimeActionMap {
    return Object.fromEntries([...this.actions].map(([id, { action, startedAt }]) => [id, { action, startedAt }]));
  }
}

export function useAppRuntimeActions(apps: AppEntry[], metrics: AppMetrics[]) {
  const registryRef = useRef(new RuntimeActionRegistry());
  const [pendingActions, setPendingActions] = useState<PendingRuntimeActionMap>({});
  const [previousStates, setPreviousStates] = useState<AppRuntimeStateMap>({});
  const sync = useCallback(() => setPendingActions(registryRef.current.snapshot()), []);

  const beginRuntimeAction = useCallback((appIds: string[], action: AppRuntimeAction) => {
    const ticket = registryRef.current.begin(appIds, action);
    if (ticket) sync();
    return ticket;
  }, [sync]);

  const finishRuntimeAction = useCallback((ticket: RuntimeActionTicket) => {
    if (registryRef.current.finish(ticket)) sync();
  }, [sync]);

  const finishRuntimeActions = useCallback((appIds: string[]) => {
    if (registryRef.current.finishIds(appIds)) sync();
  }, [sync]);
  const hasPendingAction = useCallback((appId: string) => registryRef.current.has(appId), []);
  const hasPendingActions = useCallback(() => registryRef.current.size > 0, []);
  const isRuntimeActionCurrent = useCallback((ticket: RuntimeActionTicket) => registryRef.current.isCurrent(ticket), []);

  const runtimeStates = useMemo(
    () => reconcileAppRuntimeStates(apps, metrics, pendingActions, previousStates),
    [apps, metrics, pendingActions, previousStates],
  );

  useEffect(() => {
    setPreviousStates((current) => reconcileAppRuntimeStates(apps, metrics, pendingActions, current));
  }, [apps, metrics, pendingActions]);

  return {
    beginRuntimeAction,
    finishRuntimeAction,
    finishRuntimeActions,
    isRuntimeActionCurrent,
    hasPendingAction,
    hasPendingActions,
    pendingActionCount: Object.keys(pendingActions).length,
    runtimeStates,
  };
}
