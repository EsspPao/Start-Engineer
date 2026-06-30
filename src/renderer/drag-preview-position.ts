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
