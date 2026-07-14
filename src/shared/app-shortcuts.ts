import type { AppKeyboardShortcutId, KeyboardShortcutPreferences } from "./types.js";
import { normalizeShortcut, shortcutFromKeyboardEvent } from "./global-shortcut.js";

type KeyboardEventLike = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

export function appShortcutFromEvent(event: KeyboardEventLike) {
  return normalizeShortcut(shortcutFromKeyboardEvent(event));
}

export function findAppShortcut(shortcuts: KeyboardShortcutPreferences, event: KeyboardEventLike): AppKeyboardShortcutId | null {
  const pressed = appShortcutFromEvent(event).toLowerCase();
  for (const [id, bindings] of Object.entries(shortcuts) as Array<[AppKeyboardShortcutId, string[]]>) {
    if (bindings.some((binding) => normalizeShortcut(binding).toLowerCase() === pressed)) return id;
  }
  return null;
}

export function findShortcutConflict(shortcuts: KeyboardShortcutPreferences, shortcut: string, except?: AppKeyboardShortcutId) {
  const normalized = normalizeShortcut(shortcut).toLowerCase();
  return (Object.entries(shortcuts) as Array<[AppKeyboardShortcutId, string[]]>).find(([id, bindings]) => id !== except && bindings.some((binding) => normalizeShortcut(binding).toLowerCase() === normalized))?.[0] ?? null;
}

export function isRecordableAppShortcut(shortcut: string) {
  const normalized = normalizeShortcut(shortcut);
  if (!normalized || normalized === "Ctrl" || normalized === "Alt" || normalized === "Shift" || normalized.includes("Meta")) return false;
  return true;
}
