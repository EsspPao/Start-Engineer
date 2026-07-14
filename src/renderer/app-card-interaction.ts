export type AppCardActivation = "select" | "focus" | "launch" | "launching-feedback";
export type AppKeyboardAction = "focus" | "launch" | "launching-feedback" | "context-menu" | "edit";

export function resolveAppCardActivation(state: { isRunning: boolean; isLaunching: boolean }, event: "single" | "double"): AppCardActivation[] {
  if (event === "single") {
    return state.isRunning ? ["select", "focus"] : ["select"];
  }

  if (state.isRunning) return ["focus"];
  if (state.isLaunching) return ["launching-feedback"];
  return ["launch"];
}

export function resolveAppKeyboardAction(state: { isRunning: boolean; isLaunching: boolean; isInvalid: boolean }, key: string, shiftKey = false): AppKeyboardAction | null {
  if (key === "Enter") {
    if (state.isLaunching) return "launching-feedback";
    if (state.isInvalid && !state.isRunning) return "edit";
    return state.isRunning ? "focus" : "launch";
  }
  if (key === "ContextMenu" || (shiftKey && key === "F10")) return "context-menu";
  if (key === "F2") return "edit";
  return null;
}
