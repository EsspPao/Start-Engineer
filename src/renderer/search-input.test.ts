import { describe, expect, it } from "vitest";
import { SEARCH_INPUT_PLACEHOLDER } from "./main";

describe("search input", () => {
  it("uses a short hint for the global search box", () => {
    expect(SEARCH_INPUT_PLACEHOLDER).toBe("搜索");
  });
});
