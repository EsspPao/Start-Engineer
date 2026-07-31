import type { AppEntry } from "../shared/types.js";

export const APP_ICON_CACHE_VERSION = 3;
export const APP_ICON_TARGET_SIZE = 128;
export const APP_ICON_MIN_SIZE = 96;

export function isNearlySolidDarkIconBitmap(bitmap: Uint8Array) {
  if (bitmap.length < 16 || bitmap.length % 4 !== 0) return false;
  const pixelCount = bitmap.length / 4;
  let visiblePixels = 0;
  let darkPixels = 0;
  for (let index = 0; index < bitmap.length; index += 4) {
    if (bitmap[index + 3] < 24) continue;
    visiblePixels += 1;
    if (Math.max(bitmap[index], bitmap[index + 1], bitmap[index + 2]) <= 18) darkPixels += 1;
  }
  return visiblePixels >= pixelCount * 0.8 && darkPixels / visiblePixels >= 0.97;
}

export function shouldRefreshAppIcon(entry: AppEntry, cacheUsable: boolean) {
  if (!entry.executablePath && !entry.appUserModelId) return false;
  if (!entry.iconDataUrl || !entry.iconCachePath || !cacheUsable) return true;
  if (entry.iconCacheVersion !== APP_ICON_CACHE_VERSION) return true;
  return (entry.iconPixelSize ?? 0) < APP_ICON_MIN_SIZE;
}
