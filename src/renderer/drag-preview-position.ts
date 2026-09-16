type GroupSortPreviewPositionInput = {
  pointerX: number;
  pointerY: number;
  previewWidth: number;
  previewHeight: number;
  viewportWidth: number;
  viewportHeight: number;
};

const POINTER_OFFSET_X = 24;
const POINTER_OFFSET_Y = 28;
const VIEWPORT_PADDING = 8;

export function groupSortPreviewPosition(input: GroupSortPreviewPositionInput) {
  return {
    left: clamp(input.pointerX - POINTER_OFFSET_X, VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, input.viewportWidth - input.previewWidth - VIEWPORT_PADDING)),
    top: clamp(input.pointerY - POINTER_OFFSET_Y, VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, input.viewportHeight - input.previewHeight - VIEWPORT_PADDING))
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(min, value), max);
}

// Pointer and DOM bounds are viewport pixels; the preview is inside the zoomed shell.
export function appDragPreviewStyle(input: { x: number; y: number; grabOffsetX: number; grabOffsetY: number; width: number; height: number }, target: { right: number; top: number; height: number } | undefined, uiScale: number) {
  const scale = uiScale / 100;
  const left = (input.x - input.grabOffsetX) / scale;
  const top = (input.y - input.grabOffsetY) / scale;
  const width = input.width / scale;
  const height = input.height / scale;
  const shrink = target ? Math.min(36 / width, 36 / height) : 1;
  return {
    left, top, width, height,
    "--group-preview-x": `${target ? target.right / scale - 10 - width * shrink - left : 0}px`,
    "--group-preview-y": `${target ? (target.top + target.height / 2) / scale - height * shrink / 2 - top : 0}px`,
    "--group-preview-scale": shrink
  };
}
