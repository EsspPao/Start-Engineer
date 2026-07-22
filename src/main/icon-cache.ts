import type { AppEntry } from "../shared/types.js";

export const APP_ICON_CACHE_VERSION = 3;
export const APP_ICON_TARGET_SIZE = 128;
export const APP_ICON_MIN_SIZE = 96;

export function shouldRefreshAppIcon(entry: AppEntry, cacheUsable: boolean) {
  if (!entry.executablePath) return false;
  if (!entry.iconDataUrl || !entry.iconCachePath || !cacheUsable) return true;
  if (entry.iconCacheVersion !== APP_ICON_CACHE_VERSION) return true;
  return (entry.iconPixelSize ?? 0) < APP_ICON_MIN_SIZE;
}
