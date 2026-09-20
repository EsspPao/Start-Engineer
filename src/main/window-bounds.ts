import type { WindowBounds } from "../shared/types.js";

export const defaultWindowSize = { width: 1440, height: 800 };

export function windowSizeLimits(area: WindowBounds) {
  const width = Math.floor(area.width * 0.9);
  const height = Math.floor(area.height * 0.9);
  return { width, height, minWidth: Math.min(1060, width), minHeight: Math.min(680, height) };
}

export function fitWindowBounds(saved: WindowBounds | undefined, area: WindowBounds): WindowBounds {
  const limits = windowSizeLimits(area);
  const legacyDefault = (saved?.width === 1461 && saved.height === 810)
    || (saved?.width === 1200 && saved.height === 720);
  const preferred = saved && !legacyDefault && saved.width <= limits.width && saved.height <= limits.height ? saved : undefined;
  const width = Math.min(limits.width, Math.max(limits.minWidth, preferred?.width ?? defaultWindowSize.width));
  const height = Math.min(limits.height, Math.max(limits.minHeight, preferred?.height ?? defaultWindowSize.height));
  return {
    width,
    height,
    x: Math.max(area.x, Math.min(preferred?.x ?? area.x + Math.round((area.width - width) / 2), area.x + area.width - width)),
    y: Math.max(area.y, Math.min(preferred?.y ?? area.y + Math.round((area.height - height) / 2), area.y + area.height - height))
  };
}
