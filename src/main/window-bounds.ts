import type { WindowBounds } from "../shared/types.js";

export const defaultWindowSize = { width: 1461, height: 810 };

export function fitWindowBounds(saved: WindowBounds | undefined, area: WindowBounds): WindowBounds {
  const width = Math.min(area.width, Math.max(Math.min(1060, area.width), saved?.width ?? defaultWindowSize.width));
  const height = Math.min(area.height, Math.max(Math.min(680, area.height), saved?.height ?? defaultWindowSize.height));
  return {
    width,
    height,
    x: Math.max(area.x, Math.min(saved?.x ?? area.x + Math.round((area.width - width) / 2), area.x + area.width - width)),
    y: Math.max(area.y, Math.min(saved?.y ?? area.y + Math.round((area.height - height) / 2), area.y + area.height - height))
  };
}
