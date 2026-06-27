export const STARTUP_DEFERRED_RUNTIME_MS = 900;
export const STARTUP_DEFERRED_IMPORT_MS = 1200;
export const STARTUP_DEFERRED_SEARCH_DEPENDENCY_MS = 1600;
export const STARTUP_PROCESS_PREWARM_MS = 1800;

export function shouldStartProcessPrewarm(documentHidden: boolean, alreadyStarted: boolean) {
  return !documentHidden && !alreadyStarted;
}
