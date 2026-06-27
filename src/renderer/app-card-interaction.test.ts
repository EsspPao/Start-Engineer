import { describe, expect, it } from "vitest";
import { resolveAppCardActivation } from "./app-card-interaction";

describe("app card interaction rules", () => {
  it("selects stopped apps on single click and launches them on double click", () => {
    expect(resolveAppCardActivation({ isRunning: false, isLaunching: false }, "single")).toEqual(["select"]);
    expect(resolveAppCardActivation({ isRunning: false, isLaunching: false }, "double")).toEqual(["launch"]);
  });

  it("selects and focuses running apps without launching them", () => {
    expect(resolveAppCardActivation({ isRunning: true, isLaunching: false }, "single")).toEqual(["select", "focus"]);
    expect(resolveAppCardActivation({ isRunning: true, isLaunching: false }, "double")).toEqual(["focus"]);
  });

  it("does not launch apps that are already launching", () => {
    expect(resolveAppCardActivation({ isRunning: false, isLaunching: true }, "single")).toEqual(["select"]);
    expect(resolveAppCardActivation({ isRunning: false, isLaunching: true }, "double")).toEqual(["launching-feedback"]);
  });
});
