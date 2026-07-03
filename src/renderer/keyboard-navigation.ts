export type NavigationDirection = "up" | "down" | "left" | "right";
export type GroupNavigationDirection = "previous" | "next";

export type AppCardRect = {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type KeyboardEventLike = {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
};

export function navigationDirectionFromKey(key: string): NavigationDirection | null {
  const normalized = key.toLowerCase();
  if (key === "ArrowUp" || normalized === "w") return "up";
  if (key === "ArrowDown" || normalized === "s") return "down";
  if (key === "ArrowLeft" || normalized === "a") return "left";
  if (key === "ArrowRight" || normalized === "d") return "right";
  return null;
}

export function groupNavigationFromKey(key: string, controlKey: boolean): GroupNavigationDirection | null {
  if (!controlKey) return null;
  const normalized = key.toLowerCase();
  if (key === "ArrowUp" || normalized === "w") return "previous";
  if (key === "ArrowDown" || normalized === "s") return "next";
  return null;
}

export function groupIndexNavigationFromKey(event: KeyboardEventLike) {
  if (!event.ctrlKey || event.metaKey || event.altKey) return null;
  const key = event.key.length === 1 ? event.key : event.code?.replace("Digit", "");
  if (key === "1") return 0;
  if (key === "2") return 1;
  if (key === "3") return 2;
  return null;
}

export function keyboardBlockKeyFromEventLike(event: KeyboardEventLike) {
  return event.code || event.key.toLowerCase();
}

export function shouldSuppressNavigationAfterGroupMove(blockedKey: string | null, event: KeyboardEventLike) {
  if (!blockedKey || event.ctrlKey || event.metaKey || event.altKey) return false;
  return keyboardBlockKeyFromEventLike(event) === blockedKey;
}

export function isTextInputTarget(target: EventTarget | null) {
  if (!target || typeof target !== "object") return false;
  const candidate = target as { isContentEditable?: boolean; tagName?: string };
  if (candidate.isContentEditable) return true;
  const tag = candidate.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

export function pickDirectionalApp(cards: AppCardRect[], currentId: string, direction: NavigationDirection) {
  const current = cards.find((card) => card.id === currentId) ?? cards[0];
  if (!current) return "";

  const currentCenterX = centerX(current);
  const currentCenterY = centerY(current);
  const candidates = cards.filter((card) => card.id !== current.id).filter((card) => {
    const cardCenterX = centerX(card);
    const cardCenterY = centerY(card);
    if (direction === "left") return cardCenterX < currentCenterX && rangesOverlap(card.top, card.bottom, current.top, current.bottom);
    if (direction === "right") return cardCenterX > currentCenterX && rangesOverlap(card.top, card.bottom, current.top, current.bottom);
    if (direction === "up") return cardCenterY < currentCenterY;
    return cardCenterY > currentCenterY;
  });
  if (!candidates.length) return current.id;

  const scored = candidates.map((card) => {
    const cardCenterX = centerX(card);
    const cardCenterY = centerY(card);
    const primary = direction === "left" || direction === "right"
      ? Math.abs(cardCenterX - currentCenterX)
      : Math.abs(cardCenterY - currentCenterY);
    const secondary = direction === "left" || direction === "right"
      ? Math.abs(cardCenterY - currentCenterY)
      : Math.abs(cardCenterX - currentCenterX);
    return { id: card.id, primary, secondary };
  }).sort((a, b) => a.primary - b.primary || a.secondary - b.secondary);

  return scored[0]?.id ?? current.id;
}

export function pickRelativeGroup(groupIds: string[], currentId: string, direction: GroupNavigationDirection) {
  if (!groupIds.length) return "";
  const index = groupIds.indexOf(currentId);
  if (index < 0) return groupIds[0] ?? "";
  const currentIndex = Math.max(0, index);
  const offset = direction === "previous" ? -1 : 1;
  const nextIndex = Math.min(groupIds.length - 1, Math.max(0, currentIndex + offset));
  return groupIds[nextIndex] ?? groupIds[0] ?? "";
}

export function pickIndexedGroup(groupIds: string[], index: number) {
  return groupIds[index] ?? "";
}

const centerX = (rect: AppCardRect) => rect.left + rect.width / 2;
const centerY = (rect: AppCardRect) => rect.top + rect.height / 2;
const rangesOverlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) => Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
