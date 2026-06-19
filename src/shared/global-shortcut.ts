const modifierAliases = new Map([
  ["ctrl", "Ctrl"],
  ["control", "Ctrl"],
  ["alt", "Alt"],
  ["shift", "Shift"],
  ["meta", "Meta"],
  ["super", "Meta"],
  ["win", "Meta"],
  ["windows", "Meta"]
]);

const modifierOrder = ["Ctrl", "Alt", "Shift", "Meta"];

type KeyboardEventLike = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

function normalizeKey(key: string) {
  const lower = key.trim().toLowerCase();
  if (lower === " " || lower === "space" || lower === "spacebar") return "Space";
  if (lower === "escape" || lower === "esc") return "Esc";
  if (lower === "arrowup") return "Up";
  if (lower === "arrowdown") return "Down";
  if (lower === "arrowleft") return "Left";
  if (lower === "arrowright") return "Right";
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lower)) return lower.toUpperCase();
  if (/^[a-z0-9]$/.test(lower)) return lower.toUpperCase();
  return key.length === 1 ? key.toUpperCase() : key;
}

export function normalizeShortcut(shortcut: string) {
  const modifiers = new Set<string>();
  let key = "";
  for (const rawPart of shortcut.split("+")) {
    const part = rawPart.trim();
    if (!part) continue;
    const modifier = modifierAliases.get(part.toLowerCase());
    if (modifier) modifiers.add(modifier);
    else key = normalizeKey(part);
  }
  return [...modifierOrder.filter((modifier) => modifiers.has(modifier)), ...(key ? [key] : [])].join("+");
}

export function validateShortcut(shortcut: string): { valid: true; accelerator: string } | { valid: false; message: string } {
  const accelerator = normalizeShortcut(shortcut);
  const parts = accelerator.split("+").filter(Boolean);
  if (parts.includes("Meta")) return { valid: false, message: "暂不支持 Windows 键" };
  const key = parts.find((part) => !modifierOrder.includes(part));
  if (!key) return { valid: false, message: "请选择一个非修饰键" };
  if (!parts.some((part) => part === "Ctrl" || part === "Alt" || part === "Shift")) {
    return { valid: false, message: "快捷键必须包含 Ctrl、Alt 或 Shift" };
  }
  return { valid: true, accelerator };
}

export function shortcutFromKeyboardEvent(event: KeyboardEventLike) {
  const modifiers = [event.ctrlKey ? "Ctrl" : "", event.altKey ? "Alt" : "", event.shiftKey ? "Shift" : "", event.metaKey ? "Meta" : ""].filter(Boolean);
  const modifierKeys = new Set(["Control", "Alt", "Shift", "Meta"]);
  if (modifierKeys.has(event.key)) return modifiers.join("+");
  const key = event.code === "Space" ? "Space" : normalizeKey(event.key);
  return [...modifiers, key].join("+");
}
