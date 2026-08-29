export function primaryPointerButtonReleased(event: Pick<PointerEvent, "buttons">) {
  return (event.buttons & 1) === 0;
}

export function capturePointerForDrag(target: Element, pointerId: number) {
  if (!(target instanceof HTMLElement) || typeof target.setPointerCapture !== "function") return;
  try {
    target.setPointerCapture(pointerId);
  } catch {
    // The pointer may already have ended before React handles pointerdown.
  }
}
