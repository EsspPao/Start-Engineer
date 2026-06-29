export type StartEngineerGroupShortcutDirection = "previous" | "next";

export type KeyboardInputLike = {
  key: string;
  control?: boolean;
  meta?: boolean;
  alt?: boolean;
};

export function startEngineerGroupShortcutDirection(input: KeyboardInputLike): StartEngineerGroupShortcutDirection | null {
  if (input.alt || input.meta || !input.control) return null;
  const normalized = input.key.toLowerCase();
  if (input.key === "ArrowUp" || normalized === "w") return "previous";
  if (input.key === "ArrowDown" || normalized === "s") return "next";
  return null;
}
