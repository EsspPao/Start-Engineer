export type AppCardActivation = "select" | "focus" | "launch" | "launching-feedback";

export function resolveAppCardActivation(state: { isRunning: boolean; isLaunching: boolean }, event: "single" | "double"): AppCardActivation[] {
  if (event === "single") {
    return state.isRunning ? ["select", "focus"] : ["select"];
  }

  if (state.isRunning) return ["focus"];
  if (state.isLaunching) return ["launching-feedback"];
  return ["launch"];
}
