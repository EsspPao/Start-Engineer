import { describe, expect, it } from "vitest";
import { pageFocusSelector, resolveSectionAppFocusTarget, resolveSearchEscapeAction, shouldFocusAddedApp } from "./search-focus";

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

  it("focuses the newly added app after search add succeeds", () => {
    expect(shouldFocusAddedApp({ appId: "app-1", added: true })).toBe(true);
    expect(shouldFocusAddedApp({ appId: "app-1", added: false, alreadyAdded: true })).toBe(true);
    expect(shouldFocusAddedApp({ added: true })).toBe(false);
  });

  it("resolves the focus target after switching to an app section", () => {
    expect(resolveSectionAppFocusTarget("office", ["app-1", "app-2"])).toEqual({
      selectedAppId: "app-1",
      selector: '[data-app-card-id="app-1"] .app-card'
    });
    expect(resolveSectionAppFocusTarget("office", [])).toEqual({
      selectedAppId: "",
      selector: ".app-grid"
    });
  });
});
