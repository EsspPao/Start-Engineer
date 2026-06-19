import { describe, expect, it, vi } from "vitest";
import { getSearchResultOptionSelector, scrollSelectedSearchResultIntoView } from "./search-panel-behavior";

describe("search panel keyboard behavior", () => {
  it("scrolls the selected result into view", () => {
    const scrollIntoView = vi.fn();
    const querySelector = vi.fn(() => ({ scrollIntoView }));
    const root = { querySelector } as unknown as HTMLElement;

    scrollSelectedSearchResultIntoView(root, 12);

    expect(querySelector).toHaveBeenCalledWith(getSearchResultOptionSelector(12));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });
});
