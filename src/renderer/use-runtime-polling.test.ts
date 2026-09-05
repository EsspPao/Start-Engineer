import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isCurrentRuntimeRequest } from "./use-runtime-polling";

const pollingSource = readFileSync(new URL("./use-runtime-polling.ts", import.meta.url), "utf8");

describe("runtime request generations", () => {
  it("accepts only the latest response in the active generation", () => {
    expect(isCurrentRuntimeRequest({ generation: 2, sequence: 4 }, 2, 4)).toBe(true);
    expect(isCurrentRuntimeRequest({ generation: 2, sequence: 3 }, 2, 4)).toBe(false);
  });

  it("rejects a response started before a section generation change", () => {
    expect(isCurrentRuntimeRequest({ generation: 2, sequence: 4 }, 3, 0)).toBe(false);
  });

  it("refreshes immediately when the Start Engineer window regains focus", () => {
    expect(pollingSource).toContain('window.addEventListener("focus", start)');
    expect(pollingSource).toContain('window.removeEventListener("focus", start)');
  });
});
