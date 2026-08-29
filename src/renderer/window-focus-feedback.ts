import type { AppEntry, AppMetrics, FocusAppWindowResult, FocusWindowHints } from "../shared/types";
import { appActionFailureMessage, wakeActionFailure } from "./app-action-error";

export type RuntimeApp = AppEntry & { metrics: AppMetrics };

export function focusHintsForApp(app: RuntimeApp): FocusWindowHints {
  return {
    pids: app.metrics.pids,
    matchedPids: app.metrics.matchedPids,
    associatedPids: app.metrics.associatedPids,
    matchedProcessNames: app.metrics.matchedProcessNames,
    matchedPaths: app.metrics.matchedPaths
  };
}

export function focusResultMessage(result: FocusAppWindowResult) {
  const failure = wakeActionFailure(result);
  return failure ? appActionFailureMessage(failure) : "";
}
