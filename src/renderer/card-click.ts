export function shouldToggleAppSelectionFromClick(clickDetail: number) {
  return clickDetail <= 1;
}

export function createCardClickGuard(options: { doubleClickMs?: number } = {}) {
  const doubleClickMs = options.doubleClickMs ?? 450;
  const lastClickAt = new Map<string, number>();
  const blockedUntil = new Map<string, number>();

  return {
    markClick(appId: string, now: number) {
      lastClickAt.set(appId, now);
    },
    markDoubleClick(appId: string, now: number) {
      blockedUntil.set(appId, now + doubleClickMs);
      lastClickAt.delete(appId);
    },
    shouldCommitSingleClick(appId: string, now: number) {
      const blocked = blockedUntil.get(appId);
      if (blocked !== undefined && now <= blocked) return false;
      return lastClickAt.get(appId) === now;
    },
    clear(appId: string) {
      lastClickAt.delete(appId);
      blockedUntil.delete(appId);
    }
  };
}
