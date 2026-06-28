import { describe, expect, it } from "vitest";
import { pageFocusSelector, resolveSearchEscapeAction } from "./search-focus";

describe("search focus behavior", () => {
  it("uses two-step Escape while the search input is focused", () => {
    expect(resolveSearchEscapeAction(true, "steam")).toBe("clear-query");
    expect(resolveSearchEscapeAction(true, "")).toBe("blur-search");
    expect(resolveSearchEscapeAction(false, "steam")).toBe("ignore");
  });

  it("resolves the page focus target after leaving search", () => {
    expect(pageFocusSelector("office", "app-1")).toBe('[data-app-card-id="app-1"] .app-card');
    expect(pageFocusSelector("office", "")).toBe(".app-grid");
    expect(pageFocusSelector("processes", "")).toBe(".process-table");
    expect(pageFocusSelector("settings", "")).toBe(".settings-page");
  });
});
